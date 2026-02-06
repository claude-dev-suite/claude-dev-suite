// SPDX-License-Identifier: MIT
/**
 * UpdateNotification Component
 *
 * Displays auto-update notifications in the header.
 * Shows different UI states:
 * - Badge when update is available
 * - Progress bar during download
 * - "Ready to Install" when downloaded
 * - Error state with retry option
 */

import { useState } from 'react';
import clsx from 'clsx';
import { useAutoUpdater } from '@/hooks';
import { Modal } from './Modal';
import { Button } from './Button';
import { Spinner } from './Spinner';

interface UpdateNotificationProps {
  /** Additional CSS classes */
  className?: string;
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Format speed to human-readable string
 */
function formatSpeed(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`;
}

/**
 * Parse release notes to string
 */
function parseReleaseNotes(notes: string | Array<{ version: string; note: string }> | undefined): string {
  if (!notes) return '';
  if (typeof notes === 'string') return notes;
  return notes.map((n) => `## ${n.version}\n${n.note}`).join('\n\n');
}

export function UpdateNotification({ className }: UpdateNotificationProps) {
  const {
    status,
    updateInfo,
    progress,
    error,
    isAvailable,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
    dismiss,
  } = useAutoUpdater();

  const [showModal, setShowModal] = useState(false);

  // Don't render if updater is not available or idle with no update
  if (!isAvailable || status === 'idle') {
    return null;
  }

  // Render checking spinner
  if (status === 'checking') {
    return (
      <div className={clsx('flex items-center gap-2', className)}>
        <Spinner size="sm" />
        <span className="text-xs text-surface-400">Checking...</span>
      </div>
    );
  }

  // Render error state
  if (status === 'error') {
    return (
      <button
        onClick={() => {
          dismiss();
          checkForUpdates();
        }}
        className={clsx(
          'flex items-center gap-2 px-3 py-1.5 rounded-full',
          'bg-red-500/10 border border-red-500/30',
          'hover:bg-red-500/20 transition-colors',
          className
        )}
        title={error?.message || 'Update check failed'}
      >
        <svg
          className="w-4 h-4 text-red-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
        <span className="text-xs text-red-400 font-medium">Retry</span>
      </button>
    );
  }

  // Render downloading state with progress
  if (status === 'downloading' && progress) {
    const percent = Math.round(progress.percent);
    return (
      <div className={clsx('flex items-center gap-3', className)}>
        <div className="flex flex-col gap-1 min-w-[120px]">
          <div className="flex items-center justify-between text-xs">
            <span className="text-surface-400">Downloading...</span>
            <span className="text-primary-400 font-medium">{percent}%</span>
          </div>
          <div className="h-1.5 bg-surface-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-500 rounded-full transition-all duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="text-[10px] text-surface-500">
            {formatBytes(progress.transferred)} / {formatBytes(progress.total)} ({formatSpeed(progress.bytesPerSecond)})
          </span>
        </div>
      </div>
    );
  }

  // Render downloaded state
  if (status === 'downloaded') {
    return (
      <button
        onClick={() => installUpdate()}
        className={clsx(
          'flex items-center gap-2 px-3 py-1.5 rounded-full',
          'bg-green-500/10 border border-green-500/30',
          'hover:bg-green-500/20 transition-colors',
          'animate-pulse',
          className
        )}
        title="Click to restart and install"
      >
        <svg
          className="w-4 h-4 text-green-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
          />
        </svg>
        <span className="text-xs text-green-400 font-medium">
          Restart to Install v{updateInfo?.version}
        </span>
      </button>
    );
  }

  // Render available state (update ready to download)
  if (status === 'available' && updateInfo) {
    return (
      <>
        <button
          onClick={() => setShowModal(true)}
          className={clsx(
            'flex items-center gap-2 px-3 py-1.5 rounded-full',
            'bg-primary-500/10 border border-primary-500/30',
            'hover:bg-primary-500/20 transition-colors',
            className
          )}
        >
          <svg
            className="w-4 h-4 text-primary-400 animate-bounce"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
            />
          </svg>
          <span className="text-xs text-primary-400 font-medium">
            Update v{updateInfo.version}
          </span>
        </button>

        {/* Update Details Modal */}
        <Modal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          title={`Update Available: v${updateInfo.version}`}
          size="md"
        >
          <div className="space-y-4">
            {/* Version Info */}
            <div className="flex items-center gap-3 p-3 bg-surface-700/50 rounded-lg">
              <div className="w-10 h-10 bg-primary-500/20 rounded-lg flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-primary-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-white font-medium">
                  {updateInfo.releaseName || `Version ${updateInfo.version}`}
                </h3>
                {updateInfo.releaseDate && (
                  <p className="text-xs text-surface-400">
                    Released: {new Date(updateInfo.releaseDate).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>

            {/* Release Notes */}
            {updateInfo.releaseNotes && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-surface-300">Release Notes</h4>
                <div className="max-h-[200px] overflow-y-auto p-3 bg-surface-800 rounded-lg">
                  <pre className="text-xs text-surface-300 whitespace-pre-wrap font-sans">
                    {parseReleaseNotes(updateInfo.releaseNotes)}
                  </pre>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="ghost"
                onClick={() => {
                  dismiss();
                  setShowModal(false);
                }}
              >
                Later
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  downloadUpdate();
                  setShowModal(false);
                }}
              >
                Download Update
              </Button>
            </div>
          </div>
        </Modal>
      </>
    );
  }

  return null;
}

export type { UpdateNotificationProps };
