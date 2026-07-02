// SPDX-License-Identifier: MIT
/**
 * Git Service
 *
 * Provides Git operations for the dashboard including:
 * - Repository status
 * - File staging/unstaging
 * - Commits
 * - Branch management
 * - Push/Pull/Fetch
 *
 * SECURITY: All user inputs are validated to prevent command injection
 * and path traversal attacks.
 */

import * as path from 'path';
import type {
  GitRepoStatus,
  FileChange,
  FileStatus,
  Branch,
  CommitInfo,
  FileDiff,
  Remote,
  BranchComparison,
} from '../types/git.js';
import {
  validateGitRef,
  validateCommitHash,
  sanitizeFilePath,
  getAbsolutePath,
} from './git/git-security.js';
import { execGit, parseStatusV2 } from './git/git-helpers.js';

// ============================================
// GIT SERVICE
// ============================================

export const GitService = {
  // ============================================
  // REPOSITORY STATUS
  // ============================================

  getRepoStatus(repoPath: string, projectPath: string): GitRepoStatus {
    const absolutePath = getAbsolutePath(repoPath, projectPath);
    const statusOutput = execGit(['status', '--porcelain=v2', '--branch'], absolutePath);
    const { branch, tracking, ahead, behind, files } = parseStatusV2(statusOutput);

    const staged = files.filter((f) => f.staged).length;
    const unstaged = files.filter((f) => !f.staged && f.status !== '?').length;
    const untracked = files.filter((f) => f.status === '?').length;
    const hasConflicts = files.some((f) => f.status === 'U');

    let remoteUrl: string | undefined;
    try {
      remoteUrl = execGit(['remote', 'get-url', 'origin'], absolutePath);
    } catch {
      // No remote configured
    }

    return {
      path: repoPath,
      name: path.basename(absolutePath),
      branch,
      tracking,
      ahead,
      behind,
      staged,
      unstaged,
      untracked,
      hasConflicts,
      remoteUrl,
    };
  },

  getChanges(repoPath: string, projectPath: string): FileChange[] {
    const absolutePath = getAbsolutePath(repoPath, projectPath);
    const statusOutput = execGit(['status', '--porcelain=v2', '--branch'], absolutePath);
    return parseStatusV2(statusOutput).files;
  },

  getFileDiff(repoPath: string, projectPath: string, filePath: string, staged = false): FileDiff {
    const absolutePath = getAbsolutePath(repoPath, projectPath);
    const sanitizedFilePath = sanitizeFilePath(filePath);
    const diffArgs = staged
      ? ['diff', '--cached', '--', sanitizedFilePath]
      : ['diff', '--', sanitizedFilePath];

    let diff = '';
    try {
      diff = execGit(diffArgs, absolutePath);
    } catch {
      // No changes
    }

    const lines = diff.split('\n');
    let additions = 0;
    let deletions = 0;

    for (const line of lines) {
      if (line.startsWith('+') && !line.startsWith('+++')) additions++;
      else if (line.startsWith('-') && !line.startsWith('---')) deletions++;
    }

    return {
      path: filePath,
      diff,
      additions,
      deletions,
      isBinary: diff.includes('Binary files') || diff.includes('GIT binary patch'),
    };
  },

  // ============================================
  // STAGING
  // ============================================

  stageFiles(repoPath: string, projectPath: string, files: string[]): void {
    const absolutePath = getAbsolutePath(repoPath, projectPath);
    const sanitizedFiles = files.map((f) => sanitizeFilePath(f));
    execGit(['add', '--', ...sanitizedFiles], absolutePath);
  },

  stageAll(repoPath: string, projectPath: string): void {
    const absolutePath = getAbsolutePath(repoPath, projectPath);
    execGit(['add', '-A'], absolutePath);
  },

  unstageFiles(repoPath: string, projectPath: string, files: string[]): void {
    const absolutePath = getAbsolutePath(repoPath, projectPath);
    const sanitizedFiles = files.map((f) => sanitizeFilePath(f));
    execGit(['restore', '--staged', '--', ...sanitizedFiles], absolutePath);
  },

  unstageAll(repoPath: string, projectPath: string): void {
    const absolutePath = getAbsolutePath(repoPath, projectPath);
    execGit(['reset', 'HEAD'], absolutePath);
  },

  discardChanges(repoPath: string, projectPath: string, files: string[], staged = false): void {
    const absolutePath = getAbsolutePath(repoPath, projectPath);
    if (staged) {
      this.unstageFiles(repoPath, projectPath, files);
    }
    const sanitizedFiles = files.map((f) => sanitizeFilePath(f));
    execGit(['restore', '--', ...sanitizedFiles], absolutePath);
  },

  // ============================================
  // COMMITS
  // ============================================

  commit(repoPath: string, projectPath: string, message: string, amend = false): string {
    const absolutePath = getAbsolutePath(repoPath, projectPath);
    const commitArgs = amend ? ['commit', '--amend', '-m', message] : ['commit', '-m', message];
    execGit(commitArgs, absolutePath);
    return execGit(['rev-parse', 'HEAD'], absolutePath);
  },

  getLog(repoPath: string, projectPath: string, limit = 50, from?: string, to?: string): CommitInfo[] {
    const absolutePath = getAbsolutePath(repoPath, projectPath);
    const validatedFrom = from ? validateGitRef(from) : undefined;
    const validatedTo = to ? validateGitRef(to) : undefined;
    const format = '%H%n%h%n%s%n%b%n%an%n%ae%n%aI%n%P%n---COMMIT_END---';

    const logArgs = ['log', `-${limit}`, `--format=${format}`];
    if (validatedFrom && validatedTo) {
      logArgs.push(`${validatedFrom}..${validatedTo}`);
    }

    const output = execGit(logArgs, absolutePath);
    const commits: CommitInfo[] = [];
    const entries = output.split('---COMMIT_END---').filter(Boolean);

    for (const entry of entries) {
      const lines = entry.trim().split('\n');
      if (lines.length >= 7) {
        const bodyLines: string[] = [];
        let idx = 3;
        while (idx < lines.length - 4) {
          const line = lines[idx];
          if (line !== undefined) bodyLines.push(line);
          idx++;
        }

        commits.push({
          hash: lines[0] ?? '',
          shortHash: lines[1] ?? '',
          subject: lines[2] ?? '',
          body: bodyLines.join('\n').trim() || undefined,
          author: lines[lines.length - 4] ?? '',
          authorEmail: lines[lines.length - 3] ?? '',
          date: lines[lines.length - 2] ?? '',
          parents: lines[lines.length - 1]?.split(' ').filter(Boolean) ?? [],
        });
      }
    }

    return commits;
  },

  getCommitDetails(repoPath: string, projectPath: string, commitHash: string): { commit: CommitInfo; files: FileChange[] } {
    const absolutePath = getAbsolutePath(repoPath, projectPath);
    const validatedHash = validateCommitHash(commitHash);

    const format = '%H%n%h%n%s%n%b%n%an%n%ae%n%aI%n%P';
    const commitOutput = execGit(['show', validatedHash, `--format=${format}`, '--no-patch'], absolutePath);

    const lines = commitOutput.trim().split('\n');
    const bodyLines: string[] = [];
    let idx = 3;
    while (idx < lines.length - 4) {
      const line = lines[idx];
      if (line !== undefined) bodyLines.push(line);
      idx++;
    }

    const commit: CommitInfo = {
      hash: lines[0] ?? '',
      shortHash: lines[1] ?? '',
      subject: lines[2] ?? '',
      body: bodyLines.join('\n').trim() || undefined,
      author: lines[lines.length - 4] ?? '',
      authorEmail: lines[lines.length - 3] ?? '',
      date: lines[lines.length - 2] ?? '',
      parents: lines[lines.length - 1]?.split(' ').filter(Boolean) ?? [],
    };

    const filesOutput = execGit(['show', validatedHash, '--name-status', '--format='], absolutePath);
    const files: FileChange[] = [];

    for (const line of filesOutput.split('\n').filter(Boolean)) {
      const [status, ...pathParts] = line.split('\t');
      const filePath = pathParts.join('\t');

      if (status?.startsWith('R') || status?.startsWith('C')) {
        const [oldPath, newPath] = pathParts;
        if (oldPath && newPath && status[0]) {
          files.push({ path: newPath, oldPath, status: status[0] as FileStatus, staged: false });
        }
      } else if (status && filePath) {
        files.push({ path: filePath, status: status as FileStatus, staged: false });
      }
    }

    return { commit, files };
  },

  cherryPick(repoPath: string, projectPath: string, commits: string[], noCommit = false): void {
    const absolutePath = getAbsolutePath(repoPath, projectPath);
    const validatedCommits = commits.map((c) => validateCommitHash(c));
    const cherryPickArgs = ['cherry-pick'];
    if (noCommit) cherryPickArgs.push('-n');
    cherryPickArgs.push(...validatedCommits);
    execGit(cherryPickArgs, absolutePath);
  },

  revert(repoPath: string, projectPath: string, commit: string, noCommit = false): void {
    const absolutePath = getAbsolutePath(repoPath, projectPath);
    const validatedCommit = validateCommitHash(commit);
    const revertArgs = ['revert'];
    if (noCommit) revertArgs.push('-n');
    revertArgs.push(validatedCommit);
    execGit(revertArgs, absolutePath);
  },

  // ============================================
  // BRANCHES
  // ============================================

  getBranches(repoPath: string, projectPath: string): Branch[] {
    const absolutePath = getAbsolutePath(repoPath, projectPath);
    const branches: Branch[] = [];

    const localFormat = '%(refname:short)|%(objectname:short)|%(HEAD)|%(upstream:short)|%(upstream:track,nobracket)';
    const localOutput = execGit(['branch', `--format=${localFormat}`], absolutePath);

    for (const line of localOutput.split('\n').filter(Boolean)) {
      const [name, hash, head, upstream, track] = line.split('|');
      let ahead = 0, behind = 0;

      if (track) {
        const aheadMatch = track.match(/ahead (\d+)/);
        const behindMatch = track.match(/behind (\d+)/);
        if (aheadMatch?.[1]) ahead = parseInt(aheadMatch[1], 10);
        if (behindMatch?.[1]) behind = parseInt(behindMatch[1], 10);
      }

      if (name && hash) {
        branches.push({
          name,
          hash,
          isCurrent: head === '*',
          upstream: upstream || undefined,
          ahead,
          behind,
          isRemote: false,
        });
      }
    }

    try {
      const remoteOutput = execGit(['branch', '-r', '--format=%(refname:short)|%(objectname:short)'], absolutePath);

      for (const line of remoteOutput.split('\n').filter(Boolean)) {
        const [name, hash] = line.split('|');
        if (name?.includes('HEAD')) continue;
        if (name && hash) {
          branches.push({ name, hash, isCurrent: false, isRemote: true });
        }
      }
    } catch {
      // No remote branches
    }

    return branches;
  },

  createBranch(repoPath: string, projectPath: string, branchName: string, startPoint?: string, checkout = false): void {
    const absolutePath = getAbsolutePath(repoPath, projectPath);
    const validatedBranch = validateGitRef(branchName);
    const validatedStart = startPoint ? validateGitRef(startPoint) : undefined;

    if (checkout) {
      const args = ['checkout', '-b', validatedBranch];
      if (validatedStart) args.push(validatedStart);
      execGit(args, absolutePath);
    } else {
      const args = ['branch', validatedBranch];
      if (validatedStart) args.push(validatedStart);
      execGit(args, absolutePath);
    }
  },

  checkout(repoPath: string, projectPath: string, branchName: string, create = false): void {
    const absolutePath = getAbsolutePath(repoPath, projectPath);
    const validatedBranch = validateGitRef(branchName);
    const args = create ? ['checkout', '-b', validatedBranch] : ['checkout', validatedBranch];
    execGit(args, absolutePath);
  },

  deleteBranch(repoPath: string, projectPath: string, branchName: string, force = false): void {
    const absolutePath = getAbsolutePath(repoPath, projectPath);
    const validatedBranch = validateGitRef(branchName);
    execGit(['branch', force ? '-D' : '-d', validatedBranch], absolutePath);
  },

  merge(repoPath: string, projectPath: string, sourceBranch: string, noFastForward = false, message?: string): void {
    const absolutePath = getAbsolutePath(repoPath, projectPath);
    const validatedBranch = validateGitRef(sourceBranch);
    const mergeArgs = ['merge'];
    if (noFastForward) mergeArgs.push('--no-ff');
    if (message) mergeArgs.push('-m', message);
    mergeArgs.push(validatedBranch);
    execGit(mergeArgs, absolutePath);
  },

  compareBranches(repoPath: string, projectPath: string, baseBranch: string, compareBranch: string): BranchComparison {
    const absolutePath = getAbsolutePath(repoPath, projectPath);
    const validatedBase = validateGitRef(baseBranch);
    const validatedCompare = validateGitRef(compareBranch);

    const countOutput = execGit(['rev-list', '--left-right', '--count', `${validatedBase}...${validatedCompare}`], absolutePath);
    const counts = countOutput.split('\t').map((n) => parseInt(n, 10));
    const behind = counts[0] ?? 0;
    const ahead = counts[1] ?? 0;

    const commits = this.getLog(repoPath, projectPath, 100, baseBranch, compareBranch);

    const diffOutput = execGit(['diff', '--name-status', `${validatedBase}...${validatedCompare}`], absolutePath);
    const files: FileChange[] = [];

    for (const line of diffOutput.split('\n').filter(Boolean)) {
      const [status, ...pathParts] = line.split('\t');
      const filePath = pathParts.join('\t');

      if (status?.startsWith('R') || status?.startsWith('C')) {
        const [oldPath, newPath] = pathParts;
        if (oldPath && newPath && status[0]) {
          files.push({ path: newPath, oldPath, status: status[0] as FileStatus, staged: false });
        }
      } else if (status && filePath) {
        files.push({ path: filePath, status: status as FileStatus, staged: false });
      }
    }

    return { baseBranch, compareBranch, ahead, behind, commits, files };
  },

  // ============================================
  // REMOTES
  // ============================================

  getRemotes(repoPath: string, projectPath: string): Remote[] {
    const absolutePath = getAbsolutePath(repoPath, projectPath);
    const output = execGit(['remote', '-v'], absolutePath);
    const remoteMap = new Map<string, Remote>();

    for (const line of output.split('\n').filter(Boolean)) {
      const match = line.match(/^(\S+)\s+(\S+)\s+\((\w+)\)$/);
      if (match) {
        const [, name, url, type] = match;
        if (name && url && type) {
          if (!remoteMap.has(name)) {
            remoteMap.set(name, { name, fetchUrl: '', pushUrl: '' });
          }
          const remote = remoteMap.get(name)!;
          if (type === 'fetch') remote.fetchUrl = url;
          else if (type === 'push') remote.pushUrl = url;
        }
      }
    }

    return Array.from(remoteMap.values());
  },

  fetch(repoPath: string, projectPath: string, remote?: string, prune = false, all = false): void {
    const absolutePath = getAbsolutePath(repoPath, projectPath);
    const fetchArgs = ['fetch'];
    if (prune) fetchArgs.push('--prune');
    if (all) {
      fetchArgs.push('--all');
    } else {
      fetchArgs.push(remote ? validateGitRef(remote) : 'origin');
    }
    execGit(fetchArgs, absolutePath);
  },

  pull(repoPath: string, projectPath: string, remote?: string, branch?: string, rebase = false): void {
    const absolutePath = getAbsolutePath(repoPath, projectPath);
    const pullArgs = ['pull'];
    if (rebase) pullArgs.push('--rebase');
    if (remote) pullArgs.push(validateGitRef(remote));
    if (branch) pullArgs.push(validateGitRef(branch));
    execGit(pullArgs, absolutePath);
  },

  push(repoPath: string, projectPath: string, remote?: string, branch?: string, setUpstream = false, force = false, forceWithLease = false): void {
    const absolutePath = getAbsolutePath(repoPath, projectPath);
    const pushArgs = ['push'];
    if (setUpstream) pushArgs.push('-u');
    if (forceWithLease) pushArgs.push('--force-with-lease');
    else if (force) pushArgs.push('--force');
    if (remote) pushArgs.push(validateGitRef(remote));
    if (branch) pushArgs.push(validateGitRef(branch));
    execGit(pushArgs, absolutePath);
  },
};
