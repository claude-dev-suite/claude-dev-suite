// SPDX-License-Identifier: MIT
/**
 * Path and language helpers.
 *
 * Every path the server reports is repo-relative with forward slashes, so a
 * report is readable, stable across machines, and never mistakes a Windows
 * drive letter for a separator (`C:\x.py:name`.split(':') used to do exactly
 * that and flagged every Python/Go/Java/Rust function as dead).
 */

import * as path from 'path';

export type LanguageId =
  | 'javascript'
  | 'typescript'
  | 'tsx'
  | 'python'
  | 'go'
  | 'java'
  | 'rust'
  | 'csharp';

/** Language family used for grouping in reports (tsx is TypeScript). */
export type LanguageFamily = 'javascript' | 'typescript' | 'python' | 'go' | 'java' | 'rust' | 'csharp';

const EXTENSIONS: Record<string, LanguageId> = {
  '.js': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.mts': 'typescript',
  '.cts': 'typescript',
  '.tsx': 'tsx',
  '.py': 'python',
  '.pyi': 'python',
  '.go': 'go',
  '.java': 'java',
  '.rs': 'rust',
  '.cs': 'csharp',
};

export const SUPPORTED_EXTENSIONS = Object.keys(EXTENSIONS);

export function languageForFile(file: string): LanguageId | null {
  const lower = file.toLowerCase();
  if (lower.endsWith('.d.ts') || lower.endsWith('.d.mts') || lower.endsWith('.d.cts')) return 'typescript';
  return EXTENSIONS[path.extname(lower)] ?? null;
}

export function familyOf(lang: LanguageId): LanguageFamily {
  return lang === 'tsx' ? 'typescript' : lang;
}

export function isJsLike(lang: LanguageId | null): boolean {
  return lang === 'javascript' || lang === 'typescript' || lang === 'tsx';
}

export function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

/** Repo-relative POSIX path; falls back to the absolute path outside root. */
export function relPath(root: string, abs: string): string {
  const rel = path.relative(root, abs);
  if (rel === '') return '.';
  if (rel.startsWith('..') || path.isAbsolute(rel)) return toPosix(abs);
  return toPosix(rel);
}

/** Case-insensitive on Windows, where the filesystem is. */
export function samePath(a: string, b: string): boolean {
  const na = path.resolve(a);
  const nb = path.resolve(b);
  return process.platform === 'win32' ? na.toLowerCase() === nb.toLowerCase() : na === nb;
}

export function isWithin(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

const TEST_DIR = /(^|\/)(__tests__|__mocks__|tests?|spec|specs|testing|e2e|fixtures?)\//i;
const TEST_FILE =
  /(\.(test|spec|e2e|stories)\.[cm]?[jt]sx?$)|((^|\/)test_[^/]*\.py$)|(_test\.py$)|((^|\/)conftest\.py$)|(_test\.go$)|((Test|Tests|IT)\.java$)|((Tests?|Spec)\.cs$)/;

/** Heuristic test-file detection on a repo-relative POSIX path. */
export function isTestFile(rel: string): boolean {
  return TEST_FILE.test(rel) || TEST_DIR.test(rel);
}

/** Declaration files carry types only; they have no runtime code to analyse. */
export function isDeclarationFile(rel: string): boolean {
  return /\.d\.[cm]?ts$/.test(rel);
}
