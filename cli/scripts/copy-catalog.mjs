// SPDX-License-Identifier: MIT
/**
 * Copy the dev-suite catalog into `cli/catalog/`, which the command uses as
 * its DEV_SUITE_DIR when installed from npm.
 *
 * Mirrors what the desktop app ships as `extraResources`: the content the
 * services read (agents, skills, rules, commands, templates, registry) and,
 * for each MCP server, only what an install copies into a project — its
 * prebuilt `dist/`, `metadata.json`, `package.json`, plus skill-loader's
 * bundled `skills/`. Fails when a server has no `dist/`: the installer would
 * otherwise drop it silently on the user's machine.
 *
 * Needs `npm run build` in mcp-servers/ first.
 */

import { cpSync, existsSync, readFileSync, rmSync, mkdirSync, readdirSync, statSync } from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(pkgDir, '..');
const out = path.join(pkgDir, 'catalog');

const CONTENT_DIRS = ['agents', 'skills', 'rules', 'commands', 'templates', 'registry'];
const SERVER_ENTRIES = ['dist', 'metadata.json', 'package.json', 'skills'];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const dir of CONTENT_DIRS) {
  const src = path.join(repoRoot, dir);
  if (!existsSync(src)) {
    console.error(`[cli] missing catalog directory: ${dir}/`);
    process.exit(1);
  }
  cpSync(src, path.join(out, dir), { recursive: true });
}

// Servers come from the workspaces list, as everywhere else in dev-suite; a
// workspace without metadata.json (the shared library) is not a server.
const mcpRoot = path.join(repoRoot, 'mcp-servers');
const { workspaces } = JSON.parse(readFileSync(path.join(mcpRoot, 'package.json'), 'utf-8'));
const missing = [];
let servers = 0;
for (const ws of workspaces) {
  const src = path.join(mcpRoot, ws);
  if (!existsSync(path.join(src, 'metadata.json'))) continue;
  if (!existsSync(path.join(src, 'dist', 'index.js'))) {
    missing.push(ws);
    continue;
  }
  for (const entry of SERVER_ENTRIES) {
    const from = path.join(src, entry);
    if (existsSync(from)) cpSync(from, path.join(out, 'mcp-servers', ws, entry), { recursive: true });
  }
  servers++;
}
if (missing.length > 0) {
  console.error(`[cli] MCP servers without a build (run npm run build in mcp-servers/): ${missing.join(', ')}`);
  process.exit(1);
}
cpSync(path.join(mcpRoot, 'package.json'), path.join(out, 'mcp-servers', 'package.json'));

const size = dir =>
  readdirSync(dir).reduce((sum, name) => {
    const p = path.join(dir, name);
    const s = statSync(p);
    return sum + (s.isDirectory() ? size(p) : s.size);
  }, 0);
console.log(`[cli] catalog: ${servers} MCP servers, ${(size(out) / 1048576).toFixed(1)} MB`);
