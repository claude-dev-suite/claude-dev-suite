// SPDX-License-Identifier: MIT
/**
 * Filesystem path validation shared by every dev-suite MCP server.
 *
 * The rule is deliberately narrow: reject null bytes (which truncate the path
 * in some syscalls) and require an absolute path, so a relative argument can
 * never be resolved against whatever the server's cwd happens to be.
 *
 * Five byte-identical copies of this lived in code-quality's analyzers alone.
 * Copies drift silently, which is exactly how a guard stops guarding.
 */

import { isAbsolute, normalize, resolve, sep } from 'path';

/** Reject paths containing null bytes, and require an absolute path. */
export function validateFilePath(filePath: string): void {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    throw new Error('Invalid file path: must be a non-empty string');
  }
  if (filePath.includes('\0')) {
    throw new Error('Invalid file path: contains null byte');
  }
  if (!isAbsolute(normalize(filePath))) {
    throw new Error('File path must be absolute');
  }
}

/**
 * Assert `target` resolves inside `root`.
 *
 * `path.join`/`path.resolve` collapse `..` rather than rejecting it, so this is
 * the only check that actually keeps a caller-supplied path inside a directory.
 */
export function assertWithinRoot(target: string, root: string): string {
  const resolvedRoot = resolve(root);
  const resolved = resolve(target);
  if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + sep)) {
    throw new Error(`Path escapes the permitted directory: ${target}`);
  }
  return resolved;
}
