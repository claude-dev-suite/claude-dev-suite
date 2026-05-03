---
name: wdf-kmdf
description: |
  Kernel-Mode Driver Framework (KMDF), the Microsoft-recommended way to write Windows
  kernel-mode drivers. Covers DriverEntry, EvtDeviceAdd, IRPs and IOCTLs, I/O queues,
  PnP and Power state machines, IRQL discipline, memory pools, WPP tracing, SAL
  annotations, and Driver Verifier.

  USE WHEN: user mentions "KMDF", "WDF kernel", "Windows kernel driver", "DriverEntry",
  "WdfDriverCreate", "EvtDeviceAdd", "IRP", "IOCTL", "DISPATCH_LEVEL", "PASSIVE_LEVEL",
  "NTSTATUS", "PoolTag", "WdfRequestComplete"

  DO NOT USE FOR: UMDF v2 (use `wdf-umdf`), classic WDM-only drivers, file-system
  filters (FltMgr is a separate framework)
allowed-tools: Read, Grep, Glob, Write, Edit
---
# KMDF - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `wdf-kmdf`. Authoritative source: `learn.microsoft.com/en-us/windows-hardware/drivers/wdf/`.

## Driver entry + device add

```c
NTSTATUS DriverEntry(_In_ PDRIVER_OBJECT DriverObject,
                     _In_ PUNICODE_STRING RegistryPath) {
    WDF_DRIVER_CONFIG config;
    WDF_DRIVER_CONFIG_INIT(&config, MyEvtDeviceAdd);
    config.DriverPoolTag = 'rvDM';
    return WdfDriverCreate(DriverObject, RegistryPath,
                           WDF_NO_OBJECT_ATTRIBUTES, &config, WDF_NO_HANDLE);
}

NTSTATUS MyEvtDeviceAdd(_In_ WDFDRIVER Driver, _Inout_ PWDFDEVICE_INIT DeviceInit) {
    UNREFERENCED_PARAMETER(Driver);

    // Filter? Function? FDO/PDO?
    // WdfFdoInitSetFilter(DeviceInit);   // <-- uncomment for filter
    WDFDEVICE device;
    NTSTATUS status = WdfDeviceCreate(&DeviceInit, WDF_NO_OBJECT_ATTRIBUTES, &device);
    if (!NT_SUCCESS(status)) return status;

    WDF_IO_QUEUE_CONFIG q;
    WDF_IO_QUEUE_CONFIG_INIT_DEFAULT_QUEUE(&q, WdfIoQueueDispatchParallel);
    q.EvtIoDeviceControl  = MyEvtIoDeviceControl;
    q.EvtIoRead           = MyEvtIoRead;
    q.EvtIoWrite          = MyEvtIoWrite;
    return WdfIoQueueCreate(device, &q, WDF_NO_OBJECT_ATTRIBUTES, NULL);
}
```

## I/O queues — dispatch types

| Type | Behavior |
|------|----------|
| `WdfIoQueueDispatchSequential` | One request at a time |
| `WdfIoQueueDispatchParallel` | Many concurrent requests (your callbacks must be reentrant) |
| `WdfIoQueueDispatchManual` | You retrieve requests with `WdfIoQueueRetrieveNextRequest` |

Use **manual** queues for forwarding patterns (filter holds requests, completes them later when the underlying device responds).

## IRQL Cheat Sheet

| IRQL | Allowed | Forbidden |
|------|---------|-----------|
| `PASSIVE_LEVEL` (0) | Anything: paging OK, blocking OK | — |
| `APC_LEVEL` (1) | Most things; APCs disabled | — |
| `DISPATCH_LEVEL` (2) | Spinlocks, nonpaged pool, DPCs | Page faults, blocking, paged pool, `KeWaitForSingleObject` (with timeout > 0) |
| `DIRQL` / `HIGH_LEVEL` | ISR work only | Almost everything else |

**Annotate every function** so SDV / CodeQL can verify:
```c
_IRQL_requires_max_(DISPATCH_LEVEL)
_Must_inspect_result_
NTSTATUS Helper(_In_ WDFDEVICE dev);
```

## Memory allocation

```c
// Modern (preferred)
PVOID p = ExAllocatePool2(POOL_FLAG_NON_PAGED, size, 'rvDM');
if (!p) return STATUS_INSUFFICIENT_RESOURCES;
// ... use ...
ExFreePoolWithTag(p, 'rvDM');

// Pool flags
// POOL_FLAG_NON_PAGED              - safe at DISPATCH_LEVEL
// POOL_FLAG_PAGED                  - PASSIVE_LEVEL only
// POOL_FLAG_NON_PAGED_EXECUTE      - rarely needed; HVCI-hostile
// POOL_FLAG_UNINITIALIZED          - skip zero-fill (perf, only if you fill it)
```

> **Never use `ExAllocatePool` / `ExAllocatePoolWithTag`** — flagged as deprecated/insecure since WDK 22000.

## IOCTL handling

```c
// Public.h (shared with usermode)
#define IOCTL_MYDRV_DO_THING \
    CTL_CODE(FILE_DEVICE_UNKNOWN, 0x800, METHOD_BUFFERED, FILE_ANY_ACCESS)

// Driver
VOID MyEvtIoDeviceControl(_In_ WDFQUEUE Queue, _In_ WDFREQUEST Request,
                          _In_ size_t OutputBufferLength, _In_ size_t InputBufferLength,
                          _In_ ULONG IoControlCode) {
    UNREFERENCED_PARAMETER(Queue);
    NTSTATUS status; size_t bytes = 0;

    switch (IoControlCode) {
    case IOCTL_MYDRV_DO_THING: {
        PMY_INPUT in; PMY_OUTPUT out;
        status = WdfRequestRetrieveInputBuffer(Request, sizeof(*in),  (PVOID*)&in,  NULL);
        if (!NT_SUCCESS(status)) break;
        status = WdfRequestRetrieveOutputBuffer(Request, sizeof(*out),(PVOID*)&out, NULL);
        if (!NT_SUCCESS(status)) break;
        out->Result = in->Value * 2;
        bytes = sizeof(*out);
    } break;
    default:
        status = STATUS_INVALID_DEVICE_REQUEST; break;
    }
    WdfRequestCompleteWithInformation(Request, status, bytes);
}
```

**Buffer methods**: `METHOD_BUFFERED` (kernel-allocated copy — safest), `METHOD_IN_DIRECT` / `METHOD_OUT_DIRECT` (MDL — for big buffers), `METHOD_NEITHER` (raw user pointer — dangerous, requires `ProbeForRead`/`ProbeForWrite` in a `try/except`).

## WPP tracing

```c
// Trace.h
#define WPP_CONTROL_GUIDS \
    WPP_DEFINE_CONTROL_GUID(MyDriverCtl, (00000000,1111,2222,3333,444444444444), \
        WPP_DEFINE_BIT(TRACE_DRIVER) WPP_DEFINE_BIT(TRACE_DEVICE))

// Driver.c — on top of file (after includes)
#include "Driver.h"
#include "Driver.tmh"               // generated by WPP preprocessor

// Use
TraceEvents(TRACE_LEVEL_INFORMATION, TRACE_DRIVER, "DriverEntry: status=%!STATUS!", status);
```

Decode at runtime: `tracelog.exe -start mytrace -guid GuidFile -f .\trace.etl -flag 0xFF -level 5`. Decode the `.etl` with `tracerpt` or `traceview.exe` against the driver `.pdb`.

## Object lifetime + cleanup

Every WDF object has a parent. Destroying a parent destroys children. Wire cleanup explicitly when needed:

```c
WDF_OBJECT_ATTRIBUTES attrs;
WDF_OBJECT_ATTRIBUTES_INIT(&attrs);
attrs.EvtCleanupCallback = MyContextCleanup;   // runs at PASSIVE_LEVEL
attrs.EvtDestroyCallback = MyContextDestroy;   // may run at DISPATCH_LEVEL
WDF_OBJECT_ATTRIBUTES_SET_CONTEXT_TYPE(&attrs, MY_DEVICE_CONTEXT);
WdfDeviceCreate(&DeviceInit, &attrs, &device);
```

## Synchronization

| Primitive | Max IRQL | Use |
|-----------|----------|-----|
| `WDFSPINLOCK` (`WdfSpinLockAcquire`) | DISPATCH_LEVEL | Short, no blocking |
| `WDFWAITLOCK` (`WdfWaitLockAcquire`) | PASSIVE_LEVEL | Can block; never at DISPATCH |
| `KEVENT`, `FAST_MUTEX` | varies | Less common in WDF; prefer the above |
| WDF execution levels | — | Set on `WDF_OBJECT_ATTRIBUTES.ExecutionLevel` for callback serialization |

## PnP / Power callbacks (subset)

```c
WDF_PNPPOWER_EVENT_CALLBACKS pp;
WDF_PNPPOWER_EVENT_CALLBACKS_INIT(&pp);
pp.EvtDevicePrepareHardware = MyEvtDevicePrepareHardware;     // map resources
pp.EvtDeviceReleaseHardware = MyEvtDeviceReleaseHardware;
pp.EvtDeviceD0Entry         = MyEvtDeviceD0Entry;
pp.EvtDeviceD0Exit          = MyEvtDeviceD0Exit;
WdfDeviceInitSetPnpPowerEventCallbacks(DeviceInit, &pp);
```

## Verification ladder

1. Compile with `/W4 /WX` and SAL annotations — fix every warning
2. **Static Driver Verifier (SDV)** — IRQL/locking/leak rules, must be clean before release
3. **WDK CodeQL queries** (Microsoft's `Windows-Driver-Developer-Supplemental-Tools` repo) — must-pass set
4. **Driver Verifier** at runtime: `verifier /standard /driver MyDrv.sys`, then reboot and exercise
5. **!analyze** any bugcheck on the test machine via WinDbg

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| `ExAllocatePoolWithTag` | Deprecated since 22000 | `ExAllocatePool2(POOL_FLAG_NON_PAGED, ...)` |
| `KeWaitForSingleObject` at DISPATCH | Bugcheck | Schedule a workitem to PASSIVE |
| `try/except` around random kernel APIs | Hides real bugs | Use SEH only around user-buffer probing |
| Unprobed `METHOD_NEITHER` user pointer | Bluescreens / privilege escalation | Use `METHOD_BUFFERED` or probe explicitly |
| Forgetting `WdfRequestComplete` | I/O hangs forever | Complete on every code path (or `WdfRequestStopAcknowledge`) |
| Returning success but completing the request elsewhere asynchronously without marking it pending | Double-complete bugcheck | Mark with `WdfRequestMarkCancelable` and complete once |
| C++ STL / `new` / RTTI / exceptions | Not safe in kernel by default | Plain C, `wil::` helpers, `LIST_ENTRY` intrusive lists |
| `DbgPrint` for production diagnostics | No structured log, no levels filtering | WPP tracing |
