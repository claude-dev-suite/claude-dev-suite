// SPDX-License-Identifier: MIT
/**
 * Anthropic runtime credential types.
 *
 * This is the credential the Agent SDK uses to actually run the model
 * (Orchestrator chat + jobs).  It is NOT the Admin API key: that one is
 * per-project, lives in `.dev-suite/usage-config.json`, and only ever talks to
 * the Admin API (`/v1/organizations/...`).  The three are not interchangeable:
 *
 *   ANTHROPIC_API_KEY        sk-ant-api…    model calls, billed as API credit
 *   CLAUDE_CODE_OAUTH_TOKEN  sk-ant-oat…    model calls, billed to a Claude Pro/Max plan
 *   Admin API key            sk-ant-admin…  usage/cost reporting only
 */

/** Which credential kind is stored, and therefore which env var gets set. */
export type CredentialKind = 'api_key' | 'oauth_token';

/** Where the credential the orchestrator will actually use comes from. */
export type CredentialSource = 'stored' | 'environment' | 'none';

/** On-disk shape of `~/.dev-suite/credentials.json`. */
export interface StoredCredential {
  kind: CredentialKind;
  value: string;
  updatedAt: string;
}

/**
 * Masked view handed to the UI.  The secret itself is never returned by any
 * endpoint — only enough to recognise which credential is in place.
 */
export interface CredentialStatus {
  configured: boolean;
  source: CredentialSource;
  kind?: CredentialKind;
  /** Env var the orchestrator will set, e.g. `ANTHROPIC_API_KEY`. */
  envVar?: string;
  /** First 12 + last 4 characters, e.g. `sk-ant-api03…ab12`. */
  preview?: string;
  updatedAt?: string;
  /** Absolute path of the credential store, shown so the user can audit it. */
  storePath: string;
  /**
   * Whether the store file on disk is actually owner-only, measured from its
   * mode. `undefined` when no store exists; `false` on Windows, where a POSIX
   * mode means nothing, and on any filesystem where the `chmod` did not take —
   * some network and non-POSIX mounts fail it silently. Never assume it from
   * the platform: this is a claim the UI makes about a secret.
   */
  restrictedPermissions?: boolean;
}

/** Result of probing the credential against the Anthropic API. */
export interface CredentialVerification {
  status: 'valid' | 'invalid' | 'inconclusive';
  message: string;
  httpStatus?: number;
}
