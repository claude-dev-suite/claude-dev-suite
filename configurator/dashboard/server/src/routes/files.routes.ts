// SPDX-License-Identifier: MIT
/**
 * Files API Routes
 *
 * Read-only file system access for the file viewer tool window.
 * Endpoints:
 *   GET /api/files/tree?path=<projectPath>         - directory tree
 *   GET /api/files/read?path=<projectPath>&file=<rel> - file content
 */

import path from 'node:path';
import fs from 'node:fs';
import { Router, type Request, type Response } from 'express';
import { resolveProjectPath, PathValidationError } from '../utils/utilities.js';
import type { ApiResponse } from '../types.js';

export const filesRoutes = Router();

// ============================================
// CONSTANTS
// ============================================

const MAX_DEPTH = 4;
const MAX_FILE_SIZE_BYTES = 500 * 1024; // 500 KB

/** Directories to skip entirely when building the tree */
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '__pycache__',
  'coverage', '.nyc_output', 'target', 'vendor', '.cache', '.parcel-cache',
  'out', '.turbo', '.svelte-kit', '.nuxt',
]);

/** Hidden entries to include even though they start with '.' */
const ALLOWED_HIDDEN = new Set([
  '.env', '.env.local', '.env.example', '.gitignore', '.gitattributes',
  '.eslintrc', '.eslintrc.json', '.eslintrc.js', '.prettierrc',
  '.prettierrc.json', '.editorconfig', '.claude',
]);

// ============================================
// TYPES
// ============================================

export interface FileTreeNode {
  name: string;
  /** Path relative to the project root, using forward slashes */
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
}

// ============================================
// HELPERS
// ============================================

function buildTree(absDir: string, projectRoot: string, depth: number): FileTreeNode[] {
  if (depth > MAX_DEPTH) return [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(absDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const nodes: FileTreeNode[] = [];

  for (const entry of entries) {
    const isHidden = entry.name.startsWith('.');
    if (isHidden && !ALLOWED_HIDDEN.has(entry.name)) continue;
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;

    const absPath = path.join(absDir, entry.name);
    const relPath = path.relative(projectRoot, absPath).replace(/\\/g, '/');

    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        path: relPath,
        type: 'directory',
        children: buildTree(absPath, projectRoot, depth + 1),
      });
    } else {
      nodes.push({ name: entry.name, path: relPath, type: 'file' });
    }
  }

  // Directories first, then files — both sorted alphabetically
  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

// ============================================
// ROUTES
// ============================================

/**
 * GET /api/files/tree?path=<projectPath>
 * Returns a recursive file tree for the project directory.
 */
filesRoutes.get('/tree', async (req: Request, res: Response) => {
  try {
    const projectRoot = resolveProjectPath(req.query.path);
    const tree = buildTree(projectRoot, projectRoot, 0);

    const response: ApiResponse<FileTreeNode[]> = { success: true, data: tree };
    res.json(response);
  } catch (err) {
    if (err instanceof PathValidationError) {
      res.status(400).json({ success: false, error: err.message });
    } else {
      res.status(500).json({ success: false, error: 'Failed to read directory' });
    }
  }
});

/**
 * GET /api/files/read?path=<projectPath>&file=<relativeFilePath>
 * Returns the text content of a file within the project.
 */
filesRoutes.get('/read', async (req: Request, res: Response) => {
  try {
    const projectRoot = resolveProjectPath(req.query.path);
    const relFile = req.query.file;

    if (!relFile || typeof relFile !== 'string') {
      res.status(400).json({ success: false, error: 'File path is required' });
      return;
    }

    // Security: resolve and verify the path stays inside projectRoot
    const absFile = path.resolve(projectRoot, relFile);
    const rootWithSep = projectRoot.endsWith(path.sep) ? projectRoot : projectRoot + path.sep;
    if (!absFile.startsWith(rootWithSep) && absFile !== projectRoot) {
      res.status(403).json({ success: false, error: 'Path traversal not allowed' });
      return;
    }

    let stat: fs.Stats;
    try {
      stat = fs.statSync(absFile);
    } catch {
      res.status(404).json({ success: false, error: 'File not found' });
      return;
    }

    if (!stat.isFile()) {
      res.status(400).json({ success: false, error: 'Path is not a file' });
      return;
    }

    if (stat.size > MAX_FILE_SIZE_BYTES) {
      res.status(413).json({ success: false, error: 'File too large to display (max 500 KB)' });
      return;
    }

    const content = fs.readFileSync(absFile, 'utf-8');
    const response: ApiResponse<{ content: string; size: number }> = {
      success: true,
      data: { content, size: stat.size },
    };
    res.json(response);
  } catch (err) {
    if (err instanceof PathValidationError) {
      res.status(400).json({ success: false, error: err.message });
    } else {
      res.status(500).json({ success: false, error: 'Failed to read file' });
    }
  }
});
