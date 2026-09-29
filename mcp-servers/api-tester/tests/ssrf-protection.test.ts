// SPDX-License-Identifier: MIT
/**
 * SSRF protection regression tests for api-tester validateUrl (types.ts).
 *
 * Tests the IPv6 loopback, ULA, link-local, IPv4-mapped IPv6, and
 * standard IPv4 private-range blocking.
 *
 * As of the 2026-08 audit `validateUrl` delegates to `@dev-suite/shared`, so
 * IPv6 ULA/link-local and numeric IPv4 literals are checked properly rather
 * than by the "lightweight check" the local implementation used to do.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { validateUrl } from '../src/handlers/types.js';

describe('validateUrl — standard IPv4 SSRF protection', () => {
  it('allows a public URL', async () => {
    await expect(validateUrl('https://example.com/api')).resolves.toBeUndefined();
  });

  it('allows localhost', async () => {
    await expect(validateUrl('http://localhost:3000/health')).resolves.toBeUndefined();
  });

  it('blocks cloud metadata endpoint 169.254.169.254', async () => {
    await expect(validateUrl('http://169.254.169.254/latest/meta-data/')).rejects.toThrow(
      /SSRF protection/i
    );
  });

  it('blocks 10.x.x.x private range', async () => {
    await expect(validateUrl('http://10.0.0.1/admin')).rejects.toThrow(/SSRF protection/i);
  });

  it('blocks 172.16.x.x private range', async () => {
    await expect(validateUrl('http://172.16.0.1/secret')).rejects.toThrow(/SSRF protection/i);
  });

  it('blocks 192.168.x.x private range', async () => {
    await expect(validateUrl('http://192.168.1.1/')).rejects.toThrow(/SSRF protection/i);
  });

  // Policy change (2.1.0): loopback is allowed by default — this is a local
  // development tool, and dev servers print http://127.0.0.1:<port>.
  it('allows the 127.0.0.1 loopback literal', async () => {
    await expect(validateUrl('http://127.0.0.1:8080/')).resolves.toBeUndefined();
  });

  it('throws on malformed URL', async () => {
    await expect(validateUrl('not-a-url')).rejects.toThrow(/invalid url/i);
  });
});

describe('validateUrl — IPv6 SSRF protection', () => {
  it('allows IPv6 loopback [::1]', async () => {
    await expect(validateUrl('http://[::1]:8080/')).resolves.toBeUndefined();
  });

  it('allows full-form IPv6 loopback [0:0:0:0:0:0:0:1]', async () => {
    await expect(validateUrl('http://[0:0:0:0:0:0:0:1]/')).resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2026-08 audit, Tier 3 #24/#26 — gaps in the server's own SSRF guard.
//
// `validateUrl` now delegates to `@dev-suite/shared`. The local implementation
// it replaced returned early for "other IPv6" (so unique-local and link-local
// addresses passed) and matched IPv4 only as a dotted quad (so decimal and hex
// literals were never range-checked at all).
// ─────────────────────────────────────────────────────────────────────────────

describe("audit 2026-08 — gaps closed by the shared guard", () => {
  it("blocks an IPv6 unique-local address", async () => {
    await expect(validateUrl("http://[fd00::1]/")).rejects.toThrow();
  });

  it("blocks an IPv6 link-local address", async () => {
    await expect(validateUrl("http://[fe80::1]/")).rejects.toThrow();
  });

  it("blocks a decimal-encoded metadata address", async () => {
    // 2852039166 === 169.254.169.254
    await expect(validateUrl("http://2852039166/")).rejects.toThrow(/metadata/i);
  });

  it("blocks a hex-encoded metadata address", async () => {
    await expect(validateUrl("http://0xa9fea9fe/")).rejects.toThrow(/metadata/i);
  });

  it("blocks an IPv4-mapped IPv6 metadata address", async () => {
    await expect(validateUrl("http://[::ffff:169.254.169.254]/")).rejects.toThrow(/metadata/i);
  });

  it("still allows localhost", async () => {
    await expect(validateUrl("http://localhost:3000/")).resolves.toBeUndefined();
  });
});

describe('API_TESTER_ALLOW_PRIVATE opt-in', () => {
  const prev = process.env.API_TESTER_ALLOW_PRIVATE;
  afterEach(() => {
    if (prev === undefined) delete process.env.API_TESTER_ALLOW_PRIVATE;
    else process.env.API_TESTER_ALLOW_PRIVATE = prev;
  });

  it('allows RFC-1918 ranges when set to 1', async () => {
    process.env.API_TESTER_ALLOW_PRIVATE = '1';
    await expect(validateUrl('http://10.0.0.5/')).resolves.toBeUndefined();
    await expect(validateUrl('http://192.168.1.10:8080/')).resolves.toBeUndefined();
    await expect(validateUrl('http://172.17.0.2/')).resolves.toBeUndefined();
  });

  it('accepts "true" as well', async () => {
    process.env.API_TESTER_ALLOW_PRIVATE = 'true';
    await expect(validateUrl('http://[fd00::1]/')).resolves.toBeUndefined();
  });

  it('still blocks cloud metadata with the opt-in', async () => {
    process.env.API_TESTER_ALLOW_PRIVATE = '1';
    await expect(validateUrl('http://169.254.169.254/latest/')).rejects.toThrow(/metadata/i);
    await expect(validateUrl('http://2852039166/')).rejects.toThrow(/metadata/i);
  });

  it('explains the opt-in in the error', async () => {
    delete process.env.API_TESTER_ALLOW_PRIVATE;
    await expect(validateUrl('http://10.0.0.1/')).rejects.toThrow(/API_TESTER_ALLOW_PRIVATE/);
  });
});
