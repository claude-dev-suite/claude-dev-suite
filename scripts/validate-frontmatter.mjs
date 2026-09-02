#!/usr/bin/env node
// SPDX-License-Identifier: MIT
/**
 * Validates YAML frontmatter across agents/, commands/ and skills/ using the
 * same parser the product uses (gray-matter, which wraps js-yaml).
 *
 * This exists because frontmatter that Claude Code tolerates can still be
 * invalid YAML, and stricter downstream consumers then drop the component
 * silently. The canonical example (issue #112) is:
 *
 *   argument-hint: [--quick] [--verbose]   # flow sequence + trailing content
 *                                          # => YAML parse error, whole block lost
 *   argument-hint: [project-path]          # => array, not the documented string
 *   argument-hint: "[--quick] [--verbose]" # => correct
 *
 * scripts/validate-catalog.mjs cannot catch this: it parses frontmatter with a
 * line-oriented regex that happily "reads" YAML a real parser rejects, and it
 * only walks agents/. Every check here therefore goes through a real parser.
 *
 * Rules:
 *   1. A file whose content starts with `---` must have frontmatter that parses.
 *   2. Frontmatter must be a mapping with `name` and `description`.
 *   3. Known keys must hold the documented type (see KEY_TYPES).
 *   4. Unknown keys warn rather than fail, so new fields aren't blocked here.
 *
 * Files without frontmatter (READMEs, skill quick-ref pages) are skipped.
 *
 * Exits non-zero and prints every violation when frontmatter is invalid.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_DIRS = ['agents', 'commands', 'skills'];

// Documented type for each known frontmatter key. 'string[]' means a sequence
// whose every entry is a string.
const KEY_TYPES = {
  name: 'string',
  description: 'string',
  model: 'string',
  'allowed-tools': 'string',
  'argument-hint': 'string',
  skills: 'string[]',
  core_skills: 'string[]',
  extended_skills: 'string[]',
  mcp_servers: 'string[]',
  'disable-model-invocation': 'boolean',
  'user-invocable': 'boolean',
};

const REQUIRED_KEYS = ['name', 'description'];

const errors = [];
const warnings = [];

function err(msg) {
  errors.push(msg);
}
function warn(msg) {
  warnings.push(msg);
}

// gray-matter is a dependency of the dashboard server, not of this repo root.
// Resolving it from there keeps validation on the exact parser that consumes
// these files at runtime.
const serverPkg = path.join(ROOT, 'configurator/dashboard/server/package.json');
let matter;
try {
  matter = createRequire(serverPkg)('gray-matter');
} catch {
  console.error(
    'ERROR gray-matter could not be resolved from configurator/dashboard/server.\n' +
      '      Run `npm ci` in configurator/dashboard/server before this script.'
  );
  process.exit(1);
}

function typeOf(value) {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  return typeof value;
}

function describe(value) {
  const json = JSON.stringify(value);
  return json === undefined ? String(value) : json;
}

function checkType(rel, key, value) {
  const expected = KEY_TYPES[key];
  if (!expected) {
    warn(`${rel}: unknown frontmatter key "${key}"`);
    return;
  }

  if (expected === 'string[]') {
    // A key present with nothing under it is YAML null, and for the skill lists
    // that is a meaningful statement: "deliberately none". An agent that
    // preloads no skill still reaches its extended tier through the Skill tool.
    if (value === null && (key === 'core_skills' || key === 'extended_skills' || key === 'skills')) {
      return;
    }
    if (!Array.isArray(value)) {
      err(`${rel}: "${key}" must be a list, got ${typeOf(value)} ${describe(value)}`);
      return;
    }
    for (const item of value) {
      if (typeof item !== 'string') {
        err(`${rel}: "${key}" must contain only strings, got ${typeOf(item)} ${describe(item)}`);
      }
    }
    return;
  }

  if (typeOf(value) !== expected) {
    const hint =
      expected === 'string' && Array.isArray(value)
        ? ' — wrap the value in double quotes so YAML reads it as a string'
        : '';
    err(`${rel}: "${key}" must be a ${expected}, got ${typeOf(value)} ${describe(value)}${hint}`);
  }
}

const mdFiles = [];
for (const dir of SCAN_DIRS) {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) continue;
  (function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const child = path.join(current, entry.name);
      if (entry.isDirectory()) walk(child);
      else if (entry.name.endsWith('.md')) mdFiles.push(child);
    }
  })(full);
}

let checked = 0;
for (const file of mdFiles) {
  const rel = path.relative(ROOT, file).replace(/\\/g, '/');
  const raw = fs.readFileSync(file, 'utf-8');
  if (!/^---\r?\n/.test(raw)) continue; // no frontmatter block — nothing to validate

  let data;
  try {
    data = matter(raw).data;
  } catch (e) {
    err(`${rel}: frontmatter is not valid YAML (${e.message.split('\n')[0]})`);
    continue;
  }

  if (typeOf(data) !== 'object' || Object.keys(data).length === 0) {
    err(`${rel}: frontmatter must be a non-empty mapping`);
    continue;
  }

  checked++;
  for (const key of REQUIRED_KEYS) {
    if (!(key in data)) err(`${rel}: frontmatter is missing required "${key}"`);
  }
  for (const [key, value] of Object.entries(data)) {
    checkType(rel, key, value);
  }
}

for (const w of warnings) console.warn(`WARN  ${w}`);
if (errors.length > 0) {
  for (const e of errors) console.error(`ERROR ${e}`);
  console.error(`\nFrontmatter validation failed with ${errors.length} error(s).`);
  process.exit(1);
}
console.log(
  `Frontmatter OK: ${checked} file(s) with frontmatter across ${SCAN_DIRS.join(', ')}, ${warnings.length} warning(s).`
);
