#!/usr/bin/env node
// SPDX-License-Identifier: MIT
/**
 * Pre-build step for the skill-loader MCP server.
 *
 * Copies `dev-suite/skills/` (the canonical source) into
 * `mcp-servers/skill-loader/skills/` so the server can self-resolve at
 * runtime — both inside the Electron installer and inside per-project
 * `.mcp-servers/skill-loader/` copies, where there is no `DEV_SUITE_ROOT`
 * env var to rely on.
 *
 * The destination is .gitignored to keep the catalog as a single source
 * of truth in `dev-suite/skills/` and avoid noisy diffs.
 *
 * Idempotent: removes the destination tree before copying so deletes in
 * the source are reflected. Skips `node_modules` defensively even though
 * skills/ shouldn't contain any.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const skillLoaderRoot = path.resolve(__dirname, '..');
const sourceSkills = path.resolve(skillLoaderRoot, '..', '..', 'skills');
const destSkills = path.resolve(skillLoaderRoot, 'skills');

if (!fs.existsSync(sourceSkills)) {
  console.error(
    `[skill-loader/prebuild] FATAL: source skills directory not found: ${sourceSkills}`,
  );
  process.exit(1);
}

if (fs.existsSync(destSkills)) {
  fs.rmSync(destSkills, { recursive: true, force: true });
}

let fileCount = 0;
function copy(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copy(srcPath, dstPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, dstPath);
      fileCount++;
    }
  }
}

copy(sourceSkills, destSkills);

console.log(
  `[skill-loader/prebuild] Bundled ${fileCount} skill files from ${path.relative(skillLoaderRoot, sourceSkills)} → ${path.relative(skillLoaderRoot, destSkills)}`,
);
