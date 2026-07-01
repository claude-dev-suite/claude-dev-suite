#!/usr/bin/env node
// SPDX-License-Identifier: MIT
/**
 * Validates the dev-suite component catalog for internal consistency:
 *
 * 1. Every MCP workspace has a metadata.json with the documented fields
 *    (name, description, shortDescription, category, tools, envVars,
 *    recommendedFor, detectedWhen) and metadata.name matches the directory.
 * 2. package.json version matches the version passed to `new Server()` in
 *    src/index.ts (these drift silently otherwise).
 * 3. metadata.recommendedFor entries reference existing agent names
 *    (or the `all` wildcard).
 * 4. Agent frontmatter `mcp_servers` entries reference existing workspaces;
 *    `skills` / `core_skills` / `extended_skills` entries reference existing
 *    skill directories (bundle: refs are resolved by agent-bundles.ts and
 *    only checked for prefix syntax here).
 * 5. registry/*.json files parse and their relative `$schema` refs exist.
 *
 * Exits non-zero and prints every violation when the catalog is inconsistent.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const warnings = [];

function err(msg) {
  errors.push(msg);
}
function warn(msg) {
  warnings.push(msg);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

// ---------------------------------------------------------------------------
// Collect agents (name + frontmatter refs)
// ---------------------------------------------------------------------------

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const lines = match[1].split(/\r?\n/);
  const data = {};
  let currentKey = null;
  for (const line of lines) {
    const keyMatch = line.match(/^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/);
    if (keyMatch) {
      currentKey = keyMatch[1];
      const value = keyMatch[2].trim();
      data[currentKey] = value === '' || value === '|' || value === '>' ? [] : value;
      if (typeof data[currentKey] === 'string') currentKey = null;
      continue;
    }
    const itemMatch = line.match(/^\s+-\s+(.+)$/);
    if (itemMatch && currentKey && Array.isArray(data[currentKey])) {
      data[currentKey].push(itemMatch[1].trim());
    }
  }
  return data;
}

const agentFiles = [];
(function walkAgents(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkAgents(full);
    else if (entry.name.endsWith('.md') && entry.name !== 'README.md') agentFiles.push(full);
  }
})(path.join(ROOT, 'agents'));

const agentNames = new Set(['all']);
const agents = [];
for (const file of agentFiles) {
  const rel = path.relative(ROOT, file);
  const fm = parseFrontmatter(fs.readFileSync(file, 'utf-8'));
  if (!fm || !fm.name) {
    err(`${rel}: missing frontmatter or frontmatter "name"`);
    continue;
  }
  agentNames.add(fm.name);
  agents.push({ rel, fm });
}

// ---------------------------------------------------------------------------
// Collect skill directories (any depth) for reference resolution
// ---------------------------------------------------------------------------

const skillDirs = new Set();
(function walkSkills(dir, relPrefix) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'node_modules') continue;
    const rel = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
    skillDirs.add(rel);
    skillDirs.add(entry.name); // allow bare-name references
    walkSkills(path.join(dir, entry.name), rel);
  }
})(path.join(ROOT, 'skills'), '');

// ---------------------------------------------------------------------------
// Validate MCP workspaces
// ---------------------------------------------------------------------------

const mcpRoot = path.join(ROOT, 'mcp-servers');
const workspaces = readJson(path.join(mcpRoot, 'package.json')).workspaces;
const REQUIRED_METADATA_FIELDS = [
  'name',
  'description',
  'shortDescription',
  'category',
  'tools',
  'envVars',
  'recommendedFor',
  'detectedWhen',
];

for (const ws of workspaces) {
  const wsDir = path.join(mcpRoot, ws);
  const label = `mcp-servers/${ws}`;

  if (!fs.existsSync(wsDir)) {
    err(`${label}: workspace listed in mcp-servers/package.json but directory is missing`);
    continue;
  }

  // metadata.json shape
  const metadataPath = path.join(wsDir, 'metadata.json');
  if (!fs.existsSync(metadataPath)) {
    err(`${label}: metadata.json is missing`);
    continue;
  }
  let metadata;
  try {
    metadata = readJson(metadataPath);
  } catch (e) {
    err(`${label}/metadata.json: invalid JSON (${e.message})`);
    continue;
  }
  for (const field of REQUIRED_METADATA_FIELDS) {
    if (!(field in metadata)) err(`${label}/metadata.json: missing field "${field}"`);
  }
  if (metadata.name && metadata.name !== ws) {
    err(`${label}/metadata.json: name "${metadata.name}" does not match directory "${ws}"`);
  }
  if (Array.isArray(metadata.tools) && metadata.tools.length === 0) {
    err(`${label}/metadata.json: tools[] is empty`);
  }
  for (const agentId of metadata.recommendedFor ?? []) {
    if (!agentNames.has(agentId)) {
      err(`${label}/metadata.json: recommendedFor references unknown agent "${agentId}"`);
    }
  }

  // package.json version vs new Server() version
  const pkgPath = path.join(wsDir, 'package.json');
  const indexPath = path.join(wsDir, 'src', 'index.ts');
  if (fs.existsSync(pkgPath) && fs.existsSync(indexPath)) {
    const pkgVersion = readJson(pkgPath).version;
    const indexSrc = fs.readFileSync(indexPath, 'utf-8');
    const serverVersion = indexSrc.match(/version:\s*["']([^"']+)["']/)?.[1];
    if (!serverVersion) {
      warn(`${label}: could not find a version literal in src/index.ts`);
    } else if (serverVersion !== pkgVersion) {
      err(
        `${label}: package.json version ${pkgVersion} != new Server() version ${serverVersion} in src/index.ts`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Validate agent frontmatter references
// ---------------------------------------------------------------------------

const workspaceSet = new Set(workspaces);
for (const { rel, fm } of agents) {
  for (const server of fm.mcp_servers ?? []) {
    if (!workspaceSet.has(server)) {
      err(`${rel}: mcp_servers references unknown server "${server}"`);
    }
  }
  const skillRefs = [
    ...(Array.isArray(fm.skills) ? fm.skills : []),
    ...(Array.isArray(fm.core_skills) ? fm.core_skills : []),
    ...(Array.isArray(fm.extended_skills) ? fm.extended_skills : []),
  ];
  for (const ref of skillRefs) {
    if (ref.startsWith('bundle:')) continue; // resolved via agent-bundles.ts
    if (!skillDirs.has(ref)) {
      err(`${rel}: skills references unknown skill directory "${ref}"`);
    }
  }
}

// ---------------------------------------------------------------------------
// Validate registry JSON files
// ---------------------------------------------------------------------------

const registryDir = path.join(ROOT, 'registry');
for (const entry of fs.readdirSync(registryDir)) {
  if (!entry.endsWith('.json')) continue;
  const filePath = path.join(registryDir, entry);
  let json;
  try {
    json = readJson(filePath);
  } catch (e) {
    err(`registry/${entry}: invalid JSON (${e.message})`);
    continue;
  }
  const schemaRef = json.$schema;
  if (typeof schemaRef === 'string' && schemaRef.startsWith('./')) {
    if (!fs.existsSync(path.join(registryDir, schemaRef))) {
      err(`registry/${entry}: $schema references missing file "${schemaRef}"`);
    }
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

for (const w of warnings) console.warn(`WARN  ${w}`);
if (errors.length > 0) {
  for (const e of errors) console.error(`ERROR ${e}`);
  console.error(`\nCatalog validation failed with ${errors.length} error(s).`);
  process.exit(1);
}
console.log(
  `Catalog OK: ${agents.length} agents, ${workspaces.length} MCP workspaces, ${warnings.length} warning(s).`
);
