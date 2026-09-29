// SPDX-License-Identifier: MIT
/**
 * Resolve user-supplied paths into concrete files: a file, a directory (its
 * log files, non-recursive), or a glob (`*`, `?`, `**`, `{a,b}`). Rotated
 * siblings are ordered oldest → newest so entries come out in time order:
 * app.log.3.gz, app.log.2.gz, app.log.1, app.log.
 */

import { readdir, stat } from 'fs/promises';
import { basename, dirname, join, sep } from 'path';
import { assertReadable, validateLogPath } from '../utils.js';

export interface ResolvedFile {
  path: string;
  size: number;
  mtimeMs: number;
}

export interface ResolveResult {
  files: ResolvedFile[];
  truncated: boolean;
  skipped: Array<{ path: string; reason: string }>;
}

export const DEFAULT_MAX_FILES = 200;
const MAX_WALK_ENTRIES = 20000;

const GLOB_CHARS = /[*?{[]/;

export function isGlob(p: string): boolean {
  return GLOB_CHARS.test(p);
}

/** Translate a glob (POSIX-style or Windows separators) into a RegExp over full paths. */
export function globToRegExp(glob: string): RegExp {
  const norm = glob.replace(/\\/g, '/');
  let re = '';
  for (let i = 0; i < norm.length; i++) {
    const c = norm[i];
    if (c === '*') {
      if (norm[i + 1] === '*') {
        // "**/" matches zero or more directories
        if (norm[i + 2] === '/') { re += '(?:[^/]*/)*'; i += 2; } else { re += '.*'; i++; }
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') re += '[^/]';
    else if (c === '{') {
      const end = norm.indexOf('}', i);
      if (end < 0) { re += '\\{'; continue; }
      const alts = norm.slice(i + 1, end).split(',').map((a) => a.replace(/[.+^$()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*'));
      re += `(?:${alts.join('|')})`;
      i = end;
    } else if (c === '[') {
      const end = norm.indexOf(']', i);
      if (end < 0) { re += '\\['; continue; }
      re += norm.slice(i, end + 1).replace(/^\[!/, '[^');
      i = end;
    } else re += c.replace(/[.+^$()|\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`, process.platform === 'win32' ? 'i' : '');
}

/** Likely-log file names inside a directory (compressed rotations included). */
const LOG_NAME = /\.(log|out|err|txt|json|jsonl|ndjson)(?:[.-]\d+)?(?:\.gz)?$|\.log[.-]\d{4}-?\d{2}-?\d{2}(?:\.gz)?$|\.gz$|^(?:syslog|messages|secure|auth\.log|kern\.log)(?:\.\d+)?(?:\.gz)?$/i;

/** Rotation ordering key: base name + rotation index (higher index = older). */
export function rotationKey(file: string): { base: string; index: number } {
  const name = basename(file);
  const m = name.match(/^(.*?)(?:[.-](\d{1,4}))?(?:\.gz)?$/);
  if (m && m[2] !== undefined && m[1]) return { base: join(dirname(file), m[1]), index: parseInt(m[2], 10) };
  return { base: join(dirname(file), name.replace(/\.gz$/, '')), index: 0 };
}

/** Sort files oldest-first: rotation index descending inside a group, groups by mtime. */
export function orderByTime(files: ResolvedFile[]): ResolvedFile[] {
  const groups = new Map<string, Array<ResolvedFile & { index: number }>>();
  for (const f of files) {
    const k = rotationKey(f.path);
    const list = groups.get(k.base) ?? [];
    list.push({ ...f, index: k.index });
    groups.set(k.base, list);
  }
  const ordered = [...groups.values()].map((g) => g.sort((a, b) => b.index - a.index || a.mtimeMs - b.mtimeMs));
  ordered.sort((a, b) => Math.min(...a.map((f) => f.mtimeMs)) - Math.min(...b.map((f) => f.mtimeMs)));
  return ordered.flat().map(({ index: _i, ...f }) => f);
}

async function walk(root: string, recursive: boolean, out: string[], budget: { left: number }): Promise<void> {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (budget.left-- <= 0) return;
    const full = join(root, e.name);
    if (e.isDirectory()) {
      if (recursive) await walk(full, true, out, budget);
    } else if (e.isFile() || e.isSymbolicLink()) {
      out.push(full);
    }
  }
}

/** Expand paths/dirs/globs into readable files, enforcing LOG_ALLOWED_ROOTS on each. */
export async function resolvePaths(paths: string[], maxFiles = DEFAULT_MAX_FILES): Promise<ResolveResult> {
  const candidates: string[] = [];
  const skipped: ResolveResult['skipped'] = [];

  for (const p of paths) {
    if (isGlob(p)) {
      // Static prefix before the first wildcard segment is the walk root.
      const norm = p.replace(/\\/g, '/');
      const segs = norm.split('/');
      const firstWild = segs.findIndex((s) => GLOB_CHARS.test(s));
      const rootPosix = segs.slice(0, firstWild).join('/') || '/';
      const root = process.platform === 'win32' ? rootPosix.replace(/\//g, sep) : rootPosix;
      validateLogPath(root.endsWith(':') ? root + sep : root);
      const recursive = norm.includes('**') || segs.length - firstWild > 1;
      const found: string[] = [];
      await walk(root.endsWith(':') ? root + sep : root, recursive, found, { left: MAX_WALK_ENTRIES });
      const re = globToRegExp(norm);
      const matches = found.filter((f) => re.test(f.replace(/\\/g, '/')));
      if (matches.length === 0) skipped.push({ path: p, reason: 'glob matched no files' });
      candidates.push(...matches);
      continue;
    }
    validateLogPath(p);
    let st;
    try {
      st = await stat(p);
    } catch {
      throw new Error(`Log path does not exist: ${p}`);
    }
    if (st.isDirectory()) {
      const found: string[] = [];
      await walk(p, false, found, { left: MAX_WALK_ENTRIES });
      const logs = found.filter((f) => LOG_NAME.test(basename(f)));
      if (logs.length === 0) skipped.push({ path: p, reason: 'directory contains no log-like files (*.log, *.gz, *.json, …)' });
      candidates.push(...logs);
    } else {
      candidates.push(p);
    }
  }

  const seen = new Set<string>();
  const files: ResolvedFile[] = [];
  for (const c of candidates) {
    if (seen.has(c)) continue;
    seen.add(c);
    try {
      const real = await assertReadable(c);
      const st = await stat(real);
      if (!st.isFile()) continue;
      files.push({ path: c, size: st.size, mtimeMs: st.mtimeMs });
    } catch (err) {
      // A single path the caller named explicitly must fail loudly.
      if (paths.length === 1 && !isGlob(paths[0]) && c === paths[0]) throw err;
      skipped.push({ path: c, reason: (err as Error).message });
    }
  }
  const ordered = orderByTime(files);
  return { files: ordered.slice(0, maxFiles), truncated: ordered.length > maxFiles, skipped };
}
