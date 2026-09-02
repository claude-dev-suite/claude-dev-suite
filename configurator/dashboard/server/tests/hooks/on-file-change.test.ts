/**
 * The file-write primitive the automation recipes run.
 *
 * Nine recipes interpolated `$CLAUDE_FILE_PATHS`, which Claude Code does not
 * define. The formatters therefore formatted nothing — annoying — and the
 * "Security Shield" recipe grepped an empty string, matched nothing and never
 * blocked anything, while the dashboard listed it as active protection for
 * `.env`, `id_rsa` and `.pem`. It also used `exit 1`, which is a non-blocking
 * error: even with a matching path it could not have blocked the write.
 *
 * These tests run the real script against real payloads, because that pairing —
 * a wrong payload contract and a wrong exit code — is invisible to any test
 * that inspects the command string instead of executing it.
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
const SCRIPT = path.join(repoRoot, 'templates', 'hooks', 'on-file-change.mjs');

/** Vitest injects its own loader through NODE_OPTIONS; a hook subprocess gets none. */
function childEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env = { ...process.env, ...extra };
  delete env.NODE_OPTIONS;
  return env;
}

describe('on-file-change.mjs', () => {
  let tempDir: string;

  beforeEach(() => { tempDir = createTempDir('on-file-change-'); });
  afterEach(() => cleanupTempDir(tempDir));

  function run(args: string[], filePath: string | null) {
    return spawnSync(process.execPath, [SCRIPT, ...args], {
      input: JSON.stringify({
        hook_event_name: 'PostToolUse',
        tool_name: 'Edit',
        tool_input: filePath === null ? {} : { file_path: filePath },
        cwd: tempDir,
      }),
      env: childEnv({ CLAUDE_PROJECT_DIR: tempDir }),
      encoding: 'utf-8',
    });
  }

  describe('blocking a protected file', () => {
    const guard = ['--match', '(\\.env|\\.credentials|secrets|private|id_rsa|\\.pem)', '--block', 'Cannot modify sensitive files'];

    it('blocks with exit 2, the only code that actually blocks', () => {
      const result = run(guard, path.join(tempDir, '.env'));

      // The recipe used exit 1, which the hook contract treats as a
      // non-blocking error — the write would have gone through.
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('Cannot modify sensitive files');
    });

    it.each(['.env.production', 'config/secrets.yml', 'keys/id_rsa', 'certs/server.pem'])(
      'blocks %s',
      rel => {
        expect(run(guard, path.join(tempDir, ...rel.split('/'))).status).toBe(2);
      }
    );

    it('lets an ordinary source file through', () => {
      const result = run(guard, path.join(tempDir, 'src', 'index.ts'));

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
    });
  });

  describe('running a command on the written file', () => {
    it('passes the file path to the command', () => {
      const target = path.join(tempDir, 'src', 'a.ts');
      const result = run(['--', process.execPath, '-e', 'console.log("GOT:" + process.argv[1])'], target);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain(`GOT:${target}`);
    });

    it('substitutes {file} when the command positions the path itself', () => {
      const target = path.join(tempDir, 'src', 'a.ts');
      const result = run(
        ['--', process.execPath, '-e', 'console.log("AT:" + process.argv[1])', '{file}'],
        target
      );

      expect(result.stdout).toContain(`AT:${target}`);
    });

    it('keeps a path containing spaces in one piece', () => {
      // `shell: true` is required for the npx/npm shims on Windows, and Node
      // then flattens the argument vector into a command line without quoting
      // it — so a project under "C:\My Project" would have been split in half.
      const dirWithSpace = path.join(tempDir, 'my project');
      fs.mkdirSync(dirWithSpace, { recursive: true });
      const target = path.join(dirWithSpace, 'a & b.ts');

      const result = run(['--', process.execPath, '-e', 'console.log("GOT:" + process.argv[1])'], target);

      expect(result.stdout).toContain(`GOT:${target}`);
    });

    it('skips a file whose extension does not match', () => {
      const result = run(
        ['--ext', '.ts,.tsx', '--', process.execPath, '-e', 'console.log("RAN")'],
        path.join(tempDir, 'styles.css')
      );

      expect(result.stdout).not.toContain('RAN');
      expect(result.status).toBe(0);
    });

    it('does not fail the turn when the command fails', () => {
      // A formatter that is not installed must not derail the session.
      const result = run(['--', process.execPath, '-e', 'process.exit(1)'], path.join(tempDir, 'a.ts'));

      expect(result.status).toBe(0);
    });

    it('surfaces the failure when asked to be strict', () => {
      const result = run(
        ['--strict', '--', process.execPath, '-e', 'process.exit(1)'],
        path.join(tempDir, 'a.ts')
      );

      expect(result.status).toBe(2);
    });
  });

  describe('payloads it does not understand', () => {
    it('exits 0 when there is no file path', () => {
      expect(run(['--block', 'nope'], null).status).toBe(0);
    });

    it('exits 0 on a malformed regex rather than taking the write down', () => {
      const result = run(['--match', '([unclosed', '--block', 'nope'], path.join(tempDir, '.env'));

      expect(result.status).toBe(0);
    });

    it('exits 0 on a payload that is not JSON', () => {
      const result = spawnSync(process.execPath, [SCRIPT, '--block', 'nope'], {
        input: 'not json at all',
        env: childEnv({ CLAUDE_PROJECT_DIR: tempDir }),
        encoding: 'utf-8',
      });

      expect(result.status).toBe(0);
    });
  });
});
