// SPDX-License-Identifier: MIT
/**
 * Build a concrete, schema-valid sample request for an operation. Shared by
 * the OpenAPI importer, generate_tests and validate_contract.
 */

import type { AuthSpec } from '../http/auth.js';
import type { BodyType } from '../http/body.js';
import { generateSample } from './sample.js';
import { pickMedia, type ApiModel, type ApiOperation, type ApiParameter, type MediaDef } from './model.js';

export interface AuthRequirement {
  scheme: string;
  kind: 'bearer' | 'basic' | 'apiKey' | 'digest' | 'unsupported';
  in?: 'header' | 'query' | 'cookie';
  name?: string;
}

export interface SampleRequest {
  method: string;
  /** Path with parameters substituted, relative to the base URL. */
  path: string;
  url: string;
  query: Record<string, string | string[]>;
  headers: Record<string, string>;
  pathParams: Record<string, string>;
  body?: unknown;
  bodyType?: BodyType;
  contentType?: string;
  /** Media definition the body was generated from. */
  requestMedia?: { mime: string; def: MediaDef };
  auth?: AuthSpec;
  authRequirements: AuthRequirement[];
}

/** Placeholder variable names used for credentials in generated requests. */
export const AUTH_VARS = { token: 'token', apiKey: 'apiKey', username: 'username', password: 'password' };

export function authRequirements(model: ApiModel, op: ApiOperation): AuthRequirement[] {
  if (!op.security.length) return [];
  // An empty alternative ({}) means auth is optional.
  if (op.security.some((alt) => alt.length === 0)) return [];
  const out: AuthRequirement[] = [];
  for (const name of op.security[0]) {
    const s = model.securitySchemes[name];
    if (!s) continue;
    if (s.type === 'http' && s.scheme === 'basic') out.push({ scheme: name, kind: 'basic' });
    else if (s.type === 'http' && s.scheme === 'digest') out.push({ scheme: name, kind: 'digest' });
    else if (s.type === 'http' || s.type === 'oauth2' || s.type === 'openIdConnect') out.push({ scheme: name, kind: 'bearer' });
    else if (s.type === 'apiKey') out.push({ scheme: name, kind: 'apiKey', in: s.in ?? 'header', name: s.name });
    else out.push({ scheme: name, kind: 'unsupported' });
  }
  return out;
}

function paramValue(p: ApiParameter): string | string[] {
  const v = p.example !== undefined ? p.example : generateSample(p.schema ?? { type: 'string' }, { mode: 'request' });
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x)));
  if (v !== null && typeof v === 'object') return JSON.stringify(v);
  return v === null || v === undefined ? '' : String(v);
}

export function pickRequestMedia(op: ApiOperation): { mime: string; def: MediaDef } | undefined {
  if (!op.requestBody) return undefined;
  const hit = pickMedia(op.requestBody.content);
  return hit ? { mime: hit[0], def: hit[1] } : undefined;
}

export function sampleBodyFor(media: { mime: string; def: MediaDef }): { body: unknown; bodyType: BodyType; contentType?: string } {
  const { mime, def } = media;
  const example = def.example !== undefined ? def.example : def.examples ? Object.values(def.examples)[0] : undefined;
  const value = example !== undefined ? example : generateSample(def.schema, { mode: 'request' });
  const m = mime.toLowerCase();
  if (m.includes('json')) return { body: value, bodyType: 'json', contentType: mime.includes('*') ? 'application/json' : mime };
  if (m === 'application/x-www-form-urlencoded') return { body: value ?? {}, bodyType: 'form' };
  if (m === 'multipart/form-data') {
    const fields: Record<string, string> = {};
    for (const [k, v] of Object.entries((value as Record<string, unknown>) ?? {})) fields[k] = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return { body: fields, bodyType: 'multipart' };
  }
  if (m.startsWith('text/') || m.includes('xml')) {
    return { body: typeof value === 'string' ? value : JSON.stringify(value), bodyType: 'text', contentType: mime };
  }
  return { body: typeof value === 'string' ? value : JSON.stringify(value ?? ''), bodyType: 'text', contentType: mime };
}

export function buildSampleRequest(
  model: ApiModel,
  op: ApiOperation,
  opts: {
    baseUrl: string;
    pathParams?: Record<string, string>;
    includeOptionalParams?: boolean;
    authMode?: 'placeholders' | 'none';
    explicitAuth?: AuthSpec;
  }
): SampleRequest {
  const pathParams: Record<string, string> = {};
  const query: Record<string, string | string[]> = {};
  const headers: Record<string, string> = {};
  const cookies: string[] = [];

  for (const p of op.parameters) {
    if (p.in === 'path') {
      const override = opts.pathParams?.[p.name];
      const v = override ?? paramValue(p);
      pathParams[p.name] = Array.isArray(v) ? v.join(',') : v;
      continue;
    }
    if (!p.required && !opts.includeOptionalParams) continue;
    const v = paramValue(p);
    if (p.in === 'query') query[p.name] = v;
    else if (p.in === 'header') headers[p.name] = Array.isArray(v) ? v.join(',') : v;
    else if (p.in === 'cookie') cookies.push(`${p.name}=${Array.isArray(v) ? v.join(',') : v}`);
  }

  let path = op.path;
  for (const [k, v] of Object.entries(pathParams)) path = path.split(`{${k}}`).join(encodeURIComponent(v));

  const reqMedia = pickRequestMedia(op);
  let body: unknown;
  let bodyType: BodyType | undefined;
  let contentType: string | undefined;
  if (reqMedia) {
    const b = sampleBodyFor(reqMedia);
    body = b.body;
    bodyType = b.bodyType;
    contentType = b.contentType;
  }

  const reqs = authRequirements(model, op);
  let auth: AuthSpec | undefined;
  if (reqs.length && opts.explicitAuth) {
    auth = opts.explicitAuth;
  } else if (reqs.length && (opts.authMode ?? 'placeholders') === 'placeholders') {
    for (const r of reqs) {
      if (r.kind === 'bearer') auth = { type: 'bearer', token: `{{${AUTH_VARS.token}}}` };
      else if (r.kind === 'basic') auth = { type: 'basic', username: `{{${AUTH_VARS.username}}}`, password: `{{${AUTH_VARS.password}}}` };
      else if (r.kind === 'digest') auth = { type: 'digest', username: `{{${AUTH_VARS.username}}}`, password: `{{${AUTH_VARS.password}}}` };
      else if (r.kind === 'apiKey' && r.name) {
        if (r.in === 'query') query[r.name] = `{{${AUTH_VARS.apiKey}}}`;
        else if (r.in === 'cookie') cookies.push(`${r.name}={{${AUTH_VARS.apiKey}}}`);
        else headers[r.name] = `{{${AUTH_VARS.apiKey}}}`;
      }
    }
  }
  if (cookies.length) headers.Cookie = cookies.join('; ');

  const base = opts.baseUrl.replace(/\/+$/, '');
  return {
    method: op.method,
    path,
    url: `${base}${path}`,
    query,
    headers,
    pathParams,
    body,
    bodyType,
    contentType,
    requestMedia: reqMedia,
    auth,
    authRequirements: reqs,
  };
}

/** The server URL to use: explicit > first absolute server > `{{baseUrl}}` + server path. */
export function resolveBaseUrl(model: ApiModel, explicit?: string): { baseUrl: string; needsVariable: boolean; serverUrl?: string } {
  if (explicit) return { baseUrl: explicit.replace(/\/+$/, ''), needsVariable: false };
  const abs = model.servers.find((s) => /^https?:\/\//i.test(s));
  if (abs) return { baseUrl: abs, needsVariable: false, serverUrl: abs };
  const rel = model.servers[0] && model.servers[0] !== '/' ? model.servers[0] : '';
  return { baseUrl: `{{baseUrl}}${rel}`, needsVariable: true };
}
