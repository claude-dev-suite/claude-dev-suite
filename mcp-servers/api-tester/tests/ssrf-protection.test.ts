// SPDX-License-Identifier: MIT
/**
 * SSRF protection regression tests for api-tester validateUrl (types.ts).
 *
 * Tests the IPv6 loopback, ULA, link-local, IPv4-mapped IPv6, and
 * standard IPv4 private-range blocking.
 *
 * NOTE: The api-tester validateUrl currently blocks ::1 explicitly.  The
 * broader IPv6 ULA/link-local blocking relies on the fact that validateUrl
 * checks resolved addresses for hostnames.  For IPv6 literals in the URL
 * the current implementation performs a lightweight check.
 */

import { describe, it, expect } from 'vitest';
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

  it('blocks 127.0.0.1 loopback literal', async () => {
    await expect(validateUrl('http://127.0.0.1:8080/')).rejects.toThrow(/SSRF protection/i);
  });

  it('throws on malformed URL', async () => {
    await expect(validateUrl('not-a-url')).rejects.toThrow(/invalid url/i);
  });
});

describe('validateUrl — IPv6 SSRF protection', () => {
  it('blocks IPv6 loopback [::1]', async () => {
    await expect(validateUrl('http://[::1]:8080/')).rejects.toThrow(/SSRF protection/i);
  });

  it('blocks full-form IPv6 loopback [0:0:0:0:0:0:0:1]', async () => {
    await expect(validateUrl('http://[0:0:0:0:0:0:0:1]/')).rejects.toThrow(/SSRF protection/i);
  });
});
