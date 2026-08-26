// SPDX-License-Identifier: MIT
/**
 * Git Hooks Service
 *
 * Manages native Git hooks and Husky integration.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import type {
  HuskyStatus,
  HookInfo,
  AvailableAction,
  GitHooksStatus,
  HookConfig,
  HooksInstallConfig,
  HookInstallResult,
  RepoWithHooks,
  GitRepoInfo,
} from '../../types.js';

import {
  HOOK_ACTIONS,
  HOOK_TYPES,
  CONVENTIONAL_COMMIT_PATTERN,
  escapeShellSingleQuote,
  isValidRegex,
  isValidAction,
} from './hooks.constants.js';
import { resolveProjectPath, PathValidationError } from '../../utils/utilities.js';
import { validatePathWithinBase } from '../installation/security-helpers.js';
import { validateGitRef } from '../git/git-security.js';
import { getLogger } from '../../utils/logger.js';

const logger = getLogger('GitHooksService');

/**
 * SECURITY (C1): Reject custom hook scripts containing shell metacharacters.
 *
 * Only characters required by benign npm-run/npx-style commands are permitted.
 * Newlines, semicolons, pipes, backticks, dollar signs, parentheses, braces,
 * angle brackets, ampersands, and backquotes are all hard-rejected.
 */
const SAFE_SCRIPT_PATTERN = /^[a-zA-Z0-9 _./@:=-]+$/;

function validateCustomScript(script: string): void {
  if (!SAFE_SCRIPT_PATTERN.test(script)) {
    throw new PathValidationError(
      'Custom script contains disallowed shell metacharacters. ' +
        'Only alphanumeric characters, spaces, and _ . / @ : = - are permitted.'
    );
  }
}

/**
 * SECURITY (H1): Validate and single-quote-escape a branch name for use in
 * the generated shell script.
 *
 * Each branch name is first validated via validateGitRef (only safe git-ref
 * characters), then wrapped in single quotes with inner single-quotes escaped
 * as '\\'' to prevent any shell interpretation.
 */
function safeBranchForShell(branch: string): string {
  // Will throw if the branch contains shell-dangerous characters.
  validateGitRef(branch);
  // Single-quote the branch for the generated shell script.
  return `'${branch.replace(/'/g, "'\\''")}'`;
}

/**
 * SECURITY: Resolve a sub-repository path against the project root.
 *
 * The three `*ForRepo` entry points used to do a bare `path.join(projectPath,
 * repoPath)`. `path.join` *resolves* `..` segments rather than rejecting them,
 * so the joined path was already normalised by the time it reached the
 * `includes('..')` and `resolveProjectPath` guards — those only ever inspected
 * `projectPath`, never `repoPath`. A request with `repoPath: '../../elsewhere'`
 * therefore installed or deleted executable scripts in the `.git/hooks` of a
 * repository outside the project. Containment is asserted here instead.
 */
function resolveRepoPath(projectPath: string, repoPath: string | null): string {
  if (!repoPath || repoPath === '.') return projectPath;
  if (path.isAbsolute(repoPath)) {
    throw new PathValidationError('Repository path must be relative to the project');
  }
  try {
    return validatePathWithinBase(path.join(projectPath, repoPath), projectPath);
  } catch {
    throw new PathValidationError('Repository path escapes the project directory');
  }
}

export class GitHooksService {
  /**
   * Detect if a project uses Husky
   */
  detectHusky(projectPath: string): HuskyStatus {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    const huskyDir = path.join(projectPath, '.husky');
    const packageJsonPath = path.join(projectPath, 'package.json');

    if (fs.existsSync(huskyDir)) {
      return { installed: true, version: 'unknown' };
    }

    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (deps.husky) {
          return { installed: true, version: deps.husky };
        }
      } catch {
        // Failed to parse package.json - continue as not installed
      }
    }

    return { installed: false };
  }

  /**
   * Parse actions from hook script content
   */
  parseActionsFromScript(content: string): string[] {
    const actions: string[] = [];
    const nameToAction: Record<string, string> = {
      'Lint': 'lint',
      'Format': 'format',
      'Type Check': 'typecheck',
      'Test': 'test',
      'Build': 'build',
      'Security Scan': 'security',
    };

    for (const [name, action] of Object.entries(nameToAction)) {
      if (content.includes(`# ${name}:`)) {
        actions.push(action);
      }
    }

    return actions;
  }

  /**
   * Detect existing native Git hooks
   */
  detectNativeHooks(projectPath: string): Record<string, HookInfo> {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    const hooksDir = path.join(projectPath, '.git', 'hooks');
    const hooks: Record<string, HookInfo> = {};

    if (!fs.existsSync(hooksDir)) {
      return hooks;
    }

    for (const [key, hookInfo] of Object.entries(HOOK_TYPES)) {
      const hookPath = path.join(hooksDir, hookInfo.name);
      if (fs.existsSync(hookPath) && !hookPath.endsWith('.sample')) {
        const content = fs.readFileSync(hookPath, 'utf-8');
        const isDevSuite = content.includes('# dev-suite hook');
        hooks[key] = {
          exists: true,
          path: hookPath,
          isDevSuite,
          content,
          actions: isDevSuite ? this.parseActionsFromScript(content) : [],
        };
      }
    }

    return hooks;
  }

  /**
   * Detect existing Husky hooks
   */
  detectHuskyHooks(projectPath: string): Record<string, HookInfo> {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    const huskyDir = path.join(projectPath, '.husky');
    const hooks: Record<string, HookInfo> = {};

    if (!fs.existsSync(huskyDir)) {
      return hooks;
    }

    for (const [key, hookInfo] of Object.entries(HOOK_TYPES)) {
      const hookPath = path.join(huskyDir, hookInfo.name);
      if (fs.existsSync(hookPath)) {
        const content = fs.readFileSync(hookPath, 'utf-8');
        const isDevSuite = content.includes('# dev-suite hook');
        hooks[key] = {
          exists: true,
          path: hookPath,
          isDevSuite,
          content,
          actions: isDevSuite ? this.parseActionsFromScript(content) : [],
        };
      }
    }

    return hooks;
  }

  /**
   * Detect available npm scripts and packages
   */
  detectPackageScripts(projectPath: string): { scripts: Record<string, string>; packages: string[] } {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    const packageJsonPath = path.join(projectPath, 'package.json');

    if (!fs.existsSync(packageJsonPath)) {
      return { scripts: {}, packages: [] };
    }

    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      const scripts = pkg.scripts || {};
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      const packages = Object.keys(deps);

      return { scripts, packages };
    } catch {
      return { scripts: {}, packages: [] };
    }
  }

  /**
   * Get the best command for a hook action
   */
  getActionCommand(action: string, projectPath: string): string | null {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    const actionConfig = HOOK_ACTIONS[action];
    if (!actionConfig) {
      return null;
    }

    const { scripts, packages } = this.detectPackageScripts(projectPath);
    const hasPackageJson = fs.existsSync(path.join(projectPath, 'package.json'));

    // Check if npm script exists
    if (hasPackageJson && actionConfig.npmScript && scripts[actionConfig.npmScript]) {
      return `npm run ${actionConfig.npmScript}`;
    }

    // Check alternative script names
    if (hasPackageJson && actionConfig.altScripts) {
      for (const altScript of actionConfig.altScripts) {
        if (scripts[altScript]) {
          return `npm run ${altScript}`;
        }
      }
    }

    // Check if required packages are installed for fallback
    const hasRequiredPackage =
      actionConfig.detectPackages.length === 0 || actionConfig.detectPackages.some((pkg) => packages.includes(pkg));

    if (hasRequiredPackage && actionConfig.fallback) {
      return actionConfig.fallback;
    }

    // For non-Node projects or when no packages detected, still return fallback
    if (actionConfig.fallback) {
      return actionConfig.fallback;
    }

    return null;
  }

  /**
   * Generate hook script content
   */
  generateHookScript(hookType: string, actions: string[], projectPath: string, options: Partial<HookConfig> = {}): string {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    const hookInfo = HOOK_TYPES[hookType];
    if (!hookInfo) {
      throw new Error(`Unknown hook type: ${hookType}`);
    }

    const lines = ['#!/bin/sh', '# dev-suite hook - Generated automatically', '# Do not edit manually - use dev-suite dashboard to configure', ''];

    // For commit-msg and applypatch-msg hooks with conventional commits
    if ((hookType === 'commitMsg' || hookType === 'applypatchMsg') && options.conventional) {
      let pattern = CONVENTIONAL_COMMIT_PATTERN;
      if (options.pattern) {
        if (!isValidRegex(options.pattern)) {
          throw new Error('Invalid regex pattern provided');
        }
        pattern = escapeShellSingleQuote(options.pattern);
      }

      lines.push(
        '# Validate conventional commit message format',
        'commit_msg_file="$1"',
        'commit_msg=$(cat "$commit_msg_file")',
        '',
        `pattern='${pattern}'`,
        '',
        'if ! echo "$commit_msg" | grep -qE "$pattern"; then',
        '  echo "\\033[0;31mError: Commit message does not follow conventional format\\033[0m"',
        '  echo ""',
        '  echo "Expected format: <type>(<scope>): <description>"',
        '  echo "Types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert"',
        '  echo ""',
        '  exit 1',
        'fi',
        '',
        'exit 0',
      );
      return lines.join('\n');
    }

    // For pre-rebase hook with protected branches
    if (hookType === 'preRebase' && options.protectedBranches) {
      const branches = options.protectedBranches
        .split(',')
        .map((b) => b.trim())
        .filter(Boolean);

      // SECURITY (H1): validate each branch name via validateGitRef; drop
      // any invalid names and log a warning so the caller knows.
      const safeBranches: string[] = [];
      for (const branch of branches) {
        try {
          validateGitRef(branch);
          safeBranches.push(branch);
        } catch {
          logger.warn('generateHookScript: dropping invalid branch name', { context: { branch } });
        }
      }

      if (safeBranches.length > 0) {
        // Single-quote-escape each branch name for the generated shell script
        // (defense-in-depth even after validateGitRef).
        const quotedBranches = safeBranches.map(safeBranchForShell).join(' ');
        lines.push(
          '# Prevent rebasing protected branches',
          'upstream="$1"',
          'branch="${2:-$(git rev-parse --abbrev-ref HEAD)}"',
          '',
          '# Protected branches list',
          `protected_branches="${quotedBranches}"`,
          '',
          'for protected in $protected_branches; do',
          '  if [ "$branch" = "$protected" ]; then',
          '    echo "\\033[0;31mError: Cannot rebase protected branch: $branch\\033[0m"',
          '    exit 1',
          '  fi',
          'done',
          '',
          'exit 0',
        );
        return lines.join('\n');
      }
    }

    // For hooks with custom scripts.
    // SECURITY (C1): validate before writing — throws if metacharacters are found.
    if (options.script && typeof options.script === 'string' && options.script.trim()) {
      validateCustomScript(options.script.trim());
      lines.push('# Custom script', options.script.trim(), '', 'exit $?');
      return lines.join('\n');
    }

    // For pre-commit, pre-push, pre-merge-commit hooks with actions
    if (actions && actions.length > 0) {
      lines.push('# Run configured actions');
      lines.push('');

      for (const action of actions) {
        if (!isValidAction(action)) {
          continue;
        }

        const command = this.getActionCommand(action, projectPath);
        if (command) {
          const actionConfig = HOOK_ACTIONS[action];
          if (actionConfig) {
            lines.push(`# ${actionConfig.name}: ${actionConfig.description}`);
            lines.push(`echo "\\033[0;36m[dev-suite] Running ${actionConfig.name}...\\033[0m"`);
            lines.push(command);
            lines.push('if [ $? -ne 0 ]; then');
            lines.push(`  echo "\\033[0;31m[dev-suite] ${actionConfig.name} failed. Aborting.\\033[0m"`);
            lines.push('  exit 1');
            lines.push('fi');
            lines.push('');
          }
        }
      }

      lines.push('echo "\\033[0;32m[dev-suite] All checks passed!\\033[0m"');
      lines.push('exit 0');
    } else {
      lines.push('# No actions configured');
      lines.push('exit 0');
    }

    return lines.join('\n');
  }

  /**
   * Install native Git hooks
   */
  installNativeHooks(projectPath: string, hooksConfig: HooksInstallConfig): HookInstallResult {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    const gitDir = path.join(projectPath, '.git');
    const hooksDir = path.join(gitDir, 'hooks');

    if (!fs.existsSync(gitDir)) {
      return { success: false, error: 'Not a Git repository' };
    }

    if (!fs.existsSync(hooksDir)) {
      fs.mkdirSync(hooksDir, { recursive: true });
    }

    const installed: string[] = [];
    const removed: string[] = [];
    const errors: Array<{ hook: string; error: string }> = [];

    for (const [hookType, config] of Object.entries(hooksConfig)) {
      if (hookType === 'useHusky') continue;
      if (!config || typeof config === 'boolean') continue;

      const hookInfo = HOOK_TYPES[hookType];
      if (!hookInfo) continue;

      const hookPath = path.join(hooksDir, hookInfo.name);

      // If hook is disabled, remove it if it exists
      if (!config.enabled) {
        if (fs.existsSync(hookPath)) {
          try {
            const content = fs.readFileSync(hookPath, 'utf-8');
            if (content.includes('# dev-suite hook')) {
              fs.unlinkSync(hookPath);
              removed.push(hookInfo.name);
            }
          } catch (e) {
            errors.push({ hook: hookInfo.name, error: (e as Error).message });
          }
        }
        continue;
      }

      try {
        const script = this.generateHookScript(hookType, config.actions || [], projectPath, {
          conventional: config.conventional,
          pattern: config.pattern,
          script: config.script,
          protectedBranches: config.protectedBranches,
        });

        fs.writeFileSync(hookPath, script);
        fs.chmodSync(hookPath, '755');
        installed.push(hookInfo.name);
      } catch (e) {
        errors.push({ hook: hookInfo.name, error: (e as Error).message });
      }
    }

    return { success: errors.length === 0, installed, removed, errors };
  }

  /**
   * Install Husky and hooks
   */
  installHuskyHooks(projectPath: string, hooksConfig: HooksInstallConfig): HookInstallResult {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    const packageJsonPath = path.join(projectPath, 'package.json');

    if (!fs.existsSync(packageJsonPath)) {
      return { success: false, error: 'No package.json found' };
    }

    const huskyStatus = this.detectHusky(projectPath);
    const installed: string[] = [];
    const removed: string[] = [];
    const errors: Array<{ hook: string; error: string }> = [];

    try {
      // Install Husky if not already installed
      if (!huskyStatus.installed) {
        execSync('npm install husky --save-dev', {
          cwd: projectPath,
          stdio: 'pipe',
          timeout: 60000,
        });

        execSync('npx husky init', {
          cwd: projectPath,
          stdio: 'pipe',
          timeout: 30000,
        });
      }

      const huskyDir = path.join(projectPath, '.husky');
      if (!fs.existsSync(huskyDir)) {
        fs.mkdirSync(huskyDir, { recursive: true });
      }

      // Generate and install each hook
      for (const [hookType, config] of Object.entries(hooksConfig)) {
        if (hookType === 'useHusky') continue;
        if (!config || typeof config === 'boolean') continue;

        const hookInfo = HOOK_TYPES[hookType];
        if (!hookInfo) continue;

        const hookPath = path.join(huskyDir, hookInfo.name);

        // If hook is disabled, remove it if it exists
        if (!config.enabled) {
          if (fs.existsSync(hookPath)) {
            try {
              const content = fs.readFileSync(hookPath, 'utf-8');
              if (content.includes('# dev-suite hook')) {
                fs.unlinkSync(hookPath);
                removed.push(hookInfo.name);
              }
            } catch (e) {
              errors.push({ hook: hookInfo.name, error: (e as Error).message });
            }
          }
          continue;
        }

        try {
          const script = this.generateHookScript(hookType, config.actions || [], projectPath, {
            conventional: config.conventional,
            pattern: config.pattern,
            script: config.script,
            protectedBranches: config.protectedBranches,
          });

          fs.writeFileSync(hookPath, script);
          fs.chmodSync(hookPath, '755');
          installed.push(hookInfo.name);
        } catch (e) {
          errors.push({ hook: hookInfo.name, error: (e as Error).message });
        }
      }

      return { success: errors.length === 0, installed, removed, errors, huskyInstalled: !huskyStatus.installed };
    } catch (e) {
      return { success: false, error: `Husky installation failed: ${(e as Error).message}` };
    }
  }

  /**
   * Install hooks based on configuration
   */
  installHooks(projectPath: string, config: HooksInstallConfig): HookInstallResult {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    if (config.useHusky) {
      return this.installHuskyHooks(projectPath, config);
    } else {
      return this.installNativeHooks(projectPath, config);
    }
  }

  /**
   * Uninstall hooks (native or Husky)
   */
  uninstallHooks(projectPath: string, useHusky = false): HookInstallResult {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    const removed: string[] = [];
    const errors: Array<{ hook: string; error: string }> = [];

    const targetDir = useHusky ? path.join(projectPath, '.husky') : path.join(projectPath, '.git', 'hooks');

    for (const [, hookInfo] of Object.entries(HOOK_TYPES)) {
      const hookPath = path.join(targetDir, hookInfo.name);
      if (fs.existsSync(hookPath)) {
        try {
          const content = fs.readFileSync(hookPath, 'utf-8');
          if (content.includes('# dev-suite hook')) {
            fs.unlinkSync(hookPath);
            removed.push(hookInfo.name);
          }
        } catch (e) {
          errors.push({ hook: hookInfo.name, error: (e as Error).message });
        }
      }
    }

    return { success: errors.length === 0, removed, errors };
  }

  /**
   * Get hooks status for a project
   */
  getGitHooksStatus(projectPath: string): GitHooksStatus {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    const huskyStatus = this.detectHusky(projectPath);
    const nativeHooks = this.detectNativeHooks(projectPath);
    const huskyHooks = this.detectHuskyHooks(projectPath);

    // Determine available actions based on project packages
    const availableActions: Record<string, AvailableAction> = {};
    for (const [action, config] of Object.entries(HOOK_ACTIONS)) {
      const command = this.getActionCommand(action, projectPath);
      availableActions[action] = {
        ...config,
        available: command !== null,
        command,
      };
    }

    return {
      hasGit: fs.existsSync(path.join(projectPath, '.git')),
      husky: huskyStatus,
      nativeHooks,
      huskyHooks,
      installedHooks: huskyStatus.installed ? huskyHooks : nativeHooks,
      availableActions,
      hookTypes: HOOK_TYPES,
    };
  }

  // ========== MULTI-REPOSITORY SUPPORT ==========

  /**
   * Get all available Git repositories in a project
   */
  getAvailableRepositories(projectPath: string, repos: GitRepoInfo[]): RepoWithHooks[] {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    return repos.map((repo) => {
      const repoFullPath = repo.path === '.' ? projectPath : path.join(projectPath, repo.path);

      const hooksStatus = this.getGitHooksStatus(repoFullPath);
      const installedHooksCount = Object.values(hooksStatus.installedHooks || {}).filter((h) => h.exists).length;
      const devSuiteHooksCount = Object.values(hooksStatus.installedHooks || {}).filter((h) => h.exists && h.isDevSuite).length;

      return {
        path: repo.path,
        name: repo.name,
        branch: repo.branch,
        remote: repo.remote,
        remoteUrl: repo.remoteUrl,
        hasGit: hooksStatus.hasGit,
        hasHusky: hooksStatus.husky?.installed || false,
        installedHooksCount,
        devSuiteHooksCount,
        hasDevSuiteHooks: devSuiteHooksCount > 0,
      };
    });
  }

  /**
   * Get hooks status for a specific repository
   */
  getHooksStatusForRepo(projectPath: string, repoPath: string | null = null): GitHooksStatus & { repoPath: string } {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    const targetPath = resolveRepoPath(projectPath, repoPath);

    const status = this.getGitHooksStatus(targetPath);
    return { ...status, repoPath: repoPath || '.' };
  }

  /**
   * Install hooks for a specific repository
   */
  installHooksForRepo(projectPath: string, repoPath: string, config: HooksInstallConfig): HookInstallResult {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    const targetPath = resolveRepoPath(projectPath, repoPath);

    const result = this.installHooks(targetPath, config);
    result.repoPath = repoPath;
    return result;
  }

  /**
   * Uninstall hooks for a specific repository
   */
  uninstallHooksForRepo(projectPath: string, repoPath: string, useHusky = false): HookInstallResult {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    const targetPath = resolveRepoPath(projectPath, repoPath);

    const result = this.uninstallHooks(targetPath, useHusky);
    result.repoPath = repoPath;
    return result;
  }
}
