// SPDX-License-Identifier: MIT
/**
 * Postman Collection v2.0/v2.1 importer (+ Postman environment files).
 *
 * Covers folders (with folder-level auth inheritance), collection variables,
 * every body mode (raw / urlencoded / formdata incl. files / file / graphql),
 * path variables (`:id`), auth (bearer, basic, apikey, digest, oauth2 with a
 * stored token, noauth, inherit), and — best effort — literal
 * `pm.*.set("k", "v")` calls in pre-request scripts. Scripts are never executed.
 */

import type { AuthSpec } from '../http/auth.js';
import { headerListToRecord, normaliseMethod, type ImportedRequest, type ImportResult } from './types.js';

type Rec = Record<string, unknown>;

function obj(v: unknown): Rec {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {};
}
function arr(v: unknown): Rec[] {
  return Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Rec[]) : [];
}
function kv(list: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of arr(list)) if (typeof e.key === 'string') out[e.key] = e.value === undefined ? '' : String(e.value);
  return out;
}

export function isPostmanCollection(doc: unknown): boolean {
  const info = obj(obj(doc).info);
  return typeof info.schema === 'string' && info.schema.includes('postman') && Array.isArray(obj(doc).item);
}

export function isPostmanEnvironment(doc: unknown): boolean {
  const d = obj(doc);
  return Array.isArray(d.values) && (d._postman_variable_scope === 'environment' || typeof d.name === 'string');
}

function description(d: unknown): string | undefined {
  if (typeof d === 'string') return d;
  const o = obj(d);
  return typeof o.content === 'string' ? o.content : undefined;
}

function convertAuth(auth: unknown, warnings: string[], where: string): AuthSpec | 'inherit' | undefined {
  const a = obj(auth);
  const type = String(a.type ?? '');
  if (!type) return 'inherit';
  const params = (key: string) => {
    const v = a[key];
    return Array.isArray(v) ? kv(v) : (obj(v) as Record<string, string>);
  };
  switch (type) {
    case 'noauth':
      return { type: 'none' };
    case 'inherit':
      return 'inherit';
    case 'bearer':
      return { type: 'bearer', token: params('bearer').token ?? '' };
    case 'basic': {
      const p = params('basic');
      return { type: 'basic', username: p.username ?? '', password: p.password ?? '' };
    }
    case 'digest': {
      const p = params('digest');
      return { type: 'digest', username: p.username ?? '', password: p.password ?? '' };
    }
    case 'apikey': {
      const p = params('apikey');
      return { type: 'apiKey', name: p.key ?? 'X-API-Key', value: p.value ?? '', in: p.in === 'query' ? 'query' : 'header' };
    }
    case 'oauth2': {
      const p = params('oauth2');
      if (p.grant_type === 'client_credentials' || p.grant_type === 'password_credentials') {
        return {
          type: 'oauth2',
          grant: p.grant_type === 'password_credentials' ? 'password' : 'client_credentials',
          tokenUrl: p.accessTokenUrl,
          clientId: p.clientId,
          clientSecret: p.clientSecret,
          username: p.username,
          password: p.password,
          scope: p.scope,
          clientAuth: p.client_authentication === 'body' ? 'body' : 'basic',
        };
      }
      if (p.accessToken) return { type: 'bearer', token: p.accessToken };
      warnings.push(`${where}: OAuth2 grant "${p.grant_type ?? 'unknown'}" needs a browser flow; supply a token via auth`);
      return undefined;
    }
    default:
      warnings.push(`${where}: auth type "${type}" is not supported and was skipped`);
      return undefined;
  }
}

/** Literal-only pm.*.set("key", "value") extraction from scripts. */
function scriptVariables(events: unknown, warnings: string[], where: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const ev of arr(events)) {
    const exec = obj(ev.script).exec;
    const src = Array.isArray(exec) ? exec.join('\n') : typeof exec === 'string' ? exec : '';
    if (!src.trim()) continue;
    let matched = 0;
    const re = /pm\.(?:environment|collectionVariables|globals|variables)\.set\(\s*(['"`])([^'"`]+)\1\s*,\s*(['"`])([^'"`]*)\3\s*\)/g;
    for (const m of src.matchAll(re)) {
      if (ev.listen === 'prerequest') {
        out[m[2]] = m[4];
        matched++;
      }
    }
    const lines = src.split('\n').filter((l) => l.trim() && !l.trim().startsWith('//')).length;
    if (lines > matched) warnings.push(`${where}: ${ev.listen ?? 'script'} script not executed (only literal pm.*.set values are imported)`);
  }
  return out;
}

function buildUrl(url: unknown): { url: string; pathVars: Record<string, string> } {
  if (typeof url === 'string') return { url, pathVars: {} };
  const u = obj(url);
  const pathVars = kv(u.variable);
  if (typeof u.raw === 'string' && u.raw) {
    // raw keeps disabled query params out only if the author removed them; rebuild the query when we have structure.
    const q = arr(u.query);
    if (q.length && q.some((p) => p.disabled === true)) {
      const base = u.raw.split('?')[0];
      const qs = q
        .filter((p) => p.disabled !== true)
        .map((p) => `${String(p.key ?? '')}${p.value === null || p.value === undefined ? '' : `=${String(p.value)}`}`)
        .join('&');
      return { url: qs ? `${base}?${qs}` : base, pathVars };
    }
    return { url: u.raw, pathVars };
  }
  const protocol = typeof u.protocol === 'string' ? u.protocol : 'https';
  const host = Array.isArray(u.host) ? u.host.join('.') : String(u.host ?? '');
  const port = u.port ? `:${u.port}` : '';
  const path = Array.isArray(u.path) ? u.path.join('/') : String(u.path ?? '');
  const qs = arr(u.query)
    .filter((p) => p.disabled !== true)
    .map((p) => `${String(p.key ?? '')}=${String(p.value ?? '')}`)
    .join('&');
  return { url: `${protocol}://${host}${port}${path ? `/${path}` : ''}${qs ? `?${qs}` : ''}`, pathVars };
}

function applyPathVars(url: string, vars: Record<string, string>): string {
  let out = url;
  for (const [k, v] of Object.entries(vars)) {
    out = out.replace(new RegExp(`/:${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=/|\\?|#|$)`, 'g'), `/${v}`);
  }
  return out;
}

function convertBody(body: unknown, req: ImportedRequest, warnings: string[], where: string): void {
  const b = obj(body);
  if (b.disabled === true) return;
  switch (b.mode) {
    case 'raw': {
      if (typeof b.raw !== 'string' || b.raw === '') return;
      const lang = String(obj(obj(b.options).raw).language ?? '');
      req.body = b.raw;
      req.bodyType = 'text';
      const ct =
        lang === 'json' ? 'application/json' : lang === 'xml' ? 'application/xml' : lang === 'html' ? 'text/html' : lang === 'javascript' ? 'application/javascript' : undefined;
      if (ct && !Object.keys(req.headers).some((h) => h.toLowerCase() === 'content-type')) req.contentType = ct;
      return;
    }
    case 'urlencoded': {
      const fields: Record<string, string | string[]> = {};
      for (const p of arr(b.urlencoded)) {
        if (p.disabled === true || typeof p.key !== 'string') continue;
        const v = String(p.value ?? '');
        const prev = fields[p.key];
        fields[p.key] = prev === undefined ? v : Array.isArray(prev) ? [...prev, v] : [prev, v];
      }
      req.body = fields;
      req.bodyType = 'form';
      return;
    }
    case 'formdata': {
      const fields: Record<string, string> = {};
      const files: NonNullable<ImportedRequest['files']> = [];
      for (const p of arr(b.formdata)) {
        if (p.disabled === true || typeof p.key !== 'string') continue;
        if (p.type === 'file') {
          const srcs = Array.isArray(p.src) ? p.src : p.src ? [p.src] : [];
          for (const s of srcs) files.push({ field: p.key, path: String(s), contentType: typeof p.contentType === 'string' ? p.contentType : undefined });
          if (!srcs.length) warnings.push(`${where}: form-data file field "${p.key}" has no file path`);
        } else fields[p.key] = String(p.value ?? '');
      }
      req.body = fields;
      req.bodyType = 'multipart';
      if (files.length) req.files = files;
      return;
    }
    case 'file': {
      const src = obj(b.file).src;
      if (typeof src === 'string' && src) {
        req.bodyType = 'file';
        req.bodyFile = src;
      } else warnings.push(`${where}: binary body has no file path`);
      return;
    }
    case 'graphql': {
      const g = obj(b.graphql);
      let variables: unknown = undefined;
      if (typeof g.variables === 'string' && g.variables.trim()) {
        try {
          variables = JSON.parse(g.variables);
        } catch {
          warnings.push(`${where}: GraphQL variables are not valid JSON and were dropped`);
        }
      }
      req.body = { query: g.query ?? '', ...(variables !== undefined ? { variables } : {}) };
      req.bodyType = 'json';
      return;
    }
  }
}

export function importPostman(doc: unknown, environmentDoc?: unknown): ImportResult {
  const col = obj(doc);
  if (!isPostmanCollection(col)) throw new Error('Not a Postman v2 collection (info.schema must reference postman)');
  const info = obj(col.info);
  const warnings: string[] = [];
  if (typeof info.schema === 'string' && /v1\./.test(info.schema)) warnings.push('Postman v1 schema detected; only v2.x is fully supported');

  const variables: Record<string, unknown> = { ...kv(col.variable) };
  const secretKeys: string[] = [];
  Object.assign(variables, scriptVariables(col.event, warnings, 'collection'));

  if (environmentDoc !== undefined) {
    const env = obj(environmentDoc);
    if (!isPostmanEnvironment(env)) throw new Error('environmentFile is not a Postman environment export');
    for (const v of arr(env.values)) {
      if (v.enabled === false || typeof v.key !== 'string') continue;
      variables[v.key] = v.value ?? '';
      if (v.type === 'secret') secretKeys.push(v.key);
    }
  }

  const requests: ImportedRequest[] = [];
  const rootAuth = col.auth ? convertAuth(col.auth, warnings, 'collection') : undefined;

  const walk = (items: unknown, folder: string | undefined, inheritedAuth: AuthSpec | undefined) => {
    for (const item of arr(items)) {
      const name = String(item.name ?? 'Unnamed');
      const where = folder ? `${folder}/${name}` : name;
      if (Array.isArray(item.item)) {
        const fa = item.auth ? convertAuth(item.auth, warnings, where) : 'inherit';
        Object.assign(variables, scriptVariables(item.event, warnings, where));
        walk(item.item, where, fa === 'inherit' ? inheritedAuth : fa);
        continue;
      }
      const r = typeof item.request === 'string' ? { url: item.request, method: 'GET' } : obj(item.request);
      if (!r.url && !item.request) continue;
      const { url, pathVars } = buildUrl(r.url);
      const req: ImportedRequest = {
        name,
        folder,
        method: normaliseMethod(r.method, warnings, where),
        url: applyPathVars(url, pathVars),
        headers: headerListToRecord(arr(r.header) as never),
        description: description(r.description) ?? description(item.description),
      };
      convertBody(r.body, req, warnings, where);
      const own = r.auth ? convertAuth(r.auth, warnings, where) : 'inherit';
      const auth = own === 'inherit' ? inheritedAuth : own;
      if (auth && auth.type !== 'none') req.auth = auth;
      Object.assign(variables, scriptVariables(item.event, warnings, where));
      requests.push(req);
    }
  };
  walk(col.item, undefined, rootAuth === 'inherit' ? undefined : rootAuth);

  return {
    format: 'postman',
    name: String(info.name ?? 'Postman collection'),
    description: description(info.description),
    requests,
    variables,
    secretKeys,
    warnings,
  };
}
