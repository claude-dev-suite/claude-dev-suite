/**
 * Analytics Service Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AnalyticsService } from '../src/services/analytics.service.js';
import type { TokenUsageEntry } from '../src/services/analytics.service.js';
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

  // ============================================================
  // TOKEN USAGE TRACKING
  // ============================================================

  describe('recordTokenUsage', () => {
    it('should record a token-usage entry and persist it', () => {
      const result = analyticsService.recordTokenUsage(projectDir, {
        agentId: 'react-expert',
        tokensInput: 1000,
        tokensOutput: 500,
        model: 'sonnet',
        success: true,
        durationMs: 250,
      });

      expect(result.success).toBe(true);

      const entries = analyticsService.getTokenUsage(projectDir);
      expect(entries.length).toBe(1);
      expect(entries[0].agentId).toBe('react-expert');
      expect(entries[0].tokensInput).toBe(1000);
      expect(entries[0].tokensOutput).toBe(500);
      expect(entries[0].model).toBe('sonnet');
      expect(entries[0].success).toBe(true);
      expect(entries[0].id).toBeDefined();
      expect(entries[0].timestamp).toBeDefined();
    });

    it('should auto-compute costUsd when not provided', () => {
      analyticsService.recordTokenUsage(projectDir, {
        tokensInput: 1_000_000,
        tokensOutput: 0,
        model: 'haiku',
        success: true,
      });

      const entries = analyticsService.getTokenUsage(projectDir);
      // Haiku input: $0.25/MTok → $0.25 for 1M input tokens
      expect(entries[0].costUsd).toBeCloseTo(0.25, 4);
    });

    it('should preserve caller-supplied costUsd', () => {
      analyticsService.recordTokenUsage(projectDir, {
        tokensInput: 100,
        tokensOutput: 100,
        model: 'sonnet',
        costUsd: 9.99,
        success: true,
      });

      const entries = analyticsService.getTokenUsage(projectDir);
      expect(entries[0].costUsd).toBe(9.99);
    });

    it('should accumulate multiple entries', () => {
      analyticsService.recordTokenUsage(projectDir, {
        agentId: 'agent-a',
        tokensInput: 100,
        tokensOutput: 50,
        success: true,
      });
      analyticsService.recordTokenUsage(projectDir, {
        agentId: 'agent-b',
        tokensInput: 200,
        tokensOutput: 100,
        success: false,
      });

      const entries = analyticsService.getTokenUsage(projectDir);
      expect(entries.length).toBe(2);
    });

    it('should create the analytics dir if absent', () => {
      const freshDir = createTempDir('token-fresh-');
      try {
        const result = analyticsService.recordTokenUsage(freshDir, {
          tokensInput: 10,
          tokensOutput: 5,
          success: true,
        });
        expect(result.success).toBe(true);
        const entries = analyticsService.getTokenUsage(freshDir);
        expect(entries.length).toBe(1);
      } finally {
        cleanupTempDir(freshDir);
      }
    });
  });

  describe('getTokenUsage', () => {
    function seedEntries(dir: string): void {
      const now = Date.now();
      const entries: Array<Omit<TokenUsageEntry, 'id' | 'timestamp'>> = [
        { agentId: 'react-expert', skillPath: 'frontend-react', mcpTool: 'fetch_docs', model: 'sonnet', tokensInput: 500, tokensOutput: 300, success: true },
        { agentId: 'ts-expert',    skillPath: 'typescript',      mcpTool: 'search_docs', model: 'haiku',  tokensInput: 200, tokensOutput: 100, success: true },
        { agentId: 'react-expert', skillPath: 'frontend-react',                           model: 'opus',   tokensInput: 1000, tokensOutput: 800, success: false },
      ];

      for (let i = 0; i < entries.length; i++) {
        const data = entries[i];
        const filePath = analyticsService.getTokenUsagePath(dir);
        const analyticsDir = path.dirname(filePath);
        if (!fs.existsSync(analyticsDir)) fs.mkdirSync(analyticsDir, { recursive: true });

        // Use recordTokenUsage to keep IDs unique
        analyticsService.recordTokenUsage(dir, {
          ...data,
          durationMs: 100 + i * 50,
        });
      }

      // Backdate entry[2] to 2 days ago for time filtering
      const raw = fs.readFileSync(analyticsService.getTokenUsagePath(dir), 'utf-8');
      const parsed = JSON.parse(raw);
      parsed.entries[0].timestamp = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString();
      fs.writeFileSync(analyticsService.getTokenUsagePath(dir), JSON.stringify(parsed, null, 2));
    }

    beforeEach(() => seedEntries(projectDir));

    it('should return all entries when no filters', () => {
      const entries = analyticsService.getTokenUsage(projectDir);
      expect(entries.length).toBe(3);
    });

    it('should filter by agentId', () => {
      const entries = analyticsService.getTokenUsage(projectDir, { agentId: 'react-expert' });
      expect(entries.every((e) => e.agentId === 'react-expert')).toBe(true);
      expect(entries.length).toBe(2);
    });

    it('should filter by skillPath', () => {
      const entries = analyticsService.getTokenUsage(projectDir, { skillPath: 'typescript' });
      expect(entries.every((e) => e.skillPath === 'typescript')).toBe(true);
      expect(entries.length).toBe(1);
    });

    it('should filter by mcpTool', () => {
      const entries = analyticsService.getTokenUsage(projectDir, { mcpTool: 'fetch_docs' });
      expect(entries.length).toBe(1);
      expect(entries[0].mcpTool).toBe('fetch_docs');
    });

    it('should filter by model', () => {
      const entries = analyticsService.getTokenUsage(projectDir, { model: 'haiku' });
      expect(entries.every((e) => e.model === 'haiku')).toBe(true);
      expect(entries.length).toBe(1);
    });

    it('should filter by since', () => {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const entries = analyticsService.getTokenUsage(projectDir, { since: yesterday });
      // Entry 0 was backdated 2 days ago, so only 2 remain
      expect(entries.length).toBe(2);
    });

    it('should honour limit', () => {
      const entries = analyticsService.getTokenUsage(projectDir, { limit: 1 });
      expect(entries.length).toBe(1);
    });

    it('should return newest-first order', () => {
      const entries = analyticsService.getTokenUsage(projectDir);
      for (let i = 0; i < entries.length - 1; i++) {
        expect(new Date(entries[i].timestamp).getTime()).toBeGreaterThanOrEqual(
          new Date(entries[i + 1].timestamp).getTime()
        );
      }
    });

    it('should return empty array when file does not exist', () => {
      const emptyDir = createTempDir('token-empty-');
      try {
        const entries = analyticsService.getTokenUsage(emptyDir);
        expect(entries).toEqual([]);
      } finally {
        cleanupTempDir(emptyDir);
      }
    });
  });

  describe('getAggregatedTokenUsage', () => {
    beforeEach(() => {
      // Seed known data
      analyticsService.recordTokenUsage(projectDir, { agentId: 'react-expert', tokensInput: 1000, tokensOutput: 500, model: 'sonnet', success: true });
      analyticsService.recordTokenUsage(projectDir, { agentId: 'react-expert', tokensInput: 500,  tokensOutput: 200, model: 'haiku',  success: true });
      analyticsService.recordTokenUsage(projectDir, { agentId: 'ts-expert',    tokensInput: 300,  tokensOutput: 100, model: 'sonnet', success: true });
    });

    it('should aggregate by agent and return correct totals', () => {
      const rows = analyticsService.getAggregatedTokenUsage(projectDir, { groupBy: 'agent' });

      expect(rows.length).toBe(2);

      const reactRow = rows.find((r) => r.key === 'react-expert');
      expect(reactRow).toBeDefined();
      expect(reactRow!.totalTokens).toBe(1000 + 500 + 500 + 200); // 2200
      expect(reactRow!.callCount).toBe(2);
      expect(reactRow!.avgTokensPerCall).toBe(1100);
    });

    it('should aggregate by model', () => {
      const rows = analyticsService.getAggregatedTokenUsage(projectDir, { groupBy: 'model' });
      const sonnetRow = rows.find((r) => r.key === 'sonnet');
      const haikuRow  = rows.find((r) => r.key === 'haiku');

      expect(sonnetRow).toBeDefined();
      expect(haikuRow).toBeDefined();
      // sonnet: react(1000+500) + ts(300+100) = 1900
      expect(sonnetRow!.totalTokens).toBe(1900);
    });

    it('should sort results by totalTokens descending', () => {
      const rows = analyticsService.getAggregatedTokenUsage(projectDir, { groupBy: 'agent' });
      for (let i = 0; i < rows.length - 1; i++) {
        expect(rows[i].totalTokens).toBeGreaterThanOrEqual(rows[i + 1].totalTokens);
      }
    });

    it('should return empty array when no entries exist', () => {
      const emptyDir = createTempDir('token-agg-empty-');
      try {
        const rows = analyticsService.getAggregatedTokenUsage(emptyDir, { groupBy: 'agent' });
        expect(rows).toEqual([]);
      } finally {
        cleanupTempDir(emptyDir);
      }
    });

    it('should filter by since when aggregating', () => {
      // Add an old entry
      const filePath = analyticsService.getTokenUsagePath(projectDir);
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      // Backdate first entry to 10 days ago
      parsed.entries[0].timestamp = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2));

      const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      const rows = analyticsService.getAggregatedTokenUsage(projectDir, { groupBy: 'agent', since });

      // react-expert's first entry was backdated, should now have only 1 entry in range
      const reactRow = rows.find((r) => r.key === 'react-expert');
      expect(reactRow?.callCount).toBe(1);
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
