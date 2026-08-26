// SPDX-License-Identifier: MIT
import { useState, useEffect, useCallback } from 'react';
import { useProjectStore } from '../../stores/project.store';
import { API_BASE } from '../../utils/api';

interface SessionInfo {
  id: string;
  timestamp: string;
  firstMessage: string | null;
  messageCount: number;
  size: number;
}

interface SessionPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (sessionId: string) => void;
  currentSessionId?: string | null;
}

export function SessionPicker({ isOpen, onClose, onSelect, currentSessionId }: SessionPickerProps) {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const projectPath = useProjectStore(s => s.projectPath);

  const loadSessions = useCallback(async () => {
    if (!projectPath) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_BASE}/api/orchestrator/sessions?project_path=${encodeURIComponent(projectPath)}`
      );
      const data = await response.json();

      if (data.success) {
        setSessions(data.sessions || []);
      } else {
        setError(data.error || 'Failed to load sessions');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, [projectPath]);

  useEffect(() => {
    if (isOpen && projectPath) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- loader toggles loading state; intentional fetch when opened
      loadSessions();
    }
  }, [isOpen, projectPath, loadSessions]);

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-surface-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-surface-700">
          <h2 className="text-lg font-semibold text-surface-100">Resume Session</h2>
          <button
            onClick={onClose}
            className="text-surface-400 hover:text-surface-200 p-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <svg className="w-6 h-6 animate-spin text-accent-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="ml-2 text-surface-400">Loading sessions...</span>
            </div>
          )}

          {error && (
            <div className="bg-red-900/20 border border-red-500/30 rounded p-3 text-red-400">
              {error}
            </div>
          )}

          {!loading && !error && sessions.filter(s => s.id !== currentSessionId).length === 0 && (
            <div className="text-center py-8 text-surface-400">
              No previous sessions found for this project.
            </div>
          )}

          {!loading && !error && sessions.filter(s => s.id !== currentSessionId).length > 0 && (
            <div className="space-y-2">
              {sessions.filter(s => s.id !== currentSessionId).map(session => (
                <button
                  key={session.id}
                  onClick={() => onSelect(session.id)}
                  className="w-full text-left p-3 rounded-lg bg-surface-700/50 hover:bg-surface-700
                           border border-surface-600 hover:border-accent-500/50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="text-surface-200 font-medium truncate">
                        {session.firstMessage || 'No message preview'}
                      </div>
                      <div className="text-xs text-surface-500 mt-1 flex items-center gap-3">
                        <span>{formatTimestamp(session.timestamp)}</span>
                        <span>{session.messageCount} messages</span>
                        <span>{formatSize(session.size)}</span>
                      </div>
                    </div>
                    <div className="text-surface-500 ml-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-surface-700 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-surface-300 hover:text-surface-100 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
