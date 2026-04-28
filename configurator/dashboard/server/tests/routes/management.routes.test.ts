// SPDX-License-Identifier: MIT
/**
 * Management Routes Tests
 *
 * Tests for management route handlers using supertest.
 * ManagementService is fully mocked.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { createTempDir, cleanupTempDir } from '../test-utils.js';

vi.mock('../../src/services/management.service.js');

import { ManagementService } from '../../src/services/management.service.js';
import { managementRoutes } from '../../src/routes/management.routes.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PROJECT_PATH = '/home/user/my-project';

const MOCK_INSTALLED_COMPONENTS = {
  agents: ['react-expert', 'typescript-expert'],
  mcpServers: ['documentation'],
};

const MOCK_NEW_COMPONENTS = {
  newAgents: ['python-expert'],
  newMcpServers: ['code-quality'],
  hasNew: true,
};

const MOCK_UPDATES = {
  hasUpdates: true,
  changes: ['Added 3 new agents', 'Updated documentation MCP server'],
};

const MOCK_PULL_RESULT = {
  updated: true,
  changes: ['Pulled latest agents', 'Updated server configs'],
};

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api', managementRoutes);
  return app;
}

// ---------------------------------------------------------------------------

describe('Management Routes - HTTP Integration', () => {
  let app: Express;
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = createTempDir('management-routes-test-');
  });

  afterAll(() => {
    cleanupTempDir(tmpDir);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });

  // -------------------------------------------------------------------------
  // GET /api/installed-components
  // -------------------------------------------------------------------------
  describe('GET /installed-components', () => {
    it('should return installed components with installed flag', async () => {
      vi.mocked(ManagementService.prototype.getInstalledComponents).mockResolvedValue(MOCK_INSTALLED_COMPONENTS);

      const res = await request(app)
        .get('/api/installed-components')
        .query({ path: tmpDir });

      expect(res.status).toBe(200);
      expect(res.body.installed).toBe(true);
      expect(res.body.agents).toContain('react-expert');
    });

    it('should return installed=false when no components', async () => {
      vi.mocked(ManagementService.prototype.getInstalledComponents).mockResolvedValue({
        agents: [],
        mcpServers: [],
      });

      const res = await request(app)
        .get('/api/installed-components')
        .query({ path: tmpDir });

      expect(res.status).toBe(200);
      expect(res.body.installed).toBe(false);
    });

    it('should return 500 on service error', async () => {
      vi.mocked(ManagementService.prototype.getInstalledComponents).mockRejectedValue(
        new Error('manifest not found')
      );

      const res = await request(app)
        .get('/api/installed-components')
        .query({ path: tmpDir });

      expect(res.status).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/add-agent
  // -------------------------------------------------------------------------
  describe('POST /add-agent', () => {
    it('should add an agent', async () => {
      vi.mocked(ManagementService.prototype.addAgent).mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/add-agent')
        .send({ projectPath: tmpDir, agentId: 'python-expert' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.added).toBe('python-expert');
    });

    it('should return 400 when agentId is missing', async () => {
      const res = await request(app)
        .post('/api/add-agent')
        .send({ projectPath: tmpDir });

      expect(res.status).toBe(400);
    });

    it('should return 500 on service error', async () => {
      vi.mocked(ManagementService.prototype.addAgent).mockRejectedValue(new Error('agent not found'));

      const res = await request(app)
        .post('/api/add-agent')
        .send({ projectPath: tmpDir, agentId: 'unknown-agent' });

      expect(res.status).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/remove-agent
  // -------------------------------------------------------------------------
  describe('POST /remove-agent', () => {
    it('should remove an agent', async () => {
      vi.mocked(ManagementService.prototype.removeAgent).mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/remove-agent')
        .send({ projectPath: tmpDir, agentId: 'react-expert' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.removed).toBe('react-expert');
    });

    it('should return 400 when agentId is missing', async () => {
      const res = await request(app)
        .post('/api/remove-agent')
        .send({ projectPath: tmpDir });

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/add-mcp-server
  // -------------------------------------------------------------------------
  describe('POST /add-mcp-server', () => {
    it('should add an MCP server', async () => {
      vi.mocked(ManagementService.prototype.addMcpServer).mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/add-mcp-server')
        .send({ projectPath: tmpDir, serverName: 'code-quality', envVars: { API_KEY: 'secret' } });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.added).toBe('code-quality');
    });

    it('should return 400 when serverName is missing', async () => {
      const res = await request(app)
        .post('/api/add-mcp-server')
        .send({ projectPath: tmpDir });

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/remove-mcp-server
  // -------------------------------------------------------------------------
  describe('POST /remove-mcp-server', () => {
    it('should remove an MCP server', async () => {
      vi.mocked(ManagementService.prototype.removeMcpServer).mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/remove-mcp-server')
        .send({ projectPath: tmpDir, serverName: 'documentation' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.removed).toBe('documentation');
    });

    it('should return 400 when serverName is missing', async () => {
      const res = await request(app)
        .post('/api/remove-mcp-server')
        .send({ projectPath: tmpDir });

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/new-components
  // -------------------------------------------------------------------------
  describe('GET /new-components', () => {
    it('should return new components', async () => {
      vi.mocked(ManagementService.prototype.getNewComponents).mockResolvedValue(MOCK_NEW_COMPONENTS);

      const res = await request(app)
        .get('/api/new-components')
        .query({ path: tmpDir });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.hasNew).toBe(true);
    });

    it('should return 500 on service error', async () => {
      vi.mocked(ManagementService.prototype.getNewComponents).mockRejectedValue(
        new Error('manifest read failed')
      );

      const res = await request(app)
        .get('/api/new-components')
        .query({ path: tmpDir });

      expect(res.status).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/check-updates
  // -------------------------------------------------------------------------
  describe('GET /check-updates', () => {
    it('should check for updates', async () => {
      vi.mocked(ManagementService.prototype.checkForUpdates).mockResolvedValue(MOCK_UPDATES);

      const res = await request(app).get('/api/check-updates');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.hasUpdates).toBe(true);
    });

    it('should return 500 on service error', async () => {
      vi.mocked(ManagementService.prototype.checkForUpdates).mockRejectedValue(
        new Error('git fetch failed')
      );

      const res = await request(app).get('/api/check-updates');

      expect(res.status).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/pull-updates
  // -------------------------------------------------------------------------
  describe('POST /pull-updates', () => {
    it('should pull updates', async () => {
      vi.mocked(ManagementService.prototype.pullUpdates).mockResolvedValue(MOCK_PULL_RESULT);

      const res = await request(app).post('/api/pull-updates');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.updated).toBe(true);
    });

    it('should return 500 on service error', async () => {
      vi.mocked(ManagementService.prototype.pullUpdates).mockRejectedValue(new Error('network error'));

      const res = await request(app).post('/api/pull-updates');

      expect(res.status).toBe(500);
    });
  });
});
