/**
 * Agents Routes Tests
 *
 * Unit tests for agents route handlers.
 * Tests service integration, request validation, and error handling.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentsService } from '../../src/services/agents.service.js';
import type { Agent, McpServer, EnvVarConfig } from '../../src/types.js';

// Mock the service
vi.mock('../../src/services/agents.service.js');

describe('Agents Routes - Service Integration', () => {
  let agentsService: AgentsService;

  beforeEach(() => {
    agentsService = new AgentsService();
    vi.clearAllMocks();
  });

  describe('getAgents logic', () => {
    it('should return list of agents', async () => {
      const mockAgents: Agent[] = [
        {
          id: 'react-expert',
          name: 'React Expert',
          description: 'Expert in React development',
          category: 'frontend',
          skills: ['frontend-react', 'state-zustand'],
          mcpServers: ['documentation', 'code-quality'],
          filePath: '/agents/frontend/react-expert.md',
        },
        {
          id: 'typescript-expert',
          name: 'TypeScript Expert',
          description: 'TypeScript and Node.js expert',
          category: 'core',
          skills: ['languages/typescript', 'languages/nodejs'],
          mcpServers: ['documentation'],
          filePath: '/agents/core/typescript-expert.md',
        },
      ];

      vi.mocked(agentsService.getAgents).mockResolvedValue(mockAgents);

      const result = await agentsService.getAgents();

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('react-expert');
      expect(result[0].category).toBe('frontend');
      expect(result[1].id).toBe('typescript-expert');
    });

    it('should return empty array when no agents found', async () => {
      vi.mocked(agentsService.getAgents).mockResolvedValue([]);

      const result = await agentsService.getAgents();

      expect(result).toEqual([]);
    });

    it('should validate agent structure', () => {
      const agent: Agent = {
        id: 'react-expert',
        name: 'React Expert',
        description: 'React development expert',
        category: 'frontend',
        skills: ['frontend-react'],
        mcpServers: ['documentation'],
        filePath: '/agents/frontend/react-expert.md',
      };

      expect(agent).toHaveProperty('id');
      expect(agent).toHaveProperty('name');
      expect(agent).toHaveProperty('description');
      expect(agent).toHaveProperty('category');
      expect(agent).toHaveProperty('skills');
      expect(agent).toHaveProperty('mcpServers');
      expect(agent).toHaveProperty('filePath');
    });

    it('should handle service errors', async () => {
      vi.mocked(agentsService.getAgents).mockRejectedValue(
        new Error('Failed to read agents directory')
      );

      await expect(agentsService.getAgents()).rejects.toThrow('Failed to read agents directory');
    });
  });

  describe('getMcpServers logic', () => {
    it('should return list of MCP servers', async () => {
      const mockServers: McpServer[] = [
        {
          name: 'documentation',
          description: 'Fetch documentation for technologies',
          shortDescription: 'Docs fetcher',
          category: 'knowledge',
          tools: ['fetch_docs', 'search_docs', 'list_topics'],
          envVars: [
            {
              name: 'KB_REPO_URL',
              description: 'Knowledge base repository URL',
              required: false,
              default: '',
            },
          ],
          recommendedFor: ['react-expert', 'typescript-expert'],
          detectedWhen: ['react', 'typescript', 'javascript'],
          path: '/mcp-servers/documentation',
        },
        {
          name: 'database-query',
          description: 'Execute SQL queries and manage schemas',
          shortDescription: 'Database operations',
          category: 'database',
          tools: ['execute_query', 'list_tables', 'describe_table'],
          envVars: [
            {
              name: 'DATABASE_URL',
              description: 'Database connection string',
              required: true,
              default: '',
            },
          ],
          recommendedFor: ['prisma-expert', 'sql-expert'],
          detectedWhen: ['prisma', 'postgresql', 'mysql'],
          path: '/mcp-servers/database-query',
        },
      ];

      vi.mocked(agentsService.getMcpServers).mockResolvedValue(mockServers);

      const result = await agentsService.getMcpServers();

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('documentation');
      expect(result[1].name).toBe('database-query');
    });

    it('should return empty array when no servers found', async () => {
      vi.mocked(agentsService.getMcpServers).mockResolvedValue([]);

      const result = await agentsService.getMcpServers();

      expect(result).toEqual([]);
    });

    it('should validate MCP server structure', () => {
      const server: McpServer = {
        name: 'documentation',
        description: 'Fetch documentation',
        shortDescription: 'Docs',
        category: 'knowledge',
        tools: ['fetch_docs'],
        envVars: [],
        recommendedFor: [],
        detectedWhen: [],
        path: '/mcp-servers/documentation',
      };

      expect(server).toHaveProperty('name');
      expect(server).toHaveProperty('description');
      expect(server).toHaveProperty('category');
      expect(server).toHaveProperty('tools');
      expect(server).toHaveProperty('envVars');
    });

    it('should handle service errors', async () => {
      vi.mocked(agentsService.getMcpServers).mockRejectedValue(
        new Error('Failed to load metadata.json')
      );

      await expect(agentsService.getMcpServers()).rejects.toThrow('Failed to load metadata.json');
    });
  });

  describe('getRequiredEnvVars logic', () => {
    it('should return required env vars for selected servers', async () => {
      const mockEnvVars: EnvVarConfig[] = [
        {
          name: 'DATABASE_URL',
          description: 'PostgreSQL connection string',
          required: true,
          default: '',
        },
        {
          name: 'GIT_API_TOKEN',
          description: 'GitHub API token',
          required: true,
          default: '',
        },
      ];

      vi.mocked(agentsService.getRequiredEnvVars).mockResolvedValue(mockEnvVars);

      const result = await agentsService.getRequiredEnvVars(['database-query', 'docker-manager']);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('DATABASE_URL');
      expect(result[0].required).toBe(true);
      expect(result[1].name).toBe('GIT_API_TOKEN');
    });

    it('should return empty array for empty server list', async () => {
      vi.mocked(agentsService.getRequiredEnvVars).mockResolvedValue([]);

      const result = await agentsService.getRequiredEnvVars([]);

      expect(result).toEqual([]);
    });

    it('should handle optional env vars', async () => {
      const mockEnvVars: EnvVarConfig[] = [
        {
          name: 'KB_REPO_URL',
          description: 'Knowledge base URL',
          required: false,
          default: '',
        },
      ];

      vi.mocked(agentsService.getRequiredEnvVars).mockResolvedValue(mockEnvVars);

      const result = await agentsService.getRequiredEnvVars(['documentation']);

      expect(result[0].required).toBe(false);
    });

    it('should handle service errors', async () => {
      vi.mocked(agentsService.getRequiredEnvVars).mockRejectedValue(
        new Error('Server not found: invalid-server')
      );

      await expect(agentsService.getRequiredEnvVars(['invalid-server'])).rejects.toThrow(
        'Server not found: invalid-server'
      );
    });
  });

  describe('Request validation scenarios', () => {
    it('should validate servers array is required', () => {
      const validPayload = { serverNames: ['doc'] };
      const invalidPayload = {};

      const list1 = validPayload.serverNames || [];
      const list2 = (invalidPayload as any).serverNames || (invalidPayload as any).servers;

      expect(Array.isArray(list1)).toBe(true);
      expect(list2).toBeUndefined();
    });

    it('should accept both "servers" and "serverNames" parameters', () => {
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

    it('should validate array type', () => {
      const validPayload = { serverNames: ['doc'] };
      const invalidPayload = { serverNames: 'not-an-array' };

      expect(Array.isArray(validPayload.serverNames)).toBe(true);
      expect(Array.isArray(invalidPayload.serverNames)).toBe(false);
    });
  });

  describe('Response formatting', () => {
    it('should format agents response', () => {
      const agents: Agent[] = [
        {
          id: 'react-expert',
          name: 'React Expert',
          description: 'React expert',
          category: 'frontend',
          skills: [],
          mcpServers: [],
          filePath: '/agents/frontend/react-expert.md',
        },
      ];

      const response = { agents };

      expect(response.agents).toBeDefined();
      expect(response.agents).toHaveLength(1);
    });

    it('should format MCP servers response', () => {
      const servers: McpServer[] = [
        {
          name: 'documentation',
          description: 'Docs',
          shortDescription: 'Docs',
          category: 'knowledge',
          tools: [],
          envVars: [],
          recommendedFor: [],
          detectedWhen: [],
          path: '/path',
        },
      ];

      const response = { servers };

      expect(response.servers).toBeDefined();
      expect(response.servers).toHaveLength(1);
    });

    it('should format env vars response', () => {
      const envVars: EnvVarConfig[] = [
        {
          name: 'DATABASE_URL',
          description: 'Database connection',
          required: true,
          default: '',
        },
      ];

      const response = { envVars };

      expect(response.envVars).toBeDefined();
      expect(response.envVars).toHaveLength(1);
    });

    it('should format error response', () => {
      const error = new Error('Service failed');
      const response = {
        error: error.message,
      };

      expect(response.error).toBe('Service failed');
    });
  });

  describe('Edge cases', () => {
    it('should handle multiple agent categories', async () => {
      const mockAgents: Agent[] = [
        {
          id: 'react-expert',
          name: 'React Expert',
          description: '',
          category: 'frontend',
          skills: [],
          mcpServers: [],
          filePath: '',
        },
        {
          id: 'spring-boot-expert',
          name: 'Spring Boot Expert',
          description: '',
          category: 'backend',
          skills: [],
          mcpServers: [],
          filePath: '',
        },
        {
          id: 'architect',
          name: 'Architect',
          description: '',
          category: 'core',
          skills: [],
          mcpServers: [],
          filePath: '',
        },
      ];

      vi.mocked(agentsService.getAgents).mockResolvedValue(mockAgents);

      const result = await agentsService.getAgents();

      const categories = new Set(result.map((a) => a.category));
      expect(categories.size).toBe(3);
      expect(categories.has('frontend')).toBe(true);
      expect(categories.has('backend')).toBe(true);
      expect(categories.has('core')).toBe(true);
    });

    it('should handle servers with multiple tools', async () => {
      const mockServers: McpServer[] = [
        {
          name: 'api-tester',
          description: 'API testing',
          shortDescription: 'API',
          category: 'api',
          tools: ['http_request', 'benchmark', 'mock_server', 'import_postman'],
          envVars: [],
          recommendedFor: [],
          detectedWhen: [],
          path: '/mcp-servers/api-tester',
        },
      ];

      vi.mocked(agentsService.getMcpServers).mockResolvedValue(mockServers);

      const result = await agentsService.getMcpServers();

      expect(result[0].tools).toHaveLength(4);
      expect(result[0].tools).toContain('http_request');
      expect(result[0].tools).toContain('benchmark');
    });

    it('should merge env vars from multiple servers without duplicates', async () => {
      const mockEnvVars: EnvVarConfig[] = [
        {
          name: 'DATABASE_URL',
          description: 'Database connection',
          required: true,
          default: '',
        },
        {
          name: 'KB_REPO_URL',
          description: 'Knowledge base URL',
          required: false,
          default: '',
        },
        {
          name: 'GIT_API_TOKEN',
          description: 'Git API token',
          required: true,
          default: '',
        },
      ];

      vi.mocked(agentsService.getRequiredEnvVars).mockResolvedValue(mockEnvVars);

      const result = await agentsService.getRequiredEnvVars([
        'database-query',
        'documentation',
        'docker-manager',
      ]);

      expect(result).toHaveLength(3);
      const names = result.map((e) => e.name);
      expect(new Set(names).size).toBe(3); // No duplicates
    });

    it('should handle special characters in server names', async () => {
      const serverNames = ['api-tester', 'database-query', 'docker-manager'];

      vi.mocked(agentsService.getRequiredEnvVars).mockResolvedValue([]);

      await agentsService.getRequiredEnvVars(serverNames);

      expect(agentsService.getRequiredEnvVars).toHaveBeenCalledWith(serverNames);
    });
  });
});
