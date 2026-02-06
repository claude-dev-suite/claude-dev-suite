// SPDX-License-Identifier: MIT
/**
 * File Operations for Installation Service
 *
 * Secure file copying and directory operations.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { fileURLToPath } from 'url';
import { getLogger } from '../../utils/logger.js';
import { validatePathWithinBase, validateEntryName } from './security-helpers.js';

const logger = getLogger('InstallationFileOps');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get dev-suite root directory
 */
export function getDevSuiteDir(): string {
  // Use DEV_SUITE_DIR env var if set (Electron packaged mode)
  if (process.env.DEV_SUITE_DIR) {
    return process.env.DEV_SUITE_DIR;
  }
  // Fallback: Navigate from server/src/services/installation to dev-suite root (development)
  return path.resolve(__dirname, '..', '..', '..', '..', '..', '..');
}

/**
 * Calculate SHA256 hash of file content
 */
export function calculateFileHash(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Calculate hash from file path
 */
export function calculateFileHashFromPath(filePath: string): string | null {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return calculateFileHash(content);
    }
  } catch {
    // Ignore errors
  }
  return null;
}

/**
 * Recursively copy a directory with security validation
 */
export function copyDirSync(src: string, dest: string, baseDestDir?: string): void {
  // SECURITY: Track the original destination base for validation
  const destBase = baseDestDir ?? dest;

  // SECURITY: Validate source and destination paths
  const resolvedSrc = path.resolve(src);
  const resolvedDest = path.resolve(dest);

  // Validate dest stays within base destination
  validatePathWithinBase(resolvedDest, destBase, true);

  if (!fs.existsSync(resolvedDest)) {
    fs.mkdirSync(resolvedDest, { recursive: true });
  }

  const entries = fs.readdirSync(resolvedSrc, { withFileTypes: true });
  for (const entry of entries) {
    // SECURITY: Validate entry name doesn't contain path separators
    if (!validateEntryName(entry.name)) {
      logger.warn('Skipping suspicious entry name', { context: { entryName: entry.name, src } });
      continue;
    }

    const srcPath = path.join(resolvedSrc, entry.name);
    const destPath = path.join(resolvedDest, entry.name);

    // SECURITY: Validate the destination path stays within the base directory
    try {
      validatePathWithinBase(destPath, destBase, false);
    } catch (error: unknown) {
      logger.warn('Skipping path that escapes destination base', {
        error,
        context: { srcPath, destPath, destBase }
      });
      continue;
    }

    if (entry.isDirectory()) {
      if (!['node_modules', '.git'].includes(entry.name)) {
        copyDirSync(srcPath, destPath, destBase);
      }
    } else {
      // SECURITY: Check if source is a symlink pointing outside
      if (entry.isSymbolicLink()) {
        try {
          const realSrcPath = fs.realpathSync(srcPath);
          // Only copy if symlink resolves within source tree
          if (!realSrcPath.startsWith(path.dirname(resolvedSrc))) {
            logger.warn('Skipping symlink that points outside source tree', {
              context: { srcPath, realSrcPath }
            });
            continue;
          }
        } catch {
          logger.warn('Skipping broken symlink', { context: { srcPath } });
          continue;
        }
      }
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Find an agent file by name in a directory tree
 */
export function findAgentFile(dir: string, filename: string): string | null {
  if (!fs.existsSync(dir)) return null;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const result = findAgentFile(fullPath, filename);
      if (result) return result;
    } else if (entry.name === filename) {
      return fullPath;
    }
  }
  return null;
}

/**
 * Parse skills list from agent file content
 */
export function parseAgentSkills(content: string): string[] {
  const skills: string[] = [];
  const skillsMatch = content.match(/^skills:\s*\n((?:\s+-\s+.+\n?)+)/m);
  if (skillsMatch?.[1]) {
    const skillLines = skillsMatch[1].match(/^\s+-\s+(.+)$/gm);
    if (skillLines) {
      for (const line of skillLines) {
        const match = line.match(/^\s+-\s+(.+)$/);
        if (match?.[1]) skills.push(match[1].trim());
      }
    }
  }
  return skills;
}

/**
 * Read MCP server metadata to get required environment variables
 */
export function getServerEnvVars(
  serverName: string,
  allEnvVars: Record<string, string>,
  devSuiteDir: string
): Record<string, string> {
  const metadataPath = path.join(devSuiteDir, 'mcp-servers', serverName, 'metadata.json');
  const result: Record<string, string> = {};

  if (fs.existsSync(metadataPath)) {
    try {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8')) as {
        envVars?: Array<{ name: string }>;
      };
      if (metadata.envVars && Array.isArray(metadata.envVars)) {
        for (const envVar of metadata.envVars) {
          const varName = envVar.name;
          const varValue = allEnvVars[varName];
          if (varName && varValue) {
            result[varName] = varValue;
          }
        }
      }
    } catch (error: unknown) {
      logger.warn('Failed to read MCP server metadata for env detection', {
        error,
        context: { serverName, metadataPath }
      });
    }
  }

  return result;
}
