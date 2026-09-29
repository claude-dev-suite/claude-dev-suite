// SPDX-License-Identifier: MIT
/**
 * Mock server from an OpenAPI 3.x / Swagger 2.0 spec.
 *
 *  - Binds 127.0.0.1 by default (the old server listened on every interface).
 *  - A port conflict is an explicit error, or — only when `portFallback` is set,
 *    or no port was requested — the next free port within 20 tries. The old
 *    EADDRINUSE handler incremented and retried without bound.
 *  - Validates requests (path/query/header params, required body, content type,
 *    body schema, credentials) and answers 400/401/415 with the reasons.
 *  - Responses come from examples, else from the schema (allOf/oneOf aware,
 *    cycle-safe). `Prefer: code=404, example=name` or `?__code=404`/`?_status=404`
 *    choose the response; `delay`/`delayMax` add latency.
 *  - Keeps a bounded request log per server.
 */

import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'http';
import type { AddressInfo } from 'net';
import {
  loadModel,
  findOperation,
  serverBasePaths,
  pickMedia,
  generateSample,
  validateAgainst,
  operationLabel,
  type ApiModel,
  type ApiOperation,
  type MediaDef,
} from '../spec/index.js';
import { authRequirements } from '../spec/request-builder.js';

export interface MockOptions {
  port?: number;
  host?: string;
  portFallback?: boolean;
  delay?: number;
  delayMax?: number;
  validateRequests?: boolean;
  validateAuth?: boolean;
  cors?: boolean;
}

interface LogEntry {
  time: string;
  method: string;
  path: string;
  status: number;
  operation?: string;
  errors?: string[];
  durationMs: number;
}

interface MockInstance {
  server: Server;
  port: number;
  host: string;
  specPath: string;
  model: ApiModel;
  options: MockOptions;
  log: LogEntry[];
  requests: number;
  startedAt: string;
}

const MAX_LOG = 500;
const MAX_BODY_BYTES = 10 * 1024 * 1024;
const DEFAULT_PORT = 4010;
const FALLBACK_TRIES = 20;
const activeServers = new Map<number, MockInstance>();

// ---------------------------------------------------------------------------
// Request parsing & validation
// ---------------------------------------------------------------------------

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request body too large'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function mimeOf(ct: string | undefined): string {
  return (ct ?? '').split(';')[0].trim().toLowerCase();
}

function paramValue(raw: string | string[] | undefined, schema: Record<string, unknown> | undefined): unknown {
  if (raw === undefined) return undefined;
  const t = schema?.type;
  if (t === 'array') return Array.isArray(raw) ? raw : raw.split(',');
  return Array.isArray(raw) ? raw[raw.length - 1] : raw;
}

function validateRequest(
  model: ApiModel,
  op: ApiOperation,
  pathParams: Record<string, string>,
  url: URL,
  req: IncomingMessage,
  body: Buffer,
  checkAuth: boolean
): { status: number; errors: string[] } | undefined {
  const errors: string[] = [];

  if (checkAuth) {
    const reqs = authRequirements(model, op);
    if (reqs.length) {
      const cookies = String(req.headers.cookie ?? '');
      const missing = reqs.filter((r) => {
        if (r.kind === 'bearer' || r.kind === 'basic' || r.kind === 'digest') {
          const h = String(req.headers.authorization ?? '');
          const scheme = r.kind === 'bearer' ? /^bearer\s+\S+/i : r.kind === 'basic' ? /^basic\s+\S+/i : /^digest\s+/i;
          return !scheme.test(h);
        }
        if (r.kind === 'apiKey' && r.name) {
          if (r.in === 'query') return !url.searchParams.has(r.name);
          if (r.in === 'cookie') return !new RegExp(`(?:^|;\\s*)${r.name}=`).test(cookies);
          return req.headers[r.name.toLowerCase()] === undefined;
        }
        return false;
      });
      if (missing.length) {
        return { status: 401, errors: missing.map((m) => `Missing credentials for security scheme "${m.scheme}" (${m.kind}${m.name ? ` ${m.in}:${m.name}` : ''})`) };
      }
    }
  }

  for (const p of op.parameters) {
    let raw: string | string[] | undefined;
    if (p.in === 'path') raw = pathParams[p.name];
    else if (p.in === 'query') {
      const all = url.searchParams.getAll(p.name);
      raw = all.length === 0 ? undefined : all.length === 1 ? all[0] : all;
    } else if (p.in === 'header') raw = req.headers[p.name.toLowerCase()] as string | undefined;
    else if (p.in === 'cookie') {
      const m = new RegExp(`(?:^|;\\s*)${p.name}=([^;]*)`).exec(String(req.headers.cookie ?? ''));
      raw = m?.[1];
    }
    if (raw === undefined) {
      if (p.required) errors.push(`Missing required ${p.in} parameter "${p.name}"`);
      continue;
    }
    if (p.schema) {
      const v = validateAgainst(p.schema, paramValue(raw, p.schema), model.dialect, { mode: 'request', coerce: true });
      if (!v.valid && !v.schemaError) errors.push(...v.errors.map((e) => `${p.in} parameter "${p.name}"${e.path !== '/' ? e.path : ''} ${e.message}`));
    }
  }

  if (op.requestBody) {
    const ct = mimeOf(req.headers['content-type']);
    if (body.length === 0) {
      if (op.requestBody.required) errors.push('Request body is required');
    } else {
      const entries = Object.entries(op.requestBody.content);
      const hit = entries.find(([m]) => {
        const d = mimeOf(m);
        return d === ct || d === '*/*' || (d.endsWith('/*') && ct.startsWith(d.slice(0, -1)));
      });
      if (!hit && entries.length) {
        return { status: 415, errors: [`Content-Type "${ct || '(none)'}" not accepted (expected ${entries.map(([m]) => m).join(', ')})`] };
      }
      if (hit?.[1].schema) {
        let data: unknown;
        let parsed = true;
        if (/json/.test(ct)) {
          try {
            data = JSON.parse(body.toString('utf8'));
          } catch (e) {
            errors.push(`Body is not valid JSON: ${(e as Error).message}`);
            parsed = false;
          }
        } else if (ct === 'application/x-www-form-urlencoded') {
          data = Object.fromEntries(new URLSearchParams(body.toString('utf8')).entries());
        } else if (ct === 'multipart/form-data') {
          const parts = parseMultipart(body, String(req.headers['content-type'] ?? ''));
          if (parts) data = parts;
          else {
            errors.push('Malformed multipart body (missing or wrong boundary)');
            parsed = false;
          }
        } else parsed = false; // binary/text: content-type check only
        if (parsed) {
          const v = validateAgainst(hit[1].schema, data, model.dialect, { mode: 'request', coerce: ct !== 'application/json' && !/json/.test(ct) });
          if (!v.valid && !v.schemaError) errors.push(...v.errors.map((e) => `body${e.path === '/' ? '' : e.path} ${e.message}`));
        }
      }
    }
  }
  return errors.length ? { status: 400, errors } : undefined;
}

/** Field names → values of a multipart body (file parts become their file name). */
export function parseMultipart(body: Buffer, contentType: string): Record<string, string> | undefined {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  const boundary = m?.[1] ?? m?.[2]?.trim();
  if (!boundary) return undefined;
  const text = body.toString('latin1');
  const delimiter = `--${boundary}`;
  if (!text.includes(delimiter)) return undefined;
  const out: Record<string, string> = {};
  for (const raw of text.split(delimiter).slice(1)) {
    if (raw.startsWith('--')) break;
    const sep = raw.indexOf('\r\n\r\n');
    if (sep < 0) continue;
    const head = raw.slice(0, sep);
    const name = /name="([^"]*)"/i.exec(head)?.[1];
    if (name === undefined) continue;
    const filename = /filename="([^"]*)"/i.exec(head)?.[1];
    const value = raw.slice(sep + 4).replace(/\r\n$/, '');
    out[name] = filename !== undefined ? filename || 'file' : Buffer.from(value, 'latin1').toString('utf8');
  }
  return out;
}

// ---------------------------------------------------------------------------
// Response selection
// ---------------------------------------------------------------------------

function parsePrefer(h: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (h ?? '').split(/[,;]/)) {
    const [k, v] = part.split('=').map((s) => s?.trim());
    if (k && v !== undefined) out[k.toLowerCase()] = v.replace(/^"|"$/g, '');
  }
  return out;
}

function chooseResponse(op: ApiOperation, requested?: number): { status: number; key: string } | { error: string } {
  const keys = Object.keys(op.responses);
  if (requested !== undefined) {
    if (op.responses[String(requested)]) return { status: requested, key: String(requested) };
    const range = keys.find((k) => k.toUpperCase() === `${String(requested)[0]}XX`);
    if (range) return { status: requested, key: range };
    if (op.responses.default) return { status: requested, key: 'default' };
    return { error: `Status ${requested} is not documented for ${operationLabel(op)} (documented: ${keys.join(', ') || 'none'})` };
  }
  const success = keys.filter((k) => /^2\d\d$/.test(k)).sort();
  if (success.length) return { status: Number(success[0]), key: success[0] };
  const range2 = keys.find((k) => k.toUpperCase() === '2XX');
  if (range2) return { status: 200, key: range2 };
  if (op.responses.default) return { status: 200, key: 'default' };
  const first = keys.find((k) => /^\d{3}$/.test(k));
  return first ? { status: Number(first), key: first } : { status: 200, key: '' };
}

function exampleFor(media: MediaDef, exampleName?: string): unknown {
  if (exampleName && media.examples && exampleName in media.examples) return media.examples[exampleName];
  if (media.example !== undefined) return media.example;
  if (media.examples) {
    const first = Object.values(media.examples)[0];
    if (first !== undefined) return first;
  }
  return generateSample(media.schema, { mode: 'response' });
}

function negotiate(content: Record<string, MediaDef>, accept: string | undefined): [string, MediaDef] | undefined {
  const accepted = (accept ?? '*/*').split(',').map((a) => mimeOf(a));
  const entries = Object.entries(content);
  for (const a of accepted) {
    if (a === '*/*' || !a) break;
    const hit = entries.find(([m]) => mimeOf(m) === a || (a.endsWith('/*') && mimeOf(m).startsWith(a.slice(0, -1))));
    if (hit) return hit;
  }
  return pickMedia(content);
}

function serialise(mime: string, value: unknown): string {
  if (/json/i.test(mime)) return JSON.stringify(value);
  if (typeof value === 'string') return value;
  if (mime === 'application/x-www-form-urlencoded' && value && typeof value === 'object') {
    return new URLSearchParams(value as Record<string, string>).toString();
  }
  return JSON.stringify(value);
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

function corsHeaders(req: IncomingMessage): Record<string, string> {
  const origin = String(req.headers.origin ?? '');
  const allowed = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin) ? origin : 'http://localhost:3000';
  return { 'Access-Control-Allow-Origin': allowed, Vary: 'Origin' };
}

async function handle(inst: MockInstance, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const started = Date.now();
  const url = new URL(req.url || '/', 'http://mock.local');
  const method = (req.method || 'GET').toUpperCase();
  const { model, options } = inst;
  const entry: LogEntry = { time: new Date().toISOString(), method, path: url.pathname + url.search, status: 0, durationMs: 0 };
  const cors = options.cors !== false ? corsHeaders(req) : {};

  const send = (status: number, headers: Record<string, string>, body?: string) => {
    entry.status = status;
    entry.durationMs = Date.now() - started;
    inst.log.push(entry);
    if (inst.log.length > MAX_LOG) inst.log.splice(0, inst.log.length - MAX_LOG);
    inst.requests++;
    res.writeHead(status, { ...cors, ...headers });
    res.end(method === 'HEAD' ? undefined : body);
  };
  const sendJson = (status: number, obj: unknown) => send(status, { 'Content-Type': 'application/json' }, JSON.stringify(obj));

  let body: Buffer;
  try {
    body = await readBody(req);
  } catch (e) {
    sendJson((e as { status?: number }).status ?? 400, { error: (e as Error).message });
    return;
  }

  // Route: try the raw path, then each server base path stripped.
  let match = findOperation(model, method === 'HEAD' ? 'HEAD' : method, url.pathname);
  if (!match && method === 'HEAD') match = findOperation(model, 'GET', url.pathname);
  if (!match) {
    for (const base of serverBasePaths(model)) {
      if (url.pathname === base || url.pathname.startsWith(base + '/')) {
        const rest = url.pathname.slice(base.length) || '/';
        match = findOperation(model, method, rest) ?? (method === 'HEAD' ? findOperation(model, 'GET', rest) : undefined);
        if (match) break;
      }
    }
  }

  if (!match) {
    // CORS preflight for a path the spec has no OPTIONS operation for.
    if (method === 'OPTIONS' && req.headers['access-control-request-method']) {
      send(204, {
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': String(req.headers['access-control-request-headers'] ?? 'Content-Type, Authorization'),
      });
      return;
    }
    if (samePathExists(model, url.pathname)) {
      sendJson(405, { error: 'Method Not Allowed', method, path: url.pathname });
    } else {
      sendJson(404, { error: 'Not Found', method, path: url.pathname });
    }
    return;
  }
  const { op, params } = match;
  entry.operation = operationLabel(op);

  if (options.validateRequests !== false) {
    const bad = validateRequest(model, op, params, url, req, body, options.validateAuth !== false);
    if (bad) {
      entry.errors = bad.errors;
      const titles: Record<number, string> = { 400: 'Request validation failed', 401: 'Unauthorized', 415: 'Unsupported Media Type' };
      sendJson(bad.status, { error: titles[bad.status] ?? 'Bad Request', operation: entry.operation, details: bad.errors });
      return;
    }
  }

  const prefer = parsePrefer(String(req.headers.prefer ?? ''));
  const qCode = url.searchParams.get('__code') ?? url.searchParams.get('_status');
  const requested = prefer.code ? Number(prefer.code) : qCode ? Number(qCode) : undefined;
  const choice = chooseResponse(op, requested !== undefined && Number.isFinite(requested) ? requested : undefined);
  if ('error' in choice) {
    entry.errors = [choice.error];
    sendJson(400, { error: choice.error });
    return;
  }

  const def = op.responses[choice.key];
  const headers: Record<string, string> = {};
  let payload: string | undefined;
  if (def) {
    for (const [name, h] of Object.entries(def.headers)) {
      const v = generateSample(h.schema ?? { type: 'string' }, { mode: 'response' });
      if (v !== null && v !== undefined) headers[name] = typeof v === 'object' ? JSON.stringify(v) : String(v);
    }
    const media = negotiate(def.content, String(req.headers.accept ?? ''));
    if (media && choice.status !== 204 && choice.status !== 304) {
      const value = exampleFor(media[1], prefer.example);
      const mime = media[0].includes('*') ? 'application/json' : media[0];
      headers['Content-Type'] = /json|xml|text/i.test(mime) && !/charset/i.test(mime) ? `${mime}; charset=utf-8` : mime;
      payload = serialise(mime, value);
    }
  }

  const delay = options.delay ?? 0;
  const delayMax = options.delayMax ?? delay;
  const wait = delayMax > delay ? delay + Math.floor(Math.random() * (delayMax - delay)) : delay;
  const respond = () => send(choice.status, headers, payload);
  if (wait > 0) setTimeout(respond, Math.min(wait, 120_000));
  else respond();
}

function samePathExists(model: ApiModel, path: string): boolean {
  const methods = new Set(model.operations.map((o) => o.method));
  for (const m of methods) {
    if (findOperation(model, m, path)) return true;
    for (const base of serverBasePaths(model)) {
      if (path.startsWith(base + '/') && findOperation(model, m, path.slice(base.length))) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

function listen(server: Server, port: number, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
      server.off('listening', onListening);
      reject(err);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve((server.address() as AddressInfo).port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

const ALLOWED_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '0.0.0.0', '::']);

export async function startMockServer(
  specPath: string,
  options: MockOptions = {}
): Promise<{ port: number; url: string; host: string; routes: number; endpoints: Array<{ method: string; path: string; operationId?: string }>; warnings: string[]; note?: string }> {
  const model = await loadModel(specPath);
  const host = options.host ?? '127.0.0.1';
  if (!ALLOWED_HOSTS.has(host)) throw new Error(`host must be one of ${[...ALLOWED_HOSTS].join(', ')}`);

  const explicit = options.port !== undefined;
  const firstPort = options.port ?? DEFAULT_PORT;
  const fallback = options.portFallback ?? !explicit;
  if (explicit && activeServers.has(firstPort) && !fallback) {
    throw new Error(`A mock server is already running on port ${firstPort}; stop it first or pass portFallback: true`);
  }

  const inst: MockInstance = {
    server: undefined as unknown as Server,
    port: 0,
    host,
    specPath,
    model,
    options,
    log: [],
    requests: 0,
    startedAt: new Date().toISOString(),
  };
  const tries = fallback && firstPort !== 0 ? FALLBACK_TRIES : 1;
  let lastErr: NodeJS.ErrnoException | undefined;
  for (let i = 0; i < tries; i++) {
    const port = firstPort === 0 ? 0 : firstPort + i;
    if (port !== 0 && activeServers.has(port)) continue;
    const server = createServer((req, res) => {
      handle(inst, req, res).catch((e) => {
        if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Mock server error: ${(e as Error).message}` }));
      });
    });
    try {
      inst.port = await listen(server, port, host);
      inst.server = server;
      break;
    } catch (e) {
      lastErr = e as NodeJS.ErrnoException;
      server.close();
      if (lastErr.code !== 'EADDRINUSE') throw lastErr;
    }
  }
  if (!inst.server) {
    if (!fallback) throw new Error(`Port ${firstPort} is already in use. Choose another port or pass portFallback: true`);
    throw new Error(`No free port in ${firstPort}-${firstPort + tries - 1} (${lastErr?.message ?? 'in use'})`);
  }
  activeServers.set(inst.port, inst);
  const displayHost = host === '0.0.0.0' || host === '::' ? 'localhost' : host.includes(':') ? `[${host}]` : host;
  return {
    port: inst.port,
    url: `http://${displayHost}:${inst.port}`,
    host,
    routes: model.operations.length,
    endpoints: model.operations.slice(0, 200).map((o) => ({ method: o.method, path: o.path, operationId: o.operationId })),
    warnings: model.warnings.slice(0, 20),
    ...(explicit && inst.port !== firstPort ? { note: `Port ${firstPort} was busy; using ${inst.port}` } : {}),
    ...(host === '0.0.0.0' || host === '::' ? { note: 'Listening on ALL interfaces — reachable from the network' } : {}),
  };
}

export async function stopMockServer(port: number): Promise<boolean> {
  const inst = activeServers.get(port);
  if (!inst) return false;
  activeServers.delete(port);
  await new Promise<void>((resolve) => {
    inst.server.close(() => resolve());
    // Drop keep-alive sockets so close() completes promptly.
    (inst.server as Server & { closeAllConnections?: () => void }).closeAllConnections?.();
  });
  return true;
}

export function listMockServers(): Array<Record<string, unknown>> {
  return [...activeServers.values()].map((s) => ({
    port: s.port,
    host: s.host,
    url: `http://${s.host === '0.0.0.0' || s.host === '::' ? 'localhost' : s.host.includes(':') ? `[${s.host}]` : s.host}:${s.port}`,
    spec: s.specPath,
    title: s.model.title,
    routes: s.model.operations.length,
    requests: s.requests,
    startedAt: s.startedAt,
  }));
}

export function mockLogs(port: number, limit = 50, clear = false): { port: number; entries: LogEntry[]; total: number; truncated: boolean } {
  const inst = activeServers.get(port);
  if (!inst) throw new Error(`No mock server on port ${port}`);
  const total = inst.log.length;
  const entries = inst.log.slice(-limit);
  if (clear) inst.log = [];
  return { port, entries, total, truncated: total > entries.length };
}

export async function stopAllMockServers(): Promise<number> {
  const ports = [...activeServers.keys()];
  await Promise.all(ports.map((p) => stopMockServer(p)));
  return ports.length;
}

