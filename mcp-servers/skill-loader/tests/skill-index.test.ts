// SPDX-License-Identifier: MIT
/**
 * The catalog walk is synchronous and slow. What matters under concurrency is
 * that it happens once at startup, never on a request path, and never twice
 * for one burst of callers.
 */

import { describe, it, expect, vi } from 'vitest';
import { SkillIndex } from '../src/skill-index.js';
import { TtlCache } from '../src/ttl-cache.js';
import type { SkillEntry } from '../src/lib.js';

function fakeEntries(n: number): SkillEntry[] {
  return Array.from({ length: n }, (_, i) => ({
    path: `cat/skill-${i}`,
    name: `skill-${i}`,
    description: 'x',
    category: 'cat',
    disableModelInvocation: false,
  }));
}

describe('SkillIndex', () => {
  it('builds once at startup, and 16 concurrent readers add nothing', async () => {
    const build = vi.fn(() => fakeEntries(3));
    const index = new SkillIndex('/skills', { build });

    index.ensureBuilt();
    expect(build).toHaveBeenCalledTimes(1);

    const results = await Promise.all(
      Array.from({ length: 16 }, async () => index.get())
    );

    expect(build).toHaveBeenCalledTimes(1);
    expect(index.builds).toBe(1);
    for (const r of results) expect(r).toHaveLength(3);
  });

  it('ensureBuilt is idempotent', () => {
    const build = vi.fn(() => fakeEntries(1));
    const index = new SkillIndex('/skills', { build });

    index.ensureBuilt();
    index.ensureBuilt();
    index.ensureBuilt();

    expect(build).toHaveBeenCalledTimes(1);
  });

  it('serves the stale catalog when the TTL lapses and refreshes behind it', () => {
    let generation = 1;
    const build = vi.fn(() => fakeEntries(generation));
    const pending: Array<() => void> = [];
    const index = new SkillIndex('/skills', {
      build,
      ttlMs: 0, // Every read is past the TTL.
      schedule: (fn) => void pending.push(fn),
    });

    index.ensureBuilt();
    expect(build).toHaveBeenCalledTimes(1);

    // The expired read returns immediately with what it has — it does NOT
    // block on a rebuild.
    generation = 5;
    expect(index.get()).toHaveLength(1);
    expect(build).toHaveBeenCalledTimes(1);
    expect(pending).toHaveLength(1);

    // Concurrent readers do not each queue a rebuild.
    index.get();
    index.get();
    expect(pending).toHaveLength(1);

    // The background rebuild lands.
    pending.shift()!();
    expect(build).toHaveBeenCalledTimes(2);
    expect(index.get()).toHaveLength(5);
  });

  it('keeps serving the previous catalog when a refresh throws', () => {
    let fail = false;
    const build = vi.fn(() => {
      if (fail) throw new Error('disk went away');
      return fakeEntries(2);
    });
    const pending: Array<() => void> = [];
    const index = new SkillIndex('/skills', {
      build,
      ttlMs: 0,
      schedule: (fn) => void pending.push(fn),
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    index.ensureBuilt();
    fail = true;
    index.get();
    pending.shift()!();

    expect(index.get()).toHaveLength(2);
  });
});

describe('TtlCache', () => {
  it('evicts the least recently used entry past the bound', () => {
    const cache = new TtlCache<string>(60_000, 3);
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3');

    // Touch 'a' so 'b' becomes the oldest.
    expect(cache.get('a')).toBe('1');

    cache.set('d', '4');

    expect(cache.size).toBe(3);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe('1');
    expect(cache.get('c')).toBe('3');
    expect(cache.get('d')).toBe('4');
  });

  it('expires entries past the TTL', () => {
    vi.useFakeTimers();
    try {
      const cache = new TtlCache<string>(1000, 10);
      cache.set('k', 'v');
      expect(cache.get('k')).toBe('v');

      vi.advanceTimersByTime(1001);
      expect(cache.get('k')).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('never grows past maxEntries however much is written', () => {
    const cache = new TtlCache<number>(60_000, 8);
    for (let i = 0; i < 500; i++) cache.set(`k${i}`, i);
    expect(cache.size).toBe(8);
    expect(cache.get('k499')).toBe(499);
  });
});
