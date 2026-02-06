/**
 * File system utilities for MCP servers
 * Provides safe wrappers for common file operations
 */

import { readFile, writeFile, mkdir, stat, access, readdir } from 'fs/promises';
import { constants } from 'fs';
import { dirname, join, resolve } from 'path';

/**
 * Read a file safely, returning null if it doesn't exist or can't be read
 */
export async function readFileSafe(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Read and parse a JSON file safely
 */
export async function readJsonSafe<T = unknown>(path: string): Promise<T | null> {
  const content = await readFileSafe(path);
  if (!content) return null;

  try {
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

/**
 * Write a file, creating parent directories if needed
 */
export async function writeFileSafe(path: string, content: string): Promise<boolean> {
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, 'utf-8');
    return true;
  } catch {
    return false;
  }
}

/**
 * Write a JSON file with pretty printing
 */
export async function writeJsonSafe<T>(path: string, data: T, indent = 2): Promise<boolean> {
  return writeFileSafe(path, JSON.stringify(data, null, indent));
}

/**
 * Check if a path exists
 */
export async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a path is a directory
 */
export async function isDirectory(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check if a path is a file
 */
export async function isFile(path: string): Promise<boolean> {
  try {
    const stats = await stat(path);
    return stats.isFile();
  } catch {
    return false;
  }
}

/**
 * Ensure a directory exists, creating it if necessary
 */
export async function ensureDir(path: string): Promise<boolean> {
  try {
    await mkdir(path, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get file size in bytes, or -1 if file doesn't exist
 */
export async function getFileSize(path: string): Promise<number> {
  try {
    const stats = await stat(path);
    return stats.size;
  } catch {
    return -1;
  }
}

/**
 * List files in a directory, returning empty array on error
 */
export async function listDir(path: string): Promise<string[]> {
  try {
    return await readdir(path);
  } catch {
    return [];
  }
}

/**
 * List files in a directory with full paths
 */
export async function listDirFull(path: string): Promise<string[]> {
  const files = await listDir(path);
  return files.map(f => join(path, f));
}

/**
 * Find files matching a pattern in a directory (non-recursive)
 */
export async function findFiles(
  dir: string,
  filter: (name: string) => boolean
): Promise<string[]> {
  const files = await listDir(dir);
  return files.filter(filter).map(f => join(dir, f));
}

/**
 * Resolve a path relative to a base, with validation
 */
export function resolvePath(base: string, ...paths: string[]): string {
  const resolved = resolve(base, ...paths);

  // Ensure the resolved path is within the base (prevent path traversal)
  if (!resolved.startsWith(resolve(base))) {
    throw new Error(`Path traversal detected: ${paths.join('/')}`);
  }

  return resolved;
}

/**
 * Sanitize a filename by removing unsafe characters
 */
export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

/**
 * Get file extension (lowercase, without dot)
 */
export function getExtension(path: string): string {
  const lastDot = path.lastIndexOf('.');
  if (lastDot === -1 || lastDot === path.length - 1) return '';
  return path.slice(lastDot + 1).toLowerCase();
}
