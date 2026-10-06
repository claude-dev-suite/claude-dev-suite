// SPDX-License-Identifier: MIT
/**
 * Library entry tests.
 *
 * `src/lib.ts` exists so a command-line install can reach the wizard's
 * services without `index.ts`, which starts the HTTP and WebSocket servers as
 * an import side effect. The property that matters is observable only from a
 * separate process: importing the entry must start nothing (the process exits
 * on its own) and, in headless mode, print nothing to stdout.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('src/lib.ts', () => {
  it('exports the services the wizard drives', async () => {
    const lib = await import('../src/lib.js');
    for (const name of [
      'DetectionService',
      'AgentsService',
      'RulesService',
      'AssistantDetectionService',
      'InstallationService',
      'ReinstallService',
      'getDevSuiteDir',
    ]) {
      expect(typeof (lib as Record<string, unknown>)[name]).toBe('function');
    }
    expect(lib.DEFAULT_TARGET).toBe('claude-code');
  });

  it('starts nothing and keeps stdout clean when imported headless', () => {
    // Run a real detection, not just the import: DetectionService logs at
    // debug level on every call, so outside headless mode this script prints
    // dozens of lines to stdout.
    const script =
      "const lib = await import('./src/lib.ts');" +
      'await new lib.DetectionService().detectProject(process.cwd());' +
      "process.stderr.write('loaded ' + Object.keys(lib).length + '\\n');";
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', '--input-type=module', '-e', script],
      {
        cwd: serverDir,
        env: { ...process.env, DEV_SUITE_HEADLESS: '1', LOG_LEVEL: 'debug' },
        encoding: 'utf-8',
        // A listening server would keep the process alive until this fires.
        timeout: 60_000,
      }
    );

    expect(result.error).toBeUndefined();
    expect(result.signal).toBeNull();
    expect(result.status).toBe(0);
    expect(result.stderr).toMatch(/loaded \d+/);
    // LOG_LEVEL=debug on purpose: even the chattiest level must go to stderr.
    expect(result.stdout).toBe('');
  }, 90_000);
});
