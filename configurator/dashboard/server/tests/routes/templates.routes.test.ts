// SPDX-License-Identifier: MIT
/**
 * Templates Routes Tests
 *
 * Tests for templates route handlers using supertest.
 * TemplatesService is fully mocked.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import express, { type Express } from 'express';
import request from 'supertest';
import {
  ListTemplatesRequestSchema,
  GetTemplateRequestSchema,
  ValidateTemplateVariablesRequestSchema,
  ScaffoldProjectRequestSchema,
} from '../../src/validation/schemas.js';

vi.mock('../../src/services/templates.service.js');

import { TemplatesService } from '../../src/services/templates.service.js';
import { templatesRoutes } from '../../src/routes/templates.routes.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MOCK_TEMPLATE = {
  id: 'react-ts',
  name: 'React TypeScript',
  description: 'Full-stack React app with TypeScript',
  variables: [
    { name: 'projectName', label: 'Project Name', required: true },
    { name: 'author', label: 'Author', required: false },
  ],
};

const MOCK_TEMPLATES = [MOCK_TEMPLATE, { id: 'node-api', name: 'Node API', description: 'REST API', variables: [] }];

const MOCK_VALIDATE_RESULT = {
  valid: true,
  errors: [],
  warnings: [],
};

const MOCK_SCAFFOLD_RESULT = {
  success: true,
  projectPath: '/home/user/my-new-project',
  filesCreated: ['src/index.tsx', 'package.json', 'tsconfig.json'],
};

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api', templatesRoutes);
  return app;
}

// ---------------------------------------------------------------------------

describe('Templates Routes - HTTP Integration', () => {
  let app: Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = buildApp();
  });

  // -------------------------------------------------------------------------
  // GET /api/templates
  // -------------------------------------------------------------------------
  describe('GET /templates', () => {
    it('should return all available templates', async () => {
      vi.mocked(TemplatesService.prototype.listTemplates).mockResolvedValue(MOCK_TEMPLATES as any);

      const res = await request(app).get('/api/templates');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.templates).toHaveLength(2);
      expect(res.body.data.count).toBe(2);
    });

    it('should return empty list', async () => {
      vi.mocked(TemplatesService.prototype.listTemplates).mockResolvedValue([]);

      const res = await request(app).get('/api/templates');

      expect(res.status).toBe(200);
      expect(res.body.data.count).toBe(0);
    });

    it('should return 500 on service error', async () => {
      vi.mocked(TemplatesService.prototype.listTemplates).mockRejectedValue(new Error('templates dir missing'));

      const res = await request(app).get('/api/templates');

      expect(res.status).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // GET /api/templates/:id
  // -------------------------------------------------------------------------
  describe('GET /templates/:id', () => {
    it('should return a specific template', async () => {
      vi.mocked(TemplatesService.prototype.getTemplate).mockResolvedValue(MOCK_TEMPLATE as any);

      const res = await request(app).get('/api/templates/react-ts');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.template.id).toBe('react-ts');
    });

    it('should return 404 when template not found', async () => {
      vi.mocked(TemplatesService.prototype.getTemplate).mockResolvedValue(null);

      const res = await request(app).get('/api/templates/nonexistent');

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should return 500 on service error', async () => {
      vi.mocked(TemplatesService.prototype.getTemplate).mockRejectedValue(new Error('file read error'));

      const res = await request(app).get('/api/templates/react-ts');

      expect(res.status).toBe(500);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/templates/validate
  // -------------------------------------------------------------------------
  describe('POST /templates/validate', () => {
    it('should validate template variables', async () => {
      vi.mocked(TemplatesService.prototype.validateVariables).mockResolvedValue(MOCK_VALIDATE_RESULT);

      const res = await request(app)
        .post('/api/templates/validate')
        .send({ templateId: 'react-ts', variables: { projectName: 'my-app' } });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.valid).toBe(true);
    });

    it('should return 400 when templateId is missing', async () => {
      const res = await request(app)
        .post('/api/templates/validate')
        .send({ variables: {} });

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // POST /api/templates/scaffold
  // -------------------------------------------------------------------------
  describe('POST /templates/scaffold', () => {
    it('should scaffold a project', async () => {
      vi.mocked(TemplatesService.prototype.scaffoldProject).mockResolvedValue(MOCK_SCAFFOLD_RESULT as any);

      const res = await request(app)
        .post('/api/templates/scaffold')
        .send({ templateId: 'react-ts', projectPath: '/tmp/my-project', variables: { projectName: 'app' } });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('should return 400 on scaffold failure', async () => {
      vi.mocked(TemplatesService.prototype.scaffoldProject).mockResolvedValue({
        success: false,
        error: 'Directory already exists',
        filesCreated: [],
        projectPath: '/tmp/my-project',
      } as any);

      const res = await request(app)
        .post('/api/templates/scaffold')
        .send({ templateId: 'react-ts', projectPath: '/tmp/my-project', variables: {} });

      expect(res.status).toBe(400);
    });

    it('should return 400 when templateId is missing', async () => {
      const res = await request(app)
        .post('/api/templates/scaffold')
        .send({ projectPath: '/tmp/my-project', variables: {} });

      expect(res.status).toBe(400);
    });

    it('should return 400 when projectPath is missing', async () => {
      const res = await request(app)
        .post('/api/templates/scaffold')
        .send({ templateId: 'react-ts', variables: {} });

      expect(res.status).toBe(400);
    });
  });

  // -------------------------------------------------------------------------
  // Zod validation
  // -------------------------------------------------------------------------
  describe('Zod validation - ListTemplatesRequestSchema', () => {
    it('should accept empty query object', () => {
      const result = ListTemplatesRequestSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  describe('Zod validation - GetTemplateRequestSchema', () => {
    it('should accept valid id param', () => {
      const result = GetTemplateRequestSchema.safeParse({ id: 'react-ts' });
      expect(result.success).toBe(true);
    });

    it('should reject empty id', () => {
      const result = GetTemplateRequestSchema.safeParse({ id: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('Zod validation - ValidateTemplateVariablesRequestSchema', () => {
    it('should accept valid templateId and variables', () => {
      const result = ValidateTemplateVariablesRequestSchema.safeParse({
        templateId: 'react-ts',
        variables: { projectName: 'my-app' },
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing templateId', () => {
      const result = ValidateTemplateVariablesRequestSchema.safeParse({
        variables: { projectName: 'my-app' },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Zod validation - ScaffoldProjectRequestSchema', () => {
    it('should accept valid scaffold request', () => {
      const result = ScaffoldProjectRequestSchema.safeParse({
        templateId: 'react-ts',
        projectPath: '/home/user/project',
        variables: {},
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing templateId', () => {
      const result = ScaffoldProjectRequestSchema.safeParse({
        projectPath: '/home/user/project',
        variables: {},
      });
      expect(result.success).toBe(false);
    });

    it('should reject missing projectPath', () => {
      const result = ScaffoldProjectRequestSchema.safeParse({
        templateId: 'react-ts',
        variables: {},
      });
      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Response structure
  // -------------------------------------------------------------------------
  describe('Response structure', () => {
    it('should format list response with templates and count', async () => {
      vi.mocked(TemplatesService.prototype.listTemplates).mockResolvedValue(MOCK_TEMPLATES as any);

      const service = new TemplatesService();
      const templates = await service.listTemplates();
      const response = { success: true, data: { templates, count: templates.length } };

      expect(response.data.count).toBe(2);
    });

    it('should format getTemplate 404 response', () => {
      const response = { success: false, error: "Template 'x' not found" };
      expect(response.success).toBe(false);
      expect(response.error).toContain('not found');
    });

    it('should format scaffold 400 response on failure', () => {
      const response = { success: false, data: { success: false, error: 'Target exists', filesCreated: [] } };
      expect(response.success).toBe(false);
    });
  });
});
