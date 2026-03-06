// SPDX-License-Identifier: MIT
/**
 * Electron Auto-Updater Module
 *
 * Handles automatic updates for the Dev-Suite Dashboard app.
 * Supports private GitHub repositories with token authentication.
 *
 * Features:
 * - Check for updates on startup and periodically (every 4 hours)
 * - Manual download control (user decides when to download)
 * - IPC communication with renderer for UI updates
 * - Delta updates via blockmap files
 */

const { ipcMain } = require('electron');

// Lazy-load electron-updater (heavy module) only when initAutoUpdater is called
let autoUpdater = null;
let log = null;

// Check interval: 4 hours in milliseconds
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

// Initial check delay: 5 seconds after app starts
const INITIAL_CHECK_DELAY_MS = 5000;

/** @type {Electron.BrowserWindow | null} */
let mainWindow = null;

/** @type {NodeJS.Timeout | null} */
let checkInterval = null;

/**
 * Send update event to renderer process
 * @param {string} channel - IPC channel name
 * @param {*} data - Data to send
 */
function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

/**
 * Initialize the auto-updater
 * @param {Electron.BrowserWindow} window - Main browser window
 */
function initAutoUpdater(window) {
  // Load heavy modules now (after splash is shown and main window is ready)
  autoUpdater = require('electron-updater').autoUpdater;
  log = require('electron-log/main');
  autoUpdater.logger = log;
  autoUpdater.logger.transports.file.level = 'info';

  mainWindow = window;

  // Configuration
  autoUpdater.autoDownload = false; // User decides when to download
  autoUpdater.autoInstallOnAppQuit = true; // Install on quit if downloaded
  autoUpdater.allowDowngrade = false;
  autoUpdater.allowPrerelease = false;

  // Configure feed URL for private GitHub repo
  // SECURITY: Never log token presence or value
  const ghToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (ghToken) {
    // SECURITY: Don't log that token exists - just silently configure
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'claude-dev-suite',
      repo: 'claude-dev-suite',
      private: false,
      token: ghToken,
    });
    log.info('[Updater] Configured for private repository updates');
  } else {
    log.info('[Updater] Updates available from public releases only');
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

  autoUpdater.on('checking-for-update', () => {
    log.info('[Updater] Checking for updates...');
    sendToRenderer('update:checking', null);
  });

  autoUpdater.on('update-available', (info) => {
    log.info('[Updater] Update available:', info.version);
    sendToRenderer('update:available', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
      releaseName: info.releaseName,
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    log.info('[Updater] No updates available. Current version:', info.version);
    sendToRenderer('update:not-available', {
      version: info.version,
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    log.info(`[Updater] Download progress: ${progress.percent.toFixed(1)}%`);
    sendToRenderer('update:progress', {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total,
    });

    // Update taskbar progress on Windows
    if (mainWindow && !mainWindow.isDestroyed() && process.platform === 'win32') {
      mainWindow.setProgressBar(progress.percent / 100);
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info('[Updater] Update downloaded:', info.version);
    sendToRenderer('update:downloaded', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
      releaseName: info.releaseName,
    });

    // Clear taskbar progress
    if (mainWindow && !mainWindow.isDestroyed() && process.platform === 'win32') {
      mainWindow.setProgressBar(-1);
    }
  });

  autoUpdater.on('error', (error) => {
    log.error('[Updater] Error:', error.message);
    // Do not forward the stack trace to the renderer — log it server-side only
    sendToRenderer('update:error', {
      message: error.message,
    });

    // Clear taskbar progress on error
    if (mainWindow && !mainWindow.isDestroyed() && process.platform === 'win32') {
      mainWindow.setProgressBar(-1);
    }
  });

  // ============================================
  // IPC HANDLERS
  // ============================================

  ipcMain.handle('updater:check', async () => {
    try {
      log.info('[Updater] Manual check triggered');
      const result = await autoUpdater.checkForUpdates();
      return { success: true, updateInfo: result?.updateInfo };
    } catch (error) {
      log.error('[Updater] Check failed:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('updater:download', async () => {
    try {
      log.info('[Updater] Starting download');
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (error) {
      log.error('[Updater] Download failed:', error.message);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('updater:install', () => {
    log.info('[Updater] Installing update and restarting');
    autoUpdater.quitAndInstall(false, true);
    return { success: true };
  });

  ipcMain.handle('updater:getVersion', () => {
    const { app } = require('electron');
    return app.getVersion();
  });

  // ============================================
  // AUTOMATIC CHECKS
  // ============================================

  // Initial check after delay
  setTimeout(() => {
    log.info('[Updater] Running initial update check');
    autoUpdater.checkForUpdates().catch((error) => {
      log.error('[Updater] Initial check failed:', error.message);
    });
  }, INITIAL_CHECK_DELAY_MS);

  // Periodic checks
  checkInterval = setInterval(() => {
    log.info('[Updater] Running periodic update check');
    autoUpdater.checkForUpdates().catch((error) => {
      log.error('[Updater] Periodic check failed:', error.message);
    });
  }, CHECK_INTERVAL_MS);

  log.info('[Updater] Auto-updater initialized');
}

/**
 * Cleanup function to stop periodic checks
 */
function stopUpdater() {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
  log.info('[Updater] Stopped');
}

module.exports = {
  initAutoUpdater,
  stopUpdater,
};
