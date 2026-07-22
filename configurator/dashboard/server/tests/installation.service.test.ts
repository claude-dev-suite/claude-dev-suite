/**
 * Installation Service Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InstallationService } from '../src/services/installation.service.js';
import {
  createTempDir,
  cleanupTempDir,
  createMockDevSuiteDir,
  createMockProject,
  createMockSkillLoader,
} from './test-utils.js';
import * as fs from 'fs';
import * as path from 'path';

describe('InstallationService', () => {
  let installationService: InstallationService;
  let devSuiteDir: string;
  let projectDir: string;

  beforeEach(() => {
    devSuiteDir = createTempDir('install-devsuite-');
    projectDir = createTempDir('install-project-');
    createMockDevSuiteDir(devSuiteDir);
    createMockProject(projectDir, {
      packageJson: { name: 'test-project' },
      hasGit: true,
    });

    installationService = new InstallationService();
    process.env.DEV_SUITE_DIR = devSuiteDir;
  });

  afterEach(() => {
    cleanupTempDir(devSuiteDir);
    cleanupTempDir(projectDir);
    delete process.env.DEV_SUITE_DIR;
  });

  describe('prepareServers', () => {
    it('should prepare servers that are already built', async () => {
      const result = await installationService.prepareServers(['documentation']);

      expect(result.prepared).toContain('documentation');
    });

    it('should fail for non-existent servers', async () => {
      const result = await installationService.prepareServers(['nonexistent-server']);

      expect(result.failed).toContain('nonexistent-server');
    });
  });

  describe('install', () => {
    it('should install agents', async () => {
      const manifest = await installationService.install({
        projectPath: projectDir,
        agents: ['typescript-expert'],
        mcpServers: [],
        envVars: {},
      });

      expect(manifest.agents).toContain('typescript-expert');
    });

    it('should install MCP servers', async () => {
      const manifest = await installationService.install({
        projectPath: projectDir,
        agents: [],
        mcpServers: ['documentation'],
        envVars: {},
      });

      expect(manifest.mcpServers).toContain('documentation');
    });

    it('should generate configuration files', async () => {
      await installationService.install({
        projectPath: projectDir,
        agents: ['typescript-expert'],
        mcpServers: ['documentation'],
        envVars: {},
      });

      expect(fs.existsSync(path.join(projectDir, '.mcp.json'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, '.dev-suite.json'))).toBe(true);
    });

    it('should create manifest', async () => {
      await installationService.install({
        projectPath: projectDir,
        agents: ['typescript-expert'],
        mcpServers: [],
        envVars: {},
      });

      expect(fs.existsSync(path.join(projectDir, '.dev-suite-manifest.json'))).toBe(true);
    });

    it('should record availableAtInstall catalog snapshot in manifest', async () => {
      await installationService.install({
        projectPath: projectDir,
        agents: ['typescript-expert'],
        mcpServers: ['documentation'],
        envVars: {},
      });

      const manifestPath = path.join(projectDir, '.dev-suite-manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

      // availableAtInstall should be present
      expect(manifest.availableAtInstall).toBeDefined();
      expect(Array.isArray(manifest.availableAtInstall.agents)).toBe(true);
      expect(Array.isArray(manifest.availableAtInstall.mcpServers)).toBe(true);

      // Should contain at least the agents/servers that exist in mock dev-suite
      expect(manifest.availableAtInstall.agents).toContain('typescript-expert');
      expect(manifest.availableAtInstall.agents).toContain('vitest-expert');
      expect(manifest.availableAtInstall.mcpServers).toContain('documentation');
      expect(manifest.availableAtInstall.mcpServers).toContain('api-tester');
    });

    it('should write AGENTS.md with the routing section and CLAUDE.md as an import', async () => {
      await installationService.install({
        projectPath: projectDir,
        agents: ['typescript-expert'],
        mcpServers: [],
        envVars: {},
      });

      const agentsMd = fs.readFileSync(path.join(projectDir, 'AGENTS.md'), 'utf-8');
      const claudeMd = fs.readFileSync(path.join(projectDir, 'CLAUDE.md'), 'utf-8');

      expect(agentsMd).toContain('@typescript-expert');
      expect(claudeMd).toContain('@AGENTS.md');
      // The routing detail lives in one place only
      expect(claudeMd).not.toContain('@typescript-expert');
    });

    it('should tag the manifest and its files with the install target', async () => {
      await installationService.install({
        projectPath: projectDir,
        agents: ['typescript-expert'],
        mcpServers: [],
        envVars: {},
      });

      const manifest = JSON.parse(
        fs.readFileSync(path.join(projectDir, '.dev-suite-manifest.json'), 'utf-8')
      );

      expect(manifest.targets).toEqual(['claude-code']);
      expect(manifest.files.length).toBeGreaterThan(0);
      expect(manifest.files.every((f: { target?: string }) => f.target === 'claude-code')).toBe(true);
    });

    it('records an explicit targets request in the manifest', async () => {
      await installationService.install({
        projectPath: projectDir,
        agents: ['typescript-expert'],
        mcpServers: [],
        envVars: {},
        targets: ['claude-code'],
      });

      const manifest = JSON.parse(
        fs.readFileSync(path.join(projectDir, '.dev-suite-manifest.json'), 'utf-8')
      );
      expect(manifest.targets).toEqual(['claude-code']);
    });

    it('rejects a target that has no adapter yet', async () => {
      // Defense in depth: the request schema rejects unimplemented targets, and
      // so does the service for any direct caller that bypasses it. Codex is
      // Tier 2 — no adapter yet.
      await expect(
        installationService.install({
          projectPath: projectDir,
          agents: [],
          mcpServers: [],
          envVars: {},
          targets: ['codex'] as never,
        })
      ).rejects.toThrow(/No adapter implemented/);
    });

    it('should track both instruction files in the manifest', async () => {
      await installationService.install({
        projectPath: projectDir,
        agents: ['typescript-expert'],
        mcpServers: [],
        envVars: {},
      });

      const manifest = JSON.parse(
        fs.readFileSync(path.join(projectDir, '.dev-suite-manifest.json'), 'utf-8')
      );
      const tracked = manifest.files.map((f: { path: string }) => f.path);

      expect(tracked).toContain('AGENTS.md');
      expect(tracked).toContain('CLAUDE.md');
    });

    it('should handle empty configuration', async () => {
      const manifest = await installationService.install({
        projectPath: projectDir,
        agents: [],
        mcpServers: [],
        envVars: {},
      });

      expect(manifest.agents).toEqual([]);
      expect(manifest.mcpServers).toEqual([]);
    });
  });

  describe('uninstall', () => {
    it('should remove installed files', async () => {
      // First install
      await installationService.install({
        projectPath: projectDir,
        agents: ['typescript-expert'],
        mcpServers: ['documentation'],
        envVars: {},
      });

      // Then uninstall
      const result = await installationService.uninstall(projectDir);

      expect(result.removed.length).toBeGreaterThan(0);
    });

    it('should handle uninstall when not installed', async () => {
      const result = await installationService.uninstall(projectDir);

      expect(result.errors.length).toBe(0);
    });
  });

  describe('getStatus', () => {
    it('should return installed: false when not installed', async () => {
      const status = await installationService.getStatus(projectDir);

      expect(status.installed).toBe(false);
    });

    it('should return installed: true when installed', async () => {
      await installationService.install({
        projectPath: projectDir,
        agents: ['typescript-expert'],
        mcpServers: [],
        envVars: {},
      });

      const status = await installationService.getStatus(projectDir);

      expect(status.installed).toBe(true);
      expect(status.manifest).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Lazy skill loading mode
  // ---------------------------------------------------------------------------

  describe('skillLoadingMode: lazy', () => {
    it('should write .claude/skills/_README.md describing the dual model', async () => {
      await installationService.install({
        projectPath: projectDir,
        agents: ['typescript-expert'],
        mcpServers: [],
        envVars: {},
        skillLoadingMode: 'lazy',
      });

      const readmePath = path.join(projectDir, '.claude', 'skills', '_README.md');
      expect(fs.existsSync(readmePath)).toBe(true);

      const readmeContent = fs.readFileSync(readmePath, 'utf-8');
      // Must reference the skill-loader MCP fallback for non-preloaded skills.
      expect(readmeContent).toContain('skill-loader');
      // Must list the natively preloaded skill referenced by typescript-expert.
      expect(readmeContent).toContain('`typescript`');
    });

    it('should copy referenced skills natively under flat names in lazy mode', async () => {
      await installationService.install({
        projectPath: projectDir,
        agents: ['typescript-expert'],
        mcpServers: [],
        envVars: {},
        skillLoadingMode: 'lazy',
      });

      // The agent declares skill 'typescript' — flatten leaves it unchanged.
      const skillFile = path.join(projectDir, '.claude', 'skills', 'typescript', 'SKILL.md');
      expect(fs.existsSync(skillFile)).toBe(true);
    });

    it('should add skill-loader entry to .mcp.json in lazy mode', async () => {
      await installationService.install({
        projectPath: projectDir,
        agents: ['typescript-expert'],
        mcpServers: [],
        envVars: {},
        skillLoadingMode: 'lazy',
      });

      const mcpJsonPath = path.join(projectDir, '.mcp.json');
      expect(fs.existsSync(mcpJsonPath)).toBe(true);

      const mcpJson = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf-8')) as {
        mcpServers: Record<string, { command: string; args: string[]; env: Record<string, string> }>;
      };
      expect(mcpJson.mcpServers['skill-loader']).toBeDefined();
      // No DEV_SUITE_ROOT by default — server self-resolves to bundled skills.
      // Keeping the env empty makes the project portable across machines.
      expect(mcpJson.mcpServers['skill-loader'].env.DEV_SUITE_ROOT).toBeUndefined();
    });

    it('passes DEV_SUITE_ROOT to skill-loader env only when user provides one', async () => {
      const customRoot = '/some/custom/dev-suite';
      await installationService.install({
        projectPath: projectDir,
        agents: ['typescript-expert'],
        mcpServers: [],
        envVars: { DEV_SUITE_ROOT: customRoot },
        skillLoadingMode: 'lazy',
      });

      const mcpJson = JSON.parse(
        fs.readFileSync(path.join(projectDir, '.mcp.json'), 'utf-8'),
      ) as { mcpServers: Record<string, { env: Record<string, string> }> };
      expect(mcpJson.mcpServers['skill-loader'].env.DEV_SUITE_ROOT).toBe(customRoot);
    });

    it('should NOT add skill-loader to .mcp.json in eager mode (default)', async () => {
      await installationService.install({
        projectPath: projectDir,
        agents: ['typescript-expert'],
        mcpServers: [],
        envVars: {},
        // skillLoadingMode deliberately omitted — defaults to 'eager'
      });

      const mcpJsonPath = path.join(projectDir, '.mcp.json');
      const mcpJson = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf-8')) as {
        mcpServers: Record<string, unknown>;
      };
      expect(mcpJson.mcpServers['skill-loader']).toBeUndefined();
    });

    it('should still copy individual SKILL.md files in eager mode (default)', async () => {
      await installationService.install({
        projectPath: projectDir,
        agents: ['typescript-expert'],
        mcpServers: [],
        envVars: {},
        skillLoadingMode: 'eager',
      });

      const skillFile = path.join(projectDir, '.claude', 'skills', 'typescript', 'SKILL.md');
      expect(fs.existsSync(skillFile)).toBe(true);
    });

    it('should still install agent .md files in lazy mode', async () => {
      await installationService.install({
        projectPath: projectDir,
        agents: ['typescript-expert'],
        mcpServers: [],
        envVars: {},
        skillLoadingMode: 'lazy',
      });

      const agentFile = path.join(projectDir, '.claude', 'agents', 'typescript-expert.md');
      expect(fs.existsSync(agentFile)).toBe(true);
    });

    it('should produce valid manifest in lazy mode', async () => {
      const manifest = await installationService.install({
        projectPath: projectDir,
        agents: ['typescript-expert'],
        mcpServers: [],
        envVars: {},
        skillLoadingMode: 'lazy',
      });

      expect(manifest.agents).toContain('typescript-expert');
      // _README.md is tracked as a skill-type file (replaces the legacy index.md).
      const readmeEntry = manifest.files.find(f => f.path === '.claude/skills/_README.md');
      expect(readmeEntry).toBeDefined();
      // The natively preloaded skill folder is also tracked.
      const skillEntry = manifest.files.find(f => f.path === '.claude/skills/typescript');
      expect(skillEntry).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Auto-include of MCP servers marked `isDefault: true`
  // ---------------------------------------------------------------------------

  describe('isDefault MCP servers (built-in capabilities)', () => {
    beforeEach(() => {
      createMockSkillLoader(devSuiteDir);
      // Cache from a previous test (different beforeEach instance) may already
      // hold the older server list — force the next install to re-scan.
      installationService = new InstallationService();
    });

    it('auto-includes skill-loader in .mcp.json even if not explicitly requested', async () => {
      const manifest = await installationService.install({
        projectPath: projectDir,
        agents: ['typescript-expert'],
        mcpServers: [], // user picked nothing
        envVars: {},
      });

      // Manifest reflects the auto-included server
      expect(manifest.mcpServers).toContain('skill-loader');

      // .mcp.json carries the entry — env is empty by default so the
      // project remains portable; the server self-resolves to its
      // bundled skills/ catalog.
      const mcpJson = JSON.parse(
        fs.readFileSync(path.join(projectDir, '.mcp.json'), 'utf-8'),
      ) as { mcpServers: Record<string, { env: Record<string, string> }> };
      expect(mcpJson.mcpServers['skill-loader']).toBeDefined();
      expect(mcpJson.mcpServers['skill-loader'].env).toEqual({});
    });

    it('auto-include forces lazy mode (writes _README.md and preloads core skills)', async () => {
      await installationService.install({
        projectPath: projectDir,
        agents: ['typescript-expert'],
        mcpServers: [],
        envVars: {},
      });

      // Lazy mode marker
      expect(fs.existsSync(path.join(projectDir, '.claude', 'skills', '_README.md'))).toBe(true);
      // typescript-expert declares only `skills:` (legacy) → treated as core,
      // so the typescript skill is preloaded under flat name.
      expect(fs.existsSync(path.join(projectDir, '.claude', 'skills', 'typescript', 'SKILL.md'))).toBe(true);
    });

    it('writes skillListingBudgetFraction=0.05 in .claude/settings.json on fresh install', async () => {
      await installationService.install({
        projectPath: projectDir,
        agents: ['typescript-expert'],
        mcpServers: [],
        envVars: {},
      });

      const settingsPath = path.join(projectDir, '.claude', 'settings.json');
      expect(fs.existsSync(settingsPath)).toBe(true);
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      expect(settings.skillListingBudgetFraction).toBe(0.05);
    });

    it('preserves an existing skillListingBudgetFraction set by the user', async () => {
      const settingsPath = path.join(projectDir, '.claude', 'settings.json');
      fs.mkdirSync(path.join(projectDir, '.claude'), { recursive: true });
      fs.writeFileSync(
        settingsPath,
        JSON.stringify({ skillListingBudgetFraction: 0.1, customField: 'keep me' }, null, 2),
      );

      await installationService.install({
        projectPath: projectDir,
        agents: ['typescript-expert'],
        mcpServers: [],
        envVars: {},
      });

      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      expect(settings.skillListingBudgetFraction).toBe(0.1); // user value preserved
      expect(settings.customField).toBe('keep me');
    });

    it('merges skillListingBudgetFraction into an existing settings.json without it', async () => {
      const settingsPath = path.join(projectDir, '.claude', 'settings.json');
      fs.mkdirSync(path.join(projectDir, '.claude'), { recursive: true });
      fs.writeFileSync(
        settingsPath,
        JSON.stringify({ hooks: { PreToolUse: [] } }, null, 2),
      );

      await installationService.install({
        projectPath: projectDir,
        agents: ['typescript-expert'],
        mcpServers: [],
        envVars: {},
      });

      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      expect(settings.skillListingBudgetFraction).toBe(0.05);
      // Pre-existing keys are kept
      expect(settings.hooks).toEqual({ PreToolUse: [] });
    });

    it('removes stale skill folders left by a previous install', async () => {
      // Simulate a stale eager-mode install: nested folder with SKILL.md
      const skillsDir = path.join(projectDir, '.claude', 'skills');
      const staleNested = path.join(skillsDir, 'infrastructure', 'systemd');
      fs.mkdirSync(staleNested, { recursive: true });
      fs.writeFileSync(path.join(staleNested, 'SKILL.md'), '# stale\n');
      // Simulate a stale lazy-mode install: flat folder
      const staleFlat = path.join(skillsDir, 'old-flat-skill');
      fs.mkdirSync(staleFlat, { recursive: true });
      fs.writeFileSync(path.join(staleFlat, 'SKILL.md'), '# stale\n');
      // Preserve a user-owned non-skill file
      fs.writeFileSync(path.join(skillsDir, 'NOTES.md'), 'user notes');

      await installationService.install({
        projectPath: projectDir,
        agents: ['typescript-expert'],
        mcpServers: [],
        envVars: {},
      });

      // Stale folders are gone
      expect(fs.existsSync(staleNested)).toBe(false);
      expect(fs.existsSync(staleFlat)).toBe(false);
      // User-owned top-level file is preserved
      expect(fs.existsSync(path.join(skillsDir, 'NOTES.md'))).toBe(true);
      // Fresh install still wrote the typescript skill
      expect(fs.existsSync(path.join(skillsDir, 'typescript', 'SKILL.md'))).toBe(true);
    });

    it('explicit skillLoadingMode=eager bypasses lazy even when skill-loader auto-included', async () => {
      await installationService.install({
        projectPath: projectDir,
        agents: ['typescript-expert'],
        mcpServers: [],
        envVars: {},
        skillLoadingMode: 'eager',
      });

      // skill-loader still auto-included into manifest …
      const mcpJson = JSON.parse(
        fs.readFileSync(path.join(projectDir, '.mcp.json'), 'utf-8'),
      ) as { mcpServers: Record<string, unknown> };
      // …but eager mode does NOT add it to .mcp.json (the MCP entry is
      // only emitted in lazy mode where the runtime fallback is needed)
      expect(mcpJson.mcpServers['skill-loader']).toBeUndefined();
      // No _README.md written in eager mode
      expect(fs.existsSync(path.join(projectDir, '.claude', 'skills', '_README.md'))).toBe(false);
    });
  });
});
