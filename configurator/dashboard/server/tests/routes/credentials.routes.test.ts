// SPDX-License-Identifier: MIT
/**
 * Credentials Routes Tests
 *
 * Exercises the endpoints over supertest against a real temp-dir credential
 * store. The load-bearing guarantee here is that no response body ever contains
 * the secret — only the masked status.
 */

import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import * as path from 'node:path';
import { createTempDir, cleanupTempDir } from '../test-utils.js';

vi.mock('../../src/utils/logger.js', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// The routes bind to the module-level singleton, which reads the real home
// directory. Redirecting HOME/USERPROFILE before the module is imported points
// that singleton at a temp store instead of the developer's own credentials.
const homeDir = createTempDir('dev-suite-credentials-routes-');
const ORIGINAL_HOME = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
process.env.HOME = homeDir;
process.env.USERPROFILE = homeDir;

const { credentialsRoutes } = await import('../../src/routes/credentials.routes.js');
const { credentialsService } = await import('../../src/services/credentials.service.js');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const API_KEY = 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789ABCD';
const OAUTH_TOKEN = 'sk-ant-oat01-abcdefghijklmnopqrstuvwxyz0123456789ABCD';
const ADMIN_KEY = 'sk-ant-admin01-abcdefghijklmnopqrstuvwxyz0123456789ABCD';

let app: Express;

const ORIGINAL_ENV = {
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN,
};

beforeEach(() => {
  app = express();
  app.use(express.json());
  app.use('/api', credentialsRoutes);

  credentialsService.clear();
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
});

afterEach(() => {
  credentialsService.clear();
  vi.unstubAllGlobals();
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

afterAll(() => {
  cleanupTempDir(homeDir);
  for (const [key, value] of Object.entries(ORIGINAL_HOME)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

// ---------------------------------------------------------------------------

describe('GET /api/credentials', () => {
  it('reports no credential when none is configured', async () => {
    const res = await request(app).get('/api/credentials').expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.configured).toBe(false);
    expect(res.body.data.source).toBe('none');
    expect(res.body.data.storePath).toContain(path.join('.dev-suite', 'credentials.json'));
  });

  it('never returns the stored secret', async () => {
    await request(app).put('/api/credentials').send({ credential: API_KEY }).expect(200);

    const res = await request(app).get('/api/credentials').expect(200);

    expect(res.body.data.configured).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain(API_KEY);
  });
});

describe('PUT /api/credentials', () => {
  it('stores an API key and reports the env var it maps to', async () => {
    const res = await request(app).put('/api/credentials').send({ credential: API_KEY }).expect(200);

    expect(res.body.data.kind).toBe('api_key');
    expect(res.body.data.envVar).toBe('ANTHROPIC_API_KEY');
    expect(res.body.data.source).toBe('stored');
  });

  it('stores an OAuth token under CLAUDE_CODE_OAUTH_TOKEN', async () => {
    const res = await request(app)
      .put('/api/credentials')
      .send({ credential: OAUTH_TOKEN })
      .expect(200);

    expect(res.body.data.kind).toBe('oauth_token');
    expect(res.body.data.envVar).toBe('CLAUDE_CODE_OAUTH_TOKEN');
  });

  it('rejects an Admin API key with an explanation, not a generic failure', async () => {
    const res = await request(app).put('/api/credentials').send({ credential: ADMIN_KEY }).expect(400);

    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/Admin API key/);
    expect(res.body.error).toMatch(/Usage panel/);
  });

  it('rejects an empty credential at the schema boundary', async () => {
    await request(app).put('/api/credentials').send({ credential: '' }).expect(400);
  });

  it('rejects an implausibly long value before it reaches the store', async () => {
    await request(app)
      .put('/api/credentials')
      .send({ credential: 'sk-ant-api03-'.padEnd(600, 'x') })
      .expect(400);
  });

  it('rejects an unknown kind', async () => {
    await request(app)
      .put('/api/credentials')
      .send({ credential: API_KEY, kind: 'admin_key' })
      .expect(400);
  });

  it('accepts an unclassifiable credential when the kind is explicit', async () => {
    const res = await request(app)
      .put('/api/credentials')
      .send({ credential: 'gateway-token-abcdefghijklmnop', kind: 'oauth_token' })
      .expect(200);

    expect(res.body.data.kind).toBe('oauth_token');
  });

  it('asks for an explicit kind rather than guessing', async () => {
    const res = await request(app)
      .put('/api/credentials')
      .send({ credential: 'gateway-token-abcdefghijklmnop' })
      .expect(400);

    expect(res.body.error).toMatch(/Could not tell/);
  });
});

describe('DELETE /api/credentials', () => {
  it('removes the stored credential and falls back to the environment', async () => {
    await request(app).put('/api/credentials').send({ credential: API_KEY }).expect(200);
    process.env.ANTHROPIC_API_KEY = OAUTH_TOKEN.replace('oat', 'api');

    const res = await request(app).delete('/api/credentials').expect(200);

    expect(res.body.data.source).toBe('environment');
  });

  it('is a no-op when nothing is stored', async () => {
    const res = await request(app).delete('/api/credentials').expect(200);
    expect(res.body.data.configured).toBe(false);
  });
});

describe('POST /api/credentials/verify', () => {
  function stubFetch(status: number): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: status >= 200 && status < 300, status } as Response)),
    );
  }

  it('verifies the credential in effect when the body is empty', async () => {
    stubFetch(200);
    await request(app).put('/api/credentials').send({ credential: API_KEY }).expect(200);

    const res = await request(app).post('/api/credentials/verify').send({}).expect(200);

    expect(res.body.data.status).toBe('valid');
  });

  it('reports a rejected credential as invalid', async () => {
    stubFetch(401);
    await request(app).put('/api/credentials').send({ credential: API_KEY }).expect(200);

    const res = await request(app).post('/api/credentials/verify').send({}).expect(200);

    expect(res.body.data.status).toBe('invalid');
    expect(res.body.data.httpStatus).toBe(401);
  });

  it('verifies a candidate without storing it', async () => {
    stubFetch(200);

    const res = await request(app)
      .post('/api/credentials/verify')
      .send({ credential: API_KEY })
      .expect(200);

    expect(res.body.data.status).toBe('valid');
    expect((await request(app).get('/api/credentials')).body.data.configured).toBe(false);
  });

  it('never echoes the candidate back in the response', async () => {
    stubFetch(401);

    const res = await request(app)
      .post('/api/credentials/verify')
      .send({ credential: API_KEY })
      .expect(200);

    expect(JSON.stringify(res.body)).not.toContain(API_KEY);
  });
});
