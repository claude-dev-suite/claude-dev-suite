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

import { realpathSync } from 'fs';
import { basename, dirname, isAbsolute, join, normalize, resolve, sep } from 'path';

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
 * Resolve symlinks in `p`. For a path that does not exist yet (a file about to
 * be written), resolve the nearest existing ancestor and re-append the rest, so
 * a symlinked parent directory is still followed.
 */
function realpathLenient(p: string): string {
  const missing: string[] = [];
  let current = p;
  for (;;) {
    try {
      return join(realpathSync.native(current), ...missing.reverse());
    } catch {
      const parent = dirname(current);
      if (parent === current) return p;
      missing.push(basename(current));
      current = parent;
    }
  }
}

/** Windows and macOS default filesystems are case-insensitive. */
const CASE_INSENSITIVE = process.platform === 'win32' || process.platform === 'darwin';

function isInside(child: string, parent: string): boolean {
  const c = CASE_INSENSITIVE ? child.toLowerCase() : child;
  const r = CASE_INSENSITIVE ? parent.toLowerCase() : parent;
  const rootWithSep = r.endsWith(sep) ? r : r + sep;
  return c === r || c.startsWith(rootWithSep);
}

/**
 * Assert `target` resolves inside `root`, and return the resolved path.
 *
 * `path.join`/`path.resolve` collapse `..` rather than rejecting it, so this is
 * the only check that actually keeps a caller-supplied path inside a directory.
 * Symlinks are resolved on both sides first: a link inside the root pointing
 * outside it must not pass. Comparison ignores case on Windows and macOS, where
 * `C:\Proj` and `c:\proj` are the same directory.
 */
export function assertWithinRoot(target: string, root: string): string {
  const resolvedRoot = resolve(root);
  const resolved = resolve(target);
  if (!isInside(resolved, resolvedRoot) || !isInside(realpathLenient(resolved), realpathLenient(resolvedRoot))) {
    throw new Error(`Path escapes the permitted directory: ${target}`);
  }
  return resolved;
}
