// SPDX-License-Identifier: MIT
/**
 * WebSocket client sessions (pure-JS `ws`; its optional native accelerators
 * bufferutil/utf-8-validate are allowed externals and simply absent at runtime).
 *
 * Connections persist across tool calls (connect → send → receive → close) or
 * run in one shot (exchange). Every connection is SSRF-checked on the URL and
 * again at DNS resolution, buffered (bounded), and closed after 10 minutes idle.
 */

import WebSocket from 'ws';
import { randomUUID } from 'crypto';
import { readFile } from 'fs/promises';
import { guardedLookup, validateTargetUrl } from '../http/ssrf-policy.js';
import { applyAuth, type AuthSpec } from '../http/auth.js';
import { getSessionJar } from '../http/cookies.js';
import { substituteDeep } from '../vars/substitute.js';
import type { VarContext } from '../http/executor.js';
import { requireAbsolute } from '../util/paths.js';

export interface WsMessage {
  seq: number;
  direction: 'in' | 'out';
  at: string;
  data: string;
  binary: boolean;
  bytes: number;
  truncated?: boolean;
  json?: unknown;
}

interface Conn {
  id: string;
  url: string;
  ws: WebSocket;
  messages: WsMessage[];
  cursor: number;
  seq: number;
  openedAt: string;
  lastActivity: number;
  closed?: { code: number; reason: string; at: string };
  error?: string;
  dropped: number;
  ctx: VarContext;
}

const MAX_CONNECTIONS = 10;
const MAX_BUFFERED = 1000;
const STORE_CHARS = 64 * 1024;
const IDLE_MS = 10 * 60_000;
const conns = new Map<string, Conn>();

const sweeper = setInterval(() => {
  const now = Date.now();
  for (const c of conns.values()) {
    if (now - c.lastActivity > IDLE_MS) {
      try {
        c.ws.terminate();
      } catch {
        /* ignore */
      }
      conns.delete(c.id);
    }
  }
}, 60_000);
sweeper.unref();

function record(c: Conn, direction: 'in' | 'out', data: WebSocket.RawData | string, isBinary: boolean): void {
  const buf = typeof data === 'string' ? Buffer.from(data) : Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);
  let text = isBinary ? buf.toString('base64') : buf.toString('utf8');
  let truncated = false;
  if (text.length > STORE_CHARS) {
    text = text.slice(0, STORE_CHARS);
    truncated = true;
  }
  const msg: WsMessage = { seq: ++c.seq, direction, at: new Date().toISOString(), data: text, binary: isBinary, bytes: buf.length };
  if (truncated) msg.truncated = true;
  if (!isBinary && !truncated && /^\s*[[{]/.test(text)) {
    try {
      msg.json = JSON.parse(text);
    } catch {
      /* not JSON */
    }
  }
  c.messages.push(msg);
  if (c.messages.length > MAX_BUFFERED) {
    const drop = c.messages.length - MAX_BUFFERED;
    c.messages.splice(0, drop);
    c.cursor = Math.max(0, c.cursor - drop);
    c.dropped += drop;
  }
  c.lastActivity = Date.now();
}

export interface ConnectOptions {
  url: string;
  headers?: Record<string, string>;
  protocols?: string[];
  auth?: AuthSpec;
  session?: string;
  insecure?: boolean;
  caFile?: string;
  timeout?: number;
}

export async function wsConnect(opts: ConnectOptions, ctx: VarContext): Promise<Conn> {
  if (conns.size >= MAX_CONNECTIONS) throw new Error(`Too many open WebSocket connections (max ${MAX_CONNECTIONS}); close some first`);
  const sub = substituteDeep({ url: opts.url, headers: opts.headers, auth: opts.auth, protocols: opts.protocols }, ctx.vars);
  if (sub.missing.length) throw new Error(`Unresolved variables: ${sub.missing.map((m) => `{{${m}}}`).join(', ')}`);
  let rawUrl = sub.value.url;
  if (/^https?:/i.test(rawUrl)) rawUrl = rawUrl.replace(/^http/i, 'ws');
  const url = await validateTargetUrl(rawUrl);
  if (url.protocol !== 'ws:' && url.protocol !== 'wss:') throw new Error('WebSocket URL must use ws:// or wss://');

  const headers: Record<string, string> = { ...(sub.value.headers ?? {}) };
  const query = new URLSearchParams(url.search);
  await applyAuth(sub.value.auth, headers, query, ctx.redactor, { timeoutMs: opts.timeout });
  url.search = query.toString();
  if (opts.session) {
    const cookie = getSessionJar(opts.session).header(new URL(url.toString().replace(/^ws/, 'http')));
    if (cookie) headers.Cookie = cookie;
  }

  const ws = new WebSocket(url.toString(), sub.value.protocols ?? [], {
    headers,
    handshakeTimeout: opts.timeout ?? 10_000,
    followRedirects: false,
    maxPayload: 16 * 1024 * 1024,
    lookup: guardedLookup as never,
    rejectUnauthorized: !opts.insecure,
    ...(opts.caFile ? { ca: await readFile(requireAbsolute(opts.caFile)) } : {}),
  });

  const conn: Conn = {
    id: randomUUID().slice(0, 8),
    url: ctx.redactor.scrubString(url.toString()),
    ws,
    messages: [],
    cursor: 0,
    seq: 0,
    openedAt: new Date().toISOString(),
    lastActivity: Date.now(),
    dropped: 0,
    ctx,
  };

  // Attach before the handshake completes: a server may send in the same tick as 'open'.
  ws.on('message', (data, isBinary) => record(conn, 'in', data, isBinary));
  ws.on('close', (code, reason) => {
    conn.closed = { code, reason: reason.toString(), at: new Date().toISOString() };
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (e: Error) => reject(new Error(`WebSocket connection failed: ${e.message}`));
    ws.once('unexpected-response', (_req, res) => {
      reject(new Error(`WebSocket handshake rejected: HTTP ${res.statusCode} ${res.statusMessage ?? ''}`.trim()));
      res.resume();
    });
    ws.once('error', onError);
    ws.once('open', () => {
      ws.off('error', onError);
      resolve();
    });
  });

  ws.on('error', (e) => {
    conn.error = e.message;
  });
  conns.set(conn.id, conn);
  return conn;
}

function getConn(id: string): Conn {
  const c = conns.get(id);
  if (!c) throw new Error(`No WebSocket connection "${id}" (it may have been closed or idled out)`);
  return c;
}

export function wsSend(id: string, message: unknown, binaryBase64?: string): WsMessage {
  const c = getConn(id);
  if (c.ws.readyState !== WebSocket.OPEN) throw new Error(`Connection ${id} is not open (state ${c.ws.readyState})`);
  if (binaryBase64 !== undefined) {
    const buf = Buffer.from(binaryBase64, 'base64');
    c.ws.send(buf, { binary: true });
    record(c, 'out', buf, true);
  } else {
    const sub = substituteDeep(message, c.ctx.vars);
    if (sub.missing.length) throw new Error(`Unresolved variables: ${sub.missing.map((m) => `{{${m}}}`).join(', ')}`);
    const text = typeof sub.value === 'string' ? sub.value : JSON.stringify(sub.value);
    c.ws.send(text);
    record(c, 'out', text, false);
  }
  return c.messages[c.messages.length - 1];
}

/** Wait up to waitMs (or until `untilCount` new inbound messages / a match / close), then return new messages. */
export async function wsReceive(
  id: string,
  opts: { waitMs?: number; untilCount?: number; untilMatch?: string; maxMessageChars?: number; limit?: number }
): Promise<Record<string, unknown>> {
  const c = getConn(id);
  const waitMs = Math.min(opts.waitMs ?? 2000, 60_000);
  const re = opts.untilMatch ? new RegExp(opts.untilMatch) : undefined;
  const deadline = Date.now() + waitMs;
  const inboundSince = () => c.messages.slice(c.cursor).filter((m) => m.direction === 'in');
  while (Date.now() < deadline && !c.closed) {
    const fresh = inboundSince();
    if (opts.untilCount && fresh.length >= opts.untilCount) break;
    if (re && fresh.some((m) => re.test(m.data))) break;
    await new Promise((r) => setTimeout(r, 25));
  }
  const all = c.messages.slice(c.cursor);
  const limit = opts.limit ?? 200;
  const page = all.slice(0, limit);
  c.cursor += page.length;
  const maxChars = opts.maxMessageChars ?? 2000;
  return c.ctx.redactor.scrub({
    id,
    state: c.closed ? 'closed' : ['connecting', 'open', 'closing', 'closed'][c.ws.readyState],
    messages: page.map((m) => {
      const clipped = m.data.length > maxChars;
      return { ...m, data: clipped ? m.data.slice(0, maxChars) : m.data, ...(clipped ? { truncated: true, json: undefined } : {}) };
    }),
    truncated: all.length > page.length,
    pending: all.length - page.length,
    ...(c.dropped ? { droppedOldMessages: c.dropped } : {}),
    ...(c.closed ? { closed: c.closed } : {}),
    ...(c.error ? { error: c.error } : {}),
  });
}

export async function wsClose(id: string, code = 1000, reason = ''): Promise<Record<string, unknown>> {
  const c = getConn(id);
  if (!c.closed) {
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        c.ws.terminate();
        resolve();
      }, 3000);
      c.ws.once('close', () => {
        clearTimeout(t);
        resolve();
      });
      try {
        c.ws.close(code, reason);
      } catch {
        c.ws.terminate();
        clearTimeout(t);
        resolve();
      }
    });
  }
  conns.delete(id);
  return { id, closed: c.closed ?? { code, reason, at: new Date().toISOString() }, messagesExchanged: c.seq };
}

export function wsList(): Array<Record<string, unknown>> {
  return [...conns.values()].map((c) => ({
    id: c.id,
    url: c.url,
    state: c.closed ? 'closed' : ['connecting', 'open', 'closing', 'closed'][c.ws.readyState],
    openedAt: c.openedAt,
    unread: c.messages.length - c.cursor,
    total: c.seq,
  }));
}

export async function closeAllWebSockets(): Promise<void> {
  for (const c of conns.values()) {
    try {
      c.ws.terminate();
    } catch {
      /* ignore */
    }
  }
  conns.clear();
}
