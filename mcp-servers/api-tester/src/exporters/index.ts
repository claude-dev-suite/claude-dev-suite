// SPDX-License-Identifier: MIT
/** Exporters: Postman Collection v2.1 and `.http` (REST Client / JetBrains HTTP Client). */

import { randomUUID } from 'crypto';
import type { ImportedRequest } from '../importers/types.js';

type Rec = Record<string, unknown>;

function queryPairs(q: ImportedRequest['query']): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(q ?? {})) {
    for (const item of Array.isArray(v) ? v : [v]) out.push([k, item === null || item === undefined ? '' : String(item)]);
  }
  return out;
}

function fullUrl(r: ImportedRequest): string {
  const extra = queryPairs(r.query);
  if (!extra.length) return r.url;
  const qs = extra.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v).replace(/%7B/g, '{').replace(/%7D/g, '}')}`).join('&');
  return r.url + (r.url.includes('?') ? '&' : '?') + qs;
}

function postmanUrl(raw: string): Rec {
  const [base, qs] = raw.split(/\?(.*)/s, 2);
  const url: Rec = { raw };
  const m = /^(https?):\/\/([^/]+)(\/.*)?$/i.exec(base);
  const t = /^(\{\{[^}]+\}\})(\/.*)?$/.exec(base);
  if (m) {
    url.protocol = m[1];
    const [host, port] = m[2].split(/:(?=\d+$)/);
    url.host = host.split('.');
    if (port) url.port = port;
    url.path = (m[3] ?? '').split('/').filter(Boolean);
  } else if (t) {
    url.host = [t[1]];
    url.path = (t[2] ?? '').split('/').filter(Boolean);
  }
  if (qs) {
    url.query = qs.split('&').filter(Boolean).map((pair) => {
      const [k, ...rest] = pair.split('=');
      const dec = (s: string) => {
        try {
          return decodeURIComponent(s.replace(/\+/g, ' '));
        } catch {
          return s;
        }
      };
      return { key: dec(k), value: rest.length ? dec(rest.join('=')) : null };
    });
  }
  return url;
}

function postmanAuth(a: ImportedRequest['auth'], warnings: string[], where: string): Rec | undefined {
  if (!a || a.type === 'none') return undefined;
  const list = (o: Record<string, unknown>) =>
    Object.entries(o)
      .filter(([, v]) => v !== undefined)
      .map(([key, value]) => ({ key, value, type: 'string' }));
  switch (a.type) {
    case 'bearer':
      return { type: 'bearer', bearer: list({ token: a.token }) };
    case 'basic':
      return { type: 'basic', basic: list({ username: a.username, password: a.password }) };
    case 'digest':
      return { type: 'digest', digest: list({ username: a.username, password: a.password }) };
    case 'apiKey':
      return { type: 'apikey', apikey: list({ key: a.name, value: a.value, in: a.in ?? 'header' }) };
    case 'oauth2':
      return {
        type: 'oauth2',
        oauth2: list({
          grant_type: a.grant === 'password' ? 'password_credentials' : 'client_credentials',
          accessTokenUrl: a.tokenUrl,
          clientId: a.clientId,
          clientSecret: a.clientSecret,
          username: a.username,
          password: a.password,
          scope: a.scope,
          client_authentication: a.clientAuth === 'body' ? 'body' : 'header',
        }),
      };
  }
  warnings.push(`${where}: auth not exported`);
  return undefined;
}

function languageFor(ct: string | undefined, body: unknown): string {
  if (ct?.includes('json') || (typeof body === 'string' && /^\s*[[{]/.test(body))) return 'json';
  if (ct?.includes('xml')) return 'xml';
  if (ct?.includes('html')) return 'html';
  if (ct?.includes('javascript')) return 'javascript';
  return 'text';
}

function postmanBody(r: ImportedRequest, warnings: string[]): Rec | undefined {
  const type = r.bodyType ?? (r.files?.length ? 'multipart' : r.bodyFile ? 'file' : r.body === undefined ? 'none' : typeof r.body === 'string' ? 'text' : 'json');
  switch (type) {
    case 'none':
      return undefined;
    case 'json':
    case 'auto':
      if (r.body === undefined) return undefined;
      return { mode: 'raw', raw: typeof r.body === 'string' ? r.body : JSON.stringify(r.body, null, 2), options: { raw: { language: 'json' } } };
    case 'text':
      return {
        mode: 'raw',
        raw: typeof r.body === 'string' ? r.body : JSON.stringify(r.body),
        options: { raw: { language: languageFor(r.contentType ?? headerCt(r), r.body) } },
      };
    case 'form':
      return {
        mode: 'urlencoded',
        urlencoded: Object.entries((r.body as Rec) ?? {}).flatMap(([key, v]) =>
          (Array.isArray(v) ? v : [v]).map((value) => ({ key, value: String(value ?? ''), type: 'text' }))
        ),
      };
    case 'multipart':
      return {
        mode: 'formdata',
        formdata: [
          ...Object.entries((r.body as Rec) ?? {}).map(([key, value]) => ({ key, value: typeof value === 'object' ? JSON.stringify(value) : String(value ?? ''), type: 'text' })),
          ...(r.files ?? []).map((f) => ({ key: f.field, type: 'file', src: f.path, ...(f.contentType ? { contentType: f.contentType } : {}) })),
        ],
      };
    case 'file':
      return { mode: 'file', file: { src: r.bodyFile ?? '' } };
    case 'binary':
      warnings.push(`${r.name}: base64 binary bodies cannot be embedded in a Postman collection`);
      return undefined;
  }
  return undefined;
}

function headerCt(r: ImportedRequest): string | undefined {
  return Object.entries(r.headers ?? {}).find(([k]) => k.toLowerCase() === 'content-type')?.[1];
}

export function exportPostman(name: string, requests: ImportedRequest[], variables: Record<string, unknown>, warnings: string[]): Rec {
  const root: Rec[] = [];
  const folders = new Map<string, Rec[]>();
  const folderItems = (path: string | undefined): Rec[] => {
    if (!path) return root;
    let items = folders.get(path);
    if (items) return items;
    const parts = path.split('/');
    const parent = folderItems(parts.length > 1 ? parts.slice(0, -1).join('/') : undefined);
    items = [];
    parent.push({ name: parts[parts.length - 1], item: items });
    folders.set(path, items);
    return items;
  };

  for (const r of requests) {
    const headers = { ...(r.headers ?? {}) };
    const ct = r.contentType;
    if (ct && !headerCt(r) && (r.bodyType === 'text' || r.bodyType === 'json')) headers['Content-Type'] = ct;
    const request: Rec = {
      method: r.method,
      header: Object.entries(headers).map(([key, value]) => ({ key, value, type: 'text' })),
      url: postmanUrl(fullUrl(r)),
    };
    const body = postmanBody(r, warnings);
    if (body) request.body = body;
    const auth = postmanAuth(r.auth, warnings, r.name);
    if (auth) request.auth = auth;
    if (r.description) request.description = r.description;
    folderItems(r.folder).push({ name: r.name, request });
  }

  return {
    info: {
      _postman_id: randomUUID(),
      name,
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item: root,
    ...(Object.keys(variables).length
      ? { variable: Object.entries(variables).map(([key, value]) => ({ key, value: typeof value === 'string' ? value : JSON.stringify(value) })) }
      : {}),
  };
}

// ---------------------------------------------------------------------------

function httpAuthLines(a: ImportedRequest['auth'], r: ImportedRequest, warnings: string[]): { headers: string[]; query: Array<[string, string]>; comments: string[] } {
  const out = { headers: [] as string[], query: [] as Array<[string, string]>, comments: [] as string[] };
  if (!a || a.type === 'none') return out;
  switch (a.type) {
    case 'bearer':
      out.headers.push(`Authorization: Bearer ${a.token ?? ''}`);
      break;
    case 'basic':
      // REST Client and JetBrains both encode "Basic <user> <password>".
      out.headers.push(`Authorization: Basic ${a.username ?? ''} ${a.password ?? ''}`);
      break;
    case 'digest':
      out.headers.push(`Authorization: Digest ${a.username ?? ''} ${a.password ?? ''}`);
      break;
    case 'apiKey':
      if (a.in === 'query') out.query.push([a.name ?? 'api_key', a.value ?? '']);
      else out.headers.push(`${a.name ?? 'X-API-Key'}: ${a.value ?? ''}`);
      break;
    case 'oauth2':
      out.comments.push(`# OAuth2 ${a.grant ?? 'client_credentials'} via ${a.tokenUrl ?? '(token URL)'} — set {{token}}`);
      out.headers.push('Authorization: Bearer {{token}}');
      warnings.push(`${r.name}: OAuth2 exported as a Bearer {{token}} placeholder`);
      break;
  }
  return out;
}

export function exportHttpFile(requests: ImportedRequest[], variables: Record<string, unknown>, warnings: string[]): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(variables)) {
    lines.push(`@${k} = ${typeof v === 'string' ? v : JSON.stringify(v)}`);
  }
  if (lines.length) lines.push('');

  for (const r of requests) {
    const auth = httpAuthLines(r.auth, r, warnings);
    lines.push(`### ${r.folder ? `${r.folder} / ` : ''}${r.name}`);
    if (r.description) for (const d of r.description.split('\n').slice(0, 5)) lines.push(`# ${d}`);
    lines.push(...auth.comments);
    const withAuthQuery = auth.query.length ? { ...r, query: { ...(r.query ?? {}), ...Object.fromEntries(auth.query) } } : r;
    lines.push(`${r.method} ${fullUrl(withAuthQuery)}`);
    const headers = { ...(r.headers ?? {}) };
    const type = r.bodyType ?? (r.files?.length ? 'multipart' : r.bodyFile ? 'file' : r.body === undefined ? 'none' : typeof r.body === 'string' ? 'text' : 'json');
    let body: string | undefined;
    if (type === 'json' || type === 'auto') {
      if (r.body !== undefined) {
        body = typeof r.body === 'string' ? r.body : JSON.stringify(r.body, null, 2);
        if (!headerCt(r)) headers['Content-Type'] = r.contentType ?? 'application/json';
      }
    } else if (type === 'text') {
      body = typeof r.body === 'string' ? r.body : JSON.stringify(r.body);
      if (!headerCt(r) && r.contentType) headers['Content-Type'] = r.contentType;
    } else if (type === 'form') {
      body = Object.entries((r.body as Rec) ?? {})
        .flatMap(([k, v]) => (Array.isArray(v) ? v : [v]).map((x) => `${encodeURIComponent(k)}=${encodeURIComponent(String(x ?? '')).replace(/%7B/g, '{').replace(/%7D/g, '}')}`))
        .join('&');
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    } else if (type === 'multipart') {
      const boundary = 'ApiTesterBoundary';
      headers['Content-Type'] = `multipart/form-data; boundary=${boundary}`;
      const parts: string[] = [];
      for (const [k, v] of Object.entries((r.body as Rec) ?? {})) {
        parts.push(`--${boundary}`, `Content-Disposition: form-data; name="${k}"`, '', typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''));
      }
      for (const f of r.files ?? []) {
        const fname = f.filename ?? f.path.split(/[\\/]/).pop();
        parts.push(`--${boundary}`, `Content-Disposition: form-data; name="${f.field}"; filename="${fname}"`);
        if (f.contentType) parts.push(`Content-Type: ${f.contentType}`);
        parts.push('', `< ${f.path}`);
      }
      parts.push(`--${boundary}--`);
      body = parts.join('\n');
    } else if (type === 'file') {
      body = `< ${r.bodyFile ?? ''}`;
    } else if (type === 'binary') {
      warnings.push(`${r.name}: base64 binary body omitted from the .http export`);
    }
    for (const [k, v] of Object.entries(headers)) lines.push(`${k}: ${v}`);
    lines.push(...auth.headers);
    if (body !== undefined) lines.push('', body);
    lines.push('');
  }
  return lines.join('\n');
}
