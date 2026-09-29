// SPDX-License-Identifier: MIT
/**
 * Assertions over a response: status, headers, JSONPath (equals, contains,
 * exists, type, regex, comparisons, length), raw body, response time, an inline
 * JSON Schema, and OpenAPI conformance against a spec operation.
 */

import { z } from 'zod';
import { query, deepEqual, JsonPathError } from './jsonpath.js';
import { validateJsonSchema } from '../spec/schema.js';
import { loadModel } from '../spec/index.js';
import { checkConformance, locateOperation } from '../spec/conformance.js';
import { previewValue } from '../util/limits.js';

export const AssertionSchema = z.object({
  target: z
    .enum(['status', 'header', 'jsonpath', 'body', 'responseTime', 'jsonSchema', 'openapi'])
    .describe('What to check'),
  path: z.string().optional().describe('JSONPath (jsonpath) or header name (header)'),
  op: z
    .enum(['equals', 'notEquals', 'contains', 'notContains', 'exists', 'notExists', 'type', 'matches', 'gt', 'gte', 'lt', 'lte', 'in', 'length'])
    .optional()
    .describe('Comparison (default: equals; responseTime: lt)'),
  value: z.unknown().optional().describe('Expected value / regex / type name / list for "in"'),
  schema: z.record(z.string(), z.unknown()).optional().describe('JSON Schema (target jsonSchema)'),
  spec: z.string().optional().describe('OpenAPI spec path or URL (target openapi)'),
  operationId: z.string().optional().describe('Operation to validate against (else matched by method + URL)'),
  name: z.string().optional().describe('Label shown in the report'),
});

export type Assertion = z.infer<typeof AssertionSchema>;

export interface AssertableResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  bodyIsJson: boolean;
  bodyText: string;
  timeMs: number;
  request: { method: string; url: string };
}

export interface AssertionResult {
  name: string;
  passed: boolean;
  expected?: unknown;
  actual?: unknown;
  message?: string;
  details?: unknown;
}

function typeOf(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number' && Number.isInteger(v)) return 'integer';
  return typeof v;
}

function toRegex(v: unknown): RegExp {
  if (v instanceof RegExp) return v;
  const s = String(v);
  const m = /^\/(.*)\/([a-z]*)$/s.exec(s);
  return m ? new RegExp(m[1], m[2]) : new RegExp(s);
}

function contains(haystack: unknown, needle: unknown): boolean {
  if (typeof haystack === 'string') return haystack.includes(String(needle));
  if (Array.isArray(haystack)) return haystack.some((x) => deepEqual(x, needle) || (typeof x === 'string' && typeof needle === 'string' && x === needle));
  if (haystack && typeof haystack === 'object' && needle && typeof needle === 'object') {
    // Partial object match
    return Object.entries(needle as Record<string, unknown>).every(([k, v]) => deepEqual((haystack as Record<string, unknown>)[k], v));
  }
  return false;
}

/** deepEqual, plus 200 == "200" (header values and status codes arrive as either). */
function looseEqual(a: unknown, b: unknown): boolean {
  if (deepEqual(a, b)) return true;
  if (typeof a === 'number' && typeof b === 'string') return b.trim() !== '' && Number(b) === a;
  if (typeof a === 'string' && typeof b === 'number') return a.trim() !== '' && Number(a) === b;
  return false;
}

function compareOp(op: string, actual: unknown, expected: unknown, found: boolean): { passed: boolean; message?: string } {
  switch (op) {
    case 'exists':
      return { passed: found };
    case 'notExists':
      return { passed: !found };
    case 'equals':
      return { passed: found && looseEqual(actual, expected) };
    case 'notEquals':
      return { passed: !looseEqual(actual, expected) };
    case 'contains':
      return { passed: found && contains(actual, expected) };
    case 'notContains':
      return { passed: !found || !contains(actual, expected) };
    case 'type': {
      const t = typeOf(actual);
      const want = String(expected);
      return { passed: found && (t === want || (want === 'number' && t === 'integer')), message: `type is ${found ? t : 'absent'}` };
    }
    case 'matches':
      try {
        return { passed: found && toRegex(expected).test(typeof actual === 'string' ? actual : JSON.stringify(actual)) };
      } catch (e) {
        return { passed: false, message: `Invalid regex: ${(e as Error).message}` };
      }
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const a = Number(actual);
      const b = Number(expected);
      if (!found || Number.isNaN(a) || Number.isNaN(b)) return { passed: false, message: 'not a number' };
      const passed = op === 'gt' ? a > b : op === 'gte' ? a >= b : op === 'lt' ? a < b : a <= b;
      return { passed };
    }
    case 'in':
      return { passed: found && Array.isArray(expected) && expected.some((e) => looseEqual(actual, e)) };
    case 'length': {
      const len = typeof actual === 'string' || Array.isArray(actual) ? actual.length : actual && typeof actual === 'object' ? Object.keys(actual).length : undefined;
      return { passed: found && len === Number(expected), message: `length is ${len ?? 'n/a'}` };
    }
  }
  return { passed: false, message: `Unknown op ${op}` };
}

export async function runAssertion(a: Assertion, res: AssertableResponse): Promise<AssertionResult> {
  const op = a.op ?? (a.target === 'responseTime' ? 'lt' : a.target === 'header' && a.value === undefined ? 'exists' : 'equals');
  const label = a.name ?? `${a.target}${a.path ? ` ${a.path}` : ''} ${op}${a.value !== undefined ? ` ${JSON.stringify(a.value)}` : ''}`;

  try {
    switch (a.target) {
      case 'status': {
        const r = compareOp(op, res.status, a.value, true);
        return { name: label, passed: r.passed, expected: a.value, actual: res.status, message: r.message };
      }
      case 'header': {
        if (!a.path) throw new Error('header assertion needs `path` (the header name)');
        const v = res.headers[a.path.toLowerCase()];
        const r = compareOp(op, v, a.value, v !== undefined);
        return { name: label, passed: r.passed, expected: a.value, actual: v, message: r.message };
      }
      case 'jsonpath': {
        if (!a.path) throw new Error('jsonpath assertion needs `path`');
        if (!res.bodyIsJson) return { name: label, passed: false, message: 'Response body is not JSON' };
        const q = query(res.body, a.path);
        const r = compareOp(op, q.value, a.value, q.found);
        return { name: label, passed: r.passed, expected: a.value, actual: previewValue(q.found ? q.value : undefined), message: r.message ?? (q.found ? undefined : 'path not found') };
      }
      case 'body': {
        const r = compareOp(op, res.bodyIsJson ? res.body : res.bodyText, a.value, true);
        return { name: label, passed: r.passed, expected: a.value, actual: previewValue(res.bodyText, 300), message: r.message };
      }
      case 'responseTime': {
        const r = compareOp(op, res.timeMs, a.value, true);
        return { name: label, passed: r.passed, expected: a.value, actual: res.timeMs };
      }
      case 'jsonSchema': {
        if (!a.schema) throw new Error('jsonSchema assertion needs `schema`');
        if (!res.bodyIsJson) return { name: label, passed: false, message: 'Response body is not JSON' };
        const v = validateJsonSchema(a.schema, res.body);
        return {
          name: a.name ?? 'body matches JSON Schema',
          passed: v.valid,
          message: v.schemaError,
          details: v.errors.length ? v.errors : undefined,
        };
      }
      case 'openapi': {
        if (!a.spec) throw new Error('openapi assertion needs `spec` (path or URL)');
        const model = await loadModel(a.spec);
        const loc = locateOperation(model, res.request.method, res.request.url, a.operationId);
        if (!loc) {
          return {
            name: a.name ?? 'conforms to OpenAPI',
            passed: false,
            message: a.operationId
              ? `operationId "${a.operationId}" not found in the spec`
              : `No operation in the spec matches ${res.request.method} ${res.request.url}`,
          };
        }
        const c = checkConformance(model, loc.op, res);
        return {
          name: a.name ?? `conforms to ${loc.op.operationId ?? `${loc.op.method} ${loc.op.path}`}`,
          passed: c.conforms,
          message: c.issues.join('; ') || undefined,
          details: c.schemaErrors.length || c.warnings.length ? { schemaErrors: c.schemaErrors, warnings: c.warnings } : undefined,
        };
      }
    }
  } catch (e) {
    const msg = e instanceof JsonPathError ? `Invalid JSONPath: ${e.message}` : (e as Error).message;
    return { name: label, passed: false, message: msg };
  }
  return { name: label, passed: false, message: 'Unknown assertion target' };
}

export async function runAssertions(list: Assertion[] | undefined, res: AssertableResponse): Promise<{ results: AssertionResult[]; passed: boolean }> {
  const results: AssertionResult[] = [];
  for (const a of list ?? []) results.push(await runAssertion(a, res));
  return { results, passed: results.every((r) => r.passed) };
}
