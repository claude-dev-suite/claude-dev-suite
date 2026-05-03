---
name: indirect-display
description: |
  Windows Indirect Display Driver (IDD) framework. UMDF v2-based driver model for adding
  virtual monitors that the Desktop Window Manager treats as real displays, then capturing
  the rendered frames in user mode and routing them somewhere else (network, file, encoder)
  instead of a physical panel. Covers IddCx callbacks, monitor descriptors (EDID/MCCS),
  swap-chain processing, cursor handling, hot-plug, hardware cursor, multi-monitor, HDR,
  and integration with NVENC / Rivermax / RDMA NICs for low-latency network streaming.

  USE WHEN: user mentions "IDD", "Indirect Display", "IddCx", "IddSampleDriver",
  "virtual monitor", "virtual display driver", "IDDCX_SWAPCHAIN", "AcquireBuffer",
  "FinishedProcessingFrame", "EDID for virtual display", "stream desktop", "network display"

  DO NOT USE FOR: WDDM display miniport drivers (real GPU), DXGK kernel work,
  Miracast (different framework), Remote Desktop / RDP (different stack)
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Indirect Display Driver - Quick Reference

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology: `indirect-display`. Authoritative source: `learn.microsoft.com/en-us/windows-hardware/drivers/display/indirect-display-driver-model-overview`. Canonical sample: `general/IddSampleDriver` in `microsoft/Windows-driver-samples`.

## What IDD is (and isn't)

IDD is a **UMDF v2 driver** that registers itself as a display adapter via `IddCx`. The OS treats the IDD's monitors like real displays for layout, DPI, multi-mon, cursor, etc. The driver receives swap-chains (a stream of GPU surfaces) for each connected monitor and is responsible for *consuming* the frames somehow.

| Goal | IDD fits? |
|------|-----------|
| Show desktop on a USB display, virtual monitor, or remote network endpoint | YES |
| Render a virtual screen and stream it over LAN/Wi-Fi/Rivermax NIC | YES |
| Add a "headless" extra monitor for window placement | YES |
| Drive a real PCIe GPU's display outputs | NO — that needs WDDM |
| Replace the primary display of an existing GPU | NO — additive only |

## IDD architecture in one diagram

```
                Apps (DWM composes the desktop into per-monitor swapchains)
                                           |
   ────────────────────────────── Kernel mode (DXGK / GPU schedulers) ──────────
                                           |   (handled by IddCx + WDDM emulation)
   ────────────────────────────── User mode  (WUDFHost.exe) ────────────────────
                                           |
                            +----------------------------+
                            | Your IDD UMDF DLL          |
                            |  - EvtIddCxAdapterInitFinished
                            |  - EvtIddCxParseMonitorDescription
                            |  - EvtIddCxMonitorGetDefaultModes
                            |  - EvtIddCxMonitorQueryTargetModes
                            |  - EvtIddCxMonitorAssignSwapChain
                            |  - <swap-chain processing thread>
                            |       AcquireBuffer / FinishedProcessing
                            |       -> encode (NVENC) -> send (TCP/UDP/Rivermax)
                            +----------------------------+
```

## Lifecycle / callback flow (simplified)

1. **DriverEntry** → `IddCxDriverInitialize` registers IDD
2. **EvtDeviceAdd** → create the WDF device, then `IddCxDeviceInitialize`
3. **EvtIddCxAdapterInitFinished** — adapter is up; you can now plug monitors with `IddCxMonitorCreate` + `IddCxMonitorArrival`
4. **EvtIddCxParseMonitorDescription / MonitorGetDefaultModes / MonitorQueryTargetModes** — declare what the virtual monitor supports (resolution, refresh rate, color)
5. **EvtIddCxMonitorAssignSwapChain** — DWM is ready to push frames; start your processing thread
6. Processing thread: loop `IddCxSwapChainAcquireBuffer` → consume → `IddCxSwapChainFinishedProcessingFrame` → `IddCxSwapChainReleaseAndAcquireBuffer`
7. **EvtIddCxMonitorUnassignSwapChain** — stop your thread cleanly
8. Plug-out: `IddCxMonitorDeparture` → `IddCxMonitorReleaseAndDestroy`

## Monitor descriptor — minimum viable EDID

Provide a synthetic EDID via `EvtIddCxParseMonitorDescription`. The IDD sample ships an EDID blob; for production, generate one with valid manufacturer ID, product code, supported timings (CEA blocks for HDR/HDMI traits), and checksum.

```c
NTSTATUS MyEvtParseMonitorDescription(
    const IDARG_IN_PARSEMONITORDESCRIPTION* in,
    IDARG_OUT_PARSEMONITORDESCRIPTION*      out)
{
    if (in->MonitorDescription.DataSize != EDID_SIZE) return STATUS_INVALID_PARAMETER;
    // Extract preferred timing from EDID block
    out->MonitorModeBufferOutputCount = 1;
    if (in->pMonitorModes != NULL) {
        in->pMonitorModes[0] = MakeMode(1920, 1080, 60);   // helper builds IDDCX_MONITOR_MODE
    }
    return STATUS_SUCCESS;
}
```

## Swap-chain processing loop (the hot path)

```c
// Started from EvtIddCxMonitorAssignSwapChain
DWORD WINAPI SwapChainProcessor(LPVOID lp) {
    auto* ctx = static_cast<MonitorContext*>(lp);
    auto& dx  = ctx->DxResources;             // your D3D11/D3D12 device + context

    for (;;) {
        IDARG_OUT_RELEASEANDACQUIREBUFFER buf{};
        HRESULT hr = IddCxSwapChainReleaseAndAcquireBuffer(ctx->SwapChain, &buf);
        if (hr == E_PENDING) {
            // Wait on `ctx->NewFrameEvent` with timeout, then continue
            WaitForSingleObject(ctx->NewFrameEvent, 16);   // ~60 fps poll
            continue;
        }
        if (FAILED(hr)) break;                  // shutting down

        // buf.MetaData.PresentationTime, .Buffer (ID3D11Texture2D / DXGI handle)
        // 1. Get the staging texture (or use a shared NT handle)
        // 2. Encode with NVENC / quick-sync / etc.
        // 3. Send the encoded packet over the chosen transport (TCP / UDP / Rivermax)
        ConsumeFrame(ctx, buf);

        IDARG_IN_FINISHEDPROCESSINGFRAME fin{};
        IddCxSwapChainFinishedProcessingFrame(ctx->SwapChain, &fin);
    }
    return 0;
}
```

The framework hands you GPU surfaces, not CPU bitmaps. Doing CPU-side `Map` per frame is fast enough for 1080p60 but won't reach 4K60 with low latency — keep the data on the GPU and feed an encoder.

## Cursor handling

DWM tells IDD whether the cursor should be drawn into the frame or composited separately. The driver gets cursor shape + position via:
- `IddCxMonitorSetupHardwareCursor` — opt in to receive a separate cursor surface
- The `Cursor` event/handle: when signaled, call `IddCxMonitorQueryHardwareCursor` to get position + new shape

For network streaming, sending the cursor as a separate small surface (vs. baking it into the frame) lets the receiver render it locally for sub-frame latency.

## Network streaming patterns

| Transport | Why pick it | Latency |
|-----------|-------------|---------|
| **NVIDIA Rivermax** (ConnectX NICs) | Hardware-timed RTP, tight jitter, GPUDirect to DMA buffers | sub-ms |
| **UDP + FEC (RIST / SRT)** | Loss tolerance over WAN | 50–200 ms |
| **WebRTC / SRTP** | Browser-friendly receiver | 100–300 ms |
| **Plain TCP** | Simple, lossless; HOL blocking | 30 ms LAN, very bad WAN |
| **RDMA (RoCE / iWARP)** | Zero-copy LAN, NIC offloads | sub-ms |

For high resolution / framerate, encode first:
- **NVENC** (NVIDIA Video Codec SDK): H.264 / HEVC / AV1, very low latency mode; can ingest a `D3D11_TEXTURE2D` directly with `NV_ENC_INPUT_RESOURCE_TYPE_DIRECTX`.
- **Quick Sync** (Intel) via Media Foundation / oneVPL.
- **AMF** (AMD) for Radeon.
- **HEVC over Rivermax SMPTE 2110 / 2022-7** for broadcast-style transport.

## Multi-monitor

Call `IddCxMonitorArrival` once per virtual monitor at startup; the DWM treats each independently. Each gets its own swap-chain assignment + processor thread. Keep per-monitor context small and avoid global state.

## HDR (10-bit / scRGB)

Declare HDR capability in the EDID (CEA HDR Static Metadata block) and in `IDDCX_MONITOR_MODE.MonitorVideoSignalInfo.ColorInfo`. DWM will then push HDR swap-chains (`DXGI_FORMAT_R16G16B16A16_FLOAT` / `R10G10B10A2_UNORM`). Your encoder pipeline must support 10-bit HDR (HEVC Main10 / AV1).

## INF (UMDF + IddCx)

```inf
[Standard.NT$ARCH$.10.0...19041]
%Device.DeviceDesc% = MyIdd_Install, ROOT\MyIddDriver

[MyIdd_Install.NT.Wdf]
UmdfDispatcher       = NativeIdd
UmdfServiceOrder     = MyIddDriver
UmdfDirectHardwareAccess = AllowDirectHardwareAccess
UmdfFileObjectPolicy = AllowNullAndUnknownFileObjects

[MyIddDriver]
UmdfLibraryVersion = $UMDFVERSION$
ServiceBinary      = %13%\MyIddDriver.dll
DriverCLSID        = {GUID}
```

`UmdfDispatcher = NativeIdd` is the magic that wires IddCx in.

## Anti-Patterns

| Anti-Pattern | Why It's Bad | Correct Approach |
|--------------|--------------|------------------|
| Mapping every frame to CPU memory | Stalls GPU, kills throughput | Stay on GPU; encode with NVENC/QS/AMF directly |
| Allocating per frame | Heap churn at 60+ Hz | Pre-allocate ring of staging textures / encoder buffers |
| `Sleep(16)` in the loop | Frame drops, jitter | Wait on the framework's "new frame" event with bounded timeout |
| Synchronous network I/O on the processing thread | Blocks the swap-chain | Encode + queue; separate sender thread / async I/O |
| Forgetting `FinishedProcessingFrame` | Framework deadlocks | Pair every `AcquireBuffer` with a finish/release |
| Crashing on driver shutdown | Host recycle, brief desktop glitch | On `EvtIddCxMonitorUnassignSwapChain`, signal stop, join thread, release D3D resources |
| Bogus EDID | Monitor not recognized, weird modes | Generate a real EDID with valid checksum and CEA extension blocks |
| Hardcoded 1920×1080@60 | Users can't change the mode | Declare a sensible mode list in `MonitorGetDefaultModes` |
