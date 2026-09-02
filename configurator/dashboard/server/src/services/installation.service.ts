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
import type { DetectionResult, InstallConfig, InstallManifest, InstallSkippedCapability } from '../types.js';
import type { TrackedFile, ExtendedManifest, StackInfo } from '../types/index.js';
import { DEFAULT_TARGET, getTargetLayout, type TargetId } from './targets/target-layout.js';
import { targetPaths, type TargetPaths } from './targets/target-paths.js';
import type { InstallPlan, McpServerEntry } from './targets/target-adapter.js';
import { getAdapter } from './targets/adapters/index.js';
import { AgentsService } from './agents.service.js';
import { SubstrateInstaller } from './installation/substrate.js';
import { withProjectLock } from './installation/project-lock.js';
import {
  classifyPath,
  deleteInstructionsFileIfEmpty,
  instructionsFilesFor,
  manifestTargets,
  removeOwnedTree,
  resolveInsideProject,
  pruneEmptyDirs,
  removeOwnedSkillMirror,
  removeOwnedSkillTree,
  sharedConfigsFor,
  unmergeSharedConfig,
} from './installation/uninstall.js';
import { HooksService } from './hooks.service.js';
import { installCommands } from './installation/commands.js';
import { updateGitignore, removeGitignoreBlock } from './installation/gitignore.js';
import {
  collectSecretEnvNames,
  secretValuesIn,
  splitSecretEnvVars,
  secretEnvStore,
} from './installation/secret-store.js';
import { detectWorktree } from './installation/worktree.js';
import { loadManifest } from './upgrade/upgrade-utils.js';
import { scanDrift } from './installation/drift.service.js';
import { trackManifestFile, carryForwardAcknowledgements } from './installation/manifest-tracking.js';
import {
  readPreviousFileHashes,
  readPreviouslyManagedPaths,
  readPreviousAgentFilesByTarget,
  readPreviouslyManagedMcpServers,
  readPreviousRuleFiles,
  readCarriedForwardState,
} from './installation/managed-file.js';
import {
  snapshotBeforeInstall,
  rollbackInstall,
  discardSnapshot,
  type InstallSnapshot,
} from './installation/write-guard.js';
import {
  validatePathWithinBase,
  validateEntryName,
  getDevSuiteDir,
  copyDirSync,
  getServerEnvVars,
  updateInstructions,
  listCustomAgents,
  cleanInstructionsSections,
  removePathScopedRules,
} from './installation/index.js';

const logger = getLogger('InstallationService');

// Constants
const TIMEOUTS = {
  NPM_INSTALL: 120000,
  COMMAND_DEFAULT: 60000,
};

/**
 * Rebuild the request-shaped DetectionResult from a stored StackInfo.
 *
 * The inverse of `normalizeStackInfo`. Needed because the manifest and the
 * InstallPlan disagree on casing: the manifest stores `meta_framework`/`db_type`
 * and the plan (and every consumer downstream, including the validator hook)
 * reads `metaFramework`/`dbType`.
 */
function denormalizeStackInfo(stored: unknown): DetectionResult | undefined {
  if (!stored || typeof stored !== 'object') return undefined;
  const s = stored as {
    projectType?: string;
    frontend?: { framework?: string; meta_framework?: string; runtime?: string };
    backend?: { framework?: string; meta_framework?: string; runtime?: string };
    database?: { db_type?: string; orm?: string };
    testing?: { unit?: string; e2e?: string };
  };
  return {
    projectType: s.projectType ?? 'unknown',
    frontend: s.frontend
      ? {
          framework: s.frontend.framework,
          metaFramework: s.frontend.meta_framework,
          runtime: s.frontend.runtime,
        }
      : undefined,
    backend: s.backend
      ? {
          framework: s.backend.framework,
          metaFramework: s.backend.meta_framework,
          runtime: s.backend.runtime,
        }
      : undefined,
    database: s.database ? { dbType: s.database.db_type, orm: s.database.orm } : undefined,
    testing: s.testing,
    isMonorepo: false,
    confidence: 0,
  };
}

/**
 * Keys in `.dev-suite.json` that belong to the user, not to the installer.
 *
 * The file is rebuilt from the install request every time, so anything the
 * install does not know about is dropped. `integrationValidation` is the knob
 * the generated AGENTS.md tells people to set, and it was erased by the next
 * install or Sync — one of three independent reasons it never worked.
 *
 * Listed explicitly rather than merged wholesale: a stale `agents` or `targets`
 * array surviving an install is exactly the bug this file's rebuild prevents.
 */
const USER_OWNED_CONFIG_KEYS = ['integrationValidation'] as const;

function readUserOwnedConfigKeys(configPath: string): Record<string, unknown> {
  try {
    if (!fs.existsSync(configPath)) return {};
    const existing = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>;
    const preserved: Record<string, unknown> = {};
    for (const key of USER_OWNED_CONFIG_KEYS) {
      if (existing[key] !== undefined) preserved[key] = existing[key];
    }
    return preserved;
  } catch (error: unknown) {
    logger.warn('Could not read .dev-suite.json to preserve user settings', {
      error,
      context: { configPath },
    });
    return {};
  }
}

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
  /**
   * Install dev-suite into a project.
   *
   * Serialised per project: install/reinstall/add/remove all rewrite the same
   * manifest and the manifest is written last, so two overlapping runs produced
   * a record describing neither. See installation/project-lock.ts.
   */
  async install(config: InstallConfig): Promise<InstallManifest> {
    return withProjectLock(config.projectPath, 'install', () => this.installUnlocked(config));
  }

  private async installUnlocked(config: InstallConfig): Promise<InstallManifest> {
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

    // State an earlier install accumulated. A re-install replaces *files*, not
    // history: zeroing these turned every add/remove-agent into a silent
    // downgrade of the project (see readCarriedForwardState).
    const carried = readCarriedForwardState(projectPath);

    // Create extended manifest with hash tracking for upgrade system
    const extendedManifest: ExtendedManifest = {
      version: '1.0.0',
      installedAt: new Date().toISOString(),
      projectPath,
      // An omitted `detectedStack` means "unchanged", not "none": the Manage-tab
      // resync has no detection result to pass and must not erase the stored one.
      detectedStack: detectedStack
        ? this.normalizeStackInfo(detectedStack)
        : (carried.detectedStack as ExtendedManifest['detectedStack']),
      agents: [],
      mcpServers: [],
      features: carried.features as ExtendedManifest['features'],
      files: [],
      upgradeHistory: carried.upgradeHistory as ExtendedManifest['upgradeHistory'],
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
      // Same "omitted means unchanged" rule as the manifest above, but the plan
      // carries the request shape (camelCase) while the manifest stores
      // StackInfo (snake_case), so the carried value has to be converted back.
      // Without this the Manage-tab resync dropped the integration-validator
      // hook and the API-validation section from AGENTS.md on every add/remove.
      detectedStack: detectedStack ?? denormalizeStackInfo(carried.detectedStack),
      agentCatalog: allAgents,
      // Only what the previous install actually wrote — see the field's doc.
      mcpCatalog: readPreviouslyManagedMcpServers(projectPath),
      targets,
      // Read before the write phase: the manifest is rewritten last, so this is
      // the only chance to learn what the previous install owned.
      previouslyManaged: readPreviouslyManagedPaths(projectPath),
      ...(() => {
        const { hashes, sectionHashes, acknowledged } = readPreviousFileHashes(projectPath);
        return {
          previousFileHashes: hashes,
          previousSectionHashes: sectionHashes,
          acknowledgedFileHashes: acknowledged,
        };
      })(),
      previousAgentFiles: readPreviousAgentFilesByTarget(projectPath),
    };

    // ---- What changed under us since the last install ----
    // writeManagedFile() refuses to clobber a drifted file and backs it up, but
    // a run that quietly preserves half a dozen files would otherwise look like
    // a clean install. Scanning before the write phase gives the log (and the
    // Manage tab, via GET /api/reinstall/drift) something to say.
    const preWriteDrift = scanDrift(projectPath, loadManifest(projectPath));
    if (preWriteDrift.hasActionableDrift) {
      logger.warn('Managed files changed since the last install; they will be preserved, not overwritten', {
        context: {
          projectPath,
          drifted: preWriteDrift.drifted.map(entry => entry.path),
        },
      });
    }

    // ---- Backup before the first byte is written ----
    // The manifest is written last, so a throw part-way through used to leave
    // files on disk with no record of them and `getStatus()` reporting
    // "not installed" over a half-installed project.
    let snapshot: InstallSnapshot | undefined;
    if (config.createBackup !== false) {
      try {
        snapshot = snapshotBeforeInstall(projectPath, targets);
      } catch (error: unknown) {
        throw new Error(
          `Backup failed, install aborted: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    try {
      // ---- Target-neutral writes ----
      // MCP server bundles are plain node packages; only the config file that
      // *references* them differs per assistant, so they are installed once here
      // (under the target-independent `.mcp-servers/`) rather than by each adapter.
      const bundlePaths = this.paths(projectPath);
      fs.mkdirSync(bundlePaths.mcpServersDir, { recursive: true });
      const mcpServerEntries = this.installMcpServerBundles(
        plan, bundlePaths, manifest, extendedManifest
      );

      // The `.claude/agents` + `.claude/skills` substrate is shared: Copilot and
      // Cursor read it directly, so it is written once here regardless of which
      // assistants were selected — not owned by the Claude Code target.
      new SubstrateInstaller().install(plan, manifest, extendedManifest);

      // Slash commands are Claude-Code-only (no other assistant reads
      // `.claude/commands`, and none of them share its format), so this is a
      // no-op unless claude-code was selected.
      installCommands(plan, manifest, extendedManifest);

      // ---- Per-target writes ----
      // One adapter per selected assistant, each writing into its own layout. For
      // a single target this is exactly the previous behaviour.
      // Rule files are collected WITH the adapter that wrote them. A flat list
      // lost that, so every rule file was later tracked under the default target
      // — `.cursor/rules/frontend.mdc` recorded as `claude-code`. Reinstall
      // classifies by `file.target`, so those files fell outside drift
      // detection, outside the per-file "keep my version" opt-out, and outside
      // the target-scoped backup.
      const ruleFilesByTarget: Array<{ relPath: string; target: TargetId; drifted?: boolean }> = [];
      const skippedCapabilities: InstallSkippedCapability[] = [];
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
        const driftedRules = new Set(writeResult.driftedRuleFiles ?? []);
        for (const relPath of writeResult.ruleFiles) {
          ruleFilesByTarget.push({ relPath, target: adapter.id, drifted: driftedRules.has(relPath) });
        }
        validatorHookConfigured = validatorHookConfigured || writeResult.validatorHookConfigured;
        for (const skipped of writeResult.skipped) {
          skippedCapabilities.push({ target: adapter.id, ...skipped });
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
        // The user's assistant selection belongs with the rest of their
        // selection. It used to live only in the manifest, so losing that file
        // silently downgraded the project to `[DEFAULT_TARGET]`: a Cursor-only
        // install came back as Claude Code, writing CLAUDE.md and .mcp.json into
        // a project that had deliberately opted out of both.
        targets,
      };
      const devSuiteJsonPath = path.join(projectPath, '.dev-suite.json');
      // `.dev-suite.json` is rebuilt from the install request, so any key the
      // user edited by hand was silently dropped on the next install or Sync.
      // `integrationValidation` is the one the docs tell people to set, and it
      // was erased every time. Carry forward what the install does not own.
      const preservedConfig = readUserOwnedConfigKeys(devSuiteJsonPath);
      fs.writeFileSync(
        devSuiteJsonPath,
        JSON.stringify({ ...devSuiteConfig, ...preservedConfig }, null, 2)
      );
      manifest.files.push({ path: '.dev-suite.json', type: 'config', source: 'generated' });
      this.trackFile(extendedManifest, projectPath, '.dev-suite.json', 'config');

      // Record catalog snapshot for new-component detection
      extendedManifest.availableAtInstall = {
        agents: allAgents.map(a => a.id),
        mcpServers: allMcpServers.map(s => s.name),
      };
      // Rule files from a previous install that this one no longer writes —
      // a deselected agent's category, or a target that was dropped — used to
      // stay on disk forever: the field was *assigned*, not merged, so the old
      // paths simply vanished from the record and nothing could remove them.
      const previousRuleFiles = readPreviousRuleFiles(projectPath);
      const ruleFiles = ruleFilesByTarget.map(r => r.relPath);
      const stillWritten = new Set(ruleFiles);
      const staleRuleFiles = previousRuleFiles.filter(f => !stillWritten.has(f));
      if (staleRuleFiles.length > 0) {
        const staleResult = removePathScopedRules(projectPath, staleRuleFiles);
        logger.info('Removed rule files this install no longer writes', {
          context: { removed: staleResult.removed, errors: staleResult.errors },
        });
      }
      extendedManifest.installedRuleFiles = ruleFiles;

      // Rule files are tracked like every other written file, so reinstall's
      // preview can spot a local edit and the per-file "keep my version"
      // opt-out can protect it. Only `installedRuleFiles` recorded them before,
      // and that list is invisible to drift detection.
      for (const { relPath, target, drifted } of ruleFilesByTarget) {
        // A drifted rule file stays in the manifest — otherwise the stale prune
        // above deletes the file this run deliberately preserved — but it is
        // recorded at the hash we last wrote, so it keeps reporting as drifted
        // until someone decides.
        this.trackFile(
          extendedManifest, projectPath, relPath, 'config', 'generated', target,
          drifted ? plan.previousFileHashes?.get(relPath) : undefined
        );
      }

      // Keep the credentials the user typed in the wizard, and the local
      // backups, out of version control. Two of the MCP configs dev-suite
      // writes are files teams routinely commit.
      // Deliberately NOT tracked in `manifest.files`: that list is the uninstall
      // delete-set, and `.gitignore` is the user's file. Uninstall strips only
      // dev-suite's marked block from it.
      // Persist the credentials outside the repo before anything is ignored:
      // the store is what a worktree, a fresh clone or a later sync recovers
      // from. Reading them back out of the MCP configs was the only mechanism,
      // and it silently wiped every credential when those configs were absent.
      const secretEnvNames = collectSecretEnvNames(devSuiteDir);
      secretEnvStore.merge(projectPath, splitSecretEnvVars(envVars ?? {}, secretEnvNames).secrets);

      // Ignore only the configs that actually carry a secret value. The old
      // test was "any env var has a value", so setting a port or a branch name
      // was enough to hide whole assistant configs (.codex/config.toml,
      // .gemini/settings.json) from git.
      updateGitignore(projectPath, targets, secretValuesIn(envVars ?? {}, secretEnvNames));

      // Write instructions: AGENTS.md holds the shared section (every Tier 1
      // assistant reads it natively). The CLAUDE.md import pointer is written only
      // when Claude Code is a selected target — it is the one assistant that needs
      // the shim, and writing it for a Copilot-only install would be noise.
      const instructionFiles = updateInstructions(projectPath, {
        agents: installedAgents,
        // Agents the user wrote themselves are part of the routing too. Without
        // this a fresh install — and the Manage-tab resync that now delegates to
        // one — regenerated the section from the catalog alone and dropped them.
        customAgents: listCustomAgents(projectPath),
        detectedStack,
        validatorHookConfigured,
        targets,
      });
      for (const file of instructionFiles) {
        // Legacy manifest has no 'generated' type; 'config' is its closest match.
        manifest.files.push({ path: file, type: 'config', source: 'generated' });
        this.trackFile(extendedManifest, projectPath, file, 'generated', 'generated');
      }

      // Degradations reach the caller and the manifest, not just the log. The
      // whole point of the capability contract is that nothing is dropped
      // silently, and a `logger.info` nobody reads is silent in practice.
      if (skippedCapabilities.length > 0) {
        manifest.skipped = skippedCapabilities;
        extendedManifest.skipped = skippedCapabilities;
      }

      // An edit the user adopted (`promote`) is recorded on the previous
      // manifest. Rebuilding the manifest from scratch would drop it, so every
      // install from the wizard or the Manage tab would re-flag the same file.
      carryForwardAcknowledgements(loadManifest(projectPath)?.files, extendedManifest);

      // The manifest is written once, last: it is the record of everything above,
      // so writing it earlier would describe a state that may not have been reached.
      const manifestPath = path.join(projectPath, '.dev-suite-manifest.json');
      fs.writeFileSync(manifestPath, JSON.stringify(extendedManifest, null, 2));


    } catch (error: unknown) {
      if (snapshot) {
        rollbackInstall(projectPath, snapshot);
        logger.error('Install failed and was rolled back; the project is unchanged', { error });
      } else {
        logger.error('Install failed with no backup taken; the project may be partially written', { error });
      }
      throw error;
    }

    if (snapshot) discardSnapshot(snapshot);

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
    return withProjectLock(projectPath, 'uninstall', () => this.uninstallUnlocked(projectPath));
  }

  private async uninstallUnlocked(
    projectPath: string
  ): Promise<{ removed: string[]; errors: string[] }> {
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

    const targets = manifestTargets(manifest as { targets?: unknown } | null);
    const managedServers = manifest?.mcpServers ?? [];

    // Strip the dev-suite section out of the instructions files FIRST, so the
    // emptiness test below can tell a file that was only ours from one that
    // carries the user's prose.
    cleanInstructionsSections(projectPath);
    for (const rel of instructionsFilesFor(targets)) {
      if (deleteInstructionsFileIfEmpty(projectPath, rel)) removed.push(rel);
      else removed.push(`${rel} (dev-suite section)`);
    }

    if (removeGitignoreBlock(projectPath)) {
      removed.push('.gitignore (dev-suite block)');
    }

    // Integration validation lives in settings.json as hook entries, plus two
    // scripts and a marker file. None of that was ever removed: un-merging only
    // knew about `skillListingBudgetFraction`, so an uninstalled project kept a
    // Stop/PostToolUse hook pointing at scripts that no longer existed — and,
    // before 2.0, kept firing a model call per subagent forever.
    if (targets.includes('claude-code')) {
      try {
        const hooks = new HooksService();
        const outcome = hooks.removeIntegrationValidatorHook(projectPath);
        if (outcome.success) removed.push('.claude/hooks (integration validation)');
        else if (outcome.error) errors.push(`Failed to remove integration validation: ${outcome.error}`);
      } catch (e) {
        errors.push(`Failed to remove integration validation: ${e}`);
      }
    }

    // Un-merge every config file dev-suite shares with the user: remove our own
    // entries, keep theirs, and delete the file only when nothing of theirs is
    // left. Never a blanket unlink — these files hold the user's own MCP
    // servers, Codex model, Gemini theme and Claude permissions.
    for (const spec of sharedConfigsFor(targets)) {
      try {
        const outcome = unmergeSharedConfig(projectPath, spec, managedServers);
        if (outcome === 'deleted') removed.push(spec.rel);
        else if (outcome === 'rewritten') removed.push(`${spec.rel} (dev-suite entries)`);
      } catch (e) {
        errors.push(`Failed to un-merge ${spec.rel}: ${e}`);
      }
    }

    // Remove files dev-suite created outright. Shared files are handled above;
    // `custom/` is never touched; and every path is bounds-checked because a
    // manifest is data read off disk and may be hostile or corrupt.
    const trackedPaths = new Set(
      (manifest?.files ?? [])
        .map(f => (typeof f === 'string' ? f : f.path))
        .filter((p): p is string => Boolean(p))
        .map(p => p.split(path.sep).join('/'))
    );
    const sharedHandled = new Set([
      ...instructionsFilesFor(targets),
      ...sharedConfigsFor(targets).map(s => s.rel),
    ]);
    if (manifest?.files) {
      for (const file of manifest.files) {
        // Handle both string format and object format {path: string}
        const filePath = typeof file === 'string' ? file : file.path;
        if (!filePath) continue;

        const normalized = filePath.split(path.sep).join('/');
        if (sharedHandled.has(normalized)) continue;
        if (classifyPath(normalized, targets) === 'custom') continue;

        const fullPath = resolveInsideProject(projectPath, filePath);
        if (!fullPath) {
          errors.push(`Refused to remove ${filePath}: path escapes the project`);
          continue;
        }
        // Skill *directories* are tracked too (they have no hash, so they used
        // to be dropped from the manifest entirely). The tree walkers below own
        // their removal — unlinking a directory here just raises EPERM.
        if (fs.existsSync(fullPath)) {
          if (fs.statSync(fullPath).isDirectory()) continue;
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

    // Remove the directories dev-suite owns. Walked file by file rather than
    // `rmSync({recursive:true})`: the agents and skills directories also hold
    // the user's `custom/` area and anything else they put there, and a
    // recursive delete took all of it with no backup.
    const paths = this.paths(projectPath);
    const notCustom = { isPreserved: (rel: string) => classifyPath(rel, targets) === 'custom' };
    const trees: { removed: string[]; preserved: string[] }[] = [
      // Owned outright: everything under these is dev-suite's.
      removeOwnedTree(projectPath, paths.relMcpServersDir, notCustom),
      removeOwnedTree(projectPath, '.kb-cache', notCustom),
      // Shared with the user: only what the manifest recorded is removed.
      removeOwnedTree(projectPath, paths.relAgentsDir, {
        ...notCustom,
        isOwnedChild: rel => trackedPaths.has(rel),
      }),
      // Skill trees carry an ownership sentinel; a folder without one is the
      // user's or another tool's.
      removeOwnedSkillTree(projectPath, paths.relSkillsDir, manifest),
      removeOwnedSkillMirror(projectPath, manifest),
    ];
    for (const result of trees) {
      removed.push(...result.removed);
      for (const kept of result.preserved) {
        logger.info('Preserved path dev-suite does not own', { context: { path: kept } });
      }
    }

    // Directories dev-suite created that are now hollow, because their files
    // were removed individually so user content could survive.
    removed.push(...pruneEmptyDirs(projectPath, [
      paths.relCommandsDir,
      paths.relRulesDir,
      ...targets.map(t => getTargetLayout(t).agentsDir).filter((d): d is string => Boolean(d)),
      ...targets.map(t => getTargetLayout(t).rulesDir).filter((d): d is string => Boolean(d)),
    ]));

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

    // The credentials live outside the project, so nothing in the walk above
    // touches them. Un-merging `.mcp.json` used to remove the only copy on
    // disk; with the store, an uninstall that leaves it behind means a later
    // Sync silently resurrects credentials the user thought they had removed.
    try {
      secretEnvStore.clear(projectPath);
      removed.push('~/.dev-suite/env (stored credentials)');
    } catch (e) {
      errors.push(`Failed to clear the stored credentials: ${e}`);
    }

    // Remove dev-suite's own bookkeeping last: if anything above threw, the
    // manifest is still on disk and the uninstall can be retried.
    const configFiles = ['.dev-suite.json', '.dev-suite-manifest.json'];
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

    return { removed, errors };
  }

  /**
   * Get installation status
   */
  async getStatus(projectPath: string): Promise<{
    installed: boolean;
    manifest?: InstallManifest;
    /**
     * Set when this checkout is a linked git worktree. A worktree only contains
     * *tracked* files, so an install whose MCP config is gitignored is simply
     * not there — agents run against a project with no dev-suite at all. Saying
     * so lets the caller offer to materialize it instead of degrading mutely.
     */
    worktree?: ReturnType<typeof detectWorktree>;
  }> {
    if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
    const manifestPath = path.join(projectPath, '.dev-suite-manifest.json');

    if (!fs.existsSync(manifestPath)) {
      return { installed: false };
    }

    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as InstallManifest;
      const worktree = detectWorktree(projectPath);
      return { installed: true, manifest, ...(worktree.isWorktree ? { worktree } : {}) };
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
    target: TargetId = DEFAULT_TARGET,
    /** See {@link trackManifestFile}: records a baseline instead of the current bytes. */
    hashOverride?: string
  ): void {
    // Delegate rather than push directly: the shared tracker also computes the
    // `sectionHash` for files carrying the dev-suite markers. Without it
    // AGENTS.md and CLAUDE.md have no baseline for their generated section, so
    // drift inside the markers can never be detected.
    trackManifestFile(extendedManifest, projectPath, relativePath, type, source, target, hashOverride);
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
