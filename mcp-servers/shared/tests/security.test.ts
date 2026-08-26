// SPDX-License-Identifier: MIT
/**
 * Tests for the shared security helpers.
 *
 * These import the production modules directly. The audit found that
 * `code-quality/tests/security.test.ts` re-declared the code it was testing, so
 * the test could never fail when production drifted — the whole point of moving
 * these guards into one package is that one test now covers every consumer.
 *
 * Covers Tier 3 #24/#26 of the 2026-08 audit: api-tester's local SSRF guard
 * admitted IPv6 unique-local and link-local addresses and never decoded
 * numeric IPv4 literals; both are blocked here.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { validateUrl, validateFilePath, assertWithinRoot } from '../src/index.js';
import * as path from 'path';

describe('validateUrl — IPv4 literals', () => {
  it('blocks the cloud metadata endpoint', async () => {
    await expect(validateUrl('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(
      /metadata/i
    );
  });

  it('blocks the metadata endpoint even when private ranges are allowed', async () => {
    // The metadata range is never unlocked by the escape hatch.
    await expect(
      validateUrl('http://169.254.169.254/', { allowPrivate: true })
    ).rejects.toThrow(/metadata/i);
  });

  it.each([
    ['http://127.0.0.1:8080/', /loopback/i],
    ['http://10.0.0.5/', /private/i],
    ['http://192.168.1.1/', /private/i],
    ['http://172.16.0.1/', /private/i],
    ['http://0.0.0.0/', /unspecified/i],
  ])('blocks %s', async (url, pattern) => {
    await expect(validateUrl(url)).rejects.toThrow(pattern);
  });

  it('decodes a decimal IPv4 literal before checking the range', async () => {
    // 2852039166 === 169.254.169.254. api-tester's own guard tested the
    // hostname against a dotted-quad regex, so this form sailed past it.
    await expect(validateUrl('http://2852039166/')).rejects.toThrow(/metadata/i);
  });

  it('decodes a hex IPv4 literal', async () => {
    await expect(validateUrl('http://0xa9fea9fe/')).rejects.toThrow(/metadata/i);
  });

  it('unlocks private ranges when the caller opts in', async () => {
    await expect(
      validateUrl('http://127.0.0.1:8080/', { allowPrivate: true })
    ).resolves.toBeUndefined();
  });
});

describe('validateUrl — IPv6 literals', () => {
  it('blocks IPv6 loopback', async () => {
    await expect(validateUrl('http://[::1]:3000/')).rejects.toThrow(/loopback/i);
  });

  it('blocks a unique-local address (fc00::/7)', async () => {
    // api-tester's guard returned early for "other IPv6", allowing this.
    await expect(validateUrl('http://[fd00::1]/')).rejects.toThrow();
  });

  it('blocks a link-local address (fe80::/10)', async () => {
    await expect(validateUrl('http://[fe80::1]/')).rejects.toThrow();
  });

  it('blocks an IPv4-mapped metadata address', async () => {
    await expect(validateUrl('http://[::ffff:169.254.169.254]/')).rejects.toThrow(/metadata/i);
  });
});

describe('validateUrl — general', () => {
  it('allows an explicit localhost hostname', async () => {
    await expect(validateUrl('http://localhost:3000/health')).resolves.toBeUndefined();
  });

  it('rejects a malformed URL', async () => {
    await expect(validateUrl('not a url')).rejects.toThrow(/Invalid URL/i);
  });

  it('reads no environment variable of its own', async () => {
    // The policy is passed in, never picked up from the ambient environment:
    // one server's escape hatch must not widen another's.
    process.env.PERF_PROFILER_ALLOW_PRIVATE_URLS = '1';
    try {
      await expect(validateUrl('http://127.0.0.1/')).rejects.toThrow(/loopback/i);
    } finally {
      delete process.env.PERF_PROFILER_ALLOW_PRIVATE_URLS;
    }
  });
});

describe('validateFilePath', () => {
  it('rejects a null byte', () => {
    expect(() => validateFilePath('/tmp/evil\0.txt')).toThrow(/null byte/i);
  });

  it('rejects a relative path', () => {
    expect(() => validateFilePath('relative/file.txt')).toThrow(/absolute/i);
  });

  it('rejects an empty path', () => {
    expect(() => validateFilePath('')).toThrow();
  });

  it('accepts an absolute path', () => {
    const abs = path.resolve('/tmp/app.log');
    expect(() => validateFilePath(abs)).not.toThrow();
  });
});

describe('assertWithinRoot', () => {
  const root = path.resolve('/srv/backups');

  it('accepts a path inside the root', () => {
    expect(assertWithinRoot(path.join(root, 'db.dump'), root)).toBe(
      path.join(root, 'db.dump')
    );
  });

  it('accepts the root itself', () => {
    expect(assertWithinRoot(root, root)).toBe(root);
  });

  it('rejects a traversing path', () => {
    expect(() => assertWithinRoot(path.join(root, '..', 'etc', 'passwd'), root)).toThrow(
      /escapes/i
    );
  });

  it('rejects a sibling whose name merely starts with the root', () => {
    // `/srv/backups-evil` must not pass a naive startsWith check.
    expect(() => assertWithinRoot(root + '-evil', root)).toThrow(/escapes/i);
  });
});
