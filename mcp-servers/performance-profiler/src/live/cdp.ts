// SPDX-License-Identifier: MIT
/**
 * Minimal Chrome DevTools Protocol client, used for:
 *  - Node processes started with --inspect (Profiler / HeapProfiler domains);
 *  - headless Chrome (Web Vitals fallback when Lighthouse is not installed).
 *
 * Inspector endpoints are only ever contacted on loopback: the inspector
 * protocol grants code execution in the target, so this is not an SSRF
 * surface we open to arbitrary hosts.
 */

import WebSocket from 'ws';

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export function assertLoopback(host: string): void {
  if (!LOOPBACK.has(host.toLowerCase())) {
    throw new Error(`Inspector host must be loopback (127.0.0.1, localhost, ::1), got "${host}"`);
  }
}

export interface InspectorTarget {
  id: string;
  title: string;
  type: string;
  url: string;
  webSocketDebuggerUrl: string;
}

/** GET http://host:port/json/list from a Node inspector or Chrome. */
export async function listInspectorTargets(host: string, port: number, timeoutMs = 3000): Promise<InspectorTarget[]> {
  assertLoopback(host);
  const h = host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`http://${h}:${port}/json/list`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as InspectorTarget[];
  } catch (e) {
    throw new Error(
      `No inspector reachable at ${host}:${port} (${e instanceof Error ? e.message : e}). ` +
        'Start the target with --inspect (or --inspect=PORT), or pass pid to enable it.'
    );
  } finally {
    clearTimeout(t);
  }
}

type Listener = (params: any) => void;

export class CdpClient {
  private nextId = 1;
  private readonly pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  private readonly listeners = new Map<string, Set<Listener>>();
  private closed = false;

  private constructor(private readonly ws: WebSocket) {
    ws.on('message', (data) => {
      let msg: any;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (typeof msg.id === 'number') {
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        clearTimeout(p.timer);
        if (msg.error) p.reject(new Error(`CDP ${msg.error.message ?? 'error'}${msg.error.data ? `: ${msg.error.data}` : ''}`));
        else p.resolve(msg.result ?? {});
      } else if (typeof msg.method === 'string') {
        const key = msg.sessionId ? `${msg.sessionId}:${msg.method}` : msg.method;
        for (const l of this.listeners.get(key) ?? []) l(msg.params);
        if (msg.sessionId) for (const l of this.listeners.get(msg.method) ?? []) l(msg.params);
      }
    });
    ws.on('close', () => this.failAll(new Error('Inspector connection closed')));
    ws.on('error', (e) => this.failAll(e instanceof Error ? e : new Error(String(e))));
  }

  static connect(wsUrl: string, timeoutMs = 5000): Promise<CdpClient> {
    const u = new URL(wsUrl);
    assertLoopback(u.hostname.replace(/^\[|\]$/g, '') === '::1' ? '::1' : u.hostname);
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl, { perMessageDeflate: false, maxPayload: 512 * 1024 * 1024 });
      const t = setTimeout(() => {
        ws.terminate();
        reject(new Error(`Timed out connecting to ${wsUrl}`));
      }, timeoutMs);
      ws.once('open', () => {
        clearTimeout(t);
        resolve(new CdpClient(ws));
      });
      ws.once('error', (e) => {
        clearTimeout(t);
        reject(e);
      });
    });
  }

  private failAll(e: Error): void {
    this.closed = true;
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(e);
      this.pending.delete(id);
    }
  }

  send<T = any>(method: string, params: Record<string, unknown> = {}, timeoutMs = 30_000, sessionId?: string): Promise<T> {
    if (this.closed) return Promise.reject(new Error('Inspector connection closed'));
    const id = this.nextId++;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP ${method} timed out after ${timeoutMs} ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  on(event: string, l: Listener, sessionId?: string): () => void {
    const key = sessionId ? `${sessionId}:${event}` : event;
    let set = this.listeners.get(key);
    if (!set) {
      set = new Set();
      this.listeners.set(key, set);
    }
    set.add(l);
    return () => set!.delete(l);
  }

  close(): void {
    this.closed = true;
    try {
      this.ws.close();
    } catch {
      // ignore
    }
  }
}
