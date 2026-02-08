// SPDX-License-Identifier: MIT
/**
 * Code Review Service
 *
 * Provides AI-powered code review using existing dev-suite agents.
 * Maps UI options to specialized agents (security-expert, qa-expert, etc.)
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { resolveProjectPath } from '../utils/utilities.js';
import {
  // Types
  type ReviewOption,
  type ReviewJob,
  type SourceFilesResult,
  type DiffResult,
  type ReviewIssue,
  type ReviewSummary,
  // Constants
  REVIEW_OPTIONS,
  // File scanning
  listSourceFiles as listSourceFilesImpl,
  getFullProjectCode,
  parseDiffFiles,
  // Job building
  buildReviewJob as buildReviewJobImpl,
  validateReviewOptions,
  // Results parsing
  parseAgentResults as parseAgentResultsImpl,
  getSummary as getSummaryImpl,
  shouldBlock as shouldBlockImpl,
} from './code-review/index.js';

// Re-export types for backward compatibility
export type { ReviewOption, ReviewJob, SourceFilesResult, DiffResult, ReviewIssue, ReviewSummary };
export type { SubTask, FileTreeNode } from './code-review/index.js';
export { REVIEW_OPTIONS };

export class CodeReviewService {
  /**
   * Validate that a path is safe to use
   */
  isValidPath(targetPath: string): boolean {
    if (!targetPath || typeof targetPath !== 'string') return false;

    const normalized = path.normalize(targetPath);
    if (normalized.includes('..') && !path.isAbsolute(normalized)) return false;
    if (/[;&|$`<>(){}[\]!]/.test(targetPath)) return false;

    try {
      const stats = fs.statSync(targetPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Check if path is a git repository
   */
  isGitRepository(targetPath: string): boolean {
    if (!this.isValidPath(targetPath)) return false;
    return fs.existsSync(path.join(targetPath, '.git'));
  }

  /**
   * Validate branch name
   */
  isValidBranchName(branch: string): boolean {
    if (!branch || typeof branch !== 'string') return false;
    return /^[a-zA-Z0-9][a-zA-Z0-9_.\/-]*$/.test(branch) && !branch.includes('..');
  }

  /**
   * Get base branch (main or master)
   */
  getBaseBranch(cwd: string): string {
    cwd = resolveProjectPath(cwd);
    if (!this.isValidPath(cwd)) return 'main';

    try {
      const result = execSync('git symbolic-ref refs/remotes/origin/HEAD', {
        cwd,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 5000,
      }).trim();

      if (result) {
        const match = result.match(/refs\/remotes\/origin\/(.+)/);
        const branchName = match?.[1];
        if (branchName && this.isValidBranchName(branchName)) {
          return branchName;
        }
      }
    } catch {
      // Failed to get symbolic ref - fallback to verifying branches
    }

    try {
      execSync('git rev-parse --verify main', { cwd, stdio: 'pipe', timeout: 5000 });
      return 'main';
    } catch {
      try {
        execSync('git rev-parse --verify master', { cwd, stdio: 'pipe', timeout: 5000 });
        return 'master';
      } catch {
        return 'main';
      }
    }
  }

  /**
   * List source files in a project
   */
  listSourceFiles(projectPath: string): SourceFilesResult {
    projectPath = resolveProjectPath(projectPath);
    return listSourceFilesImpl(projectPath, this.isValidPath.bind(this));
  }

  /**
   * Get full project code for review
   */
  getFullProjectCode(
    projectPath: string,
    options: { maxFiles?: number; maxSize?: number; paths?: string[] } = {},
  ): DiffResult {
    projectPath = resolveProjectPath(projectPath);
    return getFullProjectCode(projectPath, options);
  }

  /**
   * Get diff for review based on scope
   */
  getDiffForReview(
    projectPath: string,
    scope: 'uncommitted' | 'full-project',
    repoPath: string | null = null,
    options: { maxFiles?: number; maxSize?: number; paths?: string[] } = {},
  ): DiffResult {
    projectPath = resolveProjectPath(projectPath);
    const cwd = repoPath ? path.join(projectPath, repoPath) : projectPath;

    if (!this.isValidPath(cwd)) {
      throw new Error(`Invalid or non-existent path: ${cwd}`);
    }

    if (scope === 'full-project') {
      return getFullProjectCode(cwd, options);
    }

    if (!this.isGitRepository(cwd)) {
      throw new Error(`Not a Git repository: ${cwd}`);
    }

    try {
      const diff = execSync('git diff HEAD', {
        cwd,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
        timeout: 30000,
      });

      return {
        diff,
        files: parseDiffFiles(diff),
      };
    } catch {
      return { diff: '', files: [] };
    }
  }

  /**
   * Validate review options
   */
  validateReviewOptions(options: string[]): string[] {
    return validateReviewOptions(options);
  }

  /**
   * Build a review job for the orchestrator
   */
  buildReviewJob(options: {
    scope: 'uncommitted' | 'full-project';
    selectedAgents: string[];
    paths?: string[];
    repo?: string;
  }): ReviewJob {
    return buildReviewJobImpl(options);
  }

  /**
   * Parse agent output for structured issues
   */
  parseAgentResults(agentId: string, output: string): ReviewIssue[] {
    return parseAgentResultsImpl(agentId, output);
  }

  /**
   * Get summary of issues by severity
   */
  getSummary(issues: ReviewIssue[]): ReviewSummary {
    return getSummaryImpl(issues);
  }

  /**
   * Check if review results should block
   */
  shouldBlock(summary: ReviewSummary, threshold: 'critical' | 'high' | 'medium' | 'low' = 'high'): boolean {
    return shouldBlockImpl(summary, threshold);
  }

  /**
   * Get available review options
   */
  getReviewOptions(): Record<string, ReviewOption> {
    return REVIEW_OPTIONS;
  }
}
