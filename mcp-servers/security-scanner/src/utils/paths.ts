// SPDX-License-Identifier: MIT
import { existsSync, statSync } from 'fs';
import { isAbsolute, relative, resolve, sep } from 'path';
import { validateFilePath } from '@dev-suite/shared';

/** Validate a caller-supplied scan root: absolute, no null bytes, exists. */
export function validateScanPath(p: string, opts: { requireDirectory?: boolean } = {}): string {
  validateFilePath(p);
  const abs = resolve(p);
  if (!existsSync(abs)) throw new Error(`Path does not exist: ${p}`);
  if (opts.requireDirectory && !statSync(abs).isDirectory()) throw new Error(`Path is not a directory: ${p}`);
  return abs;
}

/** Path relative to root with forward slashes; absolute paths outside root are returned as-is (posix-ified). */
export function toRelPosix(root: string, p: string): string {
  if (!p) return p;
  const abs = isAbsolute(p) || /^[A-Za-z]:[\\/]/.test(p) ? resolve(p) : resolve(root, p);
  const rel = relative(root, abs);
  if (rel === '') return '.';
  if (rel.startsWith('..') || isAbsolute(rel)) return p.split(sep).join('/').replace(/\\/g, '/');
  return rel.split(sep).join('/');
}

// ---------------------------------------------------------------------------
// ReDoS-safe glob compilation for excludePaths
// ---------------------------------------------------------------------------

const REDOS_PATTERNS: RegExp[] = [
  /\([^)]*[+*][^)]*\)[+*]/,
  /\([^)]*\|[^)]*\)[+*]\+/,
  /\{[0-9,]+\}\{[0-9,]+\}/,
  /[+*]\{[0-9]/,
];

/**
 * Compile a user-supplied glob (only `*` and `**` are special) into a RegExp.
 * Rejects patterns over 500 characters or containing known ReDoS structures.
 */
export function safeGlobToRegex(pattern: string): RegExp {
  if (pattern.length > 500) {
    throw new Error(`excludePaths pattern too long (max 500 characters): ${pattern.length} characters`);
  }
  for (const dangerous of REDOS_PATTERNS) {
    if (dangerous.test(pattern)) throw new Error(`Unsafe excludePaths pattern rejected (potential ReDoS): ${pattern}`);
  }
  // Collapse runs of '*' so '**' cannot become '.*.*'.
  const source = pattern
    .replace(/\*+/g, '*')
    .replace(/[.+^${}()|[\]\\?]/g, '\\$&')
    .replace(/\*/g, '.*');
  for (const dangerous of REDOS_PATTERNS) {
    if (dangerous.test(source)) {
      throw new Error(`Unsafe excludePaths pattern (post-conversion) rejected (potential ReDoS): ${pattern}`);
    }
  }
  try {
    return new RegExp(source);
  } catch (err) {
    throw new Error(`Invalid excludePaths pattern "${pattern}": ${err instanceof Error ? err.message : String(err)}`);
  }
}

export interface ExcludeMatcher {
  (relPosixPath: string): boolean;
  patterns: string[];
}

/**
 * Build a matcher for relative POSIX paths. A pattern without `*` matches a
 * whole path segment or a leading sub-path (`dist`, `src/generated`); a
 * pattern with `*` is a glob tested against the relative path.
 */
export function makeExcludeMatcher(patterns: string[]): ExcludeMatcher {
  const compiled = patterns
    .map((p) => p.trim().replace(/\\/g, '/').replace(/^\.\//, ''))
    .filter(Boolean)
    .map((p) => (p.includes('*') ? { re: safeGlobToRegex(p) } : { seg: `/${p.replace(/^\/+|\/+$/g, '')}/` }));
  const fn = ((rel: string) => {
    const norm = rel.replace(/\\/g, '/');
    const wrapped = `/${norm}/`;
    return compiled.some((c) => ('re' in c ? c.re!.test(norm) : wrapped.includes(c.seg!)));
  }) as ExcludeMatcher;
  fn.patterns = patterns;
  return fn;
}

/** Directories never worth descending into for manifests or secrets. */
export const DEFAULT_SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '.turbo',
  '__pycache__',
  '.venv',
  'venv',
  '.tox',
  '.mypy_cache',
  'target',
  'vendor',
  'bower_components',
  '.terraform',
  '.gradle',
  '.idea',
  'coverage',
]);
