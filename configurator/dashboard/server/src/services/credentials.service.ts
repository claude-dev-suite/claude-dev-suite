// SPDX-License-Identifier: MIT
/**
 * Anthropic Runtime Credential Service
 *
 * Owns the credential the Agent SDK needs to run the model, stored globally at
 * `~/.dev-suite/credentials.json` (0600) so it applies to every project and
 * survives an Electron launch from the GUI — where the shell's exported
 * ANTHROPIC_API_KEY is simply not in `process.env` and the orchestrator failed
 * with an auth error and no way to fix it from the UI.
 *
 * The stored value is injected per-call via the SDK's `options.env`, so a key
 * saved from the dashboard takes effect on the next message with no restart.
 *
 * SECURITY: the secret is never logged and never returned by any endpoint —
 * callers get `getStatus()`, which is masked.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { getLogger } from '../utils/logger.js';
import type {
  CredentialKind,
  CredentialStatus,
  CredentialVerification,
  StoredCredential,
} from '../types/credentials.js';

const logger = getLogger('CredentialsService');

// ============================================
// CONSTANTS
// ============================================

const STORE_DIR_NAME = '.dev-suite';
const STORE_FILE_NAME = 'credentials.json';

/** Free, side-effect-free endpoint used to probe whether a credential works. */
const VERIFY_URL = 'https://api.anthropic.com/v1/models?limit=1';
const ANTHROPIC_VERSION = '2023-06-01';
/** OAuth bearer tokens need this beta flag on the REST API. */
const OAUTH_BETA = 'oauth-2025-04-20';
const VERIFY_TIMEOUT_MS = 10_000;

const ENV_VAR_BY_KIND: Record<CredentialKind, string> = {
  api_key: 'ANTHROPIC_API_KEY',
  oauth_token: 'CLAUDE_CODE_OAUTH_TOKEN',
};

/** Prefixes we can classify without asking the user. */
const PREFIX_API_KEY = 'sk-ant-api';
const PREFIX_OAUTH_TOKEN = 'sk-ant-oat';
const PREFIX_ADMIN_KEY = 'sk-ant-admin';

// ============================================
// ERRORS
// ============================================

/** A credential the user submitted that we refuse to store, with a reason. */
export class CredentialValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CredentialValidationError';
  }
}

// ============================================
// SERVICE
// ============================================

export class CredentialsService {
  private readonly storeDir: string;
  private readonly storeFile: string;

  /**
   * @param homeDir - Overridable only so tests can point at a temp directory.
   */
  constructor(homeDir: string = os.homedir()) {
    this.storeDir = path.join(homeDir, STORE_DIR_NAME);
    this.storeFile = path.join(this.storeDir, STORE_FILE_NAME);
  }

  /** Absolute path of the credential store, surfaced to the UI for auditing. */
  getStorePath(): string {
    return this.storeFile;
  }

  // ------------------------------------------
  // Classification
  // ------------------------------------------

  /**
   * Work out which env var a pasted secret belongs in.
   *
   * Returns `null` when the value is well-formed but of an unrecognised
   * subtype — the caller then asks the user to pick, rather than guessing and
   * silently setting the wrong variable (which fails as an opaque auth error).
   *
   * @throws CredentialValidationError when the value is empty or is an Admin
   *   API key, which cannot run the model at all.
   */
  detectKind(rawValue: string): CredentialKind | null {
    const value = rawValue.trim();

    if (!value) {
      throw new CredentialValidationError('Credential is empty.');
    }

    if (/\s/.test(value)) {
      throw new CredentialValidationError(
        'Credential contains whitespace — it was probably copied with a line break or a shell prefix such as "export ANTHROPIC_API_KEY=".',
      );
    }

    if (value.startsWith(PREFIX_ADMIN_KEY)) {
      throw new CredentialValidationError(
        'That is an Admin API key (sk-ant-admin…). It only works against the Admin API for usage and cost reporting, and cannot run the model. Set it in the Usage panel instead, and paste an API key (sk-ant-api…) or an OAuth token (sk-ant-oat…) here.',
      );
    }

    if (value.startsWith(PREFIX_OAUTH_TOKEN)) return 'oauth_token';
    if (value.startsWith(PREFIX_API_KEY)) return 'api_key';

    return null;
  }

  // ------------------------------------------
  // Persistence
  // ------------------------------------------

  /**
   * Read the stored credential, or `null` when none is saved or the file is
   * unreadable/corrupt. A broken store is treated as absent so the dashboard
   * still starts — the user can just save the credential again.
   */
  load(): StoredCredential | null {
    try {
      if (!fs.existsSync(this.storeFile)) return null;

      const parsed = JSON.parse(fs.readFileSync(this.storeFile, 'utf-8')) as Partial<StoredCredential>;

      if (
        typeof parsed?.value !== 'string' ||
        !parsed.value ||
        (parsed.kind !== 'api_key' && parsed.kind !== 'oauth_token')
      ) {
        logger.warn('Credential store is malformed — ignoring it', { path: this.storeFile });
        return null;
      }

      return {
        kind: parsed.kind,
        value: parsed.value,
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date(0).toISOString(),
      };
    } catch (err) {
      logger.warn('Failed to read credential store', {
        path: this.storeFile,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }

  /**
   * Persist a credential, replacing whatever was there.
   *
   * @param rawValue - The secret as pasted by the user.
   * @param kind - Explicit kind, or omitted/`'auto'` to classify by prefix.
   * @throws CredentialValidationError when the value is rejected or cannot be
   *   classified without help.
   */
  save(rawValue: string, kind?: CredentialKind | 'auto'): CredentialStatus {
    const value = rawValue.trim();
    const detected = this.detectKind(value);

    let resolvedKind: CredentialKind;
    if (kind && kind !== 'auto') {
      resolvedKind = kind;
    } else if (detected) {
      resolvedKind = detected;
    } else {
      throw new CredentialValidationError(
        'Could not tell whether this is an API key or an OAuth token. Anthropic API keys start with "sk-ant-api…" and OAuth tokens from `claude setup-token` start with "sk-ant-oat…". Choose the type explicitly to store it anyway.',
      );
    }

    const record: StoredCredential = {
      kind: resolvedKind,
      value,
      updatedAt: new Date().toISOString(),
    };

    fs.mkdirSync(this.storeDir, { recursive: true, mode: 0o700 });
    // Write with 0600 from the start rather than chmod-ing afterwards, so the
    // secret is never briefly readable by other local accounts.
    fs.writeFileSync(this.storeFile, JSON.stringify(record, null, 2), { encoding: 'utf-8', mode: 0o600 });
    this.restrictPermissions();

    logger.info('Runtime credential saved', {
      kind: resolvedKind,
      envVar: ENV_VAR_BY_KIND[resolvedKind],
    });

    return this.getStatus();
  }

  /** Delete the stored credential. Returns the status after removal. */
  clear(): CredentialStatus {
    try {
      if (fs.existsSync(this.storeFile)) {
        fs.rmSync(this.storeFile);
        logger.info('Runtime credential cleared');
      }
    } catch (err) {
      logger.warn('Failed to remove credential store', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return this.getStatus();
  }

  /**
   * Re-apply 0600 to an existing store — `mode` on `writeFileSync` is ignored
   * when the file already exists, so a store created before this ran (or by an
   * older version) would keep its original permissions.
   *
   * No-op on Windows, where chmod cannot express POSIX modes; `getStatus()`
   * reports that via `restrictedPermissions`.
   */
  private restrictPermissions(): void {
    if (process.platform === 'win32') return;
    try {
      fs.chmodSync(this.storeDir, 0o700);
      fs.chmodSync(this.storeFile, 0o600);
    } catch (err) {
      logger.warn('Failed to restrict credential store permissions', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ------------------------------------------
  // Status
  // ------------------------------------------

  /**
   * Masked description of the credential the orchestrator will actually use.
   *
   * A stored credential wins over an ambient env var: saving one in the UI is
   * an explicit choice, and otherwise a stale exported key would silently keep
   * overriding it.
   */
  getStatus(): CredentialStatus {
    const base = {
      storePath: this.storeFile,
      restrictedPermissions: this.storeIsOwnerOnly(),
    };

    const stored = this.load();
    if (stored) {
      return {
        ...base,
        configured: true,
        source: 'stored',
        kind: stored.kind,
        envVar: ENV_VAR_BY_KIND[stored.kind],
        preview: this.mask(stored.value),
        updatedAt: stored.updatedAt,
      };
    }

    const ambient = this.readAmbient();
    if (ambient) {
      return {
        ...base,
        configured: true,
        source: 'environment',
        kind: ambient.kind,
        envVar: ENV_VAR_BY_KIND[ambient.kind],
        preview: this.mask(ambient.value),
      };
    }

    return { ...base, configured: false, source: 'none' };
  }

  /**
   * Whether the store file is actually owner-only, read from its mode rather
   * than assumed from the platform. `undefined` when no store exists, so the
   * UI can say nothing instead of describing a file that is not there.
   *
   * This has to be measured: `restrictPermissions()` only warns when `chmod`
   * fails, and it does fail silently on an SMB/NFS/exFAT `$HOME` — and a store
   * written before that method existed keeps whatever mode it was created
   * with. A platform constant would keep claiming 0600 over a group-readable
   * file, which is the one thing the panel must not get wrong about a secret.
   */
  private storeIsOwnerOnly(): boolean | undefined {
    let mode: number;
    try {
      mode = fs.statSync(this.storeFile).mode & 0o777;
    } catch {
      return undefined;
    }
    // Windows synthesises a mode that says nothing about who can read the file.
    if (process.platform === 'win32') return false;
    return mode === 0o600;
  }

  /**
   * Credential inherited from the process environment, if any.
   *
   * Mirrors the CLI's own precedence: ANTHROPIC_API_KEY is checked before
   * CLAUDE_CODE_OAUTH_TOKEN.
   */
  private readAmbient(): { kind: CredentialKind; value: string } | null {
    const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
    if (apiKey) return { kind: 'api_key', value: apiKey };

    const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN?.trim();
    if (oauthToken) return { kind: 'oauth_token', value: oauthToken };

    return null;
  }

  /** First 12 + last 4 characters; short values collapse to a fixed mask. */
  private mask(value: string): string {
    if (value.length <= 20) return '****';
    return `${value.slice(0, 12)}…${value.slice(-4)}`;
  }

  // ------------------------------------------
  // Injection into the Agent SDK
  // ------------------------------------------

  /**
   * Env overrides to merge into `options.env` for every `query()` call.
   *
   * Returns `{}` when nothing is stored, leaving the ambient environment (and
   * any `claude login` credentials on disk) exactly as they were.
   *
   * When an OAuth token is stored, ANTHROPIC_API_KEY is explicitly unset:
   * it outranks the token in the CLI's resolution order, so a leftover
   * exported key would silently win and the stored token would never be used.
   */
  resolveAuthEnv(): Record<string, string | undefined> {
    const stored = this.load();
    if (!stored) return {};

    return stored.kind === 'oauth_token'
      ? { CLAUDE_CODE_OAUTH_TOKEN: stored.value, ANTHROPIC_API_KEY: undefined }
      : { ANTHROPIC_API_KEY: stored.value, CLAUDE_CODE_OAUTH_TOKEN: undefined };
  }

  /**
   * Full env for a spawned Agent SDK process: `process.env` with the stored
   * credential applied on top. The SDK defaults `options.env` to `process.env`
   * wholesale, so the base must be spread in or the CLI loses PATH.
   */
  buildAgentEnv(baseEnv: NodeJS.ProcessEnv = process.env): Record<string, string | undefined> {
    return { ...baseEnv, ...this.resolveAuthEnv() };
  }

  // ------------------------------------------
  // Verification
  // ------------------------------------------

  /**
   * Probe the effective credential against a read-only Anthropic endpoint so a
   * bad key reports as a bad key instead of as a failed chat turn.
   *
   * @param rawValue - Value to test; defaults to whatever is currently in effect.
   * @param kind - Kind of `rawValue`; ignored when testing the effective one.
   */
  async verify(rawValue?: string, kind?: CredentialKind | 'auto'): Promise<CredentialVerification> {
    let value: string;
    let resolvedKind: CredentialKind;

    if (rawValue?.trim()) {
      value = rawValue.trim();
      const detected = this.detectKind(value);
      const chosen = kind && kind !== 'auto' ? kind : detected;
      if (!chosen) {
        return {
          status: 'inconclusive',
          message:
            'Cannot verify: the credential type could not be determined. Choose API key or OAuth token explicitly.',
        };
      }
      resolvedKind = chosen;
    } else {
      const effective = this.load() ?? this.readAmbient();
      if (!effective) {
        return {
          status: 'inconclusive',
          message:
            'No credential is configured here. If you have run `claude login`, the CLI authenticates from its own credentials on disk, which this check cannot read — so the Orchestrator may work anyway.',
        };
      }
      value = effective.value;
      resolvedKind = effective.kind;
    }

    const headers: Record<string, string> = { 'anthropic-version': ANTHROPIC_VERSION };
    if (resolvedKind === 'oauth_token') {
      headers['authorization'] = `Bearer ${value}`;
      headers['anthropic-beta'] = OAUTH_BETA;
    } else {
      headers['x-api-key'] = value;
    }

    try {
      const response = await fetch(VERIFY_URL, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
      });

      if (response.ok) {
        return {
          status: 'valid',
          httpStatus: response.status,
          message:
            resolvedKind === 'oauth_token'
              ? 'OAuth token accepted by the Anthropic API.'
              : 'API key accepted by the Anthropic API.',
        };
      }

      if (response.status === 401 || response.status === 403) {
        const noun = resolvedKind === 'oauth_token' ? 'an OAuth token' : 'an API key';
        return {
          status: 'invalid',
          httpStatus: response.status,
          message: `Anthropic rejected this credential (HTTP ${response.status}). Check that it has not been revoked, and that you pasted ${noun} and not another kind of secret.`,
        };
      }

      // Rate limits, outages, and org-policy responses say nothing about the
      // credential itself — reporting them as "invalid" would send the user
      // hunting for a key that is fine.
      return {
        status: 'inconclusive',
        httpStatus: response.status,
        message: `Could not confirm the credential: Anthropic replied HTTP ${response.status}. Try again shortly.`,
      };
    } catch (err) {
      return {
        status: 'inconclusive',
        message: `Could not reach the Anthropic API: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}

/**
 * Process-wide instance. The store is a single global file, so the orchestrator
 * and the routes must not hold divergent copies of it.
 */
export const credentialsService = new CredentialsService();
