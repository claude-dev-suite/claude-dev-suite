// SPDX-License-Identifier: MIT
/**
 * Templates Routes
 *
 * Endpoints for project scaffolding from templates.
 */

import { Router } from 'express';
import { TemplatesService } from '../services/templates.service.js';
import { validateBody, validateQuery, validateParams } from '../middleware/validateRequest.js';
import {
  ListTemplatesRequestSchema,
  GetTemplateRequestSchema,
  ValidateTemplateVariablesRequestSchema,
  ScaffoldProjectRequestSchema,
} from '../validation/schemas.js';
import type { ApiResponse } from '../types.js';
import type {
  TemplatesListResponse,
  TemplateDetailResponse,
  ValidateVariablesResponse,
  ScaffoldResponse,
} from '../types/templates.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger('templates.routes');
const router = Router();
const templatesService = new TemplatesService();

/**
 * GET /api/templates
 * List all available templates
 */
router.get(
  '/templates',
  validateQuery(ListTemplatesRequestSchema),
  async (_req, res) => {
    try {
      const templates = await templatesService.listTemplates();

      const response: ApiResponse<TemplatesListResponse> = {
        success: true,
        data: {
          templates,
          count: templates.length,
        },
      };

      res.json(response);
    } catch (error) {
      logger.error('Failed to list templates', { error });
      const response: ApiResponse<never> = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list templates',
      };
      res.status(500).json(response);
    }
  }
);

/**
 * GET /api/templates/:id
 * Get detailed information about a specific template
 */
router.get(
  '/templates/:id',
  validateParams(GetTemplateRequestSchema),
  async (req, res) => {
    try {
      const id = req.params.id ?? '';
      const template = await templatesService.getTemplate(id);

      if (!template) {
        const response: ApiResponse<never> = {
          success: false,
          error: `Template '${id}' not found`,
        };
        return res.status(404).json(response);
      }

      const response: ApiResponse<TemplateDetailResponse> = {
        success: true,
        data: { template },
      };

      return res.json(response);
    } catch (error) {
      logger.error('Failed to get template', { error, context: { id: req.params.id } });
      const response: ApiResponse<never> = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get template',
      };
      return res.status(500).json(response);
    }
  }
);

/**
 * POST /api/templates/validate
 * Validate template variables before scaffolding
 */
router.post(
  '/templates/validate',
  validateBody(ValidateTemplateVariablesRequestSchema),
  async (req, res) => {
    try {
      const { templateId, variables } = req.body;
      const result = await templatesService.validateVariables(templateId, variables);

      const response: ApiResponse<ValidateVariablesResponse> = {
        success: true,
        data: result,
      };

      res.json(response);
    } catch (error) {
      logger.error('Failed to validate variables', { error, context: req.body });
      const response: ApiResponse<never> = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to validate variables',
      };
      res.status(500).json(response);
    }
  }
);

/**
 * POST /api/templates/scaffold
 * Create a new project from a template
 */
router.post(
  '/templates/scaffold',
  validateBody(ScaffoldProjectRequestSchema),
  async (req, res) => {
    try {
      const { templateId, projectPath, variables } = req.body;

      const result = await templatesService.scaffoldProject({
        templateId,
        projectPath,
        variables,
      });

      const response: ApiResponse<ScaffoldResponse> = {
        success: result.success,
        data: result,
        error: result.error,
      };

      if (!result.success) {
        return res.status(400).json(response);
      }

      return res.json(response);
    } catch (error) {
      logger.error('Failed to scaffold project', { error, context: req.body });
      const response: ApiResponse<never> = {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to scaffold project',
      };
      return res.status(500).json(response);
    }
  }
);

export { router as templatesRoutes };
