// SPDX-License-Identifier: MIT
/**
 * Cache metadata under concurrent writers.
 *
 * All technologies used to share one `.timestamps.json`, updated with a
 * read-modify-write. Under the SDK's concurrent dispatch that is a lost-update
 * race: two technologies finishing together kept only one of the two entries.
 * Worse, a write torn by a crash left JSON that the reader could only swallow,
 * reporting every technology as stale at once — a cache wipe dressed as a
 * cache miss.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

import { KBCache } from '../src/kb-cache.js';

let cacheDir: string;
let cache: KBCache;

beforeEach(async () => {
  cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kb-meta-'));
  cache = new KBCache({ cachePath: cacheDir, ttl: 7200 });
  await cache.init();
});

afterEach(async () => {
  await fs.rm(cacheDir, { recursive: true, force: true }).catch(() => {});
});

describe('concurrent metadata updates', () => {
  it('keeps all 50 entries when 50 technologies are written at once', async () => {
    const techs = Array.from({ length: 50 }, (_, i) => `tech-${i}`);

    await Promise.all(
      techs.map((tech) => cache.updateMetadata(tech, [`${tech}.md`], 'commit-' + tech))
    );

    const listed = await cache.listCachedTechnologies();
    expect(listed.sort()).toEqual([...techs].sort());

    const stats = await cache.getStats();
    expect(stats.technologies).toBe(50);
    expect(stats.totalFiles).toBe(50);
  });

  it('does not let one technology clobber another', async () => {
    await Promise.all([
      cache.updateMetadata('react', ['a.md', 'b.md'], 'r1'),
      cache.updateMetadata('vue', ['c.md'], 'v1'),
      cache.updateMetadata('react', ['a.md', 'b.md', 'c.md'], 'r2'),
    ]);

    expect(await cache.getLastFetched('vue')).toBeTypeOf('number');
    expect(await cache.getLastFetched('react')).toBeTypeOf('number');
  });

  it('leaves no temporary files behind', async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => cache.updateMetadata(`t${i}`, ['x.md']))
    );

    const meta = await fs.readdir(path.join(cacheDir, '.meta'));
    expect(meta.filter((n) => n.includes('.tmp-'))).toEqual([]);
    expect(meta).toHaveLength(20);
  });

  it('survives a corrupt metadata file for one technology', async () => {
    await cache.updateMetadata('react', ['a.md']);
    await cache.updateMetadata('vue', ['b.md']);

    // Simulate a torn write on one file only.
    await fs.writeFile(path.join(cacheDir, '.meta', 'react.json'), '{"lastFe', 'utf-8');

    // React is stale — but Vue is untouched, which is the whole point of
    // splitting the file: one bad write is no longer everyone's problem.
    expect(await cache.getLastFetched('react')).toBeNull();
    expect(await cache.getLastFetched('vue')).toBeTypeOf('number');
  });
});

describe('legacy .timestamps.json', () => {
  it('is read for technologies that have no per-technology file yet', async () => {
    const legacyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kb-legacy-'));
    try {
      const now = Date.now();
      await fs.mkdir(path.join(legacyDir, 'react'), { recursive: true });
      await fs.writeFile(
        path.join(legacyDir, '.timestamps.json'),
        JSON.stringify({ react: { lastFetched: now, files: ['a.md'], commit: 'old' } }),
        'utf-8'
      );

      const migrated = new KBCache({ cachePath: legacyDir, ttl: 7200 });
      await migrated.init();

      expect(await migrated.listCachedTechnologies()).toContain('react');
      expect(await migrated.getLastFetched('react')).toBe(now);
      expect(await migrated.isFresh('react')).toBe(true);
    } finally {
      await fs.rm(legacyDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it('migrates forward: a new write lands in the per-technology file', async () => {
    const legacyDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kb-legacy-'));
    try {
      await fs.writeFile(
        path.join(legacyDir, '.timestamps.json'),
        JSON.stringify({ react: { lastFetched: 1, files: [], commit: 'old' } }),
        'utf-8'
      );

      const migrated = new KBCache({ cachePath: legacyDir, ttl: 7200 });
      await migrated.init();
      await migrated.updateMetadata('react', ['new.md'], 'new');

      const perTech = JSON.parse(
        await fs.readFile(path.join(legacyDir, '.meta', 'react.json'), 'utf-8')
      );
      expect(perTech.commit).toBe('new');
      expect(await migrated.getLastFetched('react')).toBe(perTech.lastFetched);
    } finally {
      await fs.rm(legacyDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});

describe('signature', () => {
  it('changes when a technology is re-fetched and is stable otherwise', async () => {
    await cache.updateMetadata('react', ['a.md']);
    const first = await cache.getSignature();
    expect(await cache.getSignature()).toBe(first);

    await new Promise((r) => setTimeout(r, 5));
    await cache.updateMetadata('react', ['a.md', 'b.md']);
    expect(await cache.getSignature()).not.toBe(first);
  });
});

describe('path containment', () => {
  it('refuses a traversing technology name', () => {
    expect(() => cache.getCachePath('../escape')).toThrow(/escapes the cache directory/);
  });

  it('refuses a traversing name for metadata too', async () => {
    // Rejected rather than written outside `.meta/`.
    await expect(cache.updateMetadata('../escape', [])).rejects.toThrow(
      /Invalid technology name/
    );
  });
});
