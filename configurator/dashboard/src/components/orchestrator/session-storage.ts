// SPDX-License-Identifier: MIT
/**
 * Session storage helpers (project-scoped).
 *
 * The Claude Agent SDK persists chat sessions per-project, under
 * `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`. Resuming a
 * session ID in a different project's CWD fails with
 * "No conversation found with session ID: ...". To prevent that, the
 * dashboard scopes its localStorage key by `projectPath`, so each
 * project remembers its own latest session.
 */

const LEGACY_KEY = 'orchestrator_session_id';
const SCOPED_PREFIX = 'orchestrator_session_id::';

/** Compute the project-scoped localStorage key for the chat session ID. */
export function getSessionStorageKey(projectPath: string | null | undefined): string {
  return `${SCOPED_PREFIX}${projectPath || ''}`;
}

/** Read the stored session ID for a given project (null if none / SSR). */
export function readStoredSessionId(projectPath: string | null | undefined): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(getSessionStorageKey(projectPath));
}

/** Persist the session ID for a given project. */
export function writeStoredSessionId(projectPath: string | null | undefined, sessionId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(getSessionStorageKey(projectPath), sessionId);
}

/** Clear the stored session ID for a given project. */
export function clearStoredSessionId(projectPath: string | null | undefined): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(getSessionStorageKey(projectPath));
}

/**
 * One-shot migration: if the legacy unscoped key is still around (from
 * a pre-1.8.1 install), remove it so a stale session ID from a
 * previous project can never be resumed in a different project.
 */
export function migrateLegacySessionKey(): void {
  if (typeof window === 'undefined') return;
  if (localStorage.getItem(LEGACY_KEY) !== null) {
    localStorage.removeItem(LEGACY_KEY);
  }
}
