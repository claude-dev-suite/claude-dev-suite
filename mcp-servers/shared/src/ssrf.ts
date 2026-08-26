// SPDX-License-Identifier: MIT
/**
 * SSRF protection shared by every dev-suite MCP server that makes outbound
 * HTTP requests.
 *
 * This is the single implementation. Three used to exist, of very different
 * quality: api-tester allowed every non-loopback IPv6 (so `fd00::/8` ULA and
 * `fe80::/10` link-local passed) and never normalised decimal/hex/octal IPv4
 * literals, while this one handles both. The cause of the divergence was that
 * `mcp-servers/shared/` contained only build output and no source, so there was
 * nowhere for a shared helper to live.
 *
 * Policy:
 *  - Explicit "localhost" hostname is ALLOWED (profiling local endpoints is
 *    the primary use-case for this tool).
 *  - 169.254.0.0/16 (cloud metadata — AWS IMDSv1/v2, GCP, Azure) is ALWAYS
 *    blocked, even for local-profiling use-cases.
 *  - All other RFC-1918 private ranges (10.x, 172.16-31.x, 192.168.x),
 *    the loopback range (127.0.0.0/8 except "localhost"), IPv6 loopback (::1),
 *    IPv6 ULA (fc00::/7), IPv6 link-local (fe80::/10), and IPv4-mapped IPv6
 *    addresses are blocked by default but can be bypassed (except metadata)
 *    by the caller passing `allowPrivate: true` — each server decides which of
 *    its own env vars, if any, turns that on.
 *  - Decimal/octal/hex-encoded IPv4 literals (e.g. 2852039166, 0x0a000001,
 *    0177.0.0.1) are normalised to dotted-quad before the range check.
 *  - Redirects: callers MUST call validateUrl on the Location header before
 *    following each hop (see http-client.ts).
 */

import { lookup } from 'dns/promises';
import { isIPv4, isIPv6 } from 'net';

// ---------------------------------------------------------------------------
// IPv4 helpers
// ---------------------------------------------------------------------------

/**
 * Attempt to decode a non-standard IPv4 representation (decimal, octal, hex,
 * mixed-notation) into a dotted-quad string.  Returns null if the input does
 * not look like an IPv4 integer literal.
 *
 * Handles:
 *  - Pure integer:  2852039166  → 169.254.169.254
 *  - Hex:           0xa9fea9fe  → 169.254.169.254
 *  - Octal:         0251.0376.0251.0376 (per-octet octal)
 *  - Mixed dotted:  0xa9fe.169.254  (rare but valid in some resolvers)
 */
function decodeAlternativeIpv4(raw: string): string | null {
  const trimmed = raw.trim();

  // --- Pure integer (decimal or 0x hex) ---
  // Matches: 2852039166  or  0xa9fea9fe
  if (/^(0x[0-9a-f]+|\d+)$/i.test(trimmed)) {
    let n: number;
    try {
      n = Number(trimmed); // parseInt with radix 16 or 10
      if (!Number.isInteger(n) || n < 0 || n > 0xffffffff) return null;
    } catch {
      return null;
    }
    return [
      (n >>> 24) & 0xff,
      (n >>> 16) & 0xff,
      (n >>> 8) & 0xff,
      n & 0xff,
    ].join('.');
  }

  // --- Dotted notation with possible octal/hex octets ---
  // Each octet can be:  0x1a (hex), 017 (octal), or 25 (decimal)
  if (trimmed.includes('.')) {
    const parts = trimmed.split('.');
    if (parts.length !== 4) return null;
    const octets: number[] = [];
    for (const part of parts) {
      const p = part.trim();
      if (p === '') return null;
      let val: number;
      if (/^0x[0-9a-f]+$/i.test(p)) {
        val = parseInt(p, 16);
      } else if (/^0[0-7]+$/.test(p)) {
        val = parseInt(p, 8);
      } else if (/^\d+$/.test(p)) {
        val = parseInt(p, 10);
      } else {
        return null;
      }
      if (val < 0 || val > 255) return null;
      octets.push(val);
    }
    return octets.join('.');
  }

  return null;
}

/**
 * Check whether a dotted-quad IPv4 address falls within a private/reserved
 * range.  Returns the range name if blocked, null if public.
 */
function getBlockedIpv4Range(ip: string, allowPrivate: boolean): string | null {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p))) return null;

  const [a, b] = parts;

  // Cloud metadata endpoint — always blocked
  if (a === 169 && b === 254) return 'link-local/cloud-metadata (169.254.x.x)';

  // Allow remaining ranges when the caller opted in.
  if (allowPrivate) return null;

  if (a === 127) return 'loopback (127.x.x.x)';
  if (a === 0) return 'unspecified (0.x.x.x)';
  if (a === 10) return 'private (10.x.x.x)';
  if (a === 172 && b >= 16 && b <= 31) return 'private (172.16-31.x.x)';
  if (a === 192 && b === 168) return 'private (192.168.x.x)';

  return null;
}

// ---------------------------------------------------------------------------
// IPv6 helpers
// ---------------------------------------------------------------------------

/**
 * Expand a compressed IPv6 address (e.g. "::1") into its full 8-group form
 * so we can extract the embedded IPv4 from IPv4-mapped addresses and check
 * prefix ranges.
 *
 * Returns an array of 8 numbers (each 0–65535), or null on parse failure.
 */
function parseIpv6Groups(addr: string): number[] | null {
  // Handle :: expansion
  const halves = addr.split('::');
  if (halves.length > 2) return null;

  let left: string[] = halves[0] ? halves[0].split(':') : [];
  let right: string[] = halves.length === 2 && halves[1] ? halves[1].split(':') : [];

  // The last group in right might be an IPv4 address (for ::ffff:a.b.c.d)
  const lastRight = right[right.length - 1] ?? '';
  if (isIPv4(lastRight)) {
    // Replace the IPv4 dotted-quad with two 16-bit hex groups
    const v4parts = lastRight.split('.').map(Number);
    const hi = (v4parts[0] << 8) | v4parts[1];
    const lo = (v4parts[2] << 8) | v4parts[3];
    right = [...right.slice(0, -1), hi.toString(16), lo.toString(16)];
  }

  const total = left.length + right.length;
  const missing = 8 - total;
  if (missing < 0) return null;

  const expanded = [
    ...left,
    ...Array(missing).fill('0'),
    ...right,
  ];

  if (expanded.length !== 8) return null;

  const groups: number[] = [];
  for (const g of expanded) {
    const n = parseInt(g, 16);
    if (isNaN(n) || n < 0 || n > 0xffff) return null;
    groups.push(n);
  }
  return groups;
}

/**
 * Returns a block-reason string if the IPv6 address is in a forbidden range,
 * or null if it should be allowed.
 *
 * Blocked ranges:
 *  ::1                  — loopback
 *  ::ffff:0:0/96        — IPv4-mapped (check embedded IPv4)
 *  fc00::/7             — Unique Local Address (ULA)
 *  fe80::/10            — Link-local
 */
function getBlockedIpv6Range(addr: string, allowPrivate: boolean): string | null {
  const groups = parseIpv6Groups(addr);
  if (!groups) return null; // Can't parse — let it pass (DNS will fail anyway)

  // Loopback ::1
  if (groups.every((g, i) => (i < 7 ? g === 0 : g === 1))) {
    if (!allowPrivate) return 'IPv6 loopback (::1)';
  }

  // IPv4-mapped ::ffff:a.b.c.d  (groups[0..4]=0, groups[5]=0xffff)
  const isIpv4Mapped =
    groups[0] === 0 &&
    groups[1] === 0 &&
    groups[2] === 0 &&
    groups[3] === 0 &&
    groups[4] === 0 &&
    groups[5] === 0xffff;

  if (isIpv4Mapped) {
    // Extract embedded IPv4
    const hi = groups[6];
    const lo = groups[7];
    const embeddedIpv4 = [
      (hi >>> 8) & 0xff,
      hi & 0xff,
      (lo >>> 8) & 0xff,
      lo & 0xff,
    ].join('.');
    const blocked = getBlockedIpv4Range(embeddedIpv4, allowPrivate);
    if (blocked) return `IPv4-mapped IPv6 embedding ${blocked}`;
    return null; // Embedded public IPv4 — allow
  }

  if (!allowPrivate) {
    // fc00::/7 — ULA (first 7 bits = 1111 110x, i.e. 0xfc or 0xfd high byte)
    const firstByte = (groups[0] >>> 8) & 0xff;
    if ((firstByte & 0xfe) === 0xfc) {
      return 'IPv6 Unique Local Address (fc00::/7)';
    }

    // fe80::/10 — Link-local (first 10 bits = 1111 1110 10xx xxxx)
    if ((groups[0] & 0xffc0) === 0xfe80) {
      return 'IPv6 link-local (fe80::/10)';
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Validate a URL for SSRF risks before making an HTTP request.
 * Throws an Error if the URL is blocked.
 */
export interface SsrfOptions {
  /**
   * Permit private/loopback ranges (never the cloud-metadata range).
   *
   * Each server maps its own env var onto this; the shared module reads none,
   * so one server's escape hatch cannot silently widen another's.
   */
  allowPrivate?: boolean;
}

export async function validateUrl(rawUrl: string, opts: SsrfOptions = {}): Promise<void> {
  const allowPrivate = opts.allowPrivate === true;
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }

  const rawHostname = parsed.hostname;
  const hostname = rawHostname.toLowerCase();

  // Allow explicit localhost (primary use-case)
  if (hostname === 'localhost') return;

  // Strip IPv6 brackets: [::1] → ::1
  const stripped = hostname.replace(/^\[|\]$/g, '');

  // --- IPv6 literal ---
  if (isIPv6(stripped) || stripped.includes(':')) {
    const reason = getBlockedIpv6Range(stripped, allowPrivate);
    if (reason) {
      throw new Error(`SSRF protection: requests to ${reason} are not allowed (${stripped})`);
    }
    return; // Public IPv6 — allowed
  }

  // --- IPv4 literal (standard dotted-quad) ---
  if (isIPv4(stripped)) {
    const blockedRange = getBlockedIpv4Range(stripped, allowPrivate);
    if (blockedRange) {
      throw new Error(
        `SSRF protection: requests to ${blockedRange} are not allowed (${stripped})`
      );
    }
    return; // Public IPv4 literal — allowed
  }

  // --- Non-standard IPv4 encodings (decimal, octal, hex integer) ---
  const decoded = decodeAlternativeIpv4(stripped);
  if (decoded !== null) {
    // It looks like an alternative-encoding IPv4 literal
    const blockedRange = getBlockedIpv4Range(decoded, allowPrivate);
    if (blockedRange) {
      throw new Error(
        `SSRF protection: requests to ${blockedRange} are not allowed ` +
        `(${stripped} decodes to ${decoded})`
      );
    }
    return; // Public alternative-encoded IPv4 — allowed
  }

  // --- Hostname: DNS resolution ---
  let addresses: string[];
  try {
    // Resolve all addresses and check every one
    const { promises: dnsPromises } = await import('dns');
    const results = await dnsPromises.resolve(hostname).catch(async () => {
      // Fall back to single lookup if resolve() fails (e.g. AAAA only)
      const r = await lookup(hostname, { all: true });
      return r.map((a) => a.address);
    });
    addresses = results as string[];
  } catch {
    // DNS resolution failure — fail open (let the request fail at network level)
    return;
  }

  for (const addr of addresses) {
    if (isIPv6(addr) || addr.includes(':')) {
      const reason = getBlockedIpv6Range(addr, allowPrivate);
      if (reason) {
        throw new Error(
          `SSRF protection: hostname "${hostname}" resolves to an address in a blocked range: ${reason}`
        );
      }
    } else if (isIPv4(addr)) {
      const blockedRange = getBlockedIpv4Range(addr, allowPrivate);
      if (blockedRange) {
        throw new Error(
          `SSRF protection: hostname "${hostname}" resolves to ${addr} ` +
          `which is in a blocked range: ${blockedRange}`
        );
      }
    }
  }
}
