// SPDX-License-Identifier: MIT
/**
 * Upgrade History List Component
 *
 * Displays the history of upgrades applied to a project.
 */

import { Badge } from '../common';
import type { UpgradeHistoryEntry } from '@/types';

export interface UpgradeHistoryListProps {
  history: UpgradeHistoryEntry[];
  isLoading?: boolean;
}

export function UpgradeHistoryList({ history, isLoading }: UpgradeHistoryListProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (history.length === 0) {
    return (
      <div className="text-center py-12">
        <svg
          className="w-12 h-12 mx-auto text-surface-600 mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <h3 className="text-lg font-medium text-surface-300 mb-2">No Upgrade History</h3>
        <p className="text-sm text-surface-400">
          Applied upgrades will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {history
        .slice()
        .reverse()
        .map((entry, index) => (
          <HistoryEntry key={entry.timestamp || index} entry={entry} />
        ))}
    </div>
  );
}

interface HistoryEntryProps {
  entry: UpgradeHistoryEntry;
}

function HistoryEntry({ entry }: HistoryEntryProps) {
  const date = new Date(entry.timestamp);
  const formattedDate = date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const formattedTime = date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="p-4 rounded-lg border border-surface-700 bg-surface-800/50">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary-500/10 flex items-center justify-center">
            <svg
              className="w-4 h-4 text-primary-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-white">
              Upgrade: v{entry.fromVersion} → v{entry.toVersion}
            </p>
            <p className="text-xs text-surface-400">
              {formattedDate} at {formattedTime}
            </p>
          </div>
        </div>
      </div>

      {/* Applied features */}
      {entry.featuresApplied.length > 0 && (
        <div className="mb-2">
          <p className="text-xs text-surface-400 mb-1">Applied:</p>
          <div className="flex flex-wrap gap-1">
            {entry.featuresApplied.map((feature) => (
              <Badge key={feature} variant="success" className="text-xs">
                {feature}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Skipped features */}
      {entry.featuresSkipped.length > 0 && (
        <div className="mb-2">
          <p className="text-xs text-surface-400 mb-1">Skipped:</p>
          <div className="flex flex-wrap gap-1">
            {entry.featuresSkipped.map((feature) => (
              <Badge key={feature} variant="default" className="text-xs">
                {feature}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Backup info */}
      {entry.backupDir && (
        <p className="text-xs text-surface-500 mt-2">
          Backup: <code className="text-surface-400">{entry.backupDir}</code>
        </p>
      )}
    </div>
  );
}
