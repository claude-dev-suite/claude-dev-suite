/**
 * Management Service Tests
 *
 * Note: Some operations require the actual dev-suite directory with agents/MCP servers.
 * These tests focus on what can be tested without depending on external resources.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ManagementService } from '../src/services/management.service.js';
import {
  createTempDir,
  cleanupTempDir,
  createMockProject,
  createMockDevSuiteDir,
} from './test-utils.js';
import * as fs from 'fs';
import * as path from 'path';

describe('ManagementService', () => {
  let managementService: ManagementService;
  let projectDir: string;
  let devSuiteDir: string;

  beforeEach(() => {
    projectDir = createTempDir('manage-test-');
    devSuiteDir = createTempDir('manage-devsuite-');
    createMockDevSuiteDir(devSuiteDir);
    process.env.DEV_SUITE_DIR = devSuiteDir;
    managementService = new ManagementService();
  });

  afterEach(() => {
    cleanupTempDir(projectDir);
    cleanupTempDir(devSuiteDir);
    delete process.env.DEV_SUITE_DIR;
  });

  describe('getInstalledComponents', () => {
    it('should return empty arrays for new project', async () => {
      createMockProject(projectDir, {
        packageJson: { name: 'test-project' },
      });

      const components = await managementService.getInstalledComponents(projectDir);

      expect(Array.isArray(components.agents)).toBe(true);
      expect(Array.isArray(components.mcpServers)).toBe(true);
    });

    it('should detect installed agents from file system', async () => {
      createMockProject(projectDir, {
        packageJson: { name: 'test-project' },
      });

      // Create .claude/agents directory with a mock agent
      const agentsDir = path.join(projectDir, '.claude', 'agents');
      fs.mkdirSync(agentsDir, { recursive: true });
      fs.writeFileSync(
        path.join(agentsDir, 'test-expert.md'),
        '---\nname: test-expert\n---\nTest agent'
      );

      const components = await managementService.getInstalledComponents(projectDir);

      expect(components.agents).toContain('test-expert');
    });

    it('should detect installed MCP servers from file system', async () => {
      createMockProject(projectDir, {
        packageJson: { name: 'test-project' },
      });

      // Create .mcp-servers directory with a mock server
      const mcpDir = path.join(projectDir, '.mcp-servers', 'test-server');
      fs.mkdirSync(mcpDir, { recursive: true });
      fs.writeFileSync(path.join(mcpDir, 'package.json'), '{"name":"test-server"}');

      const components = await managementService.getInstalledComponents(projectDir);

      expect(components.mcpServers).toContain('test-server');
    });

    it('should read from .dev-suite.json when present', async () => {
      createMockProject(projectDir, {
        packageJson: { name: 'test-project' },
        files: {
          '.dev-suite.json': JSON.stringify({
            agents: { enabled: ['react-expert', 'typescript-expert'] },
            mcpServers: { enabled: ['documentation'] },
          }),
        },
      });

      // Create matching agents dir so file system scan confirms
      const agentsDir = path.join(projectDir, '.claude', 'agents');
      fs.mkdirSync(agentsDir, { recursive: true });
      fs.writeFileSync(path.join(agentsDir, 'react-expert.md'), '---\nname: react-expert\n---\n');
      fs.writeFileSync(path.join(agentsDir, 'typescript-expert.md'), '---\nname: typescript-expert\n---\n');

      const components = await managementService.getInstalledComponents(projectDir);

      expect(components.agents.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('addAgent', () => {
    it('should throw for non-existent agent', async () => {
      createMockProject(projectDir, {
        packageJson: { name: 'test-project' },
      });

      await expect(
        managementService.addAgent(projectDir, 'nonexistent-agent-xyz')
      ).rejects.toThrow(/not found/);
    });
  });

  describe('addAgent follows the project\'s skill-loading mode', () => {
    /**
     * This path always behaved as eager: it copied the agent's full skill set
     * and passed no `extraMcpServers`. An agent added from the Manage tab to a
     * lazy project therefore came out unlike every other agent in it — skill
     * directories the install had deliberately not written, no `skill-loader`
     * in its `mcpServers:`, and none of the instructions for reaching the tier.
     */
    const AGENT = `---
name: tiered-expert
description: Tiered agent.
allowed-tools: Read, Grep
core_skills:
  - languages/typescript
extended_skills:
  - testing/vitest
---

# Tiered Expert

Body.
`;

    function seedCatalog(): void {
      fs.mkdirSync(path.join(devSuiteDir, 'agents', 'core'), { recursive: true });
      fs.writeFileSync(path.join(devSuiteDir, 'agents', 'core', 'tiered-expert.md'), AGENT);

      for (const skill of ['languages/typescript', 'testing/vitest']) {
        const dir = path.join(devSuiteDir, 'skills', ...skill.split('/'));
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(
          path.join(dir, 'SKILL.md'),
          `---\nname: ${skill.split('/')[1]}\ndescription: x\n---\nbody`
        );
      }
    }

    const installedAgent = () =>
      fs.readFileSync(path.join(projectDir, '.claude', 'agents', 'tiered-expert.md'), 'utf-8');

    const skillInstalled = (flat: string) =>
      fs.existsSync(path.join(projectDir, '.claude', 'skills', flat));

    it('copies only the core tier when the project is lazy', async () => {
      createMockProject(projectDir, { packageJson: { name: 'test-project' } });
      // The project's own MCP config is what states the mode.
      fs.writeFileSync(
        path.join(projectDir, '.mcp.json'),
        JSON.stringify({ mcpServers: { 'skill-loader': { command: 'node', args: ['x'] } } })
      );
      seedCatalog();

      await managementService.addAgent(projectDir, 'tiered-expert');

      expect(skillInstalled('languages-typescript')).toBe(true);
      expect(skillInstalled('testing-vitest')).toBe(false);
    });

    it('gives the agent the server and the instructions to use it', async () => {
      createMockProject(projectDir, { packageJson: { name: 'test-project' } });
      fs.writeFileSync(
        path.join(projectDir, '.mcp.json'),
        JSON.stringify({ mcpServers: { 'skill-loader': { command: 'node', args: ['x'] } } })
      );
      seedCatalog();

      await managementService.addAgent(projectDir, 'tiered-expert');
      const out = installedAgent();

      expect(out).toMatch(/^\s+-\s+skill-loader$/m);
      expect(out).toMatch(/^tools:.*mcp__skill-loader__\*/m);
      expect(out).toContain('## Extended skills');
    });

    it('still copies everything when the project is eager', async () => {
      // No `skill-loader` in the project's MCP config: the whole catalog for
      // this agent was written to disk at install time, and the server that
      // would serve the rest is not there.
      createMockProject(projectDir, { packageJson: { name: 'test-project' } });
      fs.writeFileSync(
        path.join(projectDir, '.mcp.json'),
        JSON.stringify({ mcpServers: { documentation: { command: 'node', args: ['x'] } } })
      );
      seedCatalog();

      await managementService.addAgent(projectDir, 'tiered-expert');

      expect(skillInstalled('languages-typescript')).toBe(true);
      expect(skillInstalled('testing-vitest')).toBe(true);
      expect(installedAgent()).not.toContain('## Extended skills');
    });
  });

  describe('removeAgent', () => {
    it('should throw for non-existent agent in project', async () => {
      createMockProject(projectDir, {
        packageJson: { name: 'test-project' },
      });

      await expect(
        managementService.removeAgent(projectDir, 'nonexistent-agent')
      ).rejects.toThrow(/not found/);
    });

    it('should remove an installed agent', async () => {
      createMockProject(projectDir, {
        packageJson: { name: 'test-project' },
      });

      // Create a mock installed agent
      const agentsDir = path.join(projectDir, '.claude', 'agents');
      fs.mkdirSync(agentsDir, { recursive: true });
      fs.writeFileSync(path.join(agentsDir, 'test-agent.md'), '# Test Agent');

      await managementService.removeAgent(projectDir, 'test-agent');

      expect(fs.existsSync(path.join(agentsDir, 'test-agent.md'))).toBe(false);
    });
  });

  describe('addMcpServer', () => {
    it('should throw for non-existent MCP server', async () => {
      createMockProject(projectDir, {
        packageJson: { name: 'test-project' },
      });

      await expect(
        managementService.addMcpServer(projectDir, 'nonexistent-server-xyz', {})
      ).rejects.toThrow(/not found/);
    });
  });

  describe('removeMcpServer', () => {
    it('should throw for non-existent MCP server in project', async () => {
      createMockProject(projectDir, {
        packageJson: { name: 'test-project' },
      });

      await expect(
        managementService.removeMcpServer(projectDir, 'nonexistent-server')
      ).rejects.toThrow(/not found/);
    });

    it('should remove an installed MCP server', async () => {
      createMockProject(projectDir, {
        packageJson: { name: 'test-project' },
      });

      // Create a mock installed MCP server
      const mcpDir = path.join(projectDir, '.mcp-servers', 'test-server');
      fs.mkdirSync(mcpDir, { recursive: true });
      fs.writeFileSync(path.join(mcpDir, 'package.json'), '{"name":"test"}');

      await managementService.removeMcpServer(projectDir, 'test-server');

      expect(fs.existsSync(mcpDir)).toBe(false);
    });
  });

  describe('getNewComponents', () => {
    it('should return empty arrays when no manifest exists', async () => {
      createMockProject(projectDir, {
        packageJson: { name: 'test-project' },
      });

      const result = await managementService.getNewComponents(projectDir);

      expect(result.newAgents).toEqual([]);
      expect(result.newMcpServers).toEqual([]);
    });

    it('should return empty arrays when manifest has no availableAtInstall', async () => {
      createMockProject(projectDir, {
        packageJson: { name: 'test-project' },
      });

      // Write a manifest without availableAtInstall (older installs)
      fs.writeFileSync(
        path.join(projectDir, '.dev-suite-manifest.json'),
        JSON.stringify({
          version: '1.0.0',
          installedAt: new Date().toISOString(),
          projectPath: projectDir,
          agents: ['typescript-expert'],
          mcpServers: ['documentation'],
          features: {},
          files: [],
          upgradeHistory: [],
        })
      );

      const result = await managementService.getNewComponents(projectDir);

      expect(result.newAgents).toEqual([]);
      expect(result.newMcpServers).toEqual([]);
    });

    it('should detect new agents added after installation', async () => {
      createMockProject(projectDir, {
        packageJson: { name: 'test-project' },
      });

      // Simulate a manifest where only 'typescript-expert' existed at install time,
      // and it was installed. The current catalog has 'typescript-expert' AND 'vitest-expert'
      // (from the mock dev-suite dir), so 'vitest-expert' should be detected as new.
      fs.writeFileSync(
        path.join(projectDir, '.dev-suite-manifest.json'),
        JSON.stringify({
          version: '1.0.0',
          installedAt: new Date().toISOString(),
          projectPath: projectDir,
          agents: ['typescript-expert'],
          mcpServers: ['documentation'],
          features: {},
          files: [],
          upgradeHistory: [],
          availableAtInstall: {
            agents: ['typescript-expert'],  // vitest-expert didn't exist yet
            mcpServers: ['documentation', 'api-tester'],
          },
        })
      );

      const result = await managementService.getNewComponents(projectDir);

      // vitest-expert is in the current catalog but NOT in availableAtInstall
      expect(result.newAgents.length).toBe(1);
      expect(result.newAgents[0].id).toBe('vitest-expert');
    });

    it('should not surface skipped agents (existed at install but not chosen)', async () => {
      createMockProject(projectDir, {
        packageJson: { name: 'test-project' },
      });

      // Both agents existed at install time, user chose only typescript-expert
      fs.writeFileSync(
        path.join(projectDir, '.dev-suite-manifest.json'),
        JSON.stringify({
          version: '1.0.0',
          installedAt: new Date().toISOString(),
          projectPath: projectDir,
          agents: ['typescript-expert'],
          mcpServers: ['documentation'],
          features: {},
          files: [],
          upgradeHistory: [],
          availableAtInstall: {
            agents: ['typescript-expert', 'vitest-expert'],  // both existed
            mcpServers: ['documentation', 'api-tester'],
          },
        })
      );

      const result = await managementService.getNewComponents(projectDir);

      // vitest-expert was available at install time, so it's "skipped", not "new"
      expect(result.newAgents).toEqual([]);
      expect(result.newMcpServers).toEqual([]);
    });

    it('should not surface agents that are already installed', async () => {
      createMockProject(projectDir, {
        packageJson: { name: 'test-project' },
      });

      // vitest-expert was added after install BUT the user already installed it
      fs.writeFileSync(
        path.join(projectDir, '.dev-suite-manifest.json'),
        JSON.stringify({
          version: '1.0.0',
          installedAt: new Date().toISOString(),
          projectPath: projectDir,
          agents: ['typescript-expert', 'vitest-expert'],  // already installed
          mcpServers: ['documentation'],
          features: {},
          files: [],
          upgradeHistory: [],
          availableAtInstall: {
            agents: ['typescript-expert'],  // vitest-expert was new
            mcpServers: ['documentation', 'api-tester'],
          },
        })
      );

      const result = await managementService.getNewComponents(projectDir);

      // vitest-expert is new but already installed, so not surfaced
      expect(result.newAgents).toEqual([]);
    });

    it('should detect new MCP servers added after installation', async () => {
      createMockProject(projectDir, {
        packageJson: { name: 'test-project' },
      });

      // api-tester didn't exist at install time
      fs.writeFileSync(
        path.join(projectDir, '.dev-suite-manifest.json'),
        JSON.stringify({
          version: '1.0.0',
          installedAt: new Date().toISOString(),
          projectPath: projectDir,
          agents: ['typescript-expert'],
          mcpServers: ['documentation'],
          features: {},
          files: [],
          upgradeHistory: [],
          availableAtInstall: {
            agents: ['typescript-expert', 'vitest-expert'],
            mcpServers: ['documentation'],  // api-tester didn't exist yet
          },
        })
      );

      const result = await managementService.getNewComponents(projectDir);

      expect(result.newMcpServers.length).toBe(1);
      expect(result.newMcpServers[0].id).toBe('api-tester');
    });
  });

  describe('edge cases', () => {
    it('should handle project without .claude directory', async () => {
      const emptyDir = createTempDir('empty-');
      try {
        const components = await managementService.getInstalledComponents(emptyDir);

        expect(components.agents).toEqual([]);
        expect(components.mcpServers).toEqual([]);
      } finally {
        cleanupTempDir(emptyDir);
      }
    });

    it('should handle malformed .dev-suite.json', async () => {
      createMockProject(projectDir, {
        packageJson: { name: 'test-project' },
        files: {
          '.dev-suite.json': 'invalid json',
        },
      });

      // Should not throw
      const components = await managementService.getInstalledComponents(projectDir);

      expect(components).toBeDefined();
    });
  });
});
