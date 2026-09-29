// SPDX-License-Identifier: MIT
/**
 * Test generation from OpenAPI 3.x / Swagger 2.0.
 *
 * Per operation: a happy-path test (documented success status, content type,
 * and the response BODY validated against its schema) plus negative cases —
 * missing required parameter, missing required body field, wrong field type,
 * wrong path-parameter type, missing body, missing credentials.
 *
 * Emits: json (test list + batch requests), scenario (runnable by
 * run_scenario), vitest, jest, pytest (+httpx +jsonschema), http, curl, httpie.
 */

import type { AuthSpec } from '../http/auth.js';
import type { BodyType } from '../http/body.js';
import {
  loadModel,
  operationLabel,
  pickMedia,
  successStatuses,
  toJsonSchema,
  objectShape,
  wrongTypeValue,
  type ApiModel,
  type ApiOperation,
  type Dialect,
} from '../spec/index.js';
import { buildSampleRequest, resolveBaseUrl, AUTH_VARS, type AuthRequirement } from '../spec/request-builder.js';

export type TestKind =
  | 'happy'
  | 'missing-required-param'
  | 'missing-required-field'
  | 'wrong-field-type'
  | 'wrong-path-param-type'
  | 'missing-body'
  | 'missing-auth';

export interface GeneratedTest {
  name: string;
  kind: TestKind;
  operationId?: string;
  description?: string;
  method: string;
  /** Path relative to the base URL, parameters substituted. */
  path: string;
  url: string;
  query: Record<string, string | string[]>;
  headers: Record<string, string>;
  body?: unknown;
  bodyType?: BodyType;
  contentType?: string;
  /** Credentials this test sends (placeholders); undefined when none/omitted. */
  auth?: AuthRequirement[];
  expectedStatus: number[];
  expectedContentType?: string;
  /** Standalone JSON Schema of the expected success body. */
  responseSchema?: Record<string, unknown>;
  tags?: string[];
}

export interface GenerateOptions {
  baseUrl?: string;
  includeNegativeTests?: boolean;
  filterTags?: string[];
  operations?: string[];
  maxTests?: number;
}

export interface GenerateTestsResult {
  apiName: string;
  apiVersion: string;
  dialect: Dialect;
  baseUrl: string;
  baseUrlIsVariable: boolean;
  tests: GeneratedTest[];
  totalEndpoints: number;
  totalTests: number;
  truncated: boolean;
  coverage: { paths: number; methods: number };
  warnings: string[];
}

const MAX_SCHEMA_CHARS = 60_000;

function responseExpectations(model: ApiModel, op: ApiOperation): { statuses: number[]; contentType?: string; schema?: Record<string, unknown>; warning?: string } {
  const statuses = successStatuses(op);
  const res = op.responses[String(statuses[0])] ?? op.responses['2XX'] ?? op.responses['2xx'] ?? op.responses.default;
  if (!res) return { statuses };
  const media = pickMedia(res.content);
  if (!media) return { statuses };
  const [mime, def] = media;
  if (!def.schema || !/json/i.test(mime)) return { statuses, contentType: mime };
  const schema = toJsonSchema(def.schema, model.dialect, 'response');
  const size = JSON.stringify(schema).length;
  if (size > MAX_SCHEMA_CHARS) {
    return { statuses, contentType: mime, warning: `${operationLabel(op)}: response schema (${size} chars) too large to inline; body not validated` };
  }
  return { statuses, contentType: mime, schema };
}

function testsForOperation(model: ApiModel, op: ApiOperation, baseUrl: string, negatives: boolean, warnings: string[]): GeneratedTest[] {
  const label = operationLabel(op);
  const sample = buildSampleRequest(model, op, { baseUrl, authMode: 'placeholders' });
  const exp = responseExpectations(model, op);
  if (exp.warning) warnings.push(exp.warning);
  const authReq = sample.authRequirements.filter((a) => a.kind !== 'unsupported');
  if (sample.authRequirements.some((a) => a.kind === 'unsupported')) {
    warnings.push(`${label}: a security scheme (mutualTLS/unknown) cannot be expressed; tests send no credentials for it`);
  }

  const base: Omit<GeneratedTest, 'name' | 'kind' | 'expectedStatus'> = {
    operationId: op.operationId,
    description: op.summary ?? op.description,
    method: op.method,
    path: sample.path,
    url: sample.url,
    query: sample.query,
    headers: stripAuthPlaceholders(sample.headers),
    body: sample.body,
    bodyType: sample.bodyType,
    contentType: sample.contentType,
    auth: authReq.length ? authReq : undefined,
    tags: op.tags,
  };
  // Query placeholders for apiKey-in-query are re-added by each renderer from `auth`.
  base.query = Object.fromEntries(Object.entries(base.query).filter(([, v]) => !isPlaceholder(v)));

  const tests: GeneratedTest[] = [
    {
      ...base,
      name: `${label} — happy path`,
      kind: 'happy',
      expectedStatus: exp.statuses,
      expectedContentType: exp.contentType,
      responseSchema: exp.schema,
    },
  ];
  if (!negatives) return tests;
  const BAD = [400, 422];

  // Missing required query/header parameters (one test each, max 3).
  for (const p of op.parameters.filter((x) => x.required && (x.in === 'query' || x.in === 'header')).slice(0, 3)) {
    const t: GeneratedTest = { ...base, name: `${label} — missing required ${p.in} "${p.name}"`, kind: 'missing-required-param', expectedStatus: BAD, query: { ...base.query }, headers: { ...base.headers } };
    if (p.in === 'query') delete t.query[p.name];
    else delete t.headers[p.name];
    tests.push(t);
  }

  // Path parameter of the wrong type.
  const numericPath = op.parameters.find((p) => p.in === 'path' && ['integer', 'number'].includes(String(p.schema?.type)));
  if (numericPath) {
    const path = op.path.replace(/\{([^}]+)\}/g, (_m, n: string) => (n === numericPath.name ? 'not-a-number' : encodeURIComponent(sample.pathParams[n] ?? '1')));
    tests.push({ ...base, name: `${label} — non-numeric path parameter "${numericPath.name}"`, kind: 'wrong-path-param-type', path, url: sample.url.replace(sample.path, path), expectedStatus: [400, 404, 422] });
  }

  // Body negatives (JSON / form object bodies).
  const media = sample.requestMedia;
  if (op.requestBody && media && sample.body && typeof sample.body === 'object' && !Array.isArray(sample.body)) {
    const shape = objectShape(media.def.schema);
    for (const field of shape.required.filter((f) => f in (sample.body as object)).slice(0, 3)) {
      const body = { ...(sample.body as Record<string, unknown>) };
      delete body[field];
      tests.push({ ...base, name: `${label} — missing required field "${field}"`, kind: 'missing-required-field', body, expectedStatus: BAD });
    }
    const typed = Object.entries(shape.properties).find(([name, s]) => name in (sample.body as object) && wrongTypeValue(s) !== undefined && !s.readOnly);
    if (typed && sample.bodyType === 'json') {
      const body = { ...(sample.body as Record<string, unknown>), [typed[0]]: wrongTypeValue(typed[1]) };
      tests.push({ ...base, name: `${label} — wrong type for "${typed[0]}"`, kind: 'wrong-field-type', body, expectedStatus: BAD });
    }
  }
  if (op.requestBody?.required) {
    tests.push({ ...base, name: `${label} — missing request body`, kind: 'missing-body', body: undefined, bodyType: undefined, contentType: undefined, expectedStatus: [400, 415, 422] });
  }

  if (authReq.length) {
    tests.push({ ...base, name: `${label} — without credentials`, kind: 'missing-auth', auth: undefined, expectedStatus: [401, 403] });
  }
  return tests;
}

function isPlaceholder(v: unknown): boolean {
  return typeof v === 'string' && Object.values(AUTH_VARS).some((n) => v.includes(`{{${n}}}`));
}

function stripAuthPlaceholders(headers: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(headers).filter(([, v]) => !isPlaceholder(v)));
}

export async function generateTests(specSource: string, options: GenerateOptions = {}): Promise<GenerateTestsResult> {
  const model = await loadModel(specSource);
  const { baseUrl, needsVariable } = resolveBaseUrl(model, options.baseUrl);
  const warnings = [...model.warnings];
  if (needsVariable) warnings.push('The spec has no absolute server URL; tests use {{baseUrl}} / API_BASE_URL');

  const selected = model.operations.filter((op) => {
    if (options.filterTags?.length && !op.tags.some((t) => options.filterTags!.includes(t))) return false;
    if (options.operations?.length) {
      return options.operations.some((s) => op.operationId === s || `${op.method} ${op.path}` === s.trim().replace(/^(\w+)/, (m) => m.toUpperCase()) || op.path === s);
    }
    return true;
  });
  if (selected.length === 0) {
    throw new Error(
      model.operations.length === 0 ? 'The spec defines no operations' : 'No operation matched filterTags/operations'
    );
  }
  const maxTests = options.maxTests ?? 500;
  const tests: GeneratedTest[] = [];
  let truncated = false;
  for (const op of selected) {
    const t = testsForOperation(model, op, baseUrl, options.includeNegativeTests !== false, warnings);
    if (tests.length + t.length > maxTests) {
      truncated = true;
      break;
    }
    tests.push(...t);
  }

  return {
    apiName: model.title,
    apiVersion: model.version,
    dialect: model.dialect,
    baseUrl,
    baseUrlIsVariable: needsVariable,
    tests,
    totalEndpoints: selected.length,
    totalTests: tests.length,
    truncated,
    coverage: { paths: new Set(selected.map((o) => o.path)).size, methods: selected.length },
    warnings: warnings.slice(0, 50),
  };
}

// ============================================================================
// Rendering
// ============================================================================

function authSpecFor(reqs: AuthRequirement[] | undefined): { auth?: AuthSpec; headers: Record<string, string>; query: Record<string, string> } {
  const out = { auth: undefined as AuthSpec | undefined, headers: {} as Record<string, string>, query: {} as Record<string, string> };
  for (const r of reqs ?? []) {
    if (r.kind === 'bearer') out.auth = { type: 'bearer', token: `{{${AUTH_VARS.token}}}` };
    else if (r.kind === 'basic') out.auth = { type: 'basic', username: `{{${AUTH_VARS.username}}}`, password: `{{${AUTH_VARS.password}}}` };
    else if (r.kind === 'digest') out.auth = { type: 'digest', username: `{{${AUTH_VARS.username}}}`, password: `{{${AUTH_VARS.password}}}` };
    else if (r.kind === 'apiKey' && r.name) {
      if (r.in === 'query') out.query[r.name] = `{{${AUTH_VARS.apiKey}}}`;
      else if (r.in === 'cookie') out.headers.Cookie = `${r.name}={{${AUTH_VARS.apiKey}}}`;
      else out.headers[r.name] = `{{${AUTH_VARS.apiKey}}}`;
    }
  }
  return out;
}

/** batch_request-compatible entries. */
export function toBatchFormat(tests: GeneratedTest[]): Array<Record<string, unknown>> {
  return tests.map((t) => {
    const a = authSpecFor(t.auth);
    return {
      name: t.name,
      method: t.method,
      url: t.url,
      query: { ...t.query, ...a.query },
      headers: { ...t.headers, ...a.headers },
      ...(t.body !== undefined ? { body: t.body, bodyType: t.bodyType } : {}),
      ...(t.contentType && t.body !== undefined ? { contentType: t.contentType } : {}),
      ...(a.auth ? { auth: a.auth } : {}),
      assert: [{ target: 'status', op: 'in', value: t.expectedStatus }],
    };
  });
}

/** A scenario document runnable by run_scenario. */
export function toScenario(result: GenerateTestsResult, specSource: string): Record<string, unknown> {
  return {
    name: `${result.apiName} ${result.apiVersion} — generated tests`.trim(),
    stopOnFailure: false,
    ...(result.baseUrlIsVariable ? {} : { variables: {} }),
    steps: result.tests.map((t) => {
      const a = authSpecFor(t.auth);
      const assertions: Array<Record<string, unknown>> = [{ target: 'status', op: 'in', value: t.expectedStatus }];
      if (t.kind === 'happy') {
        if (t.expectedContentType) assertions.push({ target: 'header', path: 'content-type', op: 'contains', value: t.expectedContentType.split(';')[0] });
        assertions.push({ target: 'openapi', spec: specSource, ...(t.operationId ? { operationId: t.operationId } : {}) });
      }
      return {
        name: t.name,
        request: {
          method: t.method,
          url: t.url,
          ...(Object.keys({ ...t.query, ...a.query }).length ? { query: { ...t.query, ...a.query } } : {}),
          ...(Object.keys({ ...t.headers, ...a.headers }).length ? { headers: { ...t.headers, ...a.headers } } : {}),
          ...(t.body !== undefined ? { body: t.body, bodyType: t.bodyType } : {}),
          ...(t.contentType && t.body !== undefined ? { contentType: t.contentType } : {}),
          ...(a.auth ? { auth: a.auth } : {}),
        },
        assert: assertions,
      };
    }),
  };
}

export type CodeFormat = 'vitest' | 'jest' | 'pytest' | 'http' | 'curl' | 'httpie';

export function generateTestCode(result: GenerateTestsResult, format: CodeFormat): { code: string; filename: string; requires: string[] } {
  switch (format) {
    case 'vitest':
    case 'jest':
      return renderJs(result, format);
    case 'pytest':
      return renderPytest(result);
    case 'http':
      return renderHttp(result);
    case 'curl':
      return { code: renderCurl(result), filename: 'api-tests.sh', requires: ['curl'] };
    case 'httpie':
      return { code: renderHttpie(result), filename: 'api-tests-httpie.sh', requires: ['httpie'] };
  }
}

function jsString(s: string): string {
  return JSON.stringify(s);
}

function codeBaseUrl(result: GenerateTestsResult): string {
  return result.baseUrlIsVariable ? '' : result.baseUrl;
}

function relPath(t: GeneratedTest, result: GenerateTestsResult): string {
  // Tests carry `path` relative to the base; for relative-server specs the base contains the server path.
  const serverPath = result.baseUrlIsVariable ? result.baseUrl.replace('{{baseUrl}}', '') : '';
  return serverPath + t.path;
}

function renderJs(result: GenerateTestsResult, fw: 'vitest' | 'jest'): { code: string; filename: string; requires: string[] } {
  const is2020 = result.dialect === 'openapi-3.1';
  const schemas: string[] = [];
  const schemaIndex = new Map<GeneratedTest, number>();
  result.tests.forEach((t) => {
    if (t.responseSchema) {
      schemaIndex.set(t, schemas.length);
      schemas.push(JSON.stringify(t.responseSchema, null, 2));
    }
  });

  const header =
    fw === 'vitest'
      ? [
          `import { describe, it, expect } from 'vitest';`,
          is2020 ? `import Ajv from 'ajv/dist/2020.js';` : `import Ajv from 'ajv';`,
        ]
      : [
          `// Jest (CommonJS). Uses the global fetch of Node 18+ — keep testEnvironment "node".`,
          `const { describe, it, expect } = require('@jest/globals');`,
          is2020 ? `const Ajv = require('ajv/dist/2020').default;` : `const Ajv = require('ajv').default;`,
        ];

  const lines: string[] = [
    `// Generated by dev-suite api-tester from "${result.apiName}" ${result.apiVersion}.`,
    `// Requires: ${fw}, ajv. Configure with API_BASE_URL, API_TOKEN, API_KEY, API_USERNAME, API_PASSWORD.`,
    ...header,
    '',
    `const ENV = process.env;`,
    `const BASE_URL = ENV.API_BASE_URL ?? ${jsString(codeBaseUrl(result))};`,
    `const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false });`,
    '',
    ...schemas.map((s, i) => `const SCHEMA_${i} = ${s};`),
    '',
    `function authHeaders(kind, name) {`,
    `  if (kind === 'bearer') return { Authorization: \`Bearer \${ENV.API_TOKEN ?? ''}\` };`,
    `  if (kind === 'basic') return { Authorization: 'Basic ' + Buffer.from(\`\${ENV.API_USERNAME ?? ''}:\${ENV.API_PASSWORD ?? ''}\`).toString('base64') };`,
    `  if (kind === 'apiKey-header') return { [name]: ENV.API_KEY ?? '' };`,
    `  if (kind === 'apiKey-cookie') return { Cookie: \`\${name}=\${ENV.API_KEY ?? ''}\` };`,
    `  return {};`,
    `}`,
    '',
    `async function call(method, path, { query = {}, headers = {}, json, form, multipart, text } = {}) {`,
    `  const url = new URL(BASE_URL + path);`,
    `  for (const [k, v] of Object.entries(query)) for (const x of [].concat(v)) url.searchParams.append(k, String(x));`,
    `  const init = { method, headers: { ...headers } };`,
    `  if (json !== undefined) { init.body = JSON.stringify(json); init.headers['Content-Type'] ??= 'application/json'; }`,
    `  if (form !== undefined) { init.body = new URLSearchParams(form).toString(); init.headers['Content-Type'] = 'application/x-www-form-urlencoded'; }`,
    `  if (multipart !== undefined) { const fd = new FormData(); for (const [k, v] of Object.entries(multipart)) fd.append(k, String(v)); init.body = fd; }`,
    `  if (text !== undefined) init.body = text;`,
    `  const res = await fetch(url, init);`,
    `  const body = await res.text();`,
    `  let data;`,
    `  try { data = body ? JSON.parse(body) : undefined; } catch { data = undefined; }`,
    `  return { status: res.status, headers: res.headers, body, data };`,
    `}`,
    '',
    `function expectSchema(schema, data) {`,
    `  const validate = ajv.compile(schema);`,
    `  if (!validate(data)) throw new Error('Response body does not match schema: ' + ajv.errorsText(validate.errors));`,
    `}`,
    '',
    `describe(${jsString(`${result.apiName} ${result.apiVersion}`.trim())}, () => {`,
  ];

  for (const t of result.tests) {
    const headersExpr: string[] = [];
    const query: Record<string, unknown> = { ...t.query };
    for (const a of t.auth ?? []) {
      if (a.kind === 'bearer') headersExpr.push(`...authHeaders('bearer')`);
      else if (a.kind === 'basic') headersExpr.push(`...authHeaders('basic')`);
      else if (a.kind === 'apiKey' && a.in === 'query') query[a.name!] = '__API_KEY__';
      else if (a.kind === 'apiKey') headersExpr.push(`...authHeaders('apiKey-${a.in ?? 'header'}', ${jsString(a.name ?? '')})`);
    }
    const hdrs = Object.entries(t.headers).map(([k, v]) => `${jsString(k)}: ${jsString(v)}`);
    if (t.contentType && t.body !== undefined && t.bodyType !== 'json' && t.bodyType !== 'form' && t.bodyType !== 'multipart') {
      hdrs.push(`'Content-Type': ${jsString(t.contentType)}`);
    }
    const opts: string[] = [];
    if (Object.keys(query).length) opts.push(`query: ${JSON.stringify(query).replace(/"__API_KEY__"/g, "ENV.API_KEY ?? ''")}`);
    if (hdrs.length || headersExpr.length) opts.push(`headers: { ${[...headersExpr, ...hdrs].join(', ')} }`);
    if (t.body !== undefined) {
      const key = t.bodyType === 'form' ? 'form' : t.bodyType === 'multipart' ? 'multipart' : t.bodyType === 'text' ? 'text' : 'json';
      opts.push(`${key}: ${JSON.stringify(t.body)}`);
    }
    lines.push(`  it(${jsString(t.name)}, async () => {`);
    lines.push(`    const res = await call(${jsString(t.method)}, ${jsString(relPath(t, result))}${opts.length ? `, { ${opts.join(', ')} }` : ''});`);
    lines.push(`    expect(${JSON.stringify(t.expectedStatus)}).toContain(res.status);`);
    if (t.kind === 'happy' && t.expectedContentType) {
      lines.push(`    expect(res.headers.get('content-type') ?? '').toContain(${jsString(t.expectedContentType.split(';')[0])});`);
    }
    if (t.kind === 'happy' && schemaIndex.has(t)) lines.push(`    expectSchema(SCHEMA_${schemaIndex.get(t)}, res.data);`);
    lines.push(`  });`);
    lines.push('');
  }
  lines.push('});', '');
  return {
    code: lines.join('\n'),
    filename: fw === 'vitest' ? 'api.generated.test.ts' : 'api.generated.test.js',
    requires: [fw, 'ajv'],
  };
}

function py(v: unknown, indent = 0): string {
  const pad = ' '.repeat(indent);
  if (v === null || v === undefined) return 'None';
  if (v === true) return 'True';
  if (v === false) return 'False';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'None';
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return v.length ? `[\n${v.map((x) => `${pad}    ${py(x, indent + 4)}`).join(',\n')},\n${pad}]` : '[]';
  const entries = Object.entries(v as Record<string, unknown>);
  if (!entries.length) return '{}';
  return `{\n${entries.map(([k, x]) => `${pad}    ${JSON.stringify(k)}: ${py(x, indent + 4)}`).join(',\n')},\n${pad}}`;
}

function pyIdent(s: string, used: Set<string>): string {
  let id = s.replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'case';
  if (/^\d/.test(id)) id = `t_${id}`;
  let out = id;
  let n = 2;
  while (used.has(out)) out = `${id}_${n++}`;
  used.add(out);
  return out;
}

function renderPytest(result: GenerateTestsResult): { code: string; filename: string; requires: string[] } {
  const validator = result.dialect === 'openapi-3.1' ? 'Draft202012Validator' : 'Draft7Validator';
  const schemaIndex = new Map<GeneratedTest, number>();
  const schemas: string[] = [];
  result.tests.forEach((t) => {
    if (t.responseSchema) {
      schemaIndex.set(t, schemas.length);
      schemas.push(`SCHEMA_${schemas.length} = ${py(t.responseSchema)}`);
    }
  });
  const used = new Set<string>();
  const lines: string[] = [
    `"""Generated by dev-suite api-tester from "${result.apiName}" ${result.apiVersion}.`,
    '',
    'Requires: pip install pytest httpx jsonschema',
    'Configure with API_BASE_URL, API_TOKEN, API_KEY, API_USERNAME, API_PASSWORD.',
    '"""',
    'import os',
    '',
    'import httpx',
    'import pytest',
    `from jsonschema import ${validator}`,
    '',
    `BASE_URL = os.environ.get("API_BASE_URL", ${JSON.stringify(codeBaseUrl(result))})`,
    '',
    ...schemas.flatMap((s) => [s, '']),
    '',
    'def auth_headers(kind, name=None):',
    '    if kind == "bearer":',
    '        return {"Authorization": f"Bearer {os.environ.get(\'API_TOKEN\', \'\')}"}',
    '    if kind == "apiKey-header":',
    '        return {name: os.environ.get("API_KEY", "")}',
    '    if kind == "apiKey-cookie":',
    '        return {"Cookie": f"{name}={os.environ.get(\'API_KEY\', \'\')}"}',
    '    return {}',
    '',
    '',
    'def basic_auth():',
    '    return (os.environ.get("API_USERNAME", ""), os.environ.get("API_PASSWORD", ""))',
    '',
    '',
    'def assert_schema(schema, data):',
    `    errors = sorted(${validator}(schema).iter_errors(data), key=lambda e: list(e.path))`,
    '    assert not errors, [f"{list(e.path)}: {e.message}" for e in errors[:5]]',
    '',
    '',
    '@pytest.fixture(scope="module")',
    'def client():',
    '    with httpx.Client(base_url=BASE_URL, timeout=30.0) as c:',
    '        yield c',
    '',
  ];

  for (const t of result.tests) {
    const fn = pyIdent(`test_${t.operationId ?? `${t.method}_${t.path}`}_${t.kind}`, used);
    const args: string[] = [];
    const headerParts: string[] = [];
    const query: Record<string, unknown> = { ...t.query };
    let basic = false;
    for (const a of t.auth ?? []) {
      if (a.kind === 'bearer') headerParts.push('**auth_headers("bearer")');
      else if (a.kind === 'basic') basic = true;
      else if (a.kind === 'apiKey' && a.in === 'query') query[a.name!] = '__API_KEY__';
      else if (a.kind === 'apiKey') headerParts.push(`**auth_headers("apiKey-${a.in ?? 'header'}", ${JSON.stringify(a.name)})`);
    }
    for (const [k, v] of Object.entries(t.headers)) headerParts.push(`${JSON.stringify(k)}: ${JSON.stringify(v)}`);
    if (t.contentType && t.body !== undefined && t.bodyType === 'text') headerParts.push(`"Content-Type": ${JSON.stringify(t.contentType)}`);
    if (Object.keys(query).length) args.push(`params=${py(query, 4).replace(/"__API_KEY__"/g, 'os.environ.get("API_KEY", "")')}`);
    if (headerParts.length) args.push(`headers={${headerParts.join(', ')}}`);
    if (basic) args.push('auth=basic_auth()');
    if (t.body !== undefined) {
      if (t.bodyType === 'form') args.push(`data=${py(t.body, 4)}`);
      else if (t.bodyType === 'multipart') args.push(`files={k: (None, str(v)) for k, v in ${py(t.body, 4)}.items()}`);
      else if (t.bodyType === 'text') args.push(`content=${JSON.stringify(String(t.body))}`);
      else args.push(`json=${py(t.body, 4)}`);
    }
    lines.push('');
    lines.push(`def ${fn}(client):`);
    lines.push(`    """${t.name.replace(/"/g, "'")}"""`);
    lines.push(`    r = client.request(${JSON.stringify(t.method)}, ${JSON.stringify(relPath(t, result))}${args.length ? ', ' + args.join(', ') : ''})`);
    lines.push(`    assert r.status_code in (${t.expectedStatus.join(', ')},), r.text[:500]`);
    if (t.kind === 'happy' && t.expectedContentType) lines.push(`    assert ${JSON.stringify(t.expectedContentType.split(';')[0])} in r.headers.get("content-type", "")`);
    if (t.kind === 'happy' && schemaIndex.has(t)) lines.push(`    assert_schema(SCHEMA_${schemaIndex.get(t)}, r.json())`);
    lines.push('');
  }
  return { code: lines.join('\n'), filename: 'test_api_generated.py', requires: ['pytest', 'httpx', 'jsonschema'] };
}

function renderHttp(result: GenerateTestsResult): { code: string; filename: string; requires: string[] } {
  const lines: string[] = [`# Generated by dev-suite api-tester from "${result.apiName}" ${result.apiVersion}`];
  lines.push(`@baseUrl = ${result.baseUrlIsVariable ? 'http://localhost:3000' : result.baseUrl}`);
  lines.push('@token = ', '@apiKey = ', '@username = ', '@password = ', '');
  for (const t of result.tests) {
    const a = authSpecFor(t.auth);
    const q = { ...t.query, ...a.query };
    const qs = Object.entries(q)
      .flatMap(([k, v]) => (Array.isArray(v) ? v : [v]).map((x) => `${encodeURIComponent(k)}=${String(x)}`))
      .join('&');
    lines.push(`### ${t.name}`);
    lines.push(`# expect: ${t.expectedStatus.join(' | ')}${t.expectedContentType && t.kind === 'happy' ? ` (${t.expectedContentType})` : ''}`);
    lines.push(`${t.method} {{baseUrl}}${relPath(t, result).replace(/^\{\{baseUrl\}\}/, '')}${qs ? `?${qs}` : ''}`);
    for (const [k, v] of Object.entries({ ...t.headers, ...a.headers })) lines.push(`${k}: ${v}`);
    if (a.auth?.type === 'bearer') lines.push('Authorization: Bearer {{token}}');
    if (a.auth?.type === 'basic') lines.push('Authorization: Basic {{username}} {{password}}');
    if (a.auth?.type === 'digest') lines.push('Authorization: Digest {{username}} {{password}}');
    if (t.body !== undefined) {
      if (t.bodyType === 'form') {
        lines.push('Content-Type: application/x-www-form-urlencoded', '', new URLSearchParams(t.body as Record<string, string>).toString());
      } else if (t.bodyType === 'text') {
        lines.push(`Content-Type: ${t.contentType ?? 'text/plain'}`, '', String(t.body));
      } else if (t.bodyType === 'multipart') {
        const b = 'ApiTesterBoundary';
        lines.push(`Content-Type: multipart/form-data; boundary=${b}`, '');
        for (const [k, v] of Object.entries(t.body as Record<string, unknown>)) lines.push(`--${b}`, `Content-Disposition: form-data; name="${k}"`, '', String(v));
        lines.push(`--${b}--`);
      } else {
        lines.push(`Content-Type: ${t.contentType ?? 'application/json'}`, '', JSON.stringify(t.body, null, 2));
      }
    }
    lines.push('');
  }
  return { code: lines.join('\n'), filename: 'api-tests.http', requires: ['VS Code REST Client or JetBrains HTTP Client'] };
}

function shq(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function shellUrl(t: GeneratedTest, result: GenerateTestsResult, extraQuery: Record<string, string>): string {
  const q = { ...t.query, ...extraQuery };
  const qs = Object.entries(q)
    .flatMap(([k, v]) => (Array.isArray(v) ? v : [v]).map((x) => `${encodeURIComponent(k)}=${encodeURIComponent(String(x))}`))
    .join('&');
  return `${'${API_BASE_URL:-'}${codeBaseUrl(result)}}${relPath(t, result)}${qs ? `?${qs}` : ''}`;
}

function renderCurl(result: GenerateTestsResult): string {
  const out = ['#!/usr/bin/env sh', `# Generated by dev-suite api-tester — set API_BASE_URL, API_TOKEN, API_KEY, API_USERNAME, API_PASSWORD`, ''];
  for (const t of result.tests) {
    const parts = [`curl -sS -o /dev/null -w '%{http_code}\\n' -X ${t.method}`];
    const q: Record<string, string> = {};
    for (const a of t.auth ?? []) {
      if (a.kind === 'bearer') parts.push(`-H "Authorization: Bearer $API_TOKEN"`);
      else if (a.kind === 'basic') parts.push(`-u "$API_USERNAME:$API_PASSWORD"`);
      else if (a.kind === 'digest') parts.push(`--digest -u "$API_USERNAME:$API_PASSWORD"`);
      else if (a.kind === 'apiKey' && a.in === 'query') q[a.name!] = '__KEY__';
      else if (a.kind === 'apiKey') parts.push(`-H "${a.name}: $API_KEY"`);
    }
    for (const [k, v] of Object.entries(t.headers)) parts.push(`-H ${shq(`${k}: ${v}`)}`);
    if (t.body !== undefined) {
      if (t.bodyType === 'form') parts.push(`--data ${shq(new URLSearchParams(t.body as Record<string, string>).toString())}`);
      else if (t.bodyType === 'multipart') for (const [k, v] of Object.entries(t.body as Record<string, unknown>)) parts.push(`-F ${shq(`${k}=${String(v)}`)}`);
      else {
        parts.push(`-H ${shq(`Content-Type: ${t.contentType ?? 'application/json'}`)}`);
        parts.push(`--data ${shq(typeof t.body === 'string' ? t.body : JSON.stringify(t.body))}`);
      }
    }
    const url = shellUrl(t, result, q).replace('__KEY__', '$API_KEY');
    parts.push(`"${url}"`);
    out.push(`# ${t.name} — expect ${t.expectedStatus.join('|')}`, parts.join(' \\\n  '), '');
  }
  return out.join('\n');
}

function renderHttpie(result: GenerateTestsResult): string {
  const out = ['#!/usr/bin/env sh', `# Generated by dev-suite api-tester — set API_BASE_URL, API_TOKEN, API_KEY, API_USERNAME, API_PASSWORD`, ''];
  for (const t of result.tests) {
    const q: Record<string, string> = {};
    const parts = ['http --print=h'];
    if (t.bodyType === 'form') parts.push('--form');
    for (const a of t.auth ?? []) {
      if (a.kind === 'basic') parts.push('-a "$API_USERNAME:$API_PASSWORD"');
      else if (a.kind === 'digest') parts.push('-A digest -a "$API_USERNAME:$API_PASSWORD"');
    }
    parts.push(t.method);
    const url = shellUrl(t, result, q);
    parts.push(`"${url}"`);
    for (const a of t.auth ?? []) {
      if (a.kind === 'bearer') parts.push(`"Authorization:Bearer $API_TOKEN"`);
      else if (a.kind === 'apiKey' && a.in === 'query') parts.push(`"${a.name}==$API_KEY"`);
      else if (a.kind === 'apiKey') parts.push(`"${a.name}:$API_KEY"`);
    }
    for (const [k, v] of Object.entries(t.headers)) parts.push(shq(`${k}:${v}`));
    if (t.body !== undefined && typeof t.body === 'object' && !Array.isArray(t.body)) {
      for (const [k, v] of Object.entries(t.body as Record<string, unknown>)) {
        parts.push(typeof v === 'string' ? shq(`${k}=${v}`) : shq(`${k}:=${JSON.stringify(v)}`));
      }
    } else if (t.body !== undefined) {
      parts.unshift(`echo ${shq(typeof t.body === 'string' ? t.body : JSON.stringify(t.body))} |`);
    }
    out.push(`# ${t.name} — expect ${t.expectedStatus.join('|')}`, parts.join(' '), '');
  }
  return out.join('\n');
}
