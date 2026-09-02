// SPDX-License-Identifier: MIT
/**
 * Single-flight only covers one process. Every project a user opens starts its
 * own documentation server against the same per-user cache, so the lock is
 * what stops two processes cloning the same technology into the same place.
 *
 * It is advisory on purpose: failing to get it means "do the work anyway", not
 * "fail". A cache directory must never be able to wedge the server.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

import { acquireDirLock } from '../src/dir-lock.js';

let dir: string;
let lockPath: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kb-lock-'));
  lockPath = path.join(dir, 'locks', 'react.lock');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
});

describe('acquireDirLock', () => {
  it('grants the lock and records its owner', async () => {
    const lock = await acquireDirLock(lockPath);
    expect(lock).not.toBeNull();

    const owner = JSON.parse(await fs.readFile(path.join(lockPath, 'owner.json'), 'utf-8'));
    expect(owner.pid).toBe(process.pid);
    expect(typeof owner.at).toBe('number');

    await lock!.release();
    await expect(fs.access(lockPath)).rejects.toThrow();
  });

  it('grants it to only one of many simultaneous callers', async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () => acquireDirLock(lockPath, { timeoutMs: 0 }))
    );

    expect(results.filter(Boolean)).toHaveLength(1);
    for (const lock of results) await lock?.release();
  });

  it('gives up rather than hanging when the holder does not let go', async () => {
    const held = await acquireDirLock(lockPath);
    expect(held).not.toBeNull();

    const started = Date.now();
    const second = await acquireDirLock(lockPath, { timeoutMs: 120, pollMs: 20 });

    expect(second).toBeNull();
    expect(Date.now() - started).toBeLessThan(3000);
    await held!.release();
  });

  it('reclaims a lock left behind by a dead process', async () => {
    await fs.mkdir(lockPath, { recursive: true });
    await fs.writeFile(
      path.join(lockPath, 'owner.json'),
      JSON.stringify({ pid: 999999, at: Date.now() - 120_000 }),
      'utf-8'
    );

    const lock = await acquireDirLock(lockPath, { ttlMs: 60_000, timeoutMs: 500 });
    expect(lock).not.toBeNull();

    const owner = JSON.parse(await fs.readFile(path.join(lockPath, 'owner.json'), 'utf-8'));
    expect(owner.pid).toBe(process.pid);
    await lock!.release();
  });

  it('does not steal a lock that is still within its TTL', async () => {
    await fs.mkdir(lockPath, { recursive: true });
    await fs.writeFile(
      path.join(lockPath, 'owner.json'),
      JSON.stringify({ pid: 999999, at: Date.now() }),
      'utf-8'
    );

    expect(await acquireDirLock(lockPath, { ttlMs: 60_000, timeoutMs: 50, pollMs: 10 })).toBeNull();
  });

  it('releases idempotently', async () => {
    const lock = await acquireDirLock(lockPath);
    await lock!.release();
    await expect(lock!.release()).resolves.toBeUndefined();
  });

  it('does not release a lock that was reclaimed while it was held', async () => {
    // The holder's work can outrun the TTL — a 30s clone plus a sparse checkout
    // plus a copy is not far from 60s. It would then come back and delete the
    // lock the *new* holder had taken, letting a third caller in and putting two
    // publishers on the same cache path.
    const mine = await acquireDirLock(lockPath, { ttlMs: 60_000 });
    expect(mine).not.toBeNull();

    // Simulate the reclaim: someone else now owns the same path.
    await fs.writeFile(
      path.join(lockPath, 'owner.json'),
      JSON.stringify({ pid: process.pid + 1, at: Date.now(), token: 'somebody-else' }),
      'utf-8'
    );

    await mine!.release();

    // Still there, and still theirs.
    const owner = JSON.parse(await fs.readFile(path.join(lockPath, 'owner.json'), 'utf-8'));
    expect(owner.token).toBe('somebody-else');
  });

  it('still releases its own lock', async () => {
    const mine = await acquireDirLock(lockPath, { ttlMs: 60_000 });
    await mine!.release();

    await expect(fs.stat(lockPath)).rejects.toThrow();
  });

  it('lets exactly one waiter reclaim a stale lock', async () => {
    // Observing staleness and removing the directory are two operations. Two
    // waiters could both observe the same stale lock and the second one's remove
    // would delete the first one's fresh lock, leaving two holders.
    await fs.mkdir(lockPath, { recursive: true });
    await fs.writeFile(
      path.join(lockPath, 'owner.json'),
      JSON.stringify({ pid: 999999, at: Date.now() - 120_000, token: 'dead' }),
      'utf-8'
    );

    const results = await Promise.all(
      Array.from({ length: 8 }, () => acquireDirLock(lockPath, { ttlMs: 1_000, timeoutMs: 400, pollMs: 5 }))
    );

    // At most one, and that is the whole point: nobody releases until the end,
    // so a second holder could only exist if two waiters had both reclaimed the
    // same stale lock. The losers time out and return null, which callers treat
    // as "go ahead unlocked".
    //
    // Not exactly one: under enough load every waiter can miss a deadline this
    // short, and a test that fails because the machine was busy teaches people
    // to re-run rather than to look. The double-reclaim this guards against
    // shows up as two or more, and the reclaim itself is asserted below.
    const holders = results.filter(Boolean);
    expect(holders.length).toBeLessThanOrEqual(1);

    const owner = JSON.parse(await fs.readFile(path.join(lockPath, 'owner.json'), 'utf-8'));
    expect(owner.token).not.toBe('dead');

    for (const lock of holders) await lock!.release();
  });

  it('gives up instead of spinning when the lock directory cannot be created', async () => {
    // The failure this pins: mkdir failing for anything other than EEXIST used
    // to be reported the same way as "someone else holds it", while the
    // staleness check saw no lock directory and reported progress — so the loop
    // jumped over its own deadline forever. It ran inside the clone semaphore,
    // so two of these silenced the whole server for every technology.
    //
    // A file where the lock's parent directory should be makes mkdir fail for a
    // reason no amount of waiting can fix. Whether the platform reports it as
    // unusable (return at once) or as held (return at the deadline) does not
    // matter: what must never happen is not returning.
    const blocker = path.join(dir, 'not-a-directory');
    await fs.writeFile(blocker, 'x', 'utf-8');

    const started = Date.now();
    const lock = await acquireDirLock(path.join(blocker, 'react.lock'), {
      timeoutMs: 300,
      pollMs: 20,
    });

    expect(lock).toBeNull();
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it('still honours the deadline when the lock keeps disappearing', async () => {
    // The stale-reclaim path is the one that used to `continue` past the
    // deadline check. A lock directory with no owner file is reclaimable on
    // every pass, which is exactly the shape that spun.
    await fs.mkdir(lockPath, { recursive: true });
    const reclaimable = path.join(dir, 'locks', 'vue.lock');
    await fs.mkdir(reclaimable, { recursive: true });

    const started = Date.now();
    const lock = await acquireDirLock(reclaimable, { ttlMs: 0, timeoutMs: 200, pollMs: 10 });
    const elapsed = Date.now() - started;

    // Either it reclaims and takes the lock, or it hits the deadline. Both are
    // fine; hanging is not.
    if (lock) await lock.release();
    expect(elapsed).toBeLessThan(5_000);
  });
});
