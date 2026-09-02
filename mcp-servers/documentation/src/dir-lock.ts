// SPDX-License-Identifier: MIT
/**
 * A cooperative, cross-process lock built on `mkdir`.
 *
 * `SingleFlight` collapses concurrent work inside ONE process. But every
 * project a user opens starts its own documentation server against the same
 * per-user cache directory, so two processes can still clone the same
 * technology into the same place at the same time.
 *
 * `mkdir` is the one filesystem primitive that is atomic and fails when the
 * target exists on every platform we ship on — no O_EXCL flag juggling, no
 * dependency. The holder writes an owner file with its pid and timestamp so a
 * lock left behind by a killed process can be reclaimed instead of blocking
 * the cache forever.
 *
 * The lock is advisory and best-effort by design: a caller that cannot get it
 * within the timeout proceeds anyway. Correctness does not depend on it — the
 * fetcher swaps directories with a rename, which is atomic on its own — the
 * lock only stops the redundant work.
 */

import fs from 'fs/promises';
import path from 'path';

/** A lock older than this is assumed abandoned and is reclaimed. */
export const DEFAULT_LOCK_TTL_MS = 60_000;

export interface DirLockOptions {
  /** Age after which a held lock is considered stale. */
  ttlMs?: number;
  /** How long to wait for a lock held by someone else. */
  timeoutMs?: number;
  /** Delay between attempts. */
  pollMs?: number;
}

export interface DirLock {
  /** Release the lock. Safe to call more than once. */
  release(): Promise<void>;
}

interface LockOwner {
  pid: number;
  at: number;
  /** Identifies this particular acquisition, so a release cannot free someone else's. */
  token?: string;
}

const OWNER_FILE = 'owner.json';

/**
 * Try to acquire `lockPath`, waiting up to `timeoutMs`.
 *
 * Returns the lock, or null when it is still held by a live owner at the
 * deadline. Callers treat null as "go ahead unlocked" rather than an error:
 * duplicated work is a cost, a deadlock is a hang.
 */
export async function acquireDirLock(
  lockPath: string,
  options: DirLockOptions = {}
): Promise<DirLock | null> {
  const ttlMs = options.ttlMs ?? DEFAULT_LOCK_TTL_MS;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const pollMs = options.pollMs ?? 150;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const attempt = await tryMkdirLock(lockPath);
    if (attempt === 'acquired') return makeLock(lockPath);

    // Nothing to wait for: a full disk, a denied ACL, a read-only cache root.
    // Give up immediately and let the caller proceed unlocked — the fetcher
    // publishes with a rename, so correctness never depended on this lock.
    if (attempt === 'unusable') return null;

    const reclaimed = await reclaimIfStale(lockPath, ttlMs);

    // The deadline is checked on every path, including after a reclaim. It used
    // to sit behind a `continue`, so a condition that always looked like
    // progress spun forever.
    if (Date.now() >= deadline) return null;

    // A successful reclaim is real progress, so retry at once; otherwise wait
    // before asking again.
    if (!reclaimed) await sleep(pollMs);
  }
}

/**
 * Outcome of one attempt to take the lock.
 *
 * `held` is a waiting condition — someone else has it and may release it.
 * `unusable` is not: the directory cannot be created at all, and no amount of
 * polling changes that. Collapsing the two into `false` made the caller wait
 * for a lock that could never appear.
 */
type LockAttempt = 'acquired' | 'held' | 'unusable';

/** Create the lock directory, or say why we could not. */
async function tryMkdirLock(lockPath: string): Promise<LockAttempt> {
  try {
    await fs.mkdir(path.dirname(lockPath), { recursive: true });
    // Non-recursive on purpose: recursive mkdir succeeds when the directory
    // already exists, which would hand the lock to two holders at once.
    await fs.mkdir(lockPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EEXIST') return 'held';
    // A cache directory we cannot write to is not a reason to fail the fetch —
    // the caller proceeds unlocked. But it is a reason to stop waiting.
    return 'unusable';
  }

  const owner: LockOwner = { pid: process.pid, at: Date.now(), token: newToken() };
  await fs.writeFile(path.join(lockPath, OWNER_FILE), JSON.stringify(owner), 'utf-8').catch(
    () => {}
  );
  lastToken = owner.token ?? "";
  return 'acquired';
}

/**
 * The token of the lock this process most recently took.
 *
 * `release()` used to delete the lock directory unconditionally. A holder whose
 * work outran the TTL — a 30s clone plus a sparse-checkout plus a copy is not
 * far off 60s — would come back to find its lock reclaimed and re-taken, and
 * delete *the new holder's* lock on the way out. A third caller then acquired
 * immediately and both published into the same cache path, so one of the two
 * renames failed. Releasing only what we still own removes that.
 */
let lastToken = '';

function newToken(): string {
  return `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Remove a lock whose owner file is missing or older than the TTL. */
async function reclaimIfStale(lockPath: string, ttlMs: number): Promise<boolean> {
  let age: number;
  try {
    const raw = await fs.readFile(path.join(lockPath, OWNER_FILE), 'utf-8');
    const owner = JSON.parse(raw) as LockOwner;
    age = Date.now() - (typeof owner.at === 'number' ? owner.at : 0);
  } catch {
    // No readable owner file. Fall back to the directory's own mtime so a
    // lock taken microseconds ago is not stolen from under its holder.
    try {
      const stat = await fs.stat(lockPath);
      age = Date.now() - stat.mtimeMs;
    } catch {
      // Gone already — the caller can retry immediately.
      return true;
    }
  }

  if (age < ttlMs) return false;

  // Steal by rename, not by delete. Reading the age and removing the directory
  // are two operations: two waiters could both observe the same stale lock, and
  // the second one's `rm` would delete the *fresh* lock the first had just
  // taken, leaving two holders cloning the same technology. `rename` is atomic,
  // so exactly one waiter wins it; the loser gets ENOENT and simply retries.
  const claimed = `${lockPath}.stale-${newToken()}`;
  try {
    await fs.rename(lockPath, claimed);
  } catch {
    // Someone else got there first, or the lock is already gone. Either way the
    // caller should loop round and try to take it normally.
    return true;
  }

  console.error(`[KB] Reclaimed stale lock (${Math.round(age / 1000)}s old): ${lockPath}`);
  await fs.rm(claimed, { recursive: true, force: true }).catch(() => {});
  return true;
}

function makeLock(lockPath: string): DirLock {
  let released = false;
  const token = lastToken;
  return {
    async release() {
      if (released) return;
      released = true;

      // If the owner file no longer names our acquisition, the lock was
      // reclaimed while we worked and now belongs to someone else. Deleting it
      // would hand a third caller a lock the current holder still thinks it has.
      try {
        const raw = await fs.readFile(path.join(lockPath, OWNER_FILE), 'utf-8');
        const owner = JSON.parse(raw) as LockOwner;
        if (owner.token && owner.token !== token) return;
      } catch {
        // No readable owner file: either we never wrote one, or the lock is
        // already gone. Removing it is a no-op in the second case.
      }

      await fs.rm(lockPath, { recursive: true, force: true }).catch(() => {});
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
