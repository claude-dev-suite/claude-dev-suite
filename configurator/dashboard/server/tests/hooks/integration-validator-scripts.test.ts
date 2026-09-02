/**
 * Integration-validation hook scripts.
 *
 * These run the real shell scripts against the real payload shape, because the
 * bug they replace was precisely a payload-shape bug: the previous hooks read
 * `.command` and `$CLAUDE_FILE_PATHS`, neither of which Claude Code sends, so
 * they silently did nothing. A unit test of the service alone would not have
 * caught that — only executing the script against a documented payload does.
 *
 * They run on `process.execPath`: the scripts are Node precisely so they do not
 * depend on bash and jq, which are absent on a stock Windows install.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';
import { createTempDir, cleanupTempDir } from '../test-utils.js';

// tests/hooks/ is five levels below the repo root, not four.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const MARK = path.join(repoRoot, 'templates', 'hooks', 'mark-api-change.mjs');
const DECIDE = path.join(repoRoot, 'templates', 'hooks', 'integration-validate.mjs');

/**
 * Vitest injects its own loader through NODE_OPTIONS. Inheriting that into a
 * plain `node script.mjs` child makes it fail before the script runs, which has
 * nothing to do with what is being tested — a hook subprocess in a real session
 * does not get it either.
 */
function childEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env = { ...process.env, ...extra };
  delete env.NODE_OPTIONS;
  return env;
}

describe('integration validation hook scripts', () => {
  let tempDir: string;
  let marker: string;

  beforeEach(() => {
    tempDir = createTempDir('ds-api-marker-');
    fs.mkdirSync(path.join(tempDir, '.claude'), { recursive: true });
    marker = path.join(tempDir, '.claude', '.ds-api-touched');
  });

  afterEach(() => cleanupTempDir(tempDir));

  function runMark(filePath: string) {
    return spawnSync(process.execPath, [MARK], {
      input: JSON.stringify({
        hook_event_name: 'PostToolUse',
        tool_name: 'Edit',
        tool_input: { file_path: filePath },
        cwd: tempDir,
      }),
      env: childEnv({ CLAUDE_PROJECT_DIR: tempDir }),
      encoding: 'utf-8',
    });
  }

  function runDecide(level: string, stopHookActive = false) {
    return spawnSync(process.execPath, [DECIDE, level], {
      input: JSON.stringify({
        hook_event_name: 'Stop',
        stop_hook_active: stopHookActive,
        cwd: tempDir,
      }),
      env: childEnv({ CLAUDE_PROJECT_DIR: tempDir }),
      encoding: 'utf-8',
    });
  }

  describe('mark-api-change.mjs', () => {
    it('records a write to an API-surface file', () => {
      const result = runMark(path.join(tempDir, 'src', 'api', 'users.controller.ts'));

      expect(result.status).toBe(0);
      expect(fs.readFileSync(marker, 'utf-8')).toContain('users.controller.ts');
    });

    it('ignores a file that cannot change an API contract', () => {
      const result = runMark(path.join(tempDir, 'src', 'components', 'Button.css'));

      expect(result.status).toBe(0);
      expect(fs.existsSync(marker)).toBe(false);
    });

    it('ignores documentation inside an api directory', () => {
      runMark(path.join(tempDir, 'src', 'api', 'README.md'));
      expect(fs.existsSync(marker)).toBe(false);
    });

    // The check is only worth having if it fires on contract changes and stays
    // quiet otherwise. `route`/`router` are kept because that is how backends
    // name their surface, which means SvelteKit and Remix pages have to be
    // excluded explicitly — otherwise every button someone moves asks for an
    // API validation, and people learn to dismiss the prompt.
    describe.each([
      ['src/main/java/com/x/UserController.java', true],
      ['src/users/users.controller.ts', true],
      ['app/api/users/route.ts', true],
      ['src/routes/api/orders/+server.ts', true],
      ['src/routes/about/+page.server.ts', true],
      ['api/openapi.yaml', true],
      ['app/models/serializers.py', true],
      ['myapp/urls.py', true],
      ['proto/user.proto', true],
      ['src/lib/api-client.ts', true],
      ['src/routes/about/+page.svelte', false],
      ['src/routes/marketing/+layout.svelte', false],
      ['app/routes/dashboard.tsx', false],
      ['app/dashboard/page.tsx', false],
      ['src/components/Button.tsx', false],
    ])('path %s', (rel, shouldMark) => {
      it(shouldMark ? 'is treated as API surface' : 'is left alone', () => {
        runMark(path.join(tempDir, ...rel.split('/')));

        const marked = fs.existsSync(marker) && fs.readFileSync(marker, 'utf-8').trim().length > 0;
        expect(marked).toBe(shouldMark);
      });
    });

    it('never blocks the tool call, even with a payload it does not understand', () => {
      const result = spawnSync(process.execPath, [MARK], {
        input: JSON.stringify({ hook_event_name: 'PostToolUse', tool_input: {} }),
        env: childEnv({ CLAUDE_PROJECT_DIR: tempDir }),
        encoding: 'utf-8',
      });
      expect(result.status).toBe(0);
    });

    it('loses no line when many agents write at once', async () => {
      // The scenario this whole design exists for: a parallel fan-out writing
      // concurrently. Each run appends one short line, which is atomic under
      // PIPE_BUF, so nothing interleaves and nothing is dropped.
      const writes = Array.from({ length: 16 }, (_, i) =>
        new Promise<void>(resolve => {
          runMark(path.join(tempDir, 'src', 'api', `route-${i}.ts`));
          resolve();
        })
      );
      await Promise.all(writes);

      const lines = fs.readFileSync(marker, 'utf-8').trim().split('\n');
      expect(lines).toHaveLength(16);
      expect(new Set(lines).size).toBe(16);
      for (const line of lines) expect(line).toMatch(/^src[\\/]api[\\/]route-\d+\.ts$/);
    });
  });

  describe('integration-validate.mjs', () => {
    it('costs nothing when no API file was touched', () => {
      const result = runDecide('warn');

      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe('');
    });

    it('reports once and clears the marker in warn mode', () => {
      fs.writeFileSync(marker, 'src/api/a.ts\nsrc/api/b.ts\n');

      const result = runDecide('warn');

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('integration-validator-expert');
      expect(result.stdout).toContain('src/api/a.ts');
      expect(fs.readFileSync(marker, 'utf-8').trim()).toBe('');
    });

    it('collapses duplicates from concurrent agents into one report', () => {
      fs.writeFileSync(marker, 'src/api/a.ts\nsrc/api/a.ts\nsrc/api/a.ts\n');

      const result = runDecide('warn');

      expect(result.stdout).toContain('1 API-surface file(s)');
    });

    it('exits 2 in block mode so the turn continues', () => {
      fs.writeFileSync(marker, 'src/api/a.ts\n');

      const result = runDecide('block');

      expect(result.status).toBe(2);
      expect(result.stderr).toContain('integration-validator-expert');
    });

    it('does not ask twice in the same turn', () => {
      // Without this guard `block` would keep the turn alive indefinitely.
      fs.writeFileSync(marker, 'src/api/a.ts\n');

      const result = runDecide('block', true);

      expect(result.status).toBe(0);
      expect(fs.readFileSync(marker, 'utf-8')).toContain('src/api/a.ts');
    });

    it('stays out of the way when the project opted out', () => {
      fs.writeFileSync(marker, 'src/api/a.ts\n');

      const result = runDecide('off');

      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe('');
    });

    it('honours the CI escape hatch', () => {
      fs.writeFileSync(marker, 'src/api/a.ts\n');

      const result = spawnSync(process.execPath, [DECIDE, 'block'], {
        input: JSON.stringify({ hook_event_name: 'Stop', stop_hook_active: false, cwd: tempDir }),
        env: childEnv({ CLAUDE_PROJECT_DIR: tempDir, DS_SKIP_INTEGRATION_VALIDATION: '1' }),
        encoding: 'utf-8',
      });

      expect(result.status).toBe(0);
    });
  });
});
