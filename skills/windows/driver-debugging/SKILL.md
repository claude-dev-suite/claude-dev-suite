---
name: driver-debugging
description: |
  Windows driver debugging end-to-end: WinDbg / WinDbg-Preview, KDNET kernel debugging
  setup over Ethernet/USB, Driver Verifier, Application Verifier (UMDF), bugcheck
  analysis with !analyze -v, common kernel commands (!process, !thread, !irp, !devstack,
  !wdfdevice, !wdfkd.wdfdriverinfo), live and post-mortem (kernel dumps), symbol setup,
  and WPP / ETW trace analysis.

  USE WHEN: user mentions "WinDbg", "kd", "KDNET", "kernel debugger", "Driver Verifier",
  "verifier.exe", "Application Verifier", "appverif", "!analyze", "!irp", "bugcheck",
  "0x9f DRIVER_POWER_STATE_FAILURE", "kernel dump", "MEMORY.DMP", "DebugView",
  "tracefmt", "tracerpt", "WPP decode"

  DO NOT USE FOR: Visual Studio managed/.NET debugging, web app debugging
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Windows Driver Debugging - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `driver-debugging`. Authoritative source: `learn.microsoft.com/en-us/windows-hardware/drivers/debugger/`.

## Setup checklist (one-time per test machine pair)

1. **Two machines**: HOST (debugger, WinDbg) + TARGET (the machine running the driver)
2. **Same OS bitness**, both on the same private network (or USB 3 debug cable, or serial — Ethernet via KDNET is the modern default)
3. On TARGET, enable kernel debugging:
   ```
   bcdedit /debug on
   bcdedit /dbgsettings net hostip:<HOST_IP> port:50000 key:1.2.3.4
   bcdedit /set testsigning on        ; if loading test-signed drivers
   ```
   `bcdedit` prints the **debug key** — copy it to HOST.
4. Reboot TARGET — it now waits for HOST early in boot (or run live)
5. On HOST: WinDbg → File → Attach to Kernel → Net → port `50000`, paste key
6. Symbols: set `_NT_SYMBOL_PATH=srv*c:\symbols*https://msdl.microsoft.com/download/symbols` (and add your driver's `.pdb` path)

## Driver Verifier (use this every dev/test session)

Configure on TARGET:
```cmd
verifier /standard /driver MyDriver.sys
verifier /flags 0x209BB /driver MyDriver.sys     ; common production-like set
verifier /query                                   ; show current state
verifier /reset                                   ; turn off
```

Standard rules catch: pool corruption, IRQL violations, low resources simulation, leaked references, deadlock detection, DMA verification.

> **Cost**: ~10–20% perf hit, occasional artificial low-memory failures. **Worth it** — the bugs Verifier finds are bugs that ship.

## WinDbg essentials

| Command | Purpose |
|---------|---------|
| `g` / `gu` / `t` / `p` | go / step out / step in / step over |
| `bp <addr>` / `bm <pat>` | software / module breakpoint |
| `bc *` | clear all breakpoints |
| `k` / `kn` / `kp` | call stack / numbered / with parameters |
| `!analyze -v` | bugcheck root-cause first stop |
| `!process 0 0` | list every process |
| `!process 0 7 myapp.exe` | dump all threads + stacks of `myapp.exe` |
| `!thread <addr>` | inspect a `_KTHREAD` |
| `!irp <addr>` | decode an IRP (driver stack, status, params) |
| `!devstack <devobj>` | show device stack for a `_DEVICE_OBJECT` |
| `!devnode 0 1` | the entire PnP devnode tree |
| `!wdfkd.wdfdriverinfo MyDriver` | WDF metadata about your driver (load `wdfkd.dll`) |
| `!wdfkd.wdfdevice <wdfdevice>` | WDF device internals (queues, refs, callbacks) |
| `!locks` / `!qlocks` | held kernel locks |
| `!pool <addr>` | identify a pool block (tag, size) |
| `!poolused 4 <tag>` | who allocated under this pool tag |
| `dt nt!_EPROCESS <addr>` | typed structure dump |

## Bugcheck analysis flow

1. `!analyze -v` — get the proposed culprit, parameters, faulting stack
2. Cross-check with **bugcheck reference** (e.g. `0xC4` = Driver Verifier detected violation, `0x9F` = power state failure, `0xD1` = DRIVER_IRQL_NOT_LESS_OR_EQUAL)
3. `kP` for full stack with parameters
4. `!irp <faulting irp>` if an IRP is involved (very common for `0xD1`)
5. Inspect the suspect driver:
   - `lm vm MyDriver` — module info, build time
   - `!for_each_module .if (...)` to script
6. Reproduce with **Driver Verifier** if not already on — it often changes a wild crash into a precise assertion

## Common bugchecks tied to driver mistakes

| Code | Name | Usual cause |
|------|------|-------------|
| `0xA` | IRQL_NOT_LESS_OR_EQUAL | Touched paged data at DISPATCH_LEVEL or freed memory |
| `0x1E` | KMODE_EXCEPTION_NOT_HANDLED | Unhandled SEH in kernel; often null deref |
| `0x9F` | DRIVER_POWER_STATE_FAILURE | Driver didn't complete a Pnp/Power IRP within timeout |
| `0xC2` | BAD_POOL_CALLER | Wrong pool free, double-free, wrong tag |
| `0xC4` | DRIVER_VERIFIER_DETECTED_VIOLATION | Verifier rule fired — **read parameter 1** for the rule |
| `0xC9` | DRIVER_VERIFIER_IOMANAGER_VIOLATION | I/O misuse caught by Verifier (most common: incomplete IRP) |
| `0xD1` | DRIVER_IRQL_NOT_LESS_OR_EQUAL | Pageable code/data at DISPATCH_LEVEL |
| `0x139` | KERNEL_SECURITY_CHECK_FAILURE | Stack canary / CFG / control-flow integrity violation |
| `0x1AA` | EXCEPTION_ON_INVALID_STACK | Stack corruption |

## Live remote inspection (no break)

```
.reload /f                         ; refresh symbols
!process 0 17                       ; very verbose process list
!thread <tid>                       ; current thread
.dump /ma C:\target.dmp              ; full memory dump for offline analysis
```

## Post-mortem (`MEMORY.DMP`)

Configure TARGET to write a kernel/full dump:
- System Properties → Advanced → Startup and Recovery → Write debugging information → **Kernel memory dump** (or **Complete** for big repros)
- After bugcheck, `%SystemRoot%\MEMORY.DMP` is created — open with WinDbg → Open Crash Dump

## Application Verifier (UMDF)

For UMDF drivers (and the user-mode services that talk to them), use `appverif.exe`:
```cmd
appverif /verify WUDFHost.exe                  ; full UMDF host coverage
appverif /verify mytestapp.exe /faults          ; with fault injection
```

Catches handle leaks, heap corruption, double-frees, lock-order issues — the user-mode equivalent of Driver Verifier.

## WPP trace decoding

```cmd
:: Start a session against the driver's WPP GUID
tracelog -start mytrace -guid GuidFile.txt -f trace.etl -flag 0xFFFF -level 5

:: Repro the bug

tracelog -stop mytrace

:: Decode using the .pdb of the driver (TMF embedded)
tracefmt -p C:\symbols\MyDriver.pdb trace.etl -o trace.txt
```

Or use `traceview.exe` (legacy GUI) for live decoding.

## ETW (modern alternative for UMDF / general)

- Define an ETW provider with `<instrumentationManifest>` or `TraceLoggingProvider.h`
- Capture: `wpr -start GeneralProfile && repro && wpr -stop trace.etl`
- Open in **Windows Performance Analyzer (WPA)** for graphs, or `tracerpt trace.etl -of XML`

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Debug only with `DbgPrint` | No filtering, no offline replay | WPP / ETW with structured fields |
| Disable Driver Verifier "to ship faster" | Bugs ship | Keep it on for all dev/test boots |
| Trust the first `!analyze -v` answer absolutely | Heuristic, sometimes wrong | Cross-check with `kP`, `!irp`, the actual code |
| Stale symbols | Wrong stacks, wrong line numbers | `.reload /f` and pin the build's `.pdb` next to `.sys` |
| Debugging via Hyper-V quick-create + screen-staring | Slow loop | KDNET to a real (or VM) target, scripted repro |
| Saving only minidumps | Often missing the data you need | Set Kernel or Complete dump for driver bugs |
| Capturing ETW without a clear provider list | Massive noise | Filter by your driver's GUID + the kernel providers you actually need |
