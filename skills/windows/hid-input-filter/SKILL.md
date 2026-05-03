---
name: hid-input-filter
description: |
  Windows Human Interface Device (HID) stack and filter drivers. Covers HID class
  architecture, transport drivers (HIDUSB / HIDBTH / HIDI2C), HIDClass, mouse/keyboard
  filter (Mouclass / Kbdclass) drivers, internal IOCTLs (IOCTL_HID_*), filter placement
  (upper/lower), event interception, injection, and the Virtual HID Framework (VHF).

  USE WHEN: user mentions "HID", "HID filter", "mouse filter", "keyboard filter",
  "touch filter", "pen filter", "HIDClass", "mouclass", "kbdclass", "moufiltr",
  "kbfiltr", "IOCTL_HID_READ_REPORT", "IOCTL_HID_GET_FEATURE", "VHF",
  "Vhf.sys", "input intercept", "input injection"

  DO NOT USE FOR: GPU input redirection (different stack), DirectInput/XInput
  (user-mode game APIs)
allowed-tools: Read, Grep, Glob, Write, Edit
---
# HID Stack & Filter Drivers - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `hid-input-filter`. Authoritative source: `learn.microsoft.com/en-us/windows-hardware/drivers/hid/`.

## The HID stack (top to bottom)

```
   Application (RIM, RawInput, GetMessage WM_INPUT, DirectInput, XInput)
              |
         User mode
   ───────────────────────────────────────────────────────────
         Kernel mode
              |
   Mouclass.sys / Kbdclass.sys / Hidclass.sys filter clients
              |
   ┌──────────────────────────┐
   │ Upper filter(s)          │   <- intercept here for class-wide effect
   │ HIDClass.sys             │
   │ Lower filter(s)          │   <- intercept here for transport-specific effect
   │ Hidusb / Hidbth / Hidi2c │   <- transport (mini)driver
   │ USB / Bluetooth / I2C    │
   └──────────────────────────┘
```

For **mouse and keyboard**, inputs flow as:
1. Transport driver (e.g. Hidusb) reads reports from the device
2. HIDClass parses them per the device's HID Report Descriptor
3. Mouclass / Kbdclass receives them and turns them into mouse/keyboard inputs
4. RawInput dispatches to user-mode windows

## Filter driver placement

| Where to filter | Effect |
|-----------------|--------|
| **Upper filter on `HID` class** (above `HIDClass.sys`) | See *parsed HID reports* for **all** HID devices in that instance — clean, structured data |
| **Lower filter on `HID` class** | See raw transport interactions before HIDClass parses |
| **Upper filter on `Mouse` class** (above `Mouclass.sys`) | See mouse-specific events (movement deltas, button bitmasks) for that mouse |
| **Upper filter on `Keyboard` class** (above `Kbdclass.sys`) | See keyboard scan codes for that keyboard |

Decision rule: **filter as high as you can while still seeing the data you need**. For "intercept mouse + touchscreen events and route to specific apps", an **upper HID class filter** sees everything (mouse, touch, pen) in one place.

## Upper HID class filter — DriverEntry skeleton

```c
NTSTATUS DriverEntry(PDRIVER_OBJECT DriverObject, PUNICODE_STRING RegistryPath) {
    WDF_DRIVER_CONFIG config;
    WDF_DRIVER_CONFIG_INIT(&config, MyHidFilterEvtDeviceAdd);
    return WdfDriverCreate(DriverObject, RegistryPath,
                           WDF_NO_OBJECT_ATTRIBUTES, &config, WDF_NO_HANDLE);
}

NTSTATUS MyHidFilterEvtDeviceAdd(WDFDRIVER Driver, PWDFDEVICE_INIT DeviceInit) {
    UNREFERENCED_PARAMETER(Driver);

    WdfFdoInitSetFilter(DeviceInit);
    WDFDEVICE device;
    NTSTATUS status = WdfDeviceCreate(&DeviceInit, WDF_NO_OBJECT_ATTRIBUTES, &device);
    if (!NT_SUCCESS(status)) return status;

    // HID uses *internal* IOCTLs between class drivers — not regular IOCTLs.
    WDF_IO_QUEUE_CONFIG q;
    WDF_IO_QUEUE_CONFIG_INIT_DEFAULT_QUEUE(&q, WdfIoQueueDispatchParallel);
    q.EvtIoInternalDeviceControl = MyHidFilterEvtIoInternalDeviceControl;
    return WdfIoQueueCreate(device, &q, WDF_NO_OBJECT_ATTRIBUTES, NULL);
}
```

## Internal IOCTLs you care about

Defined in `<hidclass.h>` / `<hidport.h>`:

| IOCTL | Direction | Purpose |
|-------|-----------|---------|
| `IOCTL_HID_GET_DEVICE_DESCRIPTOR` | down → up | Gets the HID descriptor |
| `IOCTL_HID_GET_REPORT_DESCRIPTOR` | down → up | Gets the *Report Descriptor* (the structure of every report) |
| `IOCTL_HID_GET_DEVICE_ATTRIBUTES` | down → up | VID/PID/version |
| `IOCTL_HID_READ_REPORT` | up → down → up | **Input reports** — this is the request that streams events |
| `IOCTL_HID_WRITE_REPORT` | up → down | Output reports (e.g. LEDs) |
| `IOCTL_HID_GET_FEATURE` / `IOCTL_HID_SET_FEATURE` | up ↔ down | Feature reports (configuration) |

For a filter, the most common pattern is to forward most IOCTLs untouched and intercept `IOCTL_HID_READ_REPORT` completions to inspect/modify the report.

## Intercept pattern: send-and-forget vs. completion routine

```c
// Forward + completion routine (modify on the way back up)
VOID MyHidFilterEvtIoInternalDeviceControl(
    WDFQUEUE Queue, WDFREQUEST Request,
    size_t OutputBufferLength, size_t InputBufferLength,
    ULONG IoControlCode)
{
    WDFDEVICE device = WdfIoQueueGetDevice(Queue);
    WDFIOTARGET target = WdfDeviceGetIoTarget(device);

    if (IoControlCode == IOCTL_HID_READ_REPORT) {
        // Hand it off and inspect the result on completion
        WdfRequestFormatRequestUsingCurrentType(Request);
        WdfRequestSetCompletionRoutine(Request, MyReadReportCompleted, device);
        if (!WdfRequestSend(Request, target, WDF_NO_SEND_OPTIONS)) {
            WdfRequestComplete(Request, WdfRequestGetStatus(Request));
        }
        return;
    }

    // Default: forward without monitoring
    WDF_REQUEST_SEND_OPTIONS opts;
    WDF_REQUEST_SEND_OPTIONS_INIT(&opts, WDF_REQUEST_SEND_OPTION_SEND_AND_FORGET);
    if (!WdfRequestSend(Request, target, &opts)) {
        WdfRequestComplete(Request, WdfRequestGetStatus(Request));
    }
}

VOID MyReadReportCompleted(WDFREQUEST Request, WDFIOTARGET Target,
                           PWDF_REQUEST_COMPLETION_PARAMS Params, WDFCONTEXT Context)
{
    // Params->Parameters.Ioctl.Output.Buffer points at the HID report
    // - Inspect it
    // - Optionally rewrite/zero it (suppress event from system)
    // - Optionally route a copy to user-mode (inverted call / shared memory)
    WdfRequestComplete(Request, Params->IoStatus.Status);
}
```

## Suppressing events from the OS

To make events "invisible" to the rest of the system:

1. **Filter as low as possible** in the path your target subscriber owns (so your subscriber gets it but the upper class drivers don't).
2. On the read-report completion, **fail or zero the report** before completing it upward. Class drivers above will see "no input".
3. Provide an alternative path to your **target user-mode application** — typical patterns:
   - **Inverted call**: app sends a long-lived IOCTL with an output buffer; driver completes it whenever an event arrives.
   - **Shared memory ring buffer**: driver writes events into a section mapped into the target process; app polls / waits on an event.

> Be very careful with security: hiding events from the OS while exposing them to one app is a sensitive design. Document the threat model and limit the filter to specific devices via INF (HardwareId / CompatibleId). Don't catch arbitrary HID devices.

## Injection (the reverse direction)

To synthesize input events:
- **User-mode**: `SendInput` (mouse/keyboard) — works for most cases, no driver needed
- **Kernel injection**: VHF (Virtual HID Framework, `Vhf.sys`) lets you create a virtual HID source and submit reports as if they came from a real device. The system sees them like any other HID device's reports.

VHF skeleton:
```c
VHF_CONFIG cfg;
VHF_CONFIG_INIT(&cfg, WdfDeviceWdmGetDeviceObject(device),
                sizeof(MyReportDescriptor), MyReportDescriptor);
cfg.OperationContextSize = sizeof(MY_OP_CTX);
NTSTATUS s = VhfCreate(&cfg, &g_VhfHandle);
s = VhfStart(g_VhfHandle);

// Later, to deliver an input report
HID_XFER_PACKET packet = { .reportBuffer = buf, .reportBufferLen = sizeof(buf), .reportId = 1 };
VhfReadReportSubmit(g_VhfHandle, &packet);
```

## INF — installing as upper class filter

```inf
[ClassInstall32]
AddReg = MyHidFilter.AddReg

[MyHidFilter.AddReg]
HKR,,UpperFilters,0x00010000,"MyHidFilter"

[Manufacturer]
%MfgName% = Standard,NT$ARCH$.10.0...19041

[Standard.NT$ARCH$.10.0...19041]
%Filter.DeviceDesc% = MyHidFilter_Inst, {745A17A0-74D3-11D0-B6FE-00A0C90F57DA}  ; HIDClass GUID
```

For a **per-device** filter, add `UpperFilters` to the device's hardware key via the device's INF — narrower scope, easier to reason about.

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Class-wide filter when one device is the target | Affects every keyboard/mouse on the box | Per-device filter via the device's INF + HardwareId |
| Modifying the report buffer at DISPATCH_LEVEL with paged work | Bugcheck | Dispatch parsing/forwarding to PASSIVE workitem |
| Forgetting to complete or pass through unhandled IOCTLs | Stack hangs, devices disappear | Default branch always forwards or completes |
| Hard-coded report layouts | Devices vary; descriptors change between firmware revs | Parse the **Report Descriptor** at attach time |
| Polling for input from user mode | Wastes battery, adds latency | Inverted-call IOCTL or shared event |
| Catching `SendInput` events | They go in via Mouclass, not via HID — different path | Filter on Mouclass/Kbdclass for user-injected input too |
