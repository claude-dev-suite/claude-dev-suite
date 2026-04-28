/**
 * Tests for git/git-security.ts — pure validation functions
 */

import { describe, it, expect } from 'vitest';
import {
  validatePath,
  validateGitRef,
  validateCommitHash,
  sanitizeFilePath,
  getAbsolutePath,
} from '../src/services/git/git-security.js';
import * as path from 'path';
import * as os from 'os';

// Helpers
const tempBase = os.tmpdir();

describe('git-security', () => {
  // ----------------------------------------------------------------
  // validatePath
  // ----------------------------------------------------------------
  describe('validatePath', () => {
    it('should return the resolved path when inside base', () => {
      const base = tempBase;
      const result = validatePath('sub/dir', base);
      expect(result).toBe(path.resolve(base, 'sub/dir'));
    });

    it('should throw on path traversal that escapes base', () => {
      const base = path.join(tempBase, 'project');
      expect(() => validatePath('../../../etc/passwd', base)).toThrow(/traversal/i);
    });

    it('should accept the base directory itself', () => {
      const base = path.join(tempBase, 'myproject');
      const result = validatePath('.', base);
      expect(result).toBe(path.resolve(base));
    });
  });

  // ----------------------------------------------------------------
  // validateGitRef
  // ----------------------------------------------------------------
  describe('validateGitRef', () => {
    it('should accept a valid branch name', () => {
      expect(validateGitRef('main')).toBe('main');
    });

    it('should accept branch names with slashes (feature branches)', () => {
      expect(validateGitRef('feature/my-feature')).toBe('feature/my-feature');
    });

    it('should accept tag names with dots', () => {
      expect(validateGitRef('v1.2.3')).toBe('v1.2.3');
    });

    it('should accept alphanumeric branch with underscores and dashes', () => {
      expect(validateGitRef('fix_my-bug_123')).toBe('fix_my-bug_123');
    });

    it('should throw for empty string', () => {
      expect(() => validateGitRef('')).toThrow(/invalid git reference/i);
    });

    it('should throw for non-string input', () => {
      // @ts-expect-error testing runtime behaviour
      expect(() => validateGitRef(123)).toThrow(/invalid git reference/i);
    });

    it('should throw for refs starting with a dash', () => {
      expect(() => validateGitRef('-evil')).toThrow(/invalid git reference/i);
    });

    it('should throw for refs containing double-dot (range notation)', () => {
      expect(() => validateGitRef('main..other')).toThrow(/invalid git reference/i);
    });

    it('should throw for refs containing shell special characters', () => {
      expect(() => validateGitRef('main; rm -rf /')).toThrow();
    });
  });

  // ----------------------------------------------------------------
  // validateCommitHash
  // ----------------------------------------------------------------
  describe('validateCommitHash', () => {
    it('should accept a full 40-character SHA', () => {
      const sha = 'a'.repeat(40);
      expect(validateCommitHash(sha)).toBe(sha);
    });

    it('should accept a 7-character short SHA', () => {
      expect(validateCommitHash('abc1234')).toBe('abc1234');
    });

    it('should accept a 4-character minimum short SHA', () => {
      expect(validateCommitHash('abcd')).toBe('abcd');
    });

    it('should accept mixed-case hex', () => {
      expect(validateCommitHash('aAbBcCdD')).toBe('aAbBcCdD');
    });

    it('should throw for empty string', () => {
      expect(() => validateCommitHash('')).toThrow(/invalid commit hash/i);
    });

    it('should throw for non-hex characters', () => {
      expect(() => validateCommitHash('ghijklmn')).toThrow(/invalid commit hash/i);
    });

    it('should throw for strings shorter than 4 characters', () => {
      expect(() => validateCommitHash('abc')).toThrow(/invalid commit hash/i);
    });

    it('should throw for strings longer than 40 characters', () => {
      expect(() => validateCommitHash('a'.repeat(41))).toThrow(/invalid commit hash/i);
    });
  });

  // ----------------------------------------------------------------
  // sanitizeFilePath
  // ----------------------------------------------------------------
  describe('sanitizeFilePath', () => {
    it('should return valid path unchanged', () => {
      expect(sanitizeFilePath('src/index.ts')).toBe('src/index.ts');
    });

    it('should accept paths with spaces', () => {
      expect(sanitizeFilePath('my file.ts')).toBe('my file.ts');
    });

    it('should throw for empty string', () => {
      expect(() => sanitizeFilePath('')).toThrow(/cannot be empty/i);
    });

    it('should throw for non-string input', () => {
      // @ts-expect-error testing runtime behaviour
      expect(() => sanitizeFilePath(42)).toThrow(/string/i);
    });

    it('should throw when path contains null byte', () => {
      expect(() => sanitizeFilePath('file\0name.ts')).toThrow(/null byte/i);
    });

    it('should throw for backtick (shell injection)', () => {
      expect(() => sanitizeFilePath('`ls`')).toThrow(/dangerous/i);
    });

    it('should throw for pipe character', () => {
      expect(() => sanitizeFilePath('file|other')).toThrow(/dangerous/i);
    });

    it('should throw for semicolon', () => {
      expect(() => sanitizeFilePath('file; rm -rf /')).toThrow(/dangerous/i);
    });

    it('should throw for redirect characters', () => {
      expect(() => sanitizeFilePath('file>out')).toThrow(/dangerous/i);
    });
  });

  // ----------------------------------------------------------------
  // getAbsolutePath
  // ----------------------------------------------------------------
  describe('getAbsolutePath', () => {
    it('should resolve a relative repoPath against projectPath', () => {
      const projectPath = tempBase;
      const result = getAbsolutePath('.', projectPath);
      expect(result).toBe(path.resolve(projectPath));
    });

    it('should accept an absolute repoPath that is within projectPath', () => {
      const projectPath = tempBase;
      const subPath = path.join(projectPath, 'repo');
      const result = getAbsolutePath(subPath, projectPath);
      expect(result).toBe(subPath);
    });

    it('should throw when resolved path escapes projectPath via relative traversal', () => {
      const projectPath = path.join(tempBase, 'safe');
      expect(() => getAbsolutePath('../../etc', projectPath)).toThrow(/traversal/i);
    });

    it('should throw when absolute repoPath is outside projectPath', () => {
      const projectPath = path.join(tempBase, 'project-a');
      const outsidePath = path.join(tempBase, 'project-b');
      expect(() => getAbsolutePath(outsidePath, projectPath)).toThrow(/traversal/i);
    });
  });
});
