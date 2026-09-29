// SPDX-License-Identifier: MIT
/**
 * Tool-level behaviour and regressions for the audit findings on parse_logs,
 * analyze_patterns, export_report, search_logs and compare_logs.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { join, dirname } from 'path';
import { existsSync, readFileSync, mkdirSync } from 'fs';
import { call } from './helpers.js';
import { writeFixtures, gz, SPRING_BOOT, NGINX } from './fixtures.js';

afterEach(() => {
  delete process.env.LOG_EXPORT_DIR;
  delete process.env.LOG_REDACT;
});

const many = (n: number) => Array.from({ length: n }, (_, i) =>
  `2024-12-13 10:${String(Math.floor(i / 60) % 60).padStart(2, '0')}:${String(i % 60).padStart(2, '0')},000 - app - ${i % 10 === 0 ? 'ERROR' : 'INFO'} - message ${i}`).join('\n') + '\n';

describe('parse_logs paging', () => {
  it('honours limit above 100 (was hard-capped at 100 while advertising 1000)', async () => {
    const dir = writeFixtures({ 'a.log': many(700) });
    const r = await call('parse_logs', { filePath: join(dir, 'a.log'), limit: 500 });
    expect(r.returnedEntries).toBe(500);
    expect(r.matchedEntries).toBe(700);
    expect(r.truncated).toBe(true);
    expect(r.nextOffset).toBe(500);
    const next = await call('parse_logs', { filePath: join(dir, 'a.log'), limit: 500, offset: r.nextOffset });
    expect(next.returnedEntries).toBe(200);
    expect(next.truncated).toBeUndefined();
    expect(next.entries[0].message).toBe('message 500');
  });

  it('level counts and time range cover all matches, not just the page', async () => {
    const dir = writeFixtures({ 'a.log': many(100) });
    const r = await call('parse_logs', { filePath: join(dir, 'a.log'), limit: 5 });
    expect(r.levelCounts.ERROR).toBe(10);
    expect(r.timeRange.end).not.toBeNull();
  });

  it('rejects a limit over the maximum instead of silently shrinking it', async () => {
    const dir = writeFixtures({ 'a.log': many(3) });
    await expect(call('parse_logs', { filePath: join(dir, 'a.log'), limit: 5000 })).rejects.toThrow(/limit/);
  });
});

describe('analyze_patterns', () => {
  it('uses timeWindow (was accepted and ignored) to report the busiest window', async () => {
    const lines = [
      ...[0, 1, 2, 3].map((s) => `2024-12-13 10:00:0${s},000 - app - ERROR - read timed out`),
      '2024-12-13 11:00:00,000 - app - ERROR - read timed out',
    ].join('\n') + '\n';
    const dir = writeFixtures({ 'a.log': lines });
    const r = await call('analyze_patterns', { filePath: join(dir, 'a.log'), timeWindow: 5 });
    const p = r.patterns.find((x: any) => x.description === 'Network socket timeout');
    expect(p.count).toBe(5);
    expect(p.peakWindow.count).toBe(4);
    expect(r.timeWindowMinutes).toBe(5);
  });

  it('does not flag ids containing 429/404 as rate-limit or not-found', async () => {
    const dir = writeFixtures({ 'a.log': '2024-12-13 10:00:00,000 - app - INFO - processed order 14290 and 404123\n'.repeat(3) });
    const r = await call('analyze_patterns', { filePath: join(dir, 'a.log') });
    expect(r.patterns).toEqual([]);
  });

  it('matches 429 by the parsed HTTP status', async () => {
    const line = '10.0.0.1 - - [13/Dec/2024:10:30:45 +0000] "GET /x HTTP/1.1" 429 0 "-" "ua"';
    const dir = writeFixtures({ 'a.log': `${line}\n${line}\n` });
    const r = await call('analyze_patterns', { filePath: join(dir, 'a.log') });
    expect(r.patterns[0].category).toBe('rate-limit');
  });
});

describe('export_report', () => {
  it('the default output path honours LOG_EXPORT_DIR (it used to be written next to the log)', async () => {
    const logs = writeFixtures({ 'app.log': SPRING_BOOT });
    const out = join(writeFixtures({}), 'reports');
    mkdirSync(out);
    process.env.LOG_EXPORT_DIR = out;
    const r = await call('export_report', { filePath: join(logs, 'app.log'), outputFormat: 'markdown' });
    expect(dirname(r.outputPath)).toBe(out);
    expect(existsSync(join(logs, 'app-report.md'))).toBe(false);
    expect(readFileSync(r.outputPath, 'utf-8')).toContain('java.lang.IllegalStateException');
  });

  it('refuses an explicit path outside LOG_EXPORT_DIR, an existing file without overwrite, and the input itself', async () => {
    const dir = writeFixtures({ 'app.log': SPRING_BOOT, 'exists.html': 'old' });
    process.env.LOG_EXPORT_DIR = join(dir, 'reports');
    await expect(call('export_report', { filePath: join(dir, 'app.log'), outputFormat: 'html', outputPath: join(dir, 'x.html') })).rejects.toThrow(/LOG_EXPORT_DIR/);
    delete process.env.LOG_EXPORT_DIR;
    await expect(call('export_report', { filePath: join(dir, 'app.log'), outputFormat: 'html', outputPath: join(dir, 'exists.html') })).rejects.toThrow(/overwrite: true/);
    expect(readFileSync(join(dir, 'exists.html'), 'utf-8')).toBe('old');
    await expect(call('export_report', { filePath: join(dir, 'app.log'), outputFormat: 'json', outputPath: join(dir, 'app.log'), overwrite: true })).rejects.toThrow(/overwrite the log/);
  });

  it('writes a JSON report with redacted content', async () => {
    const dir = writeFixtures({ 'app.log': '2024-12-13 10:00:00,000 - app - ERROR - connect to postgres://svc:hunter2@db:5432/x failed\n'.repeat(2) });
    const r = await call('export_report', { filePath: join(dir, 'app.log'), outputFormat: 'json' });
    const text = readFileSync(r.outputPath, 'utf-8');
    expect(text).not.toContain('hunter2');
    expect(JSON.parse(text).errors.totalErrors).toBe(2);
  });
});

describe('redaction of tool output', () => {
  it('masks credentials in URLs, bearer tokens and key=value secrets', async () => {
    const dir = writeFixtures({
      'a.log': '2024-12-13 10:00:00,000 - app - INFO - calling https://user:s3cr3t@api.example.com with Authorization: Bearer abcdefghijklmnopqrstuvwxyz password=hunter2 api_key="AKIAABCDEFGHIJKLMNOP"\n',
    });
    const r = await call('parse_logs', { filePath: join(dir, 'a.log'), includeRaw: true });
    const text = JSON.stringify(r);
    for (const secret of ['s3cr3t', 'abcdefghijklmnopqrstuvwxyz', 'hunter2', 'AKIAABCDEFGHIJKLMNOP']) expect(text).not.toContain(secret);
    expect(text).toContain('https://user:***@api.example.com');
  });

  it('LOG_REDACT=false turns it off', async () => {
    process.env.LOG_REDACT = 'false';
    const dir = writeFixtures({ 'a.log': '2024-12-13 10:00:00,000 - app - INFO - password=hunter2\n' });
    const r = await call('parse_logs', { filePath: join(dir, 'a.log') });
    expect(JSON.stringify(r)).toContain('hunter2');
  });
});

describe('search_logs', () => {
  it('streams with context, reads gzip and reports totals', async () => {
    const text = ['a', 'b', 'NEEDLE one', 'c', 'd', 'e', 'needle two', 'f'].join('\n') + '\n';
    const dir = writeFixtures({ 'x.log': text, 'y.log.gz': gz(text) });
    const r = await call('search_logs', { filePaths: [join(dir, 'x.log'), join(dir, 'y.log.gz')], query: 'needle', context: 1 });
    expect(r.totalMatches).toBe(4);
    expect(r.filesWithMatches).toBe(2);
    expect(r.matches[0]).toMatchObject({ lineNumber: 3, contextBefore: ['b'], contextAfter: ['c'] });
    const cs = await call('search_logs', { filePath: join(dir, 'x.log'), query: 'needle', caseSensitive: true, limit: 1 });
    expect(cs.totalMatches).toBe(1);
    const inv = await call('search_logs', { filePath: join(dir, 'x.log'), query: 'needle', invert: true });
    expect(inv.totalMatches).toBe(6);
  });

  it('marks truncation when more matches exist than the limit', async () => {
    const dir = writeFixtures({ 'x.log': 'hit\n'.repeat(30) });
    const r = await call('search_logs', { filePath: join(dir, 'x.log'), query: 'hit', limit: 10 });
    expect(r.returned).toBe(10);
    expect(r.totalMatches).toBe(30);
    expect(r.truncated).toBe(true);
  });
});

describe('compare_logs', () => {
  const py = (t: string, level: string, m: string) => `2024-12-13 ${t},000 - app - ${level} - ${m}`;
  it('errors mode lists new and resolved fingerprints', async () => {
    const dir = writeFixtures({
      'before.log': [py('10:00:00', 'ERROR', 'Cache miss on key 12'), py('10:00:01', 'INFO', 'ok')].join('\n') + '\n',
      'after.log': [py('11:00:00', 'ERROR', 'Cache miss on key 99'), py('11:00:01', 'ERROR', 'Deadlock detected on table orders')].join('\n') + '\n',
    });
    const r = await call('compare_logs', { baselineFile: join(dir, 'before.log'), comparisonFile: join(dir, 'after.log'), compareBy: 'errors' });
    expect(r.newErrors.map((e: any) => e.message)).toEqual(['Deadlock detected on table orders']);
    expect(r.resolvedErrors).toEqual([]);
    expect(r.comparisons.find((c: any) => c.metric === 'Errors')).toMatchObject({ baseline: 1, comparison: 2, change: 100 });
  });

  it('level mode flags a new error class as critical and never divides by zero', async () => {
    const dir = writeFixtures({
      'before.log': py('10:00:00', 'INFO', 'ok') + '\n',
      'after.log': py('11:00:00', 'ERROR', 'boom') + '\n',
    });
    const r = await call('compare_logs', { baselineFile: join(dir, 'before.log'), comparisonFile: join(dir, 'after.log') });
    const err = r.comparisons.find((c: any) => c.metric === 'ERROR count');
    expect(err).toMatchObject({ baseline: 0, comparison: 1, change: null, significance: 'critical' });
  });

  it('templates mode', async () => {
    const dir = writeFixtures({ 'a.log': NGINX, 'b.log': SPRING_BOOT });
    const r = await call('compare_logs', { baselineFile: join(dir, 'a.log'), comparisonFile: join(dir, 'b.log'), compareBy: 'templates' });
    expect(r.newTemplates.length).toBeGreaterThan(0);
  });
});

describe('argument validation', () => {
  it('reports zod issues readably and requires a source', async () => {
    await expect(call('find_errors', {})).rejects.toThrow(/filePath/);
    await expect(call('correlate_events', { filePath: '/x.log' })).rejects.toThrow(/correlationField/);
  });

  it('unknown watch target is an error, not a success-shaped message', async () => {
    await expect(call('watch_logs', { action: 'status', filePath: join(writeFixtures({}), 'none.log') })).rejects.toThrow(/No active watcher/);
    await expect(call('watch_logs', { action: 'stop', filePath: join(writeFixtures({}), 'none.log') })).rejects.toThrow(/No active watcher/);
  });
});

