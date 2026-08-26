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

/**
 * Secret-file deny-list for /api/files/read.
 *
 * These patterns are matched against the *relative* path of the requested file
 * (resolved inside the project root, forward-slash normalised).  If any pattern
 * matches, the request is rejected with 403 so that sensitive credentials can
 * never be exfiltrated even though the file technically lives inside the project
 * tree.
 *
 * Rationale:
 *   - .dev-suite/usage-config.json  — stores the plaintext Anthropic admin API key
 *   - .env / .env.* variants        — hold application secrets (DB passwords, tokens…)
 *   - *.pem / *.key / *.p12 / *.pfx — TLS private-key material
 *   - id_rsa, id_ed25519 …          — SSH private keys
 */
const SECRET_FILE_PATTERNS: Array<RegExp> = [
  // Dev-suite config that contains the plaintext admin API key
  /^\.dev-suite\/usage-config\.json$/i,
  // .env files with secrets (allow .env.example which is safe by convention)
  /^\.env(\.local|\.development|\.staging|\.production|\.prod|\.test)?$/i,
  // TLS/PKI private-key material
  /\.(pem|key|p12|pfx|jks)$/i,
  // SSH private keys (id_rsa, id_ed25519, id_ecdsa, id_dsa, etc.)
  /(?:^|\/)id_(?:rsa|ed25519|ecdsa|dsa|xmss)(?:\.pub)?$/i,
  // Generic *.secret / *.secrets files
  /\.secrets?$/i,
  // Every assistant's MCP config: dev-suite bakes the wizard's env values —
  // API keys, database URLs — straight into these. `.env` was denied while the
  // same credential was served verbatim from `.cursor/mcp.json`.
  /^\.mcp\.json$/i,
  /^\.vscode\/mcp\.json$/i,
  /^\.github\/mcp\.json$/i,
  /^\.cursor\/mcp\.json$/i,
  /^\.kimi-code\/mcp\.json$/i,
  /^\.gemini\/settings\.json$/i,
  /^\.codex\/config\.toml$/i,
];

/**
 * Returns true when the relative path (forward-slash normalised) matches any
 * entry in the secret-file deny-list.
 */
export function isSecretFile(relPath: string): boolean {
  const normalised = relPath.replace(/\\/g, '/').toLowerCase();
  return SECRET_FILE_PATTERNS.some((re) => re.test(normalised));
}

/** Hidden entries to include even though they start with '.' */
const ALLOWED_HIDDEN = new Set([
  '.env', '.env.local', '.env.example', '.gitignore', '.gitattributes',
  '.eslintrc', '.eslintrc.json', '.eslintrc.js', '.prettierrc',
  '.prettierrc.json', '.editorconfig',
  // Every assistant directory dev-suite writes into, not just Claude Code's —
  // a multi-assistant install was largely invisible in the file tree.
  '.claude', '.cursor', '.gemini', '.codex', '.clinerules', '.kimi-code',
  '.agents', '.vscode', '.github',
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

    // Security: resolve and verify the path stays inside projectRoot.
    // path.resolve alone is insufficient — a symlink inside the project can
    // point arbitrarily outside.  We resolve symlinks with realpathSync and
    // re-check containment against the project root's realpath.
    const absFile = path.resolve(projectRoot, relFile);
    const rootWithSep = projectRoot.endsWith(path.sep) ? projectRoot : projectRoot + path.sep;
    if (!absFile.startsWith(rootWithSep) && absFile !== projectRoot) {
      res.status(403).json({ success: false, error: 'Path traversal not allowed' });
      return;
    }

    // Resolve the project root's realpath once (handles symlinked project dirs).
    let realRoot: string;
    try {
      realRoot = fs.realpathSync(projectRoot);
    } catch {
      realRoot = projectRoot;
    }
    const realRootWithSep = realRoot.endsWith(path.sep) ? realRoot : realRoot + path.sep;

    let stat: fs.Stats;
    let realFile: string;
    try {
      stat = fs.statSync(absFile);
      // Resolve symlinks in the target file path and re-check containment.
      // For files that do not yet exist realpathSync would throw; use the
      // parent dir's realpath in that case (fallback containment check).
      try {
        realFile = fs.realpathSync(absFile);
      } catch {
        realFile = path.join(fs.realpathSync(path.dirname(absFile)), path.basename(absFile));
      }
      if (!realFile.startsWith(realRootWithSep) && realFile !== realRoot) {
        res.status(403).json({ success: false, error: 'Path traversal not allowed' });
        return;
      }
    } catch {
      res.status(404).json({ success: false, error: 'File not found' });
      return;
    }

    if (!stat.isFile()) {
      res.status(400).json({ success: false, error: 'Path is not a file' });
      return;
    }

    // Secret-file deny-list: block access to credential/key files even when
    // they reside legitimately inside the project root.
    const relFromRoot = path.relative(projectRoot, absFile).replace(/\\/g, '/');
    if (isSecretFile(relFromRoot)) {
      res.status(403).json({ success: false, error: 'Access to secret files is not allowed' });
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
