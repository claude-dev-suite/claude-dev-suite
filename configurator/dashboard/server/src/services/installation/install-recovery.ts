// SPDX-License-Identifier: MIT
/**
 * Recover install parameters that live in generated files.
 *
 * Env vars and the skill-loading mode are not stored in the manifest — they are
 * baked into each assistant's MCP config. Both were recovered from Claude Code's
 * `.mcp.json` alone, so a Cursor- or Gemini-only project (which has no
 * `.mcp.json` at all) came back with `{}` and every API key the user had entered
 * in the wizard was wiped on the next reinstall, silently.
 *
 * Reading across every selected target fixed that — but only where the config
 * files exist. They are gitignored when they carry a secret, so a fresh
 * `git worktree` (what a fan-out of isolated agents runs in) has none of them,
 * and the same wipe came back through a door the earlier fix did not cover.
 *
 * So the *store* is now the system of record for secret values:
 * `~/.dev-suite/env/<id>.json`, outside the repository and outside any
 * worktree (see installation/secret-store.ts). The config-file scan below is
 * kept as the legacy path — it is how every project installed before the store
 * existed still recovers — and the first recovery that finds a secret there
 * writes it into the store, so each project migrates itself exactly once. Keep
 * that fallback for at least one minor release.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getDevSuiteDir } from '../../utils/dev-suite-dir.js';
import { getLogger } from '../../utils/logger.js';
import {
  DEFAULT_TARGET,
  mcpConfigFilesFor,
  type TargetId,
} from '../targets/target-layout.js';
import {
  SecretEnvStore,
  collectSecretEnvNames,
  isLikelySecretName,
  secretEnvStore,
} from './secret-store.js';

const logger = getLogger('InstallRecovery');

function mcpFilesFor(targets: readonly TargetId[]): string[] {
  // Every surface a target reads, from the descriptor — Copilot's second one
  // used to live in a local table here, invisible to the coverage gate.
  const files = new Set<string>();
  for (const target of targets) {
    for (const file of mcpConfigFilesFor(target)) files.add(file);
  }
  return [...files];
}

function readJson(file: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** The server map in a config, whichever key this assistant uses. */
function serverMap(root: Record<string, unknown>): Record<string, unknown> {
  for (const key of ['mcpServers', 'servers']) {
    const value = root[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return {};
}

export interface RecoverEnvOptions {
  /** Override the process-wide store; tests point this at a temp `$HOME`. */
  store?: SecretEnvStore;
  /**
   * dev-suite checkout, used to read which variables the catalog declares
   * `secret: true`. Defaults to `getDevSuiteDir()`; when neither is resolvable
   * the name heuristic in secret-store.ts decides on its own, which errs toward
   * treating a variable as secret.
   *
   * It matters: `DATABASE_URL`, the one variable the wizard forces a human to
   * type, matches no name pattern. Only the catalog knows it is a credential.
   */
  devSuiteDir?: string;
  /** Set false to skip the one-shot migration (a read-only inspection). */
  migrate?: boolean;
}

/**
 * Every environment variable dev-suite can recover for this project.
 *
 * Order of authority:
 *  1. `~/.dev-suite/env/<id>.json` — the secret store, which survives a
 *     worktree, a `.gitignore` the user deleted, and a wiped config file.
 *  2. The MCP config of each selected target, for values the store does not
 *     hold: non-secret settings live only there by design, and pre-store
 *     projects have their secrets there too.
 *
 * Later targets do not overwrite an earlier non-empty value, and nothing
 * overwrites the store.
 */
export function recoverEnvVars(
  projectPath: string,
  targets: readonly TargetId[] = [DEFAULT_TARGET],
  options: RecoverEnvOptions = {}
): Record<string, string> {
  const store = options.store ?? secretEnvStore;
  const out: Record<string, string> = { ...store.read(projectPath) };
  const fromStore = new Set(Object.keys(out));

  for (const rel of mcpFilesFor(targets)) {
    const abs = path.join(projectPath, ...rel.split('/'));
    if (!fs.existsSync(abs)) continue;
    const root = readJson(abs);
    if (!root) {
      logger.warn('Could not read an MCP config while recovering env vars', { context: { file: rel } });
      continue;
    }
    for (const entry of Object.values(serverMap(root))) {
      if (!entry || typeof entry !== 'object') continue;
      const env = (entry as { env?: unknown }).env;
      if (!env || typeof env !== 'object') continue;
      for (const [key, value] of Object.entries(env as Record<string, unknown>)) {
        if (typeof value === 'string' && value.length > 0 && !out[key]) out[key] = value;
      }
    }
  }

  // Codex stores its servers as TOML, so the JSON pass above cannot see them.
  const codexToml = path.join(projectPath, '.codex', 'config.toml');
  if (targets.includes('codex') && fs.existsSync(codexToml)) {
    try {
      const content = fs.readFileSync(codexToml, 'utf-8');
      // `[mcp_servers.<name>.env]` sections hold plain `KEY = "value"` pairs.
      const sections = content.split(/^\s*\[/m);
      for (const section of sections) {
        if (!/^mcp_servers\.[^.\]]+\.env\]/.test(section)) continue;
        for (const line of section.split('\n').slice(1)) {
          const kv = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"((?:[^"\\]|\\.)*)"/);
          if (kv?.[1] && kv[2] !== undefined && !out[kv[1]]) {
            out[kv[1]] = kv[2].replace(/\\(.)/g, '$1');
          }
        }
      }
    } catch (error: unknown) {
      logger.warn('Could not read .codex/config.toml while recovering env vars', { error });
    }
  }

  if (options.migrate !== false) {
    migrateSecretsToStore(projectPath, out, fromStore, store, options.devSuiteDir);
  }

  return out;
}

/** The dev-suite checkout, or `null` when it cannot be resolved (never throws). */
function resolveDevSuiteDir(): string | null {
  try {
    return getDevSuiteDir();
  } catch {
    return null;
  }
}

/**
 * One-shot migration: any secret recovered from a config file, and not already
 * in the store, is written to the store.
 *
 * Runs on every recovery but writes only when something new appears, so it is
 * idempotent and costs one file read per call after the first. The config file
 * keeps its literal value — the assistants dev-suite supports do not uniformly
 * document `${env:VAR}` interpolation, so removing it would break the servers —
 * which is why the `.gitignore` block remains for exactly those files.
 */
function migrateSecretsToStore(
  projectPath: string,
  recovered: Record<string, string>,
  alreadyStored: ReadonlySet<string>,
  store: SecretEnvStore,
  devSuiteDir?: string
): void {
  const declared = collectSecretEnvNames(devSuiteDir ?? resolveDevSuiteDir() ?? '');

  const migrating: Record<string, string> = {};
  for (const [name, value] of Object.entries(recovered)) {
    if (alreadyStored.has(name)) continue;
    if (!declared.has(name) && !isLikelySecretName(name)) continue;
    if (typeof value !== 'string' || value.trim().length === 0) continue;
    migrating[name] = value;
  }

  const names = Object.keys(migrating);
  if (names.length === 0) return;

  try {
    store.merge(projectPath, migrating);
    logger.info('Migrated secrets from MCP config into the protected store', {
      context: { names, projectPath },
    });
  } catch (error: unknown) {
    // A failed migration must never fail the recovery — the values are already
    // in `recovered`, and the install can proceed exactly as it did before.
    logger.warn('Could not migrate recovered secrets into the store', { error });
  }
}

/**
 * Whether skills were installed lazily, i.e. whether `skill-loader` is present
 * in any selected assistant's MCP config.
 */
export function recoverSkillLoadingMode(
  projectPath: string,
  targets: readonly TargetId[] = [DEFAULT_TARGET]
): 'eager' | 'lazy' {
  for (const rel of mcpFilesFor(targets)) {
    const abs = path.join(projectPath, ...rel.split('/'));
    if (!fs.existsSync(abs)) continue;
    const root = readJson(abs);
    if (root && Object.prototype.hasOwnProperty.call(serverMap(root), 'skill-loader')) {
      return 'lazy';
    }
  }

  const codexToml = path.join(projectPath, '.codex', 'config.toml');
  if (targets.includes('codex') && fs.existsSync(codexToml)) {
    try {
      if (/^\s*\[mcp_servers\."?skill-loader"?\]/m.test(fs.readFileSync(codexToml, 'utf-8'))) {
        return 'lazy';
      }
    } catch {
      /* unreadable — fall through to eager */
    }
  }

  return 'eager';
}
