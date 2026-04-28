// SPDX-License-Identifier: MIT
/**
 * Rules Routes Tests
 *
 * Tests for rules route handler using supertest.
 * RulesService is fully mocked.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';

vi.mock('../../src/services/rules.service.js');

import { RulesService } from '../../src/services/rules.service.js';
import { rulesRoutes } from '../../src/routes/rules.routes.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_RULES = [
  { id: 'eslint', name: 'ESLint Rules', description: 'JavaScript linting rules', category: 'code-quality' },
  { id: 'prettier', name: 'Prettier Config', description: 'Code formatting rules', category: 'formatting' },
  { id: 'typescript', name: 'TypeScript Rules', description: 'Type checking rules', category: 'typing' },
];

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/rules', rulesRoutes);
  return app;
}

// ---------------------------------------------------------------------------

describe('Rules Routes - HTTP Integration', () => {
  let app: Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });

  // -------------------------------------------------------------------------
  // GET /api/rules
  // -------------------------------------------------------------------------
  describe('GET /rules', () => {
    it('should return all available rules', async () => {
      vi.mocked(RulesService.prototype.getRules).mockResolvedValue(MOCK_RULES);

      const res = await request(app).get('/api/rules');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(3);
    });

    it('should return empty array when no rules', async () => {
      vi.mocked(RulesService.prototype.getRules).mockResolvedValue([]);

      const res = await request(app).get('/api/rules');

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });

    it('should return 500 on service error', async () => {
      vi.mocked(RulesService.prototype.getRules).mockRejectedValue(new Error('Failed to load rules'));

      const res = await request(app).get('/api/rules');

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
    });
  });
});
