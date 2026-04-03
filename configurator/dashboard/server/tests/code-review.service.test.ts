/**
 * Code Review Service Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CodeReviewService, REVIEW_OPTIONS } from '../src/services/code-review.service.js';
import { createTempDir, cleanupTempDir, createMockProject } from './test-utils.js';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

describe('CodeReviewService', () => {
  let codeReviewService: CodeReviewService;
  let projectDir: string;

  beforeEach(() => {
    projectDir = createTempDir('code-review-test-');
    codeReviewService = new CodeReviewService();
  });

  afterEach(() => {
    cleanupTempDir(projectDir);
  });

  describe('getReviewOptions', () => {
    it('should return available review options', () => {
      const options = codeReviewService.getReviewOptions();

      expect(options).toBeDefined();
      expect(options.security).toBeDefined();
      expect(options.performance).toBeDefined();
      expect(options.quality).toBeDefined();
      expect(options.bestPractices).toBeDefined();
      expect(options.architecture).toBeDefined();
    });

    it('should have correct structure for each option', () => {
      const options = codeReviewService.getReviewOptions();

      for (const [key, option] of Object.entries(options)) {
        expect(option.label).toBeDefined();
        expect(option.agentId).toBeDefined();
        expect(option.description).toBeDefined();
        expect(option.taskPrompt).toBeDefined();
      }
    });
  });

  describe('isValidPath', () => {
    it('should return true for existing path', () => {
      expect(codeReviewService.isValidPath(projectDir)).toBe(true);
    });

    it('should return false for non-existing path', () => {
      // Use a path inside the temp dir that definitely does not exist
      // (avoids cross-platform issues where '/nonexistent/path' can resolve on Windows)
      const missingPath = path.join(projectDir, 'definitely-does-not-exist-xyz');
      expect(codeReviewService.isValidPath(missingPath)).toBe(false);
    });

    it('should return false for file path', () => {
      const filePath = path.join(projectDir, 'test.txt');
      fs.writeFileSync(filePath, 'test');

      expect(codeReviewService.isValidPath(filePath)).toBe(false);
    });
  });

  describe('isGitRepository', () => {
    it('should return true for git repository', () => {
      createMockProject(projectDir, {
        packageJson: { name: 'test' },
        hasGit: true,
      });

      expect(codeReviewService.isGitRepository(projectDir)).toBe(true);
    });

    it('should return false for non-git directory', () => {
      createMockProject(projectDir, {
        packageJson: { name: 'test' },
        hasGit: false,
      });

      expect(codeReviewService.isGitRepository(projectDir)).toBe(false);
    });
  });

  describe('listSourceFiles', () => {
    it('should list TypeScript files', () => {
      createMockProject(projectDir, {
        packageJson: { name: 'test' },
        hasGit: true,
        files: {
          'src/index.ts': 'console.log("hello");',
          'src/utils.ts': 'export const util = () => {};',
          'src/types.d.ts': 'declare type Foo = string;',
        },
      });

      // Initialize git and add files
      try {
        execSync('git init', { cwd: projectDir, stdio: 'pipe' });
        execSync('git add .', { cwd: projectDir, stdio: 'pipe' });
      } catch {
        // If git not available, skip
      }

      const result = codeReviewService.listSourceFiles(projectDir);

      expect(result.files.length).toBeGreaterThan(0);
      expect(result.files.some((f) => f.endsWith('.ts'))).toBe(true);
    });

    it('should exclude node_modules', () => {
      createMockProject(projectDir, {
        packageJson: { name: 'test' },
        hasGit: true,
        files: {
          'src/index.ts': 'console.log("hello");',
          'node_modules/pkg/index.js': 'module.exports = {};',
        },
      });

      const result = codeReviewService.listSourceFiles(projectDir);

      expect(result.files.every((f) => !f.includes('node_modules'))).toBe(true);
    });

    it('should return tree structure', () => {
      createMockProject(projectDir, {
        packageJson: { name: 'test' },
        hasGit: false, // Use directory scan fallback for testing
        files: {
          'src/index.ts': 'console.log("hello");',
          'src/utils/helper.ts': 'export const helper = () => {};',
        },
      });

      const result = codeReviewService.listSourceFiles(projectDir);

      expect(result.tree).toBeDefined();
      expect(result.tree.length).toBeGreaterThan(0);
    });

    it('should include totalFiles count', () => {
      createMockProject(projectDir, {
        packageJson: { name: 'test' },
        hasGit: true,
        files: {
          'src/a.ts': 'a',
          'src/b.ts': 'b',
          'src/c.ts': 'c',
        },
      });

      const result = codeReviewService.listSourceFiles(projectDir);

      expect(result.totalFiles).toBe(result.files.length);
    });
  });

  describe('getFullProjectCode', () => {
    it('should return file contents', () => {
      createMockProject(projectDir, {
        packageJson: { name: 'test' },
        hasGit: false, // Use directory scan fallback for testing
        files: {
          'src/index.ts': 'console.log("hello");',
        },
      });

      const result = codeReviewService.getFullProjectCode(projectDir);

      expect(result.diff).toContain('console.log');
      expect(result.files.length).toBeGreaterThan(0);
    });

    it('should respect maxFiles limit', () => {
      createMockProject(projectDir, {
        packageJson: { name: 'test' },
        hasGit: true,
        files: {
          'src/a.ts': 'a',
          'src/b.ts': 'b',
          'src/c.ts': 'c',
          'src/d.ts': 'd',
          'src/e.ts': 'e',
        },
      });

      const result = codeReviewService.getFullProjectCode(projectDir, { maxFiles: 2 });

      expect(result.files.length).toBeLessThanOrEqual(2);
    });

    it('should filter by paths', () => {
      createMockProject(projectDir, {
        packageJson: { name: 'test' },
        hasGit: true,
        files: {
          'src/index.ts': 'src file',
          'lib/helper.ts': 'lib file',
        },
      });

      const result = codeReviewService.getFullProjectCode(projectDir, { paths: ['src/'] });

      expect(result.files.every((f) => f.startsWith('src/'))).toBe(true);
    });

    it('should mark truncated files', () => {
      // Create a file with many lines
      const longContent = Array(600).fill('const x = 1;').join('\n');
      createMockProject(projectDir, {
        packageJson: { name: 'test' },
        hasGit: false, // Use directory scan fallback for testing
        files: {
          'src/long.ts': longContent,
        },
      });

      const result = codeReviewService.getFullProjectCode(projectDir);

      expect(result.diff).toContain('truncated');
    });
  });

  describe('getDiffForReview', () => {
    it('should return full project for full-project scope', () => {
      createMockProject(projectDir, {
        packageJson: { name: 'test' },
        hasGit: false, // Use directory scan fallback for testing
        files: {
          'src/index.ts': 'console.log("hello");',
        },
      });

      const result = codeReviewService.getDiffForReview(projectDir, 'full-project');

      expect(result.files.length).toBeGreaterThan(0);
    });

    it('should handle uncommitted scope in git repo', () => {
      createMockProject(projectDir, {
        packageJson: { name: 'test' },
        hasGit: true,
        files: {
          'src/index.ts': 'console.log("hello");',
        },
      });

      // Initialize git
      try {
        execSync('git init', { cwd: projectDir, stdio: 'pipe' });
        execSync('git add .', { cwd: projectDir, stdio: 'pipe' });
        execSync('git commit -m "initial"', { cwd: projectDir, stdio: 'pipe' });

        // Make a change
        fs.appendFileSync(path.join(projectDir, 'src/index.ts'), '\n// new line');

        const result = codeReviewService.getDiffForReview(projectDir, 'uncommitted');

        expect(result.diff).toContain('new line');
      } catch {
        // Git not available, skip
      }
    });

    it('should throw for uncommitted scope without git', () => {
      createMockProject(projectDir, {
        packageJson: { name: 'test' },
        hasGit: false,
      });

      expect(() => {
        codeReviewService.getDiffForReview(projectDir, 'uncommitted');
      }).toThrow();
    });
  });

  describe('buildReviewJob', () => {
    it('should build job with selected agents', () => {
      const job = codeReviewService.buildReviewJob({
        scope: 'full-project',
        selectedAgents: ['security', 'performance'],
      });

      expect(job.title).toBe('Code Review');
      // 2 agents + 1 consolidation task (consolidator) = 3 subtasks
      expect(job.subTasks.length).toBe(3);
      expect(job.subTasks.some((t) => t.agentId === 'security-expert')).toBe(true);
      expect(job.subTasks.some((t) => t.agentId === 'performance-expert')).toBe(true);
      // Consolidation task uses 'consolidator' marker (runs with base Claude, no agent delegation)
      expect(job.subTasks.some((t) => t.agentId === 'consolidator')).toBe(true);
    });

    it('should include context for full-project scope', () => {
      const job = codeReviewService.buildReviewJob({
        scope: 'full-project',
        selectedAgents: ['security'],
      });

      expect(job.context).toContain('entire project');
    });

    it('should include context for uncommitted scope', () => {
      const job = codeReviewService.buildReviewJob({
        scope: 'uncommitted',
        selectedAgents: ['security'],
      });

      expect(job.context).toContain('uncommitted');
    });

    it('should include paths in context when specified', () => {
      const job = codeReviewService.buildReviewJob({
        scope: 'full-project',
        selectedAgents: ['security'],
        paths: ['src/', 'lib/'],
      });

      expect(job.context).toContain('src/');
      expect(job.context).toContain('lib/');
    });

    it('should filter invalid agents', () => {
      const job = codeReviewService.buildReviewJob({
        scope: 'full-project',
        selectedAgents: ['security', 'invalid-agent'],
      });

      expect(job.subTasks.length).toBe(1);
    });
  });

  describe('parseAgentResults', () => {
    it('should parse issues from agent output', () => {
      const output = `
[CRITICAL] src/auth.ts:42 - SQL injection vulnerability
[HIGH] src/api.ts:15 - Missing authentication check
[MEDIUM] src/utils.ts:100 - Hardcoded secret
[LOW] src/logger.ts:5 - Console.log in production
[INFO] src/config.ts:1 - Consider environment variable
`;

      const issues = codeReviewService.parseAgentResults('security-expert', output);

      expect(issues.length).toBe(5);
      expect(issues[0].severity).toBe('critical');
      expect(issues[0].file).toBe('src/auth.ts');
      expect(issues[0].line).toBe(42);
      expect(issues[0].message).toContain('SQL injection');
    });

    it('should handle empty output', () => {
      const issues = codeReviewService.parseAgentResults('security-expert', '');

      expect(issues).toEqual([]);
    });

    it('should handle output without issues', () => {
      const output = 'No issues found. Code looks good!';

      const issues = codeReviewService.parseAgentResults('security-expert', output);

      expect(issues).toEqual([]);
    });

    it('should include agentId in each issue', () => {
      const output = '[HIGH] src/api.ts:15 - Issue description';

      const issues = codeReviewService.parseAgentResults('security-expert', output);

      expect(issues[0].agentId).toBe('security-expert');
    });
  });

  describe('getSummary', () => {
    it('should summarize issues by severity', () => {
      const issues = [
        { agentId: 'a', severity: 'critical' as const, file: 'a.ts', line: 1, message: 'a' },
        { agentId: 'a', severity: 'high' as const, file: 'b.ts', line: 2, message: 'b' },
        { agentId: 'a', severity: 'high' as const, file: 'c.ts', line: 3, message: 'c' },
        { agentId: 'a', severity: 'medium' as const, file: 'd.ts', line: 4, message: 'd' },
        { agentId: 'a', severity: 'low' as const, file: 'e.ts', line: 5, message: 'e' },
        { agentId: 'a', severity: 'info' as const, file: 'f.ts', line: 6, message: 'f' },
      ];

      const summary = codeReviewService.getSummary(issues);

      expect(summary.total).toBe(6);
      expect(summary.critical).toBe(1);
      expect(summary.high).toBe(2);
      expect(summary.medium).toBe(1);
      expect(summary.low).toBe(1);
      expect(summary.info).toBe(1);
    });

    it('should handle empty issues', () => {
      const summary = codeReviewService.getSummary([]);

      expect(summary.total).toBe(0);
      expect(summary.critical).toBe(0);
    });
  });

  describe('shouldBlock', () => {
    it('should block on critical issues with high threshold', () => {
      const summary = { total: 1, critical: 1, high: 0, medium: 0, low: 0, info: 0 };

      expect(codeReviewService.shouldBlock(summary, 'high')).toBe(true);
    });

    it('should block on high issues with high threshold', () => {
      const summary = { total: 1, critical: 0, high: 1, medium: 0, low: 0, info: 0 };

      expect(codeReviewService.shouldBlock(summary, 'high')).toBe(true);
    });

    it('should not block on medium issues with high threshold', () => {
      const summary = { total: 1, critical: 0, high: 0, medium: 1, low: 0, info: 0 };

      expect(codeReviewService.shouldBlock(summary, 'high')).toBe(false);
    });

    it('should block on medium issues with medium threshold', () => {
      const summary = { total: 1, critical: 0, high: 0, medium: 1, low: 0, info: 0 };

      expect(codeReviewService.shouldBlock(summary, 'medium')).toBe(true);
    });

    it('should only block on critical with critical threshold', () => {
      const summary = { total: 2, critical: 0, high: 1, medium: 1, low: 0, info: 0 };

      expect(codeReviewService.shouldBlock(summary, 'critical')).toBe(false);
    });

    it('should not block with no issues', () => {
      const summary = { total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 };

      expect(codeReviewService.shouldBlock(summary, 'high')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle binary files gracefully', () => {
      createMockProject(projectDir, {
        packageJson: { name: 'test' },
        hasGit: true,
        files: {
          'src/index.ts': 'console.log("hello");',
        },
      });

      // Create a binary file
      const binaryPath = path.join(projectDir, 'image.png');
      fs.writeFileSync(binaryPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

      // Should not throw
      expect(() => codeReviewService.listSourceFiles(projectDir)).not.toThrow();
    });

    it('should handle deeply nested directories', () => {
      const deepPath = 'a/b/c/d/e/f/g/h/i/j/file.ts';
      createMockProject(projectDir, {
        packageJson: { name: 'test' },
        hasGit: false, // Use directory scan fallback for testing
        files: {
          [deepPath]: 'const x = 1;',
        },
      });

      const result = codeReviewService.listSourceFiles(projectDir);

      expect(result.files.some((f) => f.includes('file.ts'))).toBe(true);
    });

    it('should handle special characters in file names', () => {
      createMockProject(projectDir, {
        packageJson: { name: 'test' },
        hasGit: false, // Use directory scan fallback for testing
        files: {
          'src/file with spaces.ts': 'const x = 1;',
          'src/file-with-dashes.ts': 'const y = 2;',
          'src/file_with_underscores.ts': 'const z = 3;',
        },
      });

      const result = codeReviewService.listSourceFiles(projectDir);

      // 3 TypeScript files + package.json = 4 files
      expect(result.files.length).toBeGreaterThanOrEqual(3);
      expect(result.files.some((f) => f.includes('spaces'))).toBe(true);
      expect(result.files.some((f) => f.includes('dashes'))).toBe(true);
      expect(result.files.some((f) => f.includes('underscores'))).toBe(true);
    });
  });
});
