// SPDX-License-Identifier: MIT
/**
 * Analytics Logger for KB Usage Tracking
 *
 * Logs all KB calls to a JSON file for analytics and dashboard visualization.
 * Supports correlation with orchestrator jobs via timestamp proximity.
 */

import fs from "fs";
import path from "path";

// Configuration
const DEFAULT_ANALYTICS_PATH = process.env.KB_ANALYTICS_PATH ||
  path.join(process.cwd(), ".dev-suite-analytics");
const ANALYTICS_FILE = "kb-usage.json";
const MAX_ENTRIES = 10000; // Rotate after this many entries

export interface KBUsageEntry {
  id: string;
  timestamp: string;
  tool: "fetch_docs" | "search_docs" | "list_topics" | "list_versions" | "list_docs";
  technology: string;
  topic?: string;
  query?: string;
  version?: string;
  source: "git_cache" | "live" | "error";
  success: boolean;
  durationMs: number;
  tokensEstimate?: number;
  error?: string;
  // Optional context for correlation
  context?: {
    jobId?: string;
    agentId?: string;
  };
}

export interface KBAnalyticsData {
  version: string;
  lastUpdated: string;
  entries: KBUsageEntry[];
}

class AnalyticsLogger {
  private analyticsPath: string;
  private filePath: string;
  private cache: KBAnalyticsData | null = null;
  private writeQueue: KBUsageEntry[] = [];
  private writeTimeout: NodeJS.Timeout | null = null;
  private initialized = false;

  constructor(analyticsPath?: string) {
    this.analyticsPath = analyticsPath || DEFAULT_ANALYTICS_PATH;
    this.filePath = path.join(this.analyticsPath, ANALYTICS_FILE);
  }

  /**
   * Initialize analytics directory and file
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      // Create directory if it doesn't exist
      if (!fs.existsSync(this.analyticsPath)) {
        fs.mkdirSync(this.analyticsPath, { recursive: true });
      }

      // Load existing data or create new file
      if (fs.existsSync(this.filePath)) {
        const content = fs.readFileSync(this.filePath, "utf-8");
        this.cache = JSON.parse(content);
      } else {
        this.cache = {
          version: "1.0.0",
          lastUpdated: new Date().toISOString(),
          entries: [],
        };
        this.saveSync();
      }

      this.initialized = true;
      console.error(`[Analytics] Initialized at ${this.analyticsPath}`);
    } catch (error) {
      console.error(`[Analytics] Init failed:`, error);
      // Continue without analytics - don't break the server
      this.initialized = true;
      this.cache = {
        version: "1.0.0",
        lastUpdated: new Date().toISOString(),
        entries: [],
      };
    }
  }

  /**
   * Generate unique ID for entry
   */
  private generateId(): string {
    return `kb-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * Log a KB usage entry
   */
  async log(entry: Omit<KBUsageEntry, "id" | "timestamp">): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }

    const fullEntry: KBUsageEntry = {
      ...entry,
      id: this.generateId(),
      timestamp: new Date().toISOString(),
    };

    this.writeQueue.push(fullEntry);
    this.scheduleWrite();
  }

  /**
   * Schedule batched write to reduce I/O
   */
  private scheduleWrite(): void {
    if (this.writeTimeout) return;

    this.writeTimeout = setTimeout(() => {
      this.flushQueue();
      this.writeTimeout = null;
    }, 100); // Batch writes every 100ms
  }

  /**
   * Flush pending writes to file
   */
  private flushQueue(): void {
    if (!this.cache || this.writeQueue.length === 0) return;

    try {
      // Add queued entries
      this.cache.entries.push(...this.writeQueue);
      this.writeQueue = [];

      // Rotate if too many entries
      if (this.cache.entries.length > MAX_ENTRIES) {
        const toRemove = this.cache.entries.length - MAX_ENTRIES;
        this.cache.entries = this.cache.entries.slice(toRemove);
      }

      this.cache.lastUpdated = new Date().toISOString();
      this.saveSync();
    } catch (error) {
      console.error(`[Analytics] Write failed:`, error);
    }
  }

  /**
   * Synchronous save to file
   */
  private saveSync(): void {
    if (!this.cache) return;
    fs.writeFileSync(this.filePath, JSON.stringify(this.cache, null, 2));
  }

  /**
   * Get all entries (for dashboard API)
   */
  async getEntries(options?: {
    limit?: number;
    offset?: number;
    technology?: string;
    since?: string;
    tool?: string;
  }): Promise<{ entries: KBUsageEntry[]; total: number }> {
    if (!this.initialized) {
      await this.init();
    }

    if (!this.cache) {
      return { entries: [], total: 0 };
    }

    let entries = [...this.cache.entries];

    // Apply filters
    if (options?.technology) {
      entries = entries.filter(e => e.technology === options.technology);
    }
    if (options?.tool) {
      entries = entries.filter(e => e.tool === options.tool);
    }
    if (options?.since) {
      const sinceDate = new Date(options.since);
      entries = entries.filter(e => new Date(e.timestamp) >= sinceDate);
    }

    const total = entries.length;

    // Sort by timestamp descending (newest first)
    entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply pagination
    if (options?.offset) {
      entries = entries.slice(options.offset);
    }
    if (options?.limit) {
      entries = entries.slice(0, options.limit);
    }

    return { entries, total };
  }

  /**
   * Get aggregated statistics
   */
  async getStats(): Promise<{
    totalCalls: number;
    byTechnology: Record<string, number>;
    byTool: Record<string, number>;
    bySource: Record<string, number>;
    successRate: number;
    avgDurationMs: number;
    last24h: number;
    last7d: number;
  }> {
    if (!this.initialized) {
      await this.init();
    }

    if (!this.cache || this.cache.entries.length === 0) {
      return {
        totalCalls: 0,
        byTechnology: {},
        byTool: {},
        bySource: {},
        successRate: 0,
        avgDurationMs: 0,
        last24h: 0,
        last7d: 0,
      };
    }

    const entries = this.cache.entries;
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    const byTechnology: Record<string, number> = {};
    const byTool: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    let successCount = 0;
    let totalDuration = 0;
    let last24h = 0;
    let last7d = 0;

    for (const entry of entries) {
      // Count by technology
      byTechnology[entry.technology] = (byTechnology[entry.technology] || 0) + 1;

      // Count by tool
      byTool[entry.tool] = (byTool[entry.tool] || 0) + 1;

      // Count by source
      bySource[entry.source] = (bySource[entry.source] || 0) + 1;

      // Success rate
      if (entry.success) successCount++;

      // Duration
      totalDuration += entry.durationMs || 0;

      // Time-based counts
      const entryTime = new Date(entry.timestamp).getTime();
      if (now - entryTime < day) last24h++;
      if (now - entryTime < 7 * day) last7d++;
    }

    return {
      totalCalls: entries.length,
      byTechnology,
      byTool,
      bySource,
      successRate: entries.length > 0 ? (successCount / entries.length) * 100 : 0,
      avgDurationMs: entries.length > 0 ? totalDuration / entries.length : 0,
      last24h,
      last7d,
    };
  }

  /**
   * Clear all analytics data
   */
  async clear(): Promise<void> {
    if (!this.cache) return;

    this.cache.entries = [];
    this.cache.lastUpdated = new Date().toISOString();
    this.saveSync();
  }
}

// Singleton instance
export const analyticsLogger = new AnalyticsLogger();

/**
 * Helper to wrap handler with analytics logging
 */
export function withAnalytics<T extends (...args: any[]) => Promise<any>>(
  tool: KBUsageEntry["tool"],
  handler: T
): T {
  return (async (...args: any[]) => {
    const startTime = Date.now();
    let success = true;
    let source: KBUsageEntry["source"] = "git_cache";
    let error: string | undefined;
    let tokensEstimate: number | undefined;

    try {
      const result = await handler(...args);

      // Try to extract info from result
      if (result?.content?.[0]?.text) {
        try {
          const data = JSON.parse(result.content[0].text);
          if (data.error) {
            success = false;
            error = data.error;
            source = "error";
          } else if (data.source) {
            source = data.source;
          }
          if (data.tokens_estimate) {
            tokensEstimate = data.tokens_estimate;
          }
        } catch {}
      }

      return result;
    } catch (e) {
      success = false;
      error = e instanceof Error ? e.message : String(e);
      source = "error";
      throw e;
    } finally {
      const durationMs = Date.now() - startTime;
      const input = args[0] || {};

      // Log the call
      analyticsLogger.log({
        tool,
        technology: input.technology || "unknown",
        topic: input.topic,
        query: input.query,
        version: input.version,
        source,
        success,
        durationMs,
        tokensEstimate,
        error,
      }).catch(console.error);
    }
  }) as T;
}
