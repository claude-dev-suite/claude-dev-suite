// SPDX-License-Identifier: MIT
/**
 * Insomnia importer: v4 JSON exports (`_type: export`) and v5 YAML collections
 * (`type: collection.insomnia.rest/5.x`).
 *
 * Variables are NOT substituted at import. The old importer substituted while
 * reading and applied caller overrides afterwards, so an override never reached
 * a URL; the handler now merges collection < environment < overrides first and
 * substitutes once.
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

export function isInsomniaV4(doc: unknown): boolean {
  const d = obj(doc);
  return d._type === 'export' && Array.isArray(d.resources);
}

export function isInsomniaV5(doc: unknown): boolean {
  const t = obj(doc).type;
  return typeof t === 'string' && /^collection\.insomnia\.rest\/5/.test(t);
}

function convertAuth(a: unknown, warnings: string[], where: string): AuthSpec | undefined {
  const auth = obj(a);
  if (!auth.type || auth.disabled === true) return undefined;
  switch (auth.type) {
    case 'none':
      return { type: 'none' };
    case 'bearer':
      if (auth.prefix && auth.prefix !== 'Bearer') {
        warnings.push(`${where}: custom bearer prefix "${String(auth.prefix)}" replaced by "Bearer"`);
      }
      return { type: 'bearer', token: String(auth.token ?? '') };
    case 'basic':
      return { type: 'basic', username: String(auth.username ?? ''), password: String(auth.password ?? '') };
    case 'digest':
      return { type: 'digest', username: String(auth.username ?? ''), password: String(auth.password ?? '') };
    case 'apikey':
      return {
        type: 'apiKey',
        name: String(auth.key ?? 'X-API-Key'),
        value: String(auth.value ?? ''),
        in: auth.addTo === 'queryParams' ? 'query' : 'header',
      };
    case 'oauth2': {
      const grant = String(auth.grantType ?? '');
      if (grant === 'client_credentials' || grant === 'password') {
        return {
          type: 'oauth2',
          grant: grant === 'password' ? 'password' : 'client_credentials',
          tokenUrl: auth.accessTokenUrl as string | undefined,
          clientId: auth.clientId as string | undefined,
          clientSecret: auth.clientSecret as string | undefined,
          username: auth.username as string | undefined,
          password: auth.password as string | undefined,
          scope: auth.scope as string | undefined,
          audience: auth.audience as string | undefined,
          clientAuth: auth.credentialsInBody ? 'body' : 'basic',
        };
      }
      warnings.push(`${where}: OAuth2 grant "${grant}" needs a browser flow; supply a token via auth`);
      return undefined;
    }
    default:
      warnings.push(`${where}: auth type "${String(auth.type)}" is not supported and was skipped`);
      return undefined;
  }
}

function convertRequest(r: Rec, folder: string | undefined, warnings: string[]): ImportedRequest {
  const name = String(r.name ?? 'Unnamed');
  const where = folder ? `${folder}/${name}` : name;
  const req: ImportedRequest = {
    name,
    folder,
    method: normaliseMethod(r.method, warnings, where),
    url: String(r.url ?? ''),
    headers: headerListToRecord(arr(r.headers) as never),
    description: typeof r.description === 'string' && r.description ? r.description : undefined,
  };
  const query: Record<string, string | string[]> = {};
  for (const p of arr(r.parameters)) {
    if (p.disabled === true || typeof p.name !== 'string') continue;
    const v = String(p.value ?? '');
    const prev = query[p.name];
    query[p.name] = prev === undefined ? v : Array.isArray(prev) ? [...prev, v] : [prev, v];
  }
  if (Object.keys(query).length) req.query = query;

  const body = obj(r.body);
  const mime = String(body.mimeType ?? '');
  if (mime === 'application/x-www-form-urlencoded') {
    const fields: Record<string, string> = {};
    for (const p of arr(body.params)) if (p.disabled !== true && typeof p.name === 'string') fields[p.name] = String(p.value ?? '');
    req.body = fields;
    req.bodyType = 'form';
  } else if (mime === 'multipart/form-data') {
    const fields: Record<string, string> = {};
    const files: NonNullable<ImportedRequest['files']> = [];
    for (const p of arr(body.params)) {
      if (p.disabled === true || typeof p.name !== 'string') continue;
      if (p.type === 'file') {
        if (p.fileName) files.push({ field: p.name, path: String(p.fileName) });
        else warnings.push(`${where}: multipart file "${p.name}" has no path`);
      } else fields[p.name] = String(p.value ?? '');
    }
    req.body = fields;
    req.bodyType = 'multipart';
    if (files.length) req.files = files;
  } else if (typeof body.fileName === 'string' && body.fileName) {
    req.bodyType = 'file';
    req.bodyFile = body.fileName;
    if (mime) req.contentType = mime;
  } else if (typeof body.text === 'string' && body.text !== '') {
    if (mime === 'application/graphql') {
      // Insomnia stores GraphQL as the JSON envelope already.
      req.body = body.text;
      req.bodyType = 'text';
      req.contentType = 'application/json';
    } else {
      req.body = body.text;
      req.bodyType = 'text';
      if (mime) req.contentType = mime;
    }
  }

  const auth = convertAuth(r.authentication, warnings, where);
  if (auth && auth.type !== 'none') req.auth = auth;
  return req;
}

/** Insomnia writes `{{ _.name }}`; normalise to the portable `{{name}}`. */
function normaliseTemplates<T>(v: T): T {
  if (typeof v === 'string') return v.replace(/\{\{\s*(?:_\.)?([\w.$-]+)\s*\}\}/g, '{{$1}}') as T;
  if (Array.isArray(v)) return v.map(normaliseTemplates) as T;
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [normaliseTemplates(k), normaliseTemplates(x)])) as T;
  }
  return v;
}

function noteTemplateTags(requests: ImportedRequest[], warnings: string[]): void {
  if (JSON.stringify(requests).includes('{%')) {
    warnings.push('Insomnia template tags ({% … %}, e.g. response chaining) are not evaluated; use run_scenario extraction instead');
  }
}

export function importInsomniaV4(doc: unknown, environmentName?: string): ImportResult {
  const d = obj(doc);
  if (!isInsomniaV4(d)) throw new Error('Not an Insomnia v4 export (_type must be "export")');
  const resources = arr(d.resources);
  const warnings: string[] = [];
  const workspace = resources.find((r) => r._type === 'workspace');
  if (!workspace) throw new Error('Invalid Insomnia export: no workspace found');

  const envs = resources.filter((r) => r._type === 'environment');
  const base = envs.find((e) => e.parentId === workspace._id) ?? envs[0];
  const subs = base ? envs.filter((e) => e.parentId === base._id) : [];
  const variables: Record<string, unknown> = { ...obj(base?.data) };
  if (environmentName) {
    const sub = subs.find((e) => e.name === environmentName);
    if (!sub) throw new Error(`Environment "${environmentName}" not found (available: ${subs.map((s) => String(s.name)).join(', ') || 'none'})`);
    Object.assign(variables, obj(sub.data));
  }

  const folders = new Map<string, Rec>();
  for (const r of resources) if (r._type === 'request_group') folders.set(String(r._id), r);
  const folderPath = (parentId: unknown): string | undefined => {
    const parts: string[] = [];
    let id = parentId as string | undefined;
    let guard = 0;
    while (id && folders.has(id) && guard++ < 50) {
      const f = folders.get(id)!;
      parts.unshift(String(f.name));
      id = f.parentId as string | undefined;
    }
    return parts.length ? parts.join('/') : undefined;
  };
  // Folder-level auth (newer v4 exports): inherited by requests without their own.
  const folderAuth = (parentId: unknown, where: string): AuthSpec | undefined => {
    let id = parentId as string | undefined;
    let guard = 0;
    while (id && folders.has(id) && guard++ < 50) {
      const f = folders.get(id)!;
      const a = convertAuth(f.authentication, warnings, where);
      if (a) return a;
      id = f.parentId as string | undefined;
    }
    return undefined;
  };

  const requests: ImportedRequest[] = [];
  for (const r of resources) {
    if (r._type === 'grpc_request' || r._type === 'websocket_request') {
      warnings.push(`"${String(r.name)}": ${String(r._type)} is not imported`);
      continue;
    }
    if (r._type !== 'request') continue;
    const folder = folderPath(r.parentId);
    const req = convertRequest(r, folder, warnings);
    if (!req.auth && !obj(r.authentication).type) {
      const fa = folderAuth(r.parentId, req.name);
      if (fa && fa.type !== 'none') req.auth = fa;
    }
    requests.push(req);
  }
  noteTemplateTags(requests, warnings);

  return {
    format: 'insomnia-v4',
    name: String(workspace.name ?? 'Insomnia workspace'),
    description: typeof workspace.description === 'string' && workspace.description ? workspace.description : undefined,
    requests: normaliseTemplates(requests),
    variables,
    secretKeys: [],
    environments: subs.map((s) => String(s.name)),
    warnings,
  };
}

export function importInsomniaV5(doc: unknown, environmentName?: string): ImportResult {
  const d = obj(doc);
  if (!isInsomniaV5(d)) throw new Error('Not an Insomnia v5 collection');
  const warnings: string[] = [];
  const envRoot = obj(d.environments);
  const variables: Record<string, unknown> = { ...obj(envRoot.data) };
  const subs = arr(envRoot.subEnvironments);
  if (environmentName) {
    const sub = subs.find((e) => e.name === environmentName);
    if (!sub) throw new Error(`Environment "${environmentName}" not found (available: ${subs.map((s) => String(s.name)).join(', ') || 'none'})`);
    Object.assign(variables, obj(sub.data));
  }

  const requests: ImportedRequest[] = [];
  const walk = (items: unknown, folder: string | undefined, inherited: AuthSpec | undefined) => {
    for (const it of arr(items)) {
      if (Array.isArray(it.children)) {
        const name = String(it.name ?? 'Folder');
        const path = folder ? `${folder}/${name}` : name;
        const fa = convertAuth(it.authentication, warnings, path);
        Object.assign(variables, obj(obj(it.environment)));
        walk(it.children, path, fa ?? inherited);
        continue;
      }
      if (it.url === undefined && it.method === undefined) continue;
      const req = convertRequest(it, folder, warnings);
      if (!req.auth && !obj(it.authentication).type && inherited && inherited.type !== 'none') req.auth = inherited;
      requests.push(req);
    }
  };
  walk(d.collection, undefined, undefined);
  noteTemplateTags(requests, warnings);

  return {
    format: 'insomnia-v5',
    name: String(d.name ?? 'Insomnia collection'),
    requests: normaliseTemplates(requests),
    variables,
    secretKeys: [],
    environments: subs.map((s) => String(s.name)),
    warnings,
  };
}
