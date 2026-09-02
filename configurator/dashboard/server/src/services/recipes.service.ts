// SPDX-License-Identifier: MIT
/**
 * Recipes Service
 *
 * Manages automation recipes - user-friendly wrappers around Claude Code and Git hooks.
 * Handles enabling/disabling recipes, customizing options, and detecting installed tools.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getLogger } from '../utils/logger.js';
import { resolveProjectPath, PathValidationError } from '../utils/utilities.js';
import { readJsonSync } from '../utils/fs-utils.js';
import { targetPaths } from './targets/target-paths.js';
import { HooksService } from './hooks.service.js';
import { FILE_CHANGE_HOOK_SCRIPT } from './hooks/hooks.constants.js';
import {
  AUTOMATION_RECIPES,
  getRecipeById,
  getRecipeCategories,
  type AutomationRecipe,
  type RecipeCategory,
} from '../data/automation-recipes.js';

const logger = getLogger('RecipesService');

/**
 * Enabled automation tracking
 */
export interface EnabledAutomation {
  recipeId: string;
  enabled: boolean;
  customOptions: Record<string, unknown>;
  enabledAt: string;
  lastTested?: string;
  testResult?: 'success' | 'failure';
}

/**
 * Detected tools in a project
 */
export interface DetectedTools {
  formatters: string[];
  linters: string[];
  testRunners: string[];
  packageManagers: string[];
  frameworks: string[];
  hasTypeScript: boolean;
  hasGit: boolean;
  hasHusky: boolean;
}

/**
 * Recipe recommendation info
 */
export interface RecipeRecommendation {
  recipe: AutomationRecipe;
  reason: string;
  detectedPackage?: string;
  detectedFile?: string;
}

/**
 * Result of enabling/disabling a recipe
 */
export interface RecipeOperationResult {
  success: boolean;
  recipeId: string;
  error?: string;
  hookInstalled?: boolean;
  gitHookInstalled?: boolean;
}

/**
 * Test result for a recipe
 */
export interface RecipeTestResult {
  success: boolean;
  output?: string;
  error?: string;
  duration?: number;
}

export class RecipesService {
  // HooksService available for future advanced hook operations
  // private hooksService = new HooksService();

  /**
   * Get all available recipes
   */
  getAllRecipes(): AutomationRecipe[] {
    return AUTOMATION_RECIPES;
  }

  /**
   * Get recipes grouped by category
   */
  getRecipesByCategory(): Array<{ category: RecipeCategory; label: string; recipes: AutomationRecipe[] }> {
    return getRecipeCategories();
  }

  /**
   * Get a single recipe by ID
   */
  getRecipe(id: string): AutomationRecipe | undefined {
    return getRecipeById(id);
  }

  /**
   * Get enabled automations for a project
   */
  getEnabledAutomations(projectPath: string): EnabledAutomation[] {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    const manifestPath = path.join(projectPath, '.dev-suite-manifest.json');
    const manifest = readJsonSync<{ automations?: EnabledAutomation[] }>(manifestPath);
    return manifest?.automations ?? [];
  }

  /**
   * Save enabled automations to manifest
   */
  private saveEnabledAutomations(projectPath: string, automations: EnabledAutomation[]): boolean {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    const manifestPath = path.join(projectPath, '.dev-suite-manifest.json');
    const manifest = readJsonSync<Record<string, unknown>>(manifestPath) ?? {};

    manifest.automations = automations;

    try {
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      return true;
    } catch (error) {
      logger.error('Failed to save automations', { error, context: { projectPath } });
      return false;
    }
  }

  /**
   * Detect tools installed in a project
   */
  detectTools(projectPath: string): DetectedTools {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    const result: DetectedTools = {
      formatters: [],
      linters: [],
      testRunners: [],
      packageManagers: [],
      frameworks: [],
      hasTypeScript: false,
      hasGit: false,
      hasHusky: false,
    };

    // Check package.json
    const packageJsonPath = path.join(projectPath, 'package.json');
    type PackageJson = {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const packageJson = readJsonSync<PackageJson>(packageJsonPath);

    if (packageJson) {
      const allDeps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      };

      // Formatters
      if ('prettier' in allDeps) result.formatters.push('prettier');
      if ('@biomejs/biome' in allDeps) result.formatters.push('biome');
      if ('dprint' in allDeps) result.formatters.push('dprint');

      // Linters
      if ('eslint' in allDeps) result.linters.push('eslint');
      if ('@biomejs/biome' in allDeps && !result.linters.includes('biome')) result.linters.push('biome');
      if ('stylelint' in allDeps) result.linters.push('stylelint');

      // Test runners
      if ('vitest' in allDeps) result.testRunners.push('vitest');
      if ('jest' in allDeps) result.testRunners.push('jest');
      if ('@testing-library/react' in allDeps) result.testRunners.push('testing-library');
      if ('playwright' in allDeps || '@playwright/test' in allDeps) result.testRunners.push('playwright');
      if ('cypress' in allDeps) result.testRunners.push('cypress');

      // Frameworks
      if ('react' in allDeps) result.frameworks.push('react');
      if ('vue' in allDeps) result.frameworks.push('vue');
      if ('svelte' in allDeps) result.frameworks.push('svelte');
      if ('next' in allDeps) result.frameworks.push('nextjs');
      if ('nuxt' in allDeps) result.frameworks.push('nuxt');
      if ('@nestjs/core' in allDeps) result.frameworks.push('nestjs');

      // TypeScript
      result.hasTypeScript = 'typescript' in allDeps;

      // Husky
      result.hasHusky = 'husky' in allDeps;
    }

    // Check for lock files to detect package manager
    if (fs.existsSync(path.join(projectPath, 'bun.lockb'))) result.packageManagers.push('bun');
    if (fs.existsSync(path.join(projectPath, 'pnpm-lock.yaml'))) result.packageManagers.push('pnpm');
    if (fs.existsSync(path.join(projectPath, 'yarn.lock'))) result.packageManagers.push('yarn');
    if (fs.existsSync(path.join(projectPath, 'package-lock.json'))) result.packageManagers.push('npm');

    // Check for Git
    result.hasGit = fs.existsSync(path.join(projectPath, '.git'));

    // Check for tsconfig
    if (!result.hasTypeScript) {
      result.hasTypeScript = fs.existsSync(path.join(projectPath, 'tsconfig.json'));
    }

    // Check for backend frameworks by files
    if (fs.existsSync(path.join(projectPath, 'pom.xml'))) result.frameworks.push('spring-boot');
    if (fs.existsSync(path.join(projectPath, 'requirements.txt')) || fs.existsSync(path.join(projectPath, 'pyproject.toml'))) {
      result.frameworks.push('python');
    }
    if (fs.existsSync(path.join(projectPath, 'go.mod'))) result.frameworks.push('go');
    if (fs.existsSync(path.join(projectPath, 'Cargo.toml'))) result.frameworks.push('rust');

    return result;
  }

  /**
   * Get recommended recipes for a project
   */
  getRecommendedRecipes(projectPath: string): RecipeRecommendation[] {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    const tools = this.detectTools(projectPath);
    const enabledAutomations = this.getEnabledAutomations(projectPath);
    const enabledIds = new Set(enabledAutomations.filter(a => a.enabled).map(a => a.recipeId));

    const recommendations: RecipeRecommendation[] = [];

    for (const recipe of AUTOMATION_RECIPES) {
      // Skip already enabled
      if (enabledIds.has(recipe.id)) continue;

      const { recommendedFor } = recipe;

      // Check packages
      if (recommendedFor.hasPackages) {
        const detectedPackages = [
          ...tools.formatters,
          ...tools.linters,
          ...tools.testRunners,
          ...(tools.hasTypeScript ? ['typescript'] : []),
        ];

        for (const pkg of recommendedFor.hasPackages) {
          if (detectedPackages.some(d => d.includes(pkg) || pkg.includes(d))) {
            recommendations.push({
              recipe,
              reason: `Detected ${pkg} in your project`,
              detectedPackage: pkg,
            });
            break;
          }
        }
      }

      // Check frameworks
      if (recommendedFor.frameworks && !recommendations.some(r => r.recipe.id === recipe.id)) {
        for (const framework of recommendedFor.frameworks) {
          if (tools.frameworks.some(f => f.toLowerCase().includes(framework.toLowerCase()))) {
            recommendations.push({
              recipe,
              reason: `Compatible with ${framework}`,
            });
            break;
          }
        }
      }

      // Check files
      if (recommendedFor.hasFiles && !recommendations.some(r => r.recipe.id === recipe.id)) {
        for (const file of recommendedFor.hasFiles) {
          // Validate file parameter to prevent path traversal
          if (file.includes('..')) continue;
          const filePath = path.join(projectPath, file);
          if (fs.existsSync(filePath)) {
            recommendations.push({
              recipe,
              reason: `Found ${file} in your project`,
              detectedFile: file,
            });
            break;
          }
        }
      }
    }

    // Sort by category priority
    const categoryOrder: RecipeCategory[] = ['code-quality', 'security', 'testing', 'git-workflow', 'validation'];
    recommendations.sort((a, b) => {
      const aIdx = categoryOrder.indexOf(a.recipe.category);
      const bIdx = categoryOrder.indexOf(b.recipe.category);
      return aIdx - bIdx;
    });

    return recommendations;
  }

  /**
   * Build the hook command from a recipe and custom options
   */
  private buildCommand(recipe: AutomationRecipe, _customOptions: Record<string, unknown>): string {
    const command = recipe.implementation.command;

    // Apply custom options to command if needed
    // For now, we use the base command - options would modify this in a real implementation
    // Future: parse options and modify command based on user choices

    return command;
  }

  /**
   * Enable a recipe
   */
  async enableRecipe(
    projectPath: string,
    recipeId: string,
    customOptions?: Record<string, unknown>
  ): Promise<RecipeOperationResult> {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    // Validate recipeId to prevent injection
    if (!/^[a-zA-Z0-9_.-]+$/.test(recipeId)) {
      return {
        success: false,
        recipeId,
        error: 'Invalid recipe ID format',
      };
    }
    const recipe = getRecipeById(recipeId);
    if (!recipe) {
      return {
        success: false,
        recipeId,
        error: `Recipe not found: ${recipeId}`,
      };
    }

    try {
      const options = customOptions ?? this.getDefaultOptions(recipe);
      const command = this.buildCommand(recipe, options);

      if (recipe.implementation.type === 'claude-hook') {
        // Install Claude Code hook
        const result = await this.installClaudeHook(projectPath, recipe, command);
        if (!result.success) {
          return {
            success: false,
            recipeId,
            error: result.error,
          };
        }

        // Track in manifest
        const automations = this.getEnabledAutomations(projectPath);
        const existingIdx = automations.findIndex(a => a.recipeId === recipeId);

        const automation: EnabledAutomation = {
          recipeId,
          enabled: true,
          customOptions: options,
          enabledAt: new Date().toISOString(),
        };

        if (existingIdx >= 0) {
          automations[existingIdx] = automation;
        } else {
          automations.push(automation);
        }

        this.saveEnabledAutomations(projectPath, automations);

        return {
          success: true,
          recipeId,
          hookInstalled: true,
        };
      } else if (recipe.implementation.type === 'git-hook') {
        // Install Git hook
        const result = await this.installGitHook(projectPath, recipe, command);
        if (!result.success) {
          return {
            success: false,
            recipeId,
            error: result.error,
          };
        }

        // Track in manifest
        const automations = this.getEnabledAutomations(projectPath);
        const existingIdx = automations.findIndex(a => a.recipeId === recipeId);

        const automation: EnabledAutomation = {
          recipeId,
          enabled: true,
          customOptions: options,
          enabledAt: new Date().toISOString(),
        };

        if (existingIdx >= 0) {
          automations[existingIdx] = automation;
        } else {
          automations.push(automation);
        }

        this.saveEnabledAutomations(projectPath, automations);

        return {
          success: true,
          recipeId,
          gitHookInstalled: true,
        };
      }

      return {
        success: false,
        recipeId,
        error: `Unknown implementation type: ${recipe.implementation.type}`,
      };
    } catch (error) {
      logger.error('Failed to enable recipe', { error, context: { recipeId } });
      return {
        success: false,
        recipeId,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Disable a recipe
   */
  async disableRecipe(projectPath: string, recipeId: string): Promise<RecipeOperationResult> {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    // Validate recipeId to prevent injection
    if (!/^[a-zA-Z0-9_.-]+$/.test(recipeId)) {
      return {
        success: false,
        recipeId,
        error: 'Invalid recipe ID format',
      };
    }
    const recipe = getRecipeById(recipeId);
    if (!recipe) {
      return {
        success: false,
        recipeId,
        error: `Recipe not found: ${recipeId}`,
      };
    }

    try {
      if (recipe.implementation.type === 'claude-hook') {
        // Remove Claude Code hook
        const result = await this.removeClaudeHook(projectPath, recipe);
        if (!result.success) {
          return {
            success: false,
            recipeId,
            error: result.error,
          };
        }
      } else if (recipe.implementation.type === 'git-hook') {
        // Remove Git hook is more complex - for now just mark as disabled
        // The git hook file would need to be modified
      }

      // Update manifest
      const automations = this.getEnabledAutomations(projectPath);
      const existingIdx = automations.findIndex(a => a.recipeId === recipeId);

      if (existingIdx >= 0) {
        const existing = automations[existingIdx];
        if (existing) {
          automations[existingIdx] = { ...existing, enabled: false };
        }
      }

      this.saveEnabledAutomations(projectPath, automations);

      return {
        success: true,
        recipeId,
      };
    } catch (error) {
      logger.error('Failed to disable recipe', { error, context: { recipeId } });
      return {
        success: false,
        recipeId,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Test a recipe configuration
   */
  async testRecipe(
    projectPath: string,
    recipeId: string,
    customOptions?: Record<string, unknown>
  ): Promise<RecipeTestResult> {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    // Validate recipeId to prevent injection
    if (!/^[a-zA-Z0-9_.-]+$/.test(recipeId)) {
      return {
        success: false,
        error: 'Invalid recipe ID format',
      };
    }
    const recipe = getRecipeById(recipeId);
    if (!recipe) {
      return {
        success: false,
        error: `Recipe not found: ${recipeId}`,
      };
    }

    const startTime = Date.now();
    const options = customOptions ?? this.getDefaultOptions(recipe);
    const command = this.buildCommand(recipe, options);

    // For testing, we'll just validate the command syntax
    // In a real implementation, we might run a dry-run

    try {
      // Basic validation
      if (!command || command.trim() === '') {
        return {
          success: false,
          error: 'Command is empty',
          duration: Date.now() - startTime,
        };
      }

      // Check if required tools are installed
      const tools = this.detectTools(projectPath);

      if (recipe.id === 'auto-format' && tools.formatters.length === 0) {
        return {
          success: false,
          error: 'No formatter installed (prettier or biome required)',
          duration: Date.now() - startTime,
        };
      }

      if (recipe.id === 'eslint-on-save' && !tools.linters.includes('eslint')) {
        return {
          success: false,
          error: 'ESLint not installed',
          duration: Date.now() - startTime,
        };
      }

      if (recipe.id === 'typescript-check' && !tools.hasTypeScript) {
        return {
          success: false,
          error: 'TypeScript not installed',
          duration: Date.now() - startTime,
        };
      }

      return {
        success: true,
        output: `Configuration is valid. Command: ${command.substring(0, 100)}...`,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Get default options for a recipe
   */
  private getDefaultOptions(recipe: AutomationRecipe): Record<string, unknown> {
    const options: Record<string, unknown> = {};
    for (const opt of recipe.options) {
      options[opt.id] = opt.defaultValue;
    }
    return options;
  }

  /**
   * Install a Claude Code hook
   */
  private async installClaudeHook(
    projectPath: string,
    recipe: AutomationRecipe,
    command: string
  ): Promise<{ success: boolean; error?: string }> {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    const impl = recipe.implementation;
    if (!impl.event) {
      return { success: false, error: 'Missing event in recipe implementation' };
    }
    // Validate event name to prevent injection
    if (!/^[a-zA-Z0-9_.-]+$/.test(impl.event)) {
      return { success: false, error: 'Invalid event name format' };
    }

    // Parse the command - it might be a JSON object for prompt hooks
    let hookCommand: string | { type: string; prompt: string; timeout?: number };
    try {
      if (command.startsWith('{')) {
        hookCommand = JSON.parse(command);
      } else {
        hookCommand = command;
      }
    } catch {
      hookCommand = command;
    }

    // Recipes that react to a file write go through a shared Node helper: the
    // payload arrives as JSON on stdin, and the variable these commands used to
    // interpolate does not exist. Install it beside the other hook scripts.
    if (typeof hookCommand === 'string' && hookCommand.includes(FILE_CHANGE_HOOK_SCRIPT)) {
      const copied = new HooksService().installHookScript(projectPath, FILE_CHANGE_HOOK_SCRIPT);
      if (!copied.success) {
        return { success: false, error: copied.error };
      }
    }

    // Use the HooksService to add the hook
    const settingsPath = targetPaths(projectPath).settingsFile;
    const claudeDir = path.dirname(settingsPath);

    // Ensure directory exists
    if (!fs.existsSync(claudeDir)) {
      fs.mkdirSync(claudeDir, { recursive: true });
    }

    // Read existing settings
    type Settings = { hooks?: Record<string, unknown[]> };
    const settings: Settings = readJsonSync<Settings>(settingsPath) ?? { hooks: {} };
    if (!settings.hooks) {
      settings.hooks = {};
    }

    // Add or update the hook
    const event = impl.event;
    if (!settings.hooks[event]) {
      settings.hooks[event] = [];
    }

    const eventHooks = settings.hooks[event];
    if (!eventHooks) {
      settings.hooks[event] = [];
    }

    // Check if similar hook exists
    const hookEntry: Record<string, unknown> = {
      _recipeId: recipe.id, // Tag for tracking
    };

    if (impl.matcher) {
      hookEntry.matcher = impl.matcher;
    }

    // Each entry must be an object carrying a `type`. Bare strings appear in no
    // version of the hook schema; they were written here and in every other
    // writer until the schema was checked against the documentation.
    hookEntry.hooks = [
      typeof hookCommand === 'object' ? hookCommand : { type: 'command', command: hookCommand },
    ];

    if (impl.timeout) {
      hookEntry.timeout = impl.timeout;
    }

    // Remove existing hook for this recipe if any
    const existingHooks = settings.hooks[event] ?? [];
    const filtered = existingHooks.filter((h: unknown) => {
      if (typeof h === 'object' && h !== null) {
        return (h as Record<string, unknown>)._recipeId !== recipe.id;
      }
      return true;
    });

    filtered.push(hookEntry);
    settings.hooks[event] = filtered;

    // Save settings
    try {
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to write settings',
      };
    }
  }

  /**
   * Remove a Claude Code hook
   */
  private async removeClaudeHook(
    projectPath: string,
    recipe: AutomationRecipe
  ): Promise<{ success: boolean; error?: string }> {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    const settingsPath = targetPaths(projectPath).settingsFile;

    type Settings = { hooks?: Record<string, unknown[]> };
    const settings = readJsonSync<Settings>(settingsPath);
    if (!settings?.hooks) {
      return { success: true }; // Nothing to remove
    }

    // Remove hooks tagged with this recipe ID
    for (const event of Object.keys(settings.hooks)) {
      const eventHooks = settings.hooks[event];
      if (eventHooks) {
        settings.hooks[event] = eventHooks.filter((h: unknown) => {
          if (typeof h === 'object' && h !== null) {
            return (h as Record<string, unknown>)._recipeId !== recipe.id;
          }
          return true;
        });
      }
    }

    try {
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to write settings',
      };
    }
  }

  /**
   * Install a Git hook
   */
  private async installGitHook(
    projectPath: string,
    recipe: AutomationRecipe,
    command: string
  ): Promise<{ success: boolean; error?: string }> {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    const impl = recipe.implementation;
    if (!impl.hookType) {
      return { success: false, error: 'Missing hookType in recipe implementation' };
    }

    // Validate hookType to prevent path injection
    if (!/^[a-z-]+$/.test(impl.hookType)) {
      return { success: false, error: 'Invalid hook type format' };
    }

    // Validate recipe.id to prevent injection in file content
    if (!/^[a-zA-Z0-9_.-]+$/.test(recipe.id)) {
      return { success: false, error: 'Invalid recipe ID format' };
    }

    try {
      // Use the existing hooks service
      const hookTypeToKey: Record<string, string> = {
        'pre-commit': 'preCommit',
        'commit-msg': 'commitMsg',
        'post-commit': 'postCommit',
        'pre-push': 'prePush',
        'post-merge': 'postMerge',
        'post-checkout': 'postCheckout',
      };

      const key = hookTypeToKey[impl.hookType];
      if (!key) {
        return { success: false, error: `Unknown hook type: ${impl.hookType}` };
      }

      // For now, we'll create the hook file directly
      // A more robust solution would use the HooksService

      const hooksDir = path.join(projectPath, '.git', 'hooks');
      if (!fs.existsSync(hooksDir)) {
        return { success: false, error: 'Git hooks directory not found' };
      }

      const hookFile = path.join(hooksDir, impl.hookType);
      let content = '#!/bin/sh\n\n';

      // If hook file exists, append our command
      if (fs.existsSync(hookFile)) {
        content = fs.readFileSync(hookFile, 'utf-8');
        // Check if our recipe is already there
        if (content.includes(`# recipe:${recipe.id}`)) {
          return { success: true }; // Already installed
        }
        content += '\n';
      }

      // Add our command with a marker
      content += `# recipe:${recipe.id}\n`;
      content += command + '\n';

      fs.writeFileSync(hookFile, content, { mode: 0o755 });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to install git hook',
      };
    }
  }
}
