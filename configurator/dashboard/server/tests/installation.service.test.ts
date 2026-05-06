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
      expect(mcpJson.mcpServers['skill-loader'].env.DEV_SUITE_ROOT).toBeDefined();
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
});
