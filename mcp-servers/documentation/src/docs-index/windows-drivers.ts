// SPDX-License-Identifier: MIT
/**
 * Windows kernel & user-mode driver development documentation.
 * Includes: WDF (KMDF/UMDF), HID stack & filter drivers, Indirect Display Drivers (IDD),
 *           driver debugging (WinDbg, KDNET, Driver Verifier), and driver signing
 *           (EV cert, attestation, WHQL/HLK).
 *
 * Authoritative upstream sources are Microsoft Learn pages under
 * `learn.microsoft.com/en-us/windows-hardware/drivers/` and the canonical samples
 * repo `github.com/microsoft/Windows-driver-samples`.
 */

import type { DocsRecord } from "./types.js";

export const WINDOWS_DRIVERS_TECHNOLOGIES = [
  "wdf-kmdf",
  "wdf-umdf",
  "hid-input-filter",
  "indirect-display",
  "driver-debugging",
  "driver-signing",
] as const;

export const windowsDriversDocs: DocsRecord = {
  "wdf-kmdf": {
    overview: {
      local: "windows-drivers/wdf-kmdf/overview.md",
      url: "https://learn.microsoft.com/en-us/windows-hardware/drivers/wdf/using-the-framework-based-on-the-driver-type",
    },
    "driver-entry": {
      local: "windows-drivers/wdf-kmdf/driver-entry.md",
      url: "https://learn.microsoft.com/en-us/windows-hardware/drivers/wdf/driverentry-for-kmdf-drivers",
    },
    "io-queues": {
      local: "windows-drivers/wdf-kmdf/io-queues.md",
      url: "https://learn.microsoft.com/en-us/windows-hardware/drivers/wdf/managing-i-o-queues",
    },
    irql: {
      local: "windows-drivers/wdf-kmdf/irql.md",
      url: "https://learn.microsoft.com/en-us/windows-hardware/drivers/kernel/managing-hardware-priorities",
    },
    "memory-pools": {
      local: "windows-drivers/wdf-kmdf/memory-pools.md",
      url: "https://learn.microsoft.com/en-us/windows-hardware/drivers/kernel/allocating-system-space-memory",
    },
    "pnp-power": {
      local: "windows-drivers/wdf-kmdf/pnp-power.md",
      url: "https://learn.microsoft.com/en-us/windows-hardware/drivers/wdf/supporting-pnp-and-power-management-in-your-driver",
    },
    synchronization: {
      local: "windows-drivers/wdf-kmdf/synchronization.md",
      url: "https://learn.microsoft.com/en-us/windows-hardware/drivers/wdf/using-automatic-synchronization",
    },
    sal: {
      local: "windows-drivers/wdf-kmdf/sal.md",
      url: "https://learn.microsoft.com/en-us/windows-hardware/drivers/devtest/using-sal-annotations-to-reduce-c-cpp-code-defects",
    },
    sdv: {
      local: "windows-drivers/wdf-kmdf/sdv.md",
      url: "https://learn.microsoft.com/en-us/windows-hardware/drivers/devtest/static-driver-verifier",
    },
    "wpp-tracing": {
      local: "windows-drivers/wdf-kmdf/wpp-tracing.md",
      url: "https://learn.microsoft.com/en-us/windows-hardware/drivers/devtest/wpp-software-tracing",
    },
    samples: {
      local: "windows-drivers/wdf-kmdf/samples.md",
      url: "https://github.com/microsoft/Windows-driver-samples/tree/main/general/echo/kmdf",
    },
  },

  "wdf-umdf": {
    overview: {
      local: "windows-drivers/wdf-umdf/overview.md",
      url: "https://learn.microsoft.com/en-us/windows-hardware/drivers/wdf/getting-started-with-umdf-version-2",
    },
    "umdf-vs-kmdf": {
      local: "windows-drivers/wdf-umdf/umdf-vs-kmdf.md",
      url: "https://learn.microsoft.com/en-us/windows-hardware/drivers/wdf/comparing-umdf-2-0-functionality-to-kmdf",
    },
    inf: {
      local: "windows-drivers/wdf-umdf/inf.md",
      url: "https://learn.microsoft.com/en-us/windows-hardware/drivers/wdf/specifying-wdf-directives-in-inf-files",
    },
    reflector: {
      local: "windows-drivers/wdf-umdf/reflector.md",
      url: "https://learn.microsoft.com/en-us/windows-hardware/drivers/wdf/architecture-of-umdf-version-2",
    },
    debugging: {
      local: "windows-drivers/wdf-umdf/debugging.md",
      url: "https://learn.microsoft.com/en-us/windows-hardware/drivers/wdf/how-to-enable-debugging-of-a-umdf-driver",
    },
    samples: {
      local: "windows-drivers/wdf-umdf/samples.md",
      url: "https://github.com/microsoft/Windows-driver-samples/tree/main/general/echo/umdf2",
    },
  },

  "hid-input-filter": {
    "hid-architecture": {
      local: "windows-drivers/hid-input-filter/hid-architecture.md",
      url: "https://learn.microsoft.com/en-us/windows-hardware/drivers/hid/hid-architecture",
    },
    "hid-class-driver": {
      local: "windows-drivers/hid-input-filter/hid-class-driver.md",
      url: "https://learn.microsoft.com/en-us/windows-hardware/drivers/hid/hid-class-driver",
    },
    "filter-drivers": {
      local: "windows-drivers/hid-input-filter/filter-drivers.md",
      url: "https://learn.microsoft.com/en-us/windows-hardware/drivers/wdf/filter-drivers",
    },
    "internal-ioctls": {
      local: "windows-drivers/hid-input-filter/internal-ioctls.md",
      url: "https://learn.microsoft.com/en-us/windows-hardware/drivers/hid/hid-collections",
    },
    "report-descriptor": {
      local: "windows-drivers/hid-input-filter/report-descriptor.md",
      url: "https://learn.microsoft.com/en-us/windows-hardware/drivers/hid/getting-hid-reports",
    },
    "kbfiltr-sample": {
      local: "windows-drivers/hid-input-filter/kbfiltr-sample.md",
      url: "https://github.com/microsoft/Windows-driver-samples/tree/main/input/kbfiltr",
    },
    "moufiltr-sample": {
      local: "windows-drivers/hid-input-filter/moufiltr-sample.md",
      url: "https://github.com/microsoft/Windows-driver-samples/tree/main/input/moufiltr",
    },
    "firefly-sample": {
      local: "windows-drivers/hid-input-filter/firefly-sample.md",
      url: "https://github.com/microsoft/Windows-driver-samples/tree/main/hid/firefly",
    },
    vhf: {
      local: "windows-drivers/hid-input-filter/vhf.md",
      url: "https://learn.microsoft.com/en-us/windows-hardware/drivers/hid/virtual-hid-framework--vhf-",
    },
  },

  "indirect-display": {
    overview: {
      local: "windows-drivers/indirect-display/overview.md",
      url: "https://learn.microsoft.com/en-us/windows-hardware/drivers/display/indirect-display-driver-model-overview",
    },
    "iddcx-callbacks": {
      local: "windows-drivers/indirect-display/iddcx-callbacks.md",
      url: "https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/iddcx/",
    },
    "monitor-modes": {
      local: "windows-drivers/indirect-display/monitor-modes.md",
      url: "https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/iddcx/ns-iddcx-iddcx_monitor_mode",
    },
    "swap-chain": {
      local: "windows-drivers/indirect-display/swap-chain.md",
      url: "https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/iddcx/nf-iddcx-iddcxswapchainreleaseandacquirebuffer",
    },
    "hardware-cursor": {
      local: "windows-drivers/indirect-display/hardware-cursor.md",
      url: "https://learn.microsoft.com/en-us/windows-hardware/drivers/ddi/iddcx/nf-iddcx-iddcxmonitorsetuphardwarecursor",
    },
    edid: {
      local: "windows-drivers/indirect-display/edid.md",
      url: "https://learn.microsoft.com/en-us/windows-hardware/drivers/display/edid-extension-blocks",
    },
    "idd-sample": {
      local: "windows-drivers/indirect-display/idd-sample.md",
      url: "https://github.com/microsoft/Windows-driver-samples/tree/main/general/IndirectDisplay",
    },
    nvenc: {
      local: "windows-drivers/indirect-display/nvenc.md",
      url: "https://docs.nvidia.com/video-technologies/video-codec-sdk/nvenc-video-encoder-api-prog-guide/",
    },
    rivermax: {
      local: "windows-drivers/indirect-display/rivermax.md",
      url: "https://developer.nvidia.com/networking/rivermax",
    },
  },

  "driver-debugging": {
    "windbg-overview": {
      local: "windows-drivers/driver-debugging/windbg-overview.md",
      url: "https://learn.microsoft.com/en-us/windows-hardware/drivers/debugger/",
    },
    "kdnet-setup": {
      local: "windows-drivers/driver-debugging/kdnet-setup.md",
      url: "https://learn.microsoft.com/en-us/windows-hardware/drivers/debugger/setting-up-a-network-debugging-connection-automatically",
    },
    "driver-verifier": {
      local: "windows-drivers/driver-debugging/driver-verifier.md",
      url: "https://learn.microsoft.com/en-us/windows-hardware/drivers/devtest/driver-verifier",
    },
    "application-verifier": {
      local: "windows-drivers/driver-debugging/application-verifier.md",
      url: "https://learn.microsoft.com/en-us/windows-hardware/drivers/devtest/application-verifier",
    },
    analyze: {
      local: "windows-drivers/driver-debugging/analyze.md",
      url: "https://learn.microsoft.com/en-us/windows-hardware/drivers/debuggercmds/-analyze",
    },
    "kernel-extensions": {
      local: "windows-drivers/driver-debugging/kernel-extensions.md",
      url: "https://learn.microsoft.com/en-us/windows-hardware/drivers/debuggercmds/specialized-extensions",
    },
    "wdfkd-extension": {
      local: "windows-drivers/driver-debugging/wdfkd-extension.md",
      url: "https://learn.microsoft.com/en-us/windows-hardware/drivers/debuggercmds/wdfkd-debugger-extensions",
    },
    "bug-checks": {
      local: "windows-drivers/driver-debugging/bug-checks.md",
      url: "https://learn.microsoft.com/en-us/windows-hardware/drivers/debugger/bug-check-code-reference2",
    },
    "memory-dumps": {
      local: "windows-drivers/driver-debugging/memory-dumps.md",
      url: "https://learn.microsoft.com/en-us/windows-hardware/drivers/debugger/varieties-of-kernel-mode-dump-files",
    },
    "wpp-decode": {
      local: "windows-drivers/driver-debugging/wpp-decode.md",
      url: "https://learn.microsoft.com/en-us/windows-hardware/drivers/devtest/tracefmt",
    },
  },

  "driver-signing": {
    "policy-overview": {
      local: "windows-drivers/driver-signing/policy-overview.md",
      url: "https://learn.microsoft.com/en-us/windows-hardware/drivers/install/driver-signing",
    },
    "ev-cert": {
      local: "windows-drivers/driver-signing/ev-cert.md",
      url: "https://learn.microsoft.com/en-us/windows-hardware/drivers/dashboard/get-a-code-signing-certificate",
    },
    "attestation-signing": {
      local: "windows-drivers/driver-signing/attestation-signing.md",
      url: "https://learn.microsoft.com/en-us/windows-hardware/drivers/dashboard/attestation-signing-a-kernel-driver-for-public-release",
    },
    "whql-hlk": {
      local: "windows-drivers/driver-signing/whql-hlk.md",
      url: "https://learn.microsoft.com/en-us/windows-hardware/test/hlk/",
    },
    "test-signing": {
      local: "windows-drivers/driver-signing/test-signing.md",
      url: "https://learn.microsoft.com/en-us/windows-hardware/drivers/install/installing-an-unsigned-driver-during-development-and-test",
    },
    inf2cat: {
      local: "windows-drivers/driver-signing/inf2cat.md",
      url: "https://learn.microsoft.com/en-us/windows-hardware/drivers/devtest/inf2cat",
    },
    signtool: {
      local: "windows-drivers/driver-signing/signtool.md",
      url: "https://learn.microsoft.com/en-us/windows-hardware/drivers/devtest/signtool",
    },
    infverif: {
      local: "windows-drivers/driver-signing/infverif.md",
      url: "https://learn.microsoft.com/en-us/windows-hardware/drivers/devtest/infverif",
    },
    "partner-center": {
      local: "windows-drivers/driver-signing/partner-center.md",
      url: "https://learn.microsoft.com/en-us/windows-hardware/drivers/dashboard/",
    },
  },
};
