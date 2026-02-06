// SPDX-License-Identifier: MIT
/**
 * Splash Screen Preload Script
 * Exposes IPC for path selection and step updates
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('splashAPI', {
  // Receive step updates from main process
  onStepUpdate: (callback) => {
    ipcRenderer.on('step-update', callback);
  },

  // Receive default path from main process
  onSetDefaultPath: (callback) => {
    ipcRenderer.on('set-default-path', callback);
  },

  // Open folder browser dialog
  browseFolder: () => {
    return ipcRenderer.invoke('select-folder');
  },

  // Confirm selected path and start initialization
  confirmPath: (path) => {
    return ipcRenderer.invoke('confirm-path', path);
  },

  // Get app version
  getVersion: () => {
    return process.env.npm_package_version || '1.0.0';
  }
});
