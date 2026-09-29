// SPDX-License-Identifier: MIT
/**
 * The request pipeline shared by http_request, batch_request, run_scenario,
 * validate_contract, graphql and load_test:
 *
 *   variables (environment + inline + scenario) → substitution (unresolved
 *   names are an error, not a literal "{{x}}" in the URL) → query/auth/body →
 *   SSRF-guarded send → response decoding → assertions → redacted, bounded
 *   output.
 */

import { z } from 'zod';
import type { Agent } from 'http';
import { send, getHeader, setHeader, deleteHeader, type RawResponse, DEFAULT_TIMEOUT_MS, DEFAULT_MAX_RESPONSE_BYTES } from './client.js';
import { encodeBody, type BodyType } from './body.js';
import { applyAuth, AuthSchema } from './auth.js';
import { getSessionJar } from './cookies.js';
import { substituteDeep, type Vars } from '../vars/substitute.js';
import { resolveEnvironment } from '../vars/environments.js';
import { Redactor, maskHeaders } from '../util/redact.js';
import { truncateText, clampInt } from '../util/limits.js';
import { runAssertions, AssertionSchema, type AssertionResult } from '../assertions/assert.js';

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

const QueryValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const RequestFields = {
  method: z.enum(HTTP_METHODS).describe('HTTP method'),
  url: z.string().min(1).describe('Absolute URL; {{variables}} are substituted first'),
  query: z.record(z.string(), z.union([QueryValue, z.array(QueryValue)])).optional().describe('Query parameters (arrays repeat the key)'),
  headers: z.record(z.string(), z.string()).optional().describe('Request headers'),
  body: z.unknown().optional().describe('Body. Strings are sent verbatim, other values as JSON (see bodyType)'),
  bodyType: z
    .enum(['auto', 'json', 'text', 'form', 'multipart', 'binary', 'file', 'none'])
    .optional()
    .describe('auto | json | text | form (urlencoded object) | multipart (fields + files) | binary (base64) | file'),
  files: z
    .array(
      z.object({
        field: z.string(),
        path: z.string().describe('File inside the project directory'),
        filename: z.string().optional(),
        contentType: z.string().optional(),
      })
    )
    .optional()
    .describe('Multipart file parts'),
  bodyFile: z.string().optional().describe('Send this project file as the raw body (bodyType file)'),
  contentType: z.string().optional().describe('Override the Content-Type of the encoded body'),
  auth: AuthSchema.optional(),
  timeout: z.number().int().positive().max(300_000).optional().describe('Total timeout in ms incl. body (default 30000)'),
  maxResponseBytes: z.number().int().positive().max(100 * 1024 * 1024).optional().describe('Response size cap (default 10 MB)'),
  followRedirects: z.enum(['follow', 'manual', 'error']).optional().describe('Redirect policy (default follow, max 5 hops)'),
  maxRedirects: z.number().int().min(0).max(20).optional(),
  insecure: z.boolean().optional().describe('Skip TLS certificate verification'),
  caFile: z.string().optional().describe('Absolute path to an extra PEM CA bundle'),
  certFile: z.string().optional().describe('Client certificate (mTLS), absolute path'),
  keyFile: z.string().optional().describe('Client key (mTLS), absolute path'),
  proxy: z.string().optional().describe('http:// proxy URL (default: API_TESTER_PROXY)'),
  session: z.string().max(64).optional().describe('Cookie-jar session name; cookies persist across calls'),
};

export const RequestInputSchema = z.object(RequestFields);
export type RequestInput = z.infer<typeof RequestInputSchema>;

export const VariableFields = {
  environment: z.string().optional().describe('Environment name (default: the active one; "none" disables)'),
  variables: z.record(z.string(), z.unknown()).optional().describe('Inline variables, override the environment'),
};

export const OutputFields = {
  maxBodyChars: z.number().int().min(100).max(1_000_000).optional().describe('Truncate the returned body (default 20000)'),
};

export { AssertionSchema };

export interface VarContext {
  vars: Vars;
  redactor: Redactor;
  environment?: string;
}

export async function buildVarContext(opts: { environment?: string; variables?: Record<string, unknown> }): Promise<VarContext> {
  const redactor = new Redactor();
  let vars: Vars = {};
  let environment: string | undefined;
  if (opts.environment !== 'none' && opts.environment !== '') {
    const env = await resolveEnvironment(opts.environment);
    if (env) {
      vars = { ...env.variables };
      environment = env.name;
      redactor.addAll(env.secretValues);
    }
  }
  return { vars: { ...vars, ...(opts.variables ?? {}) }, redactor, environment };
}

export interface ObservedResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  setCookie: string[];
  body: unknown;
  bodyText: string;
  bodyIsJson: boolean;
  bodyBytes: Buffer;
  bodyTruncated: boolean;
  timeMs: number;
  url: string;
}

export interface ExecResult {
  /** Redacted, bounded, safe to return. */
  output: Record<string, unknown>;
  /** Unredacted, for extraction into variables. */
  observed?: ObservedResponse;
  request: { method: string; url: string };
  passed: boolean;
  assertions?: AssertionResult[];
  error?: string;
}

const TEXTUAL = /^(text\/|application\/(json|xml|javascript|x-www-form-urlencoded|graphql|yaml|x-yaml|problem\+json|ld\+json|x-ndjson)|[^;]*\+(json|xml))/i;

function isTextual(contentType: string, body: Buffer): boolean {
  if (contentType) return TEXTUAL.test(contentType.trim());
  const probe = body.subarray(0, 1024);
  return !probe.includes(0);
}

function decodeText(body: Buffer, contentType: string): string {
  const charset = /charset=([^;]+)/i.exec(contentType)?.[1]?.trim().replace(/"/g, '');
  if (charset && !/^utf-?8$/i.test(charset)) {
    try {
      return new TextDecoder(charset).decode(body);
    } catch {
      /* unknown charset: fall back to utf-8 */
    }
  }
  return body.toString('utf8');
}

export function observe(raw: RawResponse): ObservedResponse {
  const ct = raw.headers['content-type'] ?? '';
  let bodyText = '';
  let body: unknown;
  let bodyIsJson = false;
  if (raw.body.length > 0 && isTextual(ct, raw.body)) {
    bodyText = decodeText(raw.body, ct);
    if (/json/i.test(ct) || (!ct && /^\s*[[{]/.test(bodyText))) {
      try {
        body = JSON.parse(bodyText);
        bodyIsJson = true;
      } catch {
        body = bodyText;
      }
    } else body = bodyText;
  } else if (raw.body.length > 0) {
    body = undefined;
  } else {
    body = '';
  }
  return {
    status: raw.status,
    statusText: raw.statusText,
    headers: raw.headers,
    setCookie: raw.setCookie,
    body,
    bodyText,
    bodyIsJson,
    bodyBytes: raw.body,
    bodyTruncated: raw.bodyTruncated,
    timeMs: raw.timings.totalMs,
    url: raw.url,
  };
}

function bodyForOutput(o: ObservedResponse, maxChars: number, contentType: string): Record<string, unknown> {
  if (o.bodyBytes.length === 0) return { body: null };
  if (o.body === undefined) {
    // Binary
    return {
      body: null,
      binary: {
        contentType: contentType || 'unknown',
        bytes: o.bodyBytes.length,
        base64Preview: o.bodyBytes.subarray(0, 512).toString('base64'),
        previewTruncated: o.bodyBytes.length > 512,
      },
    };
  }
  if (o.bodyIsJson) {
    const pretty = JSON.stringify(o.body);
    if (pretty.length <= maxChars) return { body: o.body };
    const t = truncateText(pretty, maxChars);
    return { body: t.text, bodyTruncated: true, bodyChars: t.totalChars, note: 'JSON body truncated for display; assertions ran on the full body' };
  }
  const t = truncateText(o.bodyText, maxChars);
  return t.truncated ? { body: t.text, bodyTruncated: true, bodyChars: t.totalChars } : { body: t.text };
}

export interface ExecOptions {
  assert?: z.infer<typeof AssertionSchema>[];
  maxBodyChars?: number;
  agent?: Agent;
  /** Omit the body from output entirely (load tests). */
  omitBody?: boolean;
}

/** Resolve variables, build and send one request. Never throws: errors come back in the result. */
export async function executeRequest(input: RequestInput, ctx: VarContext, opts: ExecOptions = {}): Promise<ExecResult> {
  const redactor = ctx.redactor;
  let reqEcho: { method: string; url: string } = { method: input.method, url: input.url };
  try {
    const prepared = await prepareRequest(input, ctx);
    reqEcho = { method: prepared.method, url: prepared.url };

    const raw = await send({
      method: prepared.method,
      url: prepared.url,
      headers: prepared.headers,
      body: prepared.body,
      timeoutMs: prepared.timeoutMs,
      maxResponseBytes: prepared.maxResponseBytes,
      redirect: input.followRedirects ?? 'follow',
      maxRedirects: input.maxRedirects ?? 5,
      tls: prepared.tls,
      proxy: prepared.proxy,
      jar: input.session ? getSessionJar(input.session) : undefined,
      digest: prepared.digest,
      agent: opts.agent,
    });
    const observed = observe(raw);
    // Expectations may reference variables too ({{userId}} keeps its type).
    const assertions = opts.assert?.length ? substituteDeep(opts.assert, ctx.vars, { preserveTypes: true }).value : undefined;
    const { results, passed } = await runAssertions(assertions, { ...observed, request: reqEcho });
    const maxChars = clampInt(opts.maxBodyChars, 20_000, 100, 1_000_000);
    const contentType = raw.headers['content-type'] ?? '';

    const output: Record<string, unknown> = {
      request: {
        method: prepared.method,
        url: prepared.url,
        headers: maskHeaders(prepared.headers),
        body: prepared.bodySummary,
        auth: prepared.authSummary,
        session: input.session,
      },
      response: {
        status: raw.status,
        statusText: raw.statusText,
        httpVersion: raw.httpVersion,
        headers: maskHeaders(raw.headers),
        ...(opts.omitBody ? {} : bodyForOutput(observed, maxChars, contentType)),
        size: raw.body.length,
        ...(raw.bodyTruncated ? { sizeCapped: true, note: `Response exceeded maxResponseBytes (${prepared.maxResponseBytes}); body is partial` } : {}),
        url: raw.url !== prepared.url ? raw.url : undefined,
        redirects: raw.redirects.length ? raw.redirects : undefined,
        timing: raw.timings,
      },
    };
    if (opts.assert?.length) {
      output.assertions = results;
      output.passed = passed;
    }
    return {
      output: redactor.scrub(output),
      observed,
      request: { method: prepared.method, url: redactor.scrubString(prepared.url) },
      passed: opts.assert?.length ? passed : raw.status < 400,
      assertions: opts.assert?.length ? redactor.scrub(results) : undefined,
    };
  } catch (e) {
    const message = redactor.scrubString(e instanceof Error ? e.message : String(e));
    return {
      output: { request: redactor.scrub(reqEcho), error: message },
      request: redactor.scrub(reqEcho),
      passed: false,
      error: message,
    };
  }
}

export interface PreparedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: Buffer;
  bodySummary?: unknown;
  authSummary?: string;
  digest?: { username: string; password: string };
  timeoutMs: number;
  maxResponseBytes: number;
  tls?: { insecure?: boolean; caFile?: string; certFile?: string; keyFile?: string };
  proxy?: string;
}

/** Substitute variables, apply auth, encode the body. Throws on unresolved variables or bad input. */
export async function prepareRequest(input: RequestInput, ctx: VarContext): Promise<PreparedRequest> {
  const redactor = ctx.redactor;
  const sub = substituteDeep(
    {
      url: input.url,
      query: input.query,
      headers: input.headers,
      body: input.body,
      auth: input.auth,
      files: input.files,
      bodyFile: input.bodyFile,
      contentType: input.contentType,
      proxy: input.proxy,
    },
    ctx.vars
  );
  if (sub.missing.length) {
    throw new Error(
      `Unresolved variable${sub.missing.length > 1 ? 's' : ''}: ${sub.missing.map((m) => `{{${m}}}`).join(', ')}. ` +
        'Pass them in `variables` or define them in an environment.'
    );
  }
  const r = sub.value;

  let url: URL;
  try {
    url = new URL(r.url);
  } catch {
    throw new Error(`URL is not absolute after substitution: "${redactor.scrubString(r.url)}"`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error(`Unsupported URL protocol ${url.protocol}`);
  for (const [k, v] of Object.entries(r.query ?? {})) {
    const values = Array.isArray(v) ? v : [v];
    for (const item of values) url.searchParams.append(k, item === null ? '' : String(item));
  }

  const headers: Record<string, string> = { ...(r.headers ?? {}) };
  for (const [k, v] of Object.entries(headers)) {
    if (/authorization|token|key|secret|cookie/i.test(k)) redactor.add(v.replace(/^(Bearer|Basic|Token)\s+/i, ''));
  }

  const tls = input.insecure || input.caFile || input.certFile || input.keyFile
    ? { insecure: input.insecure, caFile: input.caFile, certFile: input.certFile, keyFile: input.keyFile }
    : undefined;
  const proxy = r.proxy ?? (process.env.API_TESTER_PROXY || undefined);
  const timeoutMs = input.timeout ?? DEFAULT_TIMEOUT_MS;

  const query = new URLSearchParams(url.search);
  const applied = await applyAuth(r.auth, headers, query, redactor, { tls, proxy, timeoutMs });
  // Re-serialise only when auth touched the query, so the caller's own encoding is kept verbatim.
  if (r.auth?.type === 'apiKey' && r.auth.in === 'query') url.search = query.toString();

  const encoded = await encodeBody({
    body: r.body,
    bodyType: input.bodyType as BodyType | undefined,
    files: r.files,
    bodyFile: r.bodyFile,
    contentType: r.contentType,
  });
  if (encoded.data !== undefined && encoded.contentType) {
    const userCt = getHeader(headers, 'content-type');
    if (encoded.kind === 'multipart') {
      // The boundary must match the one we generated.
      setHeader(headers, 'Content-Type', encoded.contentType);
    } else if (userCt === undefined) {
      headers['Content-Type'] = encoded.contentType;
    }
  } else if (encoded.data === undefined && encoded.kind === 'none') {
    // No body: a stray Content-Length would desync the connection.
    deleteHeader(headers, 'content-length');
  }

  return {
    method: input.method,
    url: url.toString(),
    headers,
    body: encoded.data,
    bodySummary: encoded.kind === 'none' ? undefined : { type: encoded.kind, value: previewSummary(encoded.summary) },
    authSummary: applied.summary,
    digest: applied.digest,
    timeoutMs,
    maxResponseBytes: input.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
    tls,
    proxy,
  };
}

function previewSummary(v: unknown): unknown {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  if (s === undefined) return v;
  return s.length > 2000 ? `${s.slice(0, 2000)}… [${s.length} chars]` : v;
}
