// SPDX-License-Identifier: MIT
/**
 * Bruno importer: a single `.bru` file, or a collection directory
 * (`bruno.json`, `collection.bru`, `folder.bru`, `environments/*.bru`, nested
 * folders of request files).
 *
 * The .bru grammar is block-based:
 *   meta { name: Get user  seq: 1 }       dictionary blocks (key: value, ~ = disabled)
 *   get { url: {{host}}/users/:id  auth: bearer }
 *   body:json { … }                        text blocks (indented raw content)
 *   vars:secret [ token ]                  list blocks
 */

import { readdir, readFile, stat } from 'fs/promises';
import { join, relative, basename, dirname } from 'path';
import type { AuthSpec } from '../http/auth.js';
import { normaliseMethod, type ImportedRequest, type ImportResult } from './types.js';

export interface BruBlock {
  name: string;
  kind: 'dict' | 'text' | 'list';
  /** dict: enabled entries; list: items; text: undefined */
  entries?: Array<{ key: string; value: string; enabled: boolean }>;
  items?: string[];
  text?: string;
}

const TEXT_BLOCK = /^(body(:(json|text|xml|sparql|graphql|graphql:vars))?|script:(pre-request|post-response)|tests|docs)$/;

function dedent(lines: string[]): string {
  const indents = lines.filter((l) => l.trim()).map((l) => /^ */.exec(l)![0].length);
  const min = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(Math.min(min, /^ */.exec(l)![0].length))).join('\n').replace(/\s+$/, '');
}

export function parseBru(text: string): BruBlock[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: BruBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const header = /^([A-Za-z][\w:.-]*)\s*([{[])\s*$/.exec(lines[i]);
    if (!header) {
      i++;
      continue;
    }
    const name = header[1];
    const open = header[2];
    const close = open === '{' ? '}' : ']';
    const body: string[] = [];
    i++;
    while (i < lines.length && lines[i] !== close) {
      body.push(lines[i]);
      i++;
    }
    i++; // skip the closing line
    if (open === '[') {
      blocks.push({
        name,
        kind: 'list',
        items: body.map((l) => l.trim().replace(/,$/, '')).filter(Boolean),
      });
    } else if (TEXT_BLOCK.test(name)) {
      blocks.push({ name, kind: 'text', text: dedent(body) });
    } else {
      const entries: BruBlock['entries'] = [];
      for (const raw of body) {
        const line = raw.trim();
        if (!line) continue;
        const idx = line.indexOf(':');
        if (idx < 0) continue;
        let key = line.slice(0, idx).trim();
        const value = line.slice(idx + 1).trim();
        const enabled = !key.startsWith('~');
        if (!enabled) key = key.slice(1);
        entries.push({ key, value, enabled });
      }
      blocks.push({ name, kind: 'dict', entries });
    }
  }
  return blocks;
}

function dict(blocks: BruBlock[], name: string): Record<string, string> {
  const b = blocks.find((x) => x.name === name && x.kind === 'dict');
  const out: Record<string, string> = {};
  for (const e of b?.entries ?? []) if (e.enabled) out[e.key] = e.value;
  return out;
}

function text(blocks: BruBlock[], name: string): string | undefined {
  return blocks.find((x) => x.name === name && x.kind === 'text')?.text;
}

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'connect', 'trace'];

function authFrom(blocks: BruBlock[], mode: string | undefined): AuthSpec | 'inherit' | undefined {
  switch (mode) {
    case undefined:
    case '':
    case 'none':
      return undefined;
    case 'inherit':
      return 'inherit';
    case 'bearer':
      return { type: 'bearer', token: dict(blocks, 'auth:bearer').token ?? '' };
    case 'basic': {
      const d = dict(blocks, 'auth:basic');
      return { type: 'basic', username: d.username ?? '', password: d.password ?? '' };
    }
    case 'digest': {
      const d = dict(blocks, 'auth:digest');
      return { type: 'digest', username: d.username ?? '', password: d.password ?? '' };
    }
    case 'apikey': {
      const d = dict(blocks, 'auth:apikey');
      return { type: 'apiKey', name: d.key ?? 'X-API-Key', value: d.value ?? '', in: d.placement === 'queryparams' ? 'query' : 'header' };
    }
    case 'oauth2': {
      const d = dict(blocks, 'auth:oauth2');
      if (d.grant_type === 'client_credentials' || d.grant_type === 'password') {
        return {
          type: 'oauth2',
          grant: d.grant_type,
          tokenUrl: d.access_token_url,
          clientId: d.client_id,
          clientSecret: d.client_secret,
          username: d.username,
          password: d.password,
          scope: d.scope,
          clientAuth: d.credentials_placement === 'body' ? 'body' : 'basic',
        };
      }
      return undefined;
    }
    default:
      return undefined;
  }
}

/** Convert one parsed .bru request file. Returns undefined for non-request files. */
export function bruToRequest(
  blocks: BruBlock[],
  folder: string | undefined,
  fallbackName: string,
  warnings: string[],
  inherited?: AuthSpec
): ImportedRequest | undefined {
  const methodBlock = blocks.find((b) => METHODS.includes(b.name) && b.kind === 'dict');
  if (!methodBlock) return undefined;
  const meta = dict(blocks, 'meta');
  const name = meta.name || fallbackName;
  const where = folder ? `${folder}/${name}` : name;
  const m = dict(blocks, methodBlock.name);
  let url = m.url ?? '';
  const pathParams = dict(blocks, 'params:path');
  for (const [k, v] of Object.entries(pathParams)) url = url.replace(new RegExp(`/:${k}(?=/|\\?|$)`, 'g'), `/${v}`);

  const req: ImportedRequest = {
    name,
    folder,
    method: normaliseMethod(methodBlock.name, warnings, where),
    url,
    headers: dict(blocks, 'headers'),
    description: text(blocks, 'docs'),
  };
  const q = blocks.find((b) => (b.name === 'params:query' || b.name === 'query') && b.kind === 'dict');
  if (q?.entries?.some((e) => e.enabled)) {
    // Bruno also mirrors enabled query params into the URL; only add those not already there.
    const query: Record<string, string> = {};
    for (const e of q.entries) if (e.enabled && !new RegExp(`[?&]${e.key}=`).test(url)) query[e.key] = e.value;
    if (Object.keys(query).length) req.query = query;
  }

  const bodyMode = m.body ?? 'none';
  switch (bodyMode) {
    case 'json':
      req.body = text(blocks, 'body:json') ?? text(blocks, 'body') ?? '';
      req.bodyType = 'text';
      req.contentType = 'application/json';
      break;
    case 'text':
      req.body = text(blocks, 'body:text') ?? '';
      req.bodyType = 'text';
      break;
    case 'xml':
      req.body = text(blocks, 'body:xml') ?? '';
      req.bodyType = 'text';
      req.contentType = 'application/xml';
      break;
    case 'formUrlEncoded':
      req.body = dict(blocks, 'body:form-urlencoded');
      req.bodyType = 'form';
      break;
    case 'multipartForm': {
      const fields: Record<string, string> = {};
      const files: NonNullable<ImportedRequest['files']> = [];
      for (const [k, v] of Object.entries(dict(blocks, 'body:multipart-form'))) {
        const f = /^@file\((.*)\)$/.exec(v);
        if (f) for (const p of f[1].split('|').filter(Boolean)) files.push({ field: k, path: p });
        else fields[k] = v;
      }
      req.body = fields;
      req.bodyType = 'multipart';
      if (files.length) req.files = files;
      break;
    }
    case 'graphql': {
      const query = text(blocks, 'body:graphql') ?? '';
      const varsText = text(blocks, 'body:graphql:vars');
      let variables: unknown;
      if (varsText) {
        try {
          variables = JSON.parse(varsText);
        } catch {
          warnings.push(`${where}: GraphQL variables are not valid JSON and were dropped`);
        }
      }
      req.body = { query, ...(variables !== undefined ? { variables } : {}) };
      req.bodyType = 'json';
      break;
    }
    case 'none':
      break;
    default:
      warnings.push(`${where}: body mode "${bodyMode}" is not supported`);
  }

  const auth = authFrom(blocks, m.auth);
  const effective = auth === 'inherit' ? inherited : auth;
  if (effective && effective.type !== 'none') req.auth = effective;
  if (text(blocks, 'script:pre-request') || text(blocks, 'script:post-response') || text(blocks, 'tests')) {
    warnings.push(`${where}: scripts/tests are not executed`);
  }
  return req;
}

export function bruVariables(blocks: BruBlock[], names: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const n of names) Object.assign(out, dict(blocks, n));
  return out;
}

const MAX_FILES = 2000;

async function listBruFiles(dir: string, root: string, acc: string[], depth = 0): Promise<void> {
  if (depth > 12 || acc.length > MAX_FILES) return;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (dir === root && e.name === 'environments') continue;
      await listBruFiles(full, root, acc, depth + 1);
    } else if (e.name.endsWith('.bru')) acc.push(full);
  }
}

export async function importBruno(path: string, environmentName?: string): Promise<ImportResult> {
  const st = await stat(path);
  const warnings: string[] = [];
  const variables: Record<string, unknown> = {};
  const secretKeys: string[] = [];
  let environments: string[] = [];

  if (st.isFile()) {
    const blocks = parseBru(await readFile(path, 'utf8'));
    const req = bruToRequest(blocks, undefined, basename(path, '.bru'), warnings);
    if (!req) throw new Error(`${path} is not a Bruno request file (no method block)`);
    Object.assign(variables, bruVariables(blocks, ['vars:pre-request', 'vars']));
    return { format: 'bruno', name: req.name, requests: [req], variables, secretKeys, warnings };
  }

  const root = path;
  let name = basename(root);
  try {
    const meta = JSON.parse(await readFile(join(root, 'bruno.json'), 'utf8'));
    if (typeof meta.name === 'string') name = meta.name;
  } catch {
    warnings.push('No bruno.json found; treating the directory as a collection anyway');
  }

  // Collection-level headers/auth/vars.
  let collectionAuth: AuthSpec | undefined;
  let collectionHeaders: Record<string, string> = {};
  try {
    const blocks = parseBru(await readFile(join(root, 'collection.bru'), 'utf8'));
    const a = authFrom(blocks, dict(blocks, 'auth').mode);
    if (a && a !== 'inherit') collectionAuth = a;
    collectionHeaders = dict(blocks, 'headers');
    Object.assign(variables, bruVariables(blocks, ['vars:pre-request']));
  } catch {
    /* optional */
  }

  // Environments.
  const envDir = join(root, 'environments');
  try {
    environments = (await readdir(envDir)).filter((f) => f.endsWith('.bru')).map((f) => f.slice(0, -4));
  } catch {
    environments = [];
  }
  if (environmentName) {
    if (!environments.includes(environmentName)) {
      throw new Error(`Environment "${environmentName}" not found (available: ${environments.join(', ') || 'none'})`);
    }
    const blocks = parseBru(await readFile(join(envDir, `${environmentName}.bru`), 'utf8'));
    Object.assign(variables, dict(blocks, 'vars'));
    for (const b of blocks) if (b.name === 'vars:secret' && b.kind === 'list') secretKeys.push(...(b.items ?? []).map((s) => s.replace(/^~/, '')));
    if (secretKeys.length) warnings.push(`Secret variables (${secretKeys.join(', ')}) have no stored value in the export; provide them via variables or an environment`);
  }

  const files: string[] = [];
  await listBruFiles(root, root, files);
  if (files.length > MAX_FILES) warnings.push(`Only the first ${MAX_FILES} .bru files were read`);

  const folderAuth = new Map<string, AuthSpec | undefined>();
  const requests: ImportedRequest[] = [];
  for (const file of files.slice(0, MAX_FILES)) {
    const base = basename(file);
    if (base === 'collection.bru' || base === 'folder.bru') continue;
    const dir = dirname(file);
    if (!folderAuth.has(dir)) {
      let a: AuthSpec | undefined;
      try {
        const fb = parseBru(await readFile(join(dir, 'folder.bru'), 'utf8'));
        const fa = authFrom(fb, dict(fb, 'auth').mode);
        a = fa && fa !== 'inherit' ? fa : undefined;
      } catch {
        a = undefined;
      }
      folderAuth.set(dir, a);
    }
    const rel = relative(root, dir).split(/[\\/]/).filter(Boolean).join('/');
    const blocks = parseBru(await readFile(file, 'utf8'));
    const req = bruToRequest(blocks, rel || undefined, base.slice(0, -4), warnings, folderAuth.get(dir) ?? collectionAuth);
    if (!req) continue;
    req.headers = { ...collectionHeaders, ...req.headers };
    requests.push(req);
  }

  return { format: 'bruno', name, requests, variables, secretKeys, environments, warnings };
}
