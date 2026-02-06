// SPDX-License-Identifier: MIT
/**
 * Recipes Routes
 *
 * API endpoints for automation recipes management.
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { RecipesService } from '../services/recipes.service.js';
import { validateQuery, validateBody } from '../middleware/validateRequest.js';
import { getLogger } from '../utils/logger.js';
import type { ApiResponse } from '../types.js';

const logger = getLogger('RecipesRoutes');
const router = Router();
const recipesService = new RecipesService();

// ============================================
// VALIDATION SCHEMAS
// ============================================

const ProjectPathSchema = z.object({
  path: z.string().min(1, 'Project path is required'),
});

const EnableRecipeSchema = z.object({
  projectPath: z.string().min(1, 'Project path is required'),
  recipeId: z.string().min(1, 'Recipe ID is required'),
  customOptions: z.record(z.unknown()).optional(),
});

const DisableRecipeSchema = z.object({
  projectPath: z.string().min(1, 'Project path is required'),
  recipeId: z.string().min(1, 'Recipe ID is required'),
});

const CustomizeRecipeSchema = z.object({
  projectPath: z.string().min(1, 'Project path is required'),
  recipeId: z.string().min(1, 'Recipe ID is required'),
  options: z.record(z.unknown()),
});

const TestRecipeSchema = z.object({
  projectPath: z.string().min(1, 'Project path is required'),
  recipeId: z.string().min(1, 'Recipe ID is required'),
  customOptions: z.record(z.unknown()).optional(),
});

// ============================================
// ROUTES
// ============================================

/**
 * GET /api/automation-recipes
 *
 * Get all available automation recipes.
 */
router.get('/automation-recipes', async (_req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    const recipes = recipesService.getAllRecipes();
    const categories = recipesService.getRecipesByCategory();

    const response: ApiResponse<{ recipes: typeof recipes; categories: typeof categories }> = {
      success: true,
      data: { recipes, categories },
    };

    logger.info('Retrieved automation recipes', {
      context: { count: recipes.length },
      timing: { durationMs: Date.now() - startTime },
    });

    res.json(response);
  } catch (error) {
    logger.error('Failed to get automation recipes', {
      error,
      timing: { durationMs: Date.now() - startTime },
    });

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get recipes',
    });
  }
});

/**
 * GET /api/automation-recipes/recommended
 *
 * Get recommended recipes for a project based on detected tools.
 */
router.get(
  '/automation-recipes/recommended',
  validateQuery(ProjectPathSchema),
  async (req: Request, res: Response) => {
    const startTime = Date.now();

    try {
      const { path: projectPath } = req.query as { path: string };

      const recommendations = recipesService.getRecommendedRecipes(projectPath);
      const enabledAutomations = recipesService.getEnabledAutomations(projectPath);

      const response: ApiResponse<{ recommendations: typeof recommendations; enabled: typeof enabledAutomations }> = {
        success: true,
        data: { recommendations, enabled: enabledAutomations },
      };

      logger.info('Retrieved recipe recommendations', {
        context: { projectPath, recommendationCount: recommendations.length, enabledCount: enabledAutomations.length },
        timing: { durationMs: Date.now() - startTime },
      });

      res.json(response);
    } catch (error) {
      logger.error('Failed to get recipe recommendations', {
        error,
        timing: { durationMs: Date.now() - startTime },
      });

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get recommendations',
      });
    }
  }
);

/**
 * GET /api/automation-recipes/enabled
 *
 * Get enabled automations for a project.
 */
router.get(
  '/automation-recipes/enabled',
  validateQuery(ProjectPathSchema),
  async (req: Request, res: Response) => {
    const startTime = Date.now();

    try {
      const { path: projectPath } = req.query as { path: string };

      const enabled = recipesService.getEnabledAutomations(projectPath);

      const response: ApiResponse<typeof enabled> = {
        success: true,
        data: enabled,
      };

      logger.info('Retrieved enabled automations', {
        context: { projectPath, count: enabled.length },
        timing: { durationMs: Date.now() - startTime },
      });

      res.json(response);
    } catch (error) {
      logger.error('Failed to get enabled automations', {
        error,
        timing: { durationMs: Date.now() - startTime },
      });

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get enabled automations',
      });
    }
  }
);

/**
 * POST /api/automation/enable
 *
 * Enable an automation recipe.
 */
router.post(
  '/automation/enable',
  validateBody(EnableRecipeSchema),
  async (req: Request, res: Response) => {
    const startTime = Date.now();

    try {
      const { projectPath, recipeId, customOptions } = req.body as {
        projectPath: string;
        recipeId: string;
        customOptions?: Record<string, unknown>;
      };

      logger.info('Enabling automation recipe', { context: { projectPath, recipeId } });

      const result = await recipesService.enableRecipe(projectPath, recipeId, customOptions);

      const response: ApiResponse<typeof result> = {
        success: result.success,
        data: result,
        error: result.error,
      };

      logger.info('Enable recipe result', {
        context: { projectPath, recipeId, success: result.success },
        timing: { durationMs: Date.now() - startTime },
      });

      res.json(response);
    } catch (error) {
      logger.error('Failed to enable recipe', {
        error,
        timing: { durationMs: Date.now() - startTime },
      });

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to enable recipe',
      });
    }
  }
);

/**
 * POST /api/automation/disable
 *
 * Disable an automation recipe.
 */
router.post(
  '/automation/disable',
  validateBody(DisableRecipeSchema),
  async (req: Request, res: Response) => {
    const startTime = Date.now();

    try {
      const { projectPath, recipeId } = req.body as {
        projectPath: string;
        recipeId: string;
      };

      logger.info('Disabling automation recipe', { context: { projectPath, recipeId } });

      const result = await recipesService.disableRecipe(projectPath, recipeId);

      const response: ApiResponse<typeof result> = {
        success: result.success,
        data: result,
        error: result.error,
      };

      logger.info('Disable recipe result', {
        context: { projectPath, recipeId, success: result.success },
        timing: { durationMs: Date.now() - startTime },
      });

      res.json(response);
    } catch (error) {
      logger.error('Failed to disable recipe', {
        error,
        timing: { durationMs: Date.now() - startTime },
      });

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to disable recipe',
      });
    }
  }
);

/**
 * POST /api/automation/customize
 *
 * Update custom options for an enabled recipe.
 */
router.post(
  '/automation/customize',
  validateBody(CustomizeRecipeSchema),
  async (req: Request, res: Response) => {
    const startTime = Date.now();

    try {
      const { projectPath, recipeId, options } = req.body as {
        projectPath: string;
        recipeId: string;
        options: Record<string, unknown>;
      };

      logger.info('Customizing recipe', { context: { projectPath, recipeId } });

      // Disable and re-enable with new options
      await recipesService.disableRecipe(projectPath, recipeId);
      const result = await recipesService.enableRecipe(projectPath, recipeId, options);

      const response: ApiResponse<typeof result> = {
        success: result.success,
        data: result,
        error: result.error,
      };

      logger.info('Customize recipe result', {
        context: { projectPath, recipeId, success: result.success },
        timing: { durationMs: Date.now() - startTime },
      });

      res.json(response);
    } catch (error) {
      logger.error('Failed to customize recipe', {
        error,
        timing: { durationMs: Date.now() - startTime },
      });

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to customize recipe',
      });
    }
  }
);

/**
 * POST /api/automation/test
 *
 * Test a recipe configuration before enabling.
 */
router.post(
  '/automation/test',
  validateBody(TestRecipeSchema),
  async (req: Request, res: Response) => {
    const startTime = Date.now();

    try {
      const { projectPath, recipeId, customOptions } = req.body as {
        projectPath: string;
        recipeId: string;
        customOptions?: Record<string, unknown>;
      };

      logger.info('Testing recipe', { context: { projectPath, recipeId } });

      const result = await recipesService.testRecipe(projectPath, recipeId, customOptions);

      const response: ApiResponse<typeof result> = {
        success: result.success,
        data: result,
        error: result.error,
      };

      logger.info('Test recipe result', {
        context: { projectPath, recipeId, success: result.success },
        timing: { durationMs: Date.now() - startTime },
      });

      res.json(response);
    } catch (error) {
      logger.error('Failed to test recipe', {
        error,
        timing: { durationMs: Date.now() - startTime },
      });

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to test recipe',
      });
    }
  }
);

/**
 * GET /api/detected-tools
 *
 * Get detected tools in a project.
 */
router.get(
  '/detected-tools',
  validateQuery(ProjectPathSchema),
  async (req: Request, res: Response) => {
    const startTime = Date.now();

    try {
      const { path: projectPath } = req.query as { path: string };

      const tools = recipesService.detectTools(projectPath);

      const response: ApiResponse<typeof tools> = {
        success: true,
        data: tools,
      };

      logger.info('Detected tools', {
        context: { projectPath, tools },
        timing: { durationMs: Date.now() - startTime },
      });

      res.json(response);
    } catch (error) {
      logger.error('Failed to detect tools', {
        error,
        timing: { durationMs: Date.now() - startTime },
      });

      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to detect tools',
      });
    }
  }
);

export { router as recipesRoutes };
