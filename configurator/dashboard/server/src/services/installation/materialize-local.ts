// SPDX-License-Identifier: MIT
/**
 * Rebuild the local-only half of a dev-suite install in the current checkout.
 *
 * An install produces two kinds of file: the ones a team commits — `AGENTS.md`,
 * `.dev-suite.json`, `.dev-suite-manifest.json`, `.claude/` — and the ones that
 * must stay out of git, because they carry the secret values the wizard
 * collected. A `git worktree` (one per agent, in an isolated fan-out) checks
 * out only the first kind. The assistant then starts with no MCP servers at
 * all, and nothing in the product said so.
 *
 * `materializeLocal()` closes that gap without a re-install: the committed
 * manifest says *which* servers and *which* assistants, the secret store says
 * *what the credentials are*, and the existing writers turn that back into each
 * assistant's config file, byte-for-byte as the install would have written it.
 *
 * What it deliberately does **not** do:
 *  - copy MCP server bundles. Server entries are absolute paths, so a worktree
 *    can point straight at the main checkout's `.mcp-servers/` (see
 *    targets/target-paths.ts `mcpServerEntry()`); duplicating 15 MB per agent
 *    would be pure waste.
 *  - touch agents, skills, rules or instructions. Those are committed content;
 *    if they are missing the project never committed them, and re-deriving them
 *    is an install, not a materialisation.
 *  - invent credentials. With no store entry the config is written *without*
 *    `env`, and that is reported as a skipped capability rather than papered
 *    over — a server that silently starts without its `DATABASE_URL` is worse
 *    than one that is reported as unconfigured.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { getDevSuiteDir } from '../../utils/dev-suite-dir.js';
import { getLogger } from '../../utils/logger.js';
import type { EnvVarConfig } from '../../types.js';
import type { McpServerEntry, SkippedCapability } from '../targets/target-adapter.js';
import {
  DEFAULT_TARGET,
  MCP_SERVERS_DIR,
  getTargetLayout,
  type TargetId,
} from '../targets/target-layout.js';
import {
  writeClaudeCodeMcpConfig,
  writeCopilotCliMcpConfig,
  writeCursorMcpConfig,
  writeKimiMcpConfig,
  writeVsCodeMcpConfig,
  McpConfigParseError,
} from '../targets/writers/mcp-config.writer.js';
import { writeGeminiSettings } from '../targets/writers/gemini-settings.writer.js';
import { writeCodexTomlMcp } from '../targets/writers/codex-toml.writer.js';
import { readExistingConfig } from './mcp-config-file.js';
import { validateEntryName, validatePathWithinBase } from './security-helpers.js';
import { SecretEnvStore, secretEnvStore, collectSecretEnvNames, secretValuesIn } from './secret-store.js';
import { withProjectLock } from './project-lock.js';
import { updateGitignore } from './gitignore.js';
import { detectWorktree } from './worktree.js';
import { recoverEnvVars } from './install-recovery.js';

const logger = getLogger('MaterializeLocal');

export interface MaterializeOptions {
  /** Override the process-wide secret store; tests point this at a temp `$HOME`. */
  store?: SecretEnvStore;
  /**
   * Main checkout to borrow MCP bundles from. Defaults to whatever
   * {@link detectWorktree} resolves.
   */
  mainCheckout?: string;
  /**
   * dev-suite source checkout, used as the last resort for a server's bundle
   * and metadata when neither this project nor the main checkout has them.
   */
  devSuiteDir?: string;
  /**
   * Extra non-secret env values to bake in (e.g. recovered from a sibling
   * config). Store values always win over these.
   */
  extraEnvVars?: Record<string, string>;
}

export interface MaterializeResult {
  /** Project-relative paths written. */
  written: string[];
  /** Capabilities that could not be restored, with the reason. */
  skipped: SkippedCapability[];
  /** MCP server names configured. */
  servers: string[];
  /** Targets whose config was rebuilt. */
  targets: TargetId[];
  /** Whether this checkout is a linked worktree. */
  isWorktree: boolean;
  /** Names (never values) of the secrets injected. */
  secretsApplied: string[];
}

/** The dev-suite checkout, or `undefined` when it cannot be resolved (never throws). */
function resolveDevSuiteDir(): string | undefined {
  try {
    return getDevSuiteDir();
  } catch {
    return undefined;
  }
}

/** Parsed JSON object, or `null`. */
function readJson(file: string): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(file)) return null;
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch (error: unknown) {
    logger.warn('Could not read a dev-suite record', { error, context: { file } });
    return null;
  }
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/**
 * What the committed records say this project installed.
 *
 * `.dev-suite.json` is the user's selection and `.dev-suite-manifest.json` is
 * what was actually written; both are committed, and either alone is enough.
 */
function readInstallRecord(projectPath: string): { targets: TargetId[]; servers: string[] } | null {
  const config = readJson(path.join(projectPath, '.dev-suite.json'));
  const manifest = readJson(path.join(projectPath, '.dev-suite-manifest.json'));
  if (!config && !manifest) return null;

  const targets = [
    ...new Set([
      ...asStringArray(config?.targets),
      ...asStringArray(manifest?.targets),
    ]),
  ] as TargetId[];

  const enabled = (config?.mcpServers as { enabled?: unknown } | undefined)?.enabled;
  const servers = [...new Set([...asStringArray(enabled), ...asStringArray(manifest?.mcpServers)])];

  return {
    // A manifest written before multi-assistant support has no targets field;
    // the rest of the codebase reads that as Claude Code, so this does too.
    targets: targets.length > 0 ? targets : [DEFAULT_TARGET],
    servers: servers.filter(validateEntryName),
  };
}

/**
 * Locate a server's bundle entry point, preferring this checkout, then the main
 * checkout of the worktree, then the dev-suite source.
 *
 * Returns an absolute path — MCP config must never depend on a working
 * directory — or `null` when the bundle exists nowhere reachable.
 */
function resolveServerEntry(
  serverName: string,
  projectPath: string,
  mainCheckout: string | undefined,
  devSuiteDir: string | undefined
): string | null {
  const candidates = [
    path.join(projectPath, MCP_SERVERS_DIR, serverName, 'dist', 'index.js'),
    ...(mainCheckout
      ? [path.join(mainCheckout, MCP_SERVERS_DIR, serverName, 'dist', 'index.js')]
      : []),
    ...(devSuiteDir
      ? [path.join(devSuiteDir, 'mcp-servers', serverName, 'dist', 'index.js')]
      : []),
  ];
  return candidates.find(candidate => fs.existsSync(candidate)) ?? null;
}

/** The env var names a server declares, from whichever copy of its metadata is reachable. */
function resolveServerEnvNames(
  serverName: string,
  projectPath: string,
  mainCheckout: string | undefined,
  devSuiteDir: string | undefined
): string[] | null {
  const candidates = [
    path.join(projectPath, MCP_SERVERS_DIR, serverName, 'metadata.json'),
    ...(mainCheckout ? [path.join(mainCheckout, MCP_SERVERS_DIR, serverName, 'metadata.json')] : []),
    ...(devSuiteDir ? [path.join(devSuiteDir, 'mcp-servers', serverName, 'metadata.json')] : []),
  ];

  for (const candidate of candidates) {
    const metadata = readJson(candidate) as { envVars?: EnvVarConfig[] } | null;
    if (!metadata) continue;
    if (!Array.isArray(metadata.envVars)) return [];
    return metadata.envVars.map(v => v?.name).filter((n): n is string => typeof n === 'string');
  }

  return null;
}

/** Render one target's MCP config, or `null` when the target has no project MCP file. */
function renderFor(
  target: TargetId,
  relPath: string,
  servers: Record<string, McpServerEntry>,
  existing: string | null,
  previouslyManaged: readonly string[]
): string | null {
  const opts = { existing, previouslyManaged, file: relPath };
  switch (target) {
    case 'claude-code':
      return writeClaudeCodeMcpConfig(servers, opts);
    case 'cursor':
      return writeCursorMcpConfig(servers, opts);
    case 'kimi-code':
      return writeKimiMcpConfig(servers, opts);
    case 'gemini':
      return writeGeminiSettings(servers, opts);
    case 'codex':
      return writeCodexTomlMcp(servers, { existing, previouslyManaged });
    case 'copilot':
      return relPath === '.github/mcp.json'
        ? writeCopilotCliMcpConfig(servers, opts)
        : writeVsCodeMcpConfig(servers, opts);
    default:
      return null;
  }
}

/**
 * Rebuild the MCP config of every installed assistant in `projectPath`.
 *
 * Safe to run in a normal checkout: it merges into the existing files exactly
 * as an install does, so running it where nothing is missing is a no-op in
 * content terms.
 */
export async function materializeLocal(
  projectPath: string,
  options: MaterializeOptions = {}
): Promise<MaterializeResult> {
  // Serialised like every other operation that rewrites a project's install.
  // This writes the same MCP config files an install does, so running it while
  // one is in flight produces a file describing neither.
  return withProjectLock(projectPath, 'materialize-local', async () => {
    const result = materializeLocalUnlocked(projectPath, options);

    // These files now hold credentials again. The install pairs every write of
    // them with a .gitignore refresh; doing it in one place and not the other
    // is how a secret ends up in a commit.
    try {
      const devSuiteDir = options.devSuiteDir ?? resolveDevSuiteDir() ?? getDevSuiteDir();
      const secretNames = collectSecretEnvNames(devSuiteDir);
      const values = secretValuesIn(
        (options.store ?? secretEnvStore).read(path.resolve(projectPath)),
        secretNames
      );
      updateGitignore(path.resolve(projectPath), result.targets, values);
    } catch (error: unknown) {
      logger.warn('Materialized the MCP configs but could not refresh .gitignore', { error });
    }

    return result;
  });
}

/** The write itself. Separated so the lock wraps it rather than living inside it. */
function materializeLocalUnlocked(
  projectPath: string,
  options: MaterializeOptions = {}
): MaterializeResult {
  const root = path.resolve(projectPath);
  const store = options.store ?? secretEnvStore;
  const skipped: SkippedCapability[] = [];
  const written: string[] = [];

  const worktree = detectWorktree(root);
  const mainCheckout = options.mainCheckout ?? worktree.mainCheckout;
  const devSuiteDir = options.devSuiteDir ?? resolveDevSuiteDir();

  const record = readInstallRecord(root);
  if (!record) {
    return {
      written,
      skipped: [
        {
          capability: 'mcp',
          reason:
            'neither .dev-suite.json nor .dev-suite-manifest.json is present — nothing describes what to rebuild. Commit them, or run a full install.',
        },
      ],
      servers: [],
      targets: [],
      isWorktree: worktree.isWorktree,
      secretsApplied: [],
    };
  }

  const secrets = store.read(root);

  // Recover what the existing configs already hold before rendering over them.
  // The store is authoritative where it has a value; everything else — the
  // non-secret settings, and a credential from a project that predates the
  // store — would otherwise be erased by our own write.
  let recovered: Record<string, string> = {};
  try {
    recovered = recoverEnvVars(root, record.targets, { store, migrate: false });
  } catch (error: unknown) {
    logger.warn('Could not read existing env values before materializing', { error });
  }

  const envValues: Record<string, string> = {
    ...recovered,
    ...(options.extraEnvVars ?? {}),
    ...secrets,
  };
  const secretsApplied = new Set<string>();

  // ---- Resolve server entries ------------------------------------------
  const entries: Record<string, McpServerEntry> = {};
  for (const serverName of record.servers) {
    const entry = resolveServerEntry(serverName, root, mainCheckout, devSuiteDir);
    if (!entry) {
      skipped.push({
        capability: 'mcp-server',
        reason: `${serverName}: no bundle found in this checkout, the main checkout, or a dev-suite source tree — the server was left out of the config`,
      });
      continue;
    }

    const declaredNames = resolveServerEnvNames(serverName, root, mainCheckout, devSuiteDir);
    const env: Record<string, string> = {};
    if (declaredNames === null) {
      // Without metadata we cannot know which variables belong to this server,
      // and injecting all of them would hand every server the database URL.
      skipped.push({
        capability: 'mcp-env',
        reason: `${serverName}: metadata.json is not reachable, so its environment variables could not be resolved; the server is configured without env`,
      });
    } else {
      for (const name of declaredNames) {
        const value = envValues[name];
        if (typeof value === 'string' && value.length > 0) {
          env[name] = value;
          if (name in secrets) secretsApplied.add(name);
        } else if (name in secrets) {
          // Unreachable in practice, kept explicit: a stored-but-empty secret.
          skipped.push({
            capability: 'mcp-env',
            reason: `${serverName}: ${name} is stored but empty`,
          });
        }
      }

      const missingSecrets = declaredNames.filter(
        name => !(name in envValues) && !(name in env)
      );
      if (missingSecrets.length > 0) {
        skipped.push({
          capability: 'mcp-env',
          reason: `${serverName}: no secrets are stored for this project (~/.dev-suite/env), so ${missingSecrets.join(', ')} could not be restored; the server is configured without them`,
        });
      }
    }

    entries[serverName] = { command: 'node', args: [entry], env };
  }

  // ---- Write each target's config --------------------------------------
  for (const target of record.targets) {
    let layout;
    try {
      layout = getTargetLayout(target);
    } catch {
      skipped.push({ capability: 'mcp', reason: `unknown target "${target}" in the manifest` });
      continue;
    }

    if (layout.capabilities.mcp !== 'project' || !layout.mcpConfigFile) {
      skipped.push({
        capability: 'mcp',
        reason: `${layout.displayName} has no project-level MCP config to rebuild`,
      });
      continue;
    }

    const relFiles = [layout.mcpConfigFile, ...(layout.extraMcpConfigFiles ?? [])];
    for (const rel of relFiles) {
      let abs: string;
      try {
        // Never write outside the checkout we were pointed at, whatever a
        // descriptor or a tampered manifest says.
        abs = validatePathWithinBase(path.join(root, ...rel.split('/')), root, false);
      } catch (error: unknown) {
        logger.warn('Refusing to materialize a config outside the project', {
          error,
          context: { rel, target },
        });
        skipped.push({
          capability: 'mcp',
          reason: `${rel}: refused — the path escapes the project directory`,
        });
        continue;
      }

      let content: string | null;
      try {
        content = renderFor(target, rel, entries, readExistingConfig(root, rel), record.servers);
      } catch (error: unknown) {
        if (error instanceof McpConfigParseError) {
          skipped.push({
            capability: 'mcp',
            reason: `${rel} exists but could not be parsed; it was left untouched`,
          });
          continue;
        }
        throw error;
      }
      if (content === null) continue;

      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content, 'utf-8');
      written.push(rel);
    }
  }

  logger.info('Materialized local MCP configuration', {
    context: {
      projectPath: root,
      isWorktree: worktree.isWorktree,
      mainCheckout: mainCheckout ?? null,
      written,
      servers: Object.keys(entries),
      // Names only — never the values.
      secretsApplied: [...secretsApplied],
      skipped: skipped.length,
    },
  });

  return {
    written,
    skipped,
    servers: Object.keys(entries),
    targets: record.targets,
    isWorktree: worktree.isWorktree,
    secretsApplied: [...secretsApplied],
  };
}
