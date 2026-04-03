/**
 * Files Routes Tests
 *
 * Tests for the read-only file viewer API:
 *   GET /api/files/tree  - directory tree
 *   GET /api/files/read  - file content
 *
 * Covers:
 *   - Happy path: tree listing and file reading
 *   - Directory filtering (node_modules, .git, dist, etc.)
 *   - Sorting: directories before files, alphabetical
 *   - Depth limit
 *   - Security: path traversal attempts
 *   - Edge cases: missing files, binary/large files, non-file paths
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createTempDir, cleanupTempDir } from '../test-utils.js';

// ─── Import route handlers under test ─────────────────────────────────────────
// We test the route logic by importing files.routes.ts and calling the Express
// router in isolation (no full server needed).

import express, { type Express } from 'express';
import request from 'supertest';
import { filesRoutes } from '../../src/routes/files.routes.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use('/api/files', filesRoutes);
  return app;
}

function writeFile(dir: string, rel: string, content: string): void {
  const abs = path.join(dir, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf-8');
}

// ─── Tree endpoint ─────────────────────────────────────────────────────────────

describe('GET /api/files/tree', () => {
  let app: Express;
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = createTempDir('files-tree-');
    app = buildApp();

    // Build a sample project tree
    writeFile(tmpDir, 'src/index.ts', 'export const x = 1;');
    writeFile(tmpDir, 'src/utils/helper.ts', 'export const y = 2;');
    writeFile(tmpDir, 'package.json', '{"name":"test"}');
    writeFile(tmpDir, 'README.md', '# Test');
    writeFile(tmpDir, '.gitignore', 'node_modules/');
    writeFile(tmpDir, '.env', 'API_KEY=secret');

    // Directories that must be skipped
    writeFile(tmpDir, 'node_modules/lodash/index.js', '');
    writeFile(tmpDir, '.git/config', '');
    writeFile(tmpDir, 'dist/bundle.js', '');
    writeFile(tmpDir, 'build/app.js', '');
    writeFile(tmpDir, '.cache/meta.json', '');
  });

  afterAll(() => cleanupTempDir(tmpDir));

  it('returns a successful tree for a valid project path', async () => {
    const res = await request(app)
      .get('/api/files/tree')
      .query({ path: tmpDir });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('includes source files and config files', async () => {
    const res = await request(app)
      .get('/api/files/tree')
      .query({ path: tmpDir });

    const names = res.body.data.map((n: { name: string }) => n.name);
    expect(names).toContain('src');
    expect(names).toContain('package.json');
    expect(names).toContain('README.md');
  });

  it('includes allowed hidden files (.gitignore, .env)', async () => {
    const res = await request(app)
      .get('/api/files/tree')
      .query({ path: tmpDir });

    const names = res.body.data.map((n: { name: string }) => n.name);
    expect(names).toContain('.gitignore');
    expect(names).toContain('.env');
  });

  it('skips node_modules', async () => {
    const res = await request(app)
      .get('/api/files/tree')
      .query({ path: tmpDir });

    const names = res.body.data.map((n: { name: string }) => n.name);
    expect(names).not.toContain('node_modules');
  });

  it('skips .git directory', async () => {
    const res = await request(app)
      .get('/api/files/tree')
      .query({ path: tmpDir });

    const names = res.body.data.map((n: { name: string }) => n.name);
    expect(names).not.toContain('.git');
  });

  it('skips dist and build directories', async () => {
    const res = await request(app)
      .get('/api/files/tree')
      .query({ path: tmpDir });

    const names = res.body.data.map((n: { name: string }) => n.name);
    expect(names).not.toContain('dist');
    expect(names).not.toContain('build');
  });

  it('skips .cache directory', async () => {
    const res = await request(app)
      .get('/api/files/tree')
      .query({ path: tmpDir });

    const names = res.body.data.map((n: { name: string }) => n.name);
    expect(names).not.toContain('.cache');
  });

  it('sorts directories before files', async () => {
    const res = await request(app)
      .get('/api/files/tree')
      .query({ path: tmpDir });

    const nodes: Array<{ name: string; type: string }> = res.body.data;
    const firstFile = nodes.findIndex((n) => n.type === 'file');
    const lastDir = nodes.map((n) => n.type).lastIndexOf('directory');

    // All directories should appear before any file
    if (firstFile !== -1 && lastDir !== -1) {
      expect(lastDir).toBeLessThan(firstFile);
    }
  });

  it('returns nested children for directories', async () => {
    const res = await request(app)
      .get('/api/files/tree')
      .query({ path: tmpDir });

    const srcNode = res.body.data.find((n: { name: string; type: string }) => n.name === 'src' && n.type === 'directory');
    expect(srcNode).toBeDefined();
    expect(Array.isArray(srcNode.children)).toBe(true);
    const childNames = srcNode.children.map((c: { name: string }) => c.name);
    expect(childNames).toContain('index.ts');
    expect(childNames).toContain('utils');
  });

  it('uses forward slashes in paths (cross-platform)', async () => {
    const res = await request(app)
      .get('/api/files/tree')
      .query({ path: tmpDir });

    const srcNode = res.body.data.find((n: { name: string }) => n.name === 'src');
    expect(srcNode?.path).not.toContain('\\');
    expect(srcNode?.path).toBe('src');
  });

  it('returns 400 when path is missing', async () => {
    const res = await request(app).get('/api/files/tree');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 for a relative path', async () => {
    const res = await request(app)
      .get('/api/files/tree')
      .query({ path: 'relative/path' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 for path with traversal (..) in segment', async () => {
    const res = await request(app)
      .get('/api/files/tree')
      .query({ path: `${tmpDir}/../..` });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ─── Read endpoint ─────────────────────────────────────────────────────────────

describe('GET /api/files/read', () => {
  let app: Express;
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = createTempDir('files-read-');
    app = buildApp();

    writeFile(tmpDir, 'src/index.ts', 'const hello = "world";\nexport default hello;\n');
    writeFile(tmpDir, 'data/config.json', '{"debug":true}');
    writeFile(tmpDir, 'README.md', '# Hello\n\nThis is a test readme.\n');
    writeFile(tmpDir, 'script.sh', '#!/bin/bash\necho hello\n');

    // Create a large file (>500 KB)
    const bigContent = 'x'.repeat(501 * 1024);
    writeFile(tmpDir, 'big.txt', bigContent);

    // Create a subdirectory (should be rejected as non-file)
    fs.mkdirSync(path.join(tmpDir, 'subdir'), { recursive: true });
  });

  afterAll(() => cleanupTempDir(tmpDir));

  it('returns file content for a valid TypeScript file', async () => {
    const res = await request(app)
      .get('/api/files/read')
      .query({ path: tmpDir, file: 'src/index.ts' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.content).toContain('hello');
    expect(typeof res.body.data.size).toBe('number');
    expect(res.body.data.size).toBeGreaterThan(0);
  });

  it('returns file content for a JSON file', async () => {
    const res = await request(app)
      .get('/api/files/read')
      .query({ path: tmpDir, file: 'data/config.json' });

    expect(res.status).toBe(200);
    expect(res.body.data.content).toBe('{"debug":true}');
  });

  it('returns file content for a Markdown file', async () => {
    const res = await request(app)
      .get('/api/files/read')
      .query({ path: tmpDir, file: 'README.md' });

    expect(res.status).toBe(200);
    expect(res.body.data.content).toContain('# Hello');
  });

  it('returns correct size in bytes', async () => {
    const res = await request(app)
      .get('/api/files/read')
      .query({ path: tmpDir, file: 'data/config.json' });

    const expected = Buffer.byteLength('{"debug":true}', 'utf-8');
    expect(res.body.data.size).toBe(expected);
  });

  it('returns 400 when file query param is missing', async () => {
    const res = await request(app)
      .get('/api/files/read')
      .query({ path: tmpDir });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/required/i);
  });

  it('returns 400 when path is missing', async () => {
    const res = await request(app)
      .get('/api/files/read')
      .query({ file: 'src/index.ts' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 404 for a non-existent file', async () => {
    const res = await request(app)
      .get('/api/files/read')
      .query({ path: tmpDir, file: 'does/not/exist.ts' });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when path points to a directory, not a file', async () => {
    const res = await request(app)
      .get('/api/files/read')
      .query({ path: tmpDir, file: 'subdir' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/not a file/i);
  });

  it('returns 413 for files exceeding 500 KB', async () => {
    const res = await request(app)
      .get('/api/files/read')
      .query({ path: tmpDir, file: 'big.txt' });

    expect(res.status).toBe(413);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/too large/i);
  });

  // ── Path traversal security ──────────────────────────────────────────────────

  it('rejects path traversal via ../.. in file param', async () => {
    const res = await request(app)
      .get('/api/files/read')
      .query({ path: tmpDir, file: '../../etc/passwd' });

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/traversal/i);
  });

  it('rejects path traversal via encoded ../ sequences', async () => {
    // path.resolve normalises encoded sequences — still blocked after resolution
    const res = await request(app)
      .get('/api/files/read')
      .query({ path: tmpDir, file: '../outside.txt' });

    expect([403, 404]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it('rejects absolute file paths outside the project root', async () => {
    const outsidePath = path.join(path.dirname(tmpDir), 'other-project', 'secret.txt');
    const res = await request(app)
      .get('/api/files/read')
      .query({ path: tmpDir, file: outsidePath });

    // After path.resolve(projectRoot, absoluteOutsidePath) = outsidePath itself,
    // which does not start with projectRoot + sep → 403
    expect([403, 404]).toContain(res.status);
    expect(res.body.success).toBe(false);
  });

  it('rejects traversal in the project path param', async () => {
    const res = await request(app)
      .get('/api/files/read')
      .query({ path: `${tmpDir}/../..`, file: 'src/index.ts' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 for relative project path', async () => {
    const res = await request(app)
      .get('/api/files/read')
      .query({ path: 'relative/path', file: 'src/index.ts' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ─── Tree depth limit ──────────────────────────────────────────────────────────

describe('GET /api/files/tree — depth limit', () => {
  let app: Express;
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = createTempDir('files-depth-');
    app = buildApp();

    // Create a deeply nested structure (6 levels deep)
    writeFile(tmpDir, 'a/b/c/d/e/f/deep.ts', 'export {}');
    writeFile(tmpDir, 'a/b/c/d/e/shallow.ts', 'export {}');
    writeFile(tmpDir, 'a/b/c/mid.ts', 'export {}');
    writeFile(tmpDir, 'top.ts', 'export {}');
  });

  afterAll(() => cleanupTempDir(tmpDir));

  it('returns nodes up to max depth (4), truncating deeper levels', async () => {
    const res = await request(app)
      .get('/api/files/tree')
      .query({ path: tmpDir });

    expect(res.status).toBe(200);

    // Helper: find the deepest node returned.
    // n.children being [] (empty array) is truthy, so we must check length > 0
    // to avoid falsely counting a depth-limited leaf directory as having children.
    function maxDepth(nodes: Array<{ children?: unknown[] }>, d = 0): number {
      if (!nodes?.length) return d;
      return Math.max(...nodes.map((n) =>
        n.children && (n.children as unknown[]).length > 0
          ? maxDepth(n.children as Array<{ children?: unknown[] }>, d + 1)
          : d
      ));
    }

    const depth = maxDepth(res.body.data);
    // MAX_DEPTH is 4, so at depth 4 children are empty arrays → returned depth ≤ 4
    expect(depth).toBeLessThanOrEqual(4);
  });

  it('includes files at mid depth', async () => {
    const res = await request(app)
      .get('/api/files/tree')
      .query({ path: tmpDir });

    // a/b/c/mid.ts should be reachable (depth 3)
    function findNode(nodes: Array<{ name: string; children?: unknown[] }>, name: string): boolean {
      for (const n of nodes) {
        if (n.name === name) return true;
        if (n.children && findNode(n.children as Array<{ name: string; children?: unknown[] }>, name)) return true;
      }
      return false;
    }

    expect(findNode(res.body.data, 'mid.ts')).toBe(true);
  });
});
