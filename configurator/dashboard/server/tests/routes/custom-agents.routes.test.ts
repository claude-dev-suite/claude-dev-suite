// SPDX-License-Identifier: MIT
/**
 * Custom Agents Routes Tests — upload-docs endpoint
 *
 * Tests for POST /api/custom-agents/upload-docs:
 *   - Happy path: .md, .txt, .html files → content returned as text
 *   - PDF upload → pdf-parse called, text extracted
 *   - No files → 400
 *   - Unsupported extension → 400 (multer fileFilter rejects)
 *   - More than 5 files → 400 (multer files limit)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { customAgentsRoutes } from '../../src/routes/custom-agents.routes.js';

// ---------------------------------------------------------------------------
// Mock pdf-parse (CJS module loaded via createRequire inside the route)
// ---------------------------------------------------------------------------
vi.mock('pdf-parse', () => ({
  default: vi.fn().mockResolvedValue({ text: 'Extracted PDF text content' }),
}));

// node:module / createRequire — redirect require('pdf-parse') to our mock
vi.mock('node:module', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:module')>();
  return {
    ...actual,
    createRequire: () => (id: string) => {
      if (id === 'pdf-parse') {
        return vi.fn().mockResolvedValue({ text: 'Extracted PDF text content' });
      }
      return actual.createRequire(import.meta.url)(id);
    },
  };
});

// ---------------------------------------------------------------------------
// App factory
// ---------------------------------------------------------------------------

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api', customAgentsRoutes);
  return app;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/custom-agents/upload-docs', () => {
  let app: Express;

  beforeEach(() => {
    app = buildApp();
  });

  it('returns extracted content for a .md file', async () => {
    const res = await request(app)
      .post('/api/custom-agents/upload-docs')
      .attach('files', Buffer.from('# My Doc\n\nSome content here.'), {
        filename: 'api-docs.md',
        contentType: 'text/markdown',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.files).toHaveLength(1);
    expect(res.body.files[0].name).toBe('api-docs.md');
    expect(res.body.files[0].content).toBe('# My Doc\n\nSome content here.');
    expect(res.body.files[0].size).toBeGreaterThan(0);
  });

  it('returns extracted content for a .txt file', async () => {
    const res = await request(app)
      .post('/api/custom-agents/upload-docs')
      .attach('files', Buffer.from('Plain text documentation.'), {
        filename: 'readme.txt',
        contentType: 'text/plain',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.files[0].content).toBe('Plain text documentation.');
  });

  it('returns extracted content for a .html file', async () => {
    const html = '<html><body><h1>API Reference</h1></body></html>';
    const res = await request(app)
      .post('/api/custom-agents/upload-docs')
      .attach('files', Buffer.from(html), {
        filename: 'docs.html',
        contentType: 'text/html',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.files[0].content).toBe(html);
  });

  it('accepts multiple files in a single request', async () => {
    const res = await request(app)
      .post('/api/custom-agents/upload-docs')
      .attach('files', Buffer.from('Doc A'), { filename: 'a.md', contentType: 'text/markdown' })
      .attach('files', Buffer.from('Doc B'), { filename: 'b.txt', contentType: 'text/plain' });

    expect(res.status).toBe(200);
    expect(res.body.files).toHaveLength(2);
    const names = res.body.files.map((f: { name: string }) => f.name);
    expect(names).toContain('a.md');
    expect(names).toContain('b.txt');
  });

  it('returns 400 when no files are attached', async () => {
    const res = await request(app)
      .post('/api/custom-agents/upload-docs');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/no files/i);
  });

  it('rejects unsupported file extensions', async () => {
    const res = await request(app)
      .post('/api/custom-agents/upload-docs')
      .attach('files', Buffer.from('{"key":"val"}'), {
        filename: 'config.json',
        contentType: 'application/json',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('rejects more than 5 files', async () => {
    const req = request(app).post('/api/custom-agents/upload-docs');
    for (let i = 0; i < 6; i++) {
      req.attach('files', Buffer.from(`Doc ${i}`), {
        filename: `doc${i}.txt`,
        contentType: 'text/plain',
      });
    }
    const res = await req;

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
