// SPDX-License-Identifier: MIT
/**
 * Minimal git plumbing: repo root, tracked+untracked file listing, and the
 * set of files changed since a ref (for diff-only analysis).
 */

import * as path from 'path';
import { runProcess } from './process.js';

const GIT_TIMEOUT = 60_000;

/** A ref is passed as an argument, never through a shell; still refuse option-like or odd input. */
export function validateGitRef(ref: string): void {
  if (!/^[A-Za-z0-9._/@{}~^:+-]{1,200}$/.test(ref) || ref.startsWith('-') || ref.includes('..')) {
    throw new Error(`Invalid git ref "${ref}": use a branch, tag, commit SHA or HEAD~N`);
  }
}

export async function gitRoot(dir: string): Promise<string | null> {
  const r = await runProcess('git', ['rev-parse', '--show-toplevel'], { cwd: dir, timeoutMs: GIT_TIMEOUT });
  if (r.code !== 0 || r.spawnError) return null;
  const out = r.stdout.trim();
  return out ? path.resolve(out) : null;
}

/** Tracked + untracked-but-not-ignored files under `sub` (repo-relative), as absolute paths. */
export async function gitListFiles(root: string, sub: string): Promise<string[] | null> {
  const args = ['ls-files', '-z', '--cached', '--others', '--exclude-standard'];
  if (sub && sub !== '.') args.push('--', sub);
  const r = await runProcess('git', args, { cwd: root, timeoutMs: GIT_TIMEOUT });
  if (r.code !== 0 || r.spawnError || r.truncated) return null;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const rel of r.stdout.split('\0')) {
    if (!rel) continue;
    const abs = path.resolve(root, rel);
    if (seen.has(abs)) continue;
    seen.add(abs);
    out.push(abs);
  }
  return out;
}

/**
 * Files changed since `ref` — committed on this branch since the merge base,
 * plus staged, unstaged and untracked changes. Deleted files are excluded.
 */
/** The merge base of `ref` and HEAD (PR semantics), or the ref's commit when unrelated. */
export async function mergeBase(root: string, ref: string): Promise<string> {
  validateGitRef(ref);
  const verify = await runProcess('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { cwd: root, timeoutMs: GIT_TIMEOUT });
  if (verify.code !== 0) {
    throw new Error(`changedSince: git ref "${ref}" does not resolve to a commit in ${root}`);
  }
  const commit = verify.stdout.trim();
  const mb = await runProcess('git', ['merge-base', commit, 'HEAD'], { cwd: root, timeoutMs: GIT_TIMEOUT });
  return mb.code === 0 && mb.stdout.trim() ? mb.stdout.trim() : commit;
}

export async function gitChangedFiles(root: string, ref: string): Promise<Set<string>> {
  const base = await mergeBase(root, ref);

  const diff = await runProcess('git', ['diff', '--name-only', '-z', '--diff-filter=ACMRT', base, '--'], {
    cwd: root,
    timeoutMs: GIT_TIMEOUT,
  });
  if (diff.code !== 0) throw new Error(`git diff failed: ${diff.stderr.trim().slice(0, 300)}`);
  const untracked = await runProcess('git', ['ls-files', '-z', '--others', '--exclude-standard'], {
    cwd: root,
    timeoutMs: GIT_TIMEOUT,
  });
  const out = new Set<string>();
  for (const rel of [...diff.stdout.split('\0'), ...untracked.stdout.split('\0')]) {
    if (rel) out.add(normalizeKey(path.resolve(root, rel)));
  }
  return out;
}

/** Added/modified line numbers per changed file since the merge base of `ref` (untracked files are absent). */
export async function gitChangedLines(root: string, ref: string): Promise<Map<string, Set<number>>> {
  const base = await mergeBase(root, ref);
  const diff = await runProcess('git', ['diff', '-U0', '--no-color', '--no-ext-diff', base, '--'], { cwd: root, timeoutMs: GIT_TIMEOUT });
  if (diff.code !== 0) throw new Error(`git diff failed: ${diff.stderr.trim().slice(0, 300)}`);
  const out = new Map<string, Set<number>>();
  let current: Set<number> | null = null;
  for (const line of diff.stdout.split('\n')) {
    if (line.startsWith('+++ ')) {
      const p = line.slice(4).trim();
      current = null;
      if (p !== '/dev/null') {
        const rel = p.replace(/^b\//, '');
        current = new Set();
        out.set(normalizeKey(path.resolve(root, rel)), current);
      }
    } else if (line.startsWith('@@') && current) {
      const m = /\+(\d+)(?:,(\d+))?/.exec(line);
      if (m) {
        const start = Number(m[1]);
        const count = m[2] === undefined ? 1 : Number(m[2]);
        for (let i = 0; i < count; i++) current.add(start + i);
      }
    }
  }
  return out;
}

/** Key for path sets: resolved, and lower-cased on case-insensitive Windows. */
export function normalizeKey(abs: string): string {
  const r = path.resolve(abs);
  return process.platform === 'win32' ? r.toLowerCase() : r;
}
