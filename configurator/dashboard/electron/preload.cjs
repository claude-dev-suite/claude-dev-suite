// SPDX-License-Identifier: MIT
/**
 * Electron Preload Script
 *
 * Exposes safe APIs to the renderer process
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Server port (set via process.env.PORT, defaults to 3456)
  serverPort: parseInt(process.env.PORT || '3456', 10),

  // Get app version
  getVersion: () => ipcRenderer.invoke('get-app-version'),

  // Get project path selected in splash
  getProjectPath: () => ipcRenderer.invoke('get-project-path'),

  // Open folder dialog
  browseFolder: () => ipcRenderer.invoke('browse-folder'),

  // Open an https URL in the system browser (validated against an allowlist in main)
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // Listen for project changes from menu
  onProjectSelected: (callback) => {
    ipcRenderer.on('project-selected', (event, path) => callback(path));
  },

  // Platform info
  platform: process.platform,

  // Auto-updater API
  updater: {
    // Actions
    checkForUpdates: () => ipcRenderer.invoke('updater:check'),
    downloadUpdate: () => ipcRenderer.invoke('updater:download'),
    installUpdate: () => ipcRenderer.invoke('updater:install'),
    getVersion: () => ipcRenderer.invoke('updater:getVersion'),

    // Event listeners
    onChecking: (callback) => {
      const handler = () => callback();
      ipcRenderer.on('update:checking', handler);
      return () => ipcRenderer.removeListener('update:checking', handler);
    },
    onAvailable: (callback) => {
      const handler = (_, data) => callback(data);
      ipcRenderer.on('update:available', handler);
      return () => ipcRenderer.removeListener('update:available', handler);
    },
    onNotAvailable: (callback) => {
      const handler = (_, data) => callback(data);
      ipcRenderer.on('update:not-available', handler);
      return () => ipcRenderer.removeListener('update:not-available', handler);
    },
    onProgress: (callback) => {
      const handler = (_, data) => callback(data);
      ipcRenderer.on('update:progress', handler);
      return () => ipcRenderer.removeListener('update:progress', handler);
    },
    onDownloaded: (callback) => {
      const handler = (_, data) => callback(data);
      ipcRenderer.on('update:downloaded', handler);
      return () => ipcRenderer.removeListener('update:downloaded', handler);
    },
    onError: (callback) => {
      const handler = (_, data) => callback(data);
      ipcRenderer.on('update:error', handler);
      return () => ipcRenderer.removeListener('update:error', handler);
    },
  },
});
