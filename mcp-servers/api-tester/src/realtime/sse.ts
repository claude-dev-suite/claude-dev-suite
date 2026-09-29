// SPDX-License-Identifier: MIT
/**
 * Server-Sent Events: open the stream, parse events per the WHATWG spec
 * (event/data/id/retry fields, multi-line data, comments), stop after
 * `durationMs` or `maxEvents`, return what arrived.
 */

import { openRequest } from '../http/client.js';
import { prepareRequest, type RequestInput, type VarContext } from '../http/executor.js';
import { maskHeaders } from '../util/redact.js';
import { getSessionJar } from '../http/cookies.js';

export interface SseEvent {
  event: string;
  data: string;
  id?: string;
  retry?: number;
  json?: unknown;
  at: string;
}

/** Incremental SSE parser. Feed it text chunks; it emits complete events. */
export class SseParser {
  private buf = '';
  private data: string[] = [];
  private event = '';
  private id: string | undefined;
  private retry: number | undefined;
  lastEventId: string | undefined;

  constructor(private readonly onEvent: (e: SseEvent) => void) {}

  push(chunk: string): void {
    this.buf += chunk;
    for (;;) {
      const m = /\r\n|\r|\n/.exec(this.buf);
      if (!m) break;
      // A lone \r at the very end might be the first half of \r\n.
      if (m[0] === '\r' && m.index === this.buf.length - 1) break;
      const line = this.buf.slice(0, m.index);
      this.buf = this.buf.slice(m.index + m[0].length);
      this.line(line);
    }
  }

  private line(line: string): void {
    if (line === '') {
      this.dispatch();
      return;
    }
    if (line.startsWith(':')) return; // comment / keep-alive
    const idx = line.indexOf(':');
    const field = idx < 0 ? line : line.slice(0, idx);
    let value = idx < 0 ? '' : line.slice(idx + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    switch (field) {
      case 'data':
        this.data.push(value);
        break;
      case 'event':
        this.event = value;
        break;
      case 'id':
        if (!value.includes('\0')) this.id = value;
        break;
      case 'retry':
        if (/^\d+$/.test(value)) this.retry = Number(value);
        break;
    }
  }

  private dispatch(): void {
    if (this.id !== undefined) this.lastEventId = this.id;
    if (this.data.length === 0) {
      this.event = '';
      return;
    }
    const data = this.data.join('\n');
    const ev: SseEvent = { event: this.event || 'message', data, at: new Date().toISOString() };
    if (this.lastEventId !== undefined) ev.id = this.lastEventId;
    if (this.retry !== undefined) ev.retry = this.retry;
    if (/^\s*[[{]/.test(data)) {
      try {
        ev.json = JSON.parse(data);
      } catch {
        /* not JSON */
      }
    }
    this.data = [];
    this.event = '';
    this.retry = undefined;
    this.onEvent(ev);
  }
}

export async function listenSse(
  input: RequestInput,
  ctx: VarContext,
  opts: { durationMs: number; maxEvents: number; lastEventId?: string; maxDataChars: number; eventFilter?: string[] }
): Promise<Record<string, unknown>> {
  const headers = { ...(input.headers ?? {}) };
  if (!Object.keys(headers).some((h) => h.toLowerCase() === 'accept')) headers.Accept = 'text/event-stream';
  if (opts.lastEventId) headers['Last-Event-ID'] = opts.lastEventId;
  const prepared = await prepareRequest({ ...input, headers }, ctx);
  const url = new URL(prepared.url);
  if (input.session) {
    const cookie = getSessionJar(input.session).header(url);
    if (cookie) prepared.headers.Cookie = cookie;
  }

  const started = Date.now();
  const connectDeadline = started + Math.min(prepared.timeoutMs, 30_000);
  const open = await openRequest(url, prepared.method, prepared.headers, prepared.body, {
    deadline: connectDeadline,
    timeoutMs: Math.min(prepared.timeoutMs, 30_000),
    tls: prepared.tls,
    proxy: prepared.proxy,
  });
  const { res } = open;
  const status = res.statusCode ?? 0;
  const contentType = String(res.headers['content-type'] ?? '');
  const resHeaders = Object.fromEntries(Object.entries(res.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : String(v ?? '')]));

  if (status !== 200 || !/text\/event-stream/i.test(contentType)) {
    // Not a stream: return a bounded preview of what came back instead.
    const chunks: Buffer[] = [];
    let size = 0;
    await new Promise<void>((resolve) => {
      const t = setTimeout(() => {
        open.abort();
        resolve();
      }, 5000);
      res.on('data', (c: Buffer) => {
        if (size < 4096) chunks.push(c);
        size += c.length;
        if (size > 4096) {
          clearTimeout(t);
          open.abort();
          resolve();
        }
      });
      res.on('end', () => {
        clearTimeout(t);
        resolve();
      });
      res.on('error', () => {
        clearTimeout(t);
        resolve();
      });
    });
    return ctx.redactor.scrub({
      url: prepared.url,
      status,
      headers: maskHeaders(resHeaders),
      error: status !== 200 ? `Server answered HTTP ${status}, not an event stream` : `Content-Type is "${contentType}", not text/event-stream`,
      bodyPreview: Buffer.concat(chunks).toString('utf8').slice(0, 2000),
    });
  }

  const events: SseEvent[] = [];
  let totalEvents = 0;
  let endedBy: 'duration' | 'maxEvents' | 'server-closed' | 'error' = 'duration';
  let streamError: string | undefined;
  const parser = new SseParser((e) => {
    if (opts.eventFilter?.length && !opts.eventFilter.includes(e.event)) return;
    totalEvents++;
    if (events.length < opts.maxEvents) {
      if (e.data.length > opts.maxDataChars) {
        e.data = e.data.slice(0, opts.maxDataChars);
        delete e.json;
        (e as SseEvent & { truncated?: boolean }).truncated = true;
      }
      events.push(e);
    }
  });

  await new Promise<void>((resolve) => {
    let done = false;
    const finish = (why: typeof endedBy) => {
      if (done) return;
      done = true;
      endedBy = why;
      clearTimeout(timer);
      open.abort();
      resolve();
    };
    const timer = setTimeout(() => finish('duration'), opts.durationMs);
    res.setEncoding('utf8');
    res.on('data', (chunk: string) => {
      parser.push(chunk);
      if (totalEvents >= opts.maxEvents) finish('maxEvents');
    });
    res.on('end', () => finish('server-closed'));
    res.on('error', (e) => {
      if (!done) streamError = e.message;
      finish('error');
    });
  });

  return ctx.redactor.scrub({
    url: prepared.url,
    status,
    headers: maskHeaders(resHeaders),
    endedBy,
    durationMs: Date.now() - started,
    events,
    eventCount: totalEvents,
    truncated: totalEvents > events.length,
    lastEventId: parser.lastEventId,
    ...(streamError ? { error: streamError } : {}),
  });
}
