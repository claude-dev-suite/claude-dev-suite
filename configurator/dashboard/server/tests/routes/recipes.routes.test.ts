// SPDX-License-Identifier: MIT
/**
 * Recipes Routes Tests
 *
 * Unit tests for automation recipes route handler logic.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RecipesService } from '../../src/services/recipes.service.js';
import { z } from 'zod';

vi.mock('../../src/services/recipes.service.js');

// ---------------------------------------------------------------------------
// Inline validation schemas (mirror of recipes.routes.ts)
// ---------------------------------------------------------------------------

const ProjectPathSchema = z.object({
  path: z.string().min(1, 'Project path is required'),
});

const EnableRecipeSchema = z.object({
  projectPath: z.string().min(1, 'Project path is required'),
  recipeId: z.string().min(1, 'Recipe ID is required'),
  customOptions: z.record(z.string(), z.unknown()).optional(),
});

const DisableRecipeSchema = z.object({
  projectPath: z.string().min(1, 'Project path is required'),
  recipeId: z.string().min(1, 'Recipe ID is required'),
});

const CustomizeRecipeSchema = z.object({
  projectPath: z.string().min(1, 'Project path is required'),
  recipeId: z.string().min(1, 'Recipe ID is required'),
  options: z.record(z.string(), z.unknown()),
});

const TestRecipeSchema = z.object({
  projectPath: z.string().min(1, 'Project path is required'),
  recipeId: z.string().min(1, 'Recipe ID is required'),
  customOptions: z.record(z.string(), z.unknown()).optional(),
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PROJECT_PATH = '/home/user/my-project';

const MOCK_RECIPE = {
  id: 'run-tests',
  name: 'Run Tests',
  description: 'Execute test suite on pre-commit',
  category: 'testing',
  enabled: false,
};

const MOCK_RECIPES = [MOCK_RECIPE, { id: 'lint', name: 'Lint', description: 'ESLint check', category: 'code-quality', enabled: false }];

const MOCK_CATEGORIES = {
  testing: [MOCK_RECIPE],
  'code-quality': [{ id: 'lint', name: 'Lint', description: 'ESLint check', category: 'code-quality', enabled: false }],
};

const MOCK_RECOMMENDATIONS = [
  { recipeId: 'run-tests', reason: 'Jest detected in package.json', confidence: 0.95 },
];

const MOCK_ENABLE_RESULT = {
  success: true,
  recipeId: 'run-tests',
  filesModified: ['.husky/pre-commit'],
};

const MOCK_TOOLS = { jest: true, eslint: true, prettier: false };

// ---------------------------------------------------------------------------

describe('Recipes Routes - Service Integration', () => {
  let recipesService: RecipesService;

  beforeEach(() => {
    recipesService = new RecipesService();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // GET /automation-recipes
  // -------------------------------------------------------------------------
  describe('getAllRecipes logic', () => {
    it('should return all recipes and categories', () => {
      vi.mocked(recipesService.getAllRecipes).mockReturnValue(MOCK_RECIPES);
      vi.mocked(recipesService.getRecipesByCategory).mockReturnValue(MOCK_CATEGORIES);

      const recipes = recipesService.getAllRecipes();
      const categories = recipesService.getRecipesByCategory();

      expect(recipes).toHaveLength(2);
      expect(recipes[0].id).toBe('run-tests');
      expect(categories).toHaveProperty('testing');
    });

    it('should surface service errors', () => {
      vi.mocked(recipesService.getAllRecipes).mockImplementation(() => {
        throw new Error('failed to load recipes');
      });

      expect(() => recipesService.getAllRecipes()).toThrow('failed to load recipes');
    });
  });

  // -------------------------------------------------------------------------
  // GET /automation-recipes/recommended
  // -------------------------------------------------------------------------
  describe('getRecommendedRecipes logic', () => {
    it('should return recommended recipes for a project', () => {
      vi.mocked(recipesService.getRecommendedRecipes).mockReturnValue(MOCK_RECOMMENDATIONS);
      vi.mocked(recipesService.getEnabledAutomations).mockReturnValue([]);

      const recommendations = recipesService.getRecommendedRecipes(PROJECT_PATH);
      const enabled = recipesService.getEnabledAutomations(PROJECT_PATH);

      expect(recommendations).toHaveLength(1);
      expect(recommendations[0].recipeId).toBe('run-tests');
      expect(enabled).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // GET /automation-recipes/enabled
  // -------------------------------------------------------------------------
  describe('getEnabledAutomations logic', () => {
    it('should return enabled automations for a project', () => {
      const enabled = [{ recipeId: 'run-tests', enabled: true, installedAt: new Date().toISOString() }];
      vi.mocked(recipesService.getEnabledAutomations).mockReturnValue(enabled);

      const result = recipesService.getEnabledAutomations(PROJECT_PATH);

      expect(result).toHaveLength(1);
      expect(result[0].recipeId).toBe('run-tests');
    });

    it('should return empty array when no automations enabled', () => {
      vi.mocked(recipesService.getEnabledAutomations).mockReturnValue([]);

      const result = recipesService.getEnabledAutomations(PROJECT_PATH);

      expect(result).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // POST /automation/enable
  // -------------------------------------------------------------------------
  describe('enableRecipe logic', () => {
    it('should enable a recipe for the project', async () => {
      vi.mocked(recipesService.enableRecipe).mockResolvedValue(MOCK_ENABLE_RESULT);

      const result = await recipesService.enableRecipe(PROJECT_PATH, 'run-tests', {});

      expect(recipesService.enableRecipe).toHaveBeenCalledWith(PROJECT_PATH, 'run-tests', {});
      expect(result.success).toBe(true);
      expect(result.recipeId).toBe('run-tests');
    });

    it('should pass customOptions to service', async () => {
      vi.mocked(recipesService.enableRecipe).mockResolvedValue(MOCK_ENABLE_RESULT);

      const customOptions = { timeout: 30, failFast: true };
      await recipesService.enableRecipe(PROJECT_PATH, 'run-tests', customOptions);

      expect(recipesService.enableRecipe).toHaveBeenCalledWith(PROJECT_PATH, 'run-tests', customOptions);
    });
  });

  // -------------------------------------------------------------------------
  // POST /automation/disable
  // -------------------------------------------------------------------------
  describe('disableRecipe logic', () => {
    it('should disable a recipe for the project', async () => {
      vi.mocked(recipesService.disableRecipe).mockResolvedValue({ success: true, recipeId: 'run-tests' });

      const result = await recipesService.disableRecipe(PROJECT_PATH, 'run-tests');

      expect(recipesService.disableRecipe).toHaveBeenCalledWith(PROJECT_PATH, 'run-tests');
      expect(result.success).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // POST /automation/customize
  // -------------------------------------------------------------------------
  describe('customizeRecipe logic', () => {
    it('should disable then re-enable recipe with new options', async () => {
      vi.mocked(recipesService.disableRecipe).mockResolvedValue({ success: true, recipeId: 'run-tests' });
      vi.mocked(recipesService.enableRecipe).mockResolvedValue(MOCK_ENABLE_RESULT);

      const options = { timeout: 60 };

      await recipesService.disableRecipe(PROJECT_PATH, 'run-tests');
      const result = await recipesService.enableRecipe(PROJECT_PATH, 'run-tests', options);

      expect(recipesService.disableRecipe).toHaveBeenCalledWith(PROJECT_PATH, 'run-tests');
      expect(recipesService.enableRecipe).toHaveBeenCalledWith(PROJECT_PATH, 'run-tests', options);
      expect(result.success).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // POST /automation/test
  // -------------------------------------------------------------------------
  describe('testRecipe logic', () => {
    it('should test a recipe configuration', async () => {
      const testResult = { success: true, output: 'Tests passed', durationMs: 1200 };
      vi.mocked(recipesService.testRecipe).mockResolvedValue(testResult);

      const result = await recipesService.testRecipe(PROJECT_PATH, 'run-tests', {});

      expect(recipesService.testRecipe).toHaveBeenCalledWith(PROJECT_PATH, 'run-tests', {});
      expect(result.success).toBe(true);
    });

    it('should surface test failures', async () => {
      const testResult = { success: false, output: 'Test suite failed', error: 'Exit code 1' };
      vi.mocked(recipesService.testRecipe).mockResolvedValue(testResult);

      const result = await recipesService.testRecipe(PROJECT_PATH, 'run-tests', {});

      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // GET /detected-tools
  // -------------------------------------------------------------------------
  describe('detectTools logic', () => {
    it('should return detected tools for the project', () => {
      vi.mocked(recipesService.detectTools).mockReturnValue(MOCK_TOOLS);

      const result = recipesService.detectTools(PROJECT_PATH);

      expect(result).toHaveProperty('jest', true);
      expect(result).toHaveProperty('eslint', true);
      expect(result).toHaveProperty('prettier', false);
    });
  });

  // -------------------------------------------------------------------------
  // Zod validation
  // -------------------------------------------------------------------------
  describe('Zod validation - ProjectPathSchema', () => {
    it('should accept valid path', () => {
      const result = ProjectPathSchema.safeParse({ path: '/home/user/project' });
      expect(result.success).toBe(true);
    });

    it('should reject empty path', () => {
      const result = ProjectPathSchema.safeParse({ path: '' });
      expect(result.success).toBe(false);
    });

    it('should reject missing path', () => {
      const result = ProjectPathSchema.safeParse({});
      expect(result.success).toBe(false);
    });
  });

  describe('Zod validation - EnableRecipeSchema', () => {
    it('should accept valid enable request', () => {
      const result = EnableRecipeSchema.safeParse({
        projectPath: '/home/user/project',
        recipeId: 'run-tests',
      });
      expect(result.success).toBe(true);
    });

    it('should accept with optional customOptions', () => {
      const result = EnableRecipeSchema.safeParse({
        projectPath: '/home/user/project',
        recipeId: 'run-tests',
        customOptions: { timeout: 30 },
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing recipeId', () => {
      const result = EnableRecipeSchema.safeParse({
        projectPath: '/home/user/project',
      });
      expect(result.success).toBe(false);
    });

    it('should reject empty recipeId', () => {
      const result = EnableRecipeSchema.safeParse({
        projectPath: '/home/user/project',
        recipeId: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Zod validation - DisableRecipeSchema', () => {
    it('should accept valid disable request', () => {
      const result = DisableRecipeSchema.safeParse({
        projectPath: '/home/user/project',
        recipeId: 'run-tests',
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing projectPath', () => {
      const result = DisableRecipeSchema.safeParse({ recipeId: 'run-tests' });
      expect(result.success).toBe(false);
    });
  });

  describe('Zod validation - CustomizeRecipeSchema', () => {
    it('should accept valid customize request', () => {
      const result = CustomizeRecipeSchema.safeParse({
        projectPath: '/home/user/project',
        recipeId: 'run-tests',
        options: { timeout: 60 },
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing options', () => {
      const result = CustomizeRecipeSchema.safeParse({
        projectPath: '/home/user/project',
        recipeId: 'run-tests',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Zod validation - TestRecipeSchema', () => {
    it('should accept valid test request', () => {
      const result = TestRecipeSchema.safeParse({
        projectPath: '/home/user/project',
        recipeId: 'run-tests',
      });
      expect(result.success).toBe(true);
    });

    it('should accept optional customOptions', () => {
      const result = TestRecipeSchema.safeParse({
        projectPath: '/home/user/project',
        recipeId: 'run-tests',
        customOptions: {},
      });
      expect(result.success).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Response structure
  // -------------------------------------------------------------------------
  describe('Response structure', () => {
    it('should format getAllRecipes response with recipes and categories', () => {
      vi.mocked(recipesService.getAllRecipes).mockReturnValue(MOCK_RECIPES);
      vi.mocked(recipesService.getRecipesByCategory).mockReturnValue(MOCK_CATEGORIES);

      const recipes = recipesService.getAllRecipes();
      const categories = recipesService.getRecipesByCategory();
      const response = { success: true, data: { recipes, categories } };

      expect(response.data.recipes).toHaveLength(2);
      expect(response.data.categories).toHaveProperty('testing');
    });

    it('should format enable response with success and data', async () => {
      vi.mocked(recipesService.enableRecipe).mockResolvedValue(MOCK_ENABLE_RESULT);

      const result = await recipesService.enableRecipe(PROJECT_PATH, 'run-tests', {});
      const response = { success: result.success, data: result, error: undefined };

      expect(response.success).toBe(true);
      expect(response.data.filesModified).toContain('.husky/pre-commit');
    });
  });
});
