// SPDX-License-Identifier: MIT
/**
 * Log Watcher
 * Real-time log monitoring with alerting
 */

import { watch } from 'fs';
import { open, stat, FileHandle } from 'fs/promises';
import { getParser, detectFormat } from '../parsers/index.js';
import type {
  WatchLogsInput,
  WatchLogsResult,
  WatchAlert,
  LogEntry,
  LogLevel,
  LogFormat,
} from '../types.js';

// Active watchers map (for cleanup)
const activeWatchers = new Map<string, LogWatcher>();

/**
 * Log watcher class for monitoring a single file
 */
class LogWatcher {
  private filePath: string;
  private format: LogFormat;
  private filter?: RegExp;
  private levels?: LogLevel[];
  private alertPatterns: RegExp[];
  private alertLevels: LogLevel[];
  private pollInterval: number;
  private maxEntries: number;

  private fileHandle: FileHandle | null = null;
  private lastPosition: number = 0;
  private entries: LogEntry[] = [];
  private alerts: WatchAlert[] = [];
  private entriesProcessed: number = 0;
  private alertsTriggered: number = 0;
  private levelCounts: Record<LogLevel, number> = {
    TRACE: 0,
    DEBUG: 0,
    INFO: 0,
    WARN: 0,
    ERROR: 0,
    FATAL: 0,
  };
  private errorTimestamps: number[] = [];
  private isWatching: boolean = false;
  private pollTimer: NodeJS.Timeout | null = null;

  constructor(input: WatchLogsInput) {
    this.filePath = input.filePath;
    this.format = input.format || 'auto';
    this.filter = input.filter ? new RegExp(input.filter, 'i') : undefined;
    this.levels = input.levels;
    this.alertPatterns = (input.alertPatterns || []).map(p => new RegExp(p, 'i'));
    this.alertLevels = input.alertLevels || ['ERROR', 'FATAL'];
    this.pollInterval = input.pollInterval || 1000;
    this.maxEntries = input.maxEntries || 1000;
  }

  /**
   * Start watching the log file
   */
  async start(): Promise<void> {
    if (this.isWatching) return;

    // Detect format if needed
    if (this.format === 'auto') {
      this.format = await detectFormat(this.filePath);
    }

    // Open file and seek to end
    this.fileHandle = await open(this.filePath, 'r');
    const stats = await stat(this.filePath);
    this.lastPosition = stats.size;

    this.isWatching = true;

    // Start polling for changes
    this.poll();
  }

  /**
   * Stop watching
   */
  async stop(): Promise<void> {
    this.isWatching = false;

    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }

    if (this.fileHandle) {
      await this.fileHandle.close();
      this.fileHandle = null;
    }
  }

  /**
   * Poll for new content
   */
  private async poll(): Promise<void> {
    if (!this.isWatching || !this.fileHandle) return;

    try {
      const stats = await stat(this.filePath);
      const currentSize = stats.size;

      // File was truncated (log rotation)
      if (currentSize < this.lastPosition) {
        this.lastPosition = 0;
      }

      // New content available
      if (currentSize > this.lastPosition) {
        const bytesToRead = currentSize - this.lastPosition;
        const buffer = Buffer.alloc(bytesToRead);
        await this.fileHandle.read(buffer, 0, bytesToRead, this.lastPosition);

        const newContent = buffer.toString('utf-8');
        await this.processNewContent(newContent);

        this.lastPosition = currentSize;
      }
    } catch (error) {
      // File might have been rotated or deleted
      console.error(`Error polling ${this.filePath}:`, error);
    }

    // Schedule next poll
    if (this.isWatching) {
      this.pollTimer = setTimeout(() => this.poll(), this.pollInterval);
    }
  }

  /**
   * Process new content from the log file
   */
  private async processNewContent(content: string): Promise<void> {
    const lines = content.split('\n').filter(l => l.trim());
    const parser = getParser(this.format);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const entry = parser.parseLine(line, this.entriesProcessed + i + 1);

      if (!entry) continue;

      // Apply filters
      if (this.levels && !this.levels.includes(entry.level)) continue;
      if (this.filter && !this.filter.test(entry.message) && !this.filter.test(entry.raw)) continue;

      this.entriesProcessed++;
      this.levelCounts[entry.level]++;

      // Track error timestamps for rate calculation
      if (entry.level === 'ERROR' || entry.level === 'FATAL') {
        this.errorTimestamps.push(Date.now());
        // Keep only last 60 seconds of timestamps
        const oneMinuteAgo = Date.now() - 60000;
        this.errorTimestamps = this.errorTimestamps.filter(t => t > oneMinuteAgo);
      }

      // Store entry
      this.entries.push(entry);
      if (this.entries.length > this.maxEntries) {
        this.entries.shift();
      }

      // Check for alerts
      this.checkAlerts(entry);
    }
  }

  /**
   * Check if entry triggers any alerts
   */
  private checkAlerts(entry: LogEntry): void {
    // Level-based alerts
    if (this.alertLevels.includes(entry.level)) {
      this.addAlert({
        timestamp: new Date(),
        type: 'level',
        message: `${entry.level}: ${entry.message.substring(0, 100)}`,
        entry,
      });
    }

    // Pattern-based alerts
    for (const pattern of this.alertPatterns) {
      if (pattern.test(entry.message) || pattern.test(entry.raw)) {
        this.addAlert({
          timestamp: new Date(),
          type: 'pattern',
          message: `Pattern matched: ${pattern.source}`,
          entry,
          pattern: pattern.source,
        });
        break; // Only one pattern alert per entry
      }
    }
  }

  /**
   * Add an alert
   */
  private addAlert(alert: WatchAlert): void {
    this.alertsTriggered++;
    this.alerts.push(alert);

    // Keep only last 100 alerts
    if (this.alerts.length > 100) {
      this.alerts.shift();
    }
  }

  /**
   * Get current status
   */
  getStatus(): WatchLogsResult {
    const oneMinuteAgo = Date.now() - 60000;
    const recentErrors = this.errorTimestamps.filter(t => t > oneMinuteAgo).length;

    return {
      filePath: this.filePath,
      status: this.isWatching ? 'watching' : 'stopped',
      entriesProcessed: this.entriesProcessed,
      alertsTriggered: this.alertsTriggered,
      recentEntries: this.entries.slice(-50), // Last 50 entries
      recentAlerts: this.alerts.slice(-20),   // Last 20 alerts
      stats: {
        byLevel: { ...this.levelCounts },
        errorsPerMinute: recentErrors,
        lastEntry: this.entries.length > 0 ? this.entries[this.entries.length - 1].timestamp : undefined,
      },
    };
  }
}

/**
 * Start watching a log file
 */
export async function watchLogs(input: WatchLogsInput): Promise<WatchLogsResult> {
  const { filePath } = input;

  // Stop existing watcher if any
  if (activeWatchers.has(filePath)) {
    await activeWatchers.get(filePath)!.stop();
  }

  // Create and start new watcher
  const watcher = new LogWatcher(input);
  await watcher.start();
  activeWatchers.set(filePath, watcher);

  // Return initial status
  return watcher.getStatus();
}

/**
 * Get status of a watched log file
 */
export async function getWatchStatus(filePath: string): Promise<WatchLogsResult | null> {
  const watcher = activeWatchers.get(filePath);
  if (!watcher) return null;
  return watcher.getStatus();
}

/**
 * Stop watching a log file
 */
export async function stopWatching(filePath: string): Promise<boolean> {
  const watcher = activeWatchers.get(filePath);
  if (!watcher) return false;

  await watcher.stop();
  activeWatchers.delete(filePath);
  return true;
}

/**
 * List all active watchers
 */
export function listActiveWatchers(): string[] {
  return Array.from(activeWatchers.keys());
}

/**
 * Stop all watchers (cleanup)
 */
export async function stopAllWatchers(): Promise<void> {
  for (const watcher of activeWatchers.values()) {
    await watcher.stop();
  }
  activeWatchers.clear();
}

// Cleanup on process exit
process.on('SIGINT', async () => {
  await stopAllWatchers();
});

process.on('SIGTERM', async () => {
  await stopAllWatchers();
});
