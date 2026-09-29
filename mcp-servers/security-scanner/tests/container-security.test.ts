// SPDX-License-Identifier: MIT
/**
 * Security regression tests for security-scanner container.ts.
 *
 * Covers: leading-dash injection guard — a target that begins with '-' must be
 * rejected before it is passed to trivy (where it would be interpreted as a
 * CLI flag).
 *
 * trivy is faked (tests/helpers/fake-exec.ts); the guard fires before any
 * subprocess call, which the recorded call list proves.
 */

import { afterEach, describe, it, expect } from 'vitest';
import { writeFileSync } from 'fs';
import { argAfter, fakeExec, resetExec } from './helpers/fake-exec.js';
import { scanContainer } from '../src/scanners/container.js';

function fakeTrivy() {
  return fakeExec({
    trivy: (args) => {
      writeFileSync(argAfter(args, '--output')!, JSON.stringify({ Results: [] }));
      return {};
    },
  });
}

afterEach(() => resetExec());

describe('scanContainer — leading-dash injection guard', () => {
  it('rejects a target starting with a single dash', async () => {
    const calls = fakeTrivy();
    const result = await scanContainer({
      target: '-v /etc/passwd:/etc/passwd',
      type: 'image',
    });
    expect(result.findings.length).toBe(0);
    expect(result.status).toBe('failed');
    expect(JSON.stringify(result)).toMatch(/must not start with a dash/i);
    expect(calls).toHaveLength(0);
  });

  it('rejects a target starting with double dash', async () => {
    const calls = fakeTrivy();
    const result = await scanContainer({
      target: '--privileged',
      type: 'image',
    });
    expect(JSON.stringify(result)).toMatch(/must not start with a dash/i);
    expect(calls).toHaveLength(0);
  });

  it('rejects an image reference containing whitespace', async () => {
    const calls = fakeTrivy();
    const result = await scanContainer({ target: 'alpine --debug', type: 'image' });
    expect(result.status).toBe('failed');
    expect(calls).toHaveLength(0);
  });

  it('accepts a normal image name and passes it after "--"', async () => {
    const calls = fakeTrivy();
    const result = await scanContainer({
      target: 'alpine:latest',
      type: 'image',
    });
    expect(JSON.stringify(result)).not.toMatch(/must not start with a dash/i);
    expect(calls[0].args.slice(-2)).toEqual(['--', 'alpine:latest']);
  });

  it('accepts a filesystem path', async () => {
    fakeTrivy();
    const result = await scanContainer({
      target: '/tmp/myapp',
      type: 'filesystem',
    });
    expect(JSON.stringify(result)).not.toMatch(/must not start with a dash/i);
  });
});
