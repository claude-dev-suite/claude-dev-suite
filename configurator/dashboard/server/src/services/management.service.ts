// SPDX-License-Identifier: MIT
/**
 * Management Service
 *
 * Manages installed components, updates, and configuration.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import type { Agent } from '../types.js';
import type { ExtendedManifest, TrackedFile, NewComponentsResult } from '../types/upgrade.js';
import { AgentsService } from './agents.service.js';
import { readJsonSync } from '../utils/fs-utils.js';
import { createHash } from 'crypto';
import { resolveProjectPath, PathValidationError } from '../utils/utilities.js';

const MANIFEST_FILENAME = '.dev-suite-manifest.json';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Constants
const DEV_SUITE_START_MARKER = '<!-- DEV-SUITE-CONFIG-START -->';
const DEV_SUITE_END_MARKER = '<!-- DEV-SUITE-CONFIG-END -->';
const TIMEOUTS = {
  GIT_FETCH: 30000,
  GIT_PULL: 60000,
  NPM_INSTALL: 120000,
  COMMAND_DEFAULT: 60000,
};

function getDevSuiteDir(): string {
  // Use DEV_SUITE_DIR env var if set (Electron packaged mode)
  if (process.env.DEV_SUITE_DIR) {
    const raw = process.env.DEV_SUITE_DIR;
    // SECURITY: validate the env var value before trusting it
    const resolved = path.resolve(raw);
    if (!path.isAbsolute(resolved)) {
      throw new Error('DEV_SUITE_DIR must be an absolute path');
    }
    if (resolved.includes('..')) {
      throw new Error('DEV_SUITE_DIR must not contain path traversal sequences');
    }
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      throw new Error(`DEV_SUITE_DIR does not point to an existing directory: ${resolved}`);
    }
    return resolved;
  }
  // Fallback: Navigate from server/src/services to dev-suite root (development)
  return path.resolve(__dirname, '..', '..', '..', '..', '..');
}

export class ManagementService {
  private agentsService = new AgentsService();

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
        console.warn('Failed to parse .dev-suite.json, falling back to file system scan', error);
      }
    }

    // Verify against file system
    const agentsDir = path.join(projectPath, '.claude', 'agents');
    if (fs.existsSync(agentsDir)) {
      const actualAgents = fs.readdirSync(agentsDir)
        .filter((f) => f.endsWith('.md'))
        .map((f) => f.replace('.md', ''));
      result.agents = actualAgents;
    }

    const mcpServersDir = path.join(projectPath, '.mcp-servers');
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
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    if (!/^[a-zA-Z0-9_.-]+$/.test(agentId)) throw new Error('Invalid agent ID');
    const devSuiteDir = getDevSuiteDir();
    const agentFile = this.findAgentFile(path.join(devSuiteDir, 'agents'), agentId + '.md');

    if (!agentFile) {
      throw new Error(`Agent ${agentId} not found in dev-suite`);
    }

    const agentsDir = path.join(projectPath, '.claude', 'agents');
    const skillsDir = path.join(projectPath, '.claude', 'skills');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.mkdirSync(skillsDir, { recursive: true });

    // Copy agent
    const destPath = path.join(agentsDir, agentId + '.md');
    fs.copyFileSync(agentFile, destPath);

    // Copy skills
    const agentContent = fs.readFileSync(agentFile, 'utf-8');
    const skills = this.parseAgentSkills(agentContent);
    const skillsSource = path.join(devSuiteDir, 'skills');

    for (const skillPath of skills) {
      if (!/^[a-zA-Z0-9_.\/-]+$/.test(skillPath)) throw new Error('Invalid skill path');
      const srcSkillDir = path.join(skillsSource, skillPath);
      const destSkillDir = path.join(skillsDir, skillPath);
      if (fs.existsSync(srcSkillDir) && !fs.existsSync(destSkillDir)) {
        this.copyDirSync(srcSkillDir, destSkillDir);
      }
    }

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
      const relativePath = `.claude/agents/${agentId}.md`;
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
    await this.regenerateClaudeMd(projectPath);
  }

  /**
   * Remove an agent from the project
   */
  async removeAgent(projectPath: string, agentId: string): Promise<void> {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    if (!/^[a-zA-Z0-9_.-]+$/.test(agentId)) throw new Error('Invalid agent ID');
    const agentPath = path.join(projectPath, '.claude', 'agents', agentId + '.md');

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
        const relativePath = `.claude/agents/${agentId}.md`;
        manifest.files = manifest.files.filter(
          (f: TrackedFile) => f.path !== relativePath
        );
      }
      this.saveManifest(projectPath, manifest);
    }

    // Update CLAUDE.md with agent routing
    await this.regenerateClaudeMd(projectPath);
  }

  /**
   * Add an MCP server to the project
   */
  async addMcpServer(projectPath: string, serverName: string, envVars: Record<string, string> = {}): Promise<void> {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    if (!/^[a-zA-Z0-9_.-]+$/.test(serverName)) throw new Error('Invalid server name');
    const devSuiteDir = getDevSuiteDir();
    const serverSource = path.join(devSuiteDir, 'mcp-servers', serverName);

    if (!fs.existsSync(serverSource)) {
      throw new Error(`MCP server ${serverName} not found in dev-suite`);
    }

    if (!fs.existsSync(path.join(serverSource, 'dist', 'index.js'))) {
      throw new Error(`MCP server ${serverName} not built. Run prepareServers first.`);
    }

    const mcpServersDir = path.join(projectPath, '.mcp-servers');
    fs.mkdirSync(mcpServersDir, { recursive: true });

    const serverDest = path.join(mcpServersDir, serverName);
    this.copyDirSync(serverSource, serverDest);

    // Install dependencies
    if (fs.existsSync(path.join(serverDest, 'package.json'))) {
      execSync('npm install --production', {
        cwd: serverDest,
        stdio: 'pipe',
        timeout: TIMEOUTS.NPM_INSTALL,
      });
    }

    // Update .mcp.json
    const mcpJsonPath = path.join(projectPath, '.mcp.json');
    let mcpConfig = { mcpServers: {} as Record<string, unknown> };

    if (fs.existsSync(mcpJsonPath)) {
      mcpConfig = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf-8'));
    }

    mcpConfig.mcpServers[serverName] = {
      command: 'node',
      args: [path.join(projectPath, '.mcp-servers', serverName, 'dist', 'index.js')],
      env: envVars,
    };

    fs.writeFileSync(mcpJsonPath, JSON.stringify(mcpConfig, null, 2));

    // Update .dev-suite.json
    this.updateDevSuiteConfig(projectPath, (config) => {
      if (!config.mcpServers.enabled.includes(serverName)) {
        config.mcpServers.enabled.push(serverName);
      }
    });
  }

  /**
   * Remove an MCP server from the project
   */
  async removeMcpServer(projectPath: string, serverName: string): Promise<void> {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    if (!/^[a-zA-Z0-9_.-]+$/.test(serverName)) throw new Error('Invalid server name');
    const serverDir = path.join(projectPath, '.mcp-servers', serverName);

    if (!fs.existsSync(serverDir)) {
      throw new Error(`MCP server ${serverName} not found`);
    }

    fs.rmSync(serverDir, { recursive: true, force: true });

    // Update .mcp.json
    const mcpJsonPath = path.join(projectPath, '.mcp.json');
    if (fs.existsSync(mcpJsonPath)) {
      const mcpConfig = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf-8'));
      delete mcpConfig.mcpServers[serverName];
      fs.writeFileSync(mcpJsonPath, JSON.stringify(mcpConfig, null, 2));
    }

    // Update .dev-suite.json
    this.updateDevSuiteConfig(projectPath, (config) => {
      config.mcpServers.enabled = config.mcpServers.enabled.filter((s: string) => s !== serverName);
    });
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
      execSync('git fetch origin', { cwd: devSuiteDir, stdio: 'pipe', timeout: TIMEOUTS.GIT_FETCH });

      const behindCount = execSync('git rev-list --count HEAD..origin/main', {
        cwd: devSuiteDir,
        encoding: 'utf-8',
      }).trim();

      if (parseInt(behindCount) === 0) {
        return { hasUpdates: false };
      }

      const diffOutput = execSync('git diff --name-only HEAD..origin/main', {
        cwd: devSuiteDir,
        encoding: 'utf-8',
      });

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
      execSync('git stash', { cwd: devSuiteDir, stdio: 'pipe' });

      const output = execSync('git pull origin main', {
        cwd: devSuiteDir,
        encoding: 'utf-8',
        timeout: TIMEOUTS.GIT_PULL,
      });

      const changes = output.trim().split('\n').filter((l) => l);

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

  private parseAgentSkills(content: string): string[] {
    const skills: string[] = [];
    const skillsMatch = content.match(/^skills:\s*\n((?:\s+-\s+.+\n?)+)/m);
    if (skillsMatch?.[1]) {
      const skillLines = skillsMatch[1].match(/^\s+-\s+(.+)$/gm);
      if (skillLines) {
        for (const line of skillLines) {
          const match = line.match(/^\s+-\s+(.+)$/);
          if (match?.[1]) skills.push(match[1].trim());
        }
      }
    }
    return skills;
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
        console.warn('Failed to parse .dev-suite.json, using default config', error);
      }
    }

    updater(config);
    fs.writeFileSync(devSuiteJsonPath, JSON.stringify(config, null, 2));
  }

  /**
   * Regenerate CLAUDE.md with full agent routing instructions
   */
  private async regenerateClaudeMd(projectPath: string): Promise<void> {
    if (projectPath.includes('..')) throw new Error('Path traversal not allowed');
    const currentAgentIds = (await this.getInstalledComponents(projectPath)).agents;
    const allAgents = await this.agentsService.getAgents();
    const installedAgents = allAgents.filter(a => currentAgentIds.includes(a.id));

    // Get custom agents
    const customAgents = await this.getCustomAgentsList(projectPath);

    this.updateClaudeMd(projectPath, installedAgents, customAgents);
  }

  /**
   * Get list of custom agents from project
   */
  private async getCustomAgentsList(projectPath: string): Promise<Array<{ id: string; name: string; description: string }>> {
    if (projectPath.includes('..')) throw new Error('Path traversal not allowed');
    const customAgentsDir = path.join(projectPath, '.claude', 'agents', 'custom');
    const agents: Array<{ id: string; name: string; description: string }> = [];

    if (!fs.existsSync(customAgentsDir)) {
      return agents;
    }

    try {
      const entries = fs.readdirSync(customAgentsDir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.md')) {
          const filePath = path.join(customAgentsDir, entry.name);
          const content = fs.readFileSync(filePath, 'utf-8');

          // Parse YAML frontmatter
          if (content.startsWith('---')) {
            const endIdx = content.indexOf('---', 3);
            if (endIdx > 0) {
              const frontmatter = content.substring(3, endIdx);
              const nameMatch = frontmatter.match(/^name:\s*["']?([^"'\n]+)["']?/m);
              const descMatch = frontmatter.match(/^description:\s*["']?([^"'\n]+)["']?/m);

              if (nameMatch?.[1]) {
                agents.push({
                  id: entry.name.replace('.md', ''),
                  name: nameMatch[1].trim(),
                  description: descMatch?.[1]?.trim() || `Custom agent: ${nameMatch[1].trim()}`,
                });
              }
            }
          }
        }
      }
    } catch (error) {
      console.warn('Failed to read custom agents', error);
    }

    return agents;
  }

  private updateClaudeMd(
    projectPath: string,
    agents: Agent[],
    customAgents: Array<{ id: string; name: string; description: string }> = []
  ): void {
    if (projectPath.includes('..')) throw new Error('Path traversal not allowed');
    const resolved = resolveProjectPath(projectPath);
    const claudeMdPath = path.join(resolved, 'CLAUDE.md');
    const section = this.generateDevSuiteSection(agents, customAgents);

    if (!fs.existsSync(claudeMdPath)) {
      fs.writeFileSync(claudeMdPath, section + '\n');
      return;
    }

    const content = fs.readFileSync(claudeMdPath, 'utf-8');
    const startIdx = content.indexOf(DEV_SUITE_START_MARKER);
    const endIdx = content.indexOf(DEV_SUITE_END_MARKER);

    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      const before = content.substring(0, startIdx);
      const after = content.substring(endIdx + DEV_SUITE_END_MARKER.length);
      fs.writeFileSync(claudeMdPath, before + section + after);
    } else {
      const separator = content.endsWith('\n') ? '\n' : '\n\n';
      fs.writeFileSync(claudeMdPath, content + separator + '---\n\n' + section + '\n');
    }
  }

  /**
   * Sanitize agent description for safe embedding in CLAUDE.md.
   *
   * Strips constructs that could be used for prompt injection or that would
   * break the surrounding Markdown structure:
   * - Fenced code blocks (``` and ~~~) — could smuggle arbitrary instructions
   * - Bare backtick sequences — can close inline-code spans unexpectedly
   * - HTML comment tags — could hide injected content
   * - Leading "#" characters that would create rogue headings
   * - Newlines are collapsed to a single space so the value stays on one line
   */
  private sanitizeAgentDescription(description: string): string {
    if (!description) return '';
    return description
      // Collapse all newlines / carriage-returns to a single space first
      .replace(/[\r\n]+/g, ' ')
      // Remove fenced code block delimiters (``` and ~~~)
      .replace(/`{3,}/g, '')
      .replace(/~{3,}/g, '')
      // Remove remaining backtick sequences
      .replace(/`+/g, '')
      // Remove HTML comment markers (handle both --> and --!> endings)
      .replace(/<!--[\s\S]*?(?:-->|--!>)/g, '')
      .replace(/<!--/g, '')
      .replace(/(?:-->|--!>)/g, '')
      // Strip leading Markdown heading markers
      .replace(/^#+\s*/g, '')
      // Trim leading/trailing whitespace
      .trim();
  }

  private generateDevSuiteSection(
    agents: Agent[],
    customAgents: Array<{ id: string; name: string; description: string }> = []
  ): string {
    const agentList = agents.length > 0
      ? agents.map((a) => `- \`@${a.id}\``).join('\n')
      : '- No agents installed';

    // Custom agents list
    const customAgentList = customAgents.length > 0
      ? customAgents.map((a) => `- \`@custom:${a.id}\` (Custom)`).join('\n')
      : '';

    // Generate routing instructions based on agent descriptions
    let routingInstructions = '';
    const allAgentsForRouting = [
      ...agents.map((a) => ({ id: a.id, description: this.sanitizeAgentDescription(a.description), isCustom: false })),
      ...customAgents.map((a) => ({ id: `custom:${a.id}`, description: this.sanitizeAgentDescription(a.description), isCustom: true })),
    ];

    if (allAgentsForRouting.length > 0) {
      const routingLines = allAgentsForRouting.map((a) => {
        const suffix = a.isCustom ? ' (Custom)' : '';
        return `- Use \`@${a.id}\` for: ${a.description}${suffix}`;
      });
      routingInstructions = `

## Agent Routing

When working on tasks that match an agent's expertise, you MUST use the appropriate agent. Use the Task tool with the corresponding subagent_type.

${routingLines.join('\n')}

**Important**: Always delegate tasks to the most appropriate specialist agent. Do not attempt to handle specialized tasks directly when a relevant agent is available.`;
    }

    // Build custom agents section
    const customAgentsSection = customAgents.length > 0
      ? `

## Custom Agents

Project-specific custom agents:

${customAgentList}`
      : '';

    return `${DEV_SUITE_START_MARKER}
# Dev-Suite Configuration

## Installed Agents

${agentList}${customAgentsSection}${routingInstructions}

## Commands

- \`/init-project\` - Reconfigure dev-suite
- \`/uninstall-dev-suite\` - Remove dev-suite
${DEV_SUITE_END_MARKER}`;
  }
}
