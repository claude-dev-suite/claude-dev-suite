/**
 * Tests for git/git-helpers.ts — parseStatusV2 and execGit
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseStatusV2 } from '../src/services/git/git-helpers.js';

// We test execGit separately — it calls spawnSync which would need a real git.
// parseStatusV2 is a pure parsing function that can be tested without mocking.

describe('git-helpers: parseStatusV2', () => {
  // ----------------------------------------------------------------
  // Branch header parsing
  // ----------------------------------------------------------------
  describe('branch header parsing', () => {
    it('should parse branch.head', () => {
      const output = '# branch.head main\n';
      const result = parseStatusV2(output);
      expect(result.branch).toBe('main');
    });

    it('should default branch to HEAD when no header', () => {
      const result = parseStatusV2('');
      expect(result.branch).toBe('HEAD');
    });

    it('should parse branch.upstream', () => {
      const output = '# branch.head main\n# branch.upstream origin/main\n';
      const result = parseStatusV2(output);
      expect(result.tracking).toBe('origin/main');
    });

    it('should parse ahead/behind counts', () => {
      const output = '# branch.head main\n# branch.upstream origin/main\n# branch.ab +3 -2\n';
      const result = parseStatusV2(output);
      expect(result.ahead).toBe(3);
      expect(result.behind).toBe(2);
    });

    it('should default ahead/behind to 0', () => {
      const output = '# branch.head main\n';
      const result = parseStatusV2(output);
      expect(result.ahead).toBe(0);
      expect(result.behind).toBe(0);
    });
  });

  // ----------------------------------------------------------------
  // Ordinary changed entries (line type "1 ...")
  // ----------------------------------------------------------------
  describe('ordinary changed entries', () => {
    it('should parse a staged modification (index=M, worktree=.)', () => {
      // porcelain v2 ordinary entry: "1 XY sub mH mI mW hH hI path"
      // 8 space-separated tokens before the path
      const line = '1 M. N... 100644 100644 100644 abc123 def456 src/foo.ts';
      const result = parseStatusV2(line);
      expect(result.files).toHaveLength(1);
      expect(result.files[0]).toMatchObject({
        path: 'src/foo.ts',
        status: 'M',
        staged: true,
      });
    });

    it('should parse an unstaged modification (.M)', () => {
      const line = '1 .M N... 100644 100644 100644 abc123 def456 src/bar.ts';
      const result = parseStatusV2(line);
      expect(result.files).toHaveLength(1);
      expect(result.files[0]).toMatchObject({
        path: 'src/bar.ts',
        status: 'M',
        staged: false,
      });
    });

    it('should parse both staged and unstaged when both set (MM)', () => {
      const line = '1 MM N... 100644 100644 100644 abc123 def456 src/baz.ts';
      const result = parseStatusV2(line);
      expect(result.files).toHaveLength(2);
      expect(result.files.filter((f) => f.staged)).toHaveLength(1);
      expect(result.files.filter((f) => !f.staged)).toHaveLength(1);
    });

    it('should parse staged addition (A.)', () => {
      const line = '1 A. N... 0 100644 0 abc123 def456 new-file.ts';
      const result = parseStatusV2(line);
      expect(result.files[0]).toMatchObject({ status: 'A', staged: true });
    });
  });

  // ----------------------------------------------------------------
  // Renamed / copied entries (line type "2 ...")
  // ----------------------------------------------------------------
  describe('renamed/copied entries', () => {
    it('should parse a rename (R)', () => {
      // porcelain v2 rename: "2 XY sub ... score\told-path\tnew-path"
      const line = '2 R. N... 100644 100644 100644 abc def R100\told.ts\tnew.ts';
      const result = parseStatusV2(line);
      expect(result.files).toHaveLength(1);
      expect(result.files[0]).toMatchObject({
        path: 'new.ts',
        oldPath: 'old.ts',
        status: 'R',
        staged: true,
      });
    });
  });

  // ----------------------------------------------------------------
  // Unmerged entries (line type "u ...")
  // ----------------------------------------------------------------
  describe('unmerged entries', () => {
    it('should parse an unmerged file', () => {
      const line = '1 U. N... 100644 100644 100644 abc123 def456 conflicted.ts';
      const result = parseStatusV2(line);
      expect(result.files.some((f) => f.status === 'U')).toBe(true);
    });

    it('should parse "u " prefix entries', () => {
      // 10 space-separated tokens before path in unmerged entries
      const line = 'u UU N... 100644 100644 100644 100644 aaa bbb ccc conflicted.ts';
      const result = parseStatusV2(line);
      expect(result.files).toHaveLength(1);
      expect(result.files[0]).toMatchObject({ status: 'U', staged: false });
    });
  });

  // ----------------------------------------------------------------
  // Untracked entries (line type "? ...")
  // ----------------------------------------------------------------
  describe('untracked entries', () => {
    it('should parse an untracked file', () => {
      const line = '? untracked.ts';
      const result = parseStatusV2(line);
      expect(result.files).toHaveLength(1);
      expect(result.files[0]).toMatchObject({ path: 'untracked.ts', status: '?', staged: false });
    });

    it('should parse multiple untracked files', () => {
      const output = '? file1.ts\n? file2.ts\n';
      const result = parseStatusV2(output);
      expect(result.files).toHaveLength(2);
    });
  });

  // ----------------------------------------------------------------
  // Mixed output
  // ----------------------------------------------------------------
  describe('mixed output', () => {
    it('should handle a realistic mixed status output', () => {
      const output = [
        '# branch.head feature/test',
        '# branch.upstream origin/feature/test',
        '# branch.ab +1 -0',
        '1 M. N... 100644 100644 100644 aaa bbb src/modified.ts',
        '1 A. N... 0 100644 0 aaa bbb src/added.ts',
        '? untracked.md',
      ].join('\n');

      const result = parseStatusV2(output);
      expect(result.branch).toBe('feature/test');
      expect(result.tracking).toBe('origin/feature/test');
      expect(result.ahead).toBe(1);
      expect(result.behind).toBe(0);
      expect(result.files).toHaveLength(3);
    });

    it('should return empty files for clean working tree', () => {
      const output = [
        '# branch.head main',
        '# branch.upstream origin/main',
        '# branch.ab +0 -0',
      ].join('\n');
      const result = parseStatusV2(output);
      expect(result.files).toHaveLength(0);
    });
  });
});

// ----------------------------------------------------------------
// execGit — limited tests (validates guards, no real git)
// ----------------------------------------------------------------
describe('git-helpers: execGit security guards', () => {
  it('should throw PathValidationError when cwd contains ".."', async () => {
    const { execGit } = await import('../src/services/git/git-helpers.js');
    expect(() => execGit(['status'], '../traversal')).toThrow(/traversal|rooted|absolute/i);
  });

  it('should throw PathValidationError when cwd is not a string', async () => {
    const { execGit } = await import('../src/services/git/git-helpers.js');
    // @ts-expect-error testing runtime guard
    expect(() => execGit(['status'], 42)).toThrow(/string/i);
  });
});
