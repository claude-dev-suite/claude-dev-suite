#!/usr/bin/env node
/**
 * mark-api-change.mjs — PostToolUse hook for Claude Code
 *
 * Phase 1 of dev-suite's API integration validation: pure, deterministic
 * detection. Records that an API-surface file was written, and nothing else.
 *
 * Why PostToolUse and not SubagentStop: hooks configured in settings.json also
 * run inside subagents, so this fires for every file write in the session —
 * main agent or subagent, whatever the agent is called. The previous design
 * matched on agent *name*, which never fired for a generically typed subagent.
 *
 * Why a marker file and not a model call: this hook can run dozens of times in
 * a parallel fan-out. Every run is a path comparison, no model call. The
 * decision — whether validation is actually needed — happens once per turn in
 * integration-validate.mjs, which reads this marker. The marker IS the debounce.
 *
 * Why Node and not bash: bash hooks here need `jq`, which is absent on a stock
 * Windows install, and a hook that silently no-ops on the primary platform is
 * the exact failure this rewrite exists to fix. Node is already required to run
 * dev-suite's MCP servers.
 *
 * Concurrency: each invocation appends one short line with a single O_APPEND
 * write, so parallel subagents cannot interleave partial lines. Duplicates are
 * tolerated and collapsed by the reader, which removes the need for a lock.
 *
 * Fail-open: any unexpected payload or filesystem error exits 0 silently. This
 * hook must never block or slow a tool call.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Path fragments that mean "this file can change an API contract".
 *
 * `route` and `router` are the loose ones, and deliberately kept: they are how
 * most backends name their surface. The cost is that SvelteKit puts every page
 * under `src/routes/` and Remix under `app/routes/`, so on those stacks the bare
 * word matches pure UI — see UI_ROUTE_PATTERN, which takes those back out.
 */
const DEFAULT_API_PATTERN = [
  '(^|/)(api|apis)/',
  'controller',
  'route',
  'router',
  'handler',
  'endpoint',
  'dto',
  'openapi',
  'swagger',
  'graphql',
  'resolver',
  'api-client',
  'apiclient',
  'http-client',
  'httpclient',
  // Django/DRF and FastAPI idioms, which none of the above catch.
  'serializers?\\.py$',
  'views\\.py$',
  'urls\\.py$',
  'schemas?\\.py$',
  '\\.proto$',
].join('|');

/**
 * Files a meta-framework puts under a "routes" directory that are pages, not
 * endpoints.
 *
 * Without this the check fires on every button someone moves in a SvelteKit or
 * Remix app — the fastest way to turn a validation prompt into something people
 * learn to dismiss.
 */
const UI_ROUTE_PATTERN = new RegExp(
  [
    '\\+page\\.svelte$',
    '\\+layout\\.[a-z]+$',
    '\\+page\\.(js|ts)$',
    '/page\\.(jsx?|tsx?)$',
    '/layout\\.(jsx?|tsx?)$',
    '\\.(svelte|vue)$',
    'app/routes/.*\\.(jsx|tsx)$',
  ].join('|'),
  'i'
);

/**
 * ...except when the same file is explicitly the server half. SvelteKit's
 * `+page.server.ts` and `+server.ts`, and Remix's `*.server.tsx`, are exactly
 * the endpoint this check exists for.
 */
const SERVER_HALF_PATTERN = /\+server\.|\.server\./i;

/** Changes that cannot alter a contract, even inside a matching directory. */
const SKIP_PATTERN = /\.(md|mdx|txt|css|scss|sass|less|svg|png|jpe?g|gif|ico|woff2?|ttf|lock)$/i;

const MARKER_REL = path.join('.claude', '.ds-api-touched');

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf-8');
}

async function main() {
  const raw = await readStdin();
  if (!raw.trim()) return;

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return;
  }

  const filePath = payload?.tool_input?.file_path ?? payload?.tool_input?.notebook_path;
  if (typeof filePath !== 'string' || filePath.length === 0) return;

  // CLAUDE_PROJECT_DIR is provided by Claude Code; cwd from the payload is the
  // documented fallback.
  const projectDir = process.env.CLAUDE_PROJECT_DIR || payload?.cwd || process.cwd();

  const normalized = filePath.split(path.sep).join('/');
  if (SKIP_PATTERN.test(normalized)) return;

  let apiPattern;
  try {
    apiPattern = new RegExp(process.env.DS_API_SURFACE_PATTERN || DEFAULT_API_PATTERN, 'i');
  } catch {
    // A malformed override must not take the hook down with it.
    apiPattern = new RegExp(DEFAULT_API_PATTERN, 'i');
  }
  if (!apiPattern.test(normalized)) return;

  // A page under a routes directory is UI, not contract — unless it is the
  // server half of that route.
  if (UI_ROUTE_PATTERN.test(normalized) && !SERVER_HALF_PATTERN.test(normalized)) return;

  const marker = path.join(projectDir, MARKER_REL);
  try {
    fs.mkdirSync(path.dirname(marker), { recursive: true });
    const rel = path.relative(projectDir, filePath) || normalized;
    // One append, one line: atomic enough that concurrent subagents cannot
    // interleave, and short enough to stay well inside the pipe buffer.
    fs.appendFileSync(marker, rel.split(path.sep).join('/') + '\n');
  } catch {
    // A marker we could not write means one validation prompt we do not raise.
    // That is strictly better than failing the tool call that triggered us.
  }
}

main().then(
  () => process.exit(0),
  () => process.exit(0)
);
