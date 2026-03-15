// SPDX-License-Identifier: MIT
/**
 * CommitItem component for GitPanel history section
 */

import { getStatusBadgeClass, type CommitDetails } from '../../../types/git';

// Helper function for time ago
function getTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return date.toLocaleDateString();
}

interface CommitItemProps {
  commit: { hash: string; shortHash: string; subject: string; body?: string; author: string; date: string };
  index: number;
  expanded: boolean;
  loading: boolean;
  details?: CommitDetails;
  onToggle: () => void;
}

export function CommitItem({ commit, index, expanded, loading, details, onToggle }: CommitItemProps) {
  const timeAgo = getTimeAgo(commit.date);
  const isEven = index % 2 === 0;

  return (
    <div className={`${isEven ? 'bg-surface-600/40' : ''} transition-colors`}>
      {/* Commit header - clickable */}
      <button
        onClick={onToggle}
        className="w-full px-2 py-2 hover:bg-surface-500/40 transition-colors text-left flex items-start gap-2"
      >
        <svg
          className={`w-3 h-3 mt-1 text-surface-500 transition-transform flex-shrink-0 ${expanded ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono px-1.5 py-0.5 rounded bg-amber-500 text-surface-900 font-semibold">
              {commit.shortHash}
            </span>
            <span className="text-xs text-surface-300">{timeAgo}</span>
            {loading && (
              <svg className="w-3 h-3 text-surface-400 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
          </div>
          <p className={`text-sm text-surface-100 mt-1 ${expanded ? '' : 'truncate'}`}>
            {commit.subject}
          </p>
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="px-2 pb-2 pl-7 space-y-2">
          {/* Full commit body if available */}
          {(details?.commit.body || commit.body) && (
            <div className="text-xs text-surface-300 whitespace-pre-wrap bg-surface-900/50 rounded p-2">
              {details?.commit.body || commit.body}
            </div>
          )}

          {/* Author info */}
          <div className="text-xs text-surface-400">
            by <span className="text-surface-200">{commit.author}</span>
          </div>

          {/* Files changed */}
          {details?.files && details.files.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-surface-400 font-medium">
                {details.files.length} file{details.files.length > 1 ? 's' : ''} changed
              </p>
              <div className="bg-surface-900/50 rounded p-1.5 max-h-32 overflow-y-auto">
                {details.files.map((file) => (
                  <div
                    key={file.path}
                    className="flex items-center gap-2 px-1 py-0.5 text-xs"
                  >
                    <span className={`font-mono ${getStatusBadgeClass(file.status as 'M' | 'A' | 'D' | 'R' | 'C' | 'U' | '?')} px-1 rounded`}>
                      {file.status}
                    </span>
                    <span className="text-surface-200 truncate" title={file.path}>
                      {file.path}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Loading placeholder for files */}
          {loading && !details && (
            <div className="text-xs text-surface-400 italic">Loading files...</div>
          )}
        </div>
      )}
    </div>
  );
}
