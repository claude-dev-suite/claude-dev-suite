// SPDX-License-Identifier: MIT
/**
 * Concurrency contract of the KB fetcher.
 *
 * The MCP SDK dispatches requests without awaiting the previous one
 * (`Protocol._onrequest` is called, not awaited), so a Claude Code session
 * running many subagents drives this class re-entrantly. Every test here
 * describes something that was observably wrong before:
 *
 * - N callers for one technology produced N `git clone` processes.
 * - N callers for N technologies produced N simultaneous clones.
 * - Publishing deleted the live cache directory and refilled it file by file,
 *   so a concurrent reader got "File not found" for a file that exists.
 * - A failure was never remembered, so a technology missing from the KB cost a
 *   full clone on every call of every agent, forever.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

// ── git stub ──────────────────────────────────────────────────────────────────

interface GitState {
  cloneCalls: number;
  activeClones: number;
  maxActiveClones: number;
  /** Technologies the fake remote knows about. */
  technologies: string[];
  /** Files created per technology. */
  files: string[];
  /** How long a clone takes, in ms. */
  cloneDelayMs: number;
  /** When set, every clone fails with this error. */
  failWith: Error | null;
}

const git: GitState = {
  cloneCalls: 0,
  activeClones: 0,
  maxActiveClones: 0,
  technologies: ['react'],
  files: ['overview.md', 'hooks.md', 'patterns.md'],
  cloneDelayMs: 15,
  failWith: null,
};

function resetGit(): void {
  git.cloneCalls = 0;
  git.activeClones = 0;
  git.maxActiveClones = 0;
  git.technologies = ['react'];
  git.files = ['overview.md', 'hooks.md', 'patterns.md'];
  git.cloneDelayMs = 15;
  git.failWith = null;
}

async function fakeClone(targetDir: string): Promise<void> {
  git.cloneCalls++;
  git.activeClones++;
  git.maxActiveClones = Math.max(git.maxActiveClones, git.activeClones);
  try {
    if (git.failWith) throw git.failWith;
    await new Promise((r) => setTimeout(r, git.cloneDelayMs));
    for (const tech of git.technologies) {
      const dir = path.join(targetDir, 'knowledge', tech);
      await fs.mkdir(dir, { recursive: true });
      for (const file of git.files) {
        await fs.writeFile(path.join(dir, file), `# ${tech} / ${file}\ncontent\n`, 'utf-8');
      }
    }
  } finally {
    git.activeClones--;
  }
}

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    execFile: (cmd: string, args: string[], options: unknown, callback?: unknown) => {
      const cb = (typeof options === 'function' ? options : callback) as (
        err: unknown,
        out?: { stdout: string; stderr: string }
      ) => void;

      const run = async (): Promise<string> => {
        if (cmd !== 'git') return '';
        if (args[0] === 'clone') {
          await fakeClone(args[args.length - 1]);
          return '';
        }
        if (args.includes('rev-parse')) return 'a'.repeat(40) + '\n';
        return '';
      };

      run().then(
        (stdout) => cb(null, { stdout, stderr: '' }),
        (err) => cb(err)
      );
      return { on() {}, kill() {} } as never;
    },
  };
});

// Imported after the mock so the promisified handle is the stubbed one.
const { KBCache } = await import('../src/kb-cache.js');
const { KBFetcher, computeBackoffDelay, MAX_CLONE_ATTEMPTS } = await import(
  '../src/kb-fetcher.js'
);

// ── harness ───────────────────────────────────────────────────────────────────

let cacheDir: string;
let cache: InstanceType<typeof KBCache>;
let fetcher: InstanceType<typeof KBFetcher>;

beforeEach(async () => {
  resetGit();
  cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kb-test-'));
  cache = new KBCache({ cachePath: cacheDir, ttl: 7200 });
  await cache.init();
  fetcher = new KBFetcher({
    repoUrl: 'https://example.invalid/kb.git',
    branch: 'main',
    cache,
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(cacheDir, { recursive: true, force: true }).catch(() => {});
});

/**
 * Replace `setTimeout` with one that records the requested delay and fires
 * immediately, so backoff can be asserted without waiting seconds for it.
 */
function captureDelays(): number[] {
  const delays: number[] = [];
  const real = globalThis.setTimeout;
  vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms?: number) => {
    delays.push(ms ?? 0);
    return real(fn, 0);
  }) as typeof setTimeout);
  return delays;
}

// ── tests ─────────────────────────────────────────────────────────────────────

describe('single-flight over git clone', () => {
  it('collapses 16 concurrent fetches of one technology into one clone', async () => {
    const results = await Promise.all(
      Array.from({ length: 16 }, () => fetcher.fetch('react'))
    );

    expect(git.cloneCalls).toBe(1);
    expect(results).toHaveLength(16);
    const first = [...results[0]].sort();
    expect(first).toEqual([...git.files].sort());
    for (const result of results) {
      expect([...result].sort()).toEqual(first);
    }
  });

  it('bounds simultaneous clones across different technologies', async () => {
    git.technologies = Array.from({ length: 12 }, (_, i) => `tech-${i}`);

    await Promise.all(git.technologies.map((tech) => fetcher.fetch(tech)));

    // Every technology genuinely needed its own clone...
    expect(git.cloneCalls).toBe(12);
    // ...but never more than two ran at the same time.
    expect(git.maxActiveClones).toBeLessThanOrEqual(2);
  });

  it('serves a second fetch of a fresh technology from cache', async () => {
    await fetcher.fetch('react');
    await fetcher.fetch('react');
    expect(git.cloneCalls).toBe(1);
  });
});

describe('atomic publish', () => {
  it('never reports a missing file while the technology is being refreshed', async () => {
    await fetcher.fetch('react');

    let stop = false;
    const failures: string[] = [];

    const reader = (async () => {
      while (!stop) {
        try {
          const content = await fetcher.getFile('react', 'overview.md');
          expect(content).toContain('react');
        } catch (error) {
          failures.push((error as Error).message);
        }
        await new Promise((r) => setImmediate(r));
      }
    })();

    // Eight forced refreshes, each of which republishes the directory.
    for (let i = 0; i < 8; i++) {
      await fetcher.fetch('react', true);
    }

    stop = true;
    await reader;

    expect(failures).toEqual([]);
  });

  it('leaves no staging or retired directories behind', async () => {
    await fetcher.fetch('react');
    await fetcher.fetch('react', true);

    const leftovers = (await fs.readdir(cacheDir)).filter(
      (name) => name.startsWith('.staging-') || name.startsWith('.retired-')
    );
    expect(leftovers).toEqual([]);
  });

  it('still reports a genuinely absent file', async () => {
    await fetcher.fetch('react');
    await expect(fetcher.getFile('react', 'nope.md')).rejects.toThrow(
      "File 'nope.md' not found in react knowledge base"
    );
  });
});

describe('backoff and negative caching', () => {
  it('retries a failing clone with a growing delay, then remembers the failure', async () => {
    const delays = captureDelays();
    git.failWith = new Error('fatal: unable to access remote');

    await expect(fetcher.fetch('react')).rejects.toThrow(/Failed to fetch knowledge base/);

    expect(git.cloneCalls).toBe(MAX_CLONE_ATTEMPTS);
    // One sleep between each pair of attempts, each longer than the last.
    const backoffs = delays.filter((d) => d > 0);
    expect(backoffs).toHaveLength(MAX_CLONE_ATTEMPTS - 1);
    expect(backoffs[1]).toBeGreaterThan(backoffs[0]);

    // A second call inside the negative TTL costs nothing.
    const before = git.cloneCalls;
    await expect(fetcher.fetch('react')).rejects.toThrow(/Failed to fetch knowledge base/);
    expect(git.cloneCalls).toBe(before);
  });

  it('does not retry a technology that is simply not in the knowledge base', async () => {
    git.technologies = ['react'];

    await expect(fetcher.fetch('nonexistent')).rejects.toThrow(
      "Technology 'nonexistent' not found in knowledge base"
    );
    // One clone, no retries: the answer will not change.
    expect(git.cloneCalls).toBe(1);

    await expect(fetcher.fetch('nonexistent')).rejects.toThrow(
      "Technology 'nonexistent' not found in knowledge base"
    );
    expect(git.cloneCalls).toBe(1);
  });

  it('collapses a burst against a missing technology into one clone', async () => {
    const settled = await Promise.allSettled(
      Array.from({ length: 16 }, () => fetcher.fetch('nonexistent'))
    );

    expect(settled.every((s) => s.status === 'rejected')).toBe(true);
    expect(git.cloneCalls).toBe(1);
  });

  it('prefers stale content over a remembered failure', async () => {
    await fetcher.fetch('react');
    git.failWith = new Error('network down');

    // Force past the TTL so the fetcher tries the network and fails.
    const stale = await fetcher.fetch('react', true).catch(() => null);
    expect(stale).not.toBeNull();
    expect(stale).toHaveLength(git.files.length);
  });

  it('tries again once the negative entry is cleared', async () => {
    git.failWith = new Error('network down');
    await expect(fetcher.fetch('react')).rejects.toThrow();
    const afterFailure = git.cloneCalls;

    git.failWith = null;
    fetcher.clearNegativeCache('react');

    await expect(fetcher.fetch('react')).resolves.toHaveLength(git.files.length);
    expect(git.cloneCalls).toBeGreaterThan(afterFailure);
  });

  it('grows the backoff and keeps it jittered', () => {
    const constant = () => 0.5;
    expect(computeBackoffDelay(1, 500, constant)).toBe(625);
    expect(computeBackoffDelay(2, 500, constant)).toBe(1250);
    expect(computeBackoffDelay(3, 500, constant)).toBe(2500);

    // Jitter actually varies the value, so a burst does not retry in lockstep.
    expect(computeBackoffDelay(1, 500, () => 0)).toBeLessThan(
      computeBackoffDelay(1, 500, () => 1)
    );
  });
});
