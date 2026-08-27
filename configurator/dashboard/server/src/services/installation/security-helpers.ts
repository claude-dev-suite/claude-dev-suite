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
 * Resolve the deepest ancestor of `p` that exists on disk.
 *
 * The symlink check below only fired when the *leaf* already existed, so a
 * symlinked intermediate directory redirected every write underneath it: a
 * junction at `<project>/.claude` sent 23 files — agents, commands, rules,
 * skills, settings.json — outside the project, with no error. Canonicalising
 * the deepest existing ancestor is what closes that.
 */
function deepestExisting(p: string): string {
  let current = path.resolve(p);
  for (;;) {
    if (fs.existsSync(current)) return current;
    const parent = path.dirname(current);
    if (parent === current) return current;
    current = parent;
  }
}

/**
 * SECURITY: Validate that a path stays within a base directory.
 *
 * Rejects lexical traversal, then canonicalizes the deepest existing ancestor of
 * the target so a symlinked *intermediate* directory cannot redirect the write —
 * not just a symlinked leaf.
 *
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

  // Canonicalize: realpath the deepest existing ancestor and re-append the tail
  // that does not exist yet, then compare against the realpath'd base.
  try {
    const anchor = deepestExisting(resolvedTarget);
    const tail = path.relative(anchor, resolvedTarget);
    const realAnchor = fs.realpathSync(anchor);
    const realTarget = tail ? path.resolve(realAnchor, tail) : realAnchor;
    const realBase = fs.existsSync(resolvedBase) ? fs.realpathSync(resolvedBase) : resolvedBase;

    const realIsWithinBase = realTarget.startsWith(realBase + path.sep);
    const realIsEqualToBase = realTarget === realBase;

    if (!realIsWithinBase && !(allowBase && realIsEqualToBase)) {
      throw new Error(`SECURITY: Symlink escape detected - "${targetPath}" resolves outside base directory`);
    }
  } catch (error: unknown) {
    // A SECURITY error is the verdict; anything else means the path could not be
    // canonicalized, and an uncheckable path is refused rather than trusted.
    if (error instanceof Error && error.message.includes('SECURITY')) throw error;
    logger.warn('Refusing a path that could not be canonicalized', {
      error,
      context: { targetPath, baseDir },
    });
    throw new Error(`SECURITY: could not canonicalize "${targetPath}" for validation`);
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
 * The shape a user-supplied component id (custom agent, custom skill) must have.
 *
 * Must start alphanumeric, then alphanumerics, dashes and underscores, capped at
 * 64 characters. Notably it admits no `.`, `/` or `\`, so an id can never
 * contribute a path segment when joined onto a directory.
 */
export const VALID_COMPONENT_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

/**
 * SECURITY: Assert a user-supplied component id is a single safe path segment.
 *
 * The create paths already validated ids against this pattern, but the read,
 * update and delete paths did not: they interpolated the raw id straight into
 * `path.join(dir, id)`, and `path.join` resolves `..` segments rather than
 * rejecting them. `DELETE /api/custom-skills/..%2F..%2Fsrc` therefore reached a
 * recursive `rmSync` outside the project, and the rename path reached a
 * `renameSync` of an arbitrary directory. Every entry point now goes through
 * here.
 *
 * Returns the id it validated. Callers that build a path from it should use the
 * returned value rather than the argument they passed in: `js/path-injection`
 * follows the variable, not the call, so a void assertion is invisible to it —
 * a return value is the only thing `barrierModel` in
 * `.github/codeql/custom-queries/javascript/path-sanitizers.model.yml` can
 * attach to. The claim it encodes is a fact about `VALID_COMPONENT_NAME`: no
 * `/`, no `\`, no `.`, so the result is a single path segment by construction.
 *
 * @throws Error when the id is not a single safe segment
 * @returns the validated id, unchanged
 */
export function assertValidComponentId(id: string, label = 'ID'): string {
  if (typeof id !== 'string' || !VALID_COMPONENT_NAME.test(id)) {
    throw new Error(
      `Invalid ${label}: must start with a letter or digit and contain only letters, digits, hyphens and underscores (max 64 characters)`
    );
  }
  return id;
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
