/**
 * Agents Service Tests
 *
 * Note: Tests run against the actual dev-suite directory structure
 * since AgentsService resolves its path from __dirname.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentsService } from '../src/services/agents.service.js';
import { BUNDLES, expandBundleEntry } from '../src/services/agent-bundles.js';

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
        expect(agent).toHaveProperty('coreSkills');
        expect(agent).toHaveProperty('extendedSkills');
        expect(agent).toHaveProperty('filePath');
      }
    });

    it('unmigrated agents have coreSkills = skills and extendedSkills empty', async () => {
      const agents = await agentsService.getAgents();
      // Pick an agent that hasn't been migrated to the core/extended schema yet
      const legacyAgent = agents.find((a) => a.skills.length > 0 && a.extendedSkills.length === 0);
      if (!legacyAgent) return; // vacuously OK once all agents are migrated
      expect(legacyAgent.coreSkills).toEqual(legacyAgent.skills);
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

    it('skill-loader is marked isDefault: true (built-in capability)', async () => {
      const servers = await agentsService.getMcpServers();
      const skillLoader = servers.find((s) => s.name === 'skill-loader');
      expect(skillLoader, 'skill-loader MCP server not found').toBeDefined();
      expect(skillLoader!.isDefault).toBe(true);
    });

    it('non-default servers have isDefault unset or false', async () => {
      const servers = await agentsService.getMcpServers();
      const nonDefault = servers.filter((s) => s.name !== 'skill-loader');
      for (const server of nonDefault) {
        expect(server.isDefault, `${server.name} should not be marked isDefault`).not.toBe(true);
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

  // ─────────────────────────────────────────────────────────────────────────
  // Bundle expansion tests
  // ─────────────────────────────────────────────────────────────────────────

  describe('expandBundleEntry (unit)', () => {
    it('passes plain skill paths through unchanged', () => {
      expect(expandBundleEntry('rag/rag-architecture', 'test-agent')).toEqual([
        'rag/rag-architecture',
      ]);
    });

    it('expands a known bundle to multiple skill paths', () => {
      const result = expandBundleEntry('bundle:rag/foundation', 'test-agent');
      expect(result).toEqual(BUNDLES['rag/foundation']);
      expect(result.length).toBeGreaterThan(0);
    });

    it('expansion result contains no duplicates', () => {
      const result = expandBundleEntry('bundle:rag/foundation', 'test-agent');
      const unique = new Set(result);
      expect(unique.size).toBe(result.length);
    });

    it('returns empty array and warns for unknown bundle', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const result = expandBundleEntry('bundle:nonexistent/bundle', 'test-agent');
      expect(result).toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unknown bundle "nonexistent/bundle"')
      );
      warnSpy.mockRestore();
    });

    it('all bundle IDs resolve to non-empty arrays', () => {
      for (const [bundleId, skills] of Object.entries(BUNDLES)) {
        expect(skills.length, `Bundle "${bundleId}" must have at least one skill`).toBeGreaterThan(0);
      }
    });

    it('no bundle entry is an empty string', () => {
      for (const [bundleId, skills] of Object.entries(BUNDLES)) {
        for (const skill of skills) {
          expect(skill.trim(), `Bundle "${bundleId}" has empty skill entry`).not.toBe('');
        }
      }
    });
  });

  describe('bundle expansion via real agent frontmatters', () => {
    it('rag-expert expands to the full 95-skill set with no duplicates', async () => {
      const agents = await agentsService.getAgents();
      const ragExpert = agents.find((a) => a.id === 'rag-expert');

      // rag-expert must be present
      expect(ragExpert, 'rag-expert agent not found').toBeDefined();
      const skills = ragExpert!.skills;

      // Verify exact count matches original flat list
      expect(skills.length).toBe(95);

      // Verify no duplicates after bundle expansion
      const unique = new Set(skills);
      expect(unique.size).toBe(skills.length);
    });

    it('rag-expert skills include key entries from every bundle group', async () => {
      const agents = await agentsService.getAgents();
      const ragExpert = agents.find((a) => a.id === 'rag-expert');
      expect(ragExpert).toBeDefined();
      const skillSet = new Set(ragExpert!.skills);

      // Spot-check one representative skill from each bundle
      expect(skillSet.has('rag/rag-architecture')).toBe(true);           // rag/foundation
      expect(skillSet.has('rag/graph-rag')).toBe(true);                  // rag/specialized
      expect(skillSet.has('rag/entity-resolution')).toBe(true);          // rag/knowledge-graph
      expect(skillSet.has('rag/ares-framework')).toBe(true);             // rag/evaluation
      expect(skillSet.has('rag/ingestion-orchestration')).toBe(true);    // rag/ingestion
      expect(skillSet.has('retrieval/colbert-retrieval')).toBe(true);    // rag/retrieval
      expect(skillSet.has('embeddings/embedding-models')).toBe(true);    // rag/embeddings
      expect(skillSet.has('vector-stores/pgvector-advanced')).toBe(true); // rag/vector-stores
      expect(skillSet.has('document-processing/pdf-extraction')).toBe(true); // rag/document-processing
      expect(skillSet.has('rag-frameworks/llamaindex')).toBe(true);      // rag/frameworks
      expect(skillSet.has('rag-ops/tei-triton-serving')).toBe(true);     // rag/ops
      // Explicit supporting skills
      expect(skillSet.has('languages/python')).toBe(true);
      expect(skillSet.has('security/api-security')).toBe(true);
    });

    it('sysadmin-expert expands to the full 56-skill set with no duplicates', async () => {
      const agents = await agentsService.getAgents();
      const sysadmin = agents.find((a) => a.id === 'sysadmin-expert');

      expect(sysadmin, 'sysadmin-expert agent not found').toBeDefined();
      const skills = sysadmin!.skills;

      expect(skills.length).toBe(56);

      const unique = new Set(skills);
      expect(unique.size).toBe(skills.length);
    });

    it('sysadmin-expert skills include key entries from every bundle group', async () => {
      const agents = await agentsService.getAgents();
      const sysadmin = agents.find((a) => a.id === 'sysadmin-expert');
      expect(sysadmin).toBeDefined();
      const skillSet = new Set(sysadmin!.skills);

      // Spot-check one representative skill from each bundle
      expect(skillSet.has('infrastructure/nginx')).toBe(true);           // infra/web-server
      expect(skillSet.has('infrastructure/firewall')).toBe(true);        // infra/security-hardening
      expect(skillSet.has('security/secrets-management')).toBe(true);    // infra/security-hardening
      expect(skillSet.has('infrastructure/systemd')).toBe(true);         // infra/services
      expect(skillSet.has('infrastructure/server-monitoring')).toBe(true); // infra/monitoring
      expect(skillSet.has('infrastructure/backup-recovery')).toBe(true); // infra/backup-network
      expect(skillSet.has('infrastructure/kubernetes')).toBe(true);      // infra/k8s-cloud
      expect(skillSet.has('cloud/aws')).toBe(true);                      // infra/k8s-cloud
      expect(skillSet.has('databases/postgresql')).toBe(true);           // infra/databases
      // Explicit skills
      expect(skillSet.has('infrastructure/linux-server')).toBe(true);
      expect(skillSet.has('ci-cd/github-actions')).toBe(true);
    });

    it('agents with plain skill lists (no bundles) continue to work', async () => {
      const agents = await agentsService.getAgents();
      // Find an agent that doesn't use bundles — any agent other than rag/sysadmin
      const plainAgent = agents.find(
        (a) => a.id !== 'rag-expert' && a.id !== 'sysadmin-expert' && a.skills.length > 0
      );
      // If no other agents exist the test is vacuously OK
      if (!plainAgent) return;
      // Skills must all be non-empty strings (bundles expanded fine, plain pass-through works)
      for (const skill of plainAgent.skills) {
        expect(typeof skill).toBe('string');
        expect(skill.trim()).not.toBe('');
      }
    });

    it('mixed bundle + explicit skill declaration deduplicates correctly', async () => {
      // Both rag-expert bundles and explicit list overlap on security/api-security —
      // it is in both the explicit list AND potentially referenced again in bundles.
      // The dedup logic must keep it exactly once.
      const agents = await agentsService.getAgents();
      const ragExpert = agents.find((a) => a.id === 'rag-expert');
      expect(ragExpert).toBeDefined();
      const securityEntries = ragExpert!.skills.filter((s) => s === 'security/api-security');
      expect(securityEntries.length).toBe(1);
    });
  });
});
