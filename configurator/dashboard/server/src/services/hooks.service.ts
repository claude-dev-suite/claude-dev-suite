// SPDX-License-Identifier: MIT
/**
 * Hooks Service (Facade)
 *
 * Manages Git hooks (native and Husky) and Claude Code hooks.
 * This is a facade that delegates to specialized sub-services.
 */

import type {
  HuskyStatus,
  HookInfo,
  GitHooksStatus,
  HookConfig,
  HooksInstallConfig,
  HookInstallResult,
  RepoWithHooks,
  ClaudeHookUI,
  ClaudeHooksStatus,
  ClaudeHookConfig,
  ClaudeHooksExport,
  GitRepoInfo,
} from '../types.js';

import { GitHooksService } from './hooks/git-hooks.service.js';
import { ClaudeHooksService } from './hooks/claude-hooks.service.js';

// Re-export constants for backward compatibility
export {
  HOOK_ACTIONS,
  HOOK_TYPES,
  CONVENTIONAL_COMMIT_PATTERN,
  CLAUDE_HOOK_EVENTS,
  CLAUDE_HOOK_TEMPLATES,
} from './hooks/hooks.constants.js';

/**
 * Unified Hooks Service
 *
 * Provides a single interface for managing both Git hooks and Claude Code hooks.
 */
export class HooksService {
  private gitHooks: GitHooksService;
  private claudeHooks: ClaudeHooksService;

  constructor() {
    this.gitHooks = new GitHooksService();
    this.claudeHooks = new ClaudeHooksService();
  }

  // ========== GIT HOOKS (delegated to GitHooksService) ==========

  detectHusky(projectPath: string): HuskyStatus {
    return this.gitHooks.detectHusky(projectPath);
  }

  parseActionsFromScript(content: string): string[] {
    return this.gitHooks.parseActionsFromScript(content);
  }

  detectNativeHooks(projectPath: string): Record<string, HookInfo> {
    return this.gitHooks.detectNativeHooks(projectPath);
  }

  detectHuskyHooks(projectPath: string): Record<string, HookInfo> {
    return this.gitHooks.detectHuskyHooks(projectPath);
  }

  detectPackageScripts(projectPath: string): { scripts: Record<string, string>; packages: string[] } {
    return this.gitHooks.detectPackageScripts(projectPath);
  }

  getActionCommand(action: string, projectPath: string): string | null {
    return this.gitHooks.getActionCommand(action, projectPath);
  }

  generateHookScript(hookType: string, actions: string[], projectPath: string, options?: Partial<HookConfig>): string {
    return this.gitHooks.generateHookScript(hookType, actions, projectPath, options);
  }

  installNativeHooks(projectPath: string, hooksConfig: HooksInstallConfig): HookInstallResult {
    return this.gitHooks.installNativeHooks(projectPath, hooksConfig);
  }

  installHuskyHooks(projectPath: string, hooksConfig: HooksInstallConfig): HookInstallResult {
    return this.gitHooks.installHuskyHooks(projectPath, hooksConfig);
  }

  installHooks(projectPath: string, config: HooksInstallConfig): HookInstallResult {
    return this.gitHooks.installHooks(projectPath, config);
  }

  uninstallHooks(projectPath: string, useHusky?: boolean): HookInstallResult {
    return this.gitHooks.uninstallHooks(projectPath, useHusky);
  }

  getGitHooksStatus(projectPath: string): GitHooksStatus {
    return this.gitHooks.getGitHooksStatus(projectPath);
  }

  // ========== MULTI-REPOSITORY SUPPORT ==========

  getAvailableRepositories(projectPath: string, repos: GitRepoInfo[]): RepoWithHooks[] {
    return this.gitHooks.getAvailableRepositories(projectPath, repos);
  }

  getHooksStatusForRepo(projectPath: string, repoPath?: string | null): GitHooksStatus & { repoPath: string } {
    return this.gitHooks.getHooksStatusForRepo(projectPath, repoPath);
  }

  installHooksForRepo(projectPath: string, repoPath: string, config: HooksInstallConfig): HookInstallResult {
    return this.gitHooks.installHooksForRepo(projectPath, repoPath, config);
  }

  uninstallHooksForRepo(projectPath: string, repoPath: string, useHusky?: boolean): HookInstallResult {
    return this.gitHooks.uninstallHooksForRepo(projectPath, repoPath, useHusky);
  }

  // ========== CLAUDE CODE HOOKS (delegated to ClaudeHooksService) ==========

  getClaudeSettingsPath(projectPath: string): string {
    return this.claudeHooks.getClaudeSettingsPath(projectPath);
  }

  readClaudeSettings(projectPath: string): Record<string, unknown> | null {
    return this.claudeHooks.readClaudeSettings(projectPath);
  }

  writeClaudeSettings(projectPath: string, settings: Record<string, unknown>): { success: boolean; error?: string } {
    return this.claudeHooks.writeClaudeSettings(projectPath, settings);
  }

  parseClaudeHooksForUI(hooks: Record<string, unknown>): ClaudeHookUI[] {
    return this.claudeHooks.parseClaudeHooksForUI(hooks);
  }

  getClaudeHooksStatus(projectPath: string): ClaudeHooksStatus {
    return this.claudeHooks.getClaudeHooksStatus(projectPath);
  }

  addClaudeHook(projectPath: string, hookConfig: ClaudeHookConfig): { success: boolean; error?: string } {
    return this.claudeHooks.addClaudeHook(projectPath, hookConfig);
  }

  updateClaudeHook(projectPath: string, hookId: string, hookConfig: Partial<ClaudeHookConfig>): { success: boolean; error?: string } {
    return this.claudeHooks.updateClaudeHook(projectPath, hookId, hookConfig);
  }

  removeClaudeHook(projectPath: string, hookId: string): { success: boolean; error?: string } {
    return this.claudeHooks.removeClaudeHook(projectPath, hookId);
  }

  applyClaudeTemplate(projectPath: string, templateId: string): { success: boolean; error?: string } {
    return this.claudeHooks.applyClaudeTemplate(projectPath, templateId);
  }

  clearAllClaudeHooks(projectPath: string): { success: boolean; error?: string } {
    return this.claudeHooks.clearAllClaudeHooks(projectPath);
  }

  exportClaudeHooks(projectPath: string): ClaudeHooksExport {
    return this.claudeHooks.exportClaudeHooks(projectPath);
  }

  importClaudeHooks(projectPath: string, exported: ClaudeHooksExport, merge?: boolean): { success: boolean; error?: string } {
    return this.claudeHooks.importClaudeHooks(projectPath, exported, merge);
  }

  // ========== INTEGRATION VALIDATOR HOOK ==========

  configureIntegrationValidatorHook(
    projectPath: string,
    detectedStack: {
      frontend?: { framework?: string; metaFramework?: string };
      backend?: { framework?: string; runtime?: string };
    }
  ): { success: boolean; configured: boolean; error?: string } {
    return this.claudeHooks.configureIntegrationValidatorHook(projectPath, detectedStack);
  }

  getMonitoredAgentsList(detectedStack: {
    frontend?: { framework?: string; metaFramework?: string };
    backend?: { framework?: string; runtime?: string };
  }): { backend: string[]; frontend: string[] } {
    return this.claudeHooks.getMonitoredAgentsList(detectedStack);
  }
}
