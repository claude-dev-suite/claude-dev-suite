// SPDX-License-Identifier: MIT
/**
 * Utility functions for dev-suite dashboard server
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { TIMEOUTS } from './constants.js';

// ============================================
// FILE SYSTEM UTILITIES
// ============================================

/**
 * Check if a file exists asynchronously
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a file exists synchronously
 */
export function fileExistsSync(filePath: string): boolean {
  try {
    fs.accessSync(filePath, fs.constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read JSON file safely
 */
export async function readJsonFile<T = unknown>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

/**
 * Read JSON file safely (sync)
 */
export function readJsonFileSync<T = unknown>(filePath: string): T | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

/**
 * Write JSON file with pretty printing
 */
export async function writeJsonFile(filePath: string, data: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.promises.mkdir(dir, { recursive: true });
  await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Write JSON file with pretty printing (sync)
 */
export function writeJsonFileSync(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Copy file or directory recursively
 */
export async function copyPath(source: string, dest: string): Promise<void> {
  const stat = await fs.promises.stat(source);

  if (stat.isDirectory()) {
    await fs.promises.mkdir(dest, { recursive: true });
    const entries = await fs.promises.readdir(source);
    for (const entry of entries) {
      await copyPath(path.join(source, entry), path.join(dest, entry));
    }
  } else {
    await fs.promises.mkdir(path.dirname(dest), { recursive: true });
    await fs.promises.copyFile(source, dest);
  }
}

/**
 * Remove file or directory recursively
 */
export async function removePath(targetPath: string): Promise<void> {
  try {
    await fs.promises.rm(targetPath, { recursive: true, force: true });
  } catch {
    // Ignore errors
  }
}

// ============================================
// PATH UTILITIES
// ============================================

/**
 * Validate and resolve a project path
 */
export function validateProjectPath(projectPath: string): { valid: boolean; path?: string; error?: string } {
  if (!projectPath || typeof projectPath !== 'string') {
    return { valid: false, error: 'Project path is required' };
  }

  const resolvedPath = path.resolve(projectPath);

  if (projectPath.includes('..')) {
    return { valid: false, error: 'Path traversal not allowed' };
  }

  if (!path.isAbsolute(resolvedPath)) {
    return { valid: false, error: 'Path must be absolute' };
  }

  if (!fs.existsSync(resolvedPath)) {
    return { valid: false, error: 'Path does not exist' };
  }

  return { valid: true, path: resolvedPath };
}

/**
 * SECURITY: Extract and validate a project path from request.
 * Returns validated absolute path or throws PathValidationError.
 */
export function resolveProjectPath(raw: unknown): string {
  if (typeof raw !== 'string' || !raw) {
    throw new PathValidationError('Project path is required');
  }
  if (raw.includes('..')) {
    throw new PathValidationError('Path traversal not allowed');
  }
  if (!path.isAbsolute(raw)) {
    throw new PathValidationError('Path must be absolute');
  }
  if (!fs.existsSync(raw)) {
    throw new PathValidationError('Path does not exist');
  }
  return raw;
}

export class PathValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PathValidationError';
  }
}

/**
 * Escape path for shell command
 */
export function escapeShellArg(arg: string): string {
  if (process.platform === 'win32') {
    return `"${arg.replace(/["%!^]/g, '^$&')}"`;
  }
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

// ============================================
// COMMAND UTILITIES
// ============================================

/**
 * Execute a shell command synchronously
 */
export function execCommand(
  command: string,
  options: {
    cwd?: string;
    timeout?: number;
    stdio?: 'inherit' | 'pipe' | 'ignore';
  } = {}
): { success: boolean; output?: string; error?: string } {
  try {
    const result = execSync(command, {
      cwd: options.cwd,
      timeout: options.timeout || TIMEOUTS.COMMAND_DEFAULT,
      stdio: options.stdio || 'pipe',
      encoding: 'utf-8',
    });
    return { success: true, output: result };
  } catch (error) {
    const err = error as Error & { stderr?: string };
    return { success: false, error: err.stderr || err.message };
  }
}

// ============================================
// STRING UTILITIES
// ============================================

/**
 * Strip ANSI escape codes from a string
 */
export function stripAnsi(str: string): string {
  return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}

/**
 * Truncate text to a maximum length
 */
export function truncateText(text: string, maxLen = 150): string {
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen) + '...';
}

/**
 * Escape single quotes for safe shell string insertion
 */
export function escapeShellSingleQuote(str: string): string {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/'/g, "'\\''");
}

/**
 * Validate that a string is a valid regex pattern
 */
export function isValidRegex(pattern: string): boolean {
  if (!pattern || typeof pattern !== 'string') return false;
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

// ============================================
// DATE UTILITIES
// ============================================

/**
 * Format a date as ISO string
 */
export function formatDate(date: Date = new Date()): string {
  return date.toISOString();
}

/**
 * Get date string (YYYY-MM-DD)
 */
export function getDateString(date: Date = new Date()): string {
  return date.toISOString().split('T')[0] ?? '';
}

// ============================================
// OBJECT UTILITIES
// ============================================

/**
 * Deep merge two objects
 */
export function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const output = { ...target };

  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const sourceValue = source[key];
      const targetValue = target[key];

      if (
        sourceValue !== null &&
        typeof sourceValue === 'object' &&
        !Array.isArray(sourceValue) &&
        targetValue !== null &&
        typeof targetValue === 'object' &&
        !Array.isArray(targetValue)
      ) {
        output[key] = deepMerge(
          targetValue as Record<string, unknown>,
          sourceValue as Record<string, unknown>
        ) as T[Extract<keyof T, string>];
      } else {
        output[key] = sourceValue as T[Extract<keyof T, string>];
      }
    }
  }

  return output;
}

// ============================================
// CACHE UTILITIES
// ============================================

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

/**
 * Simple in-memory cache with TTL
 */
export class SimpleCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private ttlMs: number;

  constructor(ttlMs: number = 5 * 60 * 1000) {
    this.ttlMs = ttlMs;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  set(key: string, data: T): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }
}
