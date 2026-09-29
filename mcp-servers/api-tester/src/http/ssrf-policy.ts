// SPDX-License-Identifier: MIT
/**
 * api-tester's outbound-network policy, layered on the shared SSRF guard.
 *
 *  - Loopback (127.0.0.0/8, ::1, `localhost`) is ALLOWED by default. This is a
 *    local-development tool; the old policy allowed only the literal hostname
 *    `localhost`, so `http://127.0.0.1:8080` — what most dev servers print — was
 *    refused.
 *  - Other private ranges (10/8, 172.16/12, 192.168/16, fc00::/7, fe80::/10) are
 *    blocked unless `API_TESTER_ALLOW_PRIVATE=1|true` (LAN hosts, Docker bridge
 *    networks, a k8s cluster reached over a VPN).
 *  - 169.254.0.0/16 (cloud metadata) is ALWAYS blocked, env flag or not.
 *
 * The check runs twice: once on the URL before connecting, and again inside the
 * socket's DNS `lookup` hook on the address actually connected to. The second
 * check is what closes DNS rebinding: a hostname that resolved to a public
 * address during validation cannot then resolve to 169.254.169.254 at connect.
 */

import { lookup as dnsLookup, type LookupAddress } from 'dns';
import { isIP } from 'net';
import { validateUrl as validateUrlShared } from '@dev-suite/shared';
import { envFlag } from '../util/limits.js';

export function privateNetworksAllowed(): boolean {
  return envFlag(process.env.API_TESTER_ALLOW_PRIVATE);
}

const HINT =
  ' Private networks are blocked by default; set API_TESTER_ALLOW_PRIVATE=1 to allow them ' +
  '(the cloud-metadata range 169.254.0.0/16 is always blocked).';

export function isLoopbackAddress(addr: string): boolean {
  const a = addr.replace(/^\[|\]$/g, '').toLowerCase();
  if (isIP(a) === 4) return a.startsWith('127.');
  if (a === '::1' || a === '0:0:0:0:0:0:0:1') return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a);
  if (mapped) return mapped[1].startsWith('127.');
  return false;
}

function withHint(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e);
  if (/metadata/i.test(msg)) return new Error(msg);
  return new Error(msg + HINT);
}

/** Validate a URL before any connection is attempted. */
export async function validateTargetUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }
  const httpProto =
    url.protocol === 'http:' || url.protocol === 'ws:'
      ? 'http:'
      : url.protocol === 'https:' || url.protocol === 'wss:'
        ? 'https:'
        : null;
  if (!httpProto) throw new Error(`Unsupported protocol "${url.protocol}" (use http, https, ws or wss)`);

  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(host) && isLoopbackAddress(host)) return url;

  const probe = new URL(url.toString());
  probe.protocol = httpProto;
  try {
    await validateUrlShared(probe.toString(), { allowPrivate: privateNetworksAllowed() });
  } catch (e) {
    throw withHint(e);
  }
  return url;
}

/** Check one resolved address (used by the connect-time lookup hook). */
export async function assertAddressAllowed(address: string, hostname: string): Promise<void> {
  if (isLoopbackAddress(address)) return;
  const literal = isIP(address) === 6 ? `[${address}]` : address;
  try {
    await validateUrlShared(`http://${literal}/`, { allowPrivate: privateNetworksAllowed() });
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    throw withHint(new Error(`SSRF protection: "${hostname}" resolved to ${address} at connect time — ${reason}`));
  }
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/**
 * Drop-in `lookup` for http.request / net.connect / ws that validates every
 * resolved address before the socket connects to it.
 */
export function guardedLookup(hostname: string, options: unknown, callback?: unknown): void {
  const cb = (typeof options === 'function' ? options : callback) as LookupCallback;
  const opts = (typeof options === 'object' && options !== null ? options : {}) as { all?: boolean; family?: number };
  dnsLookup(hostname, { family: opts.family as 0 | 4 | 6 | undefined, all: true }, (err, addresses) => {
    if (err) return cb(err, opts.all ? [] : '');
    const list = addresses as LookupAddress[];
    if (!list || list.length === 0) {
      return cb(Object.assign(new Error(`DNS lookup returned no addresses for ${hostname}`), { code: 'ENOTFOUND' }), '');
    }
    Promise.all(list.map((a) => assertAddressAllowed(a.address, hostname)))
      .then(() => {
        if (opts.all) cb(null, list);
        else cb(null, list[0].address, list[0].family);
      })
      .catch((e: Error) => cb(Object.assign(e, { code: 'ESSRF' }), opts.all ? [] : ''));
  });
}
