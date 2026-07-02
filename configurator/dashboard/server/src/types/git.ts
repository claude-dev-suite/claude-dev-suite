// SPDX-License-Identifier: MIT
// KEPT IN SYNC with configurator/dashboard/{src,server/src}/types/git.ts — verified by scripts/check-type-sync.mjs
/**
 * Git Types - Type definitions for Git operations
 */

/**
 * Status of a file in Git working tree
 */
export type FileStatus =
  | 'M'   // Modified
  | 'A'   // Added
  | 'D'   // Deleted
  | 'R'   // Renamed
  | 'C'   // Copied
  | 'U'   // Unmerged (conflict)
  | '?'   // Untracked
  | '!';  // Ignored

/**
 * A single file change in the working tree
 */
export interface FileChange {
  /** Relative file path */
  path: string;
  /** Git status code */
  status: FileStatus;
  /** Original path (for renames/copies) */
  oldPath?: string;
  /** Whether the file is staged */
  staged: boolean;
}

/**
 * Repository status summary
 */
export interface GitRepoStatus {
  /** Repository path (relative to project) */
  path: string;
  /** Repository name (from remote or folder) */
  name: string;
  /** Current branch name */
  branch: string;
  /** Tracking/upstream branch */
  tracking?: string;
  /** Commits ahead of tracking */
  ahead: number;
  /** Commits behind tracking */
  behind: number;
  /** Number of staged files */
  staged: number;
  /** Number of unstaged modified files */
  unstaged: number;
  /** Number of untracked files */
  untracked: number;
  /** Whether there are merge conflicts */
  hasConflicts: boolean;
  /** Remote URL */
  remoteUrl?: string;
  /** Error message when the status could not be read */
  error?: string;
}

/**
 * Branch information
 */
export interface Branch {
  /** Branch name (short) */
  name: string;
  /** Commit hash (short) */
  hash: string;
  /** Whether this is the current branch */
  isCurrent: boolean;
  /** Upstream branch name */
  upstream?: string;
  /** Commits ahead of upstream */
  ahead?: number;
  /** Commits behind upstream */
  behind?: number;
  /** Whether this is a remote branch */
  isRemote: boolean;
  /** Last commit message subject */
  lastCommitSubject?: string;
  /** Last commit date (ISO string) */
  lastCommitDate?: string;
}

/**
 * Commit information
 */
export interface CommitInfo {
  /** Full commit hash */
  hash: string;
  /** Short commit hash */
  shortHash: string;
  /** Commit subject (first line) */
  subject: string;
  /** Commit body (if any) */
  body?: string;
  /** Author name */
  author: string;
  /** Author email */
  authorEmail: string;
  /** Commit date (ISO string) */
  date: string;
  /** Parent commit hashes */
  parents: string[];
}

/**
 * File diff information
 */
export interface FileDiff {
  /** File path */
  path: string;
  /** Old file path (for renames) */
  oldPath?: string;
  /** Diff content (unified format) */
  diff: string;
  /** Number of additions */
  additions: number;
  /** Number of deletions */
  deletions: number;
  /** Whether the file is binary */
  isBinary: boolean;
}

/**
 * Remote information
 */
export interface Remote {
  /** Remote name (e.g., 'origin') */
  name: string;
  /** Fetch URL */
  fetchUrl: string;
  /** Push URL */
  pushUrl: string;
}

/**
 * Stash entry
 */
export interface StashEntry {
  /** Stash index (e.g., 0, 1, 2) */
  index: number;
  /** Stash message */
  message: string;
  /** Branch where stash was created */
  branch: string;
  /** Commit hash */
  hash: string;
  /** Date created */
  date: string;
}

// ============================================
// API Request/Response Types
// ============================================

/**
 * Request to stage/unstage files
 */
export interface StageFilesRequest {
  repoPath: string;
  files: string[];
}

/**
 * Request to discard changes
 */
export interface DiscardChangesRequest {
  repoPath: string;
  files: string[];
  /** Whether to discard staged changes too */
  staged?: boolean;
}

/**
 * Request to create a commit
 */
export interface CreateCommitRequest {
  repoPath: string;
  message: string;
  /** Whether to amend the last commit */
  amend?: boolean;
}

/**
 * Request to create a branch
 */
export interface CreateBranchRequest {
  repoPath: string;
  branchName: string;
  /** Starting point (branch/commit) */
  startPoint?: string;
  /** Whether to checkout the new branch */
  checkout?: boolean;
}

/**
 * Request to checkout a branch
 */
export interface CheckoutBranchRequest {
  repoPath: string;
  branchName: string;
  /** Create if doesn't exist */
  create?: boolean;
}

/**
 * Request to delete a branch
 */
export interface DeleteBranchRequest {
  repoPath: string;
  branchName: string;
  /** Force delete */
  force?: boolean;
}

/**
 * Request to merge branches
 */
export interface MergeBranchRequest {
  repoPath: string;
  /** Branch to merge from */
  sourceBranch: string;
  /** Whether to use --no-ff */
  noFastForward?: boolean;
  /** Custom merge message */
  message?: string;
}

/**
 * Request to cherry-pick commits
 */
export interface CherryPickRequest {
  repoPath: string;
  commits: string[];
  /** Whether to not commit (--no-commit) */
  noCommit?: boolean;
}

/**
 * Request to revert commits
 */
export interface RevertRequest {
  repoPath: string;
  commit: string;
  /** Whether to not commit (--no-commit) */
  noCommit?: boolean;
}

/**
 * Request for push operation
 */
export interface PushRequest {
  repoPath: string;
  remote?: string;
  branch?: string;
  /** Set upstream (-u) */
  setUpstream?: boolean;
  /** Force push */
  force?: boolean;
  /** Force with lease (safer) */
  forceWithLease?: boolean;
}

/**
 * Request for pull operation
 */
export interface PullRequest {
  repoPath: string;
  remote?: string;
  branch?: string;
  /** Use rebase instead of merge */
  rebase?: boolean;
}

/**
 * Request for fetch operation
 */
export interface FetchRequest {
  repoPath: string;
  remote?: string;
  /** Prune deleted remote branches */
  prune?: boolean;
  /** Fetch all remotes */
  all?: boolean;
}

/**
 * Request for git log
 */
export interface LogRequest {
  repoPath: string;
  /** Number of commits to fetch */
  limit?: number;
  /** Starting commit */
  from?: string;
  /** Ending commit */
  to?: string;
  /** Path filter */
  path?: string;
  /** Author filter */
  author?: string;
}

/**
 * Request to compare branches
 */
export interface CompareBranchesRequest {
  repoPath: string;
  baseBranch: string;
  compareBranch: string;
}

/**
 * Result of branch comparison
 */
export interface BranchComparison {
  baseBranch: string;
  compareBranch: string;
  ahead: number;
  behind: number;
  commits: CommitInfo[];
  files: FileChange[];
}

/**
 * Detailed commit information with files changed
 */
export interface CommitDetails {
  commit: CommitInfo;
  files: FileChange[];
}

// ============================================
// UI HELPERS
// ============================================

/**
 * Get display label for file status
 */
export function getStatusLabel(status: FileStatus): string {
  switch (status) {
    case 'M': return 'Modified';
    case 'A': return 'Added';
    case 'D': return 'Deleted';
    case 'R': return 'Renamed';
    case 'C': return 'Copied';
    case 'U': return 'Conflict';
    case '?': return 'Untracked';
    case '!': return 'Ignored';
    default: return 'Unknown';
  }
}

/**
 * Get status color class
 */
export function getStatusColor(status: FileStatus): string {
  switch (status) {
    case 'M': return 'text-yellow-400';
    case 'A': return 'text-green-400';
    case 'D': return 'text-red-400';
    case 'R': return 'text-blue-400';
    case 'C': return 'text-blue-400';
    case 'U': return 'text-orange-400';
    case '?': return 'text-gray-400';
    case '!': return 'text-gray-500';
    default: return 'text-gray-400';
  }
}

/**
 * Get status badge class
 */
export function getStatusBadgeClass(status: FileStatus): string {
  switch (status) {
    case 'M': return 'bg-yellow-500/20 text-yellow-400';
    case 'A': return 'bg-green-500/20 text-green-400';
    case 'D': return 'bg-red-500/20 text-red-400';
    case 'R': return 'bg-blue-500/20 text-blue-400';
    case 'C': return 'bg-blue-500/20 text-blue-400';
    case 'U': return 'bg-orange-500/20 text-orange-400';
    case '?': return 'bg-gray-500/20 text-gray-400';
    case '!': return 'bg-gray-600/20 text-gray-500';
    default: return 'bg-gray-500/20 text-gray-400';
  }
}
