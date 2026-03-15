// SPDX-License-Identifier: MIT
/**
 * Updater Store - Manages auto-update state
 *
 * This store handles the state for the auto-updater:
 * - Update status (idle, checking, available, downloading, downloaded, error)
 * - Update information (version, release notes)
 * - Download progress
 * - Error state
 *
 * @example
 * ```tsx
 * const { status, updateInfo, progress, checkForUpdates } = useUpdaterStore();
 * ```
 */

import { create, type StateCreator } from 'zustand';
import { devtools } from 'zustand/middleware';
import type {
  UpdaterStatus,
  UpdateInfo,
  DownloadProgress,
  UpdateError,
} from '@/types';

interface UpdaterState {
  // ============================================
  // STATE
  // ============================================

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

  /** Whether the updater is initialized */
  isInitialized: boolean;

  // ============================================
  // ACTIONS
  // ============================================

  /** Set status to checking */
  setChecking: () => void;

  /** Set update available with info */
  setAvailable: (info: UpdateInfo) => void;

  /** Set no update available */
  setNotAvailable: () => void;

  /** Set downloading with progress */
  setDownloading: (progress: DownloadProgress) => void;

  /** Set update progress */
  setProgress: (progress: DownloadProgress) => void;

  /** Set update downloaded */
  setDownloaded: (info: UpdateInfo) => void;

  /** Set error state */
  setError: (error: UpdateError) => void;

  /** Clear error and reset to idle */
  clearError: () => void;

  /** Reset to idle state */
  reset: () => void;

  /** Mark as initialized */
  setInitialized: () => void;
}

const initialState = {
  status: 'idle' as UpdaterStatus,
  updateInfo: null as UpdateInfo | null,
  progress: null as DownloadProgress | null,
  error: null as UpdateError | null,
  lastChecked: null as Date | null,
  isInitialized: false,
};

/**
 * Updater state management store
 */
const storeCreator: StateCreator<UpdaterState, [['zustand/devtools', never]], []> = (set) => ({
  ...initialState,

  // ============================================
  // STATUS TRANSITIONS
  // ============================================

  setChecking: () =>
    set(
      {
        status: 'checking',
        error: null,
      },
      false,
      'setChecking'
    ),

  setAvailable: (info) =>
    set(
      {
        status: 'available',
        updateInfo: info,
        lastChecked: new Date(),
        error: null,
      },
      false,
      'setAvailable'
    ),

  setNotAvailable: () =>
    set(
      {
        status: 'idle',
        updateInfo: null,
        lastChecked: new Date(),
        error: null,
      },
      false,
      'setNotAvailable'
    ),

  setDownloading: (progress) =>
    set(
      {
        status: 'downloading',
        progress,
        error: null,
      },
      false,
      'setDownloading'
    ),

  setProgress: (progress) =>
    set(
      {
        progress,
      },
      false,
      'setProgress'
    ),

  setDownloaded: (info) =>
    set(
      {
        status: 'downloaded',
        updateInfo: info,
        progress: null,
        error: null,
      },
      false,
      'setDownloaded'
    ),

  setError: (error) =>
    set(
      {
        status: 'error',
        error,
        progress: null,
      },
      false,
      'setError'
    ),

  clearError: () =>
    set(
      {
        status: 'idle',
        error: null,
      },
      false,
      'clearError'
    ),

  reset: () =>
    set(
      {
        ...initialState,
        isInitialized: true, // Keep initialized state
      },
      false,
      'reset'
    ),

  setInitialized: () =>
    set(
      {
        isInitialized: true,
      },
      false,
      'setInitialized'
    ),
});

export const useUpdaterStore = create<UpdaterState>()(
  devtools(storeCreator, { name: 'UpdaterStore' })
);
