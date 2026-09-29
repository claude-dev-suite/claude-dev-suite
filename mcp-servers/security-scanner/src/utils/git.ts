// SPDX-License-Identifier: MIT
/**
 * Diff-only support: the set of files changed between a git ref and the
 * working tree (committed, staged, unstaged and untracked), relative to the
 * scan root.
 */

import { runTool } from './exec.js';
import { getTool, unavailableMessage } from './tool-checker.js';

const REF_RE = /^[A-Za-z0-9_][A-Za-z0-9_./~^@{}+-]*$/;

export function validateGitRef(ref: string): void {
  if (!REF_RE.test(ref) || ref.includes('..') || ref.length > 200) {
    throw new Error(`Invalid baseRef "${ref}": expected a branch, tag or commit (no leading '-', no '..')`);
  }
}

async function git(root: string, args: string[], timeoutMs = 60000): Promise<string> {
  const tool = await getTool('git');
  if (!tool.available || !tool.command) throw new Error(unavailableMessage('git', tool));
  const r = await runTool(tool.command, args, { cwd: root, timeoutMs, maxOutputBytes: 32 * 1024 * 1024 }, 'git');
  if (r.exitCode !== 0) {
    throw new Error(`git ${args[0]} failed (exit ${r.exitCode}): ${r.stderr.trim().slice(0, 500)}`);
  }
  return r.stdout;
}

export interface ChangedFiles {
  /** Commit the diff is taken against (merge-base of baseRef and HEAD when it exists). */
  base: string;
  /** Paths relative to the scan root, forward slashes. */
  files: string[];
}

// baseRef is validated (no leading '-') before it reaches git, so it cannot be read as an option.
export async function changedFilesSince(root: string, baseRef: string): Promise<ChangedFiles> {
  validateGitRef(baseRef);
  await git(root, ['rev-parse', '--verify', '--quiet', `${baseRef}^{commit}`]).catch(() => {
    throw new Error(`baseRef "${baseRef}" does not resolve to a commit in ${root}`);
  });
  let base = baseRef;
  try {
    base = (await git(root, ['merge-base', baseRef, 'HEAD'])).trim() || baseRef;
  } catch {
    // No common ancestor (or no HEAD yet): diff against the ref itself.
  }
  const diff = await git(root, [
    '-c',
    'core.quotepath=off',
    'diff',
    '--name-only',
    '-z',
    '--relative',
    '--diff-filter=ACMRT',
    base,
    '--',
  ]);
  const untracked = await git(root, ['ls-files', '--others', '--exclude-standard', '-z']);
  const files = new Set<string>();
  for (const f of `${diff}\0${untracked}`.split('\0')) {
    const t = f.trim();
    if (t) files.add(t.replace(/\\/g, '/'));
  }
  return { base, files: [...files].sort() };
}

export async function isGitRepo(root: string): Promise<boolean> {
  try {
    return (await git(root, ['rev-parse', '--is-inside-work-tree'], 15000)).trim() === 'true';
  } catch {
    return false;
  }
}
