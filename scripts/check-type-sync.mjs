#!/usr/bin/env node
// SPDX-License-Identifier: MIT
/**
 * Verifies that the shared API-contract type files kept as parallel copies in
 * the dashboard frontend (src/types/) and backend (server/src/types/) are
 * identical, line for line, after one normalization: relative import
 * specifiers. The server is ESM with NodeNext resolution and must write
 * `from './core.js'`, while the Vite frontend writes `from './core'`. Before
 * comparing, the '.js' suffix is stripped from relative `from '...'`
 * specifiers on both sides; everything else (JSDoc, whitespace, ordering)
 * must match exactly.
 *
 * There is intentionally no shared npm package between the two processes, so
 * these files are duplicated and must never drift. Every synced file carries a
 * "KEPT IN SYNC with ..." header comment pointing at its twin.
 *
 * Files NOT in the list below are side-specific (UI-only or server-only types,
 * and the two barrel index.ts files, which re-export different file sets).
 *
 * Exits non-zero with a per-file diff summary when any pair diverges.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DASHBOARD = path.join(ROOT, 'configurator', 'dashboard');
const FRONTEND_TYPES = path.join(DASHBOARD, 'src', 'types');
const SERVER_TYPES = path.join(DASHBOARD, 'server', 'src', 'types');

/**
 * Contract type files that must be identical between
 * configurator/dashboard/src/types/ and configurator/dashboard/server/src/types/.
 *
 * Deliberately NOT synced (same filename, intentionally different content):
 * - custom-agents.ts: the frontend models the API resource (CustomAgent with
 *   id/UI state, 'ai-chat' creation mode, GeneratedSkill), the server models
 *   the YAML frontmatter (CustomAgentFrontmatter) and request validation.
 * - templates.ts: the frontend adds UI state (WizardMode, TemplateCardInfo),
 *   the server adds server-side runtime type guards.
 * - upgrade.ts: the frontend is a UI-focused subset; the server holds the full
 *   feature-registry/apply-config types and imports ReinstallHistoryEntry.
 */
const SYNCED_FILES = [
  'agents.ts',
  'api.ts',
  'core.ts',
  'git.ts',
  'mcp.ts',
  'orchestrator.ts',
  'drift.ts',
  'reinstall.ts',
  'release.ts',
];

const errors = [];

/**
 * Normalizes ESM relative import specifiers so the server's NodeNext-style
 * `from './x.js'` compares equal to the frontend's bundler-style `from './x'`.
 * This is the only allowed difference between the two copies.
 */
function normalizeImportSpecifiers(text) {
  return text.replace(/(from\s+(['"])\.\.?\/[^'"]*?)\.js(\2)/g, '$1$3');
}

/** Line-level summary of the first differences between two file contents. */
function diffSummary(aText, bText, maxShown = 5) {
  const a = aText.split(/\r?\n/);
  const b = bText.split(/\r?\n/);
  const max = Math.max(a.length, b.length);
  const diffs = [];
  for (let i = 0; i < max; i++) {
    if (a[i] !== b[i]) diffs.push(i);
  }
  const lines = diffs.slice(0, maxShown).map((i) => {
    const left = a[i] === undefined ? '<missing>' : JSON.stringify(a[i]);
    const right = b[i] === undefined ? '<missing>' : JSON.stringify(b[i]);
    return `    line ${i + 1}: frontend ${left} != server ${right}`;
  });
  if (diffs.length > maxShown) {
    lines.push(`    ... and ${diffs.length - maxShown} more differing line(s)`);
  }
  return { count: diffs.length, text: lines.join('\n') };
}

for (const file of SYNCED_FILES) {
  const frontendPath = path.join(FRONTEND_TYPES, file);
  const serverPath = path.join(SERVER_TYPES, file);
  const relFrontend = path.relative(ROOT, frontendPath).replaceAll(path.sep, '/');
  const relServer = path.relative(ROOT, serverPath).replaceAll(path.sep, '/');

  if (!fs.existsSync(frontendPath)) {
    errors.push(`${relFrontend}: missing (listed in SYNCED_FILES)`);
    continue;
  }
  if (!fs.existsSync(serverPath)) {
    errors.push(`${relServer}: missing (listed in SYNCED_FILES)`);
    continue;
  }

  const frontendText = normalizeImportSpecifiers(fs.readFileSync(frontendPath, 'utf-8'));
  const serverText = normalizeImportSpecifiers(fs.readFileSync(serverPath, 'utf-8'));
  if (frontendText === serverText) continue;

  const { count, text } = diffSummary(frontendText, serverText);
  errors.push(
    `${file}: frontend and server copies diverge (${count} differing line(s))\n` +
      `    ${relFrontend}\n    ${relServer}\n${text}`
  );
}

if (errors.length > 0) {
  for (const e of errors) console.error(`ERROR ${e}`);
  console.error(
    `\nType sync check failed for ${errors.length} file pair(s). ` +
      'Edit both copies identically (they are deliberate duplicates — see the "KEPT IN SYNC" header).'
  );
  process.exit(1);
}
console.log(`Type sync OK: ${SYNCED_FILES.length} file pair(s) identical.`);
