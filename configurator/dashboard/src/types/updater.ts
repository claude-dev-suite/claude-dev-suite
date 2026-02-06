// SPDX-License-Identifier: MIT
/**
 * Auto-Updater Types
 *
 * TypeScript definitions for the Electron auto-updater system.
 */

// ============================================
// UPDATE STATUS
// ============================================

/**
 * Current status of the auto-updater
 */
export type UpdaterStatus =
  | 'idle'           // No update activity
  | 'checking'       // Checking for updates
  | 'available'      // Update is available
  | 'downloading'    // Downloading update
  | 'downloaded'     // Update downloaded, ready to install
  | 'error';         // An error occurred

// ============================================
// UPDATE INFO
// ============================================

/**
 * Information about an available update
 */
export interface UpdateInfo {
  /** New version string (e.g., "1.1.0") */
  version: string;
  /** Release date ISO string */
  releaseDate?: string;
  /** Release notes (can be markdown) */
  releaseNotes?: string | ReleaseNoteInfo[];
  /** Release name/title */
  releaseName?: string;
}

/**
 * Structured release note info (when releaseNotes is an array)
 */
export interface ReleaseNoteInfo {
  version: string;
  note: string;
}

// ============================================
// DOWNLOAD PROGRESS
// ============================================

/**
 * Download progress information
 */
export interface DownloadProgress {
  /** Download progress percentage (0-100) */
  percent: number;
  /** Download speed in bytes per second */
  bytesPerSecond: number;
  /** Total bytes transferred */
  transferred: number;
  /** Total file size in bytes */
  total: number;
}

// ============================================
// ERROR INFO
// ============================================

/**
 * Error information from updater
 */
export interface UpdateError {
  /** Error message */
  message: string;
  /** Error stack trace (development only) */
  stack?: string;
}

// ============================================
// IPC RESULT TYPES
// ============================================

/**
 * Result from check for updates
 */
export interface CheckUpdateResult {
  success: boolean;
  updateInfo?: UpdateInfo;
  error?: string;
}

/**
 * Result from download update
 */
export interface DownloadUpdateResult {
  success: boolean;
  error?: string;
}

/**
 * Result from install update
 */
export interface InstallUpdateResult {
  success: boolean;
  error?: string;
}

// ============================================
// STORE STATE
// ============================================

/**
 * Updater store state
 */
export interface UpdaterState {
  /** Current updater status */
  status: UpdaterStatus;
  /** Information about available update */
  updateInfo: UpdateInfo | null;
  /** Download progress (when downloading) */
  progress: DownloadProgress | null;
  /** Error information (when status is 'error') */
  error: UpdateError | null;
  /** Last time updates were checked */
  lastChecked: Date | null;
}

// ============================================
// ELECTRON API EXTENSION
// ============================================

/**
 * Updater API exposed via contextBridge
 */
export interface UpdaterAPI {
  // Actions
  checkForUpdates: () => Promise<CheckUpdateResult>;
  downloadUpdate: () => Promise<DownloadUpdateResult>;
  installUpdate: () => Promise<InstallUpdateResult>;
  getVersion: () => Promise<string>;

  // Event listeners (return cleanup functions)
  onChecking: (callback: () => void) => () => void;
  onAvailable: (callback: (info: UpdateInfo) => void) => () => void;
  onNotAvailable: (callback: (info: { version: string }) => void) => () => void;
  onProgress: (callback: (progress: DownloadProgress) => void) => () => void;
  onDownloaded: (callback: (info: UpdateInfo) => void) => () => void;
  onError: (callback: (error: UpdateError) => void) => () => void;
}

/**
 * Extended Electron API with updater
 */
export interface ElectronAPIWithUpdater {
  getVersion: () => Promise<string>;
  getProjectPath: () => Promise<string | null>;
  browseFolder: () => Promise<string | null>;
  onProjectSelected: (callback: (path: string) => void) => void;
  platform: 'aix' | 'darwin' | 'freebsd' | 'linux' | 'openbsd' | 'sunos' | 'win32';
  versions: {
    node: string;
    chrome: string;
    electron: string;
  };
  updater: UpdaterAPI;
}

// ============================================
// TYPE GUARDS
// ============================================

/**
 * Check if status is an UpdaterStatus
 */
export function isUpdaterStatus(value: unknown): value is UpdaterStatus {
  return (
    typeof value === 'string' &&
    ['idle', 'checking', 'available', 'downloading', 'downloaded', 'error'].includes(value)
  );
}

/**
 * Check if value is UpdateInfo
 */
export function isUpdateInfo(value: unknown): value is UpdateInfo {
  return (
    typeof value === 'object' &&
    value !== null &&
    'version' in value &&
    typeof (value as UpdateInfo).version === 'string'
  );
}

/**
 * Check if value is DownloadProgress
 */
export function isDownloadProgress(value: unknown): value is DownloadProgress {
  return (
    typeof value === 'object' &&
    value !== null &&
    'percent' in value &&
    typeof (value as DownloadProgress).percent === 'number'
  );
}
