// SPDX-License-Identifier: MIT
/**
 * JSON-Schema validation of OpenAPI schemas with Ajv.
 *
 * The dereferenced spec is a graph (shared and cyclic nodes). Ajv needs a
 * tree with `$ref`s, so `toJsonSchema` hoists every node that is reached more
 * than once into `definitions`/`$defs` and references it — recursion becomes a
 * `$ref` cycle, which Ajv handles, instead of a JS object cycle, which it
 * cannot. The same pass rewrites the OpenAPI-specific dialect:
 *   - 3.0 / Swagger `nullable` / `x-nullable`  → type union with "null"
 *   - 3.0 boolean `exclusiveMinimum/Maximum`   → draft-06+ numeric form
 *   - Swagger `type: file`                     → string
 * OpenAPI 3.1 schemas are JSON Schema 2020-12 and go to Ajv2020 unchanged.
 */

import _Ajv, { type ValidateFunction, type ErrorObject } from 'ajv';
import _Ajv2020 from 'ajv/dist/2020.js';
import _addFormats from 'ajv-formats';
import type { Dialect, Schema } from './model.js';

// CJS default-export interop under esbuild/ESM.
const Ajv = ((_Ajv as unknown as { default?: unknown }).default ?? _Ajv) as typeof _Ajv;
const Ajv2020 = ((_Ajv2020 as unknown as { default?: unknown }).default ?? _Ajv2020) as typeof _Ajv;
const addFormats = ((_addFormats as unknown as { default?: unknown }).default ?? _addFormats) as (a: unknown) => void;

const SUBSCHEMA_MAP_KEYS = ['properties', 'patternProperties', 'definitions', '$defs', 'dependentSchemas'];
const SUBSCHEMA_ARRAY_KEYS = ['allOf', 'anyOf', 'oneOf', 'prefixItems'];
const SUBSCHEMA_SINGLE_KEYS = [
  'items', 'additionalProperties', 'not', 'if', 'then', 'else', 'contains', 'propertyNames',
  'unevaluatedItems', 'unevaluatedProperties', 'additionalItems',
];
// Keys whose values are data, never schemas.
const DATA_KEYS = new Set(['example', 'examples', 'default', 'enum', 'const', 'x-example']);

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function forEachSubschema(s: Record<string, unknown>, fn: (sub: unknown) => void): void {
  for (const k of SUBSCHEMA_MAP_KEYS) if (isObj(s[k])) Object.values(s[k] as object).forEach(fn);
  for (const k of SUBSCHEMA_ARRAY_KEYS) if (Array.isArray(s[k])) (s[k] as unknown[]).forEach(fn);
  for (const k of SUBSCHEMA_SINGLE_KEYS) {
    const v = s[k];
    if (Array.isArray(v)) v.forEach(fn); // draft-04 tuple items
    else if (isObj(v)) fn(v);
  }
}

function cloneData(v: unknown, depth = 0): unknown {
  if (depth > 50 || v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map((x) => cloneData(x, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) out[k] = cloneData(x, depth + 1);
  return out;
}

/**
 * Convert a (possibly cyclic) OpenAPI schema graph to a standalone JSON Schema.
 * `mode` drops readOnly properties from `required` for requests and writeOnly
 * ones for responses, as the OpenAPI spec prescribes.
 */
export function toJsonSchema(root: unknown, dialect: Dialect, mode: 'request' | 'response' = 'response'): Record<string, unknown> {
  if (!isObj(root)) return typeof root === 'boolean' ? { not: root ? {} : { not: {} } } : {};
  const defsKey = dialect === 'openapi-3.1' ? '$defs' : 'definitions';

  // Pass 1: reference counts over schema positions.
  const count = new Map<object, number>();
  const visit = (s: unknown) => {
    if (!isObj(s)) return;
    const c = count.get(s) ?? 0;
    count.set(s, c + 1);
    if (c > 0) return;
    forEachSubschema(s, visit);
  };
  visit(root);

  const names = new Map<object, string>();
  const defs: Record<string, unknown> = {};
  let counter = 0;

  const emit = (s: unknown): unknown => {
    if (typeof s === 'boolean') return s;
    if (!isObj(s)) return {};
    if ((count.get(s) ?? 0) > 1) {
      let name = names.get(s);
      if (!name) {
        const title = typeof s.title === 'string' ? s.title.replace(/[^A-Za-z0-9_]/g, '') : '';
        name = `${title || 'S'}_${counter++}`;
        names.set(s, name);
        defs[name] = {}; // placeholder while recursing
        defs[name] = emitBody(s);
      }
      return { $ref: `#/${defsKey}/${name}` };
    }
    return emitBody(s);
  };

  const emitBody = (s: Record<string, unknown>): unknown => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(s)) {
      if (k === 'x-unresolved-ref') continue;
      if (DATA_KEYS.has(k)) out[k] = cloneData(v);
      else if (SUBSCHEMA_MAP_KEYS.includes(k) && isObj(v)) {
        const m: Record<string, unknown> = {};
        for (const [pk, pv] of Object.entries(v)) m[pk] = emit(pv);
        out[k] = m;
      } else if (SUBSCHEMA_ARRAY_KEYS.includes(k) && Array.isArray(v)) out[k] = v.map(emit);
      else if (SUBSCHEMA_SINGLE_KEYS.includes(k) && (isObj(v) || typeof v === 'boolean')) out[k] = emit(v);
      else if (SUBSCHEMA_SINGLE_KEYS.includes(k) && Array.isArray(v)) out[k] = v.map(emit);
      else out[k] = cloneData(v);
    }

    if (dialect !== 'openapi-3.1') {
      // Boolean exclusive bounds (draft-04 / OAS 3.0).
      for (const [ex, bound] of [
        ['exclusiveMinimum', 'minimum'],
        ['exclusiveMaximum', 'maximum'],
      ] as const) {
        if (typeof out[ex] === 'boolean') {
          if (out[ex] === true && typeof out[bound] === 'number') {
            out[ex] = out[bound];
            delete out[bound];
          } else delete out[ex];
        }
      }
      if (out.type === 'file') {
        out.type = 'string';
      }
      const nullable = out.nullable === true || out['x-nullable'] === true;
      delete out.nullable;
      delete out['x-nullable'];
      if (nullable) {
        if (typeof out.type === 'string') {
          out.type = [out.type, 'null'];
          if (Array.isArray(out.enum) && !out.enum.includes(null)) out.enum = [...out.enum, null];
        } else if (!Array.isArray(out.type)) {
          return { anyOf: [out, { type: 'null' }] };
        }
      }
    }

    // readOnly/writeOnly properties are not required in the other direction.
    if (Array.isArray(out.required) && isObj(s.properties)) {
      const props = s.properties as Record<string, unknown>;
      out.required = (out.required as string[]).filter((name) => {
        const p = props[name];
        if (!isObj(p)) return true;
        if (mode === 'request' && p.readOnly === true) return false;
        if (mode === 'response' && p.writeOnly === true) return false;
        return true;
      });
    }
    // Discriminator needs Ajv's opt-in and exact shapes; oneOf already carries the semantics.
    delete out.discriminator;
    return out;
  };

  const body = emit(root) as Record<string, unknown>;
  if (Object.keys(defs).length === 0) return body;
  // Root may itself be a $ref into defs (recursive root).
  return { ...(body.$ref ? { allOf: [body] } : body), [defsKey]: defs };
}

// ---------------------------------------------------------------------------
// Ajv instances
// ---------------------------------------------------------------------------

type AjvInstance = InstanceType<typeof _Ajv>;
const instances = new Map<string, AjvInstance>();

function ajvFor(dialect: Dialect, coerce: boolean): AjvInstance {
  const key = `${dialect}|${coerce}`;
  let a = instances.get(key);
  if (a) return a;
  const Ctor = dialect === 'openapi-3.1' ? Ajv2020 : Ajv;
  a = new Ctor({
    strict: false,
    allErrors: true,
    validateFormats: true,
    coerceTypes: coerce ? 'array' : false,
    unicodeRegExp: false,
  }) as AjvInstance;
  addFormats(a);
  // OpenAPI-specific formats.
  a.addFormat('int32', { type: 'number', validate: (n: number) => Number.isInteger(n) && n >= -2147483648 && n <= 2147483647 });
  a.addFormat('int64', { type: 'number', validate: (n: number) => Number.isInteger(n) });
  a.addFormat('float', { type: 'number', validate: () => true });
  a.addFormat('double', { type: 'number', validate: () => true });
  a.addFormat('byte', /^[A-Za-z0-9+/]*={0,2}$/);
  a.addFormat('binary', () => true);
  a.addFormat('password', () => true);
  instances.set(key, a);
  return a;
}

const compiled = new WeakMap<object, Map<string, ValidateFunction>>();

export interface SchemaIssue {
  path: string;
  message: string;
}

export interface ValidationOutcome {
  valid: boolean;
  errors: SchemaIssue[];
  /** Set when the schema itself could not be compiled — not a pass. */
  schemaError?: string;
}

function formatErrors(errors: ErrorObject[] | null | undefined, limit = 20): SchemaIssue[] {
  return (errors ?? []).slice(0, limit).map((e) => {
    let message = e.message ?? 'invalid';
    if (e.keyword === 'additionalProperties' && e.params && 'additionalProperty' in e.params) {
      message += `: "${String((e.params as { additionalProperty: string }).additionalProperty)}"`;
    } else if (e.keyword === 'enum' && e.params && 'allowedValues' in e.params) {
      message += `: ${JSON.stringify((e.params as { allowedValues: unknown[] }).allowedValues).slice(0, 200)}`;
    }
    return { path: e.instancePath || '/', message };
  });
}

/** Validate `data` against an OpenAPI schema node (graph form). */
export function validateAgainst(
  schema: Schema | undefined,
  data: unknown,
  dialect: Dialect,
  opts: { mode?: 'request' | 'response'; coerce?: boolean } = {}
): ValidationOutcome {
  if (!schema) return { valid: true, errors: [] };
  const mode = opts.mode ?? 'response';
  const key = `${dialect}|${mode}|${Boolean(opts.coerce)}`;
  let perSchema = compiled.get(schema);
  if (!perSchema) {
    perSchema = new Map();
    compiled.set(schema, perSchema);
  }
  let fn = perSchema.get(key);
  if (!fn) {
    try {
      fn = ajvFor(dialect, Boolean(opts.coerce)).compile(toJsonSchema(schema, dialect, mode));
    } catch (e) {
      return { valid: false, errors: [], schemaError: `Schema could not be compiled: ${(e as Error).message}` };
    }
    perSchema.set(key, fn);
  }
  const valid = fn(data) as boolean;
  return { valid, errors: valid ? [] : formatErrors(fn.errors) };
}

const plainCache = new Map<string, ValidateFunction>();

/** Validate against a plain JSON Schema supplied by the caller (assertions). */
export function validateJsonSchema(schema: Record<string, unknown>, data: unknown): ValidationOutcome {
  const is2020 = typeof schema.$schema === 'string' && /2020-12|2019-09/.test(schema.$schema);
  const cacheKey = JSON.stringify(schema);
  let fn = plainCache.get(cacheKey);
  if (!fn) {
    try {
      fn = ajvFor(is2020 ? 'openapi-3.1' : 'openapi-3.0', false).compile(schema);
    } catch (e) {
      return { valid: false, errors: [], schemaError: `Schema could not be compiled: ${(e as Error).message}` };
    }
    if (plainCache.size > 200) plainCache.clear();
    plainCache.set(cacheKey, fn);
  }
  const valid = fn(data) as boolean;
  return { valid, errors: valid ? [] : formatErrors(fn.errors) };
}
