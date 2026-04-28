// SPDX-License-Identifier: MIT
/**
 * Analytics Routes Tests
 *
 * Tests for analytics route handlers using supertest.
 * AnalyticsService is fully mocked.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { createTempDir, cleanupTempDir } from '../test-utils.js';
import type { Job } from '../../src/types.js';

vi.mock('../../src/services/analytics.service.js');

import { AnalyticsService } from '../../src/services/analytics.service.js';
import { analyticsRoutes } from '../../src/routes/analytics.routes.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PROJECT_PATH = '/home/user/my-project';

const MOCK_ANALYTICS_SUMMARY = {
  totalEntries: 42,
  lastUpdated: '2024-01-01T00:00:00Z',
  hasData: true,
};

const MOCK_KB_USAGE_RESULT = {
  entries: [
    {
      id: 'entry-1',
      technology: 'react',
      tool: 'documentation',
      source: 'docs',
      success: true,
      timestamp: '2024-01-01T00:00:00Z',
    },
  ],
  total: 1,
  offset: 0,
  limit: 100,
};

const MOCK_KB_STATS = {
  totalCalls: 100,
  successRate: 0.95,
  topTechnologies: ['react', 'typescript'],
  topTools: ['documentation'],
};

const MOCK_JOB: Job = {
  id: 'job-1',
  title: 'Code Review',
  prompt: 'Review the code',
  projectPath: PROJECT_PATH,
  status: 'completed',
  createdAt: new Date('2024-01-01T00:00:00Z'),
};

const MOCK_CORRELATED_JOBS = [
  { ...MOCK_JOB, kbUsage: [{ technology: 'react', tool: 'documentation' }] },
];

const MOCK_TECHNOLOGIES = ['react', 'typescript', 'nodejs'];

const MOCK_TOOLS = ['documentation', 'code-quality'];

const MOCK_SOURCES = ['mcp-server', 'inline'];

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api', analyticsRoutes);
  return app;
}

// ---------------------------------------------------------------------------

describe('Analytics Routes - HTTP Integration', () => {
  let app: Express;
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = createTempDir('analytics-routes-test-');
  });

  afterAll(() => {
    cleanupTempDir(tmpDir);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });

  // -------------------------------------------------------------------------
  // GET /api/analytics/status
  // -------------------------------------------------------------------------
  describe('GET /analytics/status', () => {
    it('should return analytics summary', async () => {
      vi.mocked(AnalyticsService.prototype.getAnalyticsSummary).mockReturnValue(MOCK_ANALYTICS_SUMMARY);

      const res = await request(app)
        .get('/api/analytics/status')
        .query({ path: tmpDir });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalEntries).toBe(42);
    });

    it('should return 500 on service error', async () => {
      vi.mocked(AnalyticsService.prototype.getAnalyticsSummary).mockImplementation(() => {
        throw new Error('analytics file corrupted');
      });

      const res = await request(app)
        .get('/api/analytics/status')
        .query({ path: tmpDir });

      expect(res.status).toBe(500);
    });

    it('should return 500 when path is missing', async () => {
      const res = await request(app)
        .get('/api/analytics/status')
        .query({});

      expect(res.status).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/analytics/kb-usage
  // -------------------------------------------------------------------------
  describe('GET /analytics/kb-usage', () => {
    it('should return KB usage entries', async () => {
      vi.mocked(AnalyticsService.prototype.getKBUsageEntries).mockReturnValue(MOCK_KB_USAGE_RESULT);

      const res = await request(app)
        .get('/api/analytics/kb-usage')
        .query({ path: tmpDir });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.total).toBe(1);
    });

    it('should pass filter options', async () => {
      vi.mocked(AnalyticsService.prototype.getKBUsageEntries).mockReturnValue(MOCK_KB_USAGE_RESULT);

      const res = await request(app)
        .get('/api/analytics/kb-usage')
        .query({ path: tmpDir, technology: 'react', tool: 'documentation', success: 'true' });

      expect(res.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/analytics/kb-stats
  // -------------------------------------------------------------------------
  describe('GET /analytics/kb-stats', () => {
    it('should return aggregated KB stats', async () => {
      vi.mocked(AnalyticsService.prototype.getKBUsageStats).mockReturnValue(MOCK_KB_STATS);

      const res = await request(app)
        .get('/api/analytics/kb-stats')
        .query({ path: tmpDir });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.totalCalls).toBe(100);
    });

    it('should pass since filter', async () => {
      vi.mocked(AnalyticsService.prototype.getKBUsageStats).mockReturnValue(MOCK_KB_STATS);

      const res = await request(app)
        .get('/api/analytics/kb-stats')
        .query({ path: tmpDir, since: '2024-01-01' });

      expect(res.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/analytics/kb-jobs
  // -------------------------------------------------------------------------
  describe('POST /analytics/kb-jobs', () => {
    it('should correlate KB usage with jobs', async () => {
      vi.mocked(AnalyticsService.prototype.correlateWithJobs).mockReturnValue(MOCK_CORRELATED_JOBS);

      const res = await request(app)
        .post('/api/analytics/kb-jobs')
        .send({ projectPath: tmpDir, jobs: [MOCK_JOB], windowMs: 60000 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should return 400 when jobs is missing', async () => {
      const res = await request(app)
        .post('/api/analytics/kb-jobs')
        .send({ projectPath: tmpDir });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 500 on service error', async () => {
      vi.mocked(AnalyticsService.prototype.correlateWithJobs).mockImplementation(() => {
        throw new Error('correlation failed');
      });

      const res = await request(app)
        .post('/api/analytics/kb-jobs')
        .send({ projectPath: tmpDir, jobs: [MOCK_JOB] });

      expect(res.status).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/analytics/technologies
  // -------------------------------------------------------------------------
  describe('GET /analytics/technologies', () => {
    it('should return used technologies', async () => {
      vi.mocked(AnalyticsService.prototype.getUsedTechnologies).mockReturnValue(MOCK_TECHNOLOGIES);

      const res = await request(app)
        .get('/api/analytics/technologies')
        .query({ path: tmpDir });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toContain('react');
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/analytics/tools
  // -------------------------------------------------------------------------
  describe('GET /analytics/tools', () => {
    it('should return used tools', async () => {
      vi.mocked(AnalyticsService.prototype.getUsedTools).mockReturnValue(MOCK_TOOLS);

      const res = await request(app)
        .get('/api/analytics/tools')
        .query({ path: tmpDir });

      expect(res.status).toBe(200);
      expect(res.body.data).toContain('documentation');
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/analytics/sources
  // -------------------------------------------------------------------------
  describe('GET /analytics/sources', () => {
    it('should return used sources', async () => {
      vi.mocked(AnalyticsService.prototype.getUsedSources).mockReturnValue(MOCK_SOURCES);

      const res = await request(app)
        .get('/api/analytics/sources')
        .query({ path: tmpDir });

      expect(res.status).toBe(200);
      expect(res.body.data).toContain('mcp-server');
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/analytics/clear
  // -------------------------------------------------------------------------
  describe('POST /analytics/clear', () => {
    it('should clear KB analytics', async () => {
      vi.mocked(AnalyticsService.prototype.clearKBUsage).mockReturnValue({ success: true });

      const res = await request(app)
        .post('/api/analytics/clear')
        .send({ projectPath: tmpDir });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 500 on service error', async () => {
      vi.mocked(AnalyticsService.prototype.clearKBUsage).mockImplementation(() => {
        throw new Error('file locked');
      });

      const res = await request(app)
        .post('/api/analytics/clear')
        .send({ projectPath: tmpDir });

      expect(res.status).toBe(500);
    });
  });
});
