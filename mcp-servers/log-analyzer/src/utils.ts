// SPDX-License-Identifier: MIT
/**
 * Shared security utilities for log-analyzer
 */

import { isAbsolute, resolve, normalize, sep } from "path";

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
  // Alternation with quantifier inside group followed by outer quantifier: (a|b)+
  // combined with potential catastrophic input — we only reject deeply nested forms
  /\([^)]*\|[^)]*\)[+*]\+/,
  // (a{n,}){m,} — double bounded quantifier
  /\{[0-9,]+\}\{[0-9,]+\}/,
  // (a+){n,} style
  /[+*]\{[0-9]/,
];

/**
 * Safely compile a user-supplied regex pattern.
 *
 * Protections applied:
 * 1. Reject patterns containing known ReDoS structures (nested quantifiers etc.)
 * 2. Wrap compilation in try/catch to handle invalid syntax
 * 3. Validate the compiled regex can execute against an empty string within 5ms
 *
 * Throws an Error if the pattern is dangerous or invalid.
 */
export function safeRegex(pattern: string, flags?: string): RegExp {
  // Check for known ReDoS-prone structures
  for (const dangerous of REDOS_PATTERNS) {
    if (dangerous.test(pattern)) {
      throw new Error(
        `Unsafe regex pattern rejected (potential ReDoS): ${pattern}`
      );
    }
  }

  // Reject excessively long patterns
  if (pattern.length > 500) {
    throw new Error(
      `Regex pattern too long (max 500 characters): ${pattern.length} characters`
    );
  }

  // Compile — catch syntax errors
  let compiled: RegExp;
  try {
    compiled = new RegExp(pattern, flags);
  } catch (err) {
    throw new Error(
      `Invalid regex pattern "${pattern}": ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Quick execution check against empty string to catch patterns that stall
  const testStart = Date.now();
  compiled.test("");
  if (Date.now() - testStart > 5) {
    throw new Error(
      `Regex pattern rejected: execution against empty string took too long`
    );
  }

  return compiled;
}

// ============================================================================
// Path traversal validation
// ============================================================================

/**
 * Validate that a log file path is safe to access:
 * - Must be an absolute path
 * - Must not contain `..` traversal sequences after normalization
 *
 * Throws an Error if the path is invalid or unsafe.
 */
export function validateExportPath(outputPath: string): void {
  // Same absolute/no-traversal rules as a log path…
  validateLogPath(outputPath);

  // …plus optional confinement, because this path is written to rather than
  // read. Opt-in so existing setups keep working.
  const root = process.env.LOG_EXPORT_DIR;
  if (root && root.length > 0) {
    const resolvedRoot = resolve(root);
    const resolved = resolve(outputPath);
    if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + sep)) {
      throw new Error(`Report output must be inside LOG_EXPORT_DIR (${resolvedRoot})`);
    }
  }
}

export function validateLogPath(filePath: string): void {
  if (!filePath || typeof filePath !== "string") {
    throw new Error("Log file path must be a non-empty string");
  }

  if (!isAbsolute(filePath)) {
    throw new Error(
      `Log file path must be absolute, got: "${filePath}"`
    );
  }

  // Normalize and check that it matches the original resolved path
  const normalized = normalize(filePath);
  const resolved = resolve(filePath);

  if (normalized !== resolved) {
    throw new Error(
      `Log file path contains invalid traversal sequences: "${filePath}"`
    );
  }

  // Extra guard: no raw ".." components after normalization
  if (normalized.includes("..")) {
    throw new Error(
      `Log file path contains traversal sequences: "${filePath}"`
    );
  }
}
