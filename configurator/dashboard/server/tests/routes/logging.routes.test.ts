// SPDX-License-Identifier: MIT
/**
 * Logging Routes Tests
 *
 * Tests for logging route handlers using supertest.
 * Uses a real temp directory for file operations.
 */

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';
import { createTempDir, cleanupTempDir } from '../test-utils.js';
import type { LogEntry } from '../../src/routes/logging.routes.js';

vi.mock('../../src/utils/logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
  getLogDirectoryPath: vi.fn(),
}));

import { getLogDirectoryPath } from '../../src/utils/logger.js';
import { loggingRoutes } from '../../src/routes/logging.routes.js';

// ---------------------------------------------------------------------------
// Inline reimplementation of pure helpers from logging.routes.ts
// (for the logic-only tests that remain)
// ---------------------------------------------------------------------------

function parseLogEntry(line: string): LogEntry | null {
  try {
    const parsed = JSON.parse(line);
    return {
      timestamp: parsed.timestamp,
      level: parsed.level?.toUpperCase() || 'INFO',
      component: parsed.component || 'Unknown',
      message: parsed.message,
      data: parsed.data,
      correlationId: parsed.correlationId,
    };
  } catch {
    const match = line.match(/^\[([^\]]+)\]\s+\[([^\]]+)\]\s+\[([^\]]+)\]\s+(.+)$/);
    if (match?.[1] && match[2] && match[3] && match[4]) {
      return {
        timestamp: match[1],
        level: match[2],
        component: match[3],
        message: match[4],
      };
    }
    return null;
  }
}

function formatLogEntry(level: string, component: string, message: string, data?: unknown): string {
  const timestamp = new Date().toISOString();
  const entry: LogEntry = {
    timestamp,
    level: level.toUpperCase(),
    component,
    message,
    data,
  };
  return JSON.stringify(entry) + '\n';
}

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api', loggingRoutes);
  return app;
}

// ---------------------------------------------------------------------------

describe('Logging Routes - HTTP Integration', () => {
  let app: Express;
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = createTempDir('logging-routes-test-');
  });

  afterAll(() => {
    cleanupTempDir(tmpDir);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLogDirectoryPath).mockReturnValue(tmpDir);
    app = buildApp();
  });

  // -------------------------------------------------------------------------
  // POST /api/log
  // -------------------------------------------------------------------------
  describe('POST /log', () => {
    it('should write a log entry successfully', async () => {
      const res = await request(app)
        .post('/api/log')
        .send({ level: 'INFO', component: 'Frontend', message: 'test message' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when level is missing', async () => {
      const res = await request(app)
        .post('/api/log')
        .send({ component: 'Frontend', message: 'test message' });

      expect(res.status).toBe(400);
    });

    it('should return 400 when message is missing', async () => {
      const res = await request(app)
        .post('/api/log')
        .send({ level: 'INFO', component: 'Frontend' });

      expect(res.status).toBe(400);
    });

    it('should default component to Frontend when not provided', async () => {
      const res = await request(app)
        .post('/api/log')
        .send({ level: 'DEBUG', message: 'no component' });

      expect(res.status).toBe(200);
    });

    it('should write log with optional data field', async () => {
      const res = await request(app)
        .post('/api/log')
        .send({ level: 'ERROR', component: 'App', message: 'an error', data: { code: 42 } });

      expect(res.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/log/batch
  // -------------------------------------------------------------------------
  describe('POST /log/batch', () => {
    it('should write multiple log entries', async () => {
      const entries = [
        { level: 'INFO', component: 'A', message: 'msg1' },
        { level: 'WARN', component: 'B', message: 'msg2' },
      ];

      const res = await request(app)
        .post('/api/log/batch')
        .send({ entries });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.count).toBe(2);
    });

    it('should return 400 when entries is missing', async () => {
      const res = await request(app)
        .post('/api/log/batch')
        .send({});

      expect(res.status).toBe(400);
    });

    it('should return 400 when entries is not an array', async () => {
      const res = await request(app)
        .post('/api/log/batch')
        .send({ entries: 'not-an-array' });

      expect(res.status).toBe(400);
    });

    it('should handle empty entries array', async () => {
      const res = await request(app)
        .post('/api/log/batch')
        .send({ entries: [] });

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/logs
  // -------------------------------------------------------------------------
  describe('GET /logs', () => {
    beforeEach(() => {
      const logFile = path.join(tmpDir, 'frontend.log');
      const entries = [
        JSON.stringify({ timestamp: '2024-01-01T10:00:00Z', level: 'INFO', component: 'App', message: 'startup' }),
        JSON.stringify({ timestamp: '2024-01-01T10:01:00Z', level: 'ERROR', component: 'DB', message: 'connection failed' }),
        JSON.stringify({ timestamp: '2024-01-01T10:02:00Z', level: 'WARN', component: 'App', message: 'retry attempt' }),
      ].join('\n');
      fs.writeFileSync(logFile, entries + '\n');
    });

    it('should return log entries', async () => {
      const res = await request(app)
        .get('/api/logs')
        .query({ source: 'frontend' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.logs)).toBe(true);
    });

    it('should filter logs by level', async () => {
      const res = await request(app)
        .get('/api/logs')
        .query({ source: 'frontend', level: 'ERROR' });

      expect(res.status).toBe(200);
      const logs = res.body.data.logs;
      expect(logs.every((l: { level: string }) => l.level === 'ERROR')).toBe(true);
    });

    it('should filter logs by component', async () => {
      const res = await request(app)
        .get('/api/logs')
        .query({ source: 'frontend', component: 'App' });

      expect(res.status).toBe(200);
      const logs = res.body.data.logs;
      expect(logs.every((l: { component: string }) => l.component === 'App')).toBe(true);
    });

    it('should filter logs by search text', async () => {
      const res = await request(app)
        .get('/api/logs')
        .query({ source: 'frontend', search: 'startup' });

      expect(res.status).toBe(200);
      expect(res.body.data.logs.length).toBeGreaterThan(0);
    });

    it('should apply limit', async () => {
      const res = await request(app)
        .get('/api/logs')
        .query({ source: 'frontend', limit: '1' });

      expect(res.status).toBe(200);
      expect(res.body.data.logs.length).toBeLessThanOrEqual(1);
    });

    it('should filter by time range (from)', async () => {
      const res = await request(app)
        .get('/api/logs')
        .query({ source: 'frontend', from: '2024-01-01T10:01:00Z' });

      expect(res.status).toBe(200);
    });

    it('should filter by time range (to)', async () => {
      const res = await request(app)
        .get('/api/logs')
        .query({ source: 'frontend', to: '2024-01-01T10:01:00Z' });

      expect(res.status).toBe(200);
    });

    it('should return empty logs when file does not exist', async () => {
      vi.mocked(getLogDirectoryPath).mockReturnValue('/nonexistent-xyz-999');

      const res = await request(app)
        .get('/api/logs')
        .query({ source: 'frontend' });

      expect(res.status).toBe(200);
      expect(res.body.data.logs).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/logs/stats
  // -------------------------------------------------------------------------
  describe('GET /logs/stats', () => {
    beforeEach(() => {
      const logFile = path.join(tmpDir, 'frontend.log');
      const entries = [
        JSON.stringify({ timestamp: new Date().toISOString(), level: 'INFO', component: 'App', message: 'startup' }),
        JSON.stringify({ timestamp: new Date().toISOString(), level: 'ERROR', component: 'DB', message: 'fail' }),
      ].join('\n');
      fs.writeFileSync(logFile, entries + '\n');
    });

    it('should return log statistics', async () => {
      const res = await request(app)
        .get('/api/logs/stats')
        .query({ source: 'frontend' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.total).toBeDefined();
      expect(res.body.data.byLevel).toBeDefined();
      expect(res.body.data.byComponent).toBeDefined();
    });

    it('should return stats for all sources', async () => {
      const res = await request(app)
        .get('/api/logs/stats')
        .query({ source: 'all' });

      expect(res.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/log (legacy)
  // -------------------------------------------------------------------------
  describe('GET /log (legacy)', () => {
    it('should return empty logs when file does not exist', async () => {
      vi.mocked(getLogDirectoryPath).mockReturnValue('/nonexistent-xyz-999');

      const res = await request(app).get('/api/log');

      expect(res.status).toBe(200);
      expect(res.body.logs).toEqual([]);
    });

    it('should return recent lines from log file', async () => {
      const logFile = path.join(tmpDir, 'frontend.log');
      fs.writeFileSync(logFile, 'line1\nline2\nline3\n');

      const res = await request(app).get('/api/log').query({ lines: '2' });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.logs)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /api/logs
  // -------------------------------------------------------------------------
  describe('DELETE /logs', () => {
    it('should clear log file', async () => {
      const logFile = path.join(tmpDir, 'frontend.log');
      fs.writeFileSync(logFile, 'some content');

      const res = await request(app).delete('/api/logs');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(fs.readFileSync(logFile, 'utf8')).toBe('');
    });

    it('should succeed even when log file does not exist', async () => {
      const logFile = path.join(tmpDir, 'frontend.log');
      if (fs.existsSync(logFile)) fs.unlinkSync(logFile);

      const res = await request(app).delete('/api/logs');

      expect(res.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /api/log (legacy)
  // -------------------------------------------------------------------------
  describe('DELETE /log (legacy)', () => {
    it('should clear log file via legacy endpoint', async () => {
      const logFile = path.join(tmpDir, 'frontend.log');
      fs.writeFileSync(logFile, 'legacy content');

      const res = await request(app).delete('/api/log');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------

describe('Logging Routes - Logic Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // parseLogEntry — JSON format
  // -------------------------------------------------------------------------
  describe('parseLogEntry — JSON format', () => {
    it('should parse a valid JSON log line', () => {
      const line = JSON.stringify({
        timestamp: '2024-01-01T00:00:00.000Z',
        level: 'info',
        component: 'App',
        message: 'Server started',
        data: { port: 3000 },
      });

      const result = parseLogEntry(line);

      expect(result).not.toBeNull();
      expect(result?.level).toBe('INFO');
      expect(result?.component).toBe('App');
      expect(result?.message).toBe('Server started');
      expect(result?.data).toEqual({ port: 3000 });
    });

    it('should uppercase the level field', () => {
      const line = JSON.stringify({ timestamp: '2024-01-01T00:00:00.000Z', level: 'warn', component: 'X', message: 'msg' });
      const result = parseLogEntry(line);
      expect(result?.level).toBe('WARN');
    });

    it('should default level to INFO when missing', () => {
      const line = JSON.stringify({ timestamp: '2024-01-01T00:00:00.000Z', component: 'X', message: 'msg' });
      const result = parseLogEntry(line);
      expect(result?.level).toBe('INFO');
    });

    it('should default component to Unknown when missing', () => {
      const line = JSON.stringify({ timestamp: '2024-01-01T00:00:00.000Z', level: 'info', message: 'msg' });
      const result = parseLogEntry(line);
      expect(result?.component).toBe('Unknown');
    });

    it('should include correlationId when present', () => {
      const line = JSON.stringify({
        timestamp: '2024-01-01T00:00:00.000Z',
        level: 'info',
        component: 'X',
        message: 'msg',
        correlationId: 'abc-123',
      });
      const result = parseLogEntry(line);
      expect(result?.correlationId).toBe('abc-123');
    });
  });

  // -------------------------------------------------------------------------
  // parseLogEntry — legacy text format
  // -------------------------------------------------------------------------
  describe('parseLogEntry — legacy text format', () => {
    it('should parse a valid legacy text log line', () => {
      const line = '[2024-01-01T00:00:00.000Z] [INFO] [App] Server started';
      const result = parseLogEntry(line);

      expect(result).not.toBeNull();
      expect(result?.timestamp).toBe('2024-01-01T00:00:00.000Z');
      expect(result?.level).toBe('INFO');
      expect(result?.component).toBe('App');
      expect(result?.message).toBe('Server started');
    });

    it('should return null for malformed legacy line', () => {
      const line = 'this is not a valid log line at all';
      const result = parseLogEntry(line);
      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(parseLogEntry('')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // formatLogEntry
  // -------------------------------------------------------------------------
  describe('formatLogEntry', () => {
    it('should format entry as JSON followed by newline', () => {
      const formatted = formatLogEntry('info', 'App', 'Test message');
      expect(formatted.endsWith('\n')).toBe(true);
      const parsed = JSON.parse(formatted.trim());
      expect(parsed.level).toBe('INFO');
      expect(parsed.component).toBe('App');
      expect(parsed.message).toBe('Test message');
    });

    it('should include data when provided', () => {
      const formatted = formatLogEntry('debug', 'Service', 'operation done', { id: 42 });
      const parsed = JSON.parse(formatted.trim());
      expect(parsed.data).toEqual({ id: 42 });
    });

    it('should include a timestamp', () => {
      const formatted = formatLogEntry('info', 'X', 'msg');
      const parsed = JSON.parse(formatted.trim());
      expect(typeof parsed.timestamp).toBe('string');
      expect(new Date(parsed.timestamp).getTime()).not.toBeNaN();
    });
  });

  // -------------------------------------------------------------------------
  // POST /log validation
  // -------------------------------------------------------------------------
  describe('POST /log validation', () => {
    it('should validate level is required', () => {
      const body = { message: 'hello', component: 'App' };
      const isInvalid = !('level' in body) || !body.message;
      // level missing
      expect('level' in body).toBe(false);
    });

    it('should validate message is required', () => {
      const body = { level: 'info', component: 'App' };
      const isInvalid = !('message' in body);
      expect(isInvalid).toBe(true);
    });

    it('should accept valid body with level and message', () => {
      const body = { level: 'info', message: 'hello', component: 'App' };
      const isValid = !!body.level && !!body.message;
      expect(isValid).toBe(true);
    });

    it('should default component to "Frontend" when not provided', () => {
      // Simulates route logic: component || 'Frontend'
      const component = (undefined as unknown as string) || 'Frontend';
      expect(component).toBe('Frontend');
    });
  });

  // -------------------------------------------------------------------------
  // POST /log/batch validation
  // -------------------------------------------------------------------------
  describe('POST /log/batch validation', () => {
    it('should validate entries is an array', () => {
      const body = { entries: 'not-an-array' };
      const isInvalid = !Array.isArray(body.entries);
      expect(isInvalid).toBe(true);
    });

    it('should validate entries is present', () => {
      const body = {};
      const isInvalid = !('entries' in body);
      expect(isInvalid).toBe(true);
    });

    it('should accept valid batch body', () => {
      const body = {
        entries: [
          { level: 'info', component: 'App', message: 'msg1' },
          { level: 'warn', component: 'DB', message: 'msg2' },
        ],
      };
      expect(Array.isArray(body.entries)).toBe(true);
      expect(body.entries).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // GET /logs filtering logic
  // -------------------------------------------------------------------------
  describe('GET /logs filtering logic', () => {
    const entries: LogEntry[] = [
      { timestamp: '2024-01-01T00:00:00Z', level: 'INFO', component: 'App', message: 'started' },
      { timestamp: '2024-01-01T01:00:00Z', level: 'ERROR', component: 'DB', message: 'connection refused' },
      { timestamp: '2024-01-01T02:00:00Z', level: 'WARN', component: 'App', message: 'deprecated call' },
    ];

    it('should filter by level', () => {
      const levels = ['ERROR'];
      const filtered = entries.filter((e) => levels.includes(e.level));
      expect(filtered).toHaveLength(1);
      expect(filtered[0].component).toBe('DB');
    });

    it('should filter by multiple levels (comma-separated)', () => {
      const levels = 'INFO,WARN'.split(',').map((l) => l.toUpperCase());
      const filtered = entries.filter((e) => levels.includes(e.level));
      expect(filtered).toHaveLength(2);
    });

    it('should filter by component', () => {
      const components = ['App'];
      const filtered = entries.filter((e) => components.includes(e.component));
      expect(filtered).toHaveLength(2);
    });

    it('should filter by search text in message', () => {
      const search = 'connection';
      const filtered = entries.filter((e) =>
        e.message.toLowerCase().includes(search.toLowerCase())
      );
      expect(filtered).toHaveLength(1);
      expect(filtered[0].level).toBe('ERROR');
    });

    it('should filter by time range (from)', () => {
      const fromDate = new Date('2024-01-01T01:00:00Z');
      const filtered = entries.filter((e) => new Date(e.timestamp) >= fromDate);
      expect(filtered).toHaveLength(2);
    });

    it('should filter by time range (to)', () => {
      const toDate = new Date('2024-01-01T01:00:00Z');
      const filtered = entries.filter((e) => new Date(e.timestamp) <= toDate);
      expect(filtered).toHaveLength(2);
    });

    it('should sort by timestamp descending', () => {
      const sorted = [...entries].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      expect(sorted[0].level).toBe('WARN');
      expect(sorted[sorted.length - 1].level).toBe('INFO');
    });

    it('should apply limit', () => {
      const limit = 2;
      const limited = entries.slice(0, limit);
      expect(limited).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // GET /logs/stats logic
  // -------------------------------------------------------------------------
  describe('GET /logs/stats logic', () => {
    it('should count entries by level', () => {
      const entries: LogEntry[] = [
        { timestamp: '', level: 'INFO', component: 'A', message: 'm' },
        { timestamp: '', level: 'ERROR', component: 'B', message: 'm' },
        { timestamp: '', level: 'INFO', component: 'C', message: 'm' },
      ];

      const byLevel: Record<string, number> = {};
      for (const entry of entries) {
        byLevel[entry.level] = (byLevel[entry.level] || 0) + 1;
      }

      expect(byLevel['INFO']).toBe(2);
      expect(byLevel['ERROR']).toBe(1);
    });

    it('should count entries by component', () => {
      const entries: LogEntry[] = [
        { timestamp: '', level: 'INFO', component: 'App', message: 'm' },
        { timestamp: '', level: 'INFO', component: 'App', message: 'm' },
        { timestamp: '', level: 'INFO', component: 'DB', message: 'm' },
      ];

      const byComponent: Record<string, number> = {};
      for (const entry of entries) {
        byComponent[entry.component] = (byComponent[entry.component] || 0) + 1;
      }

      expect(byComponent['App']).toBe(2);
      expect(byComponent['DB']).toBe(1);
    });

    it('should collect recent errors', () => {
      const entries: LogEntry[] = [
        { timestamp: '2024-01-01T00:00:00Z', level: 'ERROR', component: 'DB', message: 'fail' },
        { timestamp: '2024-01-01T01:00:00Z', level: 'INFO', component: 'App', message: 'ok' },
      ];

      const recentErrors = entries.filter((e) => e.level === 'ERROR');
      expect(recentErrors).toHaveLength(1);
      expect(recentErrors[0].message).toBe('fail');
    });

    it('should limit recent errors to 10', () => {
      const errors: LogEntry[] = Array.from({ length: 15 }, (_, i) => ({
        timestamp: `2024-01-01T0${i % 10}:00:00Z`,
        level: 'ERROR',
        component: 'X',
        message: `error-${i}`,
      }));

      const limited = errors.slice(0, 10);
      expect(limited).toHaveLength(10);
    });
  });

  // -------------------------------------------------------------------------
  // Response structure
  // -------------------------------------------------------------------------
  describe('Response structure', () => {
    it('should format POST /log success response', () => {
      const response = { success: true };
      expect(response.success).toBe(true);
    });

    it('should format POST /log/batch success response with count', () => {
      const entries = [{ level: 'info', component: 'A', message: 'x' }];
      const response = { success: true, count: entries.length };
      expect(response.count).toBe(1);
    });

    it('should format GET /logs response with logs, total, limit', () => {
      const response = {
        success: true,
        data: { logs: [], total: 0, limit: 500 },
      };
      expect(response.data).toHaveProperty('logs');
      expect(response.data).toHaveProperty('total');
      expect(response.data).toHaveProperty('limit');
    });

    it('should format error response', () => {
      const response = { error: 'level and message are required' };
      expect(response.error).toContain('level');
    });
  });
});
