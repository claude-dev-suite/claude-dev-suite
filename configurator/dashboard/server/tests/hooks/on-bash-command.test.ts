/**
 * The Bash-command hook primitive, and the templates that run it.
 *
 * The built-in templates read the command with `jq` and a POSIX `case`, in the
 * same change set that moved the new hooks to Node precisely to escape that
 * dependency. On a stock Windows install — the stated primary platform — `jq` is
 * absent, so `ds_cmd` was empty and every template exited 0 without doing
 * anything. `block-env` was the sharp one: a PreToolUse guard whose only job is
 * to exit 2 could never block, while the dashboard listed it as active
 * protection for `.env` files.
 *
 * These run the real scripts against real payloads. A test that inspects the
 * command string cannot tell a working guard from an inert one.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';
import { createTempDir, cleanupTempDir } from '../test-utils.js';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..'
);
const BASH_HOOK = path.join(repoRoot, 'templates', 'hooks', 'on-bash-command.mjs');
const FILE_HOOK = path.join(repoRoot, 'templates', 'hooks', 'on-file-change.mjs');
const STALE_DOCS = path.join(repoRoot, 'templates', 'hooks', 'warn-stale-docs.mjs');

/** Vitest injects its own loader through NODE_OPTIONS; a hook subprocess gets none. */
function childEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env = { ...process.env, ...extra };
  delete env.NODE_OPTIONS;
  return env;
}

describe('on-bash-command.mjs', () => {
  let tempDir: string;

  beforeEach(() => { tempDir = createTempDir('on-bash-'); });
  afterEach(() => cleanupTempDir(tempDir));

  function run(args: string[], command: string | null) {
    return spawnSync(process.execPath, [BASH_HOOK, ...args], {
      input: JSON.stringify({
        hook_event_name: 'PreToolUse',
        tool_name: 'Bash',
        tool_input: command === null ? {} : { command },
        cwd: tempDir,
      }),
      env: childEnv({ CLAUDE_PROJECT_DIR: tempDir }),
      encoding: 'utf-8',
    });
  }

  it('blocks a matching command with exit 2', () => {
    const result = run(['--match', 'rm\\s+-rf\\s+/', '--block', 'Refusing a recursive delete of /'], 'rm -rf / --no-preserve-root');

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Refusing a recursive delete');
  });

  it('lets a non-matching command through', () => {
    const result = run(['--match', 'rm\\s+-rf\\s+/', '--block', 'nope'], 'npm test');

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });

  it('appends the command to a log', () => {
    const result = run(['--log', '.claude/bash-history.log'], 'git status');

    expect(result.status).toBe(0);
    const logged = fs.readFileSync(path.join(tempDir, '.claude', 'bash-history.log'), 'utf-8');
    expect(logged).toContain('git status');
    expect(logged).toMatch(/^\[\d{4}-\d{2}-\d{2}T/);
  });

  it('runs a command, substituting {command}', () => {
    const result = run(
      ['--match', 'git', '--', process.execPath, '-e', 'console.log("SAW:" + process.argv[1])', '{command}'],
      'git commit -m "x"'
    );

    expect(result.stdout).toContain('SAW:git commit -m "x"');
  });

  it('exits 0 on a payload with no command', () => {
    expect(run(['--block', 'nope'], null).status).toBe(0);
  });

  it('exits 0 on a malformed regex rather than blocking the call', () => {
    expect(run(['--match', '([unclosed', '--block', 'nope'], 'anything').status).toBe(0);
  });
});

describe('the built-in templates that these scripts back', () => {
  let tempDir: string;

  beforeEach(() => { tempDir = createTempDir('tpl-hook-'); });
  afterEach(() => cleanupTempDir(tempDir));

  // The exact command string CLAUDE_HOOK_TEMPLATES writes for `block-env`,
  // executed as a real hook. This is the one that used to exit 0 on Windows.
  it('block-env actually blocks a .env write', () => {
    const result = spawnSync(
      process.execPath,
      [FILE_HOOK, '--match', '(\\.env$|\\.env\\.)', '--block', 'Cannot modify .env files'],
      {
        input: JSON.stringify({
          tool_name: 'Write',
          tool_input: { file_path: path.join(tempDir, '.env.production') },
          cwd: tempDir,
        }),
        env: childEnv({ CLAUDE_PROJECT_DIR: tempDir }),
        encoding: 'utf-8',
      }
    );

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Cannot modify .env files');
  });

  it('block-env leaves an ordinary source file alone', () => {
    const result = spawnSync(
      process.execPath,
      [FILE_HOOK, '--match', '(\\.env$|\\.env\\.)', '--block', 'Cannot modify .env files'],
      {
        input: JSON.stringify({
          tool_name: 'Write',
          tool_input: { file_path: path.join(tempDir, 'src', 'environment.ts') },
          cwd: tempDir,
        }),
        env: childEnv({ CLAUDE_PROJECT_DIR: tempDir }),
        encoding: 'utf-8',
      }
    );

    expect(result.status).toBe(0);
  });

  it('warn-stale-docs says nothing outside a git repository', () => {
    const result = spawnSync(process.execPath, [STALE_DOCS], {
      env: childEnv({ CLAUDE_PROJECT_DIR: tempDir }),
      encoding: 'utf-8',
    });

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('');
  });
});
