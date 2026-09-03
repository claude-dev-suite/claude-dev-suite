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
    if (attempt.outcome === 'acquired') return makeLock(lockPath, attempt.token);

    // Nothing to wait for: a full disk, a denied ACL, a read-only cache root.
    // Give up immediately and let the caller proceed unlocked — the fetcher
    // publishes with a rename, so correctness never depended on this lock.
    if (attempt.outcome === 'unusable') return null;

    const reclaim = await takeOverIfStale(lockPath, ttlMs);

    // Taking a lock over makes us its holder, so hand it back even a hair past
    // the deadline: our owner file already names us, and returning null here
    // would leave the lock owned by a caller that will never release it.
    if (reclaim.outcome === 'taken') return makeLock(lockPath, reclaim.token);

    // The deadline is checked on every path, including after a reclaim. It used
    // to sit behind a `continue`, so a condition that always looked like
    // progress spun forever.
    if (Date.now() >= deadline) return null;

    // `retry` means the lock moved under us and another attempt may well win,
    // so ask again at once. `held` means a live owner has it: wait.
    if (reclaim.outcome === 'held') await sleep(pollMs);
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
type LockAttempt =
  | { outcome: 'acquired'; token: string }
  | { outcome: 'held' }
  | { outcome: 'unusable' };

/**
 * Create the lock directory, or say why we could not.
 *
 * The token identifying this acquisition is returned rather than parked in a
 * module-level variable: `release()` must delete only the lock it still owns,
 * and a shared slot for "the token we took most recently" is one interleaving
 * away from handing the wrong one out.
 */
async function tryMkdirLock(lockPath: string): Promise<LockAttempt> {
  try {
    await fs.mkdir(path.dirname(lockPath), { recursive: true });
    // Non-recursive on purpose: recursive mkdir succeeds when the directory
    // already exists, which would hand the lock to two holders at once.
    await fs.mkdir(lockPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EEXIST') return { outcome: 'held' };
    // A cache directory we cannot write to is not a reason to fail the fetch —
    // the caller proceeds unlocked. But it is a reason to stop waiting.
    return { outcome: 'unusable' };
  }

  const owner: LockOwner = { pid: process.pid, at: Date.now(), token: newToken() };
  await writeOwner(lockPath, owner).catch(() => {});
  return { outcome: 'acquired', token: owner.token ?? '' };
}

function newToken(): string {
  return `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Whether the lock at `lockPath` is stale, still live, or already gone.
 *
 * `gone` is deliberately distinct from `stale`: there is nothing to take over,
 * and the caller should go back and try to create the lock outright.
 */
type Staleness = 'stale' | 'live' | 'gone';

async function inspect(lockPath: string, ttlMs: number): Promise<Staleness> {
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
      return 'gone';
    }
  }

  return age < ttlMs ? 'live' : 'stale';
}

/**
 * The take-over marker. It lives *inside* the lock directory, which is what
 * makes the reclaim safe — see `takeOverIfStale`.
 */
const RECLAIM_DIR = 'reclaiming';

type Reclaim = { outcome: 'taken'; token: string } | { outcome: 'held' } | { outcome: 'retry' };

/**
 * Adopt a lock whose owner is gone, by rewriting its owner file in place.
 *
 * The previous version stole the lock by renaming the stale directory away and
 * letting the winner re-create it. `rename` is atomic, so exactly one waiter
 * won it — but atomicity of the *operation* says nothing about the *identity*
 * of what it moves. Judging the age and renaming are still two steps against a
 * path, and eight waiters all read the same stale owner file before any of them
 * acts: the first renames it away and re-creates a fresh lock, and the ones
 * whose rename lands a moment later carry off that fresh lock instead. They
 * then take it themselves, and two callers hold the same lock — which is
 * exactly the `expected 2 to be less than or equal to 1` this used to fail on
 * under CI load.
 *
 * So nothing here removes the lock directory. It stays put and only its owner
 * file changes hands, which means no `mkdir` can ever win against a live
 * holder. The `reclaiming` subdirectory is the mutex for that hand-off:
 * non-recursive `mkdir` is atomic, and because the marker is created *inside*
 * the lock, winning it proves we are looking at the same directory we judged —
 * not merely at the same name. Re-reading the owner under the marker then
 * settles the last window, where the lock was taken over between our verdict
 * and our claim.
 */
async function takeOverIfStale(lockPath: string, ttlMs: number): Promise<Reclaim> {
  const before = await inspect(lockPath, ttlMs);
  if (before === 'live') return { outcome: 'held' };
  if (before === 'gone') return { outcome: 'retry' };

  const marker = path.join(lockPath, RECLAIM_DIR);
  try {
    await fs.mkdir(marker);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    // The lock was released while we looked at it: go take it normally.
    if (code === 'ENOENT') return { outcome: 'retry' };
    // Another waiter is mid-hand-off. Let it finish — unless it died holding
    // the marker, in which case nobody could ever reclaim this lock again.
    if (code === 'EEXIST') await clearAbandonedMarker(marker, ttlMs);
    return { outcome: 'held' };
  }

  try {
    // Our verdict predates the marker. Re-read it now that we hold the marker:
    // whoever took the lock over in between wrote a fresh owner file, and it is
    // theirs, not ours to take.
    const now = await inspect(lockPath, ttlMs);
    if (now === 'live') return { outcome: 'held' };
    if (now === 'gone') return { outcome: 'retry' };

    const owner: LockOwner = { pid: process.pid, at: Date.now(), token: newToken() };
    await writeOwner(lockPath, owner);
    console.error(`[KB] Reclaimed stale lock: ${lockPath}`);
    return { outcome: 'taken', token: owner.token ?? '' };
  } catch {
    // The lock vanished under the hand-off. Nothing was taken.
    return { outcome: 'retry' };
  } finally {
    await fs.rm(marker, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Drop a take-over marker left behind by a process that died mid-hand-off.
 *
 * Without this the marker outlives its owner and no waiter can ever reclaim the
 * lock beneath it. Two waiters may both remove it; `force` makes the loser a
 * no-op, and the `mkdir` that follows still admits only one of them.
 */
async function clearAbandonedMarker(marker: string, ttlMs: number): Promise<void> {
  try {
    const stat = await fs.stat(marker);
    if (Date.now() - stat.mtimeMs < ttlMs) return;
  } catch {
    return;
  }
  await fs.rm(marker, { recursive: true, force: true }).catch(() => {});
}

/** Record who holds the lock. Rejects if the lock directory is gone. */
async function writeOwner(lockPath: string, owner: LockOwner): Promise<void> {
  await fs.writeFile(path.join(lockPath, OWNER_FILE), JSON.stringify(owner), 'utf-8');
}

/**
 * Wrap an acquisition in a lock whose `release()` frees only what we still own.
 *
 * `release()` used to delete the lock directory unconditionally. A holder whose
 * work outran the TTL — a 30s clone plus a sparse-checkout plus a copy is not
 * far off 60s — would come back to find its lock reclaimed and re-taken, and
 * delete *the new holder's* lock on the way out. A third caller then acquired
 * immediately and both published into the same cache path, so one of the two
 * renames failed. Hence the token, carried per acquisition rather than in a
 * module-level slot the next acquisition would overwrite.
 */
function makeLock(lockPath: string, token: string): DirLock {
  let released = false;
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
