// SPDX-License-Identifier: MIT
/**
 * `search_docs` used to read every markdown file of every cached technology
 * and build a fresh Fuse index on EVERY call — once per concurrent subagent,
 * over a corpus that only changes when something is re-fetched.
 *
 * The index is memoized against the cache's fetch signature, so these tests
 * count the reads that actually reach the disk.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import path from 'path';
import os from 'os';

/** Reads of KB markdown files, i.e. the corpus loads we are trying to avoid. */
const markdownReads = { count: 0 };

vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<Record<string, any>>();
  const base = (actual.default ?? actual) as Record<string, any>;

  const readFile = (...args: any[]) => {
    if (typeof args[0] === 'string' && args[0].endsWith('.md')) markdownReads.count++;
    return base.readFile(...args);
  };

  const patched = { ...base, readFile };
  return { ...actual, ...patched, default: patched };
});

const fs = (await import('fs/promises')).default;
const { KBCache } = await import('../src/kb-cache.js');
const { searchInCache, resetSearchIndex } = await import('../src/handlers/utils.js');

let cacheDir: string;
let cache: InstanceType<typeof KBCache>;

async function seed(tech: string, files: Record<string, string>): Promise<void> {
  const dir = path.join(cacheDir, tech);
  await fs.mkdir(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    await fs.writeFile(path.join(dir, name), content, 'utf-8');
  }
  await cache.updateMetadata(tech, Object.keys(files));
}

beforeEach(async () => {
  resetSearchIndex();
  markdownReads.count = 0;
  cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kb-search-'));
  cache = new KBCache({ cachePath: cacheDir, ttl: 7200 });
  await cache.init();
  await seed('react', {
    'hooks.md': '# Hooks\nuseEffect runs after render and handles subscriptions.',
    'context.md': '# Context\nProvider and consumer for shared state.',
  });
  await seed('postgres', {
    'indexes.md': '# Indexes\nB-tree indexes speed up equality and range lookups.',
  });
});

afterEach(async () => {
  resetSearchIndex();
  await fs.rm(cacheDir, { recursive: true, force: true }).catch(() => {});
});

describe('search index memoization', () => {
  it('loads the corpus once for 16 concurrent searches', async () => {
    const results = await Promise.all(
      Array.from({ length: 16 }, () => searchInCache(cache, 'useEffect', undefined, 5))
    );

    // Three files, read once between them all.
    expect(markdownReads.count).toBe(3);
    for (const result of results) {
      expect(result[0]?.topic).toBe('hooks');
    }
  });

  it('reuses the index across sequential searches', async () => {
    await searchInCache(cache, 'useEffect');
    const afterFirst = markdownReads.count;

    await searchInCache(cache, 'B-tree');
    await searchInCache(cache, 'provider');

    expect(markdownReads.count).toBe(afterFirst);
  });

  it('rebuilds when a technology is re-fetched', async () => {
    await searchInCache(cache, 'useEffect');
    const afterFirst = markdownReads.count;

    await new Promise((r) => setTimeout(r, 5));
    await seed('svelte', { 'runes.md': '# Runes\n$state and $derived replace stores.' });

    const results = await searchInCache(cache, 'runes');
    expect(markdownReads.count).toBeGreaterThan(afterFirst);
    expect(results[0]?.technology).toBe('svelte');
  });

  it('honours the technologies filter without rebuilding per filter', async () => {
    await searchInCache(cache, 'indexes');
    const afterFirst = markdownReads.count;

    const filtered = await searchInCache(cache, 'indexes', ['postgres'], 5);
    expect(filtered.every((r) => r.technology === 'postgres')).toBe(true);

    const none = await searchInCache(cache, 'indexes', ['react'], 5);
    expect(none.every((r) => r.technology === 'react')).toBe(true);

    expect(markdownReads.count).toBe(afterFirst);
  });

  it('respects maxResults', async () => {
    const results = await searchInCache(cache, 'the', undefined, 1);
    expect(results.length).toBeLessThanOrEqual(1);
  });
});
