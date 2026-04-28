// SPDX-License-Identifier: MIT
/**
 * Hooks Routes Tests
 *
 * Tests for hooks route handlers using supertest.
 * Services are fully mocked.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { createTempDir, cleanupTempDir } from '../test-utils.js';

vi.mock('../../src/services/hooks.service.js');
vi.mock('../../src/services/detection.service.js');

import { HooksService } from '../../src/services/hooks.service.js';
import { DetectionService } from '../../src/services/detection.service.js';
import { hooksRoutes } from '../../src/routes/hooks.routes.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_HOOKS_STATUS = {
  installed: true,
  hooks: { 'pre-commit': true, 'commit-msg': false },
};

const MOCK_INSTALL_RESULT = { success: true, installed: ['pre-commit'], error: undefined };
const MOCK_UNINSTALL_RESULT = { success: true, removed: ['pre-commit'] };
const MOCK_CLAUDE_HOOK_STATUS = { hooks: [], count: 0 };
const MOCK_OP_RESULT = { success: true };
const MOCK_EXPORT = { version: '1.0.0', hooks: [], exportedAt: new Date().toISOString() };
const MOCK_REPOS = [{ path: '/tmp/repo', name: 'repo', hooks: { installed: true } }];

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api', hooksRoutes);
  return app;
}

// ---------------------------------------------------------------------------

describe('Hooks Routes - HTTP Integration', () => {
  let app: Express;
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = createTempDir('hooks-routes-test-');
  });

  afterAll(() => {
    cleanupTempDir(tmpDir);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });

  // -------------------------------------------------------------------------
  // GET /api/hooks/repositories
  // -------------------------------------------------------------------------
  describe('GET /hooks/repositories', () => {
    it('should return repositories with hooks info', async () => {
      vi.mocked(DetectionService.prototype.detectGitRepos).mockResolvedValue([
        { path: tmpDir, name: 'test-repo' },
      ]);
      vi.mocked(HooksService.prototype.getAvailableRepositories).mockReturnValue(MOCK_REPOS);

      const res = await request(app)
        .get('/api/hooks/repositories')
        .query({ path: tmpDir });

      expect(res.status).toBe(200);
      expect(res.body.repositories).toBeDefined();
    });

    it('should return 400 when path is missing', async () => {
      const res = await request(app).get('/api/hooks/repositories').query({});
      expect(res.status).toBe(400);
    });

    it('should return 500 on detection error', async () => {
      vi.mocked(DetectionService.prototype.detectGitRepos).mockRejectedValue(
        new Error('detection failed')
      );

      const res = await request(app)
        .get('/api/hooks/repositories')
        .query({ path: tmpDir });

      expect(res.status).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/hooks/status
  // -------------------------------------------------------------------------
  describe('GET /hooks/status', () => {
    it('should return hooks status', async () => {
      vi.mocked(HooksService.prototype.getGitHooksStatus).mockReturnValue(MOCK_HOOKS_STATUS);

      const res = await request(app)
        .get('/api/hooks/status')
        .query({ path: tmpDir });

      expect(res.status).toBe(200);
      expect(res.body.installed).toBe(true);
    });

    it('should return 400 when path is missing', async () => {
      const res = await request(app).get('/api/hooks/status').query({});
      expect(res.status).toBe(400);
    });

    it('should return 500 on service error', async () => {
      vi.mocked(HooksService.prototype.getGitHooksStatus).mockImplementation(() => {
        throw new Error('hooks dir missing');
      });

      const res = await request(app)
        .get('/api/hooks/status')
        .query({ path: tmpDir });

      expect(res.status).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/hooks/status/:repoPath
  // -------------------------------------------------------------------------
  describe('GET /hooks/status/:repoPath', () => {
    it('should return status for specific repo', async () => {
      vi.mocked(HooksService.prototype.getHooksStatusForRepo).mockReturnValue(MOCK_HOOKS_STATUS);

      const res = await request(app)
        .get('/api/hooks/status/sub-repo')
        .query({ path: tmpDir });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/hooks/install
  // -------------------------------------------------------------------------
  describe('POST /hooks/install', () => {
    it('should install hooks', async () => {
      vi.mocked(HooksService.prototype.installHooks).mockReturnValue(MOCK_INSTALL_RESULT);

      const res = await request(app)
        .post('/api/hooks/install')
        .send({ projectPath: tmpDir, config: { preCommit: true } });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when projectPath is missing', async () => {
      const res = await request(app)
        .post('/api/hooks/install')
        .send({ config: {} });

      expect(res.status).toBe(400);
    });

    it('should return 500 on service error', async () => {
      vi.mocked(HooksService.prototype.installHooks).mockImplementation(() => {
        throw new Error('write failed');
      });

      const res = await request(app)
        .post('/api/hooks/install')
        .send({ projectPath: tmpDir, config: {} });

      expect(res.status).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/hooks/install/:repoPath
  // -------------------------------------------------------------------------
  describe('POST /hooks/install/:repoPath', () => {
    it('should install hooks for specific repo', async () => {
      vi.mocked(HooksService.prototype.installHooksForRepo).mockReturnValue(MOCK_INSTALL_RESULT);

      const res = await request(app)
        .post('/api/hooks/install/sub-repo')
        .send({ projectPath: tmpDir, config: {} });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/hooks/uninstall
  // -------------------------------------------------------------------------
  describe('POST /hooks/uninstall', () => {
    it('should uninstall hooks', async () => {
      vi.mocked(HooksService.prototype.uninstallHooks).mockReturnValue(MOCK_UNINSTALL_RESULT);

      const res = await request(app)
        .post('/api/hooks/uninstall')
        .send({ projectPath: tmpDir });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 500 on service error', async () => {
      vi.mocked(HooksService.prototype.uninstallHooks).mockImplementation(() => {
        throw new Error('remove failed');
      });

      const res = await request(app)
        .post('/api/hooks/uninstall')
        .send({ projectPath: tmpDir });

      expect(res.status).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/hooks/uninstall/:repoPath
  // -------------------------------------------------------------------------
  describe('POST /hooks/uninstall/:repoPath', () => {
    it('should uninstall hooks for specific repo', async () => {
      vi.mocked(HooksService.prototype.uninstallHooksForRepo).mockReturnValue(MOCK_UNINSTALL_RESULT);

      const res = await request(app)
        .post('/api/hooks/uninstall/sub-repo')
        .send({ projectPath: tmpDir });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when projectPath is missing', async () => {
      const res = await request(app)
        .post('/api/hooks/uninstall/sub-repo')
        .send({});

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/claude-hooks/status
  // -------------------------------------------------------------------------
  describe('GET /claude-hooks/status', () => {
    it('should return Claude hooks status', async () => {
      vi.mocked(HooksService.prototype.getClaudeHooksStatus).mockReturnValue(MOCK_CLAUDE_HOOK_STATUS);

      const res = await request(app)
        .get('/api/claude-hooks/status')
        .query({ path: tmpDir });

      expect(res.status).toBe(200);
    });

    it('should return 500 on service error', async () => {
      vi.mocked(HooksService.prototype.getClaudeHooksStatus).mockImplementation(() => {
        throw new Error('status read failed');
      });

      const res = await request(app)
        .get('/api/claude-hooks/status')
        .query({ path: tmpDir });

      expect(res.status).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/claude-hooks/add
  // -------------------------------------------------------------------------
  describe('POST /claude-hooks/add', () => {
    it('should add a Claude hook', async () => {
      vi.mocked(HooksService.prototype.addClaudeHook).mockReturnValue(MOCK_OP_RESULT);

      const res = await request(app)
        .post('/api/claude-hooks/add')
        .send({
          projectPath: tmpDir,
          hook: { id: 'h1', event: 'PreToolUse', command: 'echo x', description: 'd', enabled: true },
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when hook is missing', async () => {
      const res = await request(app)
        .post('/api/claude-hooks/add')
        .send({ projectPath: tmpDir });

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/claude-hooks/update
  // -------------------------------------------------------------------------
  describe('POST /claude-hooks/update', () => {
    it('should update a Claude hook', async () => {
      vi.mocked(HooksService.prototype.updateClaudeHook).mockReturnValue(MOCK_OP_RESULT);

      const res = await request(app)
        .post('/api/claude-hooks/update')
        .send({ projectPath: tmpDir, hookId: 'h1', config: { description: 'new desc' } });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when hookId is missing', async () => {
      const res = await request(app)
        .post('/api/claude-hooks/update')
        .send({ projectPath: tmpDir, config: {} });

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/claude-hooks/remove
  // -------------------------------------------------------------------------
  describe('POST /claude-hooks/remove', () => {
    it('should remove a Claude hook', async () => {
      vi.mocked(HooksService.prototype.removeClaudeHook).mockReturnValue(MOCK_OP_RESULT);

      const res = await request(app)
        .post('/api/claude-hooks/remove')
        .send({ projectPath: tmpDir, hookId: 'h1' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when hookId is missing', async () => {
      const res = await request(app)
        .post('/api/claude-hooks/remove')
        .send({ projectPath: tmpDir });

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/claude-hooks/apply-template
  // -------------------------------------------------------------------------
  describe('POST /claude-hooks/apply-template', () => {
    it('should apply a template', async () => {
      vi.mocked(HooksService.prototype.applyClaudeTemplate).mockReturnValue(MOCK_OP_RESULT);

      const res = await request(app)
        .post('/api/claude-hooks/apply-template')
        .send({ projectPath: tmpDir, templateId: 'security-audit' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when templateId is missing', async () => {
      const res = await request(app)
        .post('/api/claude-hooks/apply-template')
        .send({ projectPath: tmpDir });

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/claude-hooks/clear
  // -------------------------------------------------------------------------
  describe('POST /claude-hooks/clear', () => {
    it('should clear all Claude hooks', async () => {
      vi.mocked(HooksService.prototype.clearAllClaudeHooks).mockReturnValue(MOCK_OP_RESULT);

      const res = await request(app)
        .post('/api/claude-hooks/clear')
        .send({ projectPath: tmpDir });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 500 on service error', async () => {
      vi.mocked(HooksService.prototype.clearAllClaudeHooks).mockImplementation(() => {
        throw new Error('clear failed');
      });

      const res = await request(app)
        .post('/api/claude-hooks/clear')
        .send({ projectPath: tmpDir });

      expect(res.status).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/claude-hooks/export
  // -------------------------------------------------------------------------
  describe('GET /claude-hooks/export', () => {
    it('should export Claude hooks', async () => {
      vi.mocked(HooksService.prototype.exportClaudeHooks).mockReturnValue(MOCK_EXPORT);

      const res = await request(app)
        .get('/api/claude-hooks/export')
        .query({ path: tmpDir });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.version).toBe('1.0.0');
    });

    it('should return 500 on service error', async () => {
      vi.mocked(HooksService.prototype.exportClaudeHooks).mockImplementation(() => {
        throw new Error('export failed');
      });

      const res = await request(app)
        .get('/api/claude-hooks/export')
        .query({ path: tmpDir });

      expect(res.status).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/claude-hooks/import
  // -------------------------------------------------------------------------
  describe('POST /claude-hooks/import', () => {
    it('should import Claude hooks', async () => {
      vi.mocked(HooksService.prototype.importClaudeHooks).mockReturnValue(MOCK_OP_RESULT);

      const res = await request(app)
        .post('/api/claude-hooks/import')
        .send({
          projectPath: tmpDir,
          exported: { version: '1.0.0', hooks: [], exportedAt: new Date().toISOString() },
          merge: true,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when exported data is missing', async () => {
      const res = await request(app)
        .post('/api/claude-hooks/import')
        .send({ projectPath: tmpDir });

      expect(res.status).toBe(400);
    });
  });
});
