/**
 * Hooks Service Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HooksService, CLAUDE_OUTPUT_FILTER_HOOKS } from '../src/services/hooks.service.js';
import {
  createTempDir,
  cleanupTempDir,
  createMockProject,
  createMockClaudeSettings,
} from './test-utils.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'node:url';

describe('HooksService', () => {
  let hooksService: HooksService;
  let tempDir: string;

  beforeEach(() => {
    hooksService = new HooksService();
    tempDir = createTempDir('hooks-test-');
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  describe('Git Hooks', () => {
    describe('detectHusky', () => {
      it('should return installed: false when Husky is not installed', () => {
        createMockProject(tempDir, {
          packageJson: { name: 'test-project' },
          hasGit: true,
        });

        const status = hooksService.detectHusky(tempDir);

        expect(status.installed).toBe(false);
      });

      it('should detect Husky from .husky directory', () => {
        createMockProject(tempDir, {
          packageJson: { name: 'test-project' },
          hasGit: true,
        });

        // Create .husky directory
        fs.mkdirSync(path.join(tempDir, '.husky'), { recursive: true });

        const status = hooksService.detectHusky(tempDir);

        expect(status.installed).toBe(true);
      });

      it('should detect Husky from package.json devDependencies', () => {
        createMockProject(tempDir, {
          packageJson: {
            name: 'test-project',
            devDependencies: {
              husky: '^8.0.0',
            },
          },
          hasGit: true,
        });

        const status = hooksService.detectHusky(tempDir);

        expect(status.installed).toBe(true);
        expect(status.version).toBe('^8.0.0');
      });
    });

    describe('detectNativeHooks', () => {
      it('should return empty object when .git/hooks does not exist', () => {
        createMockProject(tempDir, {
          packageJson: { name: 'test-project' },
          hasGit: false,
        });

        const hooks = hooksService.detectNativeHooks(tempDir);

        expect(Object.keys(hooks).length).toBe(0);
      });

      it('should detect existing native hooks', () => {
        createMockProject(tempDir, {
          packageJson: { name: 'test-project' },
          hasGit: true,
        });

        // Create a pre-commit hook
        const hooksDir = path.join(tempDir, '.git', 'hooks');
        fs.mkdirSync(hooksDir, { recursive: true });
        fs.writeFileSync(path.join(hooksDir, 'pre-commit'), '#!/bin/sh\necho test', { mode: 0o755 });

        const hooks = hooksService.detectNativeHooks(tempDir);

        expect(hooks.preCommit).toBeDefined();
        expect(hooks.preCommit?.exists).toBe(true);
      });

      it('should identify dev-suite managed hooks', () => {
        createMockProject(tempDir, {
          packageJson: { name: 'test-project' },
          hasGit: true,
        });

        const hooksDir = path.join(tempDir, '.git', 'hooks');
        fs.mkdirSync(hooksDir, { recursive: true });
        fs.writeFileSync(
          path.join(hooksDir, 'pre-commit'),
          '#!/bin/sh\n# dev-suite hook\necho test',
          { mode: 0o755 }
        );

        const hooks = hooksService.detectNativeHooks(tempDir);

        expect(hooks.preCommit?.isDevSuite).toBe(true);
      });
    });

    describe('getGitHooksStatus', () => {
      it('should return hasGit: false when not a git repository', () => {
        createMockProject(tempDir, {
          packageJson: { name: 'test-project' },
          hasGit: false,
        });

        const status = hooksService.getGitHooksStatus(tempDir);

        expect(status.hasGit).toBe(false);
      });

      it('should return hasGit: true for git repository', () => {
        createMockProject(tempDir, {
          packageJson: { name: 'test-project' },
          hasGit: true,
        });

        const status = hooksService.getGitHooksStatus(tempDir);

        expect(status.hasGit).toBe(true);
      });

      it('should include hookTypes', () => {
        createMockProject(tempDir, {
          packageJson: { name: 'test-project' },
          hasGit: true,
        });

        const status = hooksService.getGitHooksStatus(tempDir);

        expect(status.hookTypes).toBeDefined();
        expect(status.hookTypes.preCommit).toBeDefined();
        expect(status.hookTypes.prePush).toBeDefined();
      });

      it('should include availableActions', () => {
        createMockProject(tempDir, {
          packageJson: { name: 'test-project' },
          hasGit: true,
        });

        const status = hooksService.getGitHooksStatus(tempDir);

        expect(status.availableActions).toBeDefined();
        expect(status.availableActions.format).toBeDefined();
        expect(status.availableActions.lint).toBeDefined();
      });
    });

    describe('generateHookScript', () => {
      it('should generate script with correct shebang', () => {
        const script = hooksService.generateHookScript('preCommit', [], tempDir);

        expect(script.startsWith('#!/bin/sh')).toBe(true);
      });

      it('should include dev-suite marker', () => {
        const script = hooksService.generateHookScript('preCommit', [], tempDir);

        expect(script).toContain('# dev-suite hook');
      });

      it('should handle conventional commit option', () => {
        const script = hooksService.generateHookScript('commitMsg', [], tempDir, {
          conventional: true,
        });

        expect(script).toContain('conventional commit');
      });
    });

    describe('installNativeHooks', () => {
      it('should fail when not a git repository', () => {
        createMockProject(tempDir, {
          packageJson: { name: 'test-project' },
          hasGit: false,
        });

        const result = hooksService.installNativeHooks(tempDir, {
          preCommit: { enabled: true, actions: ['format'] },
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('Git');
      });

      it('should install hooks when git repository', () => {
        createMockProject(tempDir, {
          packageJson: {
            name: 'test-project',
            devDependencies: { prettier: '^3.0.0' },
          },
          hasGit: true,
        });

        // Ensure hooks directory exists
        fs.mkdirSync(path.join(tempDir, '.git', 'hooks'), { recursive: true });

        const result = hooksService.installNativeHooks(tempDir, {
          preCommit: { enabled: true, actions: ['format'] },
        });

        expect(result.success).toBe(true);
        expect(result.installed).toContain('pre-commit');
      });
    });

    describe('uninstallHooks', () => {
      it('should remove dev-suite managed hooks', () => {
        createMockProject(tempDir, {
          packageJson: { name: 'test-project' },
          hasGit: true,
        });

        const hooksDir = path.join(tempDir, '.git', 'hooks');
        fs.mkdirSync(hooksDir, { recursive: true });
        fs.writeFileSync(
          path.join(hooksDir, 'pre-commit'),
          '#!/bin/sh\n# dev-suite hook\necho test',
          { mode: 0o755 }
        );

        const result = hooksService.uninstallHooks(tempDir);

        expect(result.success).toBe(true);
        expect(result.removed).toContain('pre-commit');
      });

      it('should not remove hooks without dev-suite marker', () => {
        createMockProject(tempDir, {
          packageJson: { name: 'test-project' },
          hasGit: true,
        });

        const hooksDir = path.join(tempDir, '.git', 'hooks');
        fs.mkdirSync(hooksDir, { recursive: true });
        fs.writeFileSync(
          path.join(hooksDir, 'pre-commit'),
          '#!/bin/sh\necho custom hook',
          { mode: 0o755 }
        );

        const result = hooksService.uninstallHooks(tempDir);

        expect(result.removed || []).not.toContain('pre-commit');
        // Hook should still exist
        expect(fs.existsSync(path.join(hooksDir, 'pre-commit'))).toBe(true);
      });
    });

    describe('detectPackageScripts', () => {
      it('should detect available scripts', () => {
        createMockProject(tempDir, {
          packageJson: {
            name: 'test-project',
            scripts: {
              format: 'prettier --write .',
              lint: 'eslint .',
              test: 'vitest',
            },
          },
        });

        const { scripts } = hooksService.detectPackageScripts(tempDir);

        expect(scripts.format).toBe('prettier --write .');
        expect(scripts.lint).toBe('eslint .');
        expect(scripts.test).toBe('vitest');
      });

      it('should detect installed packages', () => {
        createMockProject(tempDir, {
          packageJson: {
            name: 'test-project',
            devDependencies: {
              prettier: '^3.0.0',
              eslint: '^8.0.0',
            },
          },
        });

        const { packages } = hooksService.detectPackageScripts(tempDir);

        expect(packages).toContain('prettier');
        expect(packages).toContain('eslint');
      });
    });

    describe('getActionCommand', () => {
      it('should return npm script when available', () => {
        createMockProject(tempDir, {
          packageJson: {
            name: 'test-project',
            scripts: {
              format: 'prettier --write .',
            },
          },
        });

        const command = hooksService.getActionCommand('format', tempDir);

        expect(command).toBe('npm run format');
      });

      it('should return fallback when package is available', () => {
        createMockProject(tempDir, {
          packageJson: {
            name: 'test-project',
            devDependencies: {
              prettier: '^3.0.0',
            },
          },
        });

        const command = hooksService.getActionCommand('format', tempDir);

        expect(command).toContain('prettier');
      });

      it('should return null for unknown action', () => {
        createMockProject(tempDir, {
          packageJson: { name: 'test-project' },
        });

        const command = hooksService.getActionCommand('unknown-action', tempDir);

        expect(command).toBeNull();
      });
    });
  });

  describe('Claude Hooks', () => {
    describe('getClaudeHooksStatus', () => {
      it('should return hasClaudeDir: false when no .claude directory', () => {
        createMockProject(tempDir, {
          packageJson: { name: 'test-project' },
        });

        const status = hooksService.getClaudeHooksStatus(tempDir);

        expect(status.hasClaudeDir).toBe(false);
        expect(status.hasSettings).toBe(false);
      });

      it('should detect existing settings file', () => {
        createMockProject(tempDir, {
          packageJson: { name: 'test-project' },
        });
        createMockClaudeSettings(tempDir, {});

        const status = hooksService.getClaudeHooksStatus(tempDir);

        expect(status.hasClaudeDir).toBe(true);
        expect(status.hasSettings).toBe(true);
      });

      it('should parse existing hooks', () => {
        createMockProject(tempDir, {
          packageJson: { name: 'test-project' },
        });
        createMockClaudeSettings(tempDir, {
          PostToolUse: [
            {
              matcher: 'Write|Edit',
              hooks: ['npx prettier --write "$CLAUDE_FILE_PATHS"'],
            },
          ],
        });

        const status = hooksService.getClaudeHooksStatus(tempDir);

        expect(status.hookCount).toBe(1);
        expect(status.hooks.length).toBe(1);
        expect(status.hooks[0].event).toBe('PostToolUse');
        expect(status.hooks[0].matcher).toBe('Write|Edit');
      });

      it('should include available events', () => {
        const status = hooksService.getClaudeHooksStatus(tempDir);

        expect(status.availableEvents).toBeDefined();
        expect(status.availableEvents.PreToolUse).toBeDefined();
        expect(status.availableEvents.PostToolUse).toBeDefined();
      });

      it('should include templates', () => {
        const status = hooksService.getClaudeHooksStatus(tempDir);

        expect(status.templates).toBeDefined();
        expect(status.templates['auto-format']).toBeDefined();
      });
    });

    describe('addClaudeHook', () => {
      it('should add a new hook', () => {
        createMockProject(tempDir, {
          packageJson: { name: 'test-project' },
        });

        const result = hooksService.addClaudeHook(tempDir, {
          event: 'PostToolUse',
          matcher: 'Write|Edit',
          commands: ['echo "File modified"'],
        });

        expect(result.success).toBe(true);

        const status = hooksService.getClaudeHooksStatus(tempDir);
        expect(status.hookCount).toBe(1);
      });

      it('should add hook to existing settings', () => {
        createMockProject(tempDir, {
          packageJson: { name: 'test-project' },
        });
        createMockClaudeSettings(tempDir, {
          PreToolUse: [{ matcher: 'Bash', hooks: ['echo "pre"'] }],
        });

        const result = hooksService.addClaudeHook(tempDir, {
          event: 'PostToolUse',
          commands: ['echo "post"'],
        });

        expect(result.success).toBe(true);

        const status = hooksService.getClaudeHooksStatus(tempDir);
        expect(status.hookCount).toBe(2);
      });
    });

    describe('updateClaudeHook', () => {
      it('should update an existing hook', () => {
        createMockProject(tempDir, {
          packageJson: { name: 'test-project' },
        });
        createMockClaudeSettings(tempDir, {
          PostToolUse: [{ matcher: 'Write', hooks: ['echo "old"'] }],
        });

        const result = hooksService.updateClaudeHook(tempDir, 'PostToolUse-0', {
          commands: ['echo "new"'],
        });

        expect(result.success).toBe(true);

        const settings = hooksService.readClaudeSettings(tempDir);
        const hooks = settings?.hooks as Record<string, unknown[]>;
        const hook = hooks.PostToolUse[0] as { hooks: string[] };
        expect(hook.hooks).toContain('echo "new"');
      });

      it('should fail for non-existent hook', () => {
        createMockProject(tempDir, {
          packageJson: { name: 'test-project' },
        });
        createMockClaudeSettings(tempDir, {});

        const result = hooksService.updateClaudeHook(tempDir, 'PostToolUse-99', {
          commands: ['echo "test"'],
        });

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      });
    });

    describe('removeClaudeHook', () => {
      it('should remove an existing hook', () => {
        createMockProject(tempDir, {
          packageJson: { name: 'test-project' },
        });
        createMockClaudeSettings(tempDir, {
          PostToolUse: [
            { matcher: 'Write', hooks: ['echo "1"'] },
            { matcher: 'Edit', hooks: ['echo "2"'] },
          ],
        });

        const result = hooksService.removeClaudeHook(tempDir, 'PostToolUse-0');

        expect(result.success).toBe(true);

        const status = hooksService.getClaudeHooksStatus(tempDir);
        expect(status.hookCount).toBe(1);
      });

      it('should remove event key when last hook removed', () => {
        createMockProject(tempDir, {
          packageJson: { name: 'test-project' },
        });
        createMockClaudeSettings(tempDir, {
          PostToolUse: [{ matcher: 'Write', hooks: ['echo "1"'] }],
        });

        hooksService.removeClaudeHook(tempDir, 'PostToolUse-0');

        const settings = hooksService.readClaudeSettings(tempDir);
        const hooks = settings?.hooks as Record<string, unknown[]> | undefined;
        expect(hooks?.PostToolUse).toBeUndefined();
      });
    });

    describe('applyClaudeTemplate', () => {
      it('should apply auto-format template', () => {
        createMockProject(tempDir, {
          packageJson: { name: 'test-project' },
        });

        const result = hooksService.applyClaudeTemplate(tempDir, 'auto-format');

        expect(result.success).toBe(true);

        const status = hooksService.getClaudeHooksStatus(tempDir);
        expect(status.hookCount).toBe(1);
        expect(status.hooks[0].event).toBe('PostToolUse');
      });

      it('should fail for unknown template', () => {
        const result = hooksService.applyClaudeTemplate(tempDir, 'unknown-template');

        expect(result.success).toBe(false);
        expect(result.error).toContain('Template not found');
      });
    });

    describe('clearAllClaudeHooks', () => {
      it('should remove all hooks', () => {
        createMockProject(tempDir, {
          packageJson: { name: 'test-project' },
        });
        createMockClaudeSettings(tempDir, {
          PreToolUse: [{ matcher: 'Bash', hooks: ['echo 1'] }],
          PostToolUse: [{ matcher: 'Write', hooks: ['echo 2'] }],
        });

        const result = hooksService.clearAllClaudeHooks(tempDir);

        expect(result.success).toBe(true);

        const status = hooksService.getClaudeHooksStatus(tempDir);
        expect(status.hookCount).toBe(0);
      });
    });

    describe('exportClaudeHooks', () => {
      it('should export hooks with metadata', () => {
        createMockProject(tempDir, {
          packageJson: { name: 'test-project' },
        });
        createMockClaudeSettings(tempDir, {
          PostToolUse: [{ matcher: 'Write', hooks: ['echo test'] }],
        });

        const exported = hooksService.exportClaudeHooks(tempDir);

        expect(exported.version).toBe('1.0.0');
        expect(exported.exportedAt).toBeDefined();
        expect(exported.hooks).toBeDefined();
      });
    });

    describe('importClaudeHooks', () => {
      it('should import hooks', () => {
        createMockProject(tempDir, {
          packageJson: { name: 'test-project' },
        });

        const result = hooksService.importClaudeHooks(tempDir, {
          version: '1.0.0',
          exportedAt: new Date().toISOString(),
          hooks: {
            PostToolUse: [{ matcher: 'Write', hooks: ['echo imported'] }],
          },
        });

        expect(result.success).toBe(true);

        const status = hooksService.getClaudeHooksStatus(tempDir);
        expect(status.hookCount).toBe(1);
      });

      it('should merge with existing hooks', () => {
        createMockProject(tempDir, {
          packageJson: { name: 'test-project' },
        });
        createMockClaudeSettings(tempDir, {
          PreToolUse: [{ matcher: 'Bash', hooks: ['echo existing'] }],
        });

        hooksService.importClaudeHooks(
          tempDir,
          {
            version: '1.0.0',
            exportedAt: new Date().toISOString(),
            hooks: {
              PostToolUse: [{ matcher: 'Write', hooks: ['echo imported'] }],
            },
          },
          true
        );

        const status = hooksService.getClaudeHooksStatus(tempDir);
        expect(status.hookCount).toBe(2);
      });
    });
  });

  describe('Multi-repo support', () => {
    it('should get hooks status for specific repo', () => {
      createMockProject(tempDir, {
        packageJson: { name: 'main-project' },
        hasGit: true,
      });

      const status = hooksService.getHooksStatusForRepo(tempDir, '.');

      expect(status.hasGit).toBe(true);
      expect(status.repoPath).toBe('.');
    });
  });

  describe('Integration Validator Hook', () => {
    describe('configureIntegrationValidatorHook', () => {
      it('should configure hook for React + Spring Boot stack', () => {
        createMockProject(tempDir, {
          packageJson: { name: 'test-project' },
        });

        const result = hooksService.configureIntegrationValidatorHook(tempDir, {
          frontend: { framework: 'react', metaFramework: '' },
          backend: { framework: 'spring-boot', runtime: 'java' },
        });

        expect(result.success).toBe(true);
        expect(result.configured).toBe(true);

        const settings = hooksService.readClaudeSettings(tempDir);
        const hooks = settings?.hooks as Record<string, unknown[]>;
        expect(hooks.SubagentStop).toBeDefined();
        expect(hooks.SubagentStop.length).toBe(1);

        const hook = hooks.SubagentStop[0] as { matcher: string; hooks: Array<{ type: string; prompt: string }> };
        expect(hook.matcher).toContain('spring-boot-expert');
        expect(hook.matcher).toContain('react-expert');
        expect(hook.matcher).toContain('typescript-expert');
        expect(hook.hooks[0].type).toBe('prompt');
        expect(hook.hooks[0].prompt).toContain('API integration detected');
      });

      it('should configure hook for Vue + NestJS stack', () => {
        createMockProject(tempDir, {
          packageJson: { name: 'test-project' },
        });

        const result = hooksService.configureIntegrationValidatorHook(tempDir, {
          frontend: { framework: 'vue', metaFramework: '' },
          backend: { framework: 'nestjs', runtime: 'node' },
        });

        expect(result.success).toBe(true);
        expect(result.configured).toBe(true);

        const settings = hooksService.readClaudeSettings(tempDir);
        const hooks = settings?.hooks as Record<string, unknown[]>;
        const hook = hooks.SubagentStop[0] as { matcher: string };
        expect(hook.matcher).toContain('nestjs-expert');
        expect(hook.matcher).toContain('vue-expert');
      });

      it('should configure hook for Next.js fullstack', () => {
        createMockProject(tempDir, {
          packageJson: { name: 'test-project' },
        });

        const result = hooksService.configureIntegrationValidatorHook(tempDir, {
          frontend: { framework: 'react', metaFramework: 'nextjs' },
          backend: { framework: '', runtime: '' },
        });

        expect(result.success).toBe(true);
        expect(result.configured).toBe(true);

        const settings = hooksService.readClaudeSettings(tempDir);
        const hooks = settings?.hooks as Record<string, unknown[]>;
        const hook = hooks.SubagentStop[0] as { matcher: string };
        expect(hook.matcher).toContain('nextjs-expert');
        expect(hook.matcher).not.toContain('react-expert'); // Next.js overrides React
      });

      it('should not configure when no relevant stack detected', () => {
        createMockProject(tempDir, {
          packageJson: { name: 'test-project' },
        });

        const result = hooksService.configureIntegrationValidatorHook(tempDir, {
          frontend: {},
          backend: {},
        });

        expect(result.success).toBe(true);
        expect(result.configured).toBe(false);
      });

      it('should not duplicate hook if already configured', () => {
        createMockProject(tempDir, {
          packageJson: { name: 'test-project' },
        });

        // Configure first time
        hooksService.configureIntegrationValidatorHook(tempDir, {
          frontend: { framework: 'react' },
          backend: { framework: 'spring-boot' },
        });

        // Try to configure again
        const result = hooksService.configureIntegrationValidatorHook(tempDir, {
          frontend: { framework: 'react' },
          backend: { framework: 'spring-boot' },
        });

        expect(result.success).toBe(true);
        expect(result.configured).toBe(false);

        const settings = hooksService.readClaudeSettings(tempDir);
        const hooks = settings?.hooks as Record<string, unknown[]>;
        expect(hooks.SubagentStop.length).toBe(1); // Should still be 1
      });

      it('should append to existing hooks without overwriting', () => {
        createMockProject(tempDir, {
          packageJson: { name: 'test-project' },
        });

        // Create existing hooks
        createMockClaudeSettings(tempDir, {
          PostToolUse: [{ matcher: 'Write', hooks: ['echo test'] }],
          SubagentStop: [{ matcher: 'other-agent', hooks: ['echo other'] }],
        });

        const result = hooksService.configureIntegrationValidatorHook(tempDir, {
          frontend: { framework: 'react' },
          backend: { framework: 'spring-boot' },
        });

        expect(result.success).toBe(true);
        expect(result.configured).toBe(true);

        const settings = hooksService.readClaudeSettings(tempDir);
        const hooks = settings?.hooks as Record<string, unknown[]>;

        // Existing hooks should still be there
        expect(hooks.PostToolUse).toBeDefined();
        expect(hooks.PostToolUse.length).toBe(1);

        // SubagentStop should have both existing and new hook
        expect(hooks.SubagentStop.length).toBe(2);
      });
    });

    describe('getMonitoredAgentsList', () => {
      it('should return correct agents for React + Spring Boot', () => {
        const agents = hooksService.getMonitoredAgentsList({
          frontend: { framework: 'react' },
          backend: { framework: 'spring-boot', runtime: 'java' },
        });

        expect(agents.backend).toContain('spring-boot-expert');
        expect(agents.frontend).toContain('react-expert');
        expect(agents.frontend).toContain('typescript-expert');
      });

      it('should return correct agents for Vue + FastAPI', () => {
        const agents = hooksService.getMonitoredAgentsList({
          frontend: { framework: 'vue' },
          backend: { framework: 'fastapi', runtime: 'python' },
        });

        expect(agents.backend).toContain('fastapi-expert');
        expect(agents.frontend).toContain('vue-expert');
      });

      it('should return correct agents for SvelteKit fullstack', () => {
        const agents = hooksService.getMonitoredAgentsList({
          frontend: { framework: 'svelte', metaFramework: 'sveltekit' },
          backend: {},
        });

        expect(agents.frontend).toContain('svelte-expert');
        expect(agents.backend).toHaveLength(0);
      });

      it('should handle Go backend', () => {
        const agents = hooksService.getMonitoredAgentsList({
          frontend: {},
          backend: { framework: 'gin', runtime: 'go' },
        });

        expect(agents.backend).toContain('go-expert');
      });

      it('should handle Rust backend', () => {
        const agents = hooksService.getMonitoredAgentsList({
          frontend: {},
          backend: { framework: 'actix', runtime: 'rust' },
        });

        expect(agents.backend).toContain('rust-expert');
      });

      it('should handle Deno backend', () => {
        const agents = hooksService.getMonitoredAgentsList({
          frontend: {},
          backend: { framework: 'fresh', runtime: 'deno' },
        });

        expect(agents.backend).toContain('deno-expert');
      });
    });
  });

  // ============================================================
  // OUTPUT FILTER HOOKS
  // ============================================================

  describe('Output Filter Hooks', () => {
    // ----------------------------------------------------------
    // Template structure validation
    // ----------------------------------------------------------

    describe('CLAUDE_OUTPUT_FILTER_HOOKS constant structure', () => {
      it('should export exactly 3 filter templates', () => {
        const keys = Object.keys(CLAUDE_OUTPUT_FILTER_HOOKS);
        expect(keys).toHaveLength(3);
        expect(keys).toContain('filter-test-output');
        expect(keys).toContain('filter-lint');
        expect(keys).toContain('truncate-logs');
      });

      it('filter-test-output template should have correct structure', () => {
        const t = CLAUDE_OUTPUT_FILTER_HOOKS['filter-test-output'];
        expect(t).toBeDefined();
        expect(t.id).toBe('filter-test-output');
        expect(t.event).toBe('PreToolUse');
        expect(t.scriptFile).toBe('filter-test-output.sh');
        expect(t.category).toBe('output-filter');
        expect(t.tokenSavingsEstimate).toBeTruthy();
        expect(t.hooks).toHaveLength(1);
        expect(t.hooks[0].matcher).toBe('Bash');
        expect(t.hooks[0].hooks).toContain('.claude/hooks/filter-test-output.sh');
      });

      it('filter-lint template should have correct structure', () => {
        const t = CLAUDE_OUTPUT_FILTER_HOOKS['filter-lint'];
        expect(t).toBeDefined();
        expect(t.id).toBe('filter-lint');
        expect(t.event).toBe('PreToolUse');
        expect(t.scriptFile).toBe('filter-lint.sh');
        expect(t.category).toBe('output-filter');
        expect(t.tokenSavingsEstimate).toBeTruthy();
        expect(t.hooks[0].matcher).toBe('Bash');
        expect(t.hooks[0].hooks).toContain('.claude/hooks/filter-lint.sh');
      });

      it('truncate-logs template should have correct structure', () => {
        const t = CLAUDE_OUTPUT_FILTER_HOOKS['truncate-logs'];
        expect(t).toBeDefined();
        expect(t.id).toBe('truncate-logs');
        expect(t.event).toBe('PreToolUse');
        expect(t.scriptFile).toBe('truncate-logs.sh');
        expect(t.category).toBe('output-filter');
        expect(t.tokenSavingsEstimate).toBeTruthy();
        expect(t.hooks[0].matcher).toBe('Bash');
        expect(t.hooks[0].hooks).toContain('.claude/hooks/truncate-logs.sh');
      });

      it('each template should document token-savings estimate', () => {
        for (const [id, t] of Object.entries(CLAUDE_OUTPUT_FILTER_HOOKS)) {
          expect(t.tokenSavingsEstimate, `${id} missing tokenSavingsEstimate`).toBeTruthy();
        }
      });
    });

    // ----------------------------------------------------------
    // Script content validation
    // ----------------------------------------------------------

    describe('hook script files', () => {
      // Resolve to dev-suite repo root (3 levels up from server/)
      const repoRoot = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '..', '..', '..', '..'
      );
      const hooksDir = path.join(repoRoot, 'templates', 'hooks');

      it('filter-test-output.sh should exist', () => {
        const scriptPath = path.join(hooksDir, 'filter-test-output.sh');
        expect(fs.existsSync(scriptPath), `Script not found: ${scriptPath}`).toBe(true);
      });

      it('filter-lint.sh should exist', () => {
        const scriptPath = path.join(hooksDir, 'filter-lint.sh');
        expect(fs.existsSync(scriptPath), `Script not found: ${scriptPath}`).toBe(true);
      });

      it('truncate-logs.sh should exist', () => {
        const scriptPath = path.join(hooksDir, 'truncate-logs.sh');
        expect(fs.existsSync(scriptPath), `Script not found: ${scriptPath}`).toBe(true);
      });

      it('filter-test-output.sh should cover expected test runners', () => {
        const content = fs.readFileSync(path.join(hooksDir, 'filter-test-output.sh'), 'utf-8');
        // Core test runners
        expect(content).toContain('npm');
        expect(content).toContain('pytest');
        expect(content).toContain('cargo');
        expect(content).toContain('go test');
        expect(content).toContain('mvn');
        expect(content).toContain('gradle');
        // Fail-open guard
        expect(content).toContain('jq');
        // Safety: no rm -rf
        expect(content).not.toMatch(/rm\s+-rf/);
        // Emits hookSpecificOutput JSON
        expect(content).toContain('hookSpecificOutput');
      });

      it('filter-lint.sh should cover expected linters', () => {
        const content = fs.readFileSync(path.join(hooksDir, 'filter-lint.sh'), 'utf-8');
        expect(content).toContain('eslint');
        expect(content).toContain('pylint');
        expect(content).toContain('cargo');
        expect(content).toContain('golangci-lint');
        expect(content).toContain('prettier');
        // Fail-open guard
        expect(content).toContain('jq');
        // Safety
        expect(content).not.toMatch(/rm\s+-rf/);
        expect(content).toContain('hookSpecificOutput');
      });

      it('truncate-logs.sh should cover expected log commands', () => {
        const content = fs.readFileSync(path.join(hooksDir, 'truncate-logs.sh'), 'utf-8');
        expect(content).toContain('tail');
        expect(content).toContain('journalctl');
        expect(content).toContain('docker');
        expect(content).toContain('kubectl');
        // Fail-open guard
        expect(content).toContain('jq');
        // Safety
        expect(content).not.toMatch(/rm\s+-rf/);
        expect(content).toContain('hookSpecificOutput');
        // Line-limit cap
        expect(content).toMatch(/tail\s+-/);
      });

      it('all scripts should be fail-open (pass through on error)', () => {
        for (const scriptFile of ['filter-test-output.sh', 'filter-lint.sh', 'truncate-logs.sh']) {
          const content = fs.readFileSync(path.join(hooksDir, scriptFile), 'utf-8');
          // Each script must re-emit INPUT unchanged when jq is unavailable or cmd doesn't match
          expect(content, `${scriptFile} should pass through INPUT when guard fails`).toContain(
            'printf \'%s\' "$INPUT"'
          );
        }
      });
    });

    // ----------------------------------------------------------
    // Install flow
    // ----------------------------------------------------------

    describe('installOutputFilterHook', () => {
      // Resolve dev-suite repo root so the service can find templates/hooks/
      const repoRoot = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '..', '..', '..', '..'
      );

      it('should copy script to .claude/hooks/ and register in settings.json', () => {
        createMockProject(tempDir, { packageJson: { name: 'test-project' } });

        const result = hooksService.installOutputFilterHook(
          tempDir,
          'filter-test-output',
          repoRoot
        );

        expect(result.success).toBe(true);
        expect(result.scriptPath).toBeDefined();

        // Script file must be copied
        const destScript = path.join(tempDir, '.claude', 'hooks', 'filter-test-output.sh');
        expect(fs.existsSync(destScript)).toBe(true);

        // settings.json must have the PreToolUse hook entry
        const settings = hooksService.readClaudeSettings(tempDir);
        const hooks = settings?.hooks as Record<string, unknown[]>;
        expect(hooks).toBeDefined();
        expect(Array.isArray(hooks['PreToolUse'])).toBe(true);

        const hookEntry = hooks['PreToolUse'][0] as { matcher: string; hooks: string[] };
        expect(hookEntry.matcher).toBe('Bash');
        expect(hookEntry.hooks).toContain('.claude/hooks/filter-test-output.sh');
      });

      it('should install filter-lint hook correctly', () => {
        createMockProject(tempDir, { packageJson: { name: 'test-project' } });

        const result = hooksService.installOutputFilterHook(tempDir, 'filter-lint', repoRoot);

        expect(result.success).toBe(true);

        const destScript = path.join(tempDir, '.claude', 'hooks', 'filter-lint.sh');
        expect(fs.existsSync(destScript)).toBe(true);

        const settings = hooksService.readClaudeSettings(tempDir);
        const hooks = settings?.hooks as Record<string, unknown[]>;
        const hookEntry = hooks['PreToolUse'][0] as { hooks: string[] };
        expect(hookEntry.hooks).toContain('.claude/hooks/filter-lint.sh');
      });

      it('should install truncate-logs hook correctly', () => {
        createMockProject(tempDir, { packageJson: { name: 'test-project' } });

        const result = hooksService.installOutputFilterHook(tempDir, 'truncate-logs', repoRoot);

        expect(result.success).toBe(true);

        const destScript = path.join(tempDir, '.claude', 'hooks', 'truncate-logs.sh');
        expect(fs.existsSync(destScript)).toBe(true);

        const settings = hooksService.readClaudeSettings(tempDir);
        const hooks = settings?.hooks as Record<string, unknown[]>;
        const hookEntry = hooks['PreToolUse'][0] as { hooks: string[] };
        expect(hookEntry.hooks).toContain('.claude/hooks/truncate-logs.sh');
      });

      it('should not break existing hooks when installing', () => {
        createMockProject(tempDir, { packageJson: { name: 'test-project' } });
        createMockClaudeSettings(tempDir, {
          PostToolUse: [{ matcher: 'Write', hooks: ['echo "existing"'] }],
        });

        const result = hooksService.installOutputFilterHook(
          tempDir,
          'filter-test-output',
          repoRoot
        );

        expect(result.success).toBe(true);

        const settings = hooksService.readClaudeSettings(tempDir);
        const hooks = settings?.hooks as Record<string, unknown[]>;

        // Existing PostToolUse hook must still be present
        expect(Array.isArray(hooks['PostToolUse'])).toBe(true);
        expect(hooks['PostToolUse']).toHaveLength(1);

        // New PreToolUse hook must be added
        expect(Array.isArray(hooks['PreToolUse'])).toBe(true);
      });

      it('should fail for unknown hook ID', () => {
        createMockProject(tempDir, { packageJson: { name: 'test-project' } });

        const result = hooksService.installOutputFilterHook(
          tempDir,
          'nonexistent-hook',
          repoRoot
        );

        expect(result.success).toBe(false);
        expect(result.error).toContain('Unknown output-filter hook');
      });

      it('should reject path traversal in projectPath', () => {
        expect(() =>
          hooksService.installOutputFilterHook('../../../etc', 'filter-test-output', repoRoot)
        ).toThrow();
      });
    });

    // ----------------------------------------------------------
    // Uninstall flow
    // ----------------------------------------------------------

    describe('uninstallOutputFilterHook', () => {
      const repoRoot = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '..', '..', '..', '..'
      );

      it('should remove script file and settings.json entry', () => {
        createMockProject(tempDir, { packageJson: { name: 'test-project' } });

        // Install first
        hooksService.installOutputFilterHook(tempDir, 'filter-test-output', repoRoot);

        // Verify installed
        const destScript = path.join(tempDir, '.claude', 'hooks', 'filter-test-output.sh');
        expect(fs.existsSync(destScript)).toBe(true);

        // Uninstall
        const result = hooksService.uninstallOutputFilterHook(tempDir, 'filter-test-output');
        expect(result.success).toBe(true);

        // Script must be gone
        expect(fs.existsSync(destScript)).toBe(false);

        // settings.json entry must be removed
        const settings = hooksService.readClaudeSettings(tempDir);
        const hooks = settings?.hooks as Record<string, unknown[]> | undefined;
        expect(hooks?.['PreToolUse']).toBeUndefined();
      });

      it('should leave other hooks intact when uninstalling', () => {
        createMockProject(tempDir, { packageJson: { name: 'test-project' } });

        // Install two filter hooks
        hooksService.installOutputFilterHook(tempDir, 'filter-test-output', repoRoot);
        hooksService.installOutputFilterHook(tempDir, 'filter-lint', repoRoot);

        // Uninstall only one
        const result = hooksService.uninstallOutputFilterHook(tempDir, 'filter-test-output');
        expect(result.success).toBe(true);

        // The other script should still exist
        const remainingScript = path.join(tempDir, '.claude', 'hooks', 'filter-lint.sh');
        expect(fs.existsSync(remainingScript)).toBe(true);

        // The PreToolUse array should still have the remaining hook
        const settings = hooksService.readClaudeSettings(tempDir);
        const hooks = settings?.hooks as Record<string, unknown[]>;
        expect(Array.isArray(hooks['PreToolUse'])).toBe(true);
        expect(hooks['PreToolUse']).toHaveLength(1);
        const remaining = hooks['PreToolUse'][0] as { hooks: string[] };
        expect(remaining.hooks).toContain('.claude/hooks/filter-lint.sh');
        expect(remaining.hooks).not.toContain('.claude/hooks/filter-test-output.sh');
      });

      it('should be idempotent when hook is not installed', () => {
        createMockProject(tempDir, { packageJson: { name: 'test-project' } });

        // Uninstall without installing — must not throw
        const result = hooksService.uninstallOutputFilterHook(tempDir, 'filter-test-output');
        expect(result.success).toBe(true);
      });

      it('should fail for unknown hook ID', () => {
        createMockProject(tempDir, { packageJson: { name: 'test-project' } });

        const result = hooksService.uninstallOutputFilterHook(tempDir, 'nonexistent-hook');
        expect(result.success).toBe(false);
        expect(result.error).toContain('Unknown output-filter hook');
      });
    });
  });
});
