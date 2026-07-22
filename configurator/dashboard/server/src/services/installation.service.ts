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
import { DEFAULT_TARGET, type TargetId } from './targets/target-layout.js';
import { targetPaths, type TargetPaths } from './targets/target-paths.js';
import type { InstallPlan, McpServerEntry } from './targets/target-adapter.js';
import { getAdapter } from './targets/adapters/index.js';
import { AgentsService } from './agents.service.js';
import {
  validatePathWithinBase,
  validateEntryName,
  getDevSuiteDir,
  calculateFileHashFromPath,
  copyDirSync,
  getServerEnvVars,
  updateInstructions,
  cleanInstructionsSections,
  removePathScopedRules,
} from './installation/index.js';

const logger = getLogger('InstallationService');

// Constants
const TIMEOUTS = {
  NPM_INSTALL: 120000,
  COMMAND_DEFAULT: 60000,
};

export class InstallationService {
  private agentsService = new AgentsService();

  /**
   * Resolve the on-disk layout of a target inside a project. Every path this
   * service writes goes through here — see services/targets/target-layout.ts.
   */
  private paths(projectPath: string, target: TargetId = DEFAULT_TARGET): TargetPaths {
    return targetPaths(projectPath, target);
  }

  /**
   * Prepare (build) MCP servers
   */
  async prepareServers(servers: string[]): Promise<{ prepared: string[]; failed: string[] }> {
    const devSuiteDir = getDevSuiteDir();
    const mcpRoot = path.join(devSuiteDir, 'mcp-servers');
    const prepared: string[] = [];
    const failed: string[] = [];

    // Skip npm install if all requested servers are already built (e.g. Electron packaged app)
    const allBuilt = servers.length === 0 || servers.every(name =>
      fs.existsSync(path.join(mcpRoot, name, 'dist', 'index.js'))
    );

    if (!allBuilt && !fs.existsSync(path.join(mcpRoot, 'node_modules'))) {
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
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    const { agents, mcpServers: requestedMcpServers, envVars, rules = [], detectedStack } = config;
    const devSuiteDir = getDevSuiteDir();

    // Auto-include MCP servers marked `isDefault: true` in their metadata
    // (dev-suite built-in capabilities, currently `skill-loader`). Skipped
    // when the caller explicitly asks for `skillLoadingMode='eager'` —
    // that's the escape hatch for environments without DEV_SUITE_ROOT
    // (CI, containers). Eager mode copies all skills locally so the MCP
    // runtime fallback isn't needed.
    const mcpServers = [...requestedMcpServers];
    const allowAutoInclude = config.skillLoadingMode !== 'eager';
    if (allowAutoInclude) {
      const allServers = await this.agentsService.getMcpServers();
      for (const meta of allServers) {
        if (meta.isDefault && !mcpServers.includes(meta.name)) {
          mcpServers.push(meta.name);
          logger.info('Auto-included default MCP server', { context: { name: meta.name } });
        }
      }
    }

    // Lazy is the default whenever `skill-loader` is in the install set
    // (now automatic via `isDefault`). Explicit `'eager'` still wins.
    let skillLoadingMode: 'eager' | 'lazy' = config.skillLoadingMode ?? 'eager';
    if (config.skillLoadingMode === undefined && mcpServers.includes('skill-loader')) {
      skillLoadingMode = 'lazy';
    }

    // Which assistants to write config for. Empty/omitted keeps the historical
    // single-target behaviour. Every target must have an adapter (getAdapter
    // throws otherwise); the request schema already rejects unimplemented ones,
    // and this guards direct service callers.
    const targets: TargetId[] = config.targets?.length ? [...config.targets] : [DEFAULT_TARGET];

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
      targets,
    };

    // Legacy manifest for backward compatibility
    const manifest: InstallManifest = {
      version: '1.0.0',
      installedAt: new Date().toISOString(),
      projectPath,
      agents: [],
      mcpServers: [],
      rules: [],
      files: [],
    };

    // ---- Plan complete. Nothing above this line touches disk. ----

    // The catalog is read before the write phase so adapters can resolve agent
    // metadata (for routing sections and path-scoped rules) without re-reading
    // it, and so the snapshot below reflects the same catalog the install saw.
    const allAgents = await this.agentsService.getAgents();
    const allMcpServers = await this.agentsService.getMcpServers();

    const plan: InstallPlan = {
      projectPath,
      devSuiteDir,
      agents,
      mcpServers,
      rules,
      envVars: envVars ?? {},
      skillLoadingMode,
      detectedStack,
      agentCatalog: allAgents,
    };

    // ---- Target-neutral writes ----
    // MCP server bundles are plain node packages; only the config file that
    // *references* them differs per assistant, so they are installed once here
    // (under the target-independent `.mcp-servers/`) rather than by each adapter.
    const bundlePaths = this.paths(projectPath);
    fs.mkdirSync(bundlePaths.mcpServersDir, { recursive: true });
    const mcpServerEntries = this.installMcpServerBundles(
      plan, bundlePaths, manifest, extendedManifest
    );

    // ---- Per-target writes ----
    // One adapter per selected assistant, each writing into its own layout. For
    // a single target this is exactly the previous behaviour.
    const ruleFiles: string[] = [];
    let validatorHookConfigured = false;
    for (const target of targets) {
      const adapter = getAdapter(target);
      const writeResult = await adapter.write({
        plan,
        paths: this.paths(projectPath, target),
        mcpServers: mcpServerEntries,
        manifest,
        extendedManifest,
      });
      ruleFiles.push(...writeResult.ruleFiles);
      validatorHookConfigured = validatorHookConfigured || writeResult.validatorHookConfigured;
      for (const skipped of writeResult.skipped) {
        logger.info('Target does not support a primitive — skipped', {
          context: { target: adapter.id, ...skipped },
        });
      }
    }

    // The installed agents are the same set regardless of target (they are
    // physically written once and read by every assistant), so resolve them
    // from the accumulated manifest rather than any single adapter's result.
    const installedAgents = allAgents.filter(a => manifest.agents.includes(a.id));

    // ---- Target-neutral finalization ----
    const devSuiteConfig = {
      version: manifest.version,
      installedAt: manifest.installedAt,
      agents: { enabled: manifest.agents },
      mcpServers: { enabled: manifest.mcpServers },
      rules: { enabled: manifest.rules },
    };
    const devSuiteJsonPath = path.join(projectPath, '.dev-suite.json');
    fs.writeFileSync(devSuiteJsonPath, JSON.stringify(devSuiteConfig, null, 2));
    manifest.files.push({ path: '.dev-suite.json', type: 'config', source: 'generated' });
    this.trackFile(extendedManifest, projectPath, '.dev-suite.json', 'config');

    // Record catalog snapshot for new-component detection
    extendedManifest.availableAtInstall = {
      agents: allAgents.map(a => a.id),
      mcpServers: allMcpServers.map(s => s.name),
    };
    extendedManifest.installedRuleFiles = ruleFiles;

    // Write instructions: AGENTS.md holds the shared section, CLAUDE.md imports it
    const instructionFiles = updateInstructions(projectPath, {
      agents: installedAgents,
      detectedStack,
      validatorHookConfigured,
    });
    for (const file of instructionFiles) {
      // Legacy manifest has no 'generated' type; 'config' is its closest match.
      manifest.files.push({ path: file, type: 'config', source: 'generated' });
      this.trackFile(extendedManifest, projectPath, file, 'generated', 'generated');
    }

    // The manifest is written once, last: it is the record of everything above,
    // so writing it earlier would describe a state that may not have been reached.
    const manifestPath = path.join(projectPath, '.dev-suite-manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(extendedManifest, null, 2));

    return manifest;
  }

  /**
   * Copy the MCP server bundles into the project and resolve their launch
   * entries. Target-neutral: the bundles are plain node packages, and only the
   * config file referencing them varies per assistant.
   */
  private installMcpServerBundles(
    plan: InstallPlan,
    paths: TargetPaths,
    manifest: InstallManifest,
    extendedManifest: ExtendedManifest
  ): Record<string, McpServerEntry> {
    const entries: Record<string, McpServerEntry> = {};

    for (const serverName of plan.mcpServers) {
      const installed = this.installMcpServer(
        serverName, plan.projectPath, plan.devSuiteDir, manifest, extendedManifest
      );
      if (installed) {
        manifest.mcpServers.push(serverName);
        extendedManifest.mcpServers.push(serverName);
        entries[serverName] = {
          command: 'node',
          args: [paths.mcpServerEntry(serverName)],
          env: getServerEnvVars(serverName, plan.envVars, plan.devSuiteDir),
        };
      }
    }

    // Lazy mode adds the skill-loader entry so the assistant can fetch skill
    // bodies at runtime. It points at the LOCAL copy under `.mcp-servers/`,
    // not the dev-suite source, so the project stays portable.
    //
    // The skill-loader self-resolves its skills directory from
    // <packageDir>/skills/ (auto-bundled at build time). DEV_SUITE_ROOT is
    // injected ONLY when the user explicitly provided one (development
    // override against a live dev-suite source).
    if (plan.skillLoadingMode === 'lazy') {
      const skillLoaderDist = paths.mcpServerEntry('skill-loader');
      const userOverride = plan.envVars.DEV_SUITE_ROOT?.trim();
      entries['skill-loader'] = {
        command: 'node',
        args: [skillLoaderDist],
        env: userOverride ? { DEV_SUITE_ROOT: userOverride } : {},
      };
      logger.info('Lazy skill loading enabled — skill-loader MCP server added', {
        context: { skillLoaderDist, devSuiteRootOverride: userOverride ?? null },
      });
    }

    return entries;
  }

  /**
   * Uninstall dev-suite from a project
   */
  async uninstall(projectPath: string): Promise<{ removed: string[]; errors: string[] }> {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    const removed: string[] = [];
    const errors: string[] = [];

    // Read manifest (may be either InstallManifest or ExtendedManifest on disk)
    const manifestPath = path.join(projectPath, '.dev-suite-manifest.json');
    let manifest: (InstallManifest & { installedRuleFiles?: string[] }) | null = null;

    if (fs.existsSync(manifestPath)) {
      try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as InstallManifest & { installedRuleFiles?: string[] };
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

    // Remove path-scoped rule files tracked by dev-suite
    const ruleFiles = manifest?.installedRuleFiles ?? [];
    if (ruleFiles.length > 0) {
      const ruleResult = removePathScopedRules(projectPath, ruleFiles);
      removed.push(...ruleResult.removed);
      errors.push(...ruleResult.errors);
    }

    // Remove directories. The rules directory is deliberately absent: rule
    // files are removed individually above (removePathScopedRules) so that
    // user-authored rules sharing the directory survive an uninstall.
    const paths = this.paths(projectPath);
    const dirsToRemove = [
      paths.relMcpServersDir,
      paths.relAgentsDir,
      paths.relSkillsDir,
      paths.relCommandsDir,
      '.kb-cache',
    ];
    for (const dir of dirsToRemove) {
      const dirPath = paths.abs(dir);
      if (fs.existsSync(dirPath)) {
        try {
          fs.rmSync(dirPath, { recursive: true, force: true });
          removed.push(dir);
        } catch (e) {
          errors.push(`Failed to remove ${dir}: ${e}`);
        }
      }
    }

    // Remove the target's config dir if we emptied it
    const configDir = paths.configDir;
    if (fs.existsSync(configDir)) {
      try {
        const contents = fs.readdirSync(configDir);
        if (contents.length === 0) {
          fs.rmdirSync(configDir);
          removed.push(paths.relConfigDir);
        }
      } catch (error: unknown) {
        logger.warn('Failed to remove empty target config directory', {
          error,
          context: { configDir }
        });
      }
    }

    // Remove config files
    const configFiles = ['.dev-suite.json', '.dev-suite-manifest.json', paths.relMcpConfigFile];
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

    // Clean the dev-suite section from every instructions file we wrote
    cleanInstructionsSections(projectPath);
    removed.push(`${paths.relSharedInstructionsFile} (dev-suite section)`);
    removed.push(`${paths.relInstructionsFile} (dev-suite section)`);

    return { removed, errors };
  }

  /**
   * Get installation status
   */
  async getStatus(projectPath: string): Promise<{ installed: boolean; manifest?: InstallManifest }> {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
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
   * Track a file with hash in the extended manifest.
   *
   * `target` records which assistant the file belongs to so that erase and
   * reinstall stay scoped when several assistants share one project.
   */
  private trackFile(
    extendedManifest: ExtendedManifest,
    projectPath: string,
    relativePath: string,
    type: TrackedFile['type'],
    source?: string,
    target: TargetId = DEFAULT_TARGET
  ): void {
    const fullPath = path.join(projectPath, relativePath);
    const hash = calculateFileHashFromPath(fullPath);

    if (hash) {
      extendedManifest.files.push({
        path: relativePath,
        hash,
        type,
        source,
        target,
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

    const paths = this.paths(projectPath);
    const serverSource = path.join(devSuiteDir, 'mcp-servers', serverName);
    const serverDest = paths.mcpServerDir(serverName);

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
      manifest.files.push({ path: paths.relMcpServerDir(serverName), type: 'mcp-server', source: serverSource });

      // Track main server file with hash
      if (extendedManifest) {
        const indexPath = `${paths.relMcpServerDir(serverName)}/dist/index.js`;
        this.trackFile(extendedManifest, projectPath, indexPath, 'mcp-server', serverSource);
      }

      // NO npm install here — by design. Each server's `dist/index.js` is a
      // SELF-CONTAINED esbuild bundle (see mcp-servers/scripts/bundle.mjs):
      // every third-party dependency is inlined at dev-suite build time, and
      // the bundler fails the build if any non-builtin dep is left external
      // (except known optional native add-ons the libraries degrade without).
      // So the copied server needs nothing but Node to run. This removes the
      // previous runtime dependency on network + a resolvable `npm` — the
      // exact step that failed silently inside the packaged Electron app and
      // left servers crashing with ERR_MODULE_NOT_FOUND. New/updated
      // components that pull in new deps get them bundled at build time, so
      // install / reinstall / upgrade never touch npm for MCP servers.

      return true;
    } catch (error: unknown) {
      logger.error('Failed to install MCP server', {
        error,
        context: { serverName, projectPath, serverDest }
      });
      return false;
    }
  }
}
