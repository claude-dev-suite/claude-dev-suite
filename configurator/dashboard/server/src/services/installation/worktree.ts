// SPDX-License-Identifier: MIT
/**
 * Detect a linked git worktree, and report what a dev-suite install is missing
 * inside it.
 *
 * A fan-out of agents with `isolation: 'worktree'` gives each one a fresh
 * `git worktree add` checkout. A worktree contains only *tracked* files, so
 * everything dev-suite deliberately keeps out of git is absent there: the MCP
 * config files that carry secrets, and — in a project whose author never
 * committed them — the `.claude/` substrate and `AGENTS.md`. Nothing in the
 * codebase noticed. The agent simply ran with no MCP servers and no routing,
 * and a reinstall from inside the worktree read the missing configs as "the
 * user has no credentials" and wiped them (see install-recovery.ts).
 *
 * The MCP *bundles* under `.mcp-servers/` are not in the missing list: server
 * entries are absolute paths into the main checkout (target-paths.ts
 * `mcpServerEntry()`), so a worktree needs the config file, not 15 MB of copied
 * bundles.
 *
 * Everything here is best-effort and total: an absent `git`, a non-repository
 * path, or a malformed `.git` file all resolve to "not a worktree" rather than
 * an exception. Detection failing must never break an install.
 */

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getLogger } from '../../utils/logger.js';
import {
  DEFAULT_TARGET,
  SHARED_INSTRUCTIONS_FILE,
  mcpConfigFilesFor,
  type TargetId,
} from '../targets/target-layout.js';

const logger = getLogger('Worktree');

/** How long `git` may take before we stop caring. */
const GIT_TIMEOUT_MS = 5_000;

export interface WorktreeInfo {
  /** True when `projectPath` is a linked worktree rather than a main checkout. */
  isWorktree: boolean;
  /** Absolute path of the main checkout, when it could be resolved. */
  mainCheckout?: string;
  /**
   * Project-relative paths a dev-suite install writes that are absent here —
   * the untracked ones a worktree cannot inherit. Empty when nothing is
   * missing, and computed regardless of `isWorktree` so a plain checkout that
   * lost its config reports it too.
   */
  missingLocalFiles: string[];
  /** Why detection concluded what it did, for logs and the UI. */
  reason: string;
}

/**
 * Read the git directory a `.git` *file* points at.
 *
 * In a linked worktree `.git` is a file containing `gitdir: <path>`, absolute
 * or relative to the worktree. Returns `null` when `.git` is a directory (a
 * normal checkout), absent, or unparseable.
 *
 * A `.git` file is necessary but not sufficient: a **submodule** has one too,
 * pointing at `<super>/.git/modules/<name>`. Treating that as a worktree told
 * anyone working in a submodule that their perfectly normal checkout was missing
 * its local files, and pointed them at materialization — which rewrites the MCP
 * configs. Only a gitdir under `.git/worktrees/` is a linked worktree.
 */
function readGitdirFile(projectPath: string): string | null {
  const dotGit = path.join(projectPath, '.git');
  let stat: fs.Stats;
  try {
    stat = fs.statSync(dotGit);
  } catch {
    return null;
  }
  if (!stat.isFile()) return null;

  try {
    const match = /^\s*gitdir:\s*(.+?)\s*$/m.exec(fs.readFileSync(dotGit, 'utf-8'));
    if (!match?.[1]) return null;
    const gitdir = path.resolve(projectPath, match[1]);

    // Submodules use the same mechanism with `.git/modules/<name>`; only the
    // worktrees directory means a linked worktree.
    const segments = gitdir.split(/[\\/]+/);
    const idx = segments.lastIndexOf('worktrees');
    if (idx < 1 || segments[idx - 1] !== '.git') return null;

    return gitdir;
  } catch (error: unknown) {
    logger.warn('Could not read the .git file', { error, context: { projectPath } });
    return null;
  }
}

/**
 * Main checkout for a worktree git dir of the form
 * `<main>/.git/worktrees/<name>`. Returns `undefined` for any other shape —
 * notably a bare repository, which has no main working tree at all.
 */
function mainCheckoutFromGitdir(gitdir: string): string | undefined {
  const parts = gitdir.split(/[\\/]+/);
  const idx = parts.lastIndexOf('worktrees');
  if (idx < 1 || parts[idx - 1] !== '.git') return undefined;
  const repoGitDir = parts.slice(0, idx).join(path.sep);
  const candidate = path.dirname(repoGitDir);
  return fs.existsSync(candidate) ? path.resolve(candidate) : undefined;
}

/** Run one `git rev-parse` query, or `null` if git is unavailable or errors. */
function gitRevParse(projectPath: string, flag: string): string | null {
  try {
    const result = spawnSync('git', ['rev-parse', '--path-format=absolute', flag], {
      cwd: projectPath,
      encoding: 'utf-8',
      timeout: GIT_TIMEOUT_MS,
      windowsHide: true,
      // No shell: the project path is user-controlled and must never be parsed
      // by a command interpreter.
      shell: false,
    });
    if (result.error || result.status !== 0) return null;
    const value = (result.stdout ?? '').trim();
    return value.length > 0 ? path.resolve(value) : null;
  } catch (error: unknown) {
    logger.warn('git rev-parse failed', { error, context: { projectPath, flag } });
    return null;
  }
}

/** Targets recorded for the project, defaulting to Claude Code like the rest of the code. */
function readTargets(projectPath: string): TargetId[] {
  for (const file of ['.dev-suite.json', '.dev-suite-manifest.json']) {
    try {
      const abs = path.join(projectPath, file);
      if (!fs.existsSync(abs)) continue;
      const parsed = JSON.parse(fs.readFileSync(abs, 'utf-8')) as { targets?: unknown };
      if (Array.isArray(parsed.targets) && parsed.targets.length > 0) {
        return parsed.targets.filter((t): t is TargetId => typeof t === 'string');
      }
    } catch {
      /* unreadable — fall through to the default */
    }
  }
  return [DEFAULT_TARGET];
}

/**
 * Files an installed project should have locally but does not.
 *
 * Only meaningful once `.dev-suite.json` exists: without it there is no install
 * to be missing pieces of, and every path below would be reported as absent for
 * a project that simply never ran the wizard.
 */
export function missingLocalInstallFiles(projectPath: string): string[] {
  if (!fs.existsSync(path.join(projectPath, '.dev-suite.json'))) return [];

  const targets = readTargets(projectPath);
  const expected = new Set<string>();

  for (const target of targets) {
    for (const file of mcpConfigFilesFor(target)) expected.add(file);
  }
  // The routing file and the shared agent/skill substrate: present in a
  // worktree only if the project committed them, which is the recommended
  // setup but not guaranteed.
  expected.add(SHARED_INSTRUCTIONS_FILE);
  expected.add('.claude/agents');

  return [...expected]
    .filter(rel => !fs.existsSync(path.join(projectPath, ...rel.split('/'))))
    .sort();
}

/**
 * Main checkout of a linked worktree, using **only** the filesystem — no
 * subprocess.
 *
 * `detectWorktree()` is the complete answer but spawns `git` twice for a normal
 * checkout, and this question is asked on every secret-store read. The `.git`
 * file is what `git worktree add` writes, so the cheap check covers the case
 * that matters and returns `undefined` for everything else.
 */
export function linkedWorktreeMainCheckout(projectPath: string): string | undefined {
  try {
    const gitdir = readGitdirFile(path.resolve(projectPath));
    return gitdir ? mainCheckoutFromGitdir(gitdir) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Whether `projectPath` is a linked git worktree, and what it is missing.
 *
 * Two independent signals, in order of cost:
 *  1. `.git` is a *file* containing `gitdir:` — conclusive, and works with no
 *     `git` binary on PATH.
 *  2. `git rev-parse --git-common-dir` differs from `--git-dir` — the general
 *     answer, which also catches layouts the first check does not recognise.
 */
export function detectWorktree(projectPath: string): WorktreeInfo {
  const missingLocalFiles = safely(() => missingLocalInstallFiles(projectPath), []);

  let resolved: string;
  try {
    resolved = path.resolve(projectPath);
    if (!fs.existsSync(resolved)) {
      return { isWorktree: false, missingLocalFiles, reason: 'path does not exist' };
    }
  } catch {
    return { isWorktree: false, missingLocalFiles, reason: 'path could not be resolved' };
  }

  // 1. `.git` as a file.
  const gitdir = safely(() => readGitdirFile(resolved), null);
  if (gitdir) {
    return {
      isWorktree: true,
      mainCheckout: safely(() => mainCheckoutFromGitdir(gitdir), undefined),
      missingLocalFiles,
      reason: '.git is a file pointing at a linked worktree git dir',
    };
  }

  // 2. Ask git. Absent binary, non-repo, or any error → not a worktree.
  const commonDir = gitRevParse(resolved, '--git-common-dir');
  const gitDir = gitRevParse(resolved, '--git-dir');
  if (!commonDir || !gitDir) {
    return {
      isWorktree: false,
      missingLocalFiles,
      reason: 'not a git repository, or git is unavailable',
    };
  }

  if (path.resolve(commonDir) !== path.resolve(gitDir)) {
    return {
      isWorktree: true,
      mainCheckout: safely(
        () => (path.basename(commonDir) === '.git' ? path.dirname(commonDir) : undefined),
        undefined
      ),
      missingLocalFiles,
      reason: 'git reports a git-dir distinct from the common git dir',
    };
  }

  return { isWorktree: false, missingLocalFiles, reason: 'main checkout' };
}

/** Run `fn`, falling back to `fallback` on any throw. */
function safely<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch (error: unknown) {
    logger.warn('Worktree detection step failed — continuing', { error });
    return fallback;
  }
}
