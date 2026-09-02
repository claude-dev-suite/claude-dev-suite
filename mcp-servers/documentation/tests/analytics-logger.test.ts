// SPDX-License-Identifier: MIT
/**
 * Analytics must not be able to stall the server it instruments.
 *
 * The old logger re-serialised the whole history and wrote it with
 * `writeFileSync` every 100ms — synchronous I/O on the event loop shared by
 * every in-flight tool call. These tests pin the append-only format, the size
 * rotation that replaces the entry-count rotation, and the fact that the
 * dashboard's `kb-usage.json` is still produced with the shape it expects.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

import { AnalyticsLogger, type KBUsageEntry } from '../src/analytics-logger.js';

let dir: string;

const sample = (technology: string): Omit<KBUsageEntry, 'id' | 'timestamp'> => ({
  tool: 'fetch_docs',
  technology,
  topic: 'hooks',
  source: 'git_cache',
  success: true,
  durationMs: 12,
});

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kb-analytics-'));
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
});

/** Let the throttled mirror write land. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 10));
}

describe('NDJSON log', () => {
  it('appends one line per entry', async () => {
    const logger = new AnalyticsLogger(dir);
    await logger.init();

    await logger.log(sample('react'));
    await logger.log(sample('vue'));
    await logger.log(sample('svelte'));
    await logger.flush();

    const raw = await fs.readFile(path.join(dir, 'kb-usage.ndjson'), 'utf-8');
    const lines = raw.trim().split('\n');
    expect(lines).toHaveLength(3);

    const parsed = lines.map((l) => JSON.parse(l) as KBUsageEntry);
    expect(parsed.map((e) => e.technology)).toEqual(['react', 'vue', 'svelte']);
    for (const entry of parsed) {
      expect(entry.id).toMatch(/^kb-/);
      expect(new Date(entry.timestamp).toString()).not.toBe('Invalid Date');
    }
  });

  it('handles a burst of concurrent logs without losing or interleaving entries', async () => {
    const logger = new AnalyticsLogger(dir);
    await logger.init();

    await Promise.all(
      Array.from({ length: 200 }, (_, i) => logger.log(sample(`tech-${i}`)))
    );
    await logger.flush();

    const raw = await fs.readFile(path.join(dir, 'kb-usage.ndjson'), 'utf-8');
    const lines = raw.trim().split('\n');
    expect(lines).toHaveLength(200);
    // Every line is complete JSON — the failure mode a full-file rewrite has.
    expect(() => lines.forEach((l) => JSON.parse(l))).not.toThrow();
  });

  it('reloads its history from the NDJSON on restart', async () => {
    const first = new AnalyticsLogger(dir);
    await first.init();
    await first.log(sample('react'));
    await first.flush();

    const second = new AnalyticsLogger(dir);
    await second.init();
    const { entries, total } = await second.getEntries();
    expect(total).toBe(1);
    expect(entries[0].technology).toBe('react');
  });

  it('drops only the torn last line, not the whole history', async () => {
    const logger = new AnalyticsLogger(dir);
    await logger.init();
    await logger.log(sample('react'));
    await logger.log(sample('vue'));
    await logger.flush();

    // Simulate a crash mid-append.
    await fs.appendFile(path.join(dir, 'kb-usage.ndjson'), '{"tool":"fetch_do', 'utf-8');

    const restarted = new AnalyticsLogger(dir);
    await restarted.init();
    const { total } = await restarted.getEntries();
    expect(total).toBe(2);
  });

  it('rotates by size, keeping one previous generation', async () => {
    const logger = new AnalyticsLogger(dir, { maxBytes: 512 });
    await logger.init();

    for (let i = 0; i < 40; i++) {
      await logger.log(sample(`tech-${i}`));
      await logger.flush();
    }

    const files = await fs.readdir(dir);
    expect(files).toContain('kb-usage.ndjson');
    expect(files).toContain('kb-usage.ndjson.1');
    // Two generations only — no unbounded pile of rotated logs.
    expect(files.filter((f) => f.startsWith('kb-usage.ndjson')).length).toBe(2);

    const current = await fs.stat(path.join(dir, 'kb-usage.ndjson'));
    expect(current.size).toBeLessThan(512 * 3);
  });
});

describe('dashboard projection', () => {
  it('still writes kb-usage.json in the shape the dashboard reads', async () => {
    const logger = new AnalyticsLogger(dir);
    await logger.init();
    await logger.log(sample('react'));
    await logger.flush();
    await settle();

    const data = JSON.parse(await fs.readFile(path.join(dir, 'kb-usage.json'), 'utf-8'));
    expect(data).toHaveProperty('version');
    expect(data).toHaveProperty('lastUpdated');
    expect(Array.isArray(data.entries)).toBe(true);
    expect(data.entries[0].technology).toBe('react');
  });

  it('leaves no temp file behind', async () => {
    const logger = new AnalyticsLogger(dir);
    await logger.init();
    await logger.log(sample('react'));
    await logger.flush();
    await settle();

    const files = await fs.readdir(dir);
    expect(files.filter((f) => f.includes('.tmp-'))).toEqual([]);
  });

  it('migrates an existing kb-usage.json into the NDJSON on first start', async () => {
    await fs.writeFile(
      path.join(dir, 'kb-usage.json'),
      JSON.stringify({
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        entries: [
          { ...sample('legacy'), id: 'kb-old-1', timestamp: new Date().toISOString() },
        ],
      }),
      'utf-8'
    );

    const logger = new AnalyticsLogger(dir);
    await logger.init();

    const raw = await fs.readFile(path.join(dir, 'kb-usage.ndjson'), 'utf-8');
    expect(raw.trim().split('\n')).toHaveLength(1);
    const { entries } = await logger.getEntries();
    expect(entries[0].technology).toBe('legacy');
  });
});

describe('stats', () => {
  it('aggregates over the loaded history', async () => {
    const logger = new AnalyticsLogger(dir);
    await logger.init();
    await logger.log(sample('react'));
    await logger.log({ ...sample('react'), success: false, source: 'error' });

    const stats = await logger.getStats();
    expect(stats.totalCalls).toBe(2);
    expect(stats.byTechnology.react).toBe(2);
    expect(stats.successRate).toBe(50);
  });
});
