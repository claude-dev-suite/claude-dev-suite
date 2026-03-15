/**
 * Analytics Service Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AnalyticsService } from '../src/services/analytics.service.js';
import { createTempDir, cleanupTempDir, createMockAnalyticsData } from './test-utils.js';
import * as fs from 'fs';
import * as path from 'path';

describe('AnalyticsService', () => {
  let analyticsService: AnalyticsService;
  let projectDir: string;

  beforeEach(() => {
    projectDir = createTempDir('analytics-test-');
    analyticsService = new AnalyticsService();
  });

  afterEach(() => {
    cleanupTempDir(projectDir);
  });

  describe('hasAnalytics', () => {
    it('should return true when analytics exist', () => {
      createMockAnalyticsData(projectDir);

      expect(analyticsService.hasAnalytics(projectDir)).toBe(true);
    });

    it('should return false when analytics do not exist', () => {
      expect(analyticsService.hasAnalytics(projectDir)).toBe(false);
    });
  });

  describe('readKBUsage', () => {
    it('should read analytics data', () => {
      createMockAnalyticsData(projectDir);

      const data = analyticsService.readKBUsage(projectDir);

      expect(data.version).toBe('1.0.0');
      expect(data.entries.length).toBe(3);
    });

    it('should return empty data when no file exists', () => {
      const data = analyticsService.readKBUsage(projectDir);

      expect(data.version).toBe('1.0.0');
      expect(data.entries).toEqual([]);
    });

    it('should handle corrupted JSON', () => {
      const analyticsDir = path.join(projectDir, '.dev-suite-analytics');
      fs.mkdirSync(analyticsDir, { recursive: true });
      fs.writeFileSync(path.join(analyticsDir, 'kb-usage.json'), 'invalid json');

      const data = analyticsService.readKBUsage(projectDir);

      expect(data.entries).toEqual([]);
      expect(data.error).toBeDefined();
    });
  });

  describe('getKBUsageEntries', () => {
    beforeEach(() => {
      createMockAnalyticsData(projectDir);
    });

    it('should return all entries by default', () => {
      const result = analyticsService.getKBUsageEntries(projectDir);

      expect(result.entries.length).toBe(3);
      expect(result.total).toBe(3);
    });

    it('should filter by technology', () => {
      const result = analyticsService.getKBUsageEntries(projectDir, {
        technology: 'react',
      });

      expect(result.entries.every((e) => e.technology === 'react')).toBe(true);
      expect(result.total).toBe(2);
    });

    it('should filter by tool', () => {
      const result = analyticsService.getKBUsageEntries(projectDir, {
        tool: 'fetch_docs',
      });

      expect(result.entries.every((e) => e.tool === 'fetch_docs')).toBe(true);
    });

    it('should filter by success', () => {
      const result = analyticsService.getKBUsageEntries(projectDir, {
        success: true,
      });

      expect(result.entries.every((e) => e.success === true)).toBe(true);
    });

    it('should filter by date range', () => {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 3600000);

      const result = analyticsService.getKBUsageEntries(projectDir, {
        since: oneHourAgo.toISOString(),
      });

      expect(result.total).toBeLessThan(3);
    });

    it('should paginate results', () => {
      const result = analyticsService.getKBUsageEntries(projectDir, {
        offset: 1,
        limit: 1,
      });

      expect(result.entries.length).toBe(1);
      expect(result.offset).toBe(1);
      expect(result.limit).toBe(1);
      expect(result.hasMore).toBe(true);
    });

    it('should sort by timestamp descending', () => {
      const result = analyticsService.getKBUsageEntries(projectDir);

      for (let i = 0; i < result.entries.length - 1; i++) {
        const current = new Date(result.entries[i].timestamp).getTime();
        const next = new Date(result.entries[i + 1].timestamp).getTime();
        expect(current).toBeGreaterThanOrEqual(next);
      }
    });
  });

  describe('getKBUsageStats', () => {
    beforeEach(() => {
      createMockAnalyticsData(projectDir);
    });

    it('should calculate total calls', () => {
      const stats = analyticsService.getKBUsageStats(projectDir);

      expect(stats.totalCalls).toBe(3);
    });

    it('should calculate success rate', () => {
      const stats = analyticsService.getKBUsageStats(projectDir);

      // 2 out of 3 are successful
      expect(stats.successRate).toBe(67);
    });

    it('should calculate average duration', () => {
      const stats = analyticsService.getKBUsageStats(projectDir);

      expect(stats.avgDurationMs).toBeGreaterThan(0);
    });

    it('should group by technology', () => {
      const stats = analyticsService.getKBUsageStats(projectDir);

      expect(stats.byTechnology.react).toBe(2);
      expect(stats.byTechnology.typescript).toBe(1);
    });

    it('should group by tool', () => {
      const stats = analyticsService.getKBUsageStats(projectDir);

      expect(stats.byTool.fetch_docs).toBe(2);
      expect(stats.byTool.search_docs).toBe(1);
    });

    it('should return top technologies', () => {
      const stats = analyticsService.getKBUsageStats(projectDir);

      expect(stats.topTechnologies.length).toBeGreaterThan(0);
      expect(stats.topTechnologies[0].name).toBe('react');
      expect(stats.topTechnologies[0].count).toBe(2);
    });

    it('should calculate last24h and last7d', () => {
      const stats = analyticsService.getKBUsageStats(projectDir);

      expect(stats.last24h).toBeGreaterThanOrEqual(0);
      expect(stats.last7d).toBeGreaterThanOrEqual(stats.last24h);
    });

    it('should return timeline', () => {
      const stats = analyticsService.getKBUsageStats(projectDir);

      expect(stats.timeline.length).toBeGreaterThan(0);
      expect(stats.timeline[0]).toHaveProperty('timestamp');
      expect(stats.timeline[0]).toHaveProperty('count');
    });

    it('should filter by since date', () => {
      const oneHourAgo = new Date(Date.now() - 3600000);

      const stats = analyticsService.getKBUsageStats(projectDir, {
        since: oneHourAgo.toISOString(),
      });

      expect(stats.totalCalls).toBeLessThan(3);
    });

    it('should handle empty analytics', () => {
      const emptyDir = createTempDir('empty-');
      try {
        const stats = analyticsService.getKBUsageStats(emptyDir);

        expect(stats.totalCalls).toBe(0);
        expect(stats.successRate).toBe(0);
        expect(stats.avgDurationMs).toBe(0);
        expect(stats.topTechnologies).toEqual([]);
      } finally {
        cleanupTempDir(emptyDir);
      }
    });
  });

  describe('correlateWithJobs', () => {
    beforeEach(() => {
      createMockAnalyticsData(projectDir);
    });

    it('should correlate KB calls with jobs', () => {
      const now = new Date();
      const jobs = [
        {
          id: 'job-1',
          title: 'Test Job',
          status: 'completed' as const,
          projectPath: projectDir,
          prompt: 'Test prompt',
          createdAt: new Date(now.getTime() - 3600000).toISOString(),
          completedAt: now.toISOString(),
        },
      ];

      const correlated = analyticsService.correlateWithJobs(projectDir, jobs);

      expect(correlated.length).toBe(1);
      expect(correlated[0].kbCalls).toBeDefined();
    });

    it('should find KB calls within job timeframe', () => {
      const now = new Date();
      const jobs = [
        {
          id: 'job-1',
          title: 'Test Job',
          status: 'completed' as const,
          projectPath: projectDir,
          prompt: 'Test prompt',
          createdAt: new Date(now.getTime() - 10000).toISOString(),
          completedAt: now.toISOString(),
        },
      ];

      const correlated = analyticsService.correlateWithJobs(projectDir, jobs);

      expect(correlated[0].kbCalls.length).toBeGreaterThan(0);
    });

    it('should use default window when no completedAt', () => {
      const jobs = [
        {
          id: 'job-1',
          title: 'Test Job',
          status: 'running' as const,
          projectPath: projectDir,
          prompt: 'Test prompt',
          createdAt: new Date().toISOString(),
        },
      ];

      const correlated = analyticsService.correlateWithJobs(projectDir, jobs, 120000);

      expect(correlated[0].kbCalls).toBeDefined();
    });

    it('should handle jobs without createdAt', () => {
      const jobs = [
        {
          id: 'job-1',
          title: 'Test Job',
          status: 'pending' as const,
          projectPath: projectDir,
          prompt: 'Test prompt',
          createdAt: '',
        },
      ];

      const correlated = analyticsService.correlateWithJobs(projectDir, jobs);

      expect(correlated[0].kbCalls).toEqual([]);
    });
  });

  describe('clearKBUsage', () => {
    it('should clear analytics data', () => {
      createMockAnalyticsData(projectDir);

      const result = analyticsService.clearKBUsage(projectDir);

      expect(result.success).toBe(true);

      const data = analyticsService.readKBUsage(projectDir);
      expect(data.entries).toEqual([]);
    });

    it('should handle non-existent analytics', () => {
      const result = analyticsService.clearKBUsage(projectDir);

      expect(result.success).toBe(true);
      expect(result.message).toContain('No analytics');
    });
  });

  describe('getUsedTechnologies', () => {
    it('should return unique technologies', () => {
      createMockAnalyticsData(projectDir);

      const technologies = analyticsService.getUsedTechnologies(projectDir);

      expect(technologies).toContain('react');
      expect(technologies).toContain('typescript');
      expect(technologies.length).toBe(2);
    });

    it('should return sorted list', () => {
      createMockAnalyticsData(projectDir);

      const technologies = analyticsService.getUsedTechnologies(projectDir);

      for (let i = 0; i < technologies.length - 1; i++) {
        expect(technologies[i].localeCompare(technologies[i + 1])).toBeLessThanOrEqual(0);
      }
    });

    it('should return empty array when no analytics', () => {
      const technologies = analyticsService.getUsedTechnologies(projectDir);

      expect(technologies).toEqual([]);
    });
  });

  describe('getUsedTools', () => {
    it('should return unique tools', () => {
      createMockAnalyticsData(projectDir);

      const tools = analyticsService.getUsedTools(projectDir);

      expect(tools).toContain('fetch_docs');
      expect(tools).toContain('search_docs');
    });
  });

  describe('getUsedSources', () => {
    it('should return unique sources', () => {
      createMockAnalyticsData(projectDir);

      const sources = analyticsService.getUsedSources(projectDir);

      expect(sources).toContain('kb');
    });
  });

  describe('getAnalyticsSummary', () => {
    it('should return summary with data', () => {
      createMockAnalyticsData(projectDir);

      const summary = analyticsService.getAnalyticsSummary(projectDir);

      expect(summary.hasData).toBe(true);
      expect(summary.totalEntries).toBe(3);
      expect(summary.topTechnology).toBe('react');
      expect(summary.successRate).toBe(67);
    });

    it('should return summary without data', () => {
      const summary = analyticsService.getAnalyticsSummary(projectDir);

      expect(summary.hasData).toBe(false);
      expect(summary.totalEntries).toBe(0);
      expect(summary.successRate).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should handle very large analytics files', () => {
      const analyticsDir = path.join(projectDir, '.dev-suite-analytics');
      fs.mkdirSync(analyticsDir, { recursive: true });

      // Create a large analytics file
      const entries = Array(1000)
        .fill(null)
        .map((_, i) => ({
          id: `entry-${i}`,
          timestamp: new Date(Date.now() - i * 1000).toISOString(),
          technology: `tech-${i % 10}`,
          tool: `tool-${i % 5}`,
          source: 'kb',
          success: i % 3 !== 0,
          durationMs: 100 + (i % 200),
        }));

      fs.writeFileSync(
        path.join(analyticsDir, 'kb-usage.json'),
        JSON.stringify({ version: '1.0.0', lastUpdated: new Date().toISOString(), entries })
      );

      const stats = analyticsService.getKBUsageStats(projectDir);

      expect(stats.totalCalls).toBe(1000);
      expect(stats.topTechnologies.length).toBe(10);
    });

    it('should handle entries with missing fields', () => {
      const analyticsDir = path.join(projectDir, '.dev-suite-analytics');
      fs.mkdirSync(analyticsDir, { recursive: true });

      const entries = [
        { id: '1', timestamp: new Date().toISOString(), technology: 'react' },
        { id: '2', timestamp: new Date().toISOString(), tool: 'fetch_docs' },
        { id: '3', timestamp: new Date().toISOString() },
      ];

      fs.writeFileSync(
        path.join(analyticsDir, 'kb-usage.json'),
        JSON.stringify({ version: '1.0.0', entries })
      );

      // Should not throw
      expect(() => analyticsService.getKBUsageStats(projectDir)).not.toThrow();
    });

    it('should handle concurrent reads', async () => {
      createMockAnalyticsData(projectDir);

      const promises = Array(10)
        .fill(null)
        .map(() => Promise.resolve(analyticsService.getKBUsageStats(projectDir)));

      const results = await Promise.all(promises);

      expect(results.every((r) => r.totalCalls === 3)).toBe(true);
    });
  });
});
