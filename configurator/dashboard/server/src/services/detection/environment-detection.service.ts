// SPDX-License-Identifier: MIT
/**
 * Environment Detection Service
 *
 * Detects environment files and extracts database URLs.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { EnvironmentFile } from '../../types.js';
import { EXCLUDED_DIRS, ENV_FILE_PATTERNS, extractEnvVar } from '../../utils/fs-utils.js';
import { timeOperation, TIMING_THRESHOLDS } from '../../utils/performance.js';
import { getLogger } from '../../utils/logger.js';

const logger = getLogger('EnvironmentDetectionService');

export class EnvironmentDetectionService {
  /**
   * Detect environment files and extract database URLs
   * Recursively searches all subdirectories (excluding node_modules, .git, etc.)
   */
  async detectEnvironments(projectPath: string): Promise<EnvironmentFile[]> {
    const endTimer = timeOperation(logger, 'detectEnvironments', TIMING_THRESHOLDS.DETECTION_ENV, { data: { projectPath } });
    const environments: Record<string, EnvironmentFile> = {};

    // Recursively collect all directories to search
    const searchDirs = this.collectSearchDirs(projectPath, projectPath);

    for (const dir of searchDirs) {
      for (const { pattern, env } of ENV_FILE_PATTERNS) {
        const filePath = path.join(dir, pattern);
        if (fs.existsSync(filePath)) {
          try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const dbUrl = this.buildDatabaseUrl(content);

            if (dbUrl) {
              const relativePath = path.relative(projectPath, filePath);
              const envKey = env === 'default' ? (dir === projectPath ? 'default' : path.basename(dir)) : env;

              if (!environments[envKey]) {
                environments[envKey] = {
                  name: envKey,
                  label: envKey.charAt(0).toUpperCase() + envKey.slice(1),
                  databaseUrl: dbUrl,
                  source: relativePath,
                };
              }
            }
          } catch (error: unknown) {
            logger.warn('Failed to read environment file', {
              error,
              context: { path: filePath }
            });
          }
        }
      }
    }

    endTimer();
    return Object.values(environments);
  }

  /**
   * Recursively collect directories to search for env files
   * Stops at depth 4 to avoid extremely deep searches
   */
  collectSearchDirs(dir: string, projectRoot: string, depth = 0, maxDepth = 4): string[] {
    const dirs: string[] = [dir];

    if (depth >= maxDepth) {
      return dirs;
    }

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !EXCLUDED_DIRS.includes(entry.name) && !entry.name.startsWith('.')) {
          const subPath = path.join(dir, entry.name);
          dirs.push(...this.collectSearchDirs(subPath, projectRoot, depth + 1, maxDepth));
        }
      }
    } catch (error: unknown) {
      logger.warn('Failed to scan directory for env files', {
        error,
        context: { dir }
      });
    }

    return dirs;
  }

  /**
   * Build database URL from environment variables
   */
  buildDatabaseUrl(content: string): string | null {
    const existingUrl = extractEnvVar(content, 'DATABASE_URL');
    if (existingUrl) return existingUrl;

    const host = extractEnvVar(content, 'DB_HOST') || extractEnvVar(content, 'DATABASE_HOST') || 'localhost';
    const port = extractEnvVar(content, 'DB_PORT') || extractEnvVar(content, 'DATABASE_PORT') || '5432';
    const name = extractEnvVar(content, 'DB_NAME') || extractEnvVar(content, 'DATABASE_NAME') || extractEnvVar(content, 'POSTGRES_DB');
    const user = extractEnvVar(content, 'DB_USERNAME') || extractEnvVar(content, 'DB_USER') || extractEnvVar(content, 'DATABASE_USER') || extractEnvVar(content, 'POSTGRES_USER') || 'postgres';
    const pass = extractEnvVar(content, 'DB_PASSWORD') || extractEnvVar(content, 'DATABASE_PASSWORD') || extractEnvVar(content, 'POSTGRES_PASSWORD') || '';

    if (name) {
      return `postgresql://${user}:${pass}@${host}:${port}/${name}`;
    }
    return null;
  }
}
