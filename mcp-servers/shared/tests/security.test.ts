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
import {
  validateUrl,
  validateFilePath,
  assertWithinRoot,
  assertAddressAllowed,
  createGuardedLookup,
} from '../src/index.js';
import * as fs from 'fs';
import * as os from 'os';
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
    await expect(validateUrl('http://10.0.0.5/', { allowPrivate: true })).resolves.toBeUndefined();
  });

  it('allows the loopback range, the same socket as the localhost hostname', async () => {
    // It used to allow `localhost` and refuse `127.0.0.1`: no protection, and
    // the URL most dev servers print was rejected.
    await expect(validateUrl('http://127.0.0.1:8080/')).resolves.toBeUndefined();
    await expect(validateUrl('http://2130706433/')).resolves.toBeUndefined(); // 127.0.0.1
  });
});

describe('validateUrl — IPv6 literals', () => {
  it('allows IPv6 loopback, like 127.0.0.0/8', async () => {
    await expect(validateUrl('http://[::1]:3000/')).resolves.toBeUndefined();
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

  it('never echoes a rejected URL, which can carry a password', async () => {
    const err = await validateUrl('postgres://u:s3cret@[bad').catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toContain('s3cret');
  });

  it('fails closed when the hostname cannot be resolved', async () => {
    // `.invalid` is reserved (RFC 2606) and never resolves.
    await expect(validateUrl('http://no-such-host.invalid/')).rejects.toThrow(/could not resolve/i);
  });

  it('reads no environment variable of its own', async () => {
    // The policy is passed in, never picked up from the ambient environment:
    // one server's escape hatch must not widen another's.
    process.env.PERF_PROFILER_ALLOW_PRIVATE_URLS = '1';
    try {
      await expect(validateUrl('http://10.1.2.3/')).rejects.toThrow(/private/i);
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

describe('assertAddressAllowed', () => {
  it('applies the same ranges as validateUrl to a resolved address', () => {
    expect(() => assertAddressAllowed('169.254.169.254', { allowPrivate: true })).toThrow(/metadata/i);
    expect(() => assertAddressAllowed('10.0.0.1')).toThrow(/private/i);
    expect(() => assertAddressAllowed('10.0.0.1', { allowPrivate: true })).not.toThrow();
    expect(() => assertAddressAllowed('fd00::1')).toThrow();
    expect(() => assertAddressAllowed('127.0.0.1')).not.toThrow();
    expect(() => assertAddressAllowed('::1')).not.toThrow();
    expect(() => assertAddressAllowed('93.184.216.34')).not.toThrow();
  });

  it('rejects something that is not an IP address', () => {
    expect(() => assertAddressAllowed('example.com')).toThrow();
  });
});

describe('createGuardedLookup', () => {
  const lookupOnce = (host: string, opts: object) =>
    new Promise<{ err: NodeJS.ErrnoException | null; address: unknown }>((done) =>
      createGuardedLookup()(host, opts, (err: NodeJS.ErrnoException | null, address: unknown) =>
        done({ err, address }),
      ),
    );

  it('passes an allowed address through in both callback shapes', async () => {
    const single = await lookupOnce('localhost', {});
    expect(single.err).toBeNull();
    expect(typeof single.address).toBe('string');
    const all = await lookupOnce('localhost', { all: true });
    expect(all.err).toBeNull();
    expect(Array.isArray(all.address)).toBe(true);
  });

  it('refuses a name that does not resolve', async () => {
    const r = await lookupOnce('no-such-host.invalid', {});
    expect(r.err).not.toBeNull();
  });
});

describe('assertWithinRoot — links and case', () => {
  let tmp: string;
  afterEach(() => {
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('rejects a symlink inside the root that points outside it', () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-root-'));
    const root = path.join(tmp, 'root');
    const outside = path.join(tmp, 'outside');
    fs.mkdirSync(root);
    fs.mkdirSync(outside);
    const link = path.join(root, 'escape');
    try {
      fs.symlinkSync(outside, link, 'junction');
    } catch {
      return; // no permission to create links on this machine
    }
    expect(() => assertWithinRoot(path.join(link, 'secret.txt'), root)).toThrow(/escapes/i);
  });

  it.runIf(process.platform === 'win32')('treats a differently-cased path as inside on Windows', () => {
    const root = path.resolve('C:/Proj');
    expect(() => assertWithinRoot('c:/proj/src/a.ts', root)).not.toThrow();
  });
});

describe('validateUrl — allowLoopback: false', () => {
  it('blocks every loopback form when the caller opts out', async () => {
    for (const url of ['http://localhost/', 'http://127.0.0.1/', 'http://[::1]/', 'http://2130706433/']) {
      await expect(validateUrl(url, { allowLoopback: false })).rejects.toThrow(/loopback/i);
    }
    expect(() => assertAddressAllowed('127.0.0.1', { allowLoopback: false })).toThrow(/loopback/i);
  });
});
