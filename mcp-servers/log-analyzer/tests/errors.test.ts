// SPDX-License-Identifier: MIT
/**
 * Error intelligence: fingerprinting, first/last seen, new vs known against a
 * saved baseline, another source, or another time range.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { call } from './helpers.js';
import { writeFixtures, SPRING_BOOT } from './fixtures.js';
import { normalizeMessage } from '../src/core/fingerprint.js';

afterEach(() => { delete process.env.LOG_EXPORT_DIR; });

const py = (h: string, level: string, msg: string) => `2024-12-13 ${h},000 - app - ${level} - ${msg}`;

describe('fingerprints', () => {
  it('normalises ids, numbers, uuids, ips, paths and quoted values', () => {
    expect(normalizeMessage('User 42 not found in /var/data/users.db (id=9f1c2d3e-aaaa-bbbb-cccc-0123456789ab) from 10.0.0.1:8080'))
      .toBe('User <num> not found in <path> (id=<uuid>) from <ip>');
    expect(normalizeMessage("Order 'A-1' failed")).toBe(normalizeMessage("Order 'B-77' failed"));
  });

  it('groups the same failure with different ids and keeps the cause chain', async () => {
    const dir = writeFixtures({ 'app.log': SPRING_BOOT });
    const r = await call('find_errors', { filePath: join(dir, 'app.log') });
    expect(r.totalErrors).toBe(2);
    expect(r.totalWarnings).toBe(1);
    expect(r.errorGroups).toHaveLength(1);
    const g = r.errorGroups[0];
    expect(g.count).toBe(2);
    expect(g.exceptionType).toBe('java.lang.IllegalStateException <- java.net.ConnectException');
    expect(g.causedBy[1]).toBe('java.net.ConnectException: Connection refused');
    expect(g.firstOccurrence < g.lastOccurrence).toBe(true);
  });
});

describe('new vs known', () => {
  const before = [py('10:00:00', 'ERROR', 'Payment 12 failed: card declined'), py('10:05:00', 'ERROR', 'Cache miss storm on node 3')].join('\n') + '\n';
  const after = [py('11:00:00', 'ERROR', 'Payment 99 failed: card declined'), py('11:01:00', 'ERROR', 'NullPointerException in OrderMapper')].join('\n') + '\n';

  it('saves a baseline and compares a later log against it', async () => {
    const dir = writeFixtures({ 'before.log': before, 'after.log': after });
    process.env.LOG_EXPORT_DIR = dir;
    const baseline = join(dir, 'baseline.json');
    const saved = await call('find_errors', { filePath: join(dir, 'before.log'), saveBaselineTo: baseline });
    expect(saved.savedBaseline.fingerprints).toBe(2);
    expect(JSON.parse(readFileSync(baseline, 'utf-8')).kind).toBe('log-analyzer-error-baseline');

    const r = await call('find_errors', { filePath: join(dir, 'after.log'), baselineFile: baseline });
    const status = Object.fromEntries(r.errorGroups.map((g: any) => [g.message, g.status]));
    expect(status['Payment 99 failed: card declined']).toBe('known');
    expect(status['NullPointerException in OrderMapper']).toBe('new');
    expect(r.baseline).toMatchObject({ newFingerprints: 1, knownFingerprints: 1, resolvedFingerprints: 1 });
  });

  it('refuses to overwrite a baseline without overwrite: true, and confines it to LOG_EXPORT_DIR', async () => {
    const dir = writeFixtures({ 'before.log': before });
    const baseline = join(dir, 'b.json');
    writeFileSync(baseline, '{}');
    await expect(call('find_errors', { filePath: join(dir, 'before.log'), saveBaselineTo: baseline })).rejects.toThrow(/overwrite: true/);
    const ok = await call('find_errors', { filePath: join(dir, 'before.log'), saveBaselineTo: baseline, overwrite: true });
    expect(ok.savedBaseline.overwritten).toBe(true);
    process.env.LOG_EXPORT_DIR = join(dir, 'reports');
    await expect(call('find_errors', { filePath: join(dir, 'before.log'), saveBaselineTo: join(dir, 'x.json') })).rejects.toThrow(/LOG_EXPORT_DIR/);
    expect(existsSync(join(dir, 'x.json'))).toBe(false);
  });

  it('compares against another time range of the same source in one pass', async () => {
    const dir = writeFixtures({ 'all.log': before + after });
    const r = await call('find_errors', {
      filePath: join(dir, 'all.log'),
      startTime: '2024-12-13T10:30:00', baselineStartTime: '2024-12-13T09:00:00', baselineEndTime: '2024-12-13T10:30:00',
    });
    expect(r.totalErrors).toBe(2);
    expect(r.baseline.newErrors.map((e: any) => e.message)).toEqual(['NullPointerException in OrderMapper']);
  });

  it('compares against other files (baselinePaths)', async () => {
    const dir = writeFixtures({ 'before.log': before, 'after.log': after });
    const r = await call('find_errors', { filePath: join(dir, 'after.log'), baselinePaths: [join(dir, 'before.log')] });
    expect(r.baseline.newFingerprints).toBe(1);
  });

  it('rejects a file that is not a baseline', async () => {
    const dir = writeFixtures({ 'after.log': after, 'bogus.json': '{"a":1}' });
    await expect(call('find_errors', { filePath: join(dir, 'after.log'), baselineFile: join(dir, 'bogus.json') })).rejects.toThrow(/not a log-analyzer error baseline/);
  });
});
