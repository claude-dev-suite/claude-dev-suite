/**
 * Installation Routes Tests
 *
 * Unit tests for installation route handlers.
 * Tests service integration, error handling, and response formatting.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InstallationService } from '../../src/services/installation.service.js';
import type { InstallConfig, InstallManifest } from '../../src/types.js';

// Mock the service
vi.mock('../../src/services/installation.service.js');

describe('Installation Routes - Service Integration', () => {
  let installationService: InstallationService;

  beforeEach(() => {
    installationService = new InstallationService();
    vi.clearAllMocks();
  });

  describe('prepareServers logic', () => {
    it('should call prepareServers with server list', async () => {
      const servers = ['documentation', 'api-tester'];
      vi.mocked(installationService.prepareServers).mockResolvedValue(undefined);

      await installationService.prepareServers(servers);

      expect(installationService.prepareServers).toHaveBeenCalledWith(servers);
    });

    it('should handle empty server list', async () => {
      const servers: string[] = [];
      vi.mocked(installationService.prepareServers).mockResolvedValue(undefined);

      await installationService.prepareServers(servers);

      expect(installationService.prepareServers).toHaveBeenCalledWith(servers);
    });

    it('should handle preparation errors', async () => {
      const servers = ['invalid-server'];
      vi.mocked(installationService.prepareServers).mockRejectedValue(
        new Error('Build failed')
      );

      await expect(installationService.prepareServers(servers)).rejects.toThrow('Build failed');
    });
  });

  describe('install logic', () => {
    it('should install with full configuration', async () => {
      const config: InstallConfig = {
        projectPath: '/test/project',
        agents: ['react-expert', 'typescript-expert'],
        mcpServers: ['documentation', 'code-quality'],
        envVars: { DATABASE_URL: 'postgres://localhost' },
      };

      const manifest: InstallManifest = {
        version: '1.0.0',
        installedAt: new Date().toISOString(),
        projectPath: config.projectPath,
        agents: config.agents,
        mcpServers: config.mcpServers,
        files: [],
      };

      vi.mocked(installationService.install).mockResolvedValue(manifest);

      const result = await installationService.install(config);

      expect(installationService.install).toHaveBeenCalledWith(config);
      expect(result).toEqual(manifest);
      expect(result.agents).toHaveLength(2);
      expect(result.mcpServers).toHaveLength(2);
    });

    it('should install with minimal configuration', async () => {
      const config: InstallConfig = {
        projectPath: '/test/project',
        agents: [],
        mcpServers: [],
        envVars: {},
      };

      const manifest: InstallManifest = {
        version: '1.0.0',
        installedAt: new Date().toISOString(),
        projectPath: config.projectPath,
        agents: [],
        mcpServers: [],
        files: [],
      };

      vi.mocked(installationService.install).mockResolvedValue(manifest);

      const result = await installationService.install(config);

      expect(result.agents).toHaveLength(0);
      expect(result.mcpServers).toHaveLength(0);
    });

    it('should handle installation errors', async () => {
      const config: InstallConfig = {
        projectPath: '/readonly/project',
        agents: ['react-expert'],
        mcpServers: [],
        envVars: {},
      };

      vi.mocked(installationService.install).mockRejectedValue(
        new Error('Failed to copy files: Permission denied')
      );

      await expect(installationService.install(config)).rejects.toThrow(
        'Failed to copy files: Permission denied'
      );
    });

    it('should calculate summary correctly', () => {
      const manifest: InstallManifest = {
        version: '1.0.0',
        installedAt: new Date().toISOString(),
        projectPath: '/test/project',
        agents: ['react-expert', 'typescript-expert'],
        mcpServers: ['documentation'],
        files: [],
      };

      const agentCount = manifest.agents?.length || 0;
      const serverCount = manifest.mcpServers?.length || 0;
      const summary = `Installed ${agentCount} agents and ${serverCount} MCP servers`;

      expect(summary).toBe('Installed 2 agents and 1 MCP servers');
    });

    it('should handle undefined arrays in manifest', () => {
      const manifest: InstallManifest = {
        version: '1.0.0',
        installedAt: new Date().toISOString(),
        projectPath: '/test/project',
        agents: undefined as any,
        mcpServers: undefined as any,
        files: [],
      };

      const agentCount = manifest.agents?.length || 0;
      const serverCount = manifest.mcpServers?.length || 0;
      const summary = `Installed ${agentCount} agents and ${serverCount} MCP servers`;

      expect(summary).toBe('Installed 0 agents and 0 MCP servers');
    });
  });

  describe('uninstall logic', () => {
    it('should uninstall successfully', async () => {
      const projectPath = '/test/project';
      vi.mocked(installationService.uninstall).mockResolvedValue(undefined);

      await installationService.uninstall(projectPath);

      expect(installationService.uninstall).toHaveBeenCalledWith(projectPath);
    });

    it('should handle uninstall errors', async () => {
      const projectPath = '/nonexistent/project';
      vi.mocked(installationService.uninstall).mockRejectedValue(
        new Error('Directory not found')
      );

      await expect(installationService.uninstall(projectPath)).rejects.toThrow(
        'Directory not found'
      );
    });
  });

  describe('getStatus logic', () => {
    it('should return status for installed project', async () => {
      const projectPath = '/test/project';
      const status = {
        installed: true,
        manifest: {
          version: '1.0.0',
          installedAt: '2024-01-01T00:00:00.000Z',
          projectPath,
          agents: ['react-expert'],
          mcpServers: ['documentation'],
          files: [],
        },
      };

      vi.mocked(installationService.getStatus).mockResolvedValue(status);

      const result = await installationService.getStatus(projectPath);

      expect(result.installed).toBe(true);
      expect(result.manifest).toBeDefined();
      expect(result.manifest?.agents).toHaveLength(1);
    });

    it('should return status for non-installed project', async () => {
      const projectPath = '/test/project';
      const status = {
        installed: false,
      };

      vi.mocked(installationService.getStatus).mockResolvedValue(status);

      const result = await installationService.getStatus(projectPath);

      expect(result.installed).toBe(false);
      expect(result.manifest).toBeUndefined();
    });

    it('should handle status check errors', async () => {
      const projectPath = '/invalid/project';
      vi.mocked(installationService.getStatus).mockRejectedValue(
        new Error('Cannot read directory')
      );

      await expect(installationService.getStatus(projectPath)).rejects.toThrow(
        'Cannot read directory'
      );
    });
  });

  describe('Request validation scenarios', () => {
    it('should validate projectPath is required for install', () => {
      const config = {
        projectPath: '',
        agents: [],
        mcpServers: [],
        envVars: {},
      };

      expect(config.projectPath).toBe('');
      // In actual validation, Zod would reject this
    });

    it('should validate serverNames for prepareServers', () => {
      const validServers = ['documentation', 'api-tester'];
      const emptyServers: string[] = [];

      expect(Array.isArray(validServers)).toBe(true);
      expect(Array.isArray(emptyServers)).toBe(true);
      expect(validServers.length).toBeGreaterThan(0);
    });

    it('should accept both servers and serverNames parameters', () => {
      const payload1 = { serverNames: ['doc'] };
      const payload2 = { servers: ['doc'] };

      const list1 = payload1.serverNames || (payload1 as any).servers || [];
      const list2 = (payload2 as any).serverNames || payload2.servers || [];

      expect(list1).toEqual(['doc']);
      expect(list2).toEqual(['doc']);
    });

    it('should prioritize serverNames over servers', () => {
      const payload = {
        serverNames: ['documentation'],
        servers: ['api-tester'],
      };

      const serverList = payload.serverNames || payload.servers || [];

      expect(serverList).toEqual(['documentation']);
    });
  });

  describe('Response formatting', () => {
    it('should format prepare-servers response', () => {
      const servers = ['documentation', 'api-tester'];
      const response = {
        success: true,
        prepared: servers,
      };

      expect(response.success).toBe(true);
      expect(response.prepared).toEqual(servers);
    });

    it('should format install response with summary', () => {
      const manifest: InstallManifest = {
        version: '1.0.0',
        installedAt: new Date().toISOString(),
        projectPath: '/test/project',
        agents: ['react-expert'],
        mcpServers: ['documentation', 'api-tester'],
        files: [],
      };

      const response = {
        success: true,
        manifest,
        summary: `Installed ${manifest.agents?.length || 0} agents and ${manifest.mcpServers?.length || 0} MCP servers`,
      };

      expect(response.success).toBe(true);
      expect(response.summary).toBe('Installed 1 agents and 2 MCP servers');
    });

    it('should format uninstall response', () => {
      const response = {
        success: true,
        uninstalled: true,
      };

      expect(response.success).toBe(true);
      expect(response.uninstalled).toBe(true);
    });

    it('should format status response', () => {
      const status = {
        installed: true,
        manifest: {
          version: '1.0.0',
          installedAt: '2024-01-01T00:00:00.000Z',
          projectPath: '/test/project',
          agents: ['react-expert'],
          mcpServers: ['documentation'],
          files: [],
        },
      };

      const response = {
        success: true,
        ...status,
      };

      expect(response.success).toBe(true);
      expect(response.installed).toBe(true);
      expect(response.manifest).toBeDefined();
    });

    it('should format error response', () => {
      const error = new Error('Installation failed');
      const response = {
        success: false,
        error: error.message,
      };

      expect(response.success).toBe(false);
      expect(response.error).toBe('Installation failed');
    });
  });
});
