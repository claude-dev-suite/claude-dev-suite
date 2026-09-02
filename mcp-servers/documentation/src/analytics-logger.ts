// SPDX-License-Identifier: MIT
/**
 * Analytics Logger for KB Usage Tracking
 *
 * Records every KB call so the dashboard's Analytics panel can show what was
 * fetched, how long it took, and how it correlates with orchestrator jobs.
 *
 * The previous implementation re-serialised the ENTIRE history — up to ten
 * thousand entries — and wrote it with `fs.writeFileSync` every 100ms. That is
 * synchronous I/O on the event loop this process shares with every concurrent
 * tool call, so under a burst of subagents the server stalled writing a log
 * nobody was reading yet.
 *
 * The log is now append-only NDJSON written with `fs.promises.appendFile`:
 * cost per entry is one short line regardless of history size, and nothing
 * blocks the loop. History is rotated by file size rather than entry count.
 *
 * `kb-usage.json` is still produced, throttled and written tmp+rename, because
 * the dashboard reads that file and shape. It is a projection of the NDJSON,
 * not the source of truth.
 */

import fsp from "fs/promises";
import path from "path";

// Configuration
const DEFAULT_ANALYTICS_PATH = process.env.KB_ANALYTICS_PATH ||
  path.join(process.cwd(), ".dev-suite-analytics");
/** Backward-compatible projection consumed by the dashboard. */
const ANALYTICS_FILE = "kb-usage.json";
/** Append-only source of truth. */
const NDJSON_FILE = "kb-usage.ndjson";
/** Entries kept in memory and mirrored into the JSON projection. */
const MAX_ENTRIES = 10000;
/** Rotate the NDJSON once it passes this size. */
const MAX_NDJSON_BYTES = 8 * 1024 * 1024;
/** Batching window for appends. */
const FLUSH_INTERVAL_MS = 100;
/** Minimum gap between rewrites of the JSON projection. */
const MIRROR_INTERVAL_MS = 2000;

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

export class AnalyticsLogger {
  private analyticsPath: string;
  private filePath: string;
  private ndjsonPath: string;
  /** Recent entries, for the in-process query API and the JSON projection. */
  private entries: KBUsageEntry[] = [];
  private writeQueue: KBUsageEntry[] = [];
  private writeTimeout: NodeJS.Timeout | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  /** Serialises appends so two flushes cannot interleave inside the file. */
  private flushChain: Promise<void> = Promise.resolve();
  private mirrorDirty = false;
  private mirrorPending = false;
  private lastMirrorAt = 0;
  private bytesWritten = 0;

  private readonly maxBytes: number;

  constructor(analyticsPath?: string, options: { maxBytes?: number } = {}) {
    this.analyticsPath = analyticsPath || DEFAULT_ANALYTICS_PATH;
    this.filePath = path.join(this.analyticsPath, ANALYTICS_FILE);
    this.ndjsonPath = path.join(this.analyticsPath, NDJSON_FILE);
    this.maxBytes = options.maxBytes ?? MAX_NDJSON_BYTES;
  }

  /**
   * Initialize analytics directory and load recent history.
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    // Concurrent tool calls all reach `log()` before startup finishes; they
    // must share one initialisation, not race several.
    if (!this.initPromise) this.initPromise = this.doInit();
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    try {
      await fsp.mkdir(this.analyticsPath, { recursive: true });

      const fromNdjson = await this.readNdjson();
      if (fromNdjson.length > 0) {
        this.entries = fromNdjson;
      } else {
        // First run after the format change: carry the old file's history over
        // so the dashboard does not appear to lose its history.
        this.entries = await this.readLegacyJson();
        if (this.entries.length > 0) {
          const lines = this.entries.map((e) => JSON.stringify(e)).join("\n") + "\n";
          await fsp.writeFile(this.ndjsonPath, lines, "utf-8");
          this.bytesWritten = Buffer.byteLength(lines);
        }
      }

      console.error(`[Analytics] Initialized at ${this.analyticsPath}`);
    } catch (error) {
      console.error(`[Analytics] Init failed:`, error);
      // Continue without analytics - don't break the server
      this.entries = [];
    } finally {
      this.initialized = true;
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

    this.entries.push(fullEntry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.splice(0, this.entries.length - MAX_ENTRIES);
    }

    this.writeQueue.push(fullEntry);
    this.scheduleWrite();
  }

  /**
   * Schedule batched write to reduce I/O
   */
  private scheduleWrite(): void {
    if (this.writeTimeout) return;

    this.writeTimeout = setTimeout(() => {
      this.writeTimeout = null;
      void this.flush();
    }, FLUSH_INTERVAL_MS);
    // A pending flush must never hold the process open on its own.
    this.writeTimeout.unref?.();
  }

  /**
   * Append queued entries. Chained so appends stay ordered and never overlap.
   */
  flush(): Promise<void> {
    this.flushChain = this.flushChain.then(() => this.doFlush()).catch((error) => {
      console.error(`[Analytics] Write failed:`, error);
    });
    return this.flushChain;
  }

  private async doFlush(): Promise<void> {
    if (this.writeQueue.length === 0) return;

    const batch = this.writeQueue;
    this.writeQueue = [];

    const payload = batch.map((e) => JSON.stringify(e)).join("\n") + "\n";
    await fsp.mkdir(this.analyticsPath, { recursive: true });
    await fsp.appendFile(this.ndjsonPath, payload, "utf-8");
    this.bytesWritten += Buffer.byteLength(payload);

    await this.rotateIfLarge();

    this.mirrorDirty = true;
    this.scheduleMirror();
  }

  /**
   * Rotate by size: the current log becomes `.1`, replacing any previous `.1`.
   * Two generations bound the disk cost without the cost of counting entries.
   */
  private async rotateIfLarge(): Promise<void> {
    if (this.bytesWritten < this.maxBytes) return;

    try {
      const stat = await fsp.stat(this.ndjsonPath);
      this.bytesWritten = stat.size;
      if (stat.size < this.maxBytes) return;

      await fsp.rm(`${this.ndjsonPath}.1`, { force: true });
      await fsp.rename(this.ndjsonPath, `${this.ndjsonPath}.1`);
      this.bytesWritten = 0;
      console.error(`[Analytics] Rotated ${NDJSON_FILE} at ${stat.size} bytes`);
    } catch (error) {
      console.error(`[Analytics] Rotation failed:`, error);
    }
  }

  /**
   * Refresh the JSON projection the dashboard reads, at most every
   * MIRROR_INTERVAL_MS and always asynchronously.
   */
  private scheduleMirror(): void {
    if (this.mirrorPending) return;
    const wait = Math.max(0, MIRROR_INTERVAL_MS - (Date.now() - this.lastMirrorAt));
    this.mirrorPending = true;
    const timer = setTimeout(() => {
      this.mirrorPending = false;
      void this.writeMirror();
    }, wait);
    timer.unref?.();
  }

  private async writeMirror(): Promise<void> {
    if (!this.mirrorDirty) return;
    this.mirrorDirty = false;
    this.lastMirrorAt = Date.now();

    const data: KBAnalyticsData = {
      version: "1.0.0",
      lastUpdated: new Date().toISOString(),
      entries: this.entries,
    };

    const tmp = `${this.filePath}.tmp-${process.pid}`;
    try {
      await fsp.writeFile(tmp, JSON.stringify(data, null, 2), "utf-8");
      await fsp.rename(tmp, this.filePath);
    } catch (error) {
      await fsp.rm(tmp, { force: true }).catch(() => {});
      console.error(`[Analytics] Mirror write failed:`, error);
    }
  }

  /** Read the NDJSON log, keeping the most recent MAX_ENTRIES lines. */
  private async readNdjson(): Promise<KBUsageEntry[]> {
    let raw: string;
    try {
      raw = await fsp.readFile(this.ndjsonPath, "utf-8");
      this.bytesWritten = Buffer.byteLength(raw);
    } catch {
      return [];
    }

    const out: KBUsageEntry[] = [];
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        // A truncated last line (a crash mid-append) costs one entry, not the
        // whole file — which is the point of a line-oriented format.
        out.push(JSON.parse(trimmed) as KBUsageEntry);
      } catch {
        // Skip unparseable line
      }
    }

    return out.length > MAX_ENTRIES ? out.slice(out.length - MAX_ENTRIES) : out;
  }

  private async readLegacyJson(): Promise<KBUsageEntry[]> {
    try {
      const parsed = JSON.parse(await fsp.readFile(this.filePath, "utf-8")) as KBAnalyticsData;
      const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
      return entries.length > MAX_ENTRIES ? entries.slice(entries.length - MAX_ENTRIES) : entries;
    } catch {
      return [];
    }
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

    let entries = [...this.entries];

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

    const entries = this.entries;

    if (entries.length === 0) {
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
    this.entries = [];
    this.writeQueue = [];
    this.mirrorDirty = true;
    this.bytesWritten = 0;
    await fsp.rm(this.ndjsonPath, { force: true }).catch(() => {});
    this.lastMirrorAt = 0;
    await this.writeMirror();
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
