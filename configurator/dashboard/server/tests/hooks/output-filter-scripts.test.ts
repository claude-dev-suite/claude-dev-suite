/**
 * Output-filter hooks: the command they EMIT must still run the user's command.
 *
 * These scripts do not run a command themselves — they rewrite the Bash tool's
 * input and hand a new command string back to Claude Code, which runs it in a
 * *different* shell. That handoff is where the interesting bug lives: the
 * command was assembled inside a quoted heredoc (`<<'FILTER'`), so
 * `"$ORIGINAL_CMD"` stayed a literal, and in the shell that finally ran it the
 * variable did not exist. `eval ""` ran nothing and the filter printed its
 * "(no errors found)" summary and exited 0 — a green result for a suite that
 * never executed.
 *
 * It was unreachable while the scripts read the wrong payload field (the command
 * was always empty, so they returned early); correcting the payload activated
 * it. Nothing caught it: the existing assertions only check that the emitted
 * string contains substrings like 'eslint'.
 *
 * So these tests execute the emitted command in a FRESH shell, which is the only
 * arrangement that can tell the two behaviours apart — evaluating it in the same
 * shell finds `ORIGINAL_CMD` still set and passes either way.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..'
);
const hooksDir = path.join(repoRoot, 'templates', 'hooks');

const SCRIPTS = ['filter-test-output.sh', 'filter-lint.sh', 'truncate-logs.sh'];

/** These are bash scripts; without bash there is nothing to assert. */
function bashAvailable(): boolean {
  const probe = spawnSync('bash', ['-c', 'echo ok'], { encoding: 'utf-8' });
  return probe.status === 0 && probe.stdout.trim() === 'ok';
}

const describeIfBash = bashAvailable() ? describe : describe.skip;

/**
 * Run just the command-assembly part of a script and return what it produced.
 *
 * The scripts need `jq` end to end, which a stock Windows install does not have,
 * so the payload parsing is skipped and `ORIGINAL_CMD` is injected directly.
 * The assembly is taken verbatim from the real file — that is the code under
 * test, and it is where the bug was.
 */
function emitCommand(scriptFile: string, originalCmd: string): string {
  const src = fs.readFileSync(path.join(hooksDir, scriptFile), 'utf-8');
  const start = src.indexOf('FILTER_CMD=');
  // lastIndexOf: the same pipeline appears earlier, where the payload is parsed.
  const end = src.lastIndexOf(`printf '%s' "$INPUT" | jq`);
  expect(start, `${scriptFile}: no FILTER_CMD assembly found`).toBeGreaterThan(-1);
  expect(end, `${scriptFile}: no jq emit found`).toBeGreaterThan(start);

  const assembly = src.slice(start, end);
  const snippet = [
    'set -euo pipefail',
    `LINE_LIMIT="\${DS_LOG_LINE_LIMIT:-100}"`,
    `ORIGINAL_CMD=${JSON.stringify(originalCmd)}`,
    assembly,
    `printf '%s' "$FILTER_CMD"`,
  ].join('\n');

  const built = spawnSync('bash', ['-c', snippet], { encoding: 'utf-8' });
  expect(built.status, `${scriptFile}: assembly failed: ${built.stderr}`).toBe(0);
  return built.stdout;
}

/** Run an emitted command the way Claude Code does: a new shell, no inherited vars. */
function runInFreshShell(command: string): { stdout: string; status: number | null } {
  const result = spawnSync('bash', ['-c', command], { encoding: 'utf-8' });
  return { stdout: result.stdout + result.stderr, status: result.status };
}

describeIfBash('output-filter hooks: the emitted command', () => {
  it.each(SCRIPTS)('%s is syntactically valid', script => {
    const check = spawnSync('bash', ['-n', path.join(hooksDir, script)], { encoding: 'utf-8' });
    expect(check.stderr).toBe('');
    expect(check.status).toBe(0);
  });

  it.each(SCRIPTS)('%s still runs the original command in a fresh shell', script => {
    // A marker the filters keep: 'ERROR' passes the lint filter, 'FAIL' the test
    // filter, and truncate-logs passes everything through a tail.
    const marker = 'DEVSUITE_MARKER_ERROR_FAIL';
    const emitted = emitCommand(script, `echo ${marker}`);

    const run = runInFreshShell(emitted);

    expect(run.stdout).toContain(marker);
  });

  it.each(SCRIPTS)('%s does not leave the command as an unexpanded variable', script => {
    const emitted = emitCommand(script, 'echo hello');

    // The exact shape of the regression: the argument survived into the emitted
    // string as a literal, to be expanded by a shell that has never heard of it.
    expect(emitted).not.toContain('"$ORIGINAL_CMD"');
    expect(emitted).toContain('echo');
  });

  it('preserves the exit code of the wrapped command', () => {
    // A filter that always exits 0 would report a failing suite as passing,
    // which is the same false-green in a different disguise.
    const emitted = emitCommand('filter-test-output.sh', 'echo FAIL_MARKER; exit 3');

    const run = runInFreshShell(emitted);

    expect(run.stdout).toContain('FAIL_MARKER');
    expect(run.status).toBe(3);
  });

  it('does not execute anything when the command is left unexpanded (regression guard)', () => {
    // Pins the failure mode itself, so a future refactor back into the quoted
    // heredoc fails here rather than silently in a user's project.
    const brokenEmitted = 'bash -c \'__o=$( eval "$1" 2>&1 ); echo "${__o:-(no errors found)}"\' _ "$ORIGINAL_CMD"';

    const run = runInFreshShell(brokenEmitted);

    expect(run.stdout).toContain('(no errors found)');
  });
});
