// SPDX-License-Identifier: MIT
/**
 * Shared security utilities for log-analyzer: ReDoS-safe regex compilation,
 * read/write path confinement, and secret redaction of returned text.
 */

import { isAbsolute, resolve, normalize, sep, delimiter } from 'path';
import { realpath } from 'fs/promises';
import { validateFilePath } from '@dev-suite/shared';

// ============================================================================
// ReDoS-safe regex compilation
// ============================================================================

/**
 * Known ReDoS-prone patterns: nested quantifiers, exponential backtracking.
 * Patterns like (a+)+, (a|b)*c, (a+)*, etc.
 */
const REDOS_PATTERNS: RegExp[] = [
  // Nested quantifiers: (X+)+ or (X*)+ or (X+)*
  /\([^)]*[+*][^)]*\)[+*]/,
  // Alternation with quantifier inside group followed by outer quantifier
  /\([^)]*\|[^)]*\)[+*]\+/,
  // (a{n,}){m,} — double bounded quantifier
  /\{[0-9,]+\}\{[0-9,]+\}/,
  // (a+){n,} style
  /[+*]\{[0-9]/,
];

/**
 * Safely compile a user-supplied regex pattern.
 * Throws an Error if the pattern is dangerous or invalid.
 */
export function safeRegex(pattern: string, flags?: string): RegExp {
  for (const dangerous of REDOS_PATTERNS) {
    if (dangerous.test(pattern)) {
      throw new Error(`Unsafe regex pattern rejected (potential ReDoS): ${pattern}`);
    }
  }
  if (pattern.length > 500) {
    throw new Error(`Regex pattern too long (max 500 characters): ${pattern.length} characters`);
  }
  let compiled: RegExp;
  try {
    compiled = new RegExp(pattern, flags);
  } catch (err) {
    throw new Error(
      `Invalid regex pattern "${pattern}": ${err instanceof Error ? err.message : String(err)}`
    );
  }
  const testStart = Date.now();
  compiled.test('');
  if (Date.now() - testStart > 5) {
    throw new Error(`Regex pattern rejected: execution against empty string took too long`);
  }
  return compiled;
}

// ============================================================================
// Path validation
// ============================================================================

function stripTrailingSep(p: string): string {
  return p.length > 1 && /[\\/]$/.test(p) && !/^[A-Za-z]:[\\/]$/.test(p) ? p.replace(/[\\/]+$/, '') : p;
}

/**
 * Validate that a log path is absolute and free of traversal after
 * normalisation. Throws on violation.
 */
export function validateLogPath(filePath: string): void {
  if (!filePath || typeof filePath !== 'string') {
    throw new Error('Log file path must be a non-empty string');
  }
  if (filePath.includes('\0')) {
    throw new Error('Log file path contains a null byte');
  }
  if (!isAbsolute(filePath)) {
    throw new Error(`Log file path must be absolute, got: "${filePath}"`);
  }
  const normalized = stripTrailingSep(normalize(filePath));
  const resolved = resolve(filePath);
  if (normalized !== resolved) {
    throw new Error(`Log file path contains invalid traversal sequences: "${filePath}"`);
  }
  if (normalized.split(/[\\/]/).includes('..')) {
    throw new Error(`Log file path contains traversal sequences: "${filePath}"`);
  }
  validateFilePath(filePath);
}

function isWithin(target: string, root: string): boolean {
  const a = process.platform === 'win32' ? target.toLowerCase() : target;
  const b = process.platform === 'win32' ? root.toLowerCase() : root;
  return a === b || a.startsWith(b.endsWith(sep) ? b : b + sep);
}

/** Roots configured in LOG_ALLOWED_ROOTS (path-delimiter separated), or null when unset. */
export function allowedRoots(): string[] | null {
  const raw = process.env.LOG_ALLOWED_ROOTS;
  if (!raw || raw.trim() === '') return null;
  return raw.split(delimiter).map((r) => r.trim()).filter(Boolean).map((r) => resolve(r));
}

/**
 * Check a concrete path (after symlink resolution) against LOG_ALLOWED_ROOTS.
 * Resolving symlinks first is what stops `/allowed/link -> /etc/shadow`.
 */
export async function assertReadable(path: string): Promise<string> {
  const roots = allowedRoots();
  let real: string;
  try {
    real = await realpath(path);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') throw new Error(`Log path does not exist: ${path}`);
    if (code === 'EACCES' || code === 'EPERM') throw new Error(`Permission denied reading: ${path}`);
    throw err;
  }
  if (roots) {
    const realRoots = await Promise.all(roots.map((r) => realpath(r).catch(() => r)));
    if (!realRoots.some((r) => isWithin(real, r))) {
      throw new Error(`Path is outside LOG_ALLOWED_ROOTS (${roots.join(delimiter)}): ${path}`);
    }
  }
  return real;
}

/** Validate an output path: same rules as a log path, plus LOG_EXPORT_DIR confinement. */
export function validateExportPath(outputPath: string): void {
  validateLogPath(outputPath);
  const root = process.env.LOG_EXPORT_DIR;
  if (root && root.length > 0) {
    const resolvedRoot = resolve(root);
    const resolved = resolve(outputPath);
    if (!isWithin(resolved, resolvedRoot)) {
      throw new Error(`Report output must be inside LOG_EXPORT_DIR (${resolvedRoot})`);
    }
  }
}

// ============================================================================
// Secret redaction
// ============================================================================

const REDACTIONS: Array<[RegExp, string | ((...m: string[]) => string)]> = [
  // Credentials in URLs: scheme://user:pass@host
  [/\b([a-z][a-z0-9+.-]*:\/\/[^\s:\/@]+):[^\s@\/]+@/gi, '$1:***@'],
  // Authorization headers
  [/\b(authorization|proxy-authorization)(["']?\s*[:=]\s*["']?)(bearer|basic|token|digest)\s+[A-Za-z0-9._~+\/=-]+/gi, '$1$2$3 ***'],
  [/\bbearer\s+[A-Za-z0-9._~+\/-]{16,}=*/gi, 'Bearer ***'],
  // JWTs
  [/\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, '<jwt:***>'],
  // AWS access keys, GitHub / Slack / Stripe style tokens
  [/\b(AKIA|ASIA)[0-9A-Z]{16}\b/g, '$1****************'],
  [/\b(gh[pousr]_)[A-Za-z0-9]{30,}\b/g, '$1***'],
  [/\b(xox[abprs]-)[A-Za-z0-9-]{10,}\b/g, '$1***'],
  [/\b(sk|rk|pk)_(live|test)_[A-Za-z0-9]{10,}\b/g, '$1_$2_***'],
  // key=value / "key": "value" secrets
  [
    /\b((?:[\w.-]*_)?(?:password|passwd|pwd|secret|token|api[_-]?key|apikey|access[_-]?key|private[_-]?key|client[_-]?secret|auth[_-]?token|session[_-]?secret|credentials?))(["']?\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s,;&"'}]+)/gi,
    (_m: string, k: string, sepr: string, v: string) =>
      `${k}${sepr}${v.startsWith('"') ? '"***"' : v.startsWith("'") ? "'***'" : '***'}`,
  ],
  // PEM private keys
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '-----BEGIN PRIVATE KEY----- *** -----END PRIVATE KEY-----'],
];

export function redactionEnabled(): boolean {
  const v = process.env.LOG_REDACT;
  return !(v && /^(0|false|no|off)$/i.test(v.trim()));
}

/** Redact obvious secrets from a string. */
export function redactText(text: string): string {
  let out = text;
  for (const [re, repl] of REDACTIONS) {
    out = out.replace(re, repl as string);
  }
  return out;
}

/** Deep-redact every string in a JSON-able value (bounded depth). */
export function redactDeep<T>(value: T, depth = 0): T {
  if (!redactionEnabled()) return value;
  return redactInner(value, depth) as T;
}

function redactInner(value: unknown, depth: number): unknown {
  if (typeof value === 'string') return redactText(value);
  if (depth > 12 || value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map((v) => redactInner(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (/^(password|passwd|pwd|secret|token|api[_-]?key|apikey|authorization|cookie|set-cookie|client[_-]?secret|private[_-]?key)$/i.test(k)
      && (typeof v === 'string' || typeof v === 'number')) {
      out[k] = '***';
    } else {
      out[k] = redactInner(v, depth + 1);
    }
  }
  return out;
}
