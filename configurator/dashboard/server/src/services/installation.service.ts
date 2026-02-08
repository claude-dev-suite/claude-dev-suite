// SPDX-License-Identifier: MIT
/**
 * Installation Service
 *
 * Handles dev-suite installation, uninstallation, and server preparation.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getLogger } from '../utils/logger.js';
import { resolveProjectPath, PathValidationError } from '../utils/utilities.js';
import { execSync, execFileSync } from 'child_process';
import type { InstallConfig, InstallManifest } from '../types.js';
import type { TrackedFile, ExtendedManifest, StackInfo } from '../types/index.js';
import { AgentsService } from './agents.service.js';
import { HooksService } from './hooks.service.js';
import {
  validatePathWithinBase,
  validateEntryName,
  validateAgentId,
  validateSkillPath,
  getDevSuiteDir,
  calculateFileHashFromPath,
  copyDirSync,
  findAgentFile,
  parseAgentSkills,
  getServerEnvVars,
  updateClaudeMd,
  cleanClaudeMdSection,
} from './installation/index.js';

const logger = getLogger('InstallationService');

// Constants
const TIMEOUTS = {
  NPM_INSTALL: 120000,
  COMMAND_DEFAULT: 60000,
};

export class InstallationService {
  private agentsService = new AgentsService();
  private hooksService = new HooksService();

  /**
   * Prepare (build) MCP servers
   */
  async prepareServers(servers: string[]): Promise<{ prepared: string[]; failed: string[] }> {
    const devSuiteDir = getDevSuiteDir();
    const mcpRoot = path.join(devSuiteDir, 'mcp-servers');
    const prepared: string[] = [];
    const failed: string[] = [];

    // Install dependencies if needed
    if (!fs.existsSync(path.join(mcpRoot, 'node_modules'))) {
      try {
        execSync('npm ci', { cwd: mcpRoot, stdio: 'pipe', timeout: TIMEOUTS.NPM_INSTALL });
      } catch (error: unknown) {
        logger.warn('npm ci failed, falling back to npm install', {
          error,
          context: { mcpRoot }
        });
        try {
          execSync('npm install', { cwd: mcpRoot, stdio: 'pipe', timeout: TIMEOUTS.NPM_INSTALL });
        } catch (e) {
          throw new Error(`Failed to install MCP dependencies: ${e}`);
        }
      }
    }

    for (const serverName of servers) {
      // SECURITY: Validate serverName before interpolating into shell command
      if (!validateEntryName(serverName)) {
        logger.warn('Invalid server name in prepareMcpServers', { context: { serverName } });
        failed.push(serverName);
        continue;
      }

      const serverDir = path.join(mcpRoot, serverName);
      const distPath = path.join(serverDir, 'dist', 'index.js');

      if (!fs.existsSync(serverDir)) {
        failed.push(serverName);
        continue;
      }

      // Already built
      if (fs.existsSync(distPath)) {
        prepared.push(serverName);
        continue;
      }

      try {
        execFileSync('npm', ['run', 'build', `--workspace=${serverName}`], {
          cwd: mcpRoot,
          stdio: 'pipe',
          timeout: TIMEOUTS.COMMAND_DEFAULT,
          shell: process.platform === 'win32',
        });

        if (fs.existsSync(distPath)) {
          prepared.push(serverName);
        } else {
          failed.push(serverName);
        }
      } catch (error: unknown) {
        logger.warn('Failed to build MCP server', {
          error,
          context: { serverName }
        });
        failed.push(serverName);
      }
    }

    return { prepared, failed };
  }

  /**
   * Install dev-suite into a project
   */
  async install(config: InstallConfig): Promise<InstallManifest> {
    let { projectPath } = config;
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    const { agents, mcpServers, envVars, detectedStack } = config;
    const devSuiteDir = getDevSuiteDir();

    // Create extended manifest with hash tracking for upgrade system
    const extendedManifest: ExtendedManifest = {
      version: '1.0.0',
      installedAt: new Date().toISOString(),
      projectPath,
      detectedStack: detectedStack ? this.normalizeStackInfo(detectedStack) : undefined,
      agents: [],
      mcpServers: [],
      features: {},
      files: [],
      upgradeHistory: [],
    };

    // Legacy manifest for backward compatibility
    const manifest: InstallManifest = {
      version: '1.0.0',
      installedAt: new Date().toISOString(),
      projectPath,
      agents: [],
      mcpServers: [],
      files: [],
    };

    // Create directories
    const claudeDir = path.join(projectPath, '.claude');
    const agentsDir = path.join(claudeDir, 'agents');
    const skillsDir = path.join(claudeDir, 'skills');
    const mcpServersDir = path.join(projectPath, '.mcp-servers');

    fs.mkdirSync(agentsDir, { recursive: true });
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.mkdirSync(mcpServersDir, { recursive: true });

    // Install agents
    for (const agentId of agents) {
      const installed = this.installAgent(agentId, projectPath, devSuiteDir, manifest, extendedManifest);
      if (installed) {
        manifest.agents.push(agentId);
        extendedManifest.agents.push(agentId);
      }
    }

    // Install MCP servers
    const mcpConfig: Record<string, { command: string; args: string[]; env: Record<string, string> }> = {};

    for (const serverName of mcpServers) {
      const installed = this.installMcpServer(serverName, projectPath, devSuiteDir, manifest, extendedManifest);
      if (installed) {
        manifest.mcpServers.push(serverName);
        extendedManifest.mcpServers.push(serverName);
        mcpConfig[serverName] = {
          command: 'node',
          args: [path.join(projectPath, '.mcp-servers', serverName, 'dist', 'index.js')],
          env: getServerEnvVars(serverName, envVars, devSuiteDir),
        };
      }
    }

    // Write .mcp.json
    const mcpJsonPath = path.join(projectPath, '.mcp.json');
    fs.writeFileSync(mcpJsonPath, JSON.stringify({ mcpServers: mcpConfig }, null, 2));
    manifest.files.push({ path: '.mcp.json', type: 'config', source: 'generated' });
    this.trackFile(extendedManifest, projectPath, '.mcp.json', 'config');

    // Write .dev-suite.json
    const devSuiteConfig = {
      version: manifest.version,
      installedAt: manifest.installedAt,
      agents: { enabled: manifest.agents },
      mcpServers: { enabled: manifest.mcpServers },
    };
    const devSuiteJsonPath = path.join(projectPath, '.dev-suite.json');
    fs.writeFileSync(devSuiteJsonPath, JSON.stringify(devSuiteConfig, null, 2));
    manifest.files.push({ path: '.dev-suite.json', type: 'config', source: 'generated' });
    this.trackFile(extendedManifest, projectPath, '.dev-suite.json', 'config');

    // Write extended manifest (used by upgrade system)
    const manifestPath = path.join(projectPath, '.dev-suite-manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(extendedManifest, null, 2));

    // Configure integration-validator hook if stack detected
    let validatorHookConfigured = false;
    if (detectedStack) {
      const hookResult = this.hooksService.configureIntegrationValidatorHook(projectPath, detectedStack);
      validatorHookConfigured = hookResult.configured;
      if (hookResult.configured) {
        manifest.files.push({ path: '.claude/settings.json', type: 'config', source: 'generated' });
        this.trackFile(extendedManifest, projectPath, '.claude/settings.json', 'config');
        // Track the integration-validator-hook feature as applied
        extendedManifest.features['integration-validator-hook'] = {
          version: '1.0.0',
          appliedAt: new Date().toISOString(),
        };
        logger.info('Integration validator hook configured', { context: { projectPath } });
      }
    }

    // Record catalog snapshot for new-component detection
    const allAgents = await this.agentsService.getAgents();
    const allMcpServers = await this.agentsService.getMcpServers();
    extendedManifest.availableAtInstall = {
      agents: allAgents.map(a => a.id),
      mcpServers: allMcpServers.map(s => s.name),
    };

    // Re-write extended manifest with catalog snapshot
    fs.writeFileSync(manifestPath, JSON.stringify(extendedManifest, null, 2));

    // Update CLAUDE.md with agent routing instructions and validation workflow
    const installedAgents = allAgents.filter(a => manifest.agents.includes(a.id));
    updateClaudeMd(projectPath, installedAgents, detectedStack, validatorHookConfigured);

    return manifest;
  }

  /**
   * Uninstall dev-suite from a project
   */
  async uninstall(projectPath: string): Promise<{ removed: string[]; errors: string[] }> {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    const removed: string[] = [];
    const errors: string[] = [];

    // Read manifest
    const manifestPath = path.join(projectPath, '.dev-suite-manifest.json');
    let manifest: InstallManifest | null = null;

    if (fs.existsSync(manifestPath)) {
      try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as InstallManifest;
      } catch (error: unknown) {
        logger.warn('Failed to read installation manifest', {
          error,
          context: { manifestPath }
        });
        errors.push('Failed to read manifest');
      }
    }

    // Remove tracked files
    if (manifest?.files) {
      for (const file of manifest.files) {
        // Handle both string format and object format {path: string}
        const filePath = typeof file === 'string' ? file : file.path;
        if (!filePath) continue;

        const fullPath = path.join(projectPath, filePath);
        if (fs.existsSync(fullPath)) {
          try {
            fs.unlinkSync(fullPath);
            removed.push(filePath);
          } catch (e) {
            errors.push(`Failed to remove ${filePath}: ${e}`);
          }
        }
      }
    }

    // Remove directories
    const dirsToRemove = ['.mcp-servers', '.claude/agents', '.claude/skills', '.claude/commands', '.kb-cache'];
    for (const dir of dirsToRemove) {
      const dirPath = path.join(projectPath, dir);
      if (fs.existsSync(dirPath)) {
        try {
          fs.rmSync(dirPath, { recursive: true, force: true });
          removed.push(dir);
        } catch (e) {
          errors.push(`Failed to remove ${dir}: ${e}`);
        }
      }
    }

    // Remove .claude if empty
    const claudeDir = path.join(projectPath, '.claude');
    if (fs.existsSync(claudeDir)) {
      try {
        const contents = fs.readdirSync(claudeDir);
        if (contents.length === 0) {
          fs.rmdirSync(claudeDir);
          removed.push('.claude');
        }
      } catch (error: unknown) {
        logger.warn('Failed to remove empty .claude directory', {
          error,
          context: { claudeDir }
        });
      }
    }

    // Remove config files
    const configFiles = ['.dev-suite.json', '.dev-suite-manifest.json', '.mcp.json'];
    for (const file of configFiles) {
      const filePath = path.join(projectPath, file);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
          removed.push(file);
        } catch (e) {
          errors.push(`Failed to remove ${file}: ${e}`);
        }
      }
    }

    // Clean CLAUDE.md
    cleanClaudeMdSection(projectPath);
    removed.push('CLAUDE.md (dev-suite section)');

    return { removed, errors };
  }

  /**
   * Get installation status
   */
  async getStatus(projectPath: string): Promise<{ installed: boolean; manifest?: InstallManifest }> {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    const manifestPath = path.join(projectPath, '.dev-suite-manifest.json');

    if (!fs.existsSync(manifestPath)) {
      return { installed: false };
    }

    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as InstallManifest;
      return { installed: true, manifest };
    } catch (error: unknown) {
      logger.warn('Failed to read installation manifest', {
        error,
        context: { projectPath, manifestPath }
      });
      return { installed: false };
    }
  }

  // ========== Private methods ==========

  /**
   * Track a file with hash in the extended manifest
   */
  private trackFile(
    extendedManifest: ExtendedManifest,
    projectPath: string,
    relativePath: string,
    type: TrackedFile['type'],
    source?: string
  ): void {
    const fullPath = path.join(projectPath, relativePath);
    const hash = calculateFileHashFromPath(fullPath);

    if (hash) {
      extendedManifest.files.push({
        path: relativePath,
        hash,
        type,
        source,
      });
    }
  }

  /**
   * Normalize detected stack to StackInfo format
   */
  private normalizeStackInfo(detectedStack: {
    projectType?: string;
    frontend?: { framework?: string; metaFramework?: string; runtime?: string; version?: string };
    backend?: { framework?: string; metaFramework?: string; runtime?: string; version?: string };
    database?: { dbType?: string; orm?: string; version?: string };
    testing?: { unit?: string; e2e?: string };
    isMonorepo?: boolean;
    confidence?: number;
  }): StackInfo {
    return {
      projectType: (detectedStack.projectType as StackInfo['projectType']) || 'unknown',
      frontend: detectedStack.frontend ? {
        framework: detectedStack.frontend.framework || '',
        meta_framework: detectedStack.frontend.metaFramework,
        runtime: detectedStack.frontend.runtime,
      } : undefined,
      backend: detectedStack.backend ? {
        framework: detectedStack.backend.framework || '',
        meta_framework: detectedStack.backend.metaFramework,
        runtime: detectedStack.backend.runtime,
      } : undefined,
      database: detectedStack.database ? {
        db_type: detectedStack.database.dbType || '',
        orm: detectedStack.database.orm,
      } : undefined,
      testing: detectedStack.testing,
    };
  }

  private installAgent(
    agentId: string,
    projectPath: string,
    devSuiteDir: string,
    manifest: InstallManifest,
    extendedManifest?: ExtendedManifest
  ): boolean {
    // SECURITY: Validate agentId
    if (!validateAgentId(agentId)) {
      logger.warn('Invalid agent ID - potential path traversal', { context: { agentId } });
      return false;
    }
    // SECURITY: Path traversal check for projectPath
    if (projectPath.includes('..')) {
      logger.warn('Invalid projectPath - path traversal detected', { context: { projectPath } });
      return false;
    }

    const agentFile = findAgentFile(path.join(devSuiteDir, 'agents'), agentId + '.md');
    if (!agentFile) return false;

    try {
      const destPath = path.join(projectPath, '.claude', 'agents', agentId + '.md');

      // SECURITY: Validate paths
      validatePathWithinBase(agentFile, path.join(devSuiteDir, 'agents'), false);
      validatePathWithinBase(destPath, projectPath, false);

      fs.copyFileSync(agentFile, destPath);
      manifest.files.push({ path: `.claude/agents/${agentId}.md`, type: 'agent', source: agentFile });

      // Track with hash for upgrade system
      if (extendedManifest) {
        this.trackFile(extendedManifest, projectPath, `.claude/agents/${agentId}.md`, 'agent', agentFile);
      }

      // Copy skills
      const agentContent = fs.readFileSync(agentFile, 'utf-8');
      const skills = parseAgentSkills(agentContent);
      const skillsSource = path.join(devSuiteDir, 'skills');

      for (const skillPath of skills) {
        // SECURITY: Validate skillPath
        if (!validateSkillPath(skillPath)) {
          logger.warn('Invalid skill path - potential path traversal', { context: { skillPath } });
          continue;
        }

        const srcSkillDir = path.join(skillsSource, skillPath);
        const destSkillDir = path.join(projectPath, '.claude', 'skills', skillPath);

        // SECURITY: Validate paths stay within expected directories
        try {
          validatePathWithinBase(srcSkillDir, skillsSource, false);
          validatePathWithinBase(destSkillDir, path.join(projectPath, '.claude', 'skills'), false);
        } catch {
          logger.warn('Skill path validation failed', { context: { skillPath } });
          continue;
        }

        if (fs.existsSync(srcSkillDir) && !fs.existsSync(destSkillDir)) {
          copyDirSync(srcSkillDir, destSkillDir);
          manifest.files.push({ path: `.claude/skills/${skillPath}`, type: 'skill', source: srcSkillDir });
        }
      }

      return true;
    } catch (error: unknown) {
      logger.warn('Failed to install agent', {
        error,
        context: { agentId, projectPath }
      });
      return false;
    }
  }

  private installMcpServer(
    serverName: string,
    projectPath: string,
    devSuiteDir: string,
    manifest: InstallManifest,
    extendedManifest?: ExtendedManifest
  ): boolean {
    // SECURITY: Validate serverName doesn't contain path traversal
    if (!validateEntryName(serverName)) {
      logger.warn('Invalid server name - potential path traversal', { context: { serverName } });
      return false;
    }
    // SECURITY: Path traversal check for projectPath
    if (projectPath.includes('..')) {
      logger.warn('Invalid projectPath - path traversal detected', { context: { projectPath } });
      return false;
    }

    const serverSource = path.join(devSuiteDir, 'mcp-servers', serverName);
    const serverDest = path.join(projectPath, '.mcp-servers', serverName);

    // SECURITY: Validate paths stay within expected directories
    try {
      validatePathWithinBase(serverSource, path.join(devSuiteDir, 'mcp-servers'), false);
      validatePathWithinBase(serverDest, projectPath, false);
    } catch (error: unknown) {
      logger.warn('Path validation failed for MCP server installation', { error, context: { serverName } });
      return false;
    }

    if (!fs.existsSync(serverSource)) return false;
    if (!fs.existsSync(path.join(serverSource, 'dist', 'index.js'))) return false;

    try {
      copyDirSync(serverSource, serverDest);
      manifest.files.push({ path: `.mcp-servers/${serverName}`, type: 'mcp-server', source: serverSource });

      // Track main server file with hash
      if (extendedManifest) {
        const indexPath = `.mcp-servers/${serverName}/dist/index.js`;
        this.trackFile(extendedManifest, projectPath, indexPath, 'mcp-server', serverSource);
      }

      // Run npm install in production mode
      if (fs.existsSync(path.join(serverDest, 'package.json'))) {
        execSync('npm install --production', {
          cwd: serverDest,
          stdio: 'pipe',
          timeout: TIMEOUTS.NPM_INSTALL,
        });
      }

      return true;
    } catch (error: unknown) {
      logger.warn('Failed to install MCP server', {
        error,
        context: { serverName, projectPath }
      });
      return false;
    }
  }
}
