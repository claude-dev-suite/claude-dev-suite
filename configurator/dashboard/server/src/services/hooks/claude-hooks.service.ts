// SPDX-License-Identifier: MIT
/**
 * Claude Code Hooks Service
 *
 * Manages Claude Code hooks in settings.json and integration validator configuration.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';
import { resolveProjectPath, PathValidationError } from '../../utils/utilities.js';
import { targetPaths } from '../targets/target-paths.js';

/** Hook scripts live beside the target's other config, under <configDir>/hooks/. */
const HOOK_SCRIPTS_SUBDIR = 'hooks';
import type {
  ClaudeHookUI,
  ClaudeHooksStatus,
  ClaudeHookConfig,
  ClaudeHooksExport,
} from '../../types.js';

import {
  CLAUDE_HOOK_EVENTS,
  CLAUDE_HOOK_TEMPLATES,
  CLAUDE_OUTPUT_FILTER_HOOKS,
  FILE_CHANGE_HOOK_SCRIPT,
  BASH_COMMAND_HOOK_SCRIPT,
  STALE_DOCS_HOOK_SCRIPT,
  INTEGRATION_VALIDATOR_MARK_SCRIPT,
  INTEGRATION_VALIDATOR_DECIDE_SCRIPT,
  INTEGRATION_VALIDATOR_TOOL_MATCHER,
  API_TOUCHED_MARKER_REL,
  HOOK_SCRIPT_RUNNER,
  DEFAULT_INTEGRATION_VALIDATION_LEVEL,
  type IntegrationValidationLevel,
} from './hooks.constants.js';

// ============================================
// SECURITY: Command validation
// ============================================

/**
 * Pattern for safe Claude hook commands.
 *
 * Allows characters needed by typical hook invocations:
 *   npm run X, npx X, node X, ./scripts/X, python X, etc.
 *
 * Explicitly rejects shell metacharacters that enable injection:
 *   ; | & ` $ ( ) { } < > \n \r ! ~ #
 *
 * Trust model: Claude hooks are developer-controlled project configuration.
 * This guard is a best-effort protection against accidental or supply-chain-
 * injected payloads written to .claude/settings.json.  It mirrors the
 * SAFE_SCRIPT_PATTERN used in git-hooks.service.ts.
 */
const SAFE_HOOK_COMMAND_PATTERN = /^[a-zA-Z0-9 _./@:=\-\[\]"',+]+$/;

function validateHookCommand(command: string): void {
  if (typeof command !== 'string') return;
  if (!SAFE_HOOK_COMMAND_PATTERN.test(command)) {
    throw new PathValidationError(
      'Hook command contains disallowed shell metacharacters. ' +
        'Only alphanumeric characters and _ . / @ : = - [ ] " \' , + are permitted.',
    );
  }
}

/**
 * How assertive integration validation should be in this project.
 *
 * Read from `.dev-suite.json` so the choice survives a reinstall and is visible
 * next to the rest of the project's dev-suite configuration. An absent or
 * unrecognised value falls back to the default rather than throwing: a
 * malformed config should not be able to break an install.
 */
export function readIntegrationValidationLevel(projectPath: string): IntegrationValidationLevel {
  try {
    const configPath = path.join(projectPath, '.dev-suite.json');
    if (!fs.existsSync(configPath)) return DEFAULT_INTEGRATION_VALIDATION_LEVEL;
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
      integrationValidation?: unknown;
    };
    const value = parsed.integrationValidation;
    if (value === 'off' || value === 'warn' || value === 'block') return value;
  } catch {
    // Unreadable or malformed .dev-suite.json — use the default.
  }
  return DEFAULT_INTEGRATION_VALIDATION_LEVEL;
}

/** One entry of a hook's `hooks` array, as Claude Code expects it on disk. */
type HookHandler =
  | { type: 'command'; command: string; timeout?: number }
  | { type: 'prompt'; prompt: string; timeout?: number };

/**
 * Wrap command strings in the documented handler shape.
 *
 * Every writer here used to push bare strings (`hooks: ["./script.sh"]`), which
 * appears in no version of the hook schema — each entry must be an object
 * carrying a `type`. Reading still accepts the old shape so projects written by
 * earlier versions keep working; only new writes are corrected.
 */
function toHookHandlers(commands: Array<string | HookHandler>): HookHandler[] {
  return commands.map(c => (typeof c === 'string' ? { type: 'command' as const, command: c } : c));
}

/** The command of a handler, tolerating the legacy bare-string form. */
function handlerCommand(handler: unknown): string | null {
  if (typeof handler === 'string') return handler;
  if (typeof handler === 'object' && handler !== null) {
    const h = handler as { type?: string; command?: string };
    if ((h.type === 'command' || h.type === undefined) && typeof h.command === 'string') {
      return h.command;
    }
  }
  return null;
}

/**
 * The hook scripts a template's commands name.
 *
 * Derived from the command strings rather than declared separately, so a
 * template cannot drift away from the script it depends on.
 */
function scriptsReferencedBy(template: { hooks: Array<{ hooks?: unknown[] }> }): string[] {
  const known = [
    FILE_CHANGE_HOOK_SCRIPT,
    BASH_COMMAND_HOOK_SCRIPT,
    STALE_DOCS_HOOK_SCRIPT,
  ];
  const found = new Set<string>();
  for (const entry of template.hooks ?? []) {
    for (const handler of entry.hooks ?? []) {
      const command = typeof handler === 'string' ? handler : handlerCommand(handler);
      if (!command) continue;
      for (const script of known) if (command.includes(script)) found.add(script);
    }
  }
  return [...found];
}

export class ClaudeHooksService {
  /**
   * Get the path to Claude settings.json
   */
  getClaudeSettingsPath(projectPath: string): string {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    return targetPaths(projectPath).settingsFile;
  }

  /**
   * Read Claude settings.json
   */
  readClaudeSettings(projectPath: string): Record<string, unknown> | null {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    const settingsPath = this.getClaudeSettingsPath(projectPath);

    if (!fs.existsSync(settingsPath)) {
      return null;
    }

    try {
      const content = fs.readFileSync(settingsPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  /**
   * Write Claude settings.json
   */
  writeClaudeSettings(projectPath: string, settings: Record<string, unknown>): { success: boolean; error?: string } {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    const claudeDir = targetPaths(projectPath).configDir;
    const settingsPath = this.getClaudeSettingsPath(projectPath);

    try {
      if (!fs.existsSync(claudeDir)) {
        fs.mkdirSync(claudeDir, { recursive: true });
      }

      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      return { success: true };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }

  /**
   * Parse hooks into a structured format for the UI
   */
  parseClaudeHooksForUI(hooks: Record<string, unknown>): ClaudeHookUI[] {
    const parsed: ClaudeHookUI[] = [];

    for (const [event, eventHooks] of Object.entries(hooks)) {
      if (!Array.isArray(eventHooks)) continue;

      for (let i = 0; i < eventHooks.length; i++) {
        const hookConfig = eventHooks[i] as {
          matcher?: string;
          hooks?: Array<string | { type?: string; command?: string; prompt?: string; timeout?: number }>;
          timeout?: number
        };

        // Parse commands - can be strings or prompt hook objects
        const commands: ClaudeHookUI['commands'] = [];
        if (hookConfig.hooks) {
          for (const hook of hookConfig.hooks) {
            const asCommand = handlerCommand(hook);
            if (asCommand !== null) {
              // Covers both the current { type: 'command', command } shape and
              // the bare strings written by earlier versions.
              commands.push(asCommand);
            } else if (typeof hook === 'object' && hook.type === 'prompt' && hook.prompt) {
              commands.push({
                type: 'prompt',
                prompt: hook.prompt,
                timeout: hook.timeout,
              });
            }
          }
        }

        parsed.push({
          id: `${event}-${i}`,
          event: event,
          matcher: hookConfig.matcher || '',
          commands,
          timeout: hookConfig.timeout,
        });
      }
    }

    return parsed;
  }

  /**
   * Get Claude hooks status for a project
   */
  getClaudeHooksStatus(projectPath: string): ClaudeHooksStatus {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    const settingsPath = this.getClaudeSettingsPath(projectPath);
    const claudeDir = targetPaths(projectPath).configDir;
    const hasClaudeDir = fs.existsSync(claudeDir);
    const hasSettings = fs.existsSync(settingsPath);

    const result: ClaudeHooksStatus = {
      hasClaudeDir,
      hasSettings,
      settingsPath,
      hooks: [],
      hookCount: 0,
      availableEvents: CLAUDE_HOOK_EVENTS,
      templates: CLAUDE_HOOK_TEMPLATES,
    };

    if (hasSettings) {
      const settings = this.readClaudeSettings(projectPath);
      if (settings && settings.hooks) {
        const hooks = settings.hooks as Record<string, unknown>;
        result.hooks = this.parseClaudeHooksForUI(hooks);
        result.hookCount = result.hooks.length;
        result.rawHooks = hooks;
      }
    }

    return result;
  }

  /**
   * Add a new Claude hook
   */
  addClaudeHook(projectPath: string, hookConfig: ClaudeHookConfig): { success: boolean; error?: string } {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');

    // SECURITY: validate every command string before writing to settings.json
    for (const cmd of hookConfig.commands || []) {
      validateHookCommand(cmd);
    }

    const settings = this.readClaudeSettings(projectPath) || {};

    if (!settings.hooks) {
      settings.hooks = {};
    }

    const hooks = settings.hooks as Record<string, unknown[]>;
    const event = hookConfig.event;
    if (!hooks[event]) {
      hooks[event] = [];
    }

    const newHook: Record<string, unknown> = {
      hooks: toHookHandlers(hookConfig.commands || []),
    };

    const eventInfo = CLAUDE_HOOK_EVENTS[event];
    if (eventInfo?.hasMatcher && hookConfig.matcher) {
      newHook.matcher = hookConfig.matcher;
    }

    if (hookConfig.timeout) {
      newHook.timeout = hookConfig.timeout;
    }

    hooks[event].push(newHook);

    return this.writeClaudeSettings(projectPath, settings);
  }

  /**
   * Update an existing Claude hook
   */
  updateClaudeHook(projectPath: string, hookId: string, hookConfig: Partial<ClaudeHookConfig>): { success: boolean; error?: string } {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    const settings = this.readClaudeSettings(projectPath);

    if (!settings || !settings.hooks) {
      return { success: false, error: 'No hooks configured' };
    }

    const hooks = settings.hooks as Record<string, Array<{ matcher?: string; hooks?: Array<string | HookHandler>; timeout?: number }>>;
    const parts = hookId.split('-');
    const event = parts[0];
    const indexStr = parts[1];

    if (!event || !indexStr) {
      return { success: false, error: 'Invalid hook ID' };
    }

    const index = parseInt(indexStr, 10);
    const eventHooks = hooks[event];

    if (!eventHooks?.[index]) {
      return { success: false, error: 'Hook not found' };
    }

    // If event changed, move the hook
    if (hookConfig.event && hookConfig.event !== event) {
      const oldHook = eventHooks.splice(index, 1)[0];
      if (!oldHook) {
        return { success: false, error: 'Hook not found' };
      }

      if (eventHooks.length === 0) {
        delete hooks[event];
      }

      if (!hooks[hookConfig.event]) {
        hooks[hookConfig.event] = [];
      }

      const newHook: Record<string, unknown> = {
        hooks: toHookHandlers(hookConfig.commands ?? (oldHook.hooks as Array<string | HookHandler>) ?? []),
      };

      const newEventInfo = CLAUDE_HOOK_EVENTS[hookConfig.event];
      if (newEventInfo?.hasMatcher && hookConfig.matcher) {
        newHook.matcher = hookConfig.matcher;
      }

      if (hookConfig.timeout) {
        newHook.timeout = hookConfig.timeout;
      }

      const newEventHooks = hooks[hookConfig.event];
      if (newEventHooks) {
        newEventHooks.push(newHook as { matcher?: string; hooks?: string[]; timeout?: number });
      }
    } else {
      // Update in place
      const hook = eventHooks[index];
      if (!hook) {
        return { success: false, error: 'Hook not found' };
      }

      if (hookConfig.commands) {
        hook.hooks = toHookHandlers(hookConfig.commands);
      }

      const eventInfo = CLAUDE_HOOK_EVENTS[event];
      if (eventInfo?.hasMatcher) {
        if (hookConfig.matcher) {
          hook.matcher = hookConfig.matcher;
        } else {
          delete hook.matcher;
        }
      }

      if (hookConfig.timeout) {
        hook.timeout = hookConfig.timeout;
      } else {
        delete hook.timeout;
      }
    }

    return this.writeClaudeSettings(projectPath, settings);
  }

  /**
   * Remove a Claude hook
   */
  removeClaudeHook(projectPath: string, hookId: string): { success: boolean; error?: string } {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    const settings = this.readClaudeSettings(projectPath);

    if (!settings || !settings.hooks) {
      return { success: false, error: 'No hooks configured' };
    }

    const hooks = settings.hooks as Record<string, Array<{ matcher?: string; hooks?: Array<string | HookHandler>; timeout?: number }>>;
    const parts = hookId.split('-');
    const event = parts[0];
    const indexStr = parts[1];

    if (!event || !indexStr) {
      return { success: false, error: 'Invalid hook ID' };
    }

    const index = parseInt(indexStr, 10);
    const eventHooks = hooks[event];

    if (!eventHooks?.[index]) {
      return { success: false, error: 'Hook not found' };
    }

    eventHooks.splice(index, 1);

    if (eventHooks.length === 0) {
      delete hooks[event];
    }

    return this.writeClaudeSettings(projectPath, settings);
  }

  /**
   * Apply a template hook
   */
  applyClaudeTemplate(projectPath: string, templateId: string): { success: boolean; error?: string } {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    const template = CLAUDE_HOOK_TEMPLATES[templateId];

    if (!template) {
      return { success: false, error: 'Template not found' };
    }

    // Every built-in template now runs one of the hook primitives, so the
    // script has to be in the project before the entry pointing at it is
    // written. A template that references a missing script is exactly the kind
    // of silently-inert hook this rewrite exists to remove.
    for (const script of scriptsReferencedBy(template)) {
      const copied = this.copyHookScript(projectPath, script);
      if (!copied.success) {
        return { success: false, error: copied.error };
      }
    }

    const settings = this.readClaudeSettings(projectPath) || {};

    if (!settings.hooks) {
      settings.hooks = {};
    }

    const hooks = settings.hooks as Record<string, unknown[]>;
    const event = template.event;
    if (!hooks[event]) {
      hooks[event] = [];
    }

    for (const hookConfig of template.hooks) {
      const newHook: Record<string, unknown> = {
        hooks: toHookHandlers(hookConfig.hooks),
      };

      if (hookConfig.matcher) {
        newHook.matcher = hookConfig.matcher;
      }

      hooks[event].push(newHook);
    }

    return this.writeClaudeSettings(projectPath, settings);
  }

  /**
   * Clear all Claude hooks
   */
  clearAllClaudeHooks(projectPath: string): { success: boolean; error?: string } {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    const settings = this.readClaudeSettings(projectPath);

    if (!settings) {
      return { success: false, error: 'No settings file found' };
    }

    delete settings.hooks;

    return this.writeClaudeSettings(projectPath, settings);
  }

  /**
   * Export hooks to a shareable format
   */
  exportClaudeHooks(projectPath: string): ClaudeHooksExport {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    const settings = this.readClaudeSettings(projectPath);
    const hooks = settings?.hooks || {};

    return {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      hooks: hooks as Record<string, unknown>,
    };
  }

  /**
   * Import hooks from exported format
   */
  importClaudeHooks(projectPath: string, exported: ClaudeHooksExport, merge = true): { success: boolean; error?: string } {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    if (!exported || !exported.hooks) {
      return { success: false, error: 'Invalid export format' };
    }

    const settings = this.readClaudeSettings(projectPath) || {};

    if (merge && settings.hooks) {
      const currentHooks = settings.hooks as Record<string, unknown[]>;
      for (const [event, eventHooks] of Object.entries(exported.hooks)) {
        if (!currentHooks[event]) {
          currentHooks[event] = [];
        }
        if (Array.isArray(eventHooks)) {
          currentHooks[event].push(...eventHooks);
        }
      }
    } else {
      settings.hooks = exported.hooks;
    }

    return this.writeClaudeSettings(projectPath, settings);
  }

  // ========== INTEGRATION VALIDATOR HOOK ==========

  /**
   * Copy a hook script from the dev-suite source into the project's hooks dir.
   *
   * Shared by the output-filter hooks and the integration validator: both need
   * the script on disk before settings.json can point at it.
   */
  private copyHookScript(
    projectPath: string,
    scriptFile: string,
    devSuiteRoot?: string
  ): { success: boolean; relCommand?: string; error?: string } {
    const root =
      devSuiteRoot ??
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..', '..');
    const srcScript = path.join(root, 'templates', 'hooks', scriptFile);

    if (!fs.existsSync(srcScript)) {
      return { success: false, error: `Source script not found: ${srcScript}` };
    }

    const hooksDir = path.join(targetPaths(projectPath).configDir, HOOK_SCRIPTS_SUBDIR);
    const destScript = path.join(hooksDir, scriptFile);

    try {
      if (!fs.existsSync(hooksDir)) {
        fs.mkdirSync(hooksDir, { recursive: true });
      }
      fs.copyFileSync(srcScript, destScript);
      try {
        fs.chmodSync(destScript, 0o755);
      } catch {
        // chmod is a no-op on Windows; the script needs bash there anyway.
      }
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }

    return {
      success: true,
      relCommand: `${targetPaths(projectPath).relConfigDir}/${HOOK_SCRIPTS_SUBDIR}/${scriptFile}`,
    };
  }

  /**
   * Install one of dev-suite's hook scripts into the project.
   *
   * Public because the recipes write their own settings entries but still need
   * the script on disk; the alternative was a second copy of this logic.
   */
  installHookScript(
    projectPath: string,
    scriptFile: string,
    devSuiteRoot?: string
  ): { success: boolean; relCommand?: string; error?: string } {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    return this.copyHookScript(projectPath, scriptFile, devSuiteRoot);
  }

  /**
   * True when this project already carries the current (script-based)
   * integration validation.
   */
  private hasIntegrationValidatorHook(projectPath: string, settings: Record<string, unknown>): boolean {
    const hooks = settings.hooks as Record<string, unknown[]> | undefined;
    if (!hooks) return false;
    const decideCmd = `${targetPaths(projectPath).relConfigDir}/${HOOK_SCRIPTS_SUBDIR}/${INTEGRATION_VALIDATOR_DECIDE_SCRIPT}`;
    const stopHooks = hooks.Stop;
    if (!Array.isArray(stopHooks)) return false;
    return stopHooks.some(entry => {
      const handlers = (entry as { hooks?: unknown[] })?.hooks;
      if (!Array.isArray(handlers)) return false;
      return handlers.some(h => (handlerCommand(h) ?? '').includes(decideCmd));
    });
  }

  /**
   * Strip the pre-2.0 `SubagentStop` prompt hook.
   *
   * The old entry was never removed by anything: uninstall only un-merged
   * `skillListingBudgetFraction`, and the install path short-circuited as soon
   * as it saw its own entry. A project that once had it kept it forever, paying
   * a model call per subagent for a validation that could not run. Migration
   * has to delete it actively.
   */
  private removeLegacyIntegrationValidatorHook(settings: Record<string, unknown>): boolean {
    const hooks = settings.hooks as Record<string, unknown[]> | undefined;
    if (!hooks || !Array.isArray(hooks.SubagentStop)) return false;

    const before = hooks.SubagentStop.length;
    const kept = hooks.SubagentStop.filter(entry => {
      const handlers = (entry as { hooks?: unknown[] })?.hooks;
      if (!Array.isArray(handlers)) return true;
      return !handlers.some(h => {
        const prompt = typeof h === 'object' && h !== null ? (h as { prompt?: string }).prompt : undefined;
        if (!prompt) return false;
        return prompt.includes('integration-validator') || prompt.includes('API integration detected');
      });
    });

    if (kept.length === before) return false;
    if (kept.length === 0) {
      delete hooks.SubagentStop;
    } else {
      hooks.SubagentStop = kept;
    }
    return true;
  }

  /**
   * Install API integration validation.
   *
   * This replaces a `SubagentStop` prompt hook whose matcher was a list of
   * agent *names* (`react-expert|nestjs-expert|...`). Three things were wrong
   * with that design:
   *
   *  1. A subagent typed generically — what a parallel fan-out uses — never
   *     matched, so the validation the project advertised in AGENTS.md never
   *     ran at all.
   *  2. When it did match, it spent a model call (30s timeout) per finishing
   *     subagent. Sixteen concurrent subagents meant sixteen concurrent calls.
   *  3. It could not have validated anything regardless: a prompt hook
   *     returning `{"ok": false}` feeds a reason back to the agent — nothing in
   *     it invokes `integration-validator-expert`.
   *
   * The replacement is deterministic and independent of agent names, because
   * hooks configured in settings.json also run inside subagents:
   *
   *  - `PostToolUse` -> {@link INTEGRATION_VALIDATOR_MARK_SCRIPT}: a path
   *    comparison per write, appending to a marker file. No model call.
   *  - `Stop` -> {@link INTEGRATION_VALIDATOR_DECIDE_SCRIPT}: one decision per
   *    turn, reading that marker. The marker is the debounce, so a fan-out of
   *    any width collapses into a single check.
   *
   * @param options.level `warn` (default) reports; `block` exits 2 so Claude
   *        continues the turn and runs the validation; `off` removes the hooks.
   */
  configureIntegrationValidatorHook(
    projectPath: string,
    detectedStack: {
      frontend?: { framework?: string; metaFramework?: string };
      backend?: { framework?: string; runtime?: string };
    },
    options?: { level?: IntegrationValidationLevel; devSuiteRoot?: string }
  ): { success: boolean; configured: boolean; error?: string } {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');

    // No explicit level: honour the project's own setting. Callers (the
    // installer, the upgrade applier) therefore need to know nothing about it.
    const level = options?.level ?? readIntegrationValidationLevel(projectPath);

    if (level === 'off') {
      const removal = this.removeIntegrationValidatorHook(projectPath);
      return {
        success: removal.success,
        configured: false,
        error: removal.error ?? 'Integration validation disabled for this project',
      };
    }

    // The check only means something when there is an API surface on both ends
    // to disagree. `typescript-expert` is always present, so it proves nothing.
    const monitored = this.getMonitoredAgentsList(detectedStack);
    const hasStack =
      monitored.backend.length > 0 || monitored.frontend.some(a => a !== 'typescript-expert');
    if (!hasStack) {
      return {
        success: true,
        configured: false,
        error: 'No backend or frontend framework detected that requires API validation',
      };
    }

    const settings = this.readClaudeSettings(projectPath) || {};

    // Migration runs before the idempotency check: a project can hold the dead
    // v1 entry *and* the current one, and the dead one must go either way.
    const removedLegacy = this.removeLegacyIntegrationValidatorHook(settings);

    if (this.hasIntegrationValidatorHook(projectPath, settings)) {
      if (removedLegacy) {
        const write = this.writeClaudeSettings(projectPath, settings);
        if (!write.success) return { success: false, configured: false, error: write.error };
      }
      return { success: true, configured: false, error: 'Integration validator hook already configured' };
    }

    const mark = this.copyHookScript(projectPath, INTEGRATION_VALIDATOR_MARK_SCRIPT, options?.devSuiteRoot);
    if (!mark.success || !mark.relCommand) {
      return { success: false, configured: false, error: mark.error };
    }
    const decide = this.copyHookScript(projectPath, INTEGRATION_VALIDATOR_DECIDE_SCRIPT, options?.devSuiteRoot);
    if (!decide.success || !decide.relCommand) {
      return { success: false, configured: false, error: decide.error };
    }

    if (!settings.hooks) settings.hooks = {};
    const hooks = settings.hooks as Record<string, unknown[]>;

    if (!Array.isArray(hooks.PostToolUse)) hooks.PostToolUse = [];
    hooks.PostToolUse.push({
      matcher: INTEGRATION_VALIDATOR_TOOL_MATCHER,
      hooks: toHookHandlers([`${HOOK_SCRIPT_RUNNER} ${mark.relCommand}`]),
    });

    if (!Array.isArray(hooks.Stop)) hooks.Stop = [];
    hooks.Stop.push({
      // `Stop` takes no matcher. The level is an argument so one script covers
      // both modes and the setting stays visible in settings.json.
      hooks: toHookHandlers([`${HOOK_SCRIPT_RUNNER} ${decide.relCommand} ${level}`]),
    });

    const writeResult = this.writeClaudeSettings(projectPath, settings);
    if (!writeResult.success) {
      return { success: false, configured: false, error: writeResult.error };
    }

    return { success: true, configured: true };
  }

  /**
   * Remove API integration validation: both hook entries, both scripts and the
   * marker file. Also strips the pre-2.0 `SubagentStop` entry, so uninstalling
   * cleans up a project that never upgraded.
   *
   * User-authored `PostToolUse` and `Stop` hooks are left untouched — only
   * entries pointing at our own scripts are dropped.
   */
  removeIntegrationValidatorHook(projectPath: string): { success: boolean; error?: string } {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');

    const paths = targetPaths(projectPath);
    const hooksDir = path.join(paths.configDir, HOOK_SCRIPTS_SUBDIR);

    for (const script of [INTEGRATION_VALIDATOR_MARK_SCRIPT, INTEGRATION_VALIDATOR_DECIDE_SCRIPT]) {
      const dest = path.join(hooksDir, script);
      if (fs.existsSync(dest)) {
        try {
          fs.unlinkSync(dest);
        } catch (e) {
          return { success: false, error: (e as Error).message };
        }
      }
    }

    const marker = path.join(projectPath, ...API_TOUCHED_MARKER_REL.split('/'));
    if (fs.existsSync(marker)) {
      try {
        fs.unlinkSync(marker);
      } catch {
        // A leftover marker is harmless once the Stop hook is gone.
      }
    }

    const settings = this.readClaudeSettings(projectPath);
    if (!settings?.hooks) return { success: true };

    const hooks = settings.hooks as Record<string, unknown[]>;
    const ourCommands = [INTEGRATION_VALIDATOR_MARK_SCRIPT, INTEGRATION_VALIDATOR_DECIDE_SCRIPT].map(
      s => `${paths.relConfigDir}/${HOOK_SCRIPTS_SUBDIR}/${s}`
    );

    let changed = this.removeLegacyIntegrationValidatorHook(settings);

    for (const event of ['PostToolUse', 'Stop']) {
      const entries = hooks[event];
      if (!Array.isArray(entries)) continue;
      const kept = entries.filter(entry => {
        const handlers = (entry as { hooks?: unknown[] })?.hooks;
        if (!Array.isArray(handlers)) return true;
        return !handlers.some(h => {
          const cmd = handlerCommand(h);
          return !!cmd && ourCommands.some(own => cmd.includes(own));
        });
      });
      if (kept.length === entries.length) continue;
      changed = true;
      if (kept.length === 0) {
        delete hooks[event];
      } else {
        hooks[event] = kept;
      }
    }

    if (!changed) return { success: true };
    return this.writeClaudeSettings(projectPath, settings);
  }

  // ========== OUTPUT FILTER HOOKS ==========

  /**
   * Install an output-filter PreToolUse hook for a target project.
   *
   * Steps:
   *  1. Resolve the template from CLAUDE_OUTPUT_FILTER_HOOKS.
   *  2. Copy the companion shell script from `devSuiteRoot/templates/hooks/`
   *     to `<projectPath>/.claude/hooks/` and make it executable (chmod +x on
   *     POSIX; on Windows the script requires WSL or Git Bash at runtime).
   *  3. Register the hook in `.claude/settings.json` pointing to the local copy.
   *
   * Fail-open guarantee: each script already handles its own errors gracefully.
   * This method only installs; it does not execute the script itself.
   *
   * @param projectPath   Absolute path to the target project.
   * @param hookId        Key from CLAUDE_OUTPUT_FILTER_HOOKS (e.g. 'filter-test-output').
   * @param devSuiteRoot  Absolute path to the dev-suite source repo root.
   *                      Defaults to three levels up from this file's directory.
   */
  installOutputFilterHook(
    projectPath: string,
    hookId: string,
    devSuiteRoot?: string
  ): { success: boolean; scriptPath?: string; error?: string } {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');

    const template = CLAUDE_OUTPUT_FILTER_HOOKS[hookId];
    if (!template) {
      return { success: false, error: `Unknown output-filter hook: ${hookId}` };
    }

    if (!template.scriptFile) {
      return { success: false, error: `Template ${hookId} has no scriptFile defined` };
    }

    const copied = this.copyHookScript(projectPath, template.scriptFile, devSuiteRoot);
    if (!copied.success || !copied.relCommand) {
      return { success: false, error: copied.error };
    }
    const destScript = path.join(
      targetPaths(projectPath).configDir, HOOK_SCRIPTS_SUBDIR, template.scriptFile
    );

    // Register in settings.json using the local relative path
    const localHookCmd = copied.relCommand;
    const addResult = this.addClaudeHook(projectPath, {
      event: template.event,
      matcher: template.hooks[0]?.matcher,
      commands: [localHookCmd],
    });

    if (!addResult.success) {
      return { success: false, error: addResult.error };
    }

    return { success: true, scriptPath: destScript };
  }

  /**
   * Uninstall an output-filter hook: removes the script from .claude/hooks/
   * and removes the matching entry from .claude/settings.json.
   *
   * @param projectPath  Absolute path to the target project.
   * @param hookId       Key from CLAUDE_OUTPUT_FILTER_HOOKS.
   */
  uninstallOutputFilterHook(
    projectPath: string,
    hookId: string
  ): { success: boolean; error?: string } {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');

    const template = CLAUDE_OUTPUT_FILTER_HOOKS[hookId];
    if (!template) {
      return { success: false, error: `Unknown output-filter hook: ${hookId}` };
    }

    if (!template.scriptFile) {
      return { success: false, error: `Template ${hookId} has no scriptFile defined` };
    }

    // Remove the script file if it exists
    const destScript = path.join(targetPaths(projectPath).configDir, HOOK_SCRIPTS_SUBDIR, template.scriptFile);
    if (fs.existsSync(destScript)) {
      try {
        fs.unlinkSync(destScript);
      } catch (e) {
        return { success: false, error: (e as Error).message };
      }
    }

    // Remove the hook entry from settings.json
    const settings = this.readClaudeSettings(projectPath);
    if (!settings?.hooks) {
      // Nothing to clean up in settings — still report success
      return { success: true };
    }

    const localHookCmd = `${targetPaths(projectPath).relConfigDir}/${HOOK_SCRIPTS_SUBDIR}/${template.scriptFile}`;
    const hooks = settings.hooks as Record<string, Array<{ matcher?: string; hooks?: unknown[] }>>;
    const eventKey = template.event;
    const eventHooks = hooks[eventKey];

    if (!Array.isArray(eventHooks)) {
      return { success: true };
    }

    const before = eventHooks.length;
    const filtered = eventHooks.filter(
      (h) => !Array.isArray(h.hooks) || !h.hooks.some((entry) => handlerCommand(entry) === localHookCmd)
    );

    if (filtered.length === before) {
      // Entry not found in settings — idempotent success
      return { success: true };
    }

    if (filtered.length === 0) {
      delete hooks[eventKey];
    } else {
      hooks[eventKey] = filtered;
    }

    return this.writeClaudeSettings(projectPath, settings);
  }

  /**
   * Get the list of monitored agents based on detected stack
   */
  getMonitoredAgentsList(detectedStack: {
    frontend?: { framework?: string; metaFramework?: string };
    backend?: { framework?: string; runtime?: string };
  }): { backend: string[]; frontend: string[] } {
    const backend: string[] = [];
    const frontend: string[] = [];

    const backendFramework = detectedStack.backend?.framework?.toLowerCase() || '';
    const backendRuntime = detectedStack.backend?.runtime?.toLowerCase() || '';

    if (backendFramework.includes('spring') || backendRuntime.includes('java')) {
      backend.push('spring-boot-expert');
    }
    if (backendFramework.includes('nest')) {
      backend.push('nestjs-expert');
    }
    if (backendFramework.includes('fastapi') || backendFramework.includes('django') || backendFramework.includes('flask')) {
      backend.push('fastapi-expert');
    }
    if (backendFramework.includes('gin') || backendFramework.includes('fiber') || backendFramework.includes('echo') || backendFramework.includes('chi') || backendRuntime.includes('go')) {
      backend.push('go-expert');
    }
    if (backendFramework.includes('actix') || backendFramework.includes('axum') || backendFramework.includes('rocket') || backendFramework.includes('warp') || backendRuntime.includes('rust')) {
      backend.push('rust-expert');
    }
    if (backendFramework.includes('fresh') || backendFramework.includes('oak') || backendRuntime.includes('deno')) {
      backend.push('deno-expert');
    }

    const frontendFramework = detectedStack.frontend?.framework?.toLowerCase() || '';
    const frontendMeta = detectedStack.frontend?.metaFramework?.toLowerCase() || '';

    if (frontendFramework.includes('react') && !frontendMeta.includes('next')) {
      frontend.push('react-expert');
    }
    if (frontendMeta.includes('next')) {
      frontend.push('nextjs-expert');
    }
    if (frontendFramework.includes('vue') && !frontendMeta.includes('nuxt')) {
      frontend.push('vue-expert');
    }
    if (frontendFramework.includes('svelte') || frontendMeta.includes('sveltekit')) {
      frontend.push('svelte-expert');
    }

    frontend.push('typescript-expert');

    return { backend: [...new Set(backend)], frontend: [...new Set(frontend)] };
  }
}
