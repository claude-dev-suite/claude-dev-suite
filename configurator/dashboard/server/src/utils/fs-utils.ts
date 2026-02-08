// SPDX-License-Identifier: MIT
/**
 * File system utilities
 */

import * as fs from 'fs';
import * as path from 'path';
import { resolveProjectPath, PathValidationError } from './utilities.js';

export const EXCLUDED_DIRS = Object.freeze([
  'node_modules',
  'dist',
  'build',
  'target',
  '.git',
  '__pycache__',
  '.mcp-servers',
  'dev-suite',
]);

export const ENV_FILE_PATTERNS = Object.freeze([
  { pattern: '.env', env: 'default' },
  { pattern: '.env.dev', env: 'dev' },
  { pattern: '.env.development', env: 'dev' },
  { pattern: '.env.test', env: 'test' },
  { pattern: '.env.staging', env: 'staging' },
  { pattern: '.env.prod', env: 'prod' },
  { pattern: '.env.production', env: 'prod' },
  { pattern: '.env.local', env: 'local' },
]);

export function fileExists(dir: string, filename: string): boolean {
  if (dir.includes('..')) throw new PathValidationError('Path traversal not allowed');
  dir = resolveProjectPath(dir);
  try {
    return fs.existsSync(path.join(dir, filename));
  } catch {
    return false;
  }
}

export function fileContains(dir: string, filename: string, pattern: string): boolean {
  if (dir.includes('..')) throw new PathValidationError('Path traversal not allowed');
  dir = resolveProjectPath(dir);
  const filePath = path.join(dir, filename);
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return content.includes(pattern);
    }
  } catch {
    // Ignore read errors
  }
  return false;
}

export function readFileContent(filePath: string): string | null {
  // SECURITY: Path traversal check (for consistency with other utils)
  if (typeof filePath === 'string' && filePath.includes('..')) {
    throw new PathValidationError('Path traversal not allowed');
  }
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8');
    }
  } catch {
    // Ignore read errors
  }
  return null;
}

export function readJsonSync<T>(filePath: string): T | null {
  // SECURITY: Path traversal check at entry
  if (typeof filePath === 'string' && filePath.includes('..')) {
    throw new PathValidationError('Path traversal not allowed');
  }
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as T;
    }
  } catch {
    // Ignore parse/read errors
  }
  return null;
}

export function extractEnvVar(content: string, key: string): string | null {
  const match = content.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return match?.[1] ? match[1].trim().replace(/^["']|["']$/g, '') : null;
}

export function getSubdirectories(dir: string, excludeDirs: readonly string[] = EXCLUDED_DIRS): string[] {
  const subdirs: string[] = [];

  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (
        entry.isDirectory() &&
        !excludeDirs.includes(entry.name) &&
        !entry.name.startsWith('.')
      ) {
        subdirs.push(entry.name);
      }
    }
  } catch {
    // Directory not readable
  }

  return subdirs;
}
