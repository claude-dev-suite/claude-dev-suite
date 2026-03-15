// SPDX-License-Identifier: MIT
/**
 * Git Service - Main export
 *
 * This file re-exports the GitService facade which combines all git operations.
 */

export { GitService } from '../git.service.js';

// Re-export types for convenience
export type {
  GitRepoStatus,
  FileChange,
  FileStatus,
  Branch,
  CommitInfo,
  FileDiff,
  Remote,
  BranchComparison,
} from '../../types/git.js';

// Re-export security helpers for testing
export {
  validatePath,
  validateGitRef,
  validateCommitHash,
  sanitizeFilePath,
  getAbsolutePath,
} from './git-security.js';

// Re-export helpers for testing
export { execGit, parseStatusV2 } from './git-helpers.js';
