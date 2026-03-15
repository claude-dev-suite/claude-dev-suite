// SPDX-License-Identifier: MIT
/**
 * Security Helpers for Installation Service
 *
 * Path validation utilities to prevent path traversal attacks.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getLogger } from '../../utils/logger.js';

const logger = getLogger('InstallationSecurity');

/**
 * SECURITY: Validate that a path stays within a base directory.
 * Resolves symlinks and prevents path traversal attacks.
 * @param targetPath - The path to validate
 * @param baseDir - The directory the path must stay within
 * @param allowBase - Whether to allow paths equal to baseDir (default: true)
 * @throws Error if path escapes baseDir
 */
export function validatePathWithinBase(targetPath: string, baseDir: string, allowBase = true): string {
  if (targetPath.includes('..')) throw new Error('Path traversal not allowed');
  if (baseDir.includes('..')) throw new Error('Path traversal not allowed');
  // Resolve both paths to their absolute canonical forms
  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(targetPath);
  if (resolvedTarget.includes('..')) throw new Error('Path traversal not allowed');

  // Check that the resolved path starts with the base directory
  const isWithinBase = resolvedTarget.startsWith(resolvedBase + path.sep);
  const isEqualToBase = resolvedTarget === resolvedBase;

  if (!isWithinBase && !(allowBase && isEqualToBase)) {
    throw new Error(`SECURITY: Path traversal detected - "${targetPath}" escapes base directory`);
  }

  // Additional check: if the path exists, resolve symlinks and verify again
  if (fs.existsSync(resolvedTarget)) {
    try {
      const realPath = fs.realpathSync(resolvedTarget);
      const realBase = fs.realpathSync(resolvedBase);
      const realIsWithinBase = realPath.startsWith(realBase + path.sep);
      const realIsEqualToBase = realPath === realBase;

      if (!realIsWithinBase && !(allowBase && realIsEqualToBase)) {
        throw new Error(`SECURITY: Symlink escape detected - "${targetPath}" resolves outside base directory`);
      }
    } catch (error: unknown) {
      // If realpath fails on existing file, it's suspicious
      if (error instanceof Error && !error.message.includes('SECURITY')) {
        logger.warn('Failed to resolve real path', { error, context: { targetPath, baseDir } });
      } else {
        throw error;
      }
    }
  }

  return resolvedTarget;
}

/**
 * SECURITY: Validate a file/directory name doesn't contain path separators or dangerous patterns
 */
export function validateEntryName(name: string): boolean {
  // Reject names with path separators, null bytes, or parent directory references
  if (name.includes(path.sep) || name.includes('/') || name.includes('\\')) {
    return false;
  }
  if (name.includes('\0')) {
    return false;
  }
  if (name === '..' || name === '.') {
    return false;
  }
  return true;
}

/**
 * SECURITY: Validate agent ID - only allow alphanumeric, dash, underscore
 */
export function validateAgentId(agentId: string): boolean {
  const safeAgentIdPattern = /^[a-zA-Z0-9_-]+$/;
  return safeAgentIdPattern.test(agentId);
}

/**
 * SECURITY: Validate skill path - only allow alphanumeric, dash, underscore, forward slash
 */
export function validateSkillPath(skillPath: string): boolean {
  const safeSkillPathPattern = /^[a-zA-Z0-9_\-\/]+$/;
  return safeSkillPathPattern.test(skillPath) && !skillPath.includes('..');
}
