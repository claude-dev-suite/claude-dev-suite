// SPDX-License-Identifier: MIT
/**
 * Security regression tests for the KB fetcher branch-name validator (finding H2).
 *
 * The validator lives in kb-fetcher.ts as a module-private function; we test it
 * by replicating the exact regex and logic rather than trying to import the
 * private symbol.
 */

import { describe, it, expect } from 'vitest';

// ── Replicate the branch validator from kb-fetcher.ts ────────────────────────

const SAFE_BRANCH_RE = /^[A-Za-z0-9_./-]+$/;

function validateBranch(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback;
  if (SAFE_BRANCH_RE.test(raw)) return raw;
  return fallback;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('KB branch name validator', () => {
  it('accepts a plain branch name', () => {
    expect(validateBranch('main', 'main')).toBe('main');
  });

  it('accepts a branch with slash (remote tracking style)', () => {
    expect(validateBranch('feature/my-feature', 'main')).toBe('feature/my-feature');
  });

  it('accepts branch names with dots and dashes', () => {
    expect(validateBranch('release-1.2.3', 'main')).toBe('release-1.2.3');
  });

  it('accepts branch names with underscores', () => {
    expect(validateBranch('my_feature_branch', 'main')).toBe('my_feature_branch');
  });

  it('accepts branch names with uppercase letters', () => {
    expect(validateBranch('Feature-Branch', 'main')).toBe('Feature-Branch');
  });

  it('falls back to default for undefined branch', () => {
    expect(validateBranch(undefined, 'main')).toBe('main');
  });

  it('falls back for a branch containing shell metachar ;', () => {
    expect(validateBranch('main; rm -rf /', 'main')).toBe('main');
  });

  it('falls back for a branch containing shell metachar $', () => {
    expect(validateBranch('$HOME', 'main')).toBe('main');
  });

  it('falls back for a branch containing backtick', () => {
    expect(validateBranch('`id`', 'main')).toBe('main');
  });

  it('falls back for a branch containing newline', () => {
    expect(validateBranch('main\nnewline', 'main')).toBe('main');
  });

  it('falls back for a branch containing space', () => {
    expect(validateBranch('feature branch', 'main')).toBe('main');
  });

  it('falls back for a branch containing double-quote', () => {
    expect(validateBranch('"quoted"', 'main')).toBe('main');
  });

  it('falls back for a branch containing ampersand', () => {
    expect(validateBranch('main&evil', 'main')).toBe('main');
  });

  it('falls back for an empty string', () => {
    // empty string → falsy → return fallback
    expect(validateBranch('', 'main')).toBe('main');
  });

  it('uses custom fallback when provided', () => {
    expect(validateBranch('bad;branch', 'develop')).toBe('develop');
  });
});
