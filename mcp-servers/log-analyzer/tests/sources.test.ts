// SPDX-License-Identifier: MIT
/**
 * Sources: directories, globs, rotated + gzip files in time order, head-only
 * detection, tail by seeking from the end, and LOG_ALLOWED_ROOTS.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { join } from 'path';
import { symlinkSync, statSync } from 'fs';
import { call } from './helpers.js';
import { writeFixtures, gz } from './fixtures.js';
import { resolvePaths, globToRegExp, orderByTime } from '../src/sources/resolve.js';
import * as files from '../src/sources/files.js';

const line = (h: number, msg: string) => `2024-12-13 ${String(h).padStart(2, '0')}:00:00,000 - app - INFO - ${msg}`;

afterEach(() => {
  delete process.env.LOG_ALLOWED_ROOTS;
  vi.restoreAllMocks();
});

describe('rotation and gzip', () => {
  it('reads a directory oldest-first: app.log.2.gz, app.log.1, app.log', async () => {
    const dir = writeFixtures({
      'app.log': line(12, 'newest') + '\n',
      'app.log.1': line(11, 'middle') + '\n',
      'app.log.2.gz': gz(line(10, 'oldest') + '\n'),
      'notes.md': 'not a log',
    });
    const r = await call('parse_logs', { filePath: dir });
    expect(r.entries.map((e: any) => e.message)).toEqual(['oldest', 'middle', 'newest']);
    expect(r.formats).toHaveLength(3);
  });

  it('detects gzip by magic bytes, not the extension', async () => {
    const dir = writeFixtures({ 'weird-name.log': gz(line(10, 'compressed') + '\n') });
    const r = await call('parse_logs', { filePath: join(dir, 'weird-name.log') });
    expect(r.entries[0].message).toBe('compressed');
  });

  it('orders by rotation index within a group and by mtime across groups', () => {
    const ordered = orderByTime([
      { path: '/l/b.log', size: 1, mtimeMs: 50 },
      { path: '/l/a.log', size: 1, mtimeMs: 300 },
      { path: '/l/a.log.1', size: 1, mtimeMs: 200 },
      { path: '/l/a.log.3.gz', size: 1, mtimeMs: 10 },
    ]);
    expect(ordered.map((f) => f.path.replace(/\\/g, '/'))).toEqual(['/l/a.log.3.gz', '/l/a.log.1', '/l/a.log', '/l/b.log']);
  });
});

describe('globs', () => {
  it('matches *, ** and {a,b}', () => {
    expect(globToRegExp('/var/log/**/*.log').test('/var/log/a/b/c.log')).toBe(true);
    expect(globToRegExp('/var/log/*.{log,gz}').test('/var/log/x.gz')).toBe(true);
    expect(globToRegExp('/var/log/*.log').test('/var/log/a/b.log')).toBe(false);
  });

  it('expands a glob into files', async () => {
    const dir = writeFixtures({ 'svc-a.log': line(10, 'a') + '\n', 'svc-b.log': line(11, 'b') + '\n', 'other.txt': 'x\n' });
    const r = await resolvePaths([join(dir, 'svc-*.log')]);
    expect(r.files).toHaveLength(2);
  });

  it('reports a glob that matched nothing instead of returning an empty result', async () => {
    const dir = writeFixtures({ 'a.log': 'x\n' });
    await expect(call('parse_logs', { filePath: join(dir, 'nothing-*.log') })).rejects.toThrow(/matched no files/);
  });
});

describe('efficient reading', () => {
  it('format detection reads only the head of a large file', async () => {
    const big = Array.from({ length: 50000 }, (_, i) => line(10, `msg ${i} ${'x'.repeat(40)}`)).join('\n') + '\n';
    const dir = writeFixtures({ 'big.log': big });
    const spy = vi.spyOn(files, 'readHead');
    const r = await call('parse_logs', { filePath: join(dir, 'big.log'), limit: 1 });
    expect(r.formats[0].format).toBe('python');
    expect(spy).toHaveBeenCalled();
    const head = await files.readHead(join(dir, 'big.log'));
    expect(head.join('\n').length).toBeLessThanOrEqual(64 * 1024);
  });

  it('tail_logs seeks from the end instead of parsing the whole file', async () => {
    const big = Array.from({ length: 60000 }, (_, i) => line(10, `msg ${i} ${'y'.repeat(60)}`)).join('\n') + '\n';
    const dir = writeFixtures({ 'big.log': big });
    const size = statSync(join(dir, 'big.log')).size;
    const r = await call('tail_logs', { filePath: join(dir, 'big.log'), lines: 5 });
    expect(r.entries.map((e: any) => e.message.split(' ')[1])).toEqual(['59995', '59996', '59997', '59998', '59999']);
    expect(r.scannedBytesFromEnd).toBeLessThan(size / 10);
  });

  it('tail_logs keeps multi-line entries whole', async () => {
    const text = [line(10, 'a'), '2024-12-13 11:00:00,000 - app - ERROR - boom', 'Traceback (most recent call last):', '  File "a.py", line 1, in <module>', 'KeyError: 1'].join('\n') + '\n';
    const dir = writeFixtures({ 't.log': text });
    const r = await call('tail_logs', { filePath: join(dir, 't.log'), lines: 1 });
    expect(r.entries[0].exception.type).toBe('KeyError');
  });
});

describe('LOG_ALLOWED_ROOTS', () => {
  it('refuses paths outside the configured roots', async () => {
    const allowed = writeFixtures({ 'ok.log': line(10, 'ok') + '\n' });
    const other = writeFixtures({ 'secret.log': line(10, 'secret') + '\n' });
    process.env.LOG_ALLOWED_ROOTS = allowed;
    const r = await call('parse_logs', { filePath: join(allowed, 'ok.log') });
    expect(r.entries[0].message).toBe('ok');
    await expect(call('parse_logs', { filePath: join(other, 'secret.log') })).rejects.toThrow(/outside LOG_ALLOWED_ROOTS/);
  });

  it('resolves symlinks before checking (a link inside cannot point outside)', async () => {
    const allowed = writeFixtures({});
    const other = writeFixtures({ 'secret.log': line(10, 'secret') + '\n' });
    try {
      symlinkSync(join(other, 'secret.log'), join(allowed, 'link.log'));
    } catch {
      return; // symlinks need privileges on some Windows setups
    }
    process.env.LOG_ALLOWED_ROOTS = allowed;
    await expect(call('parse_logs', { filePath: join(allowed, 'link.log') })).rejects.toThrow(/outside LOG_ALLOWED_ROOTS/);
  });

  it('rejects relative paths and null bytes', async () => {
    await expect(call('parse_logs', { filePath: 'relative/app.log' })).rejects.toThrow(/absolute/);
    const dir = writeFixtures({});
    await expect(call('parse_logs', { filePath: join(dir, 'a\0b.log') })).rejects.toThrow(/null byte/);
  });

  it('a missing file is an error, not an empty result', async () => {
    const dir = writeFixtures({});
    await expect(call('parse_logs', { filePath: join(dir, 'missing.log') })).rejects.toThrow(/does not exist/);
  });
});

