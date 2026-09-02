#!/usr/bin/env node
// SPDX-License-Identifier: MIT
/**
 * Guard the `secret` flag on MCP server environment variables.
 *
 * `installation/gitignore.ts` used to ignore every MCP config file whenever the
 * wizard collected *any* env value — `KB_REPO_BRANCH` was enough to drop
 * `.codex/config.toml` and `.gemini/settings.json` (whole-assistant config
 * files, not just MCP config) out of version control. Narrowing that to the
 * files that actually carry a secret is only safe if "which vars are secret" is
 * declared and kept honest, because the failure mode of a *missing* flag is a
 * credential committed to git.
 *
 * This gate is that honesty check. It fails when an env var looks sensitive but
 * is not marked, using two independent signals:
 *
 *  1. `required: true` — the only vars the wizard forces a human to type are
 *     connection strings and keys; nothing else is worth blocking an install on.
 *  2. A name matching KEY | TOKEN | SECRET | PASSWORD | CREDENTIAL.
 *
 * It also refuses a var that is marked `secret: true` while shipping a
 * non-empty `default`, since that default is a literal committed in this repo.
 *
 * A genuinely non-sensitive var that trips rule 1 or 2 must be renamed or made
 * optional — there is deliberately no opt-out flag, because an opt-out is the
 * first thing a rushed change reaches for.
 *
 * Exits non-zero and prints every violation.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MCP_ROOT = path.join(ROOT, 'mcp-servers');

/** Substrings that make a variable name sensitive on its face. */
const SENSITIVE_NAME = /KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i;

const errors = [];
const err = (message) => errors.push(message);

/** Workspaces declared in mcp-servers/package.json, or every directory as fallback. */
function listServerDirs() {
  const pkgPath = path.join(MCP_ROOT, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (Array.isArray(pkg.workspaces)) return pkg.workspaces;
    } catch (e) {
      err(`mcp-servers/package.json is not valid JSON: ${e.message}`);
      return [];
    }
  }
  return fs
    .readdirSync(MCP_ROOT, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

let checked = 0;

for (const ws of listServerDirs()) {
  const metadataPath = path.join(MCP_ROOT, ws, 'metadata.json');
  // Library workspaces (mcp-servers/shared) carry no catalog metadata;
  // validate-catalog.mjs owns the "a server must have metadata.json" rule.
  if (!fs.existsSync(metadataPath)) continue;

  let metadata;
  try {
    metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
  } catch (e) {
    err(`mcp-servers/${ws}/metadata.json: not valid JSON — ${e.message}`);
    continue;
  }

  const envVars = metadata.envVars;
  if (envVars === undefined) continue;
  if (!Array.isArray(envVars)) {
    err(`mcp-servers/${ws}/metadata.json: "envVars" must be an array`);
    continue;
  }

  for (const envVar of envVars) {
    if (!envVar || typeof envVar !== 'object' || typeof envVar.name !== 'string') {
      err(`mcp-servers/${ws}/metadata.json: an envVars entry has no string "name"`);
      continue;
    }
    checked += 1;

    const label = `mcp-servers/${ws} → ${envVar.name}`;
    const isSecret = envVar.secret === true;

    if (envVar.secret !== undefined && typeof envVar.secret !== 'boolean') {
      err(`${label}: "secret" must be a boolean when present`);
      continue;
    }

    if (!isSecret && envVar.required === true) {
      err(
        `${label}: is required but not marked "secret": true. The wizard only forces a value for credentials; ` +
          `mark it secret, or make it optional if it truly is not sensitive.`
      );
    }

    if (!isSecret && SENSITIVE_NAME.test(envVar.name)) {
      err(
        `${label}: the name matches KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL but it is not marked "secret": true. ` +
          `An unmarked secret is written into MCP config files that are no longer gitignored.`
      );
    }

    if (isSecret && typeof envVar.default === 'string' && envVar.default.length > 0) {
      err(
        `${label}: marked "secret": true but ships a non-empty "default" (${JSON.stringify(envVar.default)}). ` +
          `A default for a secret is a literal committed to this repository.`
      );
    }
  }
}

if (errors.length > 0) {
  console.error(`\n✖ Environment secret validation failed (${errors.length} problem(s)):\n`);
  for (const message of errors) console.error(`  - ${message}`);
  console.error('');
  process.exit(1);
}

console.log(`✔ Environment secret flags are consistent (${checked} variable(s) checked).`);
