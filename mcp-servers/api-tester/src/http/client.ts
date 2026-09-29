// SPDX-License-Identifier: MIT
/**
 * The HTTP engine every tool goes through.
 *
 * Built on node:http/https rather than global fetch because fetch (on Node 18+)
 * exposes none of: a DNS hook (needed to pin the SSRF check to the address
 * actually connected to), TLS options (insecure / custom CA / client certs),
 * an HTTP proxy, or a byte cap enforced while the body streams in.
 *
 * The timeout covers the WHOLE exchange — connect, headers, and body. The old
 * client cleared its timer as soon as headers arrived, so a server that sent
 * headers and then trickled (or never finished) the body hung the tool.
 */

import http, { type IncomingMessage, type OutgoingHttpHeaders, type Agent } from 'http';
import https from 'https';
import tls from 'tls';
import zlib from 'zlib';
import { createHash, randomBytes } from 'crypto';
import { readFile } from 'fs/promises';
import type { Duplex, Readable } from 'stream';
import { guardedLookup, validateTargetUrl } from './ssrf-policy.js';
import type { CookieJar } from './cookies.js';
import { requireAbsolute } from '../util/paths.js';

export type RedirectPolicy = 'follow' | 'manual' | 'error';

export interface TlsOptions {
  /** Skip certificate verification (self-signed dev certs). */
  insecure?: boolean;
  /** PEM CA bundle added to the default roots. */
  caFile?: string;
  /** Client certificate + key for mutual TLS. */
  certFile?: string;
  keyFile?: string;
}

export interface SendOptions {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: Buffer;
  timeoutMs?: number;
  maxResponseBytes?: number;
  redirect?: RedirectPolicy;
  maxRedirects?: number;
  tls?: TlsOptions;
  proxy?: string;
  jar?: CookieJar;
  digest?: { username: string; password: string };
  /** Keep-alive agent (load tests). Ignored when a proxy is used. */
  agent?: Agent;
  decompress?: boolean;
  /**
   * The URL was already validated by the caller (load tests: once per run).
   * The connect-time DNS check in the lookup hook still applies to every socket.
   */
  prevalidated?: boolean;
}

export interface Timings {
  dnsMs?: number;
  connectMs?: number;
  tlsMs?: number;
  ttfbMs?: number;
  totalMs: number;
}

export interface RawResponse {
  status: number;
  statusText: string;
  httpVersion: string;
  headers: Record<string, string>;
  setCookie: string[];
  body: Buffer;
  bodyTruncated: boolean;
  /** Final URL after redirects. */
  url: string;
  redirects: Array<{ status: number; from: string; to: string }>;
  timings: Timings;
}

export const DEFAULT_TIMEOUT_MS = 30_000;
export const DEFAULT_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const USER_AGENT = 'dev-suite-api-tester/3.0';

export class HttpTimeoutError extends Error {
  constructor(ms: number, phase: string) {
    super(`Request timed out after ${ms} ms (${phase})`);
    this.name = 'HttpTimeoutError';
  }
}

// ---------------------------------------------------------------------------
// Headers
// ---------------------------------------------------------------------------

export function getHeader(headers: Record<string, string>, name: string): string | undefined {
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) if (k.toLowerCase() === lower) return v;
  return undefined;
}

export function setHeader(headers: Record<string, string>, name: string, value: string): void {
  deleteHeader(headers, name);
  headers[name] = value;
}

export function setHeaderIfAbsent(headers: Record<string, string>, name: string, value: string): void {
  if (getHeader(headers, name) === undefined) headers[name] = value;
}

export function deleteHeader(headers: Record<string, string>, name: string): void {
  const lower = name.toLowerCase();
  for (const k of Object.keys(headers)) if (k.toLowerCase() === lower) delete headers[k];
}

function flattenHeaders(res: IncomingMessage): { headers: Record<string, string>; setCookie: string[] } {
  const headers: Record<string, string> = {};
  let setCookie: string[] = [];
  for (const [k, v] of Object.entries(res.headers)) {
    if (v === undefined) continue;
    if (k === 'set-cookie') {
      setCookie = Array.isArray(v) ? v : [v];
      headers[k] = setCookie.join('\n');
    } else {
      headers[k] = Array.isArray(v) ? v.join(', ') : v;
    }
  }
  return { headers, setCookie };
}

// ---------------------------------------------------------------------------
// TLS material (cached per path)
// ---------------------------------------------------------------------------

const pemCache = new Map<string, Buffer>();
async function readPem(path: string): Promise<Buffer> {
  const abs = requireAbsolute(path);
  let v = pemCache.get(abs);
  if (!v) {
    v = await readFile(abs);
    pemCache.set(abs, v);
  }
  return v;
}

async function tlsConnectOptions(opts: TlsOptions | undefined): Promise<tls.ConnectionOptions> {
  const out: tls.ConnectionOptions = { rejectUnauthorized: !opts?.insecure };
  if (opts?.caFile) out.ca = [...tls.rootCertificates, (await readPem(opts.caFile)).toString('utf8')];
  if (opts?.certFile) out.cert = await readPem(opts.certFile);
  if (opts?.keyFile) out.key = await readPem(opts.keyFile);
  return out;
}

// ---------------------------------------------------------------------------
// Proxy (HTTP CONNECT tunnel for https targets, absolute-form for http)
// ---------------------------------------------------------------------------

async function openTunnel(proxy: URL, target: URL, deadline: number): Promise<Duplex> {
  const headers: OutgoingHttpHeaders = { host: `${target.hostname}:${target.port || 443}` };
  if (proxy.username) {
    const cred = `${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`;
    headers['proxy-authorization'] = `Basic ${Buffer.from(cred).toString('base64')}`;
  }
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: proxy.hostname,
      port: proxy.port || 80,
      method: 'CONNECT',
      path: `${target.hostname}:${target.port || 443}`,
      headers,
      lookup: guardedLookup as never,
    });
    const timer = setTimeout(() => {
      req.destroy(new HttpTimeoutError(Math.max(0, deadline - Date.now()), 'proxy CONNECT'));
    }, Math.max(1, deadline - Date.now()));
    req.once('connect', (res, socket) => {
      clearTimeout(timer);
      if (res.statusCode !== 200) {
        socket.destroy();
        reject(new Error(`Proxy CONNECT failed: ${res.statusCode} ${res.statusMessage ?? ''}`.trim()));
        return;
      }
      resolve(socket);
    });
    req.once('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Digest auth (RFC 7616, MD5 / SHA-256, qop=auth)
// ---------------------------------------------------------------------------

function parseAuthParams(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /(\w+)=(?:"((?:[^"\\]|\\.)*)"|([^,\s]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(header)) !== null) out[m[1].toLowerCase()] = m[2] ?? m[3];
  return out;
}

export function buildDigestHeader(
  challenge: string,
  creds: { username: string; password: string },
  method: string,
  uri: string,
  cnonce = randomBytes(8).toString('hex'),
  nc = '00000001'
): string | null {
  if (!/^digest\s/i.test(challenge)) return null;
  const p = parseAuthParams(challenge.replace(/^digest\s+/i, ''));
  const algorithm = (p.algorithm ?? 'MD5').toUpperCase();
  const hashName = algorithm.startsWith('SHA-256') ? 'sha256' : algorithm.startsWith('MD5') ? 'md5' : null;
  if (!hashName || !p.nonce) return null;
  const H = (s: string) => createHash(hashName).update(s).digest('hex');
  let ha1 = H(`${creds.username}:${p.realm ?? ''}:${creds.password}`);
  if (algorithm.endsWith('-SESS')) ha1 = H(`${ha1}:${p.nonce}:${cnonce}`);
  const ha2 = H(`${method}:${uri}`);
  const qop = p.qop ? p.qop.split(',').map((s) => s.trim()).find((q) => q === 'auth') : undefined;
  const response = qop ? H(`${ha1}:${p.nonce}:${nc}:${cnonce}:${qop}:${ha2}`) : H(`${ha1}:${p.nonce}:${ha2}`);
  const parts = [
    `username="${creds.username}"`,
    `realm="${p.realm ?? ''}"`,
    `nonce="${p.nonce}"`,
    `uri="${uri}"`,
    `algorithm=${p.algorithm ?? 'MD5'}`,
    `response="${response}"`,
  ];
  if (qop) parts.push(`qop=${qop}`, `nc=${nc}`, `cnonce="${cnonce}"`);
  if (p.opaque) parts.push(`opaque="${p.opaque}"`);
  return `Digest ${parts.join(', ')}`;
}

// ---------------------------------------------------------------------------
// Single exchange
// ---------------------------------------------------------------------------

interface OpenResult {
  res: IncomingMessage;
  timings: Omit<Timings, 'totalMs'>;
  abort: (err?: Error) => void;
}

/**
 * Open one request and resolve once response headers arrive. The caller owns
 * reading the body (buffered by `send`, streamed by the SSE tool).
 */
export async function openRequest(
  url: URL,
  method: string,
  headers: Record<string, string>,
  body: Buffer | undefined,
  opts: { deadline: number; timeoutMs: number; tls?: TlsOptions; proxy?: string; agent?: Agent }
): Promise<OpenResult> {
  const start = Date.now();
  const timings: Omit<Timings, 'totalMs'> = {};
  const isHttps = url.protocol === 'https:';
  const tlsOpts = isHttps ? await tlsConnectOptions(opts.tls) : {};

  const reqHeaders: OutgoingHttpHeaders = { ...headers };
  if (body && getHeader(headers, 'content-length') === undefined) reqHeaders['content-length'] = String(body.length);

  let requestOptions: http.RequestOptions & tls.ConnectionOptions;
  let transport: typeof http | typeof https = isHttps ? https : http;

  if (opts.proxy) {
    const proxy = new URL(opts.proxy);
    if (proxy.protocol !== 'http:') throw new Error('Only http:// proxies are supported');
    if (isHttps) {
      const socket = await openTunnel(proxy, url, opts.deadline);
      requestOptions = {
        method,
        path: url.pathname + url.search,
        headers: reqHeaders,
        agent: false,
        createConnection: () =>
          tls.connect({ ...tlsOpts, socket, servername: url.hostname.replace(/^\[|\]$/g, '') }),
      };
      transport = http; // the TLS socket is supplied directly
    } else {
      if (proxy.username) {
        const cred = `${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`;
        reqHeaders['proxy-authorization'] = `Basic ${Buffer.from(cred).toString('base64')}`;
      }
      reqHeaders.host = url.host;
      requestOptions = {
        host: proxy.hostname,
        port: Number(proxy.port) || 80,
        method,
        path: url.toString(),
        headers: reqHeaders,
        lookup: guardedLookup as never,
        agent: false,
      };
      transport = http;
    }
  } else {
    requestOptions = {
      protocol: url.protocol,
      hostname: url.hostname.replace(/^\[|\]$/g, ''),
      port: url.port ? Number(url.port) : undefined,
      method,
      path: url.pathname + url.search,
      headers: reqHeaders,
      lookup: guardedLookup as never,
      agent: opts.agent,
      ...tlsOpts,
    };
    if (isHttps) requestOptions.servername = url.hostname.replace(/^\[|\]$/g, '');
  }

  return new Promise<OpenResult>((resolve, reject) => {
    let settled = false;
    const req = transport.request(requestOptions);
    const remaining = Math.max(1, opts.deadline - Date.now());
    const timer = setTimeout(() => {
      req.destroy(new HttpTimeoutError(opts.timeoutMs, 'waiting for response headers'));
    }, remaining);

    let detach = () => {};
    req.on('socket', (socket) => {
      // A reused keep-alive socket is already connected: there is nothing to time.
      if (!socket.connecting) return;
      const onLookup = () => (timings.dnsMs = Date.now() - start);
      const onConnect = () => (timings.connectMs = Date.now() - start);
      const onSecure = () => (timings.tlsMs = Date.now() - start);
      socket.once('lookup', onLookup);
      socket.once('connect', onConnect);
      socket.once('secureConnect', onSecure);
      detach = () => {
        socket.off('lookup', onLookup);
        socket.off('connect', onConnect);
        socket.off('secureConnect', onSecure);
      };
    });
    req.once('response', (res) => {
      clearTimeout(timer);
      detach();
      // Consumers attach their own handlers; this keeps a late reset from crashing the process.
      res.on('error', () => undefined);
      timings.ttfbMs = Date.now() - start;
      settled = true;
      resolve({
        res,
        timings,
        abort: (err?: Error) => {
          req.destroy(err);
          res.destroy();
        },
      });
    });
    // `on`, not `once`: aborting after the response must never raise an unhandled 'error'.
    req.on('error', (e) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(e);
      }
    });
    if (body) req.write(body);
    req.end();
  });
}

function decodeStream(res: IncomingMessage, decompress: boolean): Readable {
  if (!decompress) return res;
  const enc = (res.headers['content-encoding'] ?? '').toString().toLowerCase().trim();
  if (enc === 'gzip' || enc === 'x-gzip') return res.pipe(zlib.createGunzip());
  if (enc === 'deflate') return res.pipe(zlib.createInflate());
  if (enc === 'br') return res.pipe(zlib.createBrotliDecompress());
  return res;
}

/** Buffer a response body up to `maxBytes`, within the overall deadline. */
export function readBody(
  open: OpenResult,
  opts: { deadline: number; maxBytes: number; decompress: boolean; totalTimeoutMs: number }
): Promise<{ body: Buffer; truncated: boolean }> {
  return new Promise((resolve, reject) => {
    const stream = decodeStream(open.res, opts.decompress);
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      const err = new HttpTimeoutError(opts.totalTimeoutMs, 'reading response body');
      // Settle first: aborting emits 'aborted', which must not win the race.
      finish(() => reject(err));
      open.abort(err);
    }, Math.max(1, opts.deadline - Date.now()));

    stream.on('data', (chunk: Buffer) => {
      if (done) return;
      const room = opts.maxBytes - size;
      if (chunk.length > room) {
        if (room > 0) chunks.push(chunk.subarray(0, room));
        size = opts.maxBytes;
        finish(() => resolve({ body: Buffer.concat(chunks), truncated: true }));
        open.abort();
        return;
      }
      chunks.push(chunk);
      size += chunk.length;
    });
    stream.once('end', () => finish(() => resolve({ body: Buffer.concat(chunks), truncated: false })));
    stream.once('error', (e) => finish(() => reject(e)));
    open.res.on('error', (e) => finish(() => reject(e)));
    open.res.once('close', () => {
      if (!open.res.complete) finish(() => reject(new Error('Connection closed before the response body completed')));
    });
  });
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Send a request: SSRF-validated, cookie-aware, redirect policy applied per hop
 * (each Location re-validated), digest challenge answered once, body buffered
 * up to `maxResponseBytes` — all inside a single overall timeout.
 */
export async function send(opts: SendOptions): Promise<RawResponse> {
  const start = Date.now();
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const deadline = start + timeoutMs;
  const maxBytes = opts.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
  const policy = opts.redirect ?? 'follow';
  const maxRedirects = opts.maxRedirects ?? 5;
  const decompress = opts.decompress !== false;

  let url = opts.prevalidated ? new URL(opts.url) : await validateTargetUrl(opts.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`Use the websocket tool for ${url.protocol} URLs`);
  }
  let method = opts.method.toUpperCase();
  let body = opts.body;
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  setHeaderIfAbsent(headers, 'User-Agent', USER_AGENT);
  setHeaderIfAbsent(headers, 'Accept', '*/*');
  if (decompress) setHeaderIfAbsent(headers, 'Accept-Encoding', 'gzip, deflate, br');
  const userCookie = getHeader(headers, 'cookie');

  const redirects: RawResponse['redirects'] = [];
  let digestTried = false;

  for (;;) {
    const hopHeaders = { ...headers };
    if (opts.jar) {
      const jarCookie = opts.jar.header(url);
      if (jarCookie) setHeader(hopHeaders, 'Cookie', userCookie ? `${userCookie}; ${jarCookie}` : jarCookie);
    }
    if (Date.now() >= deadline) throw new HttpTimeoutError(timeoutMs, 'before sending');

    const open = await openRequest(url, method, hopHeaders, body, {
      deadline,
      timeoutMs,
      tls: opts.tls,
      proxy: opts.proxy,
      agent: opts.proxy ? undefined : opts.agent,
    });
    const { res } = open;
    const status = res.statusCode ?? 0;
    const { headers: resHeaders, setCookie } = flattenHeaders(res);
    if (opts.jar && setCookie.length) opts.jar.store(url, setCookie);

    // Digest challenge: answer once, with the same method/body.
    if (status === 401 && opts.digest && !digestTried) {
      const challenge = res.headers['www-authenticate'];
      const header = Array.isArray(challenge) ? challenge.find((c) => /^digest/i.test(c)) : challenge;
      if (header && /^digest/i.test(header)) {
        res.resume();
        const auth = buildDigestHeader(header, opts.digest, method, url.pathname + url.search);
        if (auth) {
          digestTried = true;
          setHeader(headers, 'Authorization', auth);
          continue;
        }
      }
    }

    const location = res.headers.location;
    if (REDIRECT_STATUSES.has(status) && location && policy !== 'manual') {
      if (policy === 'error') {
        res.resume();
        throw new Error(`Redirect ${status} to ${location} refused (followRedirects: "error")`);
      }
      if (redirects.length >= maxRedirects) {
        res.resume();
        throw new Error(`Too many redirects (max ${maxRedirects})`);
      }
      res.resume();
      const next = await validateTargetUrl(new URL(location, url).toString());
      redirects.push({ status, from: url.toString(), to: next.toString() });
      if (status === 303 || ((status === 301 || status === 302) && method === 'POST')) {
        if (method !== 'HEAD') method = 'GET';
        body = undefined;
        deleteHeader(headers, 'content-type');
        deleteHeader(headers, 'content-length');
      }
      if (next.origin !== url.origin) {
        // Credentials never follow a redirect to another origin.
        deleteHeader(headers, 'authorization');
        deleteHeader(headers, 'cookie');
        deleteHeader(headers, 'proxy-authorization');
      }
      url = next;
      continue;
    }

    const noBody = method === 'HEAD' || status === 204 || status === 304 || (status >= 100 && status < 200);
    const { body: resBody, truncated } = noBody
      ? (res.resume(), { body: Buffer.alloc(0), truncated: false })
      : await readBody(open, { deadline, maxBytes, decompress, totalTimeoutMs: timeoutMs });

    return {
      status,
      statusText: res.statusMessage ?? '',
      httpVersion: res.httpVersion,
      headers: resHeaders,
      setCookie,
      body: resBody,
      bodyTruncated: truncated,
      url: url.toString(),
      redirects,
      timings: { ...open.timings, totalMs: Date.now() - start },
    };
  }
}
