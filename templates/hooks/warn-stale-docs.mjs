#!/usr/bin/env node
/**
 * warn-stale-docs.mjs — the doc-freshness check, as a script.
 *
 * Warns when a commit stages `agents/`, `skills/` or `mcp-servers/` without the
 * documentation that describes them. It used to be an inline shell pipeline
 * built around `jq` and `grep`, which meant it did nothing on Windows — and it
 * read the command from an environment variable Claude Code does not define, so
 * it did nothing anywhere.
 *
 * Reports only. A commit is the user's decision; this exists so the decision is
 * an informed one.
 */

import { spawnSync } from 'node:child_process';

/** Directories whose contents the README and CHANGELOG are expected to describe. */
const WATCHED = [/^agents\//, /^skills\//, /^mcp-servers\//];

/** Files that count as "the documentation was updated too". */
const DOCS = [/^README\.md$/, /^CHANGELOG\.md$/, /^docs\//];

function stagedFiles(cwd) {
  const result = spawnSync('git', ['diff', '--cached', '--name-only'], {
    cwd,
    encoding: 'utf-8',
    shell: false,
    windowsHide: true,
  });
  if (result.status !== 0) return [];
  return (result.stdout || '').split('\n').map(l => l.trim()).filter(Boolean);
}

function main() {
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();

  let staged;
  try {
    staged = stagedFiles(projectDir);
  } catch {
    return 0; // No git, not a repo, nothing to say.
  }
  if (staged.length === 0) return 0;

  const touched = staged.filter(f => WATCHED.some(re => re.test(f)));
  if (touched.length === 0) return 0;

  if (staged.some(f => DOCS.some(re => re.test(f)))) return 0;

  const listed = touched.slice(0, 10);
  const more = touched.length - listed.length;
  process.stdout.write(
    `dev-suite: ${touched.length} file(s) staged under agents/, skills/ or mcp-servers/ ` +
      'with no documentation change alongside them:\n' +
      listed.map(f => `  ${f}`).join('\n') +
      (more > 0 ? `\n  …and ${more} more` : '') +
      '\nCheck whether README.md tables or CHANGELOG.md need updating before committing.\n'
  );
  return 0;
}

process.exit(main());
