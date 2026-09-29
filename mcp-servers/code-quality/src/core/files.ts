// SPDX-License-Identifier: MIT
/**
 * Source-file discovery shared by every tool.
 *
 * Inside a git work tree the list comes from `git ls-files` (so .gitignore is
 * honoured and nothing generated is scanned); elsewhere a walker skips the
 * usual output/vendor directories. Every exclusion is counted and reported —
 * a file that was not analysed is never silently "clean".
 */

import { promises as fs, existsSync, readdirSync } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { minimatch } from 'minimatch';
import { validateFilePath } from '@dev-suite/shared';
import { mapLimit } from './concurrency.js';
import { gitChangedFiles, gitListFiles, gitRoot, normalizeKey } from './git.js';
import { isDeclarationFile, isTestFile, languageForFile, relPath, type LanguageId } from './paths.js';

/** Never descended into by the walker, and dropped from git listings too. */
const ALWAYS_IGNORED_DIRS = new Set(['node_modules', '.git', 'vendor', 'bower_components', '.venv', 'venv', '__pycache__']);
/** Build output: skipped by the walker (git listings already exclude them via .gitignore). */
const WALKER_IGNORED_DIRS = new Set([
  'dist', 'build', 'out', 'target', 'coverage', '.next', '.nuxt', '.svelte-kit', '.turbo', '.cache',
  '.tox', '.mypy_cache', '.pytest_cache', '.ruff_cache', '.gradle', '.idea', '.vscode', 'obj', 'bin',
  'env', '.eggs', 'site-packages',
]);

export const DEFAULT_MAX_FILES = 5000;
export const DEFAULT_MAX_FILE_KB = 512;

export interface ScopeOptions {
  /** Absolute file or directory. */
  path: string;
  /** Git ref: restrict findings to files changed since it (merge-base semantics). */
  changedSince?: string;
  /** Extra glob patterns (repo-relative) to exclude. */
  exclude?: string[];
  /** Include test files (default true). */
  includeTests?: boolean;
  maxFiles?: number;
  maxFileSizeKb?: number;
}

export interface SourceFile {
  abs: string;
  rel: string;
  lang: LanguageId;
  size: number;
  isTest: boolean;
}

export interface FileScope {
  /** Reporting root: the git top-level, else the analysed directory. */
  root: string;
  /** The resolved `path` argument. */
  target: string;
  targetIsFile: boolean;
  inGit: boolean;
  /** Every analysable file under `target` (after caps and exclusions). */
  files: SourceFile[];
  /** Normalised keys of changed files when `changedSince` was given. */
  changed: Set<string> | null;
  skipped: {
    tooLarge: string[];
    excludedByPattern: number;
    tests: number;
    overFileLimit: number;
    declarationFiles: number;
  };
  notes: string[];
}

export function isChanged(scope: FileScope, abs: string): boolean {
  return scope.changed === null || scope.changed.has(normalizeKey(abs));
}

/** Files that findings should be reported for (all, or only the changed ones). */
export function reportableFiles(scope: FileScope): SourceFile[] {
  return scope.changed === null ? scope.files : scope.files.filter((f) => scope.changed!.has(normalizeKey(f.abs)));
}

async function walk(dir: string, out: string[], limit: number): Promise<void> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (out.length >= limit) return;
    if (e.isDirectory()) {
      if (ALWAYS_IGNORED_DIRS.has(e.name) || WALKER_IGNORED_DIRS.has(e.name) || e.name.startsWith('.')) continue;
      await walk(path.join(dir, e.name), out, limit);
    } else if (e.isFile()) {
      out.push(path.join(dir, e.name));
    }
  }
}

const PROJECT_MARKERS = [
  'package.json', 'tsconfig.json', 'pyproject.toml', 'setup.py', 'setup.cfg', 'go.mod', 'Cargo.toml', 'pom.xml',
  'build.gradle', 'build.gradle.kts', 'settings.gradle',
];

/**
 * Outside git, the reporting/config root is the nearest ancestor that looks
 * like a project (so analysing `src/` still finds `../tsconfig.json`) — but
 * only when the analysed tree contains no project of its own, and never the
 * home or temp directory itself.
 */
function projectRootAbove(dir: string): string {
  const stops = new Set([path.resolve(os.homedir()), path.resolve(os.tmpdir())]);
  let cur = path.resolve(dir);
  for (let i = 0; i < 6; i++) {
    if (stops.has(cur)) break;
    if (PROJECT_MARKERS.some((m) => existsSync(path.join(cur, m)))) return cur;
    try {
      if (readdirSync(cur).some((f) => f.endsWith('.sln') || f.endsWith('.csproj'))) return cur;
    } catch {
      /* unreadable */
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return path.resolve(dir);
}

export async function resolveScope(opts: ScopeOptions): Promise<FileScope> {
  validateFilePath(opts.path);
  const target = path.resolve(opts.path);
  let stat;
  try {
    stat = await fs.stat(target);
  } catch {
    throw new Error(`Path does not exist: ${target}`);
  }
  const targetIsFile = stat.isFile();
  const baseDir = targetIsFile ? path.dirname(target) : target;
  const git = await gitRoot(baseDir);
  let root = git ?? baseDir;
  const maxFiles = opts.maxFiles ?? DEFAULT_MAX_FILES;
  const maxBytes = (opts.maxFileSizeKb ?? DEFAULT_MAX_FILE_KB) * 1024;
  const includeTests = opts.includeTests ?? true;
  const notes: string[] = [];

  let candidates: string[];
  if (targetIsFile) {
    candidates = [target];
  } else {
    const listed = git ? await gitListFiles(git, relPath(git, target)) : null;
    if (listed) {
      candidates = listed.filter((abs) => {
        const parts = relPath(root, abs).split('/');
        return !parts.slice(0, -1).some((p) => ALWAYS_IGNORED_DIRS.has(p));
      });
    } else {
      candidates = [];
      await walk(target, candidates, 200_000);
      if (git) notes.push('git ls-files failed; fell back to a directory walk.');
    }
  }
  if (!git) {
    const hasOwnProject = !targetIsFile && candidates.some((c) => PROJECT_MARKERS.includes(path.basename(c)));
    if (!hasOwnProject) root = projectRootAbove(baseDir);
  }

  const skipped = { tooLarge: [] as string[], excludedByPattern: 0, tests: 0, overFileLimit: 0, declarationFiles: 0 };
  const excludes = opts.exclude ?? [];
  const typed: Array<{ abs: string; rel: string; lang: LanguageId }> = [];
  for (const abs of candidates) {
    const lang = languageForFile(abs);
    if (!lang) continue;
    const rel = relPath(root, abs);
    if (!targetIsFile && isDeclarationFile(rel)) {
      skipped.declarationFiles++;
      continue;
    }
    if (excludes.some((g) => minimatch(rel, g, { dot: true, matchBase: !g.includes('/') }))) {
      skipped.excludedByPattern++;
      continue;
    }
    if (!includeTests && !targetIsFile && isTestFile(rel)) {
      skipped.tests++;
      continue;
    }
    typed.push({ abs, rel, lang });
  }
  typed.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));

  const stats = await mapLimit(typed, 64, async (f) => {
    try {
      const s = await fs.stat(f.abs);
      return s.isFile() ? s.size : -1;
    } catch {
      return -1;
    }
  });

  const files: SourceFile[] = [];
  typed.forEach((f, i) => {
    const size = stats[i];
    if (size < 0) return; // deleted but still in the index
    if (size > maxBytes) {
      skipped.tooLarge.push(f.rel);
      return;
    }
    if (files.length >= maxFiles) {
      skipped.overFileLimit++;
      return;
    }
    files.push({ ...f, size, isTest: isTestFile(f.rel) });
  });
  if (skipped.overFileLimit > 0) {
    notes.push(`File cap reached: analysed ${maxFiles} files, skipped ${skipped.overFileLimit} (raise maxFiles or narrow path).`);
  }

  let changed: Set<string> | null = null;
  if (opts.changedSince) {
    if (!git) throw new Error('changedSince requires the path to be inside a git work tree');
    changed = await gitChangedFiles(git, opts.changedSince);
  }

  return { root, target, targetIsFile, inGit: git !== null, files, changed, skipped, notes };
}

export interface LoadedFile extends SourceFile {
  content: string;
}

/** Read files with bounded parallelism; binary/minified files are dropped and counted. */
export async function loadFiles(
  files: SourceFile[],
  concurrency = 32
): Promise<{ loaded: LoadedFile[]; unreadable: string[]; generated: string[] }> {
  const unreadable: string[] = [];
  const generated: string[] = [];
  const results = await mapLimit(files, concurrency, async (f) => {
    try {
      const content = await fs.readFile(f.abs, 'utf-8');
      if (content.slice(0, 8000).includes('\0')) {
        unreadable.push(f.rel);
        return null;
      }
      if (looksGenerated(f.rel, content)) {
        generated.push(f.rel);
        return null;
      }
      return { ...f, content } as LoadedFile;
    } catch {
      unreadable.push(f.rel);
      return null;
    }
  });
  return { loaded: results.filter((r): r is LoadedFile => r !== null), unreadable, generated };
}

function looksGenerated(rel: string, content: string): boolean {
  if (/\.min\.[cm]?js$/.test(rel) || /\.bundle\.js$/.test(rel)) return true;
  const head = content.slice(0, 600);
  if (/@generated\b|DO NOT EDIT|<auto-generated/i.test(head)) return true;
  const lines = content.split('\n');
  if (lines.length <= 3 && content.length > 5000) return true;
  return false;
}

/** Summary lines describing what was not analysed, for every report. */
export function scopeNotes(scope: FileScope, extra?: { unreadable?: string[]; generated?: string[] }): string[] {
  const out = [...scope.notes];
  const s = scope.skipped;
  if (s.tooLarge.length) out.push(`${s.tooLarge.length} file(s) over the size cap skipped: ${s.tooLarge.slice(0, 5).join(', ')}${s.tooLarge.length > 5 ? ', …' : ''}`);
  if (s.tests) out.push(`${s.tests} test file(s) excluded (includeTests=false).`);
  if (s.excludedByPattern) out.push(`${s.excludedByPattern} file(s) excluded by pattern.`);
  if (extra?.generated?.length) out.push(`${extra.generated.length} generated/minified file(s) skipped.`);
  if (extra?.unreadable?.length) out.push(`${extra.unreadable.length} unreadable/binary file(s) skipped.`);
  if (scope.changed) out.push(`Diff mode: reporting only files changed since the given ref (${scope.changed.size} changed file(s) in repo).`);
  return out;
}
