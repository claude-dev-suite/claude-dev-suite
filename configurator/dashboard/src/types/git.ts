// SPDX-License-Identifier: MIT
/**
 * Git Types - Frontend type definitions for Git operations
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
  path: string;
  status: FileStatus;
  oldPath?: string;
  staged: boolean;
}

/**
 * Repository status summary
 */
export interface GitRepoStatus {
  path: string;
  name: string;
  branch: string;
  tracking?: string;
  ahead: number;
  behind: number;
  staged: number;
  unstaged: number;
  untracked: number;
  hasConflicts: boolean;
  remoteUrl?: string;
  error?: string;
}

/**
 * Branch information
 */
export interface Branch {
  name: string;
  hash: string;
  isCurrent: boolean;
  upstream?: string;
  ahead?: number;
  behind?: number;
  isRemote: boolean;
  lastCommitSubject?: string;
  lastCommitDate?: string;
}

/**
 * Commit information
 */
export interface CommitInfo {
  hash: string;
  shortHash: string;
  subject: string;
  body?: string;
  author: string;
  authorEmail: string;
  date: string;
  parents: string[];
}

/**
 * File diff information
 */
export interface FileDiff {
  path: string;
  oldPath?: string;
  diff: string;
  additions: number;
  deletions: number;
  isBinary: boolean;
}

/**
 * Remote information
 */
export interface Remote {
  name: string;
  fetchUrl: string;
  pushUrl: string;
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
