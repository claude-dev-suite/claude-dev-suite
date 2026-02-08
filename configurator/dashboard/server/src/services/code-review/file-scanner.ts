// SPDX-License-Identifier: MIT
/**
 * File Scanner for Code Review
 *
 * Handles source file discovery and project code extraction.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { resolveProjectPath } from '../../utils/utilities.js';
import type { FileTreeNode, SourceFilesResult, DiffResult } from './types.js';
import { SOURCE_EXTENSIONS, INCLUDE_FILES, EXCLUDED_DIRS } from './constants.js';

/**
 * Check if a file should be included in review
 */
export function shouldIncludeFile(filePath: string): boolean {
  const fileName = path.basename(filePath);
  if (INCLUDE_FILES.has(fileName)) return true;
  const ext = path.extname(filePath).toLowerCase();
  return SOURCE_EXTENSIONS.has(ext);
}

/**
 * List source files in a project
 */
export function listSourceFiles(projectPath: string, isValidPath: (p: string) => boolean): SourceFilesResult {
  projectPath = resolveProjectPath(projectPath);
  if (!isValidPath(projectPath)) {
    throw new Error(`Invalid or non-existent path: ${projectPath}`);
  }

  let allFiles: string[] = [];

  try {
    const output = execSync('git ls-files', {
      cwd: projectPath,
      encoding: 'utf8',
      maxBuffer: 5 * 1024 * 1024,
      timeout: 10000,
    });
    const rawFiles = output.trim().split('\n').filter(Boolean);

    for (const relPath of rawFiles) {
      const absPath = path.join(projectPath, relPath);
      if (fs.existsSync(absPath)) {
        allFiles.push(relPath);
      }
    }
  } catch {
    // Git command failed - fallback to directory scan
    const scanDir = (dir: string, base = ''): void => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (EXCLUDED_DIRS.has(entry.name)) continue;
          const relPath = base ? `${base}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            scanDir(path.join(dir, entry.name), relPath);
          } else {
            allFiles.push(relPath);
          }
        }
      } catch {
        // Directory not readable - skip
      }
    };
    scanDir(projectPath);
  }

  const sourceFiles = allFiles.filter((file) => {
    if (!shouldIncludeFile(file)) return false;
    const parts = file.split('/');
    return !parts.some((part) => EXCLUDED_DIRS.has(part));
  });

  // Build tree structure
  const tree: { name: string; type: 'directory'; children: Record<string, unknown>; fileCount: number } = {
    name: '.',
    type: 'directory',
    children: {},
    fileCount: 0,
  };

  for (const file of sourceFiles) {
    const parts = file.split('/');
    let current: Record<string, unknown> = tree;

    for (let i = 0; i < parts.length - 1; i++) {
      const dirName = parts[i];
      if (!dirName) continue;
      if (!current.children) current.children = {};
      const children = current.children as Record<string, Record<string, unknown>>;
      if (!children[dirName]) {
        children[dirName] = {
          name: dirName,
          type: 'directory',
          path: parts.slice(0, i + 1).join('/'),
          children: {},
          fileCount: 0,
        };
      }
      current = children[dirName]!;
    }

    const fileName = parts[parts.length - 1];
    if (fileName) {
      const children = (current.children || {}) as Record<string, Record<string, unknown>>;
      children[fileName] = {
        name: fileName,
        type: 'file',
        path: file,
      };
      current.children = children;
    }

    let node: Record<string, unknown> = tree;
    (node.fileCount as number)++;
    for (let i = 0; i < parts.length - 1; i++) {
      const dirName = parts[i];
      if (!dirName) continue;
      const children = node.children as Record<string, Record<string, unknown>>;
      const nextNode = children[dirName];
      if (!nextNode) break;
      node = nextNode;
      (node.fileCount as number)++;
    }
  }

  // Convert to array
  const convertToArray = (node: Record<string, unknown>, depth = 0): FileTreeNode[] => {
    const result: FileTreeNode[] = [];
    const children = node.children as Record<string, Record<string, unknown>>;
    const entries = Object.values(children || {});

    entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return (a.name as string).localeCompare(b.name as string);
    });

    for (const entry of entries) {
      if (entry.type === 'directory') {
        result.push({
          name: entry.name as string,
          type: 'directory',
          path: entry.path as string,
          fileCount: entry.fileCount as number,
          depth,
        });
        result.push(...convertToArray(entry, depth + 1));
      } else {
        result.push({
          name: entry.name as string,
          type: 'file',
          path: entry.path as string,
          depth,
        });
      }
    }
    return result;
  };

  return {
    tree: convertToArray(tree),
    files: sourceFiles,
    totalFiles: sourceFiles.length,
  };
}

/**
 * Get full project code for review
 */
export function getFullProjectCode(
  projectPath: string,
  options: { maxFiles?: number; maxSize?: number; paths?: string[] } = {},
): DiffResult {
  projectPath = resolveProjectPath(projectPath);
  const MAX_FILES = options.maxFiles || 100;
  const MAX_TOTAL_SIZE = options.maxSize || 500 * 1024;
  const MAX_LINES_PER_FILE = 500;
  const filterPaths = options.paths || null;

  let allFiles: string[];
  try {
    const output = execSync('git ls-files', {
      cwd: projectPath,
      encoding: 'utf8',
      maxBuffer: 5 * 1024 * 1024,
      timeout: 10000,
    });
    allFiles = output.trim().split('\n').filter(Boolean);
  } catch {
    // Git command failed - fallback to directory scan
    allFiles = [];
    const scanDir = (dir: string, base = ''): void => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (EXCLUDED_DIRS.has(entry.name)) continue;
          const relPath = base ? `${base}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            scanDir(path.join(dir, entry.name), relPath);
          } else {
            allFiles.push(relPath);
          }
        }
      } catch {
        // Directory not readable - skip
      }
    };
    scanDir(projectPath);
  }

  let sourceFiles = allFiles.filter((file) => {
    if (!shouldIncludeFile(file)) return false;
    const parts = file.split('/');
    return !parts.some((part) => EXCLUDED_DIRS.has(part));
  });

  if (filterPaths && filterPaths.length > 0) {
    sourceFiles = sourceFiles.filter((file) => {
      return filterPaths.some((pattern) => {
        if (pattern.endsWith('/')) {
          return file.startsWith(pattern) || file.startsWith(pattern.slice(0, -1));
        }
        return file === pattern || file.startsWith(pattern + '/');
      });
    });
  }

  const collectedFiles: Array<{ path: string; content: string; truncated: boolean }> = [];
  let totalSize = 0;

  for (const file of sourceFiles) {
    if (collectedFiles.length >= MAX_FILES) break;
    if (totalSize >= MAX_TOTAL_SIZE) break;

    const fullPath = path.join(projectPath, file);
    try {
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');
      const truncatedContent = lines.slice(0, MAX_LINES_PER_FILE).join('\n');
      const wasTruncated = lines.length > MAX_LINES_PER_FILE;

      if (totalSize + truncatedContent.length > MAX_TOTAL_SIZE) continue;

      collectedFiles.push({
        path: file,
        content: truncatedContent,
        truncated: wasTruncated,
      });
      totalSize += truncatedContent.length;
    } catch {
      // File not readable or binary - skip
    }
  }

  const output = collectedFiles
    .map((f) => {
      const header = `=== ${f.path} ===` + (f.truncated ? ' (truncated)' : '');
      return `${header}\n${f.content}`;
    })
    .join('\n\n');

  return {
    diff: output,
    files: collectedFiles.map((f) => f.path),
  };
}

/**
 * Parse diff output to extract changed files
 */
export function parseDiffFiles(diff: string): string[] {
  if (!diff) return [];

  const filesSet = new Set<string>();
  const regex = /^diff --git a\/(.+?) b\//gm;
  let match;

  while ((match = regex.exec(diff)) !== null) {
    const filePath = match[1];
    if (filePath) {
      filesSet.add(filePath);
    }
  }

  return [...filesSet];
}
