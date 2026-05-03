---
name: wdf-umdf
description: |
  User-Mode Driver Framework v2 (UMDF). User-mode driver model that uses the same WDF
  object model as KMDF but runs in a host process (WUDFHost.exe) protected by the
  reflector. Required for some categories (Indirect Display Drivers, many sensor and
  camera drivers) and recommended for any driver that doesn't strictly need kernel mode.

  USE WHEN: user mentions "UMDF", "WUDFHost", "user-mode driver", "reflector",
  "IDD", "ISensor", "WDFHOST", "UMDF v2", "FX2"

  DO NOT USE FOR: KMDF (use `wdf-kmdf`), classic UMDF v1 (deprecated, COM-based)
allowed-tools: Read, Grep, Glob, Write, Edit
---
# UMDF v2 - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `wdf-umdf`. Authoritative source: `learn.microsoft.com/en-us/windows-hardware/drivers/wdf/getting-started-with-umdf-version-2`.

## When UMDF is the right answer

- **Driver runs in `WUDFHost.exe`**, a user-mode service host. No bugchecks if it crashes — reflector restarts it.
- **Same WDF object model and APIs as KMDF** (`WdfDriverCreate`, `WdfDeviceCreate`, `WdfRequest*`). Differences are mostly which APIs are available, not how to call them.
- Required model for: **Indirect Display Drivers (IDD)**, many HID over Bluetooth scenarios, sensor drivers, camera drivers (MFT/AVStream is a separate path).
- Recommended for: anything where the device protocol is reachable from user mode (USB, Bluetooth, network, mostly-software devices) and you don't need to be in the IRP path of a kernel-only stack.

## DriverEntry equivalent

UMDF drivers expose the same `DriverEntry` symbol; the host loads the DLL and calls it:

```c
NTSTATUS DriverEntry(PDRIVER_OBJECT DriverObject, PUNICODE_STRING RegistryPath) {
    WDF_DRIVER_CONFIG config;
    WDF_DRIVER_CONFIG_INIT(&config, MyEvtDeviceAdd);
    return WdfDriverCreate(DriverObject, RegistryPath,
                           WDF_NO_OBJECT_ATTRIBUTES, &config, WDF_NO_HANDLE);
}
```

## What's different from KMDF

| Concern | KMDF | UMDF |
|---------|------|------|
| Process | `System` (`ntoskrnl.exe`) | `WUDFHost.exe` (user mode) |
| Crash impact | Bugcheck | Host restart, device disappears briefly |
| C++ usage | Discouraged (no exceptions/RTTI) | **Full C++ allowed** (use the `cpp` skill freely) |
| Direct hardware access | MMIO, port I/O, DMA | Through reflector / a kernel companion driver if needed |
| Synchronous kernel APIs | Available | Not available — use Win32 / WDF user-mode equivalents |
| IRQL | Real IRQL discipline | Always at PASSIVE-equivalent (no DISPATCH worries) |
| Pool | `ExAllocatePool2` | `new` / `malloc` / `HeapAlloc` |
| Tracing | WPP | WPP **or** standard ETW providers |

> **Practical consequence**: UMDF is almost C++17/20 application code with WDF idioms wrapped around it. Memory bugs are caught by ASan-style tooling at user-mode dev time; kernel pitfalls disappear.

## INF entries (UMDF v2)

```inf
[Manufacturer]
%MfgName% = Standard,NT$ARCH$.10.0...19041

[Standard.NT$ARCH$.10.0...19041]
%Device.DeviceDesc% = MyDevice_Install, ROOT\MyDevice

[MyDevice_Install.NT]
CopyFiles = MyDevice.CopyFiles
AddReg    = MyDevice.AddReg

[MyDevice_Install.NT.Services]
AddService = WUDFRd, 0x000001fa, WUDFRD_ServiceInstall

[WUDFRD_ServiceInstall]
DisplayName  = "WUDF Reflector"
ServiceType  = 1
StartType    = 3
ErrorControl = 1
ServiceBinary= %12%\WUDFRd.sys
LoadOrderGroup = Base

[MyDevice_Install.NT.Wdf]
UmdfDispatcher       = NativeUSB        ; or NativeIDD, NativeHID, etc.
UmdfServiceOrder     = MyUmdfDriver
UmdfKernelModeClientPolicy = AllowKernelModeClients

[MyUmdfDriver]
UmdfLibraryVersion = $UMDFVERSION$
DriverCLSID        = {01234567-89AB-CDEF-0123-456789ABCDEF}
ServiceBinary      = %13%\MyDevice.dll
```

## Reflector — what it actually does

`WUDFRd.sys` (the Reflector) sits in the kernel as the proxy for the user-mode driver. It:
- Receives the kernel IRPs
- Marshals them across the user/kernel boundary into WDF requests delivered to your DLL
- Marshals your completions back into IRPs
- Restarts the host if your DLL crashes

You don't write reflector code; you write DLL code and the framework + reflector deliver requests to it.

## Companion kernel driver (when UMDF can't reach what you need)

UMDF cannot call arbitrary kernel APIs. Patterns:
1. **Inbox kernel client** (e.g. WinUSB, HIDClass, WUDFRd) handles the kernel side
2. **Custom companion KMDF driver** + a private inverted-call IOCTL channel — your UMDF driver opens it and sends commands

## Project structure (UMDF DLL + INF + driver package)

```
DriverSolution/
├── MyUmdfDriver/                     (.vcxproj — UMDF v2)
│   ├── Driver.cpp                    DriverEntry, EvtDeviceAdd
│   ├── Device.cpp                    Device-level WDF callbacks
│   ├── Queue.cpp                     IOCTL / Read / Write handlers
│   ├── MyUmdfDriver.def              Exports
│   └── MyUmdfDriver.inf
├── MyUmdfDriverPackage/              Driver package (.cab + signing)
└── MyUmdfDriverTests/                User-mode test app (Win32 console / GTest)
```

## Debugging UMDF

- Attach a normal **user-mode debugger (WinDbg / Visual Studio)** to `WUDFHost.exe` — much friendlier than KMDF
- Set `HKLM\System\CurrentControlSet\Services\WUDFHost\Parameters\HostProcessDbgBreakOnStart=1` to break before driver load
- Use `Application Verifier` for memory/handle bugs (much like Driver Verifier for KMDF)
- ETW + WPP traces work the same as KMDF

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Treating UMDF callbacks as background work | They serialize requests | Hand off long work to a separate worker thread; complete the request when done |
| Calling kernel-only APIs | Won't link | Use Win32 / WDF user-mode equivalents |
| Holding a request indefinitely with no cancel handler | App hangs | Mark cancelable, handle `EvtRequestCancel` |
| Using process global state | Multiple device instances share the host | Per-device context via WDF_OBJECT_ATTRIBUTES |
| Logging via `OutputDebugString` only | Lost in production | WPP/ETW with a published GUID |
| Assuming the host stays up | Reflector can recycle it | Persist nothing in process memory; reload from registry/file on `EvtDevicePrepareHardware` |
