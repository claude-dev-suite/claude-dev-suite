import path from 'node:path';
// SPDX-License-Identifier: MIT
/**
 * Git Helper Functions
 *
 * Common utilities for executing git commands and parsing output.
 */

import { spawnSync, type SpawnSyncOptions } from 'child_process';
import type { FileChange, FileStatus } from '../../types/git.js';
import { resolveProjectPath, PathValidationError } from '../../utils/utilities.js';

/**
 * Execute a git command in a specific directory using spawnSync with array arguments.
 * SECURITY: Uses spawnSync with shell: false to prevent command injection.
 * Arguments are passed as an array, never through shell interpretation.
 */
export function execGit(
  args: string[],
  cwd: string,
  options: SpawnSyncOptions = {}
): string {
  if (typeof cwd !== 'string') throw new PathValidationError('cwd must be a string');
  if (cwd.includes('..')) throw new PathValidationError('Path traversal not allowed');
  cwd = resolveProjectPath(cwd);
  if (!path.isAbsolute(cwd)) throw new PathValidationError('Path must be rooted');
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large outputs
    shell: false, // SECURITY: Never use shell
    ...options,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = result.stderr?.toString().trim();
    throw new Error(stderr || `Git command failed with exit code ${result.status}`);
  }

  return (result.stdout?.toString() ?? '').trim();
}

/**
 * Parse porcelain v2 status output
 */
export function parseStatusV2(output: string): {
  branch: string;
  tracking?: string;
  ahead: number;
  behind: number;
  files: FileChange[];
} {
  const lines = output.split('\n').filter(Boolean);
  let branch = 'HEAD';
  let tracking: string | undefined;
  let ahead = 0;
  let behind = 0;
  const files: FileChange[] = [];

  for (const line of lines) {
    // Header lines
    if (line.startsWith('# branch.head ')) {
      branch = line.substring(14);
    } else if (line.startsWith('# branch.upstream ')) {
      tracking = line.substring(18);
    } else if (line.startsWith('# branch.ab ')) {
      const match = line.match(/\+(\d+) -(\d+)/);
      if (match?.[1] && match[2]) {
        ahead = parseInt(match[1], 10);
        behind = parseInt(match[2], 10);
      }
    }
    // Changed entries (ordinary)
    else if (line.startsWith('1 ')) {
      const parts = line.split(' ');
      const xy = parts[1]; // XY status
      const filePath = parts.slice(8).join(' ');
      const indexStatus = xy?.[0]; // Index (staged) status
      const worktreeStatus = xy?.[1]; // Worktree (unstaged) status

      // Staged change (skip '.' which means no change)
      if (indexStatus !== '.' && indexStatus !== '?') {
        files.push({
          path: filePath,
          status: indexStatus as FileStatus,
          staged: true,
        });
      }
      // Unstaged change (skip '.' which means no change)
      if (worktreeStatus !== '.' && worktreeStatus !== '?') {
        files.push({
          path: filePath,
          status: worktreeStatus as FileStatus,
          staged: false,
        });
      }
    }
    // Renamed/copied entries
    else if (line.startsWith('2 ')) {
      const parts = line.split('\t');
      const info = parts[0]?.split(' ');
      const xy = info?.[1];
      const paths = parts.slice(1);
      const indexStatus = xy?.[0] as FileStatus | undefined;

      if (indexStatus === 'R' || indexStatus === 'C') {
        const oldPath = paths[0];
        const newPath = paths[1] || paths[0];
        if (oldPath && newPath) {
          files.push({
            path: newPath,
            oldPath,
            status: indexStatus,
            staged: true,
          });
        }
      }
    }
    // Unmerged entries
    else if (line.startsWith('u ')) {
      const parts = line.split(' ');
      const filePath = parts.slice(10).join(' ');
      files.push({
        path: filePath,
        status: 'U',
        staged: false,
      });
    }
    // Untracked
    else if (line.startsWith('? ')) {
      files.push({
        path: line.substring(2),
        status: '?',
        staged: false,
      });
    }
  }

  return { branch, tracking, ahead, behind, files };
}
