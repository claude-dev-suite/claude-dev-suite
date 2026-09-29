// SPDX-License-Identifier: MIT
/**
 * Watcher. Audit: no partial-line buffering and no multiline join
 * (watch.ts:145), rename rotation kept reading the old fd (watch.ts:115),
 * SIGINT/SIGTERM handlers never exited (watch.ts:304). Driven with pollOnce()
 * so the tests are deterministic.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'path';
import { appendFileSync, renameSync, writeFileSync, truncateSync, rmSync } from 'fs';
import { LogWatcher, stopAllWatchers } from '../src/analyzers/watch.js';
import { writeFixtures } from './fixtures.js';

const L = (s: number, level: string, msg: string) => `2024-12-13 10:00:${String(s).padStart(2, '0')},000 - app - ${level} - ${msg}`;

const watchers: LogWatcher[] = [];
async function start(file: string, opts: Partial<ConstructorParameters<typeof LogWatcher>[0]> = {}) {
  const w = new LogWatcher({ filePath: file, pollInterval: 100, autoPoll: false, ...opts });
  watchers.push(w);
  await w.start();
  return w;
}
afterEach(async () => {
  for (const w of watchers.splice(0)) await w.stop();
  await stopAllWatchers();
});

const messages = (w: LogWatcher) => (w.getStatus(500).recentEntries as Array<{ message: string }>).map((e) => e.message);

describe('LogWatcher', () => {
  it('buffers a partial line until its newline arrives', async () => {
    const dir = writeFixtures({ 'a.log': L(0, 'INFO', 'existing') + '\n' });
    const f = join(dir, 'a.log');
    const w = await start(f);
    appendFileSync(f, L(1, 'INFO', 'hal'));
    await w.pollOnce();
    expect(messages(w)).toEqual([]);
    appendFileSync(f, 'f a line\n' + L(2, 'INFO', 'next') + '\n');
    await w.pollOnce();
    expect(messages(w)).toEqual(['half a line']);
  });

  it('joins a traceback into one entry and flushes it after the file goes idle', async () => {
    const dir = writeFixtures({ 'a.log': L(0, 'INFO', 'existing') + '\n' });
    const f = join(dir, 'a.log');
    const w = await start(f, { pollInterval: 100 });
    appendFileSync(f, [L(1, 'ERROR', 'job failed'), 'Traceback (most recent call last):', '  File "a.py", line 1, in <module>', 'KeyError: \'x\''].join('\n') + '\n');
    await w.pollOnce();
    await new Promise((r) => setTimeout(r, 250));
    await w.pollOnce(); // idle → flush pending entry
    const st = w.getStatus();
    const e = (st.recentEntries as any[])[0];
    expect(e.message).toBe('job failed');
    expect(e.exception.type).toBe('KeyError');
    expect((st.rules as any[])[0]).toMatchObject({ name: 'level:ERROR|FATAL', matchesTotal: 1 });
  });

  it('follows rename rotation: drains the old file, then reads the new one from the start', async () => {
    const dir = writeFixtures({ 'a.log': '' });
    const f = join(dir, 'a.log');
    const w = await start(f, { format: 'python' });
    appendFileSync(f, L(1, 'INFO', 'before rotation') + '\n');
    await w.pollOnce();
    renameSync(f, f + '.1');
    writeFileSync(f, L(2, 'INFO', 'after rotation') + '\n');
    await w.pollOnce();
    await w.pollOnce();
    await new Promise((r) => setTimeout(r, 250));
    await w.pollOnce();
    expect(messages(w)).toEqual(['before rotation', 'after rotation']);
    expect(w.rotations).toBe(1);
  });

  it('restarts from 0 after copytruncate', async () => {
    const dir = writeFixtures({ 'a.log': L(0, 'INFO', 'x'.repeat(200)) + '\n' });
    const f = join(dir, 'a.log');
    const w = await start(f, { format: 'python' });
    truncateSync(f, 0);
    appendFileSync(f, L(3, 'INFO', 'fresh') + '\n');
    await w.pollOnce();
    await new Promise((r) => setTimeout(r, 250));
    await w.pollOnce();
    expect(messages(w)).toEqual(['fresh']);
    expect(w.truncations).toBe(1);
  });

  it('waits for a file that does not exist yet', async () => {
    const dir = writeFixtures({});
    const f = join(dir, 'later.log');
    const w = await start(f, { format: 'python' });
    expect(w.state).toBe('waiting-for-file');
    writeFileSync(f, L(1, 'WARN', 'appeared') + '\n');
    await w.pollOnce();
    await new Promise((r) => setTimeout(r, 250));
    await w.pollOnce();
    expect(w.state).toBe('watching');
    expect(messages(w)).toEqual(['appeared']);
    rmSync(f);
  });

  it('threshold rules fire once per burst and report their state', async () => {
    const dir = writeFixtures({ 'a.log': '' });
    const f = join(dir, 'a.log');
    const w = await start(f, { format: 'python', alertRules: [{ name: 'timeouts', pattern: 'timeout', threshold: 3, windowSeconds: 60 }] });
    appendFileSync(f, [1, 2, 3, 4].map((i) => L(i, 'WARN', `upstream timeout ${i}`)).join('\n') + '\n' + L(9, 'INFO', 'tick') + '\n');
    await w.pollOnce();
    const st = w.getStatus();
    const rule = (st.rules as any[]).find((r) => r.name === 'timeouts');
    expect(rule).toMatchObject({ matchesTotal: 4, fireCount: 1, threshold: 3, firing: true });
    expect((st.recentAlerts as any[]).filter((a) => a.rule === 'timeouts')).toHaveLength(1);
    expect(st.alertsTriggered).toBe(1); // no ERROR-level default rule when alertRules are given
  });

  it('keeps the entry buffer bounded', async () => {
    const dir = writeFixtures({ 'a.log': '' });
    const f = join(dir, 'a.log');
    const w = await start(f, { format: 'python', maxEntries: 10 });
    appendFileSync(f, Array.from({ length: 50 }, (_, i) => L(i % 60, 'INFO', `m${i}`)).join('\n') + '\n');
    await w.pollOnce();
    expect(w.entriesMatched).toBe(49); // the last one is still pending (multiline)
    expect(messages(w)).toHaveLength(10);
  });
});
