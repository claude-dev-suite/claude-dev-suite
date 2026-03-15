/**
 * Hooks Service Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { HooksService } from '../src/services/hooks.service.js';
import {
  createTempDir,
  cleanupTempDir,
  createMockProject,
  createMockClaudeSettings,
} from './test-utils.js';
import * as fs from 'fs';
import * as path from 'path';

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
});
