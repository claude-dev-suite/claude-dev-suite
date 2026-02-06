// SPDX-License-Identifier: MIT
/**
 * Desktop application frameworks documentation
 * Includes: Electron, Tauri
 */

import type { DocsRecord } from "./types.js";

export const DESKTOP_TECHNOLOGIES = [
  "electron",
  "tauri",
] as const;

export const desktopDocs: DocsRecord = {
  electron: {
    basics: {
      local: "electron/basics.md",
      url: "https://www.electronjs.org/docs/latest/",
    },
    ipc: {
      local: "electron/ipc.md",
      url: "https://www.electronjs.org/docs/latest/tutorial/ipc",
    },
    security: {
      local: "electron/security.md",
      url: "https://www.electronjs.org/docs/latest/tutorial/security",
    },
    packaging: {
      local: "electron/packaging.md",
      url: "https://www.electronjs.org/docs/latest/tutorial/application-distribution",
    },
    "auto-updates": {
      local: "electron/auto-updates.md",
      url: "https://www.electronjs.org/docs/latest/tutorial/updates",
    },
    "backend-integration": {
      local: "electron/backend-integration.md",
      url: "https://www.electronjs.org/docs/latest/tutorial/performance",
    },
  },

  tauri: {
    basics: {
      local: "tauri/basics.md",
      url: "https://tauri.app/",
    },
    commands: {
      local: "tauri/commands.md",
      url: "https://tauri.app/develop/calling-rust/",
    },
    plugins: {
      local: "tauri/plugins.md",
      url: "https://tauri.app/develop/plugins/",
    },
    bundling: {
      local: "tauri/bundling.md",
      url: "https://tauri.app/distribute/",
    },
  },
};
