// SPDX-License-Identifier: MIT
/**
 * Git Detection Service
 *
 * Detects git repositories and their configuration in the project.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { GitRepoInfo } from '../../types.js';
import { EXCLUDED_DIRS } from '../../utils/fs-utils.js';
import { getLogger } from '../../utils/logger.js';

const logger = getLogger('GitDetectionService');

export class GitDetectionService {
  /**
   * Detect git repositories in the project
   */
  async detectGitRepos(projectPath: string): Promise<GitRepoInfo[]> {
    const repos: GitRepoInfo[] = [];

    const scanDir = (dir: string, relativePath = ''): void => {
      const gitDir = path.join(dir, '.git');

      try {
        if (fs.existsSync(gitDir) && fs.statSync(gitDir).isDirectory()) {
          const { remoteUrl, remoteName } = this.parseGitConfig(gitDir);
          const branch = this.parseCurrentBranch(gitDir);
          const repoName = this.extractRepoName(remoteUrl) || path.basename(dir);

          repos.push({
            path: relativePath || '.',
            name: repoName,
            branch: branch || undefined,
            remote: remoteName || undefined,
            remoteUrl: remoteUrl || undefined,
          });
        }
      } catch (error: unknown) {
        logger.warn('Failed to access git directory during repo detection', {
          error,
          context: { gitDir }
        });
      }

      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && !entry.name.startsWith('.') && !EXCLUDED_DIRS.includes(entry.name)) {
            const subPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
            scanDir(path.join(dir, entry.name), subPath);
          }
        }
      } catch (error: unknown) {
        logger.warn('Failed to scan directory for git repos', {
          error,
          context: { dir }
        });
      }
    };

    scanDir(projectPath);
    return repos;
  }

  /**
   * Parse git config to extract remote URL and name
   */
  parseGitConfig(gitDir: string): { remoteUrl: string | null; remoteName: string | null } {
    const configPath = path.join(gitDir, 'config');
    if (!fs.existsSync(configPath)) return { remoteUrl: null, remoteName: null };

    try {
      const content = fs.readFileSync(configPath, 'utf-8');
      const remoteMatch = content.match(/\[remote "(\w+)"\][^\[]*url\s*=\s*(.+)/);
      if (remoteMatch?.[1] && remoteMatch[2]) {
        return {
          remoteName: remoteMatch[1],
          remoteUrl: remoteMatch[2].trim(),
        };
      }
    } catch (error: unknown) {
      logger.warn('Failed to parse git config', {
        error,
        context: { configPath }
      });
    }
    return { remoteUrl: null, remoteName: null };
  }

  /**
   * Parse current git branch from HEAD file
   */
  parseCurrentBranch(gitDir: string): string | null {
    const headPath = path.join(gitDir, 'HEAD');
    if (!fs.existsSync(headPath)) return null;

    try {
      const content = fs.readFileSync(headPath, 'utf-8').trim();
      const match = content.match(/^ref: refs\/heads\/(.+)$/);
      if (match?.[1]) return match[1];
      if (content.length === 40) return content.substring(0, 7);
    } catch (error: unknown) {
      logger.warn('Failed to parse current git branch', {
        error,
        context: { headPath }
      });
    }
    return null;
  }

  /**
   * Extract repository name from remote URL
   */
  extractRepoName(remoteUrl: string | null): string | null {
    if (!remoteUrl) return null;
    const match = remoteUrl.match(/[\/:]([^\/]+\/[^\/]+?)(\.git)?$/);
    return match?.[1] ?? null;
  }
}
