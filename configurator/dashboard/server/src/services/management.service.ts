// SPDX-License-Identifier: MIT
/**
 * Management Service
 *
 * Manages installed components, updates, and configuration.
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import type { ExtendedManifest, TrackedFile, NewComponentsResult } from '../types/upgrade.js';
import { AgentsService } from './agents.service.js';
import { readJsonSync } from '../utils/fs-utils.js';
import { createHash } from 'crypto';
import { resolveProjectPath, PathValidationError } from '../utils/utilities.js';
import { parseAgentSkills, flattenSkillName, toInstalledAgentContent } from './installation/file-operations.js';
import { validatePathWithinBase } from './installation/index.js';
import { targetPaths } from './targets/target-paths.js';
import { InstallationService } from './installation.service.js';
import { recoverEnvVars, recoverSkillLoadingMode } from './installation/install-recovery.js';
import { resolveProjectTargets } from './installation/uninstall.js';
import { assertValidComponentId } from './installation/security-helpers.js';
import { withProjectLock } from './installation/project-lock.js';
import { getDevSuiteDir } from '../utils/dev-suite-dir.js';
import { getLogger } from '../utils/logger.js';

const logger = getLogger('ManagementService');

const MANIFEST_FILENAME = '.dev-suite-manifest.json';

// Constants
const TIMEOUTS = {
  GIT_FETCH: 30000,
  GIT_PULL: 60000,
  NPM_INSTALL: 120000,
  COMMAND_DEFAULT: 60000,
};

export class ManagementService {
  private agentsService = new AgentsService();
  private installationService = new InstallationService();

  /**
   * Load project manifest
   */
  private loadManifest(projectPath: string): ExtendedManifest | null {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    const manifestPath = path.join(projectPath, MANIFEST_FILENAME);
    return readJsonSync<ExtendedManifest>(manifestPath);
  }

  /**
   * Save project manifest
   */
  private saveManifest(projectPath: string, manifest: ExtendedManifest): boolean {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    const manifestPath = path.join(projectPath, MANIFEST_FILENAME);
    try {
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Calculate SHA256 hash of file content
   */
  private calculateFileHash(filePath: string): string | null {
    if (filePath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    try {
      const content = fs.readFileSync(filePath);
      return createHash('sha256').update(content).digest('hex');
    } catch {
      return null;
    }
  }

  /**
   * Get installed components from a project
   */
  async getInstalledComponents(projectPath: string): Promise<{ agents: string[]; mcpServers: string[] }> {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    const result = { agents: [] as string[], mcpServers: [] as string[] };

    // Read from .dev-suite.json
    const devSuiteJsonPath = path.join(projectPath, '.dev-suite.json');
    if (fs.existsSync(devSuiteJsonPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(devSuiteJsonPath, 'utf-8'));
        result.agents = config.agents?.enabled || [];
        result.mcpServers = config.mcpServers?.enabled || [];
      } catch (error: unknown) {
        // Config file exists but invalid - log warning and continue with file system scan
        logger.warn('Failed to parse .dev-suite.json, falling back to file system scan', { error });
      }
    }

    // Verify against file system
    const paths = targetPaths(projectPath);
    const agentsDir = paths.agentsDir;
    if (fs.existsSync(agentsDir)) {
      const actualAgents = fs.readdirSync(agentsDir)
        .filter((f) => f.endsWith('.md'))
        .map((f) => f.replace('.md', ''));
      result.agents = actualAgents;
    }

    const mcpServersDir = paths.mcpServersDir;
    if (fs.existsSync(mcpServersDir)) {
      const actualServers = fs.readdirSync(mcpServersDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => d.name);
      result.mcpServers = actualServers;
    }

    return result;
  }

  /**
   * Add an agent to the project
   */
  async addAgent(projectPath: string, agentId: string): Promise<void> {
    return withProjectLock(projectPath, 'add-agent', () =>
      this.addAgentUnlocked(projectPath, agentId)
    );
  }

  private async addAgentUnlocked(projectPath: string, agentId: string): Promise<void> {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    agentId = assertValidComponentId(agentId, 'agent ID');
    const devSuiteDir = getDevSuiteDir();
    const agentFile = this.findAgentFile(path.join(devSuiteDir, 'agents'), agentId + '.md');

    if (!agentFile) {
      throw new Error(`Agent ${agentId} not found in dev-suite`);
    }

    const paths = targetPaths(projectPath);
    const agentsDir = paths.agentsDir;
    const skillsDir = paths.skillsDir;
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.mkdirSync(skillsDir, { recursive: true });

    // Copy skills (eager — copy the agent's full skill set) as FLAT top-level
    // dirs, the only shape Claude Code resolves by name.
    const agentContent = fs.readFileSync(agentFile, 'utf-8');
    const skills = parseAgentSkills(agentContent, agentId);
    const skillsSource = path.join(devSuiteDir, 'skills');

    const installedFlat: string[] = [];
    for (const skillPath of skills) {
      if (!/^[a-zA-Z0-9_.\/-]+$/.test(skillPath)) throw new Error('Invalid skill path');
      // validatePathWithinBase returns the validated path (and rejects traversal,
      // which the regex above does not) — use the returned values in the fs sinks.
      const safeSrc = validatePathWithinBase(path.join(skillsSource, skillPath), skillsSource, false);
      if (!fs.existsSync(safeSrc)) continue;
      const flatName = flattenSkillName(skillPath);
      if (!flatName) continue;
      const safeDest = validatePathWithinBase(path.join(skillsDir, flatName), skillsDir, false);
      if (!fs.existsSync(safeDest)) {
        this.copyDirSync(safeSrc, safeDest);
      }
      if (!installedFlat.includes(flatName)) installedFlat.push(flatName);
    }

    // Write the agent with Claude-Code-native frontmatter (tools/mcpServers/
    // flat skills) so tool restrictions + skill preload take effect.
    const destPath = validatePathWithinBase(path.join(agentsDir, agentId + '.md'), agentsDir, false);
    fs.writeFileSync(
      destPath,
      toInstalledAgentContent(agentContent, { installedSkillFlatNames: installedFlat, grantSkillTool: true }),
      'utf-8'
    );

    // Update .dev-suite.json
    this.updateDevSuiteConfig(projectPath, (config) => {
      if (!config.agents.enabled.includes(agentId)) {
        config.agents.enabled.push(agentId);
      }
    });

    // Update .dev-suite-manifest.json
    const manifest = this.loadManifest(projectPath);
    if (manifest) {
      if (!manifest.agents) {
        manifest.agents = [];
      }
      if (!manifest.agents.includes(agentId)) {
        manifest.agents.push(agentId);
      }

      // Track the new file
      if (!manifest.files) {
        manifest.files = [];
      }
      const relativePath = paths.relAgentFile(agentId);
      const hash = this.calculateFileHash(destPath);
      if (hash) {
        const trackedFile: TrackedFile = {
          path: relativePath,
          hash,
          type: 'agent',
          source: agentFile,
        };
        // Remove existing entry if any
        manifest.files = manifest.files.filter(
          (f: TrackedFile) => f.path !== relativePath
        );
        manifest.files.push(trackedFile);
      }

      this.saveManifest(projectPath, manifest);
    }

    // Update CLAUDE.md with agent routing
    await this.resyncTargets(projectPath);
  }

  /**
   * Remove an agent from the project
   */
  async removeAgent(projectPath: string, agentId: string): Promise<void> {
    return withProjectLock(projectPath, 'remove-agent', () =>
      this.removeAgentUnlocked(projectPath, agentId)
    );
  }

  private async removeAgentUnlocked(projectPath: string, agentId: string): Promise<void> {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    agentId = assertValidComponentId(agentId, 'agent ID');
    const paths = targetPaths(projectPath);
    const agentPath = paths.agentFile(agentId);

    if (!fs.existsSync(agentPath)) {
      throw new Error(`Agent ${agentId} not found`);
    }

    fs.unlinkSync(agentPath);

    // Update .dev-suite.json
    this.updateDevSuiteConfig(projectPath, (config) => {
      config.agents.enabled = config.agents.enabled.filter((a: string) => a !== agentId);
    });

    // Update .dev-suite-manifest.json
    const manifest = this.loadManifest(projectPath);
    if (manifest) {
      if (manifest.agents) {
        manifest.agents = manifest.agents.filter((a: string) => a !== agentId);
      }
      if (manifest.files) {
        const relativePath = paths.relAgentFile(agentId);
        manifest.files = manifest.files.filter(
          (f: TrackedFile) => f.path !== relativePath
        );
      }
      this.saveManifest(projectPath, manifest);
    }

    // Update CLAUDE.md with agent routing
    await this.resyncTargets(projectPath);
  }

  /**
   * Add an MCP server to the project.
   *
   * Delegates to a full resync, the same way add/removeAgent already do.
   *
   * This used to be the one write into a user's project that bypassed the whole
   * target layer: it copied the bundle by hand, ran `npm install` (which the
   * installer never does — bundles are self-contained esbuild output), then
   * JSON.parse'd and rewrote `.mcp.json` directly. In a Cursor- or Gemini-only
   * project that wrote a Claude Code config no selected assistant reads, left
   * the real config untouched, and recorded nothing in the manifest — so
   * uninstall could not remove it and reinstall could not see it.
   */
  async addMcpServer(projectPath: string, serverName: string, envVars: Record<string, string> = {}): Promise<void> {
    return withProjectLock(projectPath, 'add-mcp-server', () =>
      this.addMcpServerUnlocked(projectPath, serverName, envVars)
    );
  }

  private async addMcpServerUnlocked(projectPath: string, serverName: string, envVars: Record<string, string> = {}): Promise<void> {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    serverName = assertValidComponentId(serverName, 'server name');

    const devSuiteDir = getDevSuiteDir();
    const serverSource = path.join(devSuiteDir, 'mcp-servers', serverName);
    if (!fs.existsSync(serverSource)) {
      throw new Error(`MCP server ${serverName} not found in dev-suite`);
    }
    if (!fs.existsSync(path.join(serverSource, 'dist', 'index.js'))) {
      throw new Error(`MCP server ${serverName} not built. Run prepareServers first.`);
    }

    const installed = await this.getInstalledComponents(projectPath);
    const next = installed.mcpServers.includes(serverName)
      ? installed.mcpServers
      : [...installed.mcpServers, serverName];

    this.updateDevSuiteConfig(projectPath, (config) => {
      if (!config.mcpServers.enabled.includes(serverName)) {
        config.mcpServers.enabled.push(serverName);
      }
    });

    await this.resyncTargets(projectPath, { mcpServers: next, envVars });
  }

  /**
   * Remove an MCP server from the project.
   *
   * Mirror of addMcpServer: the resync re-runs the adapters, which un-merge the
   * entry from every selected assistant's config and update the manifest.
   */
  async removeMcpServer(projectPath: string, serverName: string): Promise<void> {
    return withProjectLock(projectPath, 'remove-mcp-server', () =>
      this.removeMcpServerUnlocked(projectPath, serverName)
    );
  }

  private async removeMcpServerUnlocked(projectPath: string, serverName: string): Promise<void> {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    serverName = assertValidComponentId(serverName, 'server name');

    const paths = targetPaths(projectPath);
    const serverDir = paths.mcpServerDir(serverName);
    if (!fs.existsSync(serverDir)) {
      throw new Error(`MCP server ${serverName} not found`);
    }

    const installed = await this.getInstalledComponents(projectPath);
    const next = installed.mcpServers.filter((s) => s !== serverName);

    // Remove the bundle first so the filesystem and the intended set agree; the
    // adapters then drop the entry from every assistant's config by merge.
    fs.rmSync(serverDir, { recursive: true, force: true });

    this.updateDevSuiteConfig(projectPath, (config) => {
      config.mcpServers.enabled = config.mcpServers.enabled.filter((s: string) => s !== serverName);
    });

    await this.resyncTargets(projectPath, { mcpServers: next });
  }

  /**
   * Get new components available since the project was installed.
   * Compares the current agent/MCP catalog against the catalog snapshot
   * recorded at install time to identify truly new components.
   */
  async getNewComponents(projectPath: string): Promise<NewComponentsResult> {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    const manifest = this.loadManifest(projectPath);

    // If no manifest or no catalog snapshot (older installs), return empty to avoid false positives
    if (!manifest?.availableAtInstall) {
      return { newAgents: [], newMcpServers: [] };
    }

    const { availableAtInstall, agents: installedAgents, mcpServers: installedMcpServers } = manifest;

    // Get the current full catalog
    const allAgents = await this.agentsService.getAgents();
    const allMcpServers = await this.agentsService.getMcpServers();

    // New agents: in current catalog, NOT in availableAtInstall, NOT already installed
    const newAgents = allAgents
      .filter(a =>
        !availableAtInstall.agents.includes(a.id) &&
        !installedAgents.includes(a.id)
      )
      .map(a => ({
        id: a.id,
        name: a.name,
        description: a.description,
        category: a.category,
      }));

    // New MCP servers: same logic
    const newMcpServers = allMcpServers
      .filter(s =>
        !availableAtInstall.mcpServers.includes(s.name) &&
        !installedMcpServers.includes(s.name)
      )
      .map(s => ({
        id: s.name,
        name: s.name,
        description: s.shortDescription || s.description,
        category: s.category,
      }));

    return { newAgents, newMcpServers };
  }

  /**
   * Check for dev-suite updates
   */
  async checkForUpdates(): Promise<{
    hasUpdates: boolean;
    changes?: string[];
    summary?: {
      newAgents: number;
      newMcpServers: number;
      updatedAgents: number;
      updatedSkills: number;
    };
  }> {
    const devSuiteDir = getDevSuiteDir();

    try {
      const fetchResult = spawnSync('git', ['fetch', 'origin'], {
        cwd: devSuiteDir, stdio: 'pipe', timeout: TIMEOUTS.GIT_FETCH, shell: false,
      });
      if (fetchResult.status !== 0) throw new Error(fetchResult.stderr?.toString() || 'git fetch failed');

      const behindCountResult = spawnSync('git', ['rev-list', '--count', 'HEAD..origin/main'], {
        cwd: devSuiteDir, encoding: 'utf-8', shell: false,
      });
      if (behindCountResult.status !== 0) throw new Error('git rev-list failed');
      const behindCount = (behindCountResult.stdout as string).trim();

      if (parseInt(behindCount) === 0) {
        return { hasUpdates: false };
      }

      const diffResult = spawnSync('git', ['diff', '--name-only', 'HEAD..origin/main'], {
        cwd: devSuiteDir, encoding: 'utf-8', shell: false,
      });
      if (diffResult.status !== 0) throw new Error('git diff failed');
      const diffOutput = diffResult.stdout as string;

      const changes = diffOutput.trim().split('\n').filter((f) => f);

      // Parse changed files to produce a semantic summary
      const summary = {
        newAgents: 0,
        newMcpServers: 0,
        updatedAgents: 0,
        updatedSkills: 0,
      };

      for (const file of changes) {
        if (file.match(/^agents\/.*\.md$/)) {
          // Could be new or updated agent — count generically as updated
          summary.updatedAgents++;
        } else if (file.match(/^mcp-servers\/[^/]+\/metadata\.json$/)) {
          summary.newMcpServers++;
        } else if (file.match(/^skills\//)) {
          summary.updatedSkills++;
        }
      }

      return {
        hasUpdates: true,
        changes,
        summary,
      };
    } catch (e) {
      throw new Error(`Failed to check for updates: ${e}`);
    }
  }

  /**
   * Pull dev-suite updates
   */
  async pullUpdates(): Promise<{ updated: boolean; changes?: string[] }> {
    const devSuiteDir = getDevSuiteDir();

    try {
      const stashResult = spawnSync('git', ['stash'], { cwd: devSuiteDir, stdio: 'pipe', shell: false });
      if (stashResult.status !== 0) throw new Error('git stash failed');

      const pullResult = spawnSync('git', ['pull', 'origin', 'main'], {
        cwd: devSuiteDir,
        encoding: 'utf-8',
        timeout: TIMEOUTS.GIT_PULL,
        shell: false,
      });
      if (pullResult.status !== 0) throw new Error((pullResult.stderr as string) || 'git pull failed');

      const changes = (pullResult.stdout as string).trim().split('\n').filter((l) => l);

      return {
        updated: true,
        changes,
      };
    } catch (e) {
      throw new Error(`Failed to pull updates: ${e}`);
    }
  }

  // ========== Private methods ==========

  private findAgentFile(dir: string, filename: string): string | null {
    if (dir.includes('..')) throw new PathValidationError('Path traversal not allowed');
    if (!fs.existsSync(dir)) return null;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const result = this.findAgentFile(fullPath, filename);
        if (result) return result;
      } else if (entry.name === filename) {
        return fullPath;
      }
    }
    return null;
  }

  private copyDirSync(src: string, dest: string): void {
    if (src.includes('..') || dest.includes('..')) throw new Error('Path traversal not allowed');
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        if (!['node_modules', '.git'].includes(entry.name)) {
          this.copyDirSync(srcPath, destPath);
        }
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  private updateDevSuiteConfig(projectPath: string, updater: (config: { agents: { enabled: string[] }; mcpServers: { enabled: string[] } }) => void): void {
    if (projectPath.includes('..')) throw new Error('Path traversal not allowed');
    const devSuiteJsonPath = path.join(projectPath, '.dev-suite.json');
    let config = {
      agents: { enabled: [] as string[] },
      mcpServers: { enabled: [] as string[] },
    };

    if (fs.existsSync(devSuiteJsonPath)) {
      try {
        config = JSON.parse(fs.readFileSync(devSuiteJsonPath, 'utf-8'));
      } catch (error: unknown) {
        // Config file exists but invalid - log warning and use default
        logger.warn('Failed to parse .dev-suite.json, using default config', { error });
      }
    }

    updater(config);
    fs.writeFileSync(devSuiteJsonPath, JSON.stringify(config, null, 2));
  }

  /**
   * Re-run the install for the project's own targets after a Manage-tab change.
   *
   * This used to write `.claude/agents` and then call `updateInstructions` and
   * nothing else — no adapter ran. So adding an agent on a Gemini install left
   * `.gemini/agents/` untouched and the skills mirror stale: the dashboard said
   * "installed" while the agent did not exist in Gemini at all. Removing one
   * left `.cursor/rules/frontend.mdc` still recommending a deleted agent.
   *
   * Delegating to `install()` also stops `updateInstructions` from creating a
   * `CLAUDE.md` in a project deliberately installed without Claude Code, since
   * the target list is now honoured.
   */
  private async resyncTargets(
    projectPath: string,
    /**
     * Overrides for a change that is not yet reflected on disk.
     *
     * `getInstalledComponents` prefers the filesystem over `.dev-suite.json`, so
     * a server being *added* is not discoverable until the bundle is copied —
     * which is `install()`'s job. The caller states the intended set instead.
     */
    overrides: { mcpServers?: string[]; envVars?: Record<string, string> } = {}
  ): Promise<void> {
    if (projectPath.includes('..')) throw new Error('Path traversal not allowed');

    const manifest = this.loadManifest(projectPath);
    const targets = resolveProjectTargets(projectPath, manifest);
    const installed = await this.getInstalledComponents(projectPath);
    const devSuiteJson = readJsonSync<{ rules?: { enabled?: string[] } }>(
      path.join(projectPath, '.dev-suite.json')
    );

    await this.installationService.install({
      projectPath,
      agents: installed.agents,
      mcpServers: overrides.mcpServers ?? installed.mcpServers,
      rules: devSuiteJson?.rules?.enabled ?? [],
      envVars: {
        ...recoverEnvVars(projectPath, targets),
        ...(overrides.envVars ?? {}),
      },
      skillLoadingMode: recoverSkillLoadingMode(projectPath, targets),
      // Omitted, not cleared: install() carries the stored stack forward.
      detectedStack: undefined,
      targets,
    });
  }


}
