#!/usr/bin/env node
/**
 * integration-validate.mjs — Stop hook for Claude Code
 *
 * Phase 2 of dev-suite's API integration validation: one decision per turn.
 *
 * Reads the marker written by mark-api-change.mjs. If no API-surface file was
 * written this turn it costs one stat call and exits. If files were written it
 * asks for validation once — no matter how many agents did the writing. Sixteen
 * parallel subagents collapse into one marker file and one decision, instead of
 * one model call per subagent.
 *
 * Usage (registered in .claude/settings.json):
 *   node .claude/hooks/integration-validate.mjs <level>
 * where <level> is:
 *   block  — exit 2 so Claude continues the turn and runs the validation (default)
 *   warn   — note it to the user via systemMessage; the model never sees it
 *   off    — do nothing
 *
 * Exit codes follow the documented Stop-hook contract: exit 2 prevents Claude
 * from stopping and shows stderr to it; anything else is non-blocking.
 *
 * Fail-open: an unreadable marker or an unexpected payload exits 0. A check
 * that silently does not run is far better than a turn that cannot end.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * The level the project asks for, read fresh on every turn.
 *
 * The argument is only a default. Baking the level into the command string made
 * it unchangeable in practice: the installer short-circuits once the hook
 * exists, so editing `.dev-suite.json` rewrote nothing and `warn` -> `block`
 * (or `off`) never took effect. A malformed or missing file falls back to the
 * argument rather than throwing — a broken config must not wedge the turn.
 */
function levelFor(projectDir, fallback) {
  try {
    const raw = fs.readFileSync(path.join(projectDir, '.dev-suite.json'), 'utf-8');
    const value = JSON.parse(raw).integrationValidation;
    if (value === 'off' || value === 'warn' || value === 'block') return value;
  } catch {
    // No config, unreadable, or not JSON: the argument stands.
  }
  return fallback;
}

const MARKER_REL = path.join('.claude', '.ds-api-touched');
const MAX_LISTED = 20;

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf-8');
}

async function main() {
  const fallbackLevel = process.argv[2] || 'warn';

  // Explicit escape hatch for CI and batch runs.
  if (process.env.DS_SKIP_INTEGRATION_VALIDATION === '1') return 0;

  const raw = await readStdin();
  let payload = {};
  if (raw.trim()) {
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = {};
    }
  }

  // Anti-loop guard: when Claude was already resumed by a Stop hook, do not ask
  // again. Without this, `block` would keep the turn alive indefinitely.
  if (payload?.stop_hook_active === true) return 0;

  const projectDir = process.env.CLAUDE_PROJECT_DIR || payload?.cwd || process.cwd();
  const level = levelFor(projectDir, fallbackLevel);
  if (level === 'off') return 0;

  const marker = path.join(projectDir, MARKER_REL);

  let contents;
  try {
    contents = fs.readFileSync(marker, 'utf-8');
  } catch {
    return 0; // The common case: nothing touched the API surface this turn.
  }

  const files = [...new Set(contents.split('\n').map(l => l.trim()).filter(Boolean))];

  // Clear before deciding, so a failure here cannot make the request repeat on
  // every subsequent turn.
  try {
    fs.writeFileSync(marker, '');
  } catch {
    // Non-fatal: worst case the same files are reported once more.
  }

  if (files.length === 0) return 0;

  const listed = files.slice(0, MAX_LISTED).join('\n');
  const message =
    `dev-suite: ${files.length} API-surface file(s) changed this turn:\n${listed}\n\n` +
    'Run integration validation before considering this done: delegate to the\n' +
    '`integration-validator-expert` agent to check that frontend calls and backend\n' +
    'contracts still agree (paths, methods, request/response types, required fields).\n' +
    'Set integrationValidation to "off" in .dev-suite.json to stop this check.';

  if (level === 'block') {
    process.stderr.write(message + '\n');
    return 2;
  }

  // Measured, not assumed: in a real headless session neither plain stdout nor
  // this JSON channel reaches the model on a Stop hook that exits 0 — the same
  // prompt that produced a full validation under `block` produced none under
  // `warn`. `systemMessage` is the documented way to say something to the
  // *user* without interrupting, so that is what `warn` is: a note for the
  // human. Only `block` makes the model act.
  process.stdout.write(JSON.stringify({ systemMessage: message }) + String.fromCharCode(10));
  return 0;
}

main().then(
  code => process.exit(code),
  () => process.exit(0)
);
