// SPDX-License-Identifier: MIT
/**
 * useAutoUpdater Hook
 *
 * React hook that interfaces with the Electron auto-updater API
 * and manages the updater store state.
 *
 * @example
 * ```tsx
 * const { status, updateInfo, progress, checkForUpdates, downloadUpdate, installUpdate } = useAutoUpdater();
 *
 * if (status === 'available') {
 *   return <button onClick={downloadUpdate}>Download v{updateInfo?.version}</button>;
 * }
 * ```
 */

import { useEffect, useCallback } from 'react';
import { useUpdaterStore } from '@/stores';
import type {
  ElectronAPIWithUpdater,
  UpdaterStatus,
  UpdateInfo,
  DownloadProgress,
  UpdateError,
} from '@/types';

// Get the Electron API from window (exposed via preload)
const getElectronAPI = (): ElectronAPIWithUpdater | null => {
  if (typeof window !== 'undefined' && 'electronAPI' in window) {
    return window.electronAPI as ElectronAPIWithUpdater;
  }
  return null;
};

export interface UseAutoUpdaterOptions {
  /** Whether to initialize the hook (default: true) */
  enabled?: boolean;
}

export interface UseAutoUpdaterResult {
  /** Current updater status */
  status: UpdaterStatus;
  /** Information about available update */
  updateInfo: UpdateInfo | null;
  /** Download progress */
  progress: DownloadProgress | null;
  /** Error information */
  error: UpdateError | null;
  /** Last time updates were checked */
  lastChecked: Date | null;
  /** Whether running in Electron */
  isElectron: boolean;
  /** Whether the updater is available (has API) */
  isAvailable: boolean;
  /** Manually check for updates */
  checkForUpdates: () => Promise<void>;
  /** Start downloading the update */
  downloadUpdate: () => Promise<void>;
  /** Install the downloaded update (restarts app) */
  installUpdate: () => Promise<void>;
  /** Dismiss/clear current state */
  dismiss: () => void;
}

/**
 * Hook for managing auto-updates in Electron
 */
export function useAutoUpdater(options: UseAutoUpdaterOptions = {}): UseAutoUpdaterResult {
  const { enabled = true } = options;

  // Get store state and actions
  const status = useUpdaterStore((s) => s.status);
  const updateInfo = useUpdaterStore((s) => s.updateInfo);
  const progress = useUpdaterStore((s) => s.progress);
  const error = useUpdaterStore((s) => s.error);
  const lastChecked = useUpdaterStore((s) => s.lastChecked);
  const isInitialized = useUpdaterStore((s) => s.isInitialized);

  const setChecking = useUpdaterStore((s) => s.setChecking);
  const setAvailable = useUpdaterStore((s) => s.setAvailable);
  const setNotAvailable = useUpdaterStore((s) => s.setNotAvailable);
  const setDownloading = useUpdaterStore((s) => s.setDownloading);
  const setProgress = useUpdaterStore((s) => s.setProgress);
  const setDownloaded = useUpdaterStore((s) => s.setDownloaded);
  const setError = useUpdaterStore((s) => s.setError);
  const reset = useUpdaterStore((s) => s.reset);
  const setInitialized = useUpdaterStore((s) => s.setInitialized);

  const electronAPI = getElectronAPI();
  const isElectron = electronAPI !== null;
  const isAvailable = isElectron && electronAPI?.updater !== undefined;

  // Subscribe to updater events
  useEffect(() => {
    if (!enabled || !isAvailable || isInitialized) {
      return;
    }

    const api = electronAPI!.updater;
    const cleanups: Array<() => void> = [];

    // Subscribe to all events
    cleanups.push(
      api.onChecking(() => {
        setChecking();
      })
    );

    cleanups.push(
      api.onAvailable((info) => {
        setAvailable(info);
      })
    );

    cleanups.push(
      api.onNotAvailable(() => {
        setNotAvailable();
      })
    );

    cleanups.push(
      api.onProgress((prog) => {
        if (status === 'downloading') {
          setProgress(prog);
        } else {
          setDownloading(prog);
        }
      })
    );

    cleanups.push(
      api.onDownloaded((info) => {
        setDownloaded(info);
      })
    );

    cleanups.push(
      api.onError((err) => {
        setError(err);
      })
    );

    setInitialized();

    // Cleanup on unmount
    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [
    enabled,
    isAvailable,
    isInitialized,
    setChecking,
    setAvailable,
    setNotAvailable,
    setDownloading,
    setProgress,
    setDownloaded,
    setError,
    setInitialized,
    status,
    electronAPI,
  ]);

  // Manual check for updates
  const checkForUpdates = useCallback(async () => {
    if (!isAvailable) {
      console.warn('[useAutoUpdater] Updater not available');
      return;
    }

    setChecking();
    const result = await electronAPI!.updater.checkForUpdates();

    if (!result.success && result.error) {
      setError({ message: result.error });
    }
  }, [isAvailable, setChecking, setError, electronAPI]);

  // Download update
  const downloadUpdate = useCallback(async () => {
    if (!isAvailable) {
      console.warn('[useAutoUpdater] Updater not available');
      return;
    }

    setDownloading({ percent: 0, bytesPerSecond: 0, transferred: 0, total: 0 });
    const result = await electronAPI!.updater.downloadUpdate();

    if (!result.success && result.error) {
      setError({ message: result.error });
    }
  }, [isAvailable, setDownloading, setError, electronAPI]);

  // Install update (restarts app)
  const installUpdate = useCallback(async () => {
    if (!isAvailable) {
      console.warn('[useAutoUpdater] Updater not available');
      return;
    }

    await electronAPI!.updater.installUpdate();
    // App will restart, no need to handle response
  }, [isAvailable, electronAPI]);

  // Dismiss current state
  const dismiss = useCallback(() => {
    reset();
  }, [reset]);

  return {
    status,
    updateInfo,
    progress,
    error,
    lastChecked,
    isElectron,
    isAvailable,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    dismiss,
  };
}
