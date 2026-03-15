// SPDX-License-Identifier: MIT
/**
 * LogViewer - Real-time log viewing component
 *
 * Features:
 * - Real-time log streaming via SSE
 * - Virtual scrolling for performance
 * - Filter by level, component, search text
 * - Expandable log entries
 * - Auto-scroll with user override
 * - Export logs as JSON
 * - Statistics overview
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Button } from './Button';
import { Input } from './Input';
import type { LogEntry } from '../../types/logs';

// Log level colors
const LOG_LEVEL_COLORS: Record<string, string> = {
  ERROR: 'text-red-400',
  WARN: 'text-yellow-400',
  INFO: 'text-blue-400',
  HTTP: 'text-purple-400',
  DEBUG: 'text-gray-400',
};

const LOG_LEVEL_BG: Record<string, string> = {
  ERROR: 'bg-red-500/10 border-red-500/30',
  WARN: 'bg-yellow-500/10 border-yellow-500/30',
  INFO: 'bg-blue-500/10 border-blue-500/30',
  HTTP: 'bg-purple-500/10 border-purple-500/30',
  DEBUG: 'bg-gray-500/10 border-gray-500/30',
};

interface LogViewerProps {
  /** Initial log source */
  source?: 'frontend' | 'backend' | 'all';
  /** Enable real-time streaming */
  enableStreaming?: boolean;
  /** Max logs to keep in memory */
  maxLogs?: number;
}

// Load preferences from localStorage
const loadPreferences = () => {
  try {
    const stored = localStorage.getItem('logViewer.preferences');
    if (stored) {
      const prefs = JSON.parse(stored);
      return {
        selectedLevels: new Set<string>(prefs.selectedLevels || ['ERROR', 'WARN', 'INFO', 'HTTP', 'DEBUG']),
        selectedComponent: prefs.selectedComponent || 'all',
        autoScroll: prefs.autoScroll ?? true,
      };
    }
  } catch (err) {
    console.error('Failed to load log viewer preferences:', err);
  }
  return {
    selectedLevels: new Set<string>(['ERROR', 'WARN', 'INFO', 'HTTP', 'DEBUG']),
    selectedComponent: 'all',
    autoScroll: true,
  };
};

// Save preferences to localStorage
const savePreferences = (
  selectedLevels: Set<string>,
  selectedComponent: string,
  autoScroll: boolean
) => {
  try {
    localStorage.setItem(
      'logViewer.preferences',
      JSON.stringify({
        selectedLevels: Array.from(selectedLevels),
        selectedComponent,
        autoScroll,
      })
    );
  } catch (err) {
    console.error('Failed to save log viewer preferences:', err);
  }
};

export function LogViewer({
  source = 'all',
  enableStreaming = true,
  maxLogs = 1000,
}: LogViewerProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load initial preferences
  const initialPrefs = useMemo(() => loadPreferences(), []);

  // Filters
  const [searchText, setSearchText] = useState('');
  const [selectedLevels, setSelectedLevels] = useState<Set<string>>(initialPrefs.selectedLevels);
  const [selectedComponent, setSelectedComponent] = useState<string>(initialPrefs.selectedComponent);

  // UI state
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [autoScroll, setAutoScroll] = useState(initialPrefs.autoScroll);

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const autoScrollRef = useRef(autoScroll);

  // Update ref when autoScroll changes
  useEffect(() => {
    autoScrollRef.current = autoScroll;
  }, [autoScroll]);

  // Save preferences when they change
  useEffect(() => {
    savePreferences(selectedLevels, selectedComponent, autoScroll);
  }, [selectedLevels, selectedComponent, autoScroll]);

  // Fetch initial logs
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        source,
        limit: maxLogs.toString(),
      });

      const response = await fetch(`/api/logs?${params}`);
      if (!response.ok) throw new Error('Failed to fetch logs');

      const result = await response.json();
      if (result.success) {
        setLogs(result.data.logs);
      } else {
        throw new Error(result.error || 'Failed to fetch logs');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [source, maxLogs]);

  // Setup SSE connection for real-time logs
  useEffect(() => {
    if (!enableStreaming) return;

    const eventSource = new EventSource('/api/logs/stream');
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'connected') return;

        const entry = data as LogEntry;
        setLogs((prev) => {
          const updated = [...prev, entry];
          // Keep only maxLogs entries
          return updated.slice(-maxLogs);
        });
      } catch (err) {
        console.error('Failed to parse SSE message:', err);
      }
    };

    eventSource.onerror = () => {
      console.error('SSE connection error');
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [enableStreaming, maxLogs]);

  // Load initial logs
  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScrollRef.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs]);

  // Handle scroll to detect if user scrolled up
  const handleScroll = useCallback(() => {
    if (containerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      if (!isAtBottom && autoScrollRef.current) {
        setAutoScroll(false);
      }
    }
  }, []);

  // Toggle log level filter
  const toggleLevel = useCallback((level: string) => {
    setSelectedLevels((prev) => {
      const updated = new Set(prev);
      if (updated.has(level)) {
        updated.delete(level);
      } else {
        updated.add(level);
      }
      return updated;
    });
  }, []);

  // Toggle all levels
  const toggleAllLevels = useCallback(() => {
    if (selectedLevels.size === 5) {
      setSelectedLevels(new Set());
    } else {
      setSelectedLevels(new Set(['ERROR', 'WARN', 'INFO', 'HTTP', 'DEBUG']));
    }
  }, [selectedLevels]);

  // Get unique components
  const components = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((log) => set.add(log.component));
    return ['all', ...Array.from(set).sort()];
  }, [logs]);

  // Filter logs
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // Filter by level
      if (!selectedLevels.has(log.level)) return false;

      // Filter by component
      if (selectedComponent !== 'all' && log.component !== selectedComponent) return false;

      // Filter by search text
      if (searchText) {
        const search = searchText.toLowerCase();
        return (
          log.message.toLowerCase().includes(search) ||
          log.component.toLowerCase().includes(search) ||
          JSON.stringify(log.data || {}).toLowerCase().includes(search)
        );
      }

      return true;
    });
  }, [logs, selectedLevels, selectedComponent, searchText]);

  // Toggle log expansion
  const toggleExpanded = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const updated = new Set(prev);
      if (updated.has(id)) {
        updated.delete(id);
      } else {
        updated.add(id);
      }
      return updated;
    });
  }, []);

  // Clear logs
  const handleClear = useCallback(async () => {
    if (!confirm('Clear all logs? This cannot be undone.')) return;

    try {
      const response = await fetch('/api/logs', { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to clear logs');

      setLogs([]);
      setExpandedIds(new Set());
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to clear logs');
    }
  }, []);

  // Export logs
  const handleExport = useCallback(() => {
    const dataStr = JSON.stringify(filteredLogs, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `logs-${new Date().toISOString()}.json`;
    link.click();

    URL.revokeObjectURL(url);
  }, [filteredLogs]);

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
      setAutoScroll(true);
    }
  }, []);

  // Format timestamp
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { hour12: false });
  };

  return (
    <div className="flex flex-col h-full bg-surface-900">
      {/* Toolbar */}
      <div className="flex flex-col gap-2 p-2 bg-surface-800 border-b border-surface-700">
        {/* Top row - Search and buttons */}
        <div className="flex items-center gap-2">
          <Input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search logs..."
            className="flex-1 text-xs"
          />

          <Button onClick={fetchLogs} size="sm" disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </Button>

          <Button onClick={handleClear} size="sm" variant="secondary">
            Clear
          </Button>

          <Button onClick={handleExport} size="sm" variant="secondary" disabled={filteredLogs.length === 0}>
            Export
          </Button>

          {!autoScroll && (
            <Button onClick={scrollToBottom} size="sm" variant="primary">
              Scroll to Bottom
            </Button>
          )}
        </div>

        {/* Bottom row - Filters */}
        <div className="flex items-center gap-4 text-xs">
          {/* Level filters */}
          <div className="flex items-center gap-2">
            <span className="text-surface-400 font-medium">Level:</span>
            <button
              onClick={toggleAllLevels}
              className="text-xs text-surface-300 hover:text-white transition-colors"
            >
              {selectedLevels.size === 5 ? 'None' : 'All'}
            </button>
            {['ERROR', 'WARN', 'INFO', 'HTTP', 'DEBUG'].map((level) => (
              <label key={level} className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedLevels.has(level)}
                  onChange={() => toggleLevel(level)}
                  className="w-3 h-3 rounded border-surface-600 bg-surface-700 checked:bg-primary-500"
                />
                <span className={`text-xs ${LOG_LEVEL_COLORS[level]}`}>
                  {level}
                </span>
              </label>
            ))}
          </div>

          {/* Component filter */}
          <div className="flex items-center gap-2">
            <span className="text-surface-400 font-medium">Component:</span>
            <select
              value={selectedComponent}
              onChange={(e) => setSelectedComponent(e.target.value)}
              className="px-2 py-1 text-xs bg-surface-700 border border-surface-600 rounded text-surface-200 focus:outline-none focus:border-primary-500"
            >
              {components.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Stats */}
          <div className="ml-auto flex items-center gap-3 text-surface-400">
            <span>
              Showing: <span className="text-white font-medium">{filteredLogs.length}</span>
            </span>
            <span>
              Total: <span className="text-white font-medium">{logs.length}</span>
            </span>
            {enableStreaming && (
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                Live
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Log entries */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-auto p-2 space-y-1 font-mono text-xs"
      >
        {error && (
          <div className="p-2 bg-red-500/10 border border-red-500/30 rounded text-red-400">
            Error: {error}
          </div>
        )}

        {loading && logs.length === 0 && (
          <div className="text-surface-400 text-center py-8">Loading logs...</div>
        )}

        {!loading && filteredLogs.length === 0 && (
          <div className="text-surface-400 text-center py-8">
            No logs to display. Try adjusting your filters.
          </div>
        )}

        {filteredLogs.map((log, index) => {
          const logId = `${log.timestamp}-${index}`;
          const isExpanded = expandedIds.has(logId);
          const hasData = log.data !== undefined &&
            typeof log.data === 'object' &&
            log.data !== null &&
            Object.keys(log.data as Record<string, unknown>).length > 0;

          return (
            <div
              key={logId}
              className={`
                border border-surface-700 rounded p-1.5 hover:bg-surface-800/50 transition-colors
                ${LOG_LEVEL_BG[log.level] || ''}
              `}
            >
              {/* Main log row */}
              <button
                onClick={() => hasData && toggleExpanded(logId)}
                className="w-full text-left flex items-start gap-2"
              >
                {/* Expand icon */}
                {hasData && (
                  <span className="text-surface-500 mt-0.5">
                    {isExpanded ? '▼' : '▶'}
                  </span>
                )}

                {/* Timestamp */}
                <span className="text-surface-500 w-20 flex-shrink-0">
                  {formatTime(log.timestamp)}
                </span>

                {/* Level */}
                <span className={`w-12 flex-shrink-0 font-semibold ${LOG_LEVEL_COLORS[log.level]}`}>
                  {log.level}
                </span>

                {/* Component */}
                <span className="text-surface-300 w-32 flex-shrink-0 truncate">
                  {log.component}
                </span>

                {/* Message */}
                <span className="text-surface-100 flex-1 break-all">
                  {log.message}
                </span>
              </button>

              {/* Expanded data */}
              {isExpanded && hasData && (
                <div className="mt-2 pl-8 text-surface-300">
                  <pre className="whitespace-pre-wrap break-all text-xs">
                    {typeof log.data === 'object' ? JSON.stringify(log.data, null, 2) : String(log.data)}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
