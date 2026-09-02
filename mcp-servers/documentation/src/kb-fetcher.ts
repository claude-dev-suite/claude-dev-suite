// SPDX-License-Identifier: MIT
/**
 * Fetches knowledge-base technologies out of a Git repository into the cache.
 *
 * This module runs under real concurrency: the MCP SDK dispatches requests
 * without awaiting the previous one, and a Claude Code session can point a
 * dozen subagents at the same server. Three things follow, and each one is a
 * defence in this file:
 *
 * 1. `SingleFlight` — N concurrent callers for one technology share one clone
 *    instead of each spawning `git clone`. Different technologies still run in
 *    parallel, but behind a small `Semaphore` so a wide fan-out cannot open a
 *    dozen simultaneous connections to the remote.
 * 2. Atomic publish — the cache directory used to be deleted and refilled file
 *    by file, so a concurrent reader could look inside a directory that had
 *    been emptied and get "File not found" for a file that exists. Content is
 *    now staged beside the live directory and swapped in with `rename`.
 * 3. Negative caching — a technology that is not in the KB, or a remote that
 *    is unreachable, used to cost a full clone on EVERY call from EVERY agent.
 *    The failure is remembered for a few minutes, with bounded retries and
 *    jittered backoff behind it.
 */

import { execFile as execFileCallback } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { SingleFlight, Semaphore } from '@dev-suite/shared';
import { KBCache } from './kb-cache.js';
import { acquireDirLock } from './dir-lock.js';

const execFile = promisify(execFileCallback);

// ── Concurrency and retry policy ──────────────────────────────────────────────

/** Simultaneous `git clone` processes across all technologies. */
const CLONE_CONCURRENCY = 2;
/** Total attempts for one clone before it is treated as failed. */
export const MAX_CLONE_ATTEMPTS = 3;
/** First backoff step; doubles per attempt with jitter on top. */
export const BACKOFF_BASE_MS = 500;
/** How long a failure is remembered before the network is tried again. */
export const NEGATIVE_TTL_MS = 10 * 60 * 1000;
/** Age at which another process's clone lock is considered abandoned. */
const LOCK_TTL_MS = 60_000;
/** How long to wait for another process to finish cloning the same tech. */
const LOCK_TIMEOUT_MS = 45_000;

// ── Branch name validation ────────────────────────────────────────────────────
// Accepts only safe Git branch name characters (letters, digits, _, ., -, /).
// This prevents shell injection when the branch value is used in execFile args.
const SAFE_BRANCH_RE = /^[A-Za-z0-9_./-]+$/;

function validateBranch(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback;
  if (SAFE_BRANCH_RE.test(raw)) return raw;
  console.error(
    `[KB] Unsafe KB_REPO_BRANCH value "${raw}" — falling back to "${fallback}". ` +
    'Only alphanumerics, "_", ".", "-", "/" are allowed.'
  );
  return fallback;
}

/**
 * Backoff for attempt N (1-based), with jitter.
 *
 * Jitter matters more than the exponent here: without it a burst of subagents
 * that all failed at the same instant would retry at the same instant too,
 * reproducing the thundering herd the retry was meant to spread out.
 */
export function computeBackoffDelay(
  attempt: number,
  baseMs = BACKOFF_BASE_MS,
  random: () => number = Math.random
): number {
  const exponential = baseMs * Math.pow(2, Math.max(0, attempt - 1));
  return Math.round(exponential + random() * exponential * 0.5);
}

/** A technology genuinely absent from the KB — retrying cannot help. */
function isTechnologyMissing(error: unknown): boolean {
  return error instanceof Error && error.message.includes('not found in knowledge base');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Make a technology name safe to embed in a sibling directory name. */
function safeSegment(technology: string): string {
  return technology.replace(/[^A-Za-z0-9._-]/g, '_');
}

function uniqueSuffix(): string {
  return `${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface KBFetcherConfig {
  repoUrl: string;           // KB Git repository URL
  branch?: string;           // Git branch (default: main)
  cache: KBCache;            // Cache manager instance
}

interface NegativeEntry {
  until: number;
  message: string;
}

export class KBFetcher {
  private config: KBFetcherConfig;
  /** One clone per technology, however many callers ask at once. */
  private readonly inFlight = new SingleFlight<string[]>();
  /** Bounds simultaneous clones across DIFFERENT technologies. */
  private readonly cloneLimiter = new Semaphore(CLONE_CONCURRENCY);
  /** Remembered failures, so a miss does not cost a clone on every call. */
  private readonly negative = new Map<string, NegativeEntry>();

  constructor(config: KBFetcherConfig) {
    this.config = config;
    // Validate and sanitise branch at construction time so every subsequent
    // execFile call gets the already-validated value.
    this.config.branch = validateBranch(config.branch, 'main');
  }

  /**
   * Fetch knowledge base for a technology
   * Returns list of markdown files available
   */
  async fetch(technology: string, force = false): Promise<string[]> {
    // Check cache freshness (unless forced refresh)
    if (!force && await this.config.cache.isFresh(technology)) {
      return await this.config.cache.listFiles(technology);
    }

    if (!force) {
      const negative = this.negativeHit(technology);
      if (negative) {
        // A remembered failure still prefers stale content over nothing.
        const stale = await this.config.cache.listFiles(technology);
        if (stale.length > 0) return stale;
        throw new Error(negative.message);
      }
    }

    // Everything past this point is expensive, so concurrent callers for the
    // same technology join the run already under way instead of starting one.
    return this.inFlight.run(technology, () => this.fetchExclusive(technology, force));
  }

  /** The slow path, entered by exactly one caller per technology at a time. */
  private async fetchExclusive(technology: string, force: boolean): Promise<string[]> {
    // Another caller may have filled the cache while we queued behind them.
    if (!force && await this.config.cache.isFresh(technology)) {
      return await this.config.cache.listFiles(technology);
    }

    console.error(`[KB] Cache miss for ${technology}, fetching from Git...`);

    try {
      const files = await this.cloneWithRetries(technology, force);
      this.negative.delete(technology);
      console.error(`[KB] Fetched ${files.length} files for ${technology}`);
      return files;
    } catch (error) {
      console.error(`[KB] Failed to fetch ${technology}:`, error);

      const message = isTechnologyMissing(error)
        ? (error as Error).message
        : `Failed to fetch knowledge base for ${technology}: ${error}`;

      // Remember the failure either way: without this, a technology absent
      // from the KB paid a full clone on every call of every agent.
      this.negative.set(technology, { until: Date.now() + NEGATIVE_TTL_MS, message });

      // Fallback: try to use stale cache if available
      const staleFiles = await this.config.cache.listFiles(technology);
      if (staleFiles.length > 0) {
        console.error(`[KB] Using stale cache for ${technology} (${staleFiles.length} files)`);
        return staleFiles;
      }

      throw new Error(message);
    }
  }

  /** Bounded retries with jittered exponential backoff, behind the limiter. */
  private async cloneWithRetries(technology: string, force: boolean): Promise<string[]> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_CLONE_ATTEMPTS; attempt++) {
      try {
        return await this.cloneLimiter.run(() => this.sparseCheckout(technology, force));
      } catch (error) {
        lastError = error;
        // A missing technology is a settled answer, not a transient fault.
        if (isTechnologyMissing(error)) throw error;
        if (attempt === MAX_CLONE_ATTEMPTS) break;

        const delay = computeBackoffDelay(attempt);
        console.error(
          `[KB] Clone attempt ${attempt}/${MAX_CLONE_ATTEMPTS} failed for ${technology}; ` +
          `retrying in ${delay}ms`
        );
        await sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Perform Git sparse checkout for a specific technology
   */
  private async sparseCheckout(technology: string, force = false): Promise<string[]> {
    const cachePath = this.config.cache.getCachePath(technology);
    const root = this.config.cache.root;
    const safe = safeSegment(technology);

    // Serialise across processes too: several projects share one per-user
    // cache, and each project runs its own copy of this server.
    const lock = await acquireDirLock(path.join(root, '.locks', `${safe}.lock`), {
      ttlMs: LOCK_TTL_MS,
      timeoutMs: LOCK_TIMEOUT_MS,
    });

    try {
      // The other process may have just published what we were about to fetch.
      if (lock && !force && await this.config.cache.isFresh(technology)) {
        return await this.config.cache.listFiles(technology);
      }
      return await this.cloneAndPublish(technology, cachePath, root, safe);
    } finally {
      if (lock) await lock.release();
    }
  }

  private async cloneAndPublish(
    technology: string,
    cachePath: string,
    root: string,
    safe: string
  ): Promise<string[]> {
    const tmpDir = path.join(os.tmpdir(), `kb-${uniqueSuffix()}`);

    try {
      // 1. Clone with sparse checkout enabled.
      // execFile is used instead of exec throughout this method — arguments are
      // passed as an array so the shell is never invoked and metacharacters in
      // repoUrl, branch, or tmpDir cannot be exploited.
      console.error(`[KB] Cloning ${this.config.repoUrl} (sparse)...`);

      await execFile(
        'git',
        [
          'clone', '--depth', '1', '--filter=blob:none', '--sparse',
          '--branch', this.config.branch!,
          this.config.repoUrl, tmpDir,
        ],
        { timeout: 30000 }
      );

      // 2. Configure sparse checkout to only include specific technology
      console.error(`[KB] Sparse checkout: knowledge/${technology}/`);

      await execFile(
        'git',
        ['-C', tmpDir, 'sparse-checkout', 'set', `knowledge/${technology}/`],
        { timeout: 10000 }
      );

      // 3. Get current commit hash
      const { stdout: commitHashOut } = await execFile(
        'git',
        ['-C', tmpDir, 'rev-parse', 'HEAD'],
        { timeout: 5000 }
      );

      const commit = commitHashOut.trim();

      // 4. Check if technology directory exists
      const techPath = path.join(tmpDir, 'knowledge', technology);
      try {
        await fs.access(techPath);
      } catch {
        throw new Error(`Technology '${technology}' not found in knowledge base`);
      }

      // 5. Stage next to the live directory, then swap it in.
      await this.publishAtomically(techPath, cachePath, root, safe);

      // 6. List published files
      const files = await this.config.cache.listFiles(technology);

      // 7. Update cache metadata
      await this.config.cache.updateMetadata(technology, files, commit);

      return files;
    } finally {
      // Cleanup temporary directory
      try {
        await fs.rm(tmpDir, { recursive: true, force: true });
      } catch (error) {
        console.error(`[KB] Failed to cleanup temp dir ${tmpDir}:`, error);
      }
    }
  }

  /**
   * Replace the live cache directory with freshly fetched content.
   *
   * The old code did `rm -rf` then `mkdir` then copied file by file, leaving a
   * window — as long as the copy took — where a concurrent reader saw a
   * missing or half-populated directory and reported "File not found" for
   * content that was present before and after. Here the content is fully
   * assembled in a staging directory first, and the live path only ever moves
   * between two complete states via `rename`.
   */
  private async publishAtomically(
    sourceDir: string,
    cachePath: string,
    root: string,
    safe: string
  ): Promise<void> {
    const staging = path.join(root, `.staging-${safe}-${uniqueSuffix()}`);
    const retired = path.join(root, `.retired-${safe}-${uniqueSuffix()}`);

    await fs.rm(staging, { recursive: true, force: true }).catch(() => {});
    await fs.mkdir(staging, { recursive: true });

    try {
      await this.copyDirectory(sourceDir, staging);

      // Move the previous content aside rather than deleting it, so it can be
      // put back if the swap itself fails.
      let hadPrevious = false;
      try {
        await renameWithRetry(cachePath, retired);
        hadPrevious = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }

      try {
        await renameWithRetry(staging, cachePath);
      } catch (error) {
        if (hadPrevious) {
          await renameWithRetry(retired, cachePath).catch(() => {});
        }
        throw error;
      }

      if (hadPrevious) {
        // Nothing reads this path any more; losing the delete only leaks disk.
        await fs.rm(retired, { recursive: true, force: true }).catch(() => {});
      }
    } finally {
      await fs.rm(staging, { recursive: true, force: true }).catch(() => {});
    }
  }

  /** Whether a remembered failure for this technology is still in effect. */
  private negativeHit(technology: string): NegativeEntry | null {
    const entry = this.negative.get(technology);
    if (!entry) return null;
    if (entry.until <= Date.now()) {
      this.negative.delete(technology);
      return null;
    }
    return entry;
  }

  /** Forget remembered failures. Exposed for tests and forced refreshes. */
  clearNegativeCache(technology?: string): void {
    if (technology) this.negative.delete(technology);
    else this.negative.clear();
  }

  /**
   * Recursively copy directory contents
   */
  private async copyDirectory(src: string, dest: string): Promise<void> {
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await fs.mkdir(destPath, { recursive: true });
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  /**
   * Check if Git and repository are accessible
   */
  async checkAvailability(): Promise<{ available: boolean; error?: string }> {
    try {
      // Check if git is installed — execFile never invokes a shell.
      await execFile('git', ['--version'], { timeout: 5000 });

      // Try to check remote repository (ls-remote is lightweight).
      // repoUrl and branch are passed as separate argv elements so no quoting
      // or shell escaping is required.
      await execFile(
        'git',
        ['ls-remote', this.config.repoUrl, this.config.branch!],
        { timeout: 10000 }
      );

      return { available: true };
    } catch (error) {
      return {
        available: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get file content from cache
   */
  async getFile(technology: string, file: string): Promise<string> {
    // Ensure we have the technology cached
    await this.fetch(technology);

    const filePath = this.config.cache.getCachePath(technology, file);
    const techDir = this.config.cache.getCachePath(technology);
    const notFound = () =>
      new Error(`File '${file}' not found in ${technology} knowledge base`);

    // A refresh publishes new content with two renames. A read that lands
    // between them sees no directory at all — which is not the same thing as
    // the file being absent, so distinguish the two instead of reporting a
    // missing file that is actually there.
    for (let attempt = 0; attempt < 12; attempt++) {
      try {
        return await fs.readFile(filePath, 'utf-8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw notFound();

        let dirPresent = true;
        try {
          await fs.access(techDir);
        } catch {
          dirPresent = false;
        }
        // The directory is there and the file is not: a genuine miss.
        if (dirPresent) throw notFound();

        await sleep(20);
      }
    }

    throw notFound();
  }

  /**
   * Search for files matching a pattern
   */
  async findFiles(technology: string, pattern: string): Promise<string[]> {
    const files = await this.fetch(technology);

    // Simple pattern matching (case-insensitive)
    const regex = new RegExp(pattern, 'i');
    return files.filter(f => regex.test(f));
  }
}

/**
 * `rename` on a directory can transiently fail on Windows when another handle
 * is still open inside it (an antivirus scan, a reader that has not closed
 * yet). Those are EPERM/EBUSY/EACCES and clear in milliseconds.
 */
async function renameWithRetry(from: string, to: string, attempts = 5): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await fs.rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      const transient = code === 'EPERM' || code === 'EBUSY' || code === 'EACCES';
      if (!transient || attempt >= attempts) throw error;
      await sleep(20 * attempt);
    }
  }
}
