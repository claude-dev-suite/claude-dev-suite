// SPDX-License-Identifier: MIT
/**
 * One normalised operation model for Swagger 2.0, OpenAPI 3.0 and 3.1.
 *
 * The old generators read only OAS 3 `requestBody.content['application/json']`
 * and `components.schemas`, so for a Swagger 2 spec every body parameter,
 * `host`/`basePath` and `responses.*.schema` was silently ignored — tests and
 * mocks came out empty but "successful". Everything downstream now consumes
 * this model instead of the raw document.
 */

import type { LoadedSpec } from './loader.js';

export type Schema = Record<string, unknown>;
export type Dialect = 'swagger-2.0' | 'openapi-3.0' | 'openapi-3.1';

export interface MediaDef {
  schema?: Schema;
  example?: unknown;
  /** Named examples, values only. */
  examples?: Record<string, unknown>;
}

export interface ApiParameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required: boolean;
  schema?: Schema;
  example?: unknown;
  style?: string;
  explode?: boolean;
}

export interface ApiResponse {
  description?: string;
  content: Record<string, MediaDef>;
  headers: Record<string, { schema?: Schema; required?: boolean }>;
}

export interface SecurityScheme {
  type: 'http' | 'apiKey' | 'oauth2' | 'openIdConnect' | 'mutualTLS' | 'unknown';
  scheme?: string; // http: bearer | basic | digest
  in?: 'header' | 'query' | 'cookie';
  name?: string;
  tokenUrl?: string;
}

export interface ApiOperation {
  method: string; // upper-case
  path: string;
  operationId?: string;
  summary?: string;
  description?: string;
  tags: string[];
  deprecated: boolean;
  parameters: ApiParameter[];
  requestBody?: { required: boolean; content: Record<string, MediaDef> };
  responses: Record<string, ApiResponse>;
  /** OR-list of AND-sets of scheme names. Empty = no auth. */
  security: string[][];
}

export interface ApiModel {
  title: string;
  version: string;
  dialect: Dialect;
  servers: string[];
  operations: ApiOperation[];
  securitySchemes: Record<string, SecurityScheme>;
  warnings: string[];
}

const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const;

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

export function detectDialect(doc: Record<string, unknown>): Dialect {
  if (typeof doc.swagger === 'string' && doc.swagger.startsWith('2')) return 'swagger-2.0';
  if (typeof doc.openapi === 'string') return doc.openapi.startsWith('3.1') || doc.openapi.startsWith('3.2') ? 'openapi-3.1' : 'openapi-3.0';
  throw new Error('Not an OpenAPI/Swagger document (no "openapi" or "swagger" version field)');
}

/** Swagger 2 non-body parameters carry schema keywords inline. */
const SCHEMA_KEYS = [
  'type', 'format', 'items', 'enum', 'default', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum',
  'minLength', 'maxLength', 'pattern', 'minItems', 'maxItems', 'uniqueItems', 'multipleOf',
];

function swagger2InlineSchema(p: Record<string, unknown>): Schema {
  const s: Schema = {};
  for (const k of SCHEMA_KEYS) if (p[k] !== undefined) s[k] = p[k];
  if (s.type === 'file') {
    s.type = 'string';
    s.format = 'binary';
  }
  return s;
}

function mediaFromOas3(content: unknown): Record<string, MediaDef> {
  const out: Record<string, MediaDef> = {};
  for (const [mime, m] of Object.entries(obj(content))) {
    const media = obj(m);
    const examples: Record<string, unknown> = {};
    for (const [name, ex] of Object.entries(obj(media.examples))) {
      const e = obj(ex);
      if ('value' in e) examples[name] = e.value;
    }
    out[mime] = {
      schema: media.schema ? obj(media.schema) : undefined,
      example: media.example,
      examples: Object.keys(examples).length ? examples : undefined,
    };
  }
  return out;
}

function resolveServerUrl(server: Record<string, unknown>): string {
  let url = String(server.url ?? '');
  for (const [name, v] of Object.entries(obj(server.variables))) {
    const def = obj(v).default;
    url = url.split(`{${name}}`).join(def === undefined ? '' : String(def));
  }
  return url;
}

function normaliseSecurity(req: unknown): string[][] {
  return arr(req).map((r) => Object.keys(obj(r)));
}

export function buildModel(loaded: LoadedSpec): ApiModel {
  const doc = loaded.doc;
  const dialect = detectDialect(doc);
  const info = obj(doc.info);
  const warnings = [...loaded.warnings];
  const swagger = dialect === 'swagger-2.0';

  // Servers
  let servers: string[];
  if (swagger) {
    const schemes = arr(doc.schemes).map(String);
    const basePath = typeof doc.basePath === 'string' ? doc.basePath : '';
    servers = doc.host
      ? (schemes.length ? schemes : ['https']).map((s) => `${s}://${doc.host}${basePath}`)
      : [basePath];
  } else {
    servers = arr(doc.servers).map((s) => resolveServerUrl(obj(s)));
    if (servers.length === 0) servers = ['/'];
  }
  servers = servers.map((s) => s.replace(/\/+$/, ''));

  // Security schemes
  const securitySchemes: Record<string, SecurityScheme> = {};
  const rawSchemes = swagger ? obj(doc.securityDefinitions) : obj(obj(doc.components).securitySchemes);
  for (const [name, raw] of Object.entries(rawSchemes)) {
    const s = obj(raw);
    const type = String(s.type ?? '');
    if (swagger && type === 'basic') securitySchemes[name] = { type: 'http', scheme: 'basic' };
    else if (type === 'http') securitySchemes[name] = { type: 'http', scheme: String(s.scheme ?? '').toLowerCase() };
    else if (type === 'apiKey') securitySchemes[name] = { type: 'apiKey', in: s.in as 'header', name: String(s.name ?? '') };
    else if (type === 'oauth2') {
      const flows = obj(s.flows);
      const tokenUrl =
        (s.tokenUrl as string | undefined) ??
        (obj(flows.clientCredentials).tokenUrl as string | undefined) ??
        (obj(flows.password).tokenUrl as string | undefined);
      securitySchemes[name] = { type: 'oauth2', tokenUrl };
    } else if (type === 'openIdConnect') securitySchemes[name] = { type: 'openIdConnect' };
    else if (type === 'mutualTLS') securitySchemes[name] = { type: 'mutualTLS' };
    else securitySchemes[name] = { type: 'unknown' };
  }
  const globalSecurity = normaliseSecurity(doc.security);
  const globalConsumes = arr(doc.consumes).map(String);
  const globalProduces = arr(doc.produces).map(String);

  const operations: ApiOperation[] = [];
  for (const [path, rawItem] of Object.entries(obj(doc.paths))) {
    const item = obj(rawItem);
    const pathParams = arr(item.parameters).map(obj);
    for (const method of METHODS) {
      const op = obj(item[method]);
      if (!item[method]) continue;

      // Merge path-level and operation-level parameters (operation wins on name+in).
      const merged = new Map<string, Record<string, unknown>>();
      for (const p of [...pathParams, ...arr(op.parameters).map(obj)]) merged.set(`${p.in}:${p.name}`, p);

      const parameters: ApiParameter[] = [];
      let requestBody: ApiOperation['requestBody'];
      const formParams: Record<string, unknown>[] = [];

      for (const p of merged.values()) {
        const where = String(p.in ?? '');
        if (swagger && where === 'body') {
          const consumes = arr(op.consumes).map(String);
          const mimes = consumes.length ? consumes : globalConsumes.length ? globalConsumes : ['application/json'];
          const content: Record<string, MediaDef> = {};
          for (const m of mimes) content[m] = { schema: obj(p.schema), example: p['x-example'] };
          requestBody = { required: p.required === true, content };
          continue;
        }
        if (swagger && where === 'formData') {
          formParams.push(p);
          continue;
        }
        if (!['path', 'query', 'header', 'cookie'].includes(where)) continue;
        parameters.push({
          name: String(p.name),
          in: where as ApiParameter['in'],
          required: where === 'path' ? true : p.required === true,
          schema: swagger ? swagger2InlineSchema(p) : p.schema ? obj(p.schema) : undefined,
          example: p.example ?? p['x-example'] ?? firstExample(p.examples),
          style: typeof p.style === 'string' ? p.style : undefined,
          explode: typeof p.explode === 'boolean' ? p.explode : undefined,
        });
      }

      if (formParams.length) {
        const properties: Record<string, unknown> = {};
        const required: string[] = [];
        let hasFile = false;
        for (const p of formParams) {
          const s = swagger2InlineSchema(p);
          if (s.format === 'binary') hasFile = true;
          properties[String(p.name)] = s;
          if (p.required) required.push(String(p.name));
        }
        const consumes = arr(op.consumes).map(String);
        const mime = hasFile || consumes.includes('multipart/form-data') ? 'multipart/form-data' : 'application/x-www-form-urlencoded';
        requestBody = { required: required.length > 0, content: { [mime]: { schema: { type: 'object', properties, required } } } };
      }

      if (!swagger && op.requestBody) {
        const rb = obj(op.requestBody);
        requestBody = { required: rb.required === true, content: mediaFromOas3(rb.content) };
      }

      const responses: Record<string, ApiResponse> = {};
      for (const [code, rawRes] of Object.entries(obj(op.responses))) {
        const r = obj(rawRes);
        const headers: ApiResponse['headers'] = {};
        for (const [hn, h] of Object.entries(obj(r.headers))) {
          const hh = obj(h);
          headers[hn] = { schema: swagger ? swagger2InlineSchema(hh) : hh.schema ? obj(hh.schema) : undefined, required: hh.required === true };
        }
        let content: Record<string, MediaDef>;
        if (swagger) {
          content = {};
          const produces = arr(op.produces).map(String);
          const mimes = produces.length ? produces : globalProduces.length ? globalProduces : ['application/json'];
          const examples = obj(r.examples);
          if (r.schema || Object.keys(examples).length) {
            for (const m of mimes) content[m] = { schema: r.schema ? obj(r.schema) : undefined, example: examples[m] };
          }
        } else {
          content = mediaFromOas3(r.content);
        }
        responses[code] = { description: r.description as string | undefined, content, headers };
      }

      operations.push({
        method: method.toUpperCase(),
        path,
        operationId: typeof op.operationId === 'string' ? op.operationId : undefined,
        summary: typeof op.summary === 'string' ? op.summary : undefined,
        description: typeof op.description === 'string' ? op.description : undefined,
        tags: arr(op.tags).map(String),
        deprecated: op.deprecated === true,
        parameters,
        requestBody,
        responses,
        security: op.security !== undefined ? normaliseSecurity(op.security) : globalSecurity,
      });
    }
  }

  return {
    title: String(info.title ?? 'API'),
    version: String(info.version ?? ''),
    dialect,
    servers,
    operations,
    securitySchemes,
    warnings,
  };
}

function firstExample(examples: unknown): unknown {
  const first = Object.values(obj(examples))[0];
  return first && typeof first === 'object' && 'value' in (first as object) ? (first as { value: unknown }).value : undefined;
}

/** Label used everywhere an operation is named. */
export function operationLabel(op: ApiOperation): string {
  return op.operationId ?? `${op.method} ${op.path}`;
}

/** Match a selector: operationId, "METHOD /path", or a bare path. */
export function matchesSelector(op: ApiOperation, selector: string): boolean {
  const s = selector.trim();
  if (op.operationId && op.operationId === s) return true;
  const m = /^([A-Za-z]+)\s+(\S+)$/.exec(s);
  if (m) return op.method === m[1].toUpperCase() && op.path === m[2];
  return op.path === s;
}

/** Choose a media type: JSON first, then any, then undefined. */
export function pickMedia(content: Record<string, MediaDef>, prefer?: string): [string, MediaDef] | undefined {
  const entries = Object.entries(content);
  if (entries.length === 0) return undefined;
  if (prefer) {
    const hit = entries.find(([m]) => m.toLowerCase().split(';')[0] === prefer.toLowerCase());
    if (hit) return hit;
  }
  return (
    entries.find(([m]) => /^application\/json/i.test(m)) ??
    entries.find(([m]) => /\+json|\/json/i.test(m)) ??
    entries[0]
  );
}

/** Select the response definition for a status: exact, then NXX range, then default. */
export function responseFor(op: ApiOperation, status: number): { key: string; res: ApiResponse } | undefined {
  const exact = op.responses[String(status)];
  if (exact) return { key: String(status), res: exact };
  const rangeKey = Object.keys(op.responses).find((k) => k.toUpperCase() === `${String(status)[0]}XX`);
  if (rangeKey) return { key: rangeKey, res: op.responses[rangeKey] };
  if (op.responses.default) return { key: 'default', res: op.responses.default };
  return undefined;
}

export function successStatuses(op: ApiOperation): number[] {
  const codes = Object.keys(op.responses)
    .filter((k) => /^2\d\d$/.test(k))
    .map(Number);
  if (codes.length) return codes.sort();
  if (Object.keys(op.responses).some((k) => k.toUpperCase() === '2XX') || op.responses.default) {
    return [200, 201, 202, 204];
  }
  return [op.method === 'POST' ? 201 : 200];
}

/**
 * Match a concrete request path against an operation path template.
 * Returns extracted path parameters or undefined.
 */
export function matchPath(template: string, actual: string): Record<string, string> | undefined {
  const tParts = template.split('/').filter((x, i) => i === 0 || x !== '');
  const aParts = actual.split('/').filter((x, i) => i === 0 || x !== '');
  if (tParts.length !== aParts.length) return undefined;
  const params: Record<string, string> = {};
  for (let i = 0; i < tParts.length; i++) {
    const t = tParts[i];
    const a = aParts[i];
    if (!t.includes('{')) {
      if (t !== a) return undefined;
      continue;
    }
    // Segment may mix literals and params: "{id}.json", "v{major}"
    const names: string[] = [];
    const re = new RegExp(
      '^' +
        t.replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\\?\{([^}]+)\\?\}/g, (_m, n: string) => {
          names.push(n);
          return '([^/]+)';
        }) +
        '$'
    );
    const m = re.exec(a);
    if (!m) return undefined;
    names.forEach((n, j) => {
      try {
        params[n] = decodeURIComponent(m[j + 1]);
      } catch {
        params[n] = m[j + 1];
      }
    });
  }
  return params;
}

/** Specificity score: literal segments beat templated ones (/pets/mine before /pets/{id}). */
export function pathSpecificity(template: string): number {
  return template.split('/').reduce((acc, seg) => acc + (seg.includes('{') ? 1 : 3), 0);
}

/** Find the operation serving `method` + `path` (path already stripped of any base path). */
export function findOperation(model: ApiModel, method: string, path: string): { op: ApiOperation; params: Record<string, string> } | undefined {
  const candidates = model.operations
    .filter((o) => o.method === method.toUpperCase())
    .sort((a, b) => pathSpecificity(b.path) - pathSpecificity(a.path));
  for (const op of candidates) {
    const params = matchPath(op.path, path);
    if (params) return { op, params };
  }
  return undefined;
}

/** Base paths of the servers (e.g. "/v1"), for stripping from request URLs. */
export function serverBasePaths(model: ApiModel): string[] {
  const out = new Set<string>();
  for (const s of model.servers) {
    try {
      const p = /^[a-z]+:\/\//i.test(s) ? new URL(s).pathname : s;
      const clean = p.replace(/\/+$/, '');
      if (clean) out.add(clean);
    } catch {
      /* ignore */
    }
  }
  return [...out].sort((a, b) => b.length - a.length);
}
