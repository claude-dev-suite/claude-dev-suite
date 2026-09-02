// SPDX-License-Identifier: MIT
/**
 * Per-project store for the environment values that are actually secrets.
 *
 * Wizard env values were written verbatim into every selected assistant's MCP
 * config and lived nowhere else, so the only thing standing between a database
 * password and a public repository was a `.gitignore` block — one the user is
 * explicitly allowed to delete, and one that is absent entirely in a fresh git
 * worktree. Worse, `install-recovery.ts` treated those config files as the
 * system of record: in a checkout without them, a reinstall recovered `{}` and
 * silently wiped every credential.
 *
 * Secrets now live outside the repository, in `~/.dev-suite/env/<id>.json` with
 * mode 0600 — beside `credentials.json`, whose ownership model this mirrors
 * (see services/credentials.service.ts). The MCP configs still receive the
 * literal value, because `${env:VAR}` interpolation is only documented for some
 * of the supported assistants; the store is what makes those files
 * *reproducible* rather than authoritative, and the `.gitignore` block stays as
 * the second layer.
 *
 * SECURITY: values are never logged. Everything this module reports about a
 * stored secret is its variable *name*.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { getLogger } from '../../utils/logger.js';
import type { EnvVarConfig } from '../../types.js';
import { validateEntryName } from './security-helpers.js';
import { linkedWorktreeMainCheckout } from './worktree.js';

const logger = getLogger('SecretEnvStore');

const STORE_DIR_NAME = '.dev-suite';
const ENV_DIR_NAME = 'env';
const SCHEMA_VERSION = 1;

/**
 * Names that are treated as secret when the dev-suite catalog cannot be read.
 *
 * Mirrors `scripts/validate-env-secrets.mjs`, which fails CI for any catalog
 * variable matching this and lacking `secret: true` — so the heuristic and the
 * declarations cannot drift apart in the direction that leaks.
 */
const SENSITIVE_NAME = /KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i;

/** On-disk shape. `values` is the only field that carries secrets. */
interface StoredEnvRecord {
  version: number;
  /** The project this belongs to, for auditing a directory of opaque ids. */
  projectPath: string;
  updatedAt: string;
  values: Record<string, string>;
}

/** Masked description of one project's store, safe to return from an endpoint. */
export interface SecretStoreStatus {
  storePath: string;
  /** Variable names held, never their values. */
  names: string[];
  /** `undefined` when no store file exists; false on Windows, where mode says nothing. */
  restrictedPermissions?: boolean;
  updatedAt?: string;
}

// ============================================
// WHICH VARIABLES ARE SECRET
// ============================================

/**
 * Every env var the dev-suite catalog declares `secret: true`, read from
 * `mcp-servers/<name>/metadata.json`.
 *
 * The declaration is the authority; `isLikelySecretName` is the fallback for
 * callers that have no dev-suite checkout to consult (a materialize run inside
 * a worktree, for instance).
 */
export function collectSecretEnvNames(devSuiteDir: string): Set<string> {
  const names = new Set<string>();
  const mcpRoot = path.join(devSuiteDir, 'mcp-servers');

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(mcpRoot, { withFileTypes: true });
  } catch {
    // No catalog here — callers fall back to the name heuristic.
    return names;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || !validateEntryName(entry.name)) continue;
    const metadataPath = path.join(mcpRoot, entry.name, 'metadata.json');
    if (!fs.existsSync(metadataPath)) continue;
    try {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8')) as {
        envVars?: EnvVarConfig[];
      };
      for (const envVar of metadata.envVars ?? []) {
        if (envVar?.secret === true && typeof envVar.name === 'string') names.add(envVar.name);
      }
    } catch (error: unknown) {
      logger.warn('Could not read MCP metadata while collecting secret env names', {
        error,
        context: { server: entry.name },
      });
    }
  }

  return names;
}

/** Whether a variable name is sensitive on its face. @see SENSITIVE_NAME */
export function isLikelySecretName(name: string): boolean {
  return SENSITIVE_NAME.test(name);
}

/**
 * Split wizard env values into the ones that must be protected and the rest.
 *
 * `declaredSecrets` comes from {@link collectSecretEnvNames}; the name
 * heuristic is applied on top so a variable the catalog forgot to mark is still
 * treated as a secret. Erring toward "secret" only costs an extra `.gitignore`
 * entry; erring the other way commits a credential.
 */
export function splitSecretEnvVars(
  envVars: Record<string, string>,
  declaredSecrets: ReadonlySet<string>
): { secrets: Record<string, string>; plain: Record<string, string> } {
  const secrets: Record<string, string> = {};
  const plain: Record<string, string> = {};

  for (const [name, value] of Object.entries(envVars)) {
    if (declaredSecrets.has(name) || isLikelySecretName(name)) secrets[name] = value;
    else plain[name] = value;
  }

  return { secrets, plain };
}

/** The non-empty secret *values* present in `envVars`. Used by the gitignore pass. */
export function secretValuesIn(
  envVars: Record<string, string>,
  declaredSecrets: ReadonlySet<string>
): string[] {
  return Object.values(splitSecretEnvVars(envVars, declaredSecrets).secrets)
    .map(v => v?.trim?.() ?? '')
    .filter(v => v.length > 0);
}

// ============================================
// PROJECT IDENTITY
// ============================================

/**
 * The checkout a project's secrets belong to.
 *
 * A linked worktree resolves to its main checkout: `git worktree add` produces
 * a second path for the *same* repository, and keying the store by path alone
 * would give every isolated agent an empty store — which is the failure this
 * whole change exists to remove. One repository, one set of credentials.
 */
export function canonicalProjectPath(projectPath: string): string {
  return linkedWorktreeMainCheckout(projectPath) ?? path.resolve(projectPath);
}

/**
 * Stable, filesystem-safe id for a project path.
 *
 * `<slug>-<hash>`: the slug makes `~/.dev-suite/env/` auditable by a human, the
 * hash makes it unique. The hashed input is normalised first — separators to
 * `/`, trailing separator dropped, and lower-cased on Windows and macOS, whose
 * filesystems are case-insensitive by default. Without that, `C:\Users\...` and
 * `c:\users\...` are the same project to the OS but two different stores, and a
 * reinstall launched from a differently-cased path would find no secrets and
 * report the project as uncredentialed.
 *
 * Case is preserved on Linux, where two such paths really are two directories.
 */
export function projectStoreId(projectPath: string): string {
  const resolved = canonicalProjectPath(projectPath);
  let normalized = resolved.replace(/[\\/]+/g, '/').replace(/\/+$/, '');
  if (process.platform === 'win32' || process.platform === 'darwin') {
    normalized = normalized.toLowerCase();
  }

  const hash = crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16);
  const slug =
    path
      .basename(resolved)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'project';

  return `${slug}-${hash}`;
}

// ============================================
// STORE
// ============================================

export class SecretEnvStore {
  private readonly rootDir: string;
  private readonly envDir: string;

  /** @param homeDir - Overridable only so tests can point at a temp directory. */
  constructor(homeDir: string = os.homedir()) {
    this.rootDir = path.join(homeDir, STORE_DIR_NAME);
    this.envDir = path.join(this.rootDir, ENV_DIR_NAME);
  }

  /** Directory holding every project's secret file. */
  getDirPath(): string {
    return this.envDir;
  }

  /**
   * Absolute path of one project's secret file.
   *
   * The id is derived, never user-supplied, but it is still asserted to be a
   * single path segment: it is the only thing between `path.join` and the
   * caller's project path, and `projectStoreId` is the sort of function a later
   * change makes "more readable" by dropping the sanitisation.
   */
  getStorePath(projectPath: string): string {
    const id = projectStoreId(projectPath);
    if (!validateEntryName(id) || !/^[a-z0-9][a-z0-9-]*$/.test(id)) {
      throw new Error(`SECURITY: refusing an unsafe secret-store id derived from "${projectPath}"`);
    }
    return path.join(this.envDir, `${id}.json`);
  }

  /**
   * Secrets stored for a project, or `{}` when none are stored or the file is
   * unreadable. A broken store is treated as absent, like the credential store:
   * the dashboard must still start, and the user can re-enter the value.
   */
  read(projectPath: string): Record<string, string> {
    let file: string;
    try {
      file = this.getStorePath(projectPath);
    } catch (error: unknown) {
      logger.warn('Refusing to read a secret store', { error });
      return {};
    }

    try {
      if (!fs.existsSync(file)) return {};
      const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as Partial<StoredEnvRecord>;
      const values = parsed?.values;
      if (!values || typeof values !== 'object' || Array.isArray(values)) {
        logger.warn('Secret env store is malformed — ignoring it', { context: { file } });
        return {};
      }
      const out: Record<string, string> = {};
      for (const [name, value] of Object.entries(values)) {
        if (typeof value === 'string' && value.length > 0) out[name] = value;
      }
      return out;
    } catch (error: unknown) {
      logger.warn('Failed to read the secret env store', { error, context: { file } });
      return {};
    }
  }

  /** Replace a project's stored secrets wholesale. An empty map deletes the file. */
  write(projectPath: string, values: Record<string, string>): void {
    const file = this.getStorePath(projectPath);

    const clean: Record<string, string> = {};
    for (const [name, value] of Object.entries(values)) {
      if (typeof value === 'string' && value.trim().length > 0) clean[name] = value;
    }

    if (Object.keys(clean).length === 0) {
      this.clear(projectPath);
      return;
    }

    const record: StoredEnvRecord = {
      version: SCHEMA_VERSION,
      projectPath: canonicalProjectPath(projectPath),
      updatedAt: new Date().toISOString(),
      values: clean,
    };

    fs.mkdirSync(this.envDir, { recursive: true, mode: 0o700 });
    // 0600 at creation rather than a chmod afterwards, so the secret is never
    // briefly readable by another local account.
    fs.writeFileSync(file, JSON.stringify(record, null, 2), { encoding: 'utf-8', mode: 0o600 });
    this.restrictPermissions(file);

    logger.info('Stored project secrets outside the repository', {
      context: { file, names: Object.keys(clean) },
    });
  }

  /**
   * Add or update values, keeping any already-stored name this call does not
   * mention. This is what an install uses: the wizard may only re-collect a
   * subset, and a missing field must not erase a working credential.
   */
  merge(projectPath: string, values: Record<string, string>): Record<string, string> {
    const merged = { ...this.read(projectPath) };
    for (const [name, value] of Object.entries(values)) {
      if (typeof value === 'string' && value.trim().length > 0) merged[name] = value;
    }
    this.write(projectPath, merged);
    return merged;
  }

  /** Remove a project's stored secrets. */
  clear(projectPath: string): void {
    let file: string;
    try {
      file = this.getStorePath(projectPath);
    } catch {
      return;
    }
    try {
      if (fs.existsSync(file)) {
        fs.rmSync(file);
        logger.info('Cleared stored project secrets', { context: { file } });
      }
    } catch (error: unknown) {
      logger.warn('Failed to remove the secret env store', { error, context: { file } });
    }
  }

  /** Masked status, safe to hand to the UI. */
  getStatus(projectPath: string): SecretStoreStatus {
    let storePath: string;
    try {
      storePath = this.getStorePath(projectPath);
    } catch {
      return { storePath: this.envDir, names: [] };
    }

    const names = Object.keys(this.read(projectPath)).sort();

    let updatedAt: string | undefined;
    try {
      const parsed = JSON.parse(fs.readFileSync(storePath, 'utf-8')) as Partial<StoredEnvRecord>;
      if (typeof parsed?.updatedAt === 'string') updatedAt = parsed.updatedAt;
    } catch {
      /* absent or unreadable — reported by the empty name list */
    }

    return {
      storePath,
      names,
      restrictedPermissions: this.isOwnerOnly(storePath),
      updatedAt,
    };
  }

  /**
   * Re-apply 0600 to an existing file — `mode` on `writeFileSync` is ignored
   * when the file already exists. No-op on Windows, where chmod cannot express
   * POSIX modes; `getStatus()` reports that via `restrictedPermissions`.
   */
  private restrictPermissions(file: string): void {
    if (process.platform === 'win32') return;
    try {
      fs.chmodSync(this.envDir, 0o700);
      fs.chmodSync(file, 0o600);
    } catch (error: unknown) {
      logger.warn('Failed to restrict secret store permissions', { error });
    }
  }

  /** Measured, not assumed — chmod fails silently on SMB/NFS/exFAT `$HOME`. */
  private isOwnerOnly(file: string): boolean | undefined {
    let mode: number;
    try {
      mode = fs.statSync(file).mode & 0o777;
    } catch {
      return undefined;
    }
    if (process.platform === 'win32') return false;
    return mode === 0o600;
  }
}

/**
 * Process-wide instance. The store is a single directory under `$HOME`, so the
 * install pipeline and the routes must not hold divergent copies of it.
 */
export const secretEnvStore = new SecretEnvStore();
