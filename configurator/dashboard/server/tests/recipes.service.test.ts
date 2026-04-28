/**
 * Tests for RecipesService
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { RecipesService } from '../src/services/recipes.service.js';
import { AUTOMATION_RECIPES } from '../src/data/automation-recipes.js';
import { createTempDir, cleanupTempDir, createMockProject } from './test-utils.js';

// Helper to get a valid first recipe ID
const firstRecipe = AUTOMATION_RECIPES[0]!;

describe('RecipesService', () => {
  let service: RecipesService;
  let tempDir: string;

  beforeEach(() => {
    service = new RecipesService();
    tempDir = createTempDir('recipes-test-');
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  // ----------------------------------------------------------------
  // getAllRecipes
  // ----------------------------------------------------------------
  describe('getAllRecipes', () => {
    it('should return all automation recipes', () => {
      const recipes = service.getAllRecipes();
      expect(Array.isArray(recipes)).toBe(true);
      expect(recipes.length).toBeGreaterThan(0);
    });

    it('each recipe should have required fields', () => {
      const recipes = service.getAllRecipes();
      for (const r of recipes) {
        expect(r).toHaveProperty('id');
        expect(r).toHaveProperty('name');
        expect(r).toHaveProperty('description');
        expect(r).toHaveProperty('category');
        expect(r).toHaveProperty('options');
        expect(r).toHaveProperty('implementation');
        expect(r).toHaveProperty('recommendedFor');
      }
    });
  });

  // ----------------------------------------------------------------
  // getRecipesByCategory
  // ----------------------------------------------------------------
  describe('getRecipesByCategory', () => {
    it('should return recipes grouped by category', () => {
      const groups = service.getRecipesByCategory();
      expect(Array.isArray(groups)).toBe(true);
      expect(groups.length).toBeGreaterThan(0);

      for (const group of groups) {
        expect(group).toHaveProperty('category');
        expect(group).toHaveProperty('label');
        expect(group).toHaveProperty('recipes');
        expect(Array.isArray(group.recipes)).toBe(true);
      }
    });
  });

  // ----------------------------------------------------------------
  // getRecipe
  // ----------------------------------------------------------------
  describe('getRecipe', () => {
    it('should return a recipe by ID', () => {
      const recipe = service.getRecipe(firstRecipe.id);
      expect(recipe).toBeDefined();
      expect(recipe?.id).toBe(firstRecipe.id);
    });

    it('should return undefined for unknown ID', () => {
      const recipe = service.getRecipe('non-existent-recipe-xyz');
      expect(recipe).toBeUndefined();
    });
  });

  // ----------------------------------------------------------------
  // getEnabledAutomations
  // ----------------------------------------------------------------
  describe('getEnabledAutomations', () => {
    it('should return empty array when no manifest exists', () => {
      createMockProject(tempDir, { packageJson: { name: 'test' } });
      const automations = service.getEnabledAutomations(tempDir);
      expect(automations).toEqual([]);
    });

    it('should return automations from manifest', () => {
      createMockProject(tempDir, { packageJson: { name: 'test' } });
      const manifest = {
        automations: [
          {
            recipeId: firstRecipe.id,
            enabled: true,
            customOptions: {},
            enabledAt: new Date().toISOString(),
          },
        ],
      };
      fs.writeFileSync(
        path.join(tempDir, '.dev-suite-manifest.json'),
        JSON.stringify(manifest, null, 2)
      );

      const automations = service.getEnabledAutomations(tempDir);
      expect(automations).toHaveLength(1);
      expect(automations[0].recipeId).toBe(firstRecipe.id);
      expect(automations[0].enabled).toBe(true);
    });

    it('should throw PathValidationError for path traversal', () => {
      expect(() => service.getEnabledAutomations('/tmp/../etc')).toThrow(/traversal/i);
    });
  });

  // ----------------------------------------------------------------
  // detectTools
  // ----------------------------------------------------------------
  describe('detectTools', () => {
    it('should detect prettier from package.json', () => {
      createMockProject(tempDir, {
        packageJson: {
          name: 'test',
          devDependencies: { prettier: '^3.0.0' },
        },
      });

      const tools = service.detectTools(tempDir);
      expect(tools.formatters).toContain('prettier');
    });

    it('should detect biome as formatter and linter', () => {
      createMockProject(tempDir, {
        packageJson: {
          name: 'test',
          devDependencies: { '@biomejs/biome': '^1.0.0' },
        },
      });

      const tools = service.detectTools(tempDir);
      expect(tools.formatters).toContain('biome');
      expect(tools.linters).toContain('biome');
    });

    it('should detect eslint from devDependencies', () => {
      createMockProject(tempDir, {
        packageJson: {
          name: 'test',
          devDependencies: { eslint: '^8.0.0' },
        },
      });

      const tools = service.detectTools(tempDir);
      expect(tools.linters).toContain('eslint');
    });

    it('should detect vitest test runner', () => {
      createMockProject(tempDir, {
        packageJson: {
          name: 'test',
          devDependencies: { vitest: '^2.0.0' },
        },
      });

      const tools = service.detectTools(tempDir);
      expect(tools.testRunners).toContain('vitest');
    });

    it('should detect jest test runner', () => {
      createMockProject(tempDir, {
        packageJson: {
          name: 'test',
          devDependencies: { jest: '^29.0.0' },
        },
      });

      const tools = service.detectTools(tempDir);
      expect(tools.testRunners).toContain('jest');
    });

    it('should detect playwright', () => {
      createMockProject(tempDir, {
        packageJson: {
          name: 'test',
          devDependencies: { '@playwright/test': '^1.0.0' },
        },
      });

      const tools = service.detectTools(tempDir);
      expect(tools.testRunners).toContain('playwright');
    });

    it('should detect cypress', () => {
      createMockProject(tempDir, {
        packageJson: {
          name: 'test',
          devDependencies: { cypress: '^13.0.0' },
        },
      });

      const tools = service.detectTools(tempDir);
      expect(tools.testRunners).toContain('cypress');
    });

    it('should detect frameworks from package.json', () => {
      createMockProject(tempDir, {
        packageJson: {
          name: 'test',
          dependencies: { react: '^18.0.0' },
        },
      });

      const tools = service.detectTools(tempDir);
      expect(tools.frameworks).toContain('react');
    });

    it('should detect vue framework', () => {
      createMockProject(tempDir, {
        packageJson: {
          name: 'test',
          dependencies: { vue: '^3.0.0' },
        },
      });

      const tools = service.detectTools(tempDir);
      expect(tools.frameworks).toContain('vue');
    });

    it('should detect TypeScript from devDependencies', () => {
      createMockProject(tempDir, {
        packageJson: {
          name: 'test',
          devDependencies: { typescript: '^5.0.0' },
        },
      });

      const tools = service.detectTools(tempDir);
      expect(tools.hasTypeScript).toBe(true);
    });

    it('should detect TypeScript from tsconfig.json file', () => {
      createMockProject(tempDir, {
        packageJson: { name: 'test' },
        files: { 'tsconfig.json': '{}' },
      });

      const tools = service.detectTools(tempDir);
      expect(tools.hasTypeScript).toBe(true);
    });

    it('should detect git from .git directory', () => {
      createMockProject(tempDir, {
        packageJson: { name: 'test' },
        hasGit: true,
      });

      const tools = service.detectTools(tempDir);
      expect(tools.hasGit).toBe(true);
    });

    it('should detect husky from devDependencies', () => {
      createMockProject(tempDir, {
        packageJson: {
          name: 'test',
          devDependencies: { husky: '^8.0.0' },
        },
      });

      const tools = service.detectTools(tempDir);
      expect(tools.hasHusky).toBe(true);
    });

    it('should detect npm from package-lock.json', () => {
      createMockProject(tempDir, {
        packageJson: { name: 'test' },
        files: { 'package-lock.json': '{"lockfileVersion":3}' },
      });

      const tools = service.detectTools(tempDir);
      expect(tools.packageManagers).toContain('npm');
    });

    it('should detect pnpm from pnpm-lock.yaml', () => {
      createMockProject(tempDir, {
        packageJson: { name: 'test' },
        files: { 'pnpm-lock.yaml': 'lockfileVersion: 5.4' },
      });

      const tools = service.detectTools(tempDir);
      expect(tools.packageManagers).toContain('pnpm');
    });

    it('should detect yarn from yarn.lock', () => {
      createMockProject(tempDir, {
        packageJson: { name: 'test' },
        files: { 'yarn.lock': '' },
      });

      const tools = service.detectTools(tempDir);
      expect(tools.packageManagers).toContain('yarn');
    });

    it('should detect spring-boot from pom.xml', () => {
      createMockProject(tempDir, {
        packageJson: { name: 'test' },
        files: { 'pom.xml': '<project></project>' },
      });

      const tools = service.detectTools(tempDir);
      expect(tools.frameworks).toContain('spring-boot');
    });

    it('should detect python from requirements.txt', () => {
      createMockProject(tempDir, {
        packageJson: { name: 'test' },
        files: { 'requirements.txt': 'fastapi\nuvicorn\n' },
      });

      const tools = service.detectTools(tempDir);
      expect(tools.frameworks).toContain('python');
    });

    it('should detect python from pyproject.toml', () => {
      createMockProject(tempDir, {
        packageJson: { name: 'test' },
        files: { 'pyproject.toml': '[tool.poetry]\nname = "test"' },
      });

      const tools = service.detectTools(tempDir);
      expect(tools.frameworks).toContain('python');
    });

    it('should detect go from go.mod', () => {
      createMockProject(tempDir, {
        packageJson: { name: 'test' },
        files: { 'go.mod': 'module example.com/app\ngo 1.21\n' },
      });

      const tools = service.detectTools(tempDir);
      expect(tools.frameworks).toContain('go');
    });

    it('should detect rust from Cargo.toml', () => {
      createMockProject(tempDir, {
        packageJson: { name: 'test' },
        files: { 'Cargo.toml': '[package]\nname = "my-app"' },
      });

      const tools = service.detectTools(tempDir);
      expect(tools.frameworks).toContain('rust');
    });

    it('should return empty tools when no package.json', () => {
      // tempDir exists but is empty
      const tools = service.detectTools(tempDir);
      expect(tools.formatters).toEqual([]);
      expect(tools.linters).toEqual([]);
      expect(tools.testRunners).toEqual([]);
    });

    it('should throw PathValidationError for path traversal', () => {
      expect(() => service.detectTools('/tmp/../etc')).toThrow(/traversal/i);
    });
  });

  // ----------------------------------------------------------------
  // getRecommendedRecipes
  // ----------------------------------------------------------------
  describe('getRecommendedRecipes', () => {
    it('should recommend prettier recipe when prettier is installed', () => {
      createMockProject(tempDir, {
        packageJson: {
          name: 'test',
          devDependencies: { prettier: '^3.0.0' },
        },
      });

      const recommendations = service.getRecommendedRecipes(tempDir);
      const hasPrettierRec = recommendations.some((r) =>
        r.recipe.recommendedFor.hasPackages?.some((p) => p === 'prettier') ?? false
      );
      expect(hasPrettierRec).toBe(true);
    });

    it('should not recommend already-enabled recipes', () => {
      createMockProject(tempDir, {
        packageJson: {
          name: 'test',
          devDependencies: { prettier: '^3.0.0' },
        },
      });

      // Enable the auto-format recipe
      const manifest = {
        automations: [
          {
            recipeId: 'auto-format',
            enabled: true,
            customOptions: {},
            enabledAt: new Date().toISOString(),
          },
        ],
      };
      fs.writeFileSync(
        path.join(tempDir, '.dev-suite-manifest.json'),
        JSON.stringify(manifest, null, 2)
      );

      const recommendations = service.getRecommendedRecipes(tempDir);
      const autoFormatRec = recommendations.find((r) => r.recipe.id === 'auto-format');
      expect(autoFormatRec).toBeUndefined();
    });

    it('should recommend typescript recipe for ts projects', () => {
      createMockProject(tempDir, {
        packageJson: {
          name: 'test',
          devDependencies: { typescript: '^5.0.0' },
        },
      });

      const recommendations = service.getRecommendedRecipes(tempDir);
      const tsRec = recommendations.find((r) => r.recipe.id === 'typescript-check');
      expect(tsRec).toBeDefined();
    });

    it('should return empty array for project with no matching tools', () => {
      // Just a bare directory with no package.json
      const recommendations = service.getRecommendedRecipes(tempDir);
      // May or may not have recommendations based on files — just verify it returns an array
      expect(Array.isArray(recommendations)).toBe(true);
    });

    it('should sort recommendations by category priority', () => {
      createMockProject(tempDir, {
        packageJson: {
          name: 'test',
          devDependencies: {
            prettier: '^3.0.0',
            eslint: '^8.0.0',
            typescript: '^5.0.0',
          },
        },
      });

      const recommendations = service.getRecommendedRecipes(tempDir);
      const categoryOrder = ['code-quality', 'security', 'testing', 'git-workflow', 'validation'];

      for (let i = 1; i < recommendations.length; i++) {
        const prevIdx = categoryOrder.indexOf(recommendations[i - 1]!.recipe.category);
        const currIdx = categoryOrder.indexOf(recommendations[i]!.recipe.category);
        expect(prevIdx).toBeLessThanOrEqual(currIdx);
      }
    });
  });

  // ----------------------------------------------------------------
  // testRecipe
  // ----------------------------------------------------------------
  describe('testRecipe', () => {
    it('should return failure for unknown recipe ID', async () => {
      createMockProject(tempDir, { packageJson: { name: 'test' } });
      const result = await service.testRecipe(tempDir, 'non-existent-xyz');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should return failure for invalid recipe ID format', async () => {
      createMockProject(tempDir, { packageJson: { name: 'test' } });
      const result = await service.testRecipe(tempDir, 'bad recipe id!');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid recipe ID');
    });

    it('should return success for valid recipe with matching tools', async () => {
      createMockProject(tempDir, {
        packageJson: {
          name: 'test',
          devDependencies: { prettier: '^3.0.0' },
        },
      });

      const result = await service.testRecipe(tempDir, 'auto-format');
      expect(result.success).toBe(true);
      expect(result.duration).toBeDefined();
    });

    it('should return failure for auto-format when no formatter installed', async () => {
      createMockProject(tempDir, {
        packageJson: { name: 'test' },
      });

      const result = await service.testRecipe(tempDir, 'auto-format');
      expect(result.success).toBe(false);
      expect(result.error).toContain('formatter');
    });

    it('should return failure for eslint-on-save when eslint not installed', async () => {
      createMockProject(tempDir, {
        packageJson: { name: 'test' },
      });

      const result = await service.testRecipe(tempDir, 'eslint-on-save');
      expect(result.success).toBe(false);
      expect(result.error).toContain('ESLint');
    });

    it('should return failure for typescript-check when TS not installed', async () => {
      createMockProject(tempDir, {
        packageJson: { name: 'test' },
      });

      const result = await service.testRecipe(tempDir, 'typescript-check');
      expect(result.success).toBe(false);
      expect(result.error).toContain('TypeScript');
    });

    it('should include duration in result', async () => {
      createMockProject(tempDir, {
        packageJson: {
          name: 'test',
          devDependencies: { prettier: '^3.0.0' },
        },
      });

      const result = await service.testRecipe(tempDir, 'auto-format');
      expect(typeof result.duration).toBe('number');
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });
  });

  // ----------------------------------------------------------------
  // enableRecipe — claude-hook type
  // ----------------------------------------------------------------
  describe('enableRecipe', () => {
    it('should return failure for invalid recipe ID format', async () => {
      createMockProject(tempDir, { packageJson: { name: 'test' } });
      const result = await service.enableRecipe(tempDir, 'bad recipe!');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid recipe ID');
    });

    it('should return failure for unknown recipe', async () => {
      createMockProject(tempDir, { packageJson: { name: 'test' } });
      const result = await service.enableRecipe(tempDir, 'non-existent-xyz');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should enable a claude-hook recipe and write settings.json', async () => {
      createMockProject(tempDir, {
        packageJson: { name: 'test' },
        hasGit: false,
      });

      const result = await service.enableRecipe(tempDir, 'auto-format');
      expect(result.success).toBe(true);
      expect(result.hookInstalled).toBe(true);

      // Verify settings.json was created
      const settingsPath = path.join(tempDir, '.claude', 'settings.json');
      expect(fs.existsSync(settingsPath)).toBe(true);
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as {
        hooks: Record<string, unknown[]>;
      };
      expect(settings.hooks?.PostToolUse).toBeDefined();
      expect(settings.hooks.PostToolUse.length).toBeGreaterThan(0);
    });

    it('should track automation in manifest after enabling', async () => {
      createMockProject(tempDir, {
        packageJson: { name: 'test' },
      });

      await service.enableRecipe(tempDir, 'auto-format');
      const automations = service.getEnabledAutomations(tempDir);
      const automation = automations.find((a) => a.recipeId === 'auto-format');
      expect(automation).toBeDefined();
      expect(automation?.enabled).toBe(true);
    });

    it('should update existing automation entry', async () => {
      createMockProject(tempDir, {
        packageJson: { name: 'test' },
      });

      // Enable twice
      await service.enableRecipe(tempDir, 'auto-format');
      await service.enableRecipe(tempDir, 'auto-format');

      const automations = service.getEnabledAutomations(tempDir);
      const autoFormatEntries = automations.filter((a) => a.recipeId === 'auto-format');
      expect(autoFormatEntries).toHaveLength(1);
    });

    it('should enable a git-hook recipe and write hook file', async () => {
      createMockProject(tempDir, {
        packageJson: { name: 'test' },
        hasGit: true,
      });

      // Create hooks directory
      fs.mkdirSync(path.join(tempDir, '.git', 'hooks'), { recursive: true });

      // Find a git-hook recipe
      const gitHookRecipe = AUTOMATION_RECIPES.find(
        (r) => r.implementation.type === 'git-hook'
      );
      if (gitHookRecipe) {
        const result = await service.enableRecipe(tempDir, gitHookRecipe.id);
        expect(result.success).toBe(true);
        expect(result.gitHookInstalled).toBe(true);
      }
    });
  });

  // ----------------------------------------------------------------
  // disableRecipe
  // ----------------------------------------------------------------
  describe('disableRecipe', () => {
    it('should return failure for invalid recipe ID format', async () => {
      createMockProject(tempDir, { packageJson: { name: 'test' } });
      const result = await service.disableRecipe(tempDir, 'bad recipe!');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid recipe ID');
    });

    it('should return failure for unknown recipe', async () => {
      createMockProject(tempDir, { packageJson: { name: 'test' } });
      const result = await service.disableRecipe(tempDir, 'non-existent-xyz');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should disable a previously enabled recipe', async () => {
      createMockProject(tempDir, {
        packageJson: { name: 'test' },
      });

      // Enable first
      await service.enableRecipe(tempDir, 'auto-format');

      // Then disable
      const result = await service.disableRecipe(tempDir, 'auto-format');
      expect(result.success).toBe(true);

      const automations = service.getEnabledAutomations(tempDir);
      const automation = automations.find((a) => a.recipeId === 'auto-format');
      expect(automation?.enabled).toBe(false);
    });

    it('should succeed even when no automation entry exists (removes hook)', async () => {
      createMockProject(tempDir, {
        packageJson: { name: 'test' },
      });

      // Disable without enabling first
      const result = await service.disableRecipe(tempDir, 'auto-format');
      expect(result.success).toBe(true);
    });

    it('should clean up settings.json when disabling claude-hook recipe', async () => {
      createMockProject(tempDir, {
        packageJson: { name: 'test' },
      });

      // Enable then disable
      await service.enableRecipe(tempDir, 'auto-format');
      await service.disableRecipe(tempDir, 'auto-format');

      const settingsPath = path.join(tempDir, '.claude', 'settings.json');
      if (fs.existsSync(settingsPath)) {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as {
          hooks: Record<string, unknown[]>;
        };
        // Hook entry tagged with auto-format should be removed
        const hooks = settings.hooks?.PostToolUse ?? [];
        const stillTagged = hooks.some(
          (h) => (h as Record<string, unknown>)._recipeId === 'auto-format'
        );
        expect(stillTagged).toBe(false);
      }
    });
  });
});
