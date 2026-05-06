// SPDX-License-Identifier: MIT
/**
 * Analytics Service
 *
 * KB Usage Tracking and Visualization.
 * Reads analytics data from .dev-suite-analytics/kb-usage.json
 *
 * Token Usage Tracking (opt-in via TOKEN_ANALYTICS_ENABLED=true).
 * Stores data at .dev-suite-analytics/token-usage.json
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Job } from '../types.js';
import { getLogger } from '../utils/logger.js';
import { resolveProjectPath, PathValidationError } from '../utils/utilities.js';

const logger = getLogger('Analytics');

// Constants
const ANALYTICS_DIR = '.dev-suite-analytics';
const KB_USAGE_FILE = 'kb-usage.json';
const TOKEN_USAGE_FILE = 'token-usage.json';

// Types
export interface KBUsageEntry {
  id: string;
  timestamp: string;
  technology: string;
  topic?: string;
  tool: string;
  source: string;
  success: boolean;
  durationMs?: number;
  error?: string;
}

export interface KBUsageData {
  version: string;
  lastUpdated: string | null;
  entries: KBUsageEntry[];
  error?: string;
}

// ============================================
// HOOK OUTPUT FILTER EVENT TYPES
// ============================================

/**
 * Activation event recorded when an output-filter PreToolUse hook fires.
 *
 * Actual token savings require a runtime counter that compares original vs.
 * filtered output lengths; that is out of scope for the current implementation.
 * `savedTokensEstimate` is therefore the static template estimate stored at
 * install time, not a per-invocation measurement.
 */
export interface HookOutputFilteredEvent {
  /** Unique event ID (timestamp-based) */
  id: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Hook template ID (e.g. 'filter-test-output') */
  hookId: string;
  /** The original Bash command that was intercepted */
  originalCommand: string;
  /** Human-readable token-savings estimate from the template definition */
  savedTokensEstimate: string;
}

export interface HookOutputFilteredData {
  version: string;
  lastUpdated: string | null;
  events: HookOutputFilteredEvent[];
}

// ============================================

export interface KBUsageEntriesOptions {
  technology?: string;
  tool?: string;
  source?: string;
  success?: boolean;
  since?: string;
  until?: string;
  offset?: number;
  limit?: number;
}

export interface KBUsageEntriesResult {
  entries: KBUsageEntry[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

export interface KBUsageStats {
  totalCalls: number;
  successRate: number;
  avgDurationMs: number;
  byTechnology: Record<string, number>;
  byTool: Record<string, number>;
  bySource: Record<string, number>;
  topTechnologies: Array<{ name: string; count: number }>;
  timeline: Array<{ timestamp: string; count: number }>;
  last24h: number;
  last7d: number;
  lastUpdated?: string | null;
}

export interface CorrelatedJob extends Job {
  kbCalls: Array<{
    id: string;
    timestamp: string;
    technology: string;
    topic?: string;
    tool: string;
    success: boolean;
  }>;
}

// ============================================
// TOKEN USAGE TRACKING TYPES
// ============================================

/**
 * A single token-usage event recorded by an agent, skill, or MCP tool call.
 * No prompt content is ever stored — only counts and metadata.
 *
 * Token tracking is OPT-IN via the TOKEN_ANALYTICS_ENABLED=true env var.
 */
export interface TokenUsageEntry {
  /** Unique entry ID */
  id: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Agent ID that generated the call (if applicable) */
  agentId?: string;
  /** Skill directory path that was loaded (if applicable) */
  skillPath?: string;
  /** MCP tool name that was invoked (if applicable) */
  mcpTool?: string;
  /** Session grouping key (optional) */
  sessionId?: string;
  /** Number of input tokens consumed */
  tokensInput: number;
  /** Number of output tokens generated */
  tokensOutput: number;
  /** Estimated cost in USD (computed from model pricing approximations) */
  costUsd?: number;
  /** Model used: haiku | sonnet | opus */
  model?: string;
  /** Whether the call completed successfully */
  success: boolean;
  /** Wall-clock duration of the call in milliseconds */
  durationMs?: number;
}

export interface TokenUsageData {
  version: string;
  lastUpdated: string | null;
  entries: TokenUsageEntry[];
  error?: string;
}

export interface TokenUsageOptions {
  since?: string;
  agentId?: string;
  skillPath?: string;
  mcpTool?: string;
  model?: string;
  limit?: number;
}

export type TokenGroupBy = 'agent' | 'skill' | 'mcpTool' | 'model';

export interface TokenAggregatedRow {
  /** The grouping key value (agentId, skillPath, mcpTool, or model) */
  key: string;
  totalTokens: number;
  totalCostUsd: number;
  callCount: number;
  avgTokensPerCall: number;
}

/**
 * Approximate USD pricing per 1M tokens (input).
 * These are rough estimates — document in docs/TOKEN-ANALYTICS.md.
 */
const MODEL_INPUT_PRICE_PER_MTOK: Record<string, number> = {
  haiku: 0.25,
  sonnet: 3.0,
  opus: 15.0,
};

/**
 * Approximate USD pricing per 1M tokens (output).
 */
const MODEL_OUTPUT_PRICE_PER_MTOK: Record<string, number> = {
  haiku: 1.25,
  sonnet: 15.0,
  opus: 75.0,
};

const DEFAULT_INPUT_PRICE = MODEL_INPUT_PRICE_PER_MTOK['sonnet'] ?? 3.0;
const DEFAULT_OUTPUT_PRICE = MODEL_OUTPUT_PRICE_PER_MTOK['sonnet'] ?? 15.0;

function estimateCostUsd(model: string | undefined, tokensInput: number, tokensOutput: number): number {
  const normalizedModel = (model ?? '').toLowerCase();
  const inputPrice = MODEL_INPUT_PRICE_PER_MTOK[normalizedModel] ?? DEFAULT_INPUT_PRICE;
  const outputPrice = MODEL_OUTPUT_PRICE_PER_MTOK[normalizedModel] ?? DEFAULT_OUTPUT_PRICE;
  return (tokensInput / 1_000_000) * inputPrice + (tokensOutput / 1_000_000) * outputPrice;
}

export class AnalyticsService {
  /**
   * Get analytics file path for a project
   */
  getAnalyticsPath(projectPath: string): string {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    return path.join(projectPath, ANALYTICS_DIR, KB_USAGE_FILE);
  }

  /**
   * Read KB usage analytics data
   */
  readKBUsage(projectPath: string): KBUsageData {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    const filePath = this.getAnalyticsPath(projectPath);

    if (!fs.existsSync(filePath)) {
      return {
        version: '1.0.0',
        lastUpdated: null,
        entries: [],
      };
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as KBUsageData;
    } catch (e) {
      logger.error('Failed to read KB analytics', { error: e });
      return {
        version: '1.0.0',
        lastUpdated: null,
        entries: [],
        error: e instanceof Error ? e.message : 'Unknown error',
      };
    }
  }

  /**
   * Get KB usage entries with filters and pagination
   */
  getKBUsageEntries(projectPath: string, options: KBUsageEntriesOptions = {}): KBUsageEntriesResult {
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    const data = this.readKBUsage(projectPath);
    let entries = data.entries || [];

    // Apply filters
    if (options.technology) {
      entries = entries.filter((e) => e.technology === options.technology);
    }
    if (options.tool) {
      entries = entries.filter((e) => e.tool === options.tool);
    }
    if (options.source) {
      entries = entries.filter((e) => e.source === options.source);
    }
    if (options.success !== undefined) {
      entries = entries.filter((e) => e.success === options.success);
    }
    if (options.since) {
      const sinceDate = new Date(options.since);
      entries = entries.filter((e) => new Date(e.timestamp) >= sinceDate);
    }
    if (options.until) {
      const untilDate = new Date(options.until);
      entries = entries.filter((e) => new Date(e.timestamp) <= untilDate);
    }

    const total = entries.length;

    // Sort by timestamp descending (newest first)
    entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    // Apply pagination
    const offset = options.offset || 0;
    const limit = options.limit || 100;
    entries = entries.slice(offset, offset + limit);

    return {
      entries,
      total,
      offset,
      limit,
      hasMore: offset + entries.length < total,
    };
  }

  /**
   * Get aggregated KB usage statistics
   */
  getKBUsageStats(projectPath: string, options: { since?: string } = {}): KBUsageStats {
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    const data = this.readKBUsage(projectPath);
    let entries = data.entries || [];

    // Apply time filter if specified
    if (options.since) {
      const sinceDate = new Date(options.since);
      entries = entries.filter((e) => new Date(e.timestamp) >= sinceDate);
    }

    if (entries.length === 0) {
      return {
        totalCalls: 0,
        successRate: 0,
        avgDurationMs: 0,
        byTechnology: {},
        byTool: {},
        bySource: {},
        topTechnologies: [],
        timeline: [],
        last24h: 0,
        last7d: 0,
      };
    }

    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;

    const byTechnology: Record<string, number> = {};
    const byTool: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    const timelineMap: Record<string, number> = {};
    let successCount = 0;
    let totalDuration = 0;
    let last24h = 0;
    let last7d = 0;

    for (const entry of entries) {
      // By technology
      byTechnology[entry.technology] = (byTechnology[entry.technology] || 0) + 1;

      // By tool
      byTool[entry.tool] = (byTool[entry.tool] || 0) + 1;

      // By source
      bySource[entry.source] = (bySource[entry.source] || 0) + 1;

      // Success rate
      if (entry.success) successCount++;

      // Duration
      totalDuration += entry.durationMs || 0;

      // Time-based
      const entryTime = new Date(entry.timestamp).getTime();
      if (now - entryTime < day) last24h++;
      if (now - entryTime < 7 * day) last7d++;

      // Timeline (hourly buckets for last 24h, daily for older)
      const entryDate = new Date(entry.timestamp);
      let bucketKey: string;
      if (now - entryTime < day) {
        // Hourly bucket for last 24h
        bucketKey = `${entryDate.toISOString().slice(0, 13)}:00`;
      } else {
        // Daily bucket for older
        bucketKey = entryDate.toISOString().slice(0, 10);
      }
      timelineMap[bucketKey] = (timelineMap[bucketKey] || 0) + 1;
    }

    // Sort top technologies
    const topTechnologies = Object.entries(byTechnology)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count }));

    // Create timeline array
    const timeline = Object.entries(timelineMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([timestamp, count]) => ({ timestamp, count }));

    return {
      totalCalls: entries.length,
      successRate: entries.length > 0 ? Math.round((successCount / entries.length) * 100) : 0,
      avgDurationMs: entries.length > 0 ? Math.round(totalDuration / entries.length) : 0,
      byTechnology,
      byTool,
      bySource,
      topTechnologies,
      timeline,
      last24h,
      last7d,
      lastUpdated: data.lastUpdated,
    };
  }

  /**
   * Correlate KB usage with orchestrator jobs
   * Finds KB calls that happened during job execution
   */
  correlateWithJobs(projectPath: string, jobs: Job[], windowMs: number = 60000): CorrelatedJob[] {
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    const data = this.readKBUsage(projectPath);
    const entries = data.entries || [];

    const correlatedJobs: CorrelatedJob[] = jobs.map((job) => {
      if (!job.createdAt) {
        return { ...job, kbCalls: [] };
      }

      const jobStart = new Date(job.createdAt).getTime();
      const jobEnd = job.completedAt ? new Date(job.completedAt).getTime() : jobStart + windowMs;

      // Find KB calls within job timeframe
      const kbCalls = entries
        .filter((e) => {
          const callTime = new Date(e.timestamp).getTime();
          return callTime >= jobStart && callTime <= jobEnd;
        })
        .map((e) => ({
          id: e.id,
          timestamp: e.timestamp,
          technology: e.technology,
          topic: e.topic,
          tool: e.tool,
          success: e.success,
        }));

      return {
        ...job,
        kbCalls,
      };
    });

    return correlatedJobs;
  }

  /**
   * Clear KB analytics data
   */
  clearKBUsage(projectPath: string): { success: boolean; message?: string; error?: string } {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    const filePath = this.getAnalyticsPath(projectPath);

    if (!fs.existsSync(filePath)) {
      return { success: true, message: 'No analytics data to clear' };
    }

    try {
      const data: KBUsageData = {
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        entries: [],
      };
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      return { success: true, message: 'Analytics data cleared' };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  }

  /**
   * Get unique technologies from KB usage
   */
  getUsedTechnologies(projectPath: string): string[] {
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    const data = this.readKBUsage(projectPath);
    const entries = data.entries || [];

    const technologies = new Set<string>();
    entries.forEach((e) => technologies.add(e.technology));

    return Array.from(technologies).sort();
  }

  /**
   * Get unique tools from KB usage
   */
  getUsedTools(projectPath: string): string[] {
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    const data = this.readKBUsage(projectPath);
    const entries = data.entries || [];

    const tools = new Set<string>();
    entries.forEach((e) => tools.add(e.tool));

    return Array.from(tools).sort();
  }

  /**
   * Get unique sources from KB usage
   */
  getUsedSources(projectPath: string): string[] {
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    const data = this.readKBUsage(projectPath);
    const entries = data.entries || [];

    const sources = new Set<string>();
    entries.forEach((e) => sources.add(e.source));

    return Array.from(sources).sort();
  }

  /**
   * Check if analytics directory exists
   */
  hasAnalytics(projectPath: string): boolean {
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    return fs.existsSync(this.getAnalyticsPath(projectPath));
  }

  // ========== HOOK OUTPUT FILTER TRACKING ==========

  /**
   * Path to the hook-output-filtered events file for a project.
   */
  getHookFilteredEventsPath(projectPath: string): string {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    return path.join(projectPath, ANALYTICS_DIR, 'hook-filtered-events.json');
  }

  /**
   * Record a `hook-output-filtered` activation event.
   *
   * Called when a user installs an output-filter hook via the dashboard.
   * The event captures the hook ID, the original command pattern, and the
   * static token-savings estimate from the template definition.
   *
   * Actual per-invocation savings would require a runtime counter in the hook
   * script itself — that is left as a future enhancement.
   */
  trackHookOutputFiltered(
    projectPath: string,
    event: Omit<HookOutputFilteredEvent, 'id' | 'timestamp'>
  ): { success: boolean; error?: string } {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');

    const filePath = this.getHookFilteredEventsPath(projectPath);
    const analyticsDir = path.dirname(filePath);

    // Read existing data
    let data: HookOutputFilteredData = { version: '1.0.0', lastUpdated: null, events: [] };
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        data = JSON.parse(content) as HookOutputFilteredData;
      } catch {
        // Corrupt file — start fresh, do not throw
      }
    }

    const newEvent: HookOutputFilteredEvent = {
      id: `hook-filtered-${Date.now()}`,
      timestamp: new Date().toISOString(),
      ...event,
    };

    data.events.push(newEvent);
    data.lastUpdated = newEvent.timestamp;

    try {
      if (!fs.existsSync(analyticsDir)) {
        fs.mkdirSync(analyticsDir, { recursive: true });
      }
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      return { success: true };
    } catch (e) {
      logger.error('Failed to write hook-filtered event', { error: e });
      return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  }

  /**
   * Read all hook-output-filtered events for a project.
   */
  getHookFilteredEvents(projectPath: string): HookOutputFilteredData {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');

    const filePath = this.getHookFilteredEventsPath(projectPath);

    if (!fs.existsSync(filePath)) {
      return { version: '1.0.0', lastUpdated: null, events: [] };
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as HookOutputFilteredData;
    } catch {
      return { version: '1.0.0', lastUpdated: null, events: [] };
    }
  }

  // ========== TOKEN USAGE TRACKING ==========

  /**
   * Returns the absolute path to the token-usage file for a given project.
   */
  getTokenUsagePath(projectPath: string): string {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    return path.join(projectPath, ANALYTICS_DIR, TOKEN_USAGE_FILE);
  }

  /**
   * Read the raw token-usage data file.
   * Returns an empty dataset if the file does not yet exist.
   */
  private readTokenUsageData(projectPath: string): TokenUsageData {
    const filePath = this.getTokenUsagePath(projectPath);

    if (!fs.existsSync(filePath)) {
      return { version: '1.0.0', lastUpdated: null, entries: [] };
    }

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as TokenUsageData;
    } catch (e) {
      logger.error('Failed to read token-usage analytics', { error: e });
      return {
        version: '1.0.0',
        lastUpdated: null,
        entries: [],
        error: e instanceof Error ? e.message : 'Unknown error',
      };
    }
  }

  /**
   * Record a token-usage event.
   *
   * Automatically computes `costUsd` when `model` is set and the field is
   * not already provided by the caller.
   *
   * Token tracking is opt-in.  Callers should check TOKEN_ANALYTICS_ENABLED
   * before calling this method, or rely on the route guard.
   */
  recordTokenUsage(
    projectPath: string,
    entry: Omit<TokenUsageEntry, 'id' | 'timestamp'>
  ): { success: boolean; error?: string } {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');

    const filePath = this.getTokenUsagePath(projectPath);
    const analyticsDir = path.dirname(filePath);

    const data = this.readTokenUsageData(projectPath);

    const costUsd =
      entry.costUsd !== undefined
        ? entry.costUsd
        : estimateCostUsd(entry.model, entry.tokensInput, entry.tokensOutput);

    const newEntry: TokenUsageEntry = {
      id: `token-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      ...entry,
      costUsd,
    };

    data.entries.push(newEntry);
    data.lastUpdated = newEntry.timestamp;

    try {
      if (!fs.existsSync(analyticsDir)) {
        fs.mkdirSync(analyticsDir, { recursive: true });
      }
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      return { success: true };
    } catch (e) {
      logger.error('Failed to write token-usage entry', { error: e });
      return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
    }
  }

  /**
   * Read token-usage entries with optional filters.
   *
   * Results are sorted newest-first.  When `limit` is provided only the first
   * N entries (after filtering) are returned.
   */
  getTokenUsage(projectPath: string, opts: TokenUsageOptions = {}): TokenUsageEntry[] {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');

    const data = this.readTokenUsageData(projectPath);
    let entries = data.entries ?? [];

    if (opts.since) {
      const since = new Date(opts.since);
      entries = entries.filter((e) => new Date(e.timestamp) >= since);
    }
    if (opts.agentId) {
      entries = entries.filter((e) => e.agentId === opts.agentId);
    }
    if (opts.skillPath) {
      entries = entries.filter((e) => e.skillPath === opts.skillPath);
    }
    if (opts.mcpTool) {
      entries = entries.filter((e) => e.mcpTool === opts.mcpTool);
    }
    if (opts.model) {
      entries = entries.filter((e) => e.model === opts.model);
    }

    // Newest first
    entries.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (opts.limit !== undefined && opts.limit > 0) {
      entries = entries.slice(0, opts.limit);
    }

    return entries;
  }

  /**
   * Return aggregated token-usage statistics grouped by a chosen dimension.
   *
   * `groupBy` controls the key:
   *  - 'agent'   → groups on `agentId`
   *  - 'skill'   → groups on `skillPath`
   *  - 'mcpTool' → groups on `mcpTool`
   *  - 'model'   → groups on `model`
   *
   * Entries where the grouping field is absent are included under the key
   * "(none)" so the totals are complete.
   *
   * Results are sorted by `totalTokens` descending.
   */
  getAggregatedTokenUsage(
    projectPath: string,
    opts: { groupBy: TokenGroupBy; since?: string } = { groupBy: 'agent' }
  ): TokenAggregatedRow[] {
    const entries = this.getTokenUsage(projectPath, { since: opts.since });

    const map = new Map<string, { tokens: number; cost: number; count: number }>();

    for (const entry of entries) {
      let key: string;
      switch (opts.groupBy) {
        case 'agent':
          key = entry.agentId ?? '(none)';
          break;
        case 'skill':
          key = entry.skillPath ?? '(none)';
          break;
        case 'mcpTool':
          key = entry.mcpTool ?? '(none)';
          break;
        case 'model':
          key = entry.model ?? '(none)';
          break;
      }

      const existing = map.get(key) ?? { tokens: 0, cost: 0, count: 0 };
      existing.tokens += entry.tokensInput + entry.tokensOutput;
      existing.cost += entry.costUsd ?? 0;
      existing.count += 1;
      map.set(key, existing);
    }

    const rows: TokenAggregatedRow[] = [];
    for (const [key, agg] of map.entries()) {
      rows.push({
        key,
        totalTokens: agg.tokens,
        totalCostUsd: agg.cost,
        callCount: agg.count,
        avgTokensPerCall: agg.count > 0 ? Math.round(agg.tokens / agg.count) : 0,
      });
    }

    rows.sort((a, b) => b.totalTokens - a.totalTokens);
    return rows;
  }

  /**
   * Get analytics summary (quick overview)
   */
  getAnalyticsSummary(projectPath: string): {
    hasData: boolean;
    totalEntries: number;
    lastUpdated: string | null;
    topTechnology?: string;
    successRate: number;
  } {
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    const data = this.readKBUsage(projectPath);
    const entries = data.entries || [];

    if (entries.length === 0) {
      return {
        hasData: false,
        totalEntries: 0,
        lastUpdated: null,
        successRate: 0,
      };
    }

    // Find top technology
    const techCounts: Record<string, number> = {};
    let successCount = 0;

    for (const entry of entries) {
      techCounts[entry.technology] = (techCounts[entry.technology] || 0) + 1;
      if (entry.success) successCount++;
    }

    const topTechnology = Object.entries(techCounts).sort((a, b) => b[1] - a[1])[0]?.[0];

    return {
      hasData: true,
      totalEntries: entries.length,
      lastUpdated: data.lastUpdated,
      topTechnology,
      successRate: Math.round((successCount / entries.length) * 100),
    };
  }
}
