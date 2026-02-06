// SPDX-License-Identifier: MIT
/**
 * Claude Code Hooks Service
 *
 * Manages Claude Code hooks in settings.json and integration validator configuration.
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
  ClaudeHookUI,
  ClaudeHooksStatus,
  ClaudeHookConfig,
  ClaudeHooksExport,
} from '../../types.js';

import {
  CLAUDE_HOOK_EVENTS,
  CLAUDE_HOOK_TEMPLATES,
} from './hooks.constants.js';

export class ClaudeHooksService {
  /**
   * Get the path to Claude settings.json
   */
  getClaudeSettingsPath(projectPath: string): string {
    return path.join(projectPath, '.claude', 'settings.json');
  }

  /**
   * Read Claude settings.json
   */
  readClaudeSettings(projectPath: string): Record<string, unknown> | null {
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
    const claudeDir = path.join(projectPath, '.claude');
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
          hooks?: Array<string | { type?: string; prompt?: string; timeout?: number }>;
          timeout?: number
        };

        // Parse commands - can be strings or prompt hook objects
        const commands: ClaudeHookUI['commands'] = [];
        if (hookConfig.hooks) {
          for (const hook of hookConfig.hooks) {
            if (typeof hook === 'string') {
              commands.push(hook);
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
    const settingsPath = this.getClaudeSettingsPath(projectPath);
    const claudeDir = path.join(projectPath, '.claude');
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
      hooks: hookConfig.commands || [],
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
    const settings = this.readClaudeSettings(projectPath);

    if (!settings || !settings.hooks) {
      return { success: false, error: 'No hooks configured' };
    }

    const hooks = settings.hooks as Record<string, Array<{ matcher?: string; hooks?: string[]; timeout?: number }>>;
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
        hooks: hookConfig.commands || oldHook.hooks,
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
        hook.hooks = hookConfig.commands;
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
    const settings = this.readClaudeSettings(projectPath);

    if (!settings || !settings.hooks) {
      return { success: false, error: 'No hooks configured' };
    }

    const hooks = settings.hooks as Record<string, Array<{ matcher?: string; hooks?: string[]; timeout?: number }>>;
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
    const template = CLAUDE_HOOK_TEMPLATES[templateId];

    if (!template) {
      return { success: false, error: 'Template not found' };
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
        hooks: hookConfig.hooks,
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
   * Build the agent matcher pattern based on detected stack
   */
  private buildIntegrationValidatorMatcher(detectedStack: {
    frontend?: { framework?: string; metaFramework?: string };
    backend?: { framework?: string; runtime?: string };
  }): string {
    const agents: string[] = [];

    // Backend agents based on detected framework
    const backendFramework = detectedStack.backend?.framework?.toLowerCase() || '';
    const backendRuntime = detectedStack.backend?.runtime?.toLowerCase() || '';

    if (backendFramework.includes('spring') || backendRuntime.includes('java')) {
      agents.push('spring-boot-expert');
    }
    if (backendFramework.includes('nest')) {
      agents.push('nestjs-expert');
    }
    if (backendFramework.includes('fastapi') || backendFramework.includes('django') || backendFramework.includes('flask')) {
      agents.push('fastapi-expert');
    }
    if (backendFramework.includes('gin') || backendFramework.includes('fiber') || backendFramework.includes('echo') || backendFramework.includes('chi') || backendRuntime.includes('go')) {
      agents.push('go-expert');
    }
    if (backendFramework.includes('actix') || backendFramework.includes('axum') || backendFramework.includes('rocket') || backendFramework.includes('warp') || backendRuntime.includes('rust')) {
      agents.push('rust-expert');
    }
    if (backendFramework.includes('fresh') || backendFramework.includes('oak') || backendRuntime.includes('deno')) {
      agents.push('deno-expert');
    }

    // Frontend agents based on detected framework
    const frontendFramework = detectedStack.frontend?.framework?.toLowerCase() || '';
    const frontendMeta = detectedStack.frontend?.metaFramework?.toLowerCase() || '';

    if (frontendFramework.includes('react') && !frontendMeta.includes('next')) {
      agents.push('react-expert');
    }
    if (frontendMeta.includes('next')) {
      agents.push('nextjs-expert');
    }
    if (frontendFramework.includes('vue') && !frontendMeta.includes('nuxt')) {
      agents.push('vue-expert');
    }
    if (frontendFramework.includes('svelte') || frontendMeta.includes('sveltekit')) {
      agents.push('svelte-expert');
    }

    // Always include typescript-expert for API types
    agents.push('typescript-expert');

    // Remove duplicates and return as regex pattern
    const uniqueAgents = [...new Set(agents)];
    return uniqueAgents.join('|');
  }

  /**
   * Get the validation prompt for integration-validator hook
   */
  private getIntegrationValidatorPrompt(): string {
    return `Analizza il lavoro completato dall'agente e determina se è necessaria la validazione dell'integrazione API.

CONTESTO: $ARGUMENTS

CRITERI DI TRIGGER (rispondi {ok: false} per continuare con integration-validator):

**Backend:**
- Modifiche a controller/routes/handlers HTTP
- Nuovi endpoint REST o GraphQL
- Modifiche a DTO/request/response types
- Cambi a middleware di autenticazione API

**Frontend:**
- Nuove chiamate API (fetch, axios, ky, ofetch)
- Modifiche a hooks di data fetching (useQuery, useMutation, useSWR)
- Modifiche a composables/services che chiamano API
- Modifiche a tipi TypeScript per request/response API

NON TRIGGERA (rispondi {ok: true} per fermarti):
- Solo modifiche CSS/styling
- Solo cambi di testo/label
- Refactoring interno senza toccare API
- Modifiche a componenti UI senza data fetching
- Test unitari senza integration test

Rispondi SOLO con JSON valido:
{"ok": false, "reason": "API integration detected: [descrizione]"} per triggerare validation
{"ok": true} per terminare senza validation`;
  }

  /**
   * Check if an integration-validator hook already exists
   */
  private hasIntegrationValidatorHook(settings: Record<string, unknown>): boolean {
    const hooks = settings.hooks as Record<string, Array<{ matcher?: string; hooks?: Array<{ type?: string; prompt?: string }> }>> | undefined;
    if (!hooks?.SubagentStop) {
      return false;
    }

    return hooks.SubagentStop.some(h => {
      if (Array.isArray(h.hooks)) {
        return h.hooks.some(innerHook => {
          if (typeof innerHook === 'object' && innerHook.prompt) {
            return innerHook.prompt.includes('integration-validator') ||
                   innerHook.prompt.includes('API integration detected');
          }
          return false;
        });
      }
      return false;
    });
  }

  /**
   * Configure the integration-validator hook for a project
   */
  configureIntegrationValidatorHook(
    projectPath: string,
    detectedStack: {
      frontend?: { framework?: string; metaFramework?: string };
      backend?: { framework?: string; runtime?: string };
    }
  ): { success: boolean; configured: boolean; error?: string } {
    const matcher = this.buildIntegrationValidatorMatcher(detectedStack);

    if (!matcher || matcher === 'typescript-expert') {
      return {
        success: true,
        configured: false,
        error: 'No backend or frontend framework detected that requires API validation'
      };
    }

    const settings = this.readClaudeSettings(projectPath) || {};

    if (this.hasIntegrationValidatorHook(settings)) {
      return { success: true, configured: false, error: 'Integration validator hook already configured' };
    }

    if (!settings.hooks) {
      settings.hooks = {};
    }

    const hooks = settings.hooks as Record<string, unknown[]>;
    if (!hooks.SubagentStop) {
      hooks.SubagentStop = [];
    }

    const integrationValidatorHook = {
      matcher,
      hooks: [
        {
          type: 'prompt',
          prompt: this.getIntegrationValidatorPrompt(),
          timeout: 30
        }
      ]
    };

    hooks.SubagentStop.push(integrationValidatorHook);

    const writeResult = this.writeClaudeSettings(projectPath, settings);
    if (!writeResult.success) {
      return { success: false, configured: false, error: writeResult.error };
    }

    return { success: true, configured: true };
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
