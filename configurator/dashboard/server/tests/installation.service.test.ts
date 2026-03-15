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
});
