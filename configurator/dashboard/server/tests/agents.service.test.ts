/**
 * Agents Service Tests
 *
 * Note: Tests run against the actual dev-suite directory structure
 * since AgentsService resolves its path from __dirname.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AgentsService } from '../src/services/agents.service.js';

describe('AgentsService', () => {
  let agentsService: AgentsService;

  beforeEach(() => {
    agentsService = new AgentsService();
    // Invalidate cache before each test
    agentsService.invalidateCache();
  });

  describe('getAgents', () => {
    it('should return an array', async () => {
      const agents = await agentsService.getAgents();

      expect(Array.isArray(agents)).toBe(true);
    });

    it('should return agents with required properties', async () => {
      const agents = await agentsService.getAgents();

      // If agents exist (dev-suite has agents dir)
      if (agents.length > 0) {
        const agent = agents[0];
        expect(agent).toHaveProperty('id');
        expect(agent).toHaveProperty('name');
        expect(agent).toHaveProperty('description');
        expect(agent).toHaveProperty('category');
        expect(agent).toHaveProperty('skills');
        expect(agent).toHaveProperty('filePath');
      }
    });

    it('should cache results', async () => {
      const agents1 = await agentsService.getAgents();
      const agents2 = await agentsService.getAgents();

      // Same reference if cached
      expect(agents1).toBe(agents2);
    });

    it('should refresh cache when forceRefresh is true', async () => {
      const agents1 = await agentsService.getAgents();
      const agents2 = await agentsService.getAgents(true);

      // Different reference after force refresh
      expect(agents1).not.toBe(agents2);
    });
  });

  describe('getMcpServers', () => {
    it('should return an array', async () => {
      const servers = await agentsService.getMcpServers();

      expect(Array.isArray(servers)).toBe(true);
    });

    it('should return servers with required properties', async () => {
      const servers = await agentsService.getMcpServers();

      // If servers exist (dev-suite has mcp-servers dir)
      if (servers.length > 0) {
        const server = servers[0];
        expect(server).toHaveProperty('name');
        expect(server).toHaveProperty('description');
        expect(server).toHaveProperty('category');
        expect(server).toHaveProperty('tools');
        expect(server).toHaveProperty('envVars');
      }
    });

    it('should cache results', async () => {
      const servers1 = await agentsService.getMcpServers();
      const servers2 = await agentsService.getMcpServers();

      expect(servers1).toBe(servers2);
    });

    it('should refresh cache when forceRefresh is true', async () => {
      const servers1 = await agentsService.getMcpServers();
      const servers2 = await agentsService.getMcpServers(true);

      expect(servers1).not.toBe(servers2);
    });
  });

  describe('getRequiredEnvVars', () => {
    it('should return an array for empty server list', async () => {
      const envVars = await agentsService.getRequiredEnvVars([]);

      expect(envVars).toEqual([]);
    });

    it('should return env vars for valid servers', async () => {
      // Get list of actual servers
      const servers = await agentsService.getMcpServers();

      if (servers.length > 0) {
        // Use the first server name
        const serverName = servers[0].name;
        const envVars = await agentsService.getRequiredEnvVars([serverName]);

        expect(Array.isArray(envVars)).toBe(true);
      }
    });

    it('should return env vars with required properties', async () => {
      const servers = await agentsService.getMcpServers();

      // Find a server that has envVars
      const serverWithEnvVars = servers.find((s) => s.envVars && s.envVars.length > 0);

      if (serverWithEnvVars) {
        const envVars = await agentsService.getRequiredEnvVars([serverWithEnvVars.name]);

        if (envVars.length > 0) {
          const envVar = envVars[0];
          expect(envVar).toHaveProperty('name');
          expect(envVar).toHaveProperty('description');
          expect(envVar).toHaveProperty('required');
          expect(envVar).toHaveProperty('default');
        }
      }
    });

    it('should handle unknown server names', async () => {
      const envVars = await agentsService.getRequiredEnvVars(['nonexistent-server']);

      expect(envVars).toEqual([]);
    });
  });

  describe('invalidateCache', () => {
    it('should not throw when invalidating cache', () => {
      expect(() => agentsService.invalidateCache()).not.toThrow();
    });

    it('should cause next getAgents to fetch fresh data', async () => {
      const agents1 = await agentsService.getAgents();
      agentsService.invalidateCache();
      const agents2 = await agentsService.getAgents();

      // Different reference after invalidation
      expect(agents1).not.toBe(agents2);
    });

    it('should cause next getMcpServers to fetch fresh data', async () => {
      const servers1 = await agentsService.getMcpServers();
      agentsService.invalidateCache();
      const servers2 = await agentsService.getMcpServers();

      expect(servers1).not.toBe(servers2);
    });
  });
});
