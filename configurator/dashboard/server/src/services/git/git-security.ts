// SPDX-License-Identifier: MIT
/**
 * Git Security Helpers
 *
 * SECURITY: All user inputs are validated to prevent command injection
 * and path traversal attacks.
 */

import * as path from 'path';

/**
 * Validate and resolve a path, preventing path traversal attacks.
 * Ensures the resolved path stays within the allowed base directory.
 */
export function validatePath(userPath: string, baseDir: string): string {
  // Normalize and resolve the path
  const normalizedBase = path.resolve(baseDir);
  const resolvedPath = path.resolve(normalizedBase, userPath);

  // Check that the resolved path starts with the base directory
  if (!resolvedPath.startsWith(normalizedBase + path.sep) && resolvedPath !== normalizedBase) {
    throw new Error(`Path traversal detected: ${userPath}`);
  }

  return resolvedPath;
}

/**
 * Validate a git ref (branch name, tag, commit hash).
 * Only allows alphanumeric, dash, underscore, dot, and forward slash.
 */
export function validateGitRef(ref: string): string {
  // Git refs should only contain safe characters
  // See: https://git-scm.com/docs/git-check-ref-format
  const safeRefPattern = /^[a-zA-Z0-9._\-\/]+$/;

  if (!ref || !safeRefPattern.test(ref)) {
    throw new Error(`Invalid git reference: ${ref}`);
  }

  // Prevent special git refs that could be abused
  const dangerousRefs = ['--', '-', '.', '..'];
  if (dangerousRefs.includes(ref) || ref.startsWith('-') || ref.includes('..')) {
    throw new Error(`Invalid git reference: ${ref}`);
  }

  return ref;
}

/**
 * Validate a commit hash (must be hex string of appropriate length).
 */
export function validateCommitHash(hash: string): string {
  // Git commit hashes are 4-40 character hex strings
  const hashPattern = /^[a-fA-F0-9]{4,40}$/;

  if (!hash || !hashPattern.test(hash)) {
    throw new Error(`Invalid commit hash: ${hash}`);
  }

  return hash;
}

/**
 * Sanitize a file path for use in git commands.
 * Validates characters and prevents command injection.
 */
export function sanitizeFilePath(filePath: string): string {
  if (!filePath) {
    throw new Error('File path cannot be empty');
  }

  // Check for null bytes (command injection vector)
  if (filePath.includes('\0')) {
    throw new Error('Invalid file path: contains null byte');
  }

  // Check for command injection patterns
  const dangerousPatterns = [
    /[`$]/, // Backticks and variable expansion
    /\|/,   // Pipe
    /;/,    // Command separator
    /&/,    // Background/AND
    />/,    // Redirect
    /</,    // Redirect
    /\n/,   // Newline
    /\r/,   // Carriage return
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(filePath)) {
      throw new Error(`Invalid file path: contains dangerous characters`);
    }
  }

  return filePath;
}

/**
 * Get absolute path from repo path and project path with validation.
 */
export function getAbsolutePath(repoPath: string, projectPath: string): string {
  return path.isAbsolute(repoPath)
    ? repoPath
    : validatePath(repoPath, projectPath);
}
