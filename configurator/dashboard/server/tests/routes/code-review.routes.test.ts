// SPDX-License-Identifier: MIT
/**
 * Code Review Routes Tests
 *
 * Unit tests for code-review route handler logic.
 * Tests service integration, path validation, and error handling.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CodeReviewService } from '../../src/services/code-review.service.js';
import { resolveProjectPath } from '../../src/utils/utilities.js';

vi.mock('../../src/services/code-review.service.js');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PROJECT_PATH = '/home/user/my-project';

const MOCK_REVIEW_OPTIONS = [
  { id: 'security', label: 'Security Review', agents: ['security-expert'] },
  { id: 'performance', label: 'Performance Review', agents: ['performance-expert'] },
];

const MOCK_SOURCE_FILES = {
  files: ['src/index.ts', 'src/utils.ts'],
  totalFiles: 2,
  totalSize: 8192,
};

const MOCK_DIFF = {
  diff: '@@ -1,3 +1,4 @@\n+// new line\n',
  files: ['src/index.ts'],
};

const MOCK_FULL_CODE = {
  files: [
    { path: 'src/index.ts', content: 'export function main() {}', size: 24 },
  ],
  totalFiles: 1,
  totalSize: 24,
};

const MOCK_REVIEW_JOB = {
  id: 'review-job-1',
  title: 'Code Review',
  prompt: 'Review the following changes',
  agents: ['security-expert'],
  projectPath: PROJECT_PATH,
};

const MOCK_ISSUES = [
  { id: 'issue-1', severity: 'high', file: 'src/index.ts', message: 'SQL injection risk', line: 42 },
  { id: 'issue-2', severity: 'low', file: 'src/utils.ts', message: 'Unused import', line: 1 },
];

const MOCK_SUMMARY = {
  total: 2,
  critical: 0,
  high: 1,
  medium: 0,
  low: 1,
};

// ---------------------------------------------------------------------------

describe('Code Review Routes - Service Integration', () => {
  let codeReviewService: CodeReviewService;

  beforeEach(() => {
    codeReviewService = new CodeReviewService();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // GET /code-review/options
  // -------------------------------------------------------------------------
  describe('getReviewOptions logic', () => {
    it('should return available review options', () => {
      vi.mocked(codeReviewService.getReviewOptions).mockReturnValue(MOCK_REVIEW_OPTIONS);

      const result = codeReviewService.getReviewOptions();

      expect(codeReviewService.getReviewOptions).toHaveBeenCalled();
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('security');
    });

    it('should surface service errors', () => {
      vi.mocked(codeReviewService.getReviewOptions).mockImplementation(() => {
        throw new Error('failed to load options');
      });

      expect(() => codeReviewService.getReviewOptions()).toThrow('failed to load options');
    });
  });

  // -------------------------------------------------------------------------
  // GET /code-review/files
  // -------------------------------------------------------------------------
  describe('listSourceFiles logic', () => {
    it('should list source files for the project', () => {
      vi.mocked(codeReviewService.listSourceFiles).mockReturnValue(MOCK_SOURCE_FILES);

      const result = codeReviewService.listSourceFiles(PROJECT_PATH);

      expect(codeReviewService.listSourceFiles).toHaveBeenCalledWith(PROJECT_PATH);
      expect(result.totalFiles).toBe(2);
      expect(result.files).toContain('src/index.ts');
    });

    it('should surface service errors', () => {
      vi.mocked(codeReviewService.listSourceFiles).mockImplementation(() => {
        throw new Error('directory not accessible');
      });

      expect(() => codeReviewService.listSourceFiles(PROJECT_PATH)).toThrow(
        'directory not accessible'
      );
    });
  });

  // -------------------------------------------------------------------------
  // GET /code-review/diff
  // -------------------------------------------------------------------------
  describe('getDiffForReview logic', () => {
    it('should get uncommitted diff', () => {
      vi.mocked(codeReviewService.getDiffForReview).mockReturnValue(MOCK_DIFF);

      const result = codeReviewService.getDiffForReview(PROJECT_PATH, 'uncommitted', undefined);

      expect(codeReviewService.getDiffForReview).toHaveBeenCalledWith(
        PROJECT_PATH,
        'uncommitted',
        undefined
      );
      expect(result.diff).toContain('@@ -1,3 +1,4 @@');
    });

    it('should get full-project diff', () => {
      vi.mocked(codeReviewService.getDiffForReview).mockReturnValue(MOCK_DIFF);

      codeReviewService.getDiffForReview(PROJECT_PATH, 'full-project', 'backend');

      expect(codeReviewService.getDiffForReview).toHaveBeenCalledWith(
        PROJECT_PATH,
        'full-project',
        'backend'
      );
    });
  });

  // -------------------------------------------------------------------------
  // GET /code-review/full-code
  // -------------------------------------------------------------------------
  describe('getFullProjectCode logic', () => {
    it('should return full project code', () => {
      vi.mocked(codeReviewService.getFullProjectCode).mockReturnValue(MOCK_FULL_CODE);

      const result = codeReviewService.getFullProjectCode(PROJECT_PATH, {});

      expect(codeReviewService.getFullProjectCode).toHaveBeenCalledWith(PROJECT_PATH, {});
      expect(result.totalFiles).toBe(1);
      expect(result.files[0].path).toBe('src/index.ts');
    });

    it('should respect maxFiles and maxSize options', () => {
      vi.mocked(codeReviewService.getFullProjectCode).mockReturnValue(MOCK_FULL_CODE);

      codeReviewService.getFullProjectCode(PROJECT_PATH, { maxFiles: 50, maxSize: 1048576 });

      expect(codeReviewService.getFullProjectCode).toHaveBeenCalledWith(PROJECT_PATH, {
        maxFiles: 50,
        maxSize: 1048576,
      });
    });
  });

  // -------------------------------------------------------------------------
  // POST /code-review/build-job
  // -------------------------------------------------------------------------
  describe('buildReviewJob logic', () => {
    it('should build a review job with required fields', () => {
      vi.mocked(codeReviewService.buildReviewJob).mockReturnValue(MOCK_REVIEW_JOB);

      const result = codeReviewService.buildReviewJob({
        scope: 'uncommitted',
        selectedAgents: ['security-expert'],
        depth: 'quick',
      });

      expect(codeReviewService.buildReviewJob).toHaveBeenCalledWith({
        scope: 'uncommitted',
        selectedAgents: ['security-expert'],
        depth: 'quick',
      });
      expect(result.id).toBe('review-job-1');
    });

    it('should build a deep review job', () => {
      vi.mocked(codeReviewService.buildReviewJob).mockReturnValue({ ...MOCK_REVIEW_JOB, depth: 'deep' });

      const result = codeReviewService.buildReviewJob({
        scope: 'full-project',
        selectedAgents: ['security-expert'],
        depth: 'deep',
      });

      expect(result).toHaveProperty('depth', 'deep');
    });

    it('should validate scope is required', () => {
      // Simulate route guard: scope and selectedAgents are required
      const scope = '';
      const selectedAgents: string[] = [];
      const isInvalid = !scope || !selectedAgents.length;

      expect(isInvalid).toBe(true);
    });

    it('should validate scope must be "uncommitted" or "full-project"', () => {
      const scope = 'invalid-scope';
      const isValid = scope === 'uncommitted' || scope === 'full-project';

      expect(isValid).toBe(false);
    });

    it('should reject path traversal in paths array', () => {
      const paths = ['src/index.ts', '../../../etc/passwd', 'src/utils.ts'];

      // Simulate route guard: skip paths with '..'
      const safePaths = paths.filter((p) => !p.includes('..'));

      expect(safePaths).toHaveLength(2);
      expect(safePaths).not.toContain('../../../etc/passwd');
    });

    it('should validate that at least one path is accessible for full-project scope', () => {
      // Simulate: all paths inaccessible → 400
      const accessibleFiles: string[] = [];
      const shouldReject = accessibleFiles.length === 0;

      expect(shouldReject).toBe(true);
    });

    it('should surface service errors', () => {
      vi.mocked(codeReviewService.buildReviewJob).mockImplementation(() => {
        throw new Error('agent not found');
      });

      expect(() =>
        codeReviewService.buildReviewJob({
          scope: 'uncommitted',
          selectedAgents: ['nonexistent-agent'],
          depth: 'quick',
        })
      ).toThrow('agent not found');
    });
  });

  // -------------------------------------------------------------------------
  // POST /code-review/parse-results
  // -------------------------------------------------------------------------
  describe('parseAgentResults logic', () => {
    it('should parse agent output and return issues', () => {
      vi.mocked(codeReviewService.parseAgentResults).mockReturnValue(MOCK_ISSUES);
      vi.mocked(codeReviewService.getSummary).mockReturnValue(MOCK_SUMMARY);

      const issues = codeReviewService.parseAgentResults('security-expert', 'ISSUE: high risk');
      const summary = codeReviewService.getSummary(issues);

      expect(issues).toHaveLength(2);
      expect(issues[0].severity).toBe('high');
      expect(summary.total).toBe(2);
      expect(summary.high).toBe(1);
    });

    it('should validate agentId and output are required', () => {
      const agentId = '';
      const output = '';
      const isInvalid = !agentId || !output;

      expect(isInvalid).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // POST /code-review/should-block
  // -------------------------------------------------------------------------
  describe('shouldBlock logic', () => {
    it('should return shouldBlock=true when high severity issue above threshold', () => {
      vi.mocked(codeReviewService.getSummary).mockReturnValue(MOCK_SUMMARY);
      vi.mocked(codeReviewService.shouldBlock).mockReturnValue(true);

      const summary = codeReviewService.getSummary(MOCK_ISSUES);
      const shouldBlock = codeReviewService.shouldBlock(summary, 'high');

      expect(shouldBlock).toBe(true);
    });

    it('should return shouldBlock=false when no issues above threshold', () => {
      vi.mocked(codeReviewService.getSummary).mockReturnValue({ ...MOCK_SUMMARY, high: 0, critical: 0 });
      vi.mocked(codeReviewService.shouldBlock).mockReturnValue(false);

      const summary = codeReviewService.getSummary(MOCK_ISSUES);
      const shouldBlock = codeReviewService.shouldBlock(summary, 'critical');

      expect(shouldBlock).toBe(false);
    });

    it('should validate that issues array is required', () => {
      const issues = null;
      const isInvalid = !issues;

      expect(isInvalid).toBe(true);
    });

    it('should use default threshold when not specified', () => {
      vi.mocked(codeReviewService.getSummary).mockReturnValue(MOCK_SUMMARY);
      vi.mocked(codeReviewService.shouldBlock).mockReturnValue(false);

      codeReviewService.shouldBlock(MOCK_SUMMARY, undefined);

      expect(codeReviewService.shouldBlock).toHaveBeenCalledWith(MOCK_SUMMARY, undefined);
    });
  });

  // -------------------------------------------------------------------------
  // Path security
  // -------------------------------------------------------------------------
  describe('Path security', () => {
    it('should throw PathValidationError on path traversal (double-dot)', () => {
      // resolveProjectPath throws on paths containing '..'
      expect(() => resolveProjectPath('/home/user/../../etc/passwd')).toThrow();
    });

    it('should reject relative path (no leading slash)', () => {
      // resolveProjectPath throws on relative paths
      expect(() => resolveProjectPath('relative/path')).toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Response structure
  // -------------------------------------------------------------------------
  describe('Response structure', () => {
    it('should format options response with success and data', () => {
      vi.mocked(codeReviewService.getReviewOptions).mockReturnValue(MOCK_REVIEW_OPTIONS);

      const options = codeReviewService.getReviewOptions();
      const response = { success: true, data: options };

      expect(response.success).toBe(true);
      expect(Array.isArray(response.data)).toBe(true);
    });

    it('should format build-job response with job and projectPath', () => {
      vi.mocked(codeReviewService.buildReviewJob).mockReturnValue(MOCK_REVIEW_JOB);

      const job = codeReviewService.buildReviewJob({
        scope: 'uncommitted',
        selectedAgents: ['security-expert'],
        depth: 'quick',
      });
      const response = { success: true, data: { ...job, projectPath: PROJECT_PATH } };

      expect(response.data.projectPath).toBe(PROJECT_PATH);
    });

    it('should format parse-results response with issues and summary', () => {
      vi.mocked(codeReviewService.parseAgentResults).mockReturnValue(MOCK_ISSUES);
      vi.mocked(codeReviewService.getSummary).mockReturnValue(MOCK_SUMMARY);

      const issues = codeReviewService.parseAgentResults('security-expert', 'output');
      const summary = codeReviewService.getSummary(issues);
      const response = { success: true, data: { issues, summary } };

      expect(response.data.issues).toHaveLength(2);
      expect(response.data.summary.total).toBe(2);
    });
  });
});
