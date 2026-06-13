// SPDX-License-Identifier: MIT
/**
 * Security regression tests for security-scanner container.ts.
 *
 * Covers: leading-dash injection guard — a target that begins with '-' must be
 * rejected before it is passed to trivy (where it would be interpreted as a
 * CLI flag).
 *
 * We do not actually invoke trivy; the guard fires before any subprocess call.
 */

import { describe, it, expect, vi } from 'vitest';

// ── Mock execFile so trivy is never actually invoked ─────────────────────────
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return {
    ...actual,
    execFile: vi.fn((_cmd: string, _args: string[], _opts: unknown, cb?: Function) => {
      // If somehow called, return an empty result
      if (cb) cb(null, '{}', '');
    }),
  };
});

// Also mock isToolAvailable so trivy is reported as "available"
vi.mock('../src/utils/tool-checker.js', () => ({
  isToolAvailable: vi.fn(async () => true),
  getInstallCommand: vi.fn(() => ''),
}));

import { scanContainer } from '../src/scanners/container.js';

describe('scanContainer — leading-dash injection guard', () => {
  it('rejects a target starting with a single dash', async () => {
    const result = await scanContainer({
      target: '-v /etc/passwd:/etc/passwd',
      type: 'image',
    });
    expect(result.toolAvailable).toBe(true);
    // The guard returns an error result (not a throw) for graceful UX
    expect(result.findings.length).toBe(0);
    // The summary should indicate an error
    expect(JSON.stringify(result)).toMatch(/must not start with a dash/i);
  });

  it('rejects a target starting with double dash', async () => {
    const result = await scanContainer({
      target: '--privileged',
      type: 'image',
    });
    expect(JSON.stringify(result)).toMatch(/must not start with a dash/i);
  });

  it('accepts a normal image name', async () => {
    // The target is valid; trivy is mocked so it returns empty JSON
    const result = await scanContainer({
      target: 'alpine:latest',
      type: 'image',
    });
    // Should not be the leading-dash error
    expect(JSON.stringify(result)).not.toMatch(/must not start with a dash/i);
  });

  it('accepts a filesystem path', async () => {
    const result = await scanContainer({
      target: '/tmp/myapp',
      type: 'fs',
    });
    expect(JSON.stringify(result)).not.toMatch(/must not start with a dash/i);
  });
});
