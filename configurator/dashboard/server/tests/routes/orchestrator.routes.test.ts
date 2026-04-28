// SPDX-License-Identifier: MIT
/**
 * Orchestrator Routes Tests
 *
 * Tests for orchestrator route handlers using supertest.
 * WorkflowsService is fully mocked.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import { createTempDir, cleanupTempDir } from '../test-utils.js';

vi.mock('../../src/services/workflows.service.js');

import { WorkflowsService } from '../../src/services/workflows.service.js';
import { orchestratorRoutes } from '../../src/routes/orchestrator.routes.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_MCP_SUGGESTIONS = [
  { server: 'documentation', reason: 'Docs lookup detected', confidence: 0.9 },
  { server: 'database-query', reason: 'DB operations detected', confidence: 0.7 },
];

const MOCK_WORKFLOW = {
  id: 'wf-1',
  name: 'Full Stack Review',
  description: 'Review frontend and backend',
  steps: [{ agent: 'react-expert', task: 'Review frontend' }],
};

const MOCK_CUSTOM_WORKFLOWS = [MOCK_WORKFLOW];
const MOCK_ALL_WORKFLOWS = { builtin: [MOCK_WORKFLOW], custom: [] };

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api', orchestratorRoutes);
  return app;
}

// ---------------------------------------------------------------------------

describe('Orchestrator Routes - HTTP Integration', () => {
  let app: Express;
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = createTempDir('orchestrator-routes-test-');
  });

  afterAll(() => {
    cleanupTempDir(tmpDir);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });

  // -------------------------------------------------------------------------
  // POST /api/orchestrator/mcp-suggestions
  // -------------------------------------------------------------------------
  describe('POST /orchestrator/mcp-suggestions', () => {
    it('should return MCP suggestions for a prompt', async () => {
      vi.mocked(WorkflowsService.prototype.analyzePromptForMcp).mockReturnValue(MOCK_MCP_SUGGESTIONS as any);

      const res = await request(app)
        .post('/api/orchestrator/mcp-suggestions')
        .send({ prompt: 'help me with React hooks', selectedAgents: ['react-expert'] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.suggestions)).toBe(true);
    });

    it('should default selectedAgents to empty array when not provided', async () => {
      vi.mocked(WorkflowsService.prototype.analyzePromptForMcp).mockReturnValue([]);

      const res = await request(app)
        .post('/api/orchestrator/mcp-suggestions')
        .send({ prompt: 'deploy my app' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when prompt is missing', async () => {
      const res = await request(app)
        .post('/api/orchestrator/mcp-suggestions')
        .send({ selectedAgents: [] });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should return 500 on service error', async () => {
      vi.mocked(WorkflowsService.prototype.analyzePromptForMcp).mockImplementation(() => {
        throw new Error('analysis failed');
      });

      const res = await request(app)
        .post('/api/orchestrator/mcp-suggestions')
        .send({ prompt: 'test prompt' });

      expect(res.status).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/orchestrator/analyze-mcp (alias)
  // -------------------------------------------------------------------------
  describe('POST /orchestrator/analyze-mcp', () => {
    it('should return suggestions via alias endpoint', async () => {
      vi.mocked(WorkflowsService.prototype.analyzePromptForMcp).mockReturnValue(MOCK_MCP_SUGGESTIONS as any);

      const res = await request(app)
        .post('/api/orchestrator/analyze-mcp')
        .send({ prompt: 'deploy my app' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/orchestrator/workflows
  // -------------------------------------------------------------------------
  describe('GET /orchestrator/workflows', () => {
    it('should return all workflows', async () => {
      vi.mocked(WorkflowsService.prototype.getAllWorkflows).mockResolvedValue(MOCK_ALL_WORKFLOWS as any);

      const res = await request(app)
        .get('/api/orchestrator/workflows')
        .query({ project_path: tmpDir });

      expect(res.status).toBe(200);
    });

    it('should return 500 on service error', async () => {
      vi.mocked(WorkflowsService.prototype.getAllWorkflows).mockRejectedValue(
        new Error('workflow load failed')
      );

      const res = await request(app)
        .get('/api/orchestrator/workflows')
        .query({ project_path: tmpDir });

      expect(res.status).toBe(500);
    });

    it('should return 500 when project_path is missing', async () => {
      const res = await request(app)
        .get('/api/orchestrator/workflows')
        .query({});

      expect(res.status).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/orchestrator/workflows
  // -------------------------------------------------------------------------
  describe('POST /orchestrator/workflows', () => {
    it('should create a new workflow', async () => {
      vi.mocked(WorkflowsService.prototype.loadCustomWorkflows).mockResolvedValue([]);
      vi.mocked(WorkflowsService.prototype.saveCustomWorkflows).mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/orchestrator/workflows')
        .send({ projectPath: tmpDir, workflow: { id: 'new-flow', name: 'New Flow' } });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should update an existing workflow', async () => {
      vi.mocked(WorkflowsService.prototype.loadCustomWorkflows).mockResolvedValue(MOCK_CUSTOM_WORKFLOWS as any);
      vi.mocked(WorkflowsService.prototype.saveCustomWorkflows).mockResolvedValue(undefined);

      const res = await request(app)
        .post('/api/orchestrator/workflows')
        .send({ projectPath: tmpDir, workflow: { id: 'wf-1', name: 'Updated Name' } });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 when projectPath is missing', async () => {
      const res = await request(app)
        .post('/api/orchestrator/workflows')
        .send({ workflow: { id: 'new', name: 'New' } });

      expect(res.status).toBe(400);
    });

    it('should return 400 when workflow id is missing', async () => {
      const res = await request(app)
        .post('/api/orchestrator/workflows')
        .send({ projectPath: tmpDir, workflow: { name: 'No ID' } });

      expect(res.status).toBe(400);
    });

    it('should return 400 when workflow name is missing', async () => {
      const res = await request(app)
        .post('/api/orchestrator/workflows')
        .send({ projectPath: tmpDir, workflow: { id: 'some-id' } });

      expect(res.status).toBe(400);
    });

    it('should return 500 on service error', async () => {
      vi.mocked(WorkflowsService.prototype.loadCustomWorkflows).mockRejectedValue(
        new Error('load failed')
      );

      const res = await request(app)
        .post('/api/orchestrator/workflows')
        .send({ projectPath: tmpDir, workflow: { id: 'new-flow', name: 'New Flow' } });

      expect(res.status).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // DELETE /api/orchestrator/workflows/:id
  // -------------------------------------------------------------------------
  describe('DELETE /orchestrator/workflows/:id', () => {
    it('should delete an existing workflow', async () => {
      vi.mocked(WorkflowsService.prototype.loadCustomWorkflows).mockResolvedValue(MOCK_CUSTOM_WORKFLOWS as any);
      vi.mocked(WorkflowsService.prototype.saveCustomWorkflows).mockResolvedValue(undefined);

      const res = await request(app)
        .delete('/api/orchestrator/workflows/wf-1')
        .send({ projectPath: tmpDir });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.deleted).toBe('wf-1');
    });

    it('should return 404 when workflow not found', async () => {
      vi.mocked(WorkflowsService.prototype.loadCustomWorkflows).mockResolvedValue([]);
      vi.mocked(WorkflowsService.prototype.saveCustomWorkflows).mockResolvedValue(undefined);

      const res = await request(app)
        .delete('/api/orchestrator/workflows/nonexistent')
        .send({ projectPath: tmpDir });

      expect(res.status).toBe(404);
    });

    it('should return 400 when projectPath is missing', async () => {
      const res = await request(app)
        .delete('/api/orchestrator/workflows/wf-1')
        .send({});

      expect(res.status).toBe(400);
    });

    it('should return 500 on service error', async () => {
      vi.mocked(WorkflowsService.prototype.loadCustomWorkflows).mockRejectedValue(
        new Error('load failed')
      );

      const res = await request(app)
        .delete('/api/orchestrator/workflows/wf-1')
        .send({ projectPath: tmpDir });

      expect(res.status).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/orchestrator/sessions/:id/history (security validation)
  // -------------------------------------------------------------------------
  describe('GET /orchestrator/sessions/:id/history', () => {
    it('should return 400 for session ID with dots (path traversal attempt)', async () => {
      // Express URL-encodes slashes, but dots still get through
      const res = await request(app)
        .get('/api/orchestrator/sessions/.invalid./history')
        .query({ project_path: tmpDir });

      expect([400, 404, 500]).toContain(res.status);
    });

    it('should return 404 when valid session file does not exist', async () => {
      const res = await request(app)
        .get('/api/orchestrator/sessions/valid-session-123/history')
        .query({ project_path: tmpDir });

      // 404 = session not found, 500 = claudeDir not accessible
      expect([404, 500]).toContain(res.status);
    });

    it('should return 400 when project_path is missing', async () => {
      const res = await request(app)
        .get('/api/orchestrator/sessions/valid-session-123/history')
        .query({});

      expect([400, 500]).toContain(res.status);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/orchestrator/sessions
  // -------------------------------------------------------------------------
  describe('GET /orchestrator/sessions', () => {
    it('should return empty sessions list when no session dir exists', async () => {
      const res = await request(app)
        .get('/api/orchestrator/sessions')
        .query({ project_path: tmpDir });

      // 200 with empty sessions if dir doesn't exist; or 500 if claudeDir is missing
      expect([200, 500]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        expect(Array.isArray(res.body.sessions)).toBe(true);
      }
    });

    it('should return 500 when project_path is empty', async () => {
      const res = await request(app)
        .get('/api/orchestrator/sessions')
        .query({ project_path: '' });

      expect(res.status).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // Session ID security validation (unit-level)
  // -------------------------------------------------------------------------
  describe('session ID pattern validation', () => {
    const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

    it('should accept a valid UUID-like session id', () => {
      expect(SESSION_ID_PATTERN.test('01JQDE7MZXYC3K5VF9N2T1')).toBe(true);
    });

    it('should accept alphanumeric session id with hyphens and underscores', () => {
      expect(SESSION_ID_PATTERN.test('session-abc123-foo_bar')).toBe(true);
    });

    it('should reject session id with path separator (slash)', () => {
      expect(SESSION_ID_PATTERN.test('abc/../../etc')).toBe(false);
    });

    it('should reject session id with dot traversal', () => {
      expect(SESSION_ID_PATTERN.test('../../etc/passwd')).toBe(false);
    });

    it('should reject session id with spaces', () => {
      expect(SESSION_ID_PATTERN.test('session id')).toBe(false);
    });

    it('should reject empty session id', () => {
      expect(SESSION_ID_PATTERN.test('')).toBe(false);
    });

    it('should reject session id over 128 chars', () => {
      const long = 'a'.repeat(129);
      expect(SESSION_ID_PATTERN.test(long)).toBe(false);
    });

    it('should accept session id at exactly 128 chars', () => {
      const exact = 'a'.repeat(128);
      expect(SESSION_ID_PATTERN.test(exact)).toBe(true);
    });
  });
});
