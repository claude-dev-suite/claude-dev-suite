// SPDX-License-Identifier: MIT
import { useState, useEffect, useCallback } from 'react';
import { Button } from '../common';
import type { QueueStatusPayload } from '@/types';

export interface JobQueuePanelProps {
  connected: boolean;
  queueStatus: QueueStatusPayload | null;
  onGetQueueStatus: () => void;
  onClearQueue: () => void;
  onRemoveFromQueue: (jobId: string) => void;
  onForceUnstick: () => void;
}

export function JobQueuePanel({
  connected,
  queueStatus,
  onGetQueueStatus,
  onClearQueue,
  onRemoveFromQueue,
  onForceUnstick,
}: JobQueuePanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Refresh queue status
  const refreshStatus = useCallback(() => {
    if (connected) {
      onGetQueueStatus();
      setLastUpdated(new Date());
    }
  }, [connected, onGetQueueStatus]);

  // Auto-refresh when expanded (reduced to 30s fallback since server pushes updates automatically)
  useEffect(() => {
    if (isExpanded && connected) {
      refreshStatus(); // Initial fetch when expanded
      // Polling reduced to 30s as fallback - server now pushes queue_status on every change
      const interval = setInterval(refreshStatus, 30000);
      return () => clearInterval(interval);
    }
  }, [isExpanded, connected, refreshStatus]);

  // Update lastUpdated when queueStatus changes
  useEffect(() => {
    if (queueStatus) {
      setLastUpdated(new Date());
    }
  }, [queueStatus]);

  const hasCurrentJob = queueStatus?.currentJob != null;
  const queueLength = queueStatus?.queueLength ?? 0;
  const totalJobs = (hasCurrentJob ? 1 : 0) + queueLength;

  return (
    <div className="bg-surface-800 border border-surface-700 rounded-lg mb-4">
      {/* Header - Always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface-700/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-lg">
            {hasCurrentJob ? '🔄' : queueLength > 0 ? '📋' : '✅'}
          </span>
          <span className="text-sm font-medium text-surface-200">
            Job Queue
          </span>
          {totalJobs > 0 && (
            <span className="px-2 py-0.5 bg-primary-500/20 text-primary-400 text-xs rounded-full">
              {totalJobs} job{totalJobs !== 1 ? 's' : ''}
            </span>
          )}
          {hasCurrentJob && (
            <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded-full animate-pulse">
              Running
            </span>
          )}
        </div>
        <span className="text-surface-400 text-sm">
          {isExpanded ? '▼' : '▶'}
        </span>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-surface-700">
          {/* Actions */}
          <div className="flex gap-2 mt-3 mb-4">
            <Button
              variant="secondary"
              size="sm"
              onClick={refreshStatus}
              disabled={!connected}
            >
              Refresh
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={onClearQueue}
              disabled={!connected || queueLength === 0}
            >
              Clear Queue ({queueLength})
            </Button>
            <Button
              variant="danger"
              size="sm"
              onClick={() => {
                if (confirm('Force unstick will abort the current job and clear the queue lock. Continue?')) {
                  onForceUnstick();
                }
              }}
              disabled={!connected || !hasCurrentJob}
            >
              Force Unstick
            </Button>
          </div>

          {/* Last Updated */}
          {lastUpdated && (
            <div className="text-xs text-surface-500 mb-3">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </div>
          )}

          {/* Current Job */}
          {queueStatus?.currentJob && (
            <div className="mb-4">
              <h4 className="text-xs uppercase text-surface-400 mb-2">Currently Running</h4>
              <div className="bg-surface-900 border border-yellow-500/30 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-yellow-400">
                      {queueStatus.currentJob.title}
                    </div>
                    <div className="text-xs text-surface-500 mt-1">
                      ID: {queueStatus.currentJob.id.substring(0, 8)}...
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
                    <span className="text-xs text-yellow-400">
                      {queueStatus.currentJob.status}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Queued Jobs */}
          {queueStatus?.queuedJobs && queueStatus.queuedJobs.length > 0 && (
            <div>
              <h4 className="text-xs uppercase text-surface-400 mb-2">
                Queued ({queueStatus.queuedJobs.length})
              </h4>
              <div className="space-y-2">
                {queueStatus.queuedJobs.map((job, index) => (
                  <div
                    key={job.id}
                    className="bg-surface-900 border border-surface-600 rounded-lg p-3 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-surface-500 text-sm w-6">
                        #{index + 1}
                      </span>
                      <div>
                        <div className="text-sm text-surface-200">
                          {job.title}
                        </div>
                        <div className="text-xs text-surface-500">
                          {new Date(job.createdAt).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => onRemoveFromQueue(job.id)}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {!hasCurrentJob && queueLength === 0 && (
            <div className="text-center py-6 text-surface-500">
              <div className="text-2xl mb-2">✅</div>
              <div className="text-sm">Queue is empty</div>
              <div className="text-xs mt-1">No jobs running or waiting</div>
            </div>
          )}

          {/* Debug Info */}
          <details className="mt-4">
            <summary className="text-xs text-surface-500 cursor-pointer hover:text-surface-400">
              Debug Info
            </summary>
            <pre className="mt-2 p-2 bg-surface-900 rounded text-xs text-surface-400 overflow-x-auto">
              {JSON.stringify(queueStatus, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}
