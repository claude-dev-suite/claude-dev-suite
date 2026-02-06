// SPDX-License-Identifier: MIT
/**
 * Analytics Service
 *
 * KB Usage Tracking and Visualization.
 * Reads analytics data from .dev-suite-analytics/kb-usage.json
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Job } from '../types.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger('Analytics');

// Constants
const ANALYTICS_DIR = '.dev-suite-analytics';
const KB_USAGE_FILE = 'kb-usage.json';

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

export class AnalyticsService {
  /**
   * Get analytics file path for a project
   */
  getAnalyticsPath(projectPath: string): string {
    return path.join(projectPath, ANALYTICS_DIR, KB_USAGE_FILE);
  }

  /**
   * Read KB usage analytics data
   */
  readKBUsage(projectPath: string): KBUsageData {
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
    return fs.existsSync(this.getAnalyticsPath(projectPath));
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
