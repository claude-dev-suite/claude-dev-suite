// SPDX-License-Identifier: MIT
/**
 * Sample-value generation from OpenAPI schemas.
 *
 * Handles examples/defaults/const/enum, allOf (merged), oneOf/anyOf (first
 * branch), 3.1 type arrays, formats, numeric/length bounds, readOnly/writeOnly
 * by direction — and cycles: the old generators followed `$ref` by recursion
 * with no guard, so any self-referencing schema (a tree, a linked list) blew
 * the stack. Here the path of schemas being expanded is tracked and a revisit
 * yields `null` (or is omitted when the property is optional).
 */

import type { Schema } from './model.js';

export interface SampleOptions {
  mode?: 'request' | 'response';
  maxDepth?: number;
}

const OMIT = Symbol('omit');

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function schemaType(s: Record<string, unknown>): string | undefined {
  const t = s.type;
  if (typeof t === 'string') return t;
  if (Array.isArray(t)) return (t as string[]).find((x) => x !== 'null') ?? (t[0] as string | undefined);
  if (isObj(s.properties) || s.additionalProperties !== undefined) return 'object';
  if (s.items !== undefined || s.prefixItems !== undefined) return 'array';
  if (s.format === 'date-time' || s.pattern !== undefined || s.minLength !== undefined) return 'string';
  if (s.minimum !== undefined || s.maximum !== undefined) return 'number';
  return undefined;
}

/**
 * Best-effort string for a regex `pattern`: literals, classes ([a-z0-9], \d,
 * \w, \s, .), groups without alternation, and quantifiers (? * + {n} {n,m}).
 * Returns undefined when the pattern uses anything else or the result does not
 * actually match — callers then fall back to a plain sample.
 */
export function sampleFromPattern(pattern: string): string | undefined {
  let src = pattern;
  if (src.startsWith('^')) src = src.slice(1);
  if (src.endsWith('$') && !src.endsWith('\\$')) src = src.slice(0, -1);
  let i = 0;
  const atoms: string[] = [];
  const readAtom = (): string | undefined => {
    const c = src[i];
    if (c === '\\') {
      const n = src[i + 1];
      i += 2;
      if (n === 'd') return '1';
      if (n === 'w') return 'a';
      if (n === 's') return ' ';
      if (n && /[.\-\\/^$*+?()[\]{}|]/.test(n)) return n;
      return undefined;
    }
    if (c === '[') {
      const end = src.indexOf(']', i + 1);
      if (end < 0) return undefined;
      let cls = src.slice(i + 1, end);
      i = end + 1;
      if (cls.startsWith('^')) return undefined;
      if (cls.startsWith('\\d')) return '1';
      if (cls.startsWith('\\w')) return 'a';
      if (cls[0] === '\\') cls = cls.slice(1);
      return cls[0];
    }
    if (c === '(') {
      const end = src.indexOf(')', i);
      if (end < 0) return undefined;
      const inner = src.slice(i + 1, end).replace(/^\?:/, '');
      if (inner.includes('|') || inner.includes('(')) return undefined;
      i = end + 1;
      return sampleFromPattern(`^${inner}$`);
    }
    if (c === '.') {
      i++;
      return 'x';
    }
    if (c === undefined || '|*+?{})]'.includes(c)) return undefined;
    i++;
    return c;
  };
  while (i < src.length) {
    const atom = readAtom();
    if (atom === undefined) return undefined;
    let reps = 1;
    const q = src[i];
    if (q === '?' || q === '*' || q === '+') {
      i++; // one occurrence satisfies all three
    } else if (q === '{') {
      const m = /^\{(\d+)(?:,(\d*))?\}/.exec(src.slice(i));
      if (!m) return undefined;
      reps = Number(m[1]);
      i += m[0].length;
    }
    if (src[i] === '?') i++; // lazy modifier
    atoms.push(atom.repeat(reps));
  }
  const out = atoms.join('');
  try {
    return new RegExp(pattern).test(out) ? out : undefined;
  } catch {
    return undefined;
  }
}

function stringSample(s: Record<string, unknown>): string {
  if (typeof s.pattern === 'string' && !s.format) {
    const p = sampleFromPattern(s.pattern);
    if (p !== undefined) return p;
  }
  const fmt = typeof s.format === 'string' ? s.format : '';
  let v: string;
  switch (fmt) {
    case 'email':
    case 'idn-email':
      v = 'user@example.com';
      break;
    case 'date':
      v = '2024-01-15';
      break;
    case 'date-time':
      v = '2024-01-15T10:30:00Z';
      break;
    case 'time':
      v = '10:30:00Z';
      break;
    case 'uuid':
      v = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
      break;
    case 'uri':
    case 'url':
    case 'iri':
      v = 'https://example.com/resource';
      break;
    case 'hostname':
      v = 'example.com';
      break;
    case 'ipv4':
      v = '192.0.2.1';
      break;
    case 'ipv6':
      v = '2001:db8::1';
      break;
    case 'byte':
      v = 'c2FtcGxl';
      break;
    case 'binary':
      v = 'binary-data';
      break;
    case 'password':
      v = 'P@ssw0rd!';
      break;
    case 'duration':
      v = 'P1D';
      break;
    default:
      v = 'string';
  }
  const min = typeof s.minLength === 'number' ? s.minLength : 0;
  const max = typeof s.maxLength === 'number' ? s.maxLength : Infinity;
  if (v.length < min) v = v + 'x'.repeat(min - v.length);
  if (v.length > max) v = v.slice(0, Math.max(0, max));
  return v;
}

function numberSample(s: Record<string, unknown>, integer: boolean): number {
  let min = typeof s.minimum === 'number' ? s.minimum : undefined;
  let max = typeof s.maximum === 'number' ? s.maximum : undefined;
  if (typeof s.exclusiveMinimum === 'number') min = s.exclusiveMinimum + (integer ? 1 : 0.5);
  else if (s.exclusiveMinimum === true && min !== undefined) min = min + (integer ? 1 : 0.5);
  if (typeof s.exclusiveMaximum === 'number') max = s.exclusiveMaximum - (integer ? 1 : 0.5);
  else if (s.exclusiveMaximum === true && max !== undefined) max = max - (integer ? 1 : 0.5);
  let v = min ?? (max !== undefined ? Math.min(max, integer ? 1 : 1.5) : integer ? 1 : 1.5);
  if (max !== undefined && v > max) v = max;
  if (typeof s.multipleOf === 'number' && s.multipleOf > 0) v = Math.ceil(v / s.multipleOf) * s.multipleOf;
  return integer ? Math.round(v) : v;
}

export function generateSample(schema: unknown, opts: SampleOptions = {}): unknown {
  const r = gen(schema, opts, new Set(), 0);
  return r === OMIT ? null : r;
}

function gen(schema: unknown, opts: SampleOptions, stack: Set<object>, depth: number): unknown {
  if (schema === true || schema === undefined) return 'string';
  if (!isObj(schema)) return null;
  const s = schema;
  if (stack.has(s) || depth > (opts.maxDepth ?? 8)) return OMIT;

  if (s.example !== undefined) return s.example;
  if (Array.isArray(s.examples) && s.examples.length) return s.examples[0];
  if (s.const !== undefined) return s.const;
  if (s.default !== undefined) return s.default;
  if (Array.isArray(s.enum) && s.enum.length) return s.enum.find((x) => x !== null) ?? s.enum[0];

  stack.add(s);
  try {
    if (Array.isArray(s.allOf) && s.allOf.length) {
      let merged: unknown = undefined;
      for (const part of s.allOf) {
        const v = gen(part, opts, stack, depth + 1);
        if (v === OMIT) continue;
        if (isObj(merged) && isObj(v)) merged = { ...merged, ...v };
        else if (merged === undefined || v !== null) merged = v;
      }
      // Local properties alongside allOf
      if (isObj(s.properties)) {
        const own = gen({ ...s, allOf: undefined }, opts, stack, depth + 1);
        if (isObj(merged) && isObj(own)) merged = { ...merged, ...own };
      }
      return merged ?? {};
    }
    for (const key of ['oneOf', 'anyOf'] as const) {
      const branches = s[key];
      if (Array.isArray(branches) && branches.length) {
        const preferred =
          branches.find((b) => isObj(b) && b.type !== 'null' && !stack.has(b as object)) ?? branches[0];
        const v = gen(preferred, opts, stack, depth + 1);
        if (v !== OMIT && isObj(v) && isObj(s.properties)) {
          const own = gen({ ...s, [key]: undefined }, opts, stack, depth + 1);
          return isObj(own) ? { ...own, ...v } : v;
        }
        return v;
      }
    }

    switch (schemaType(s)) {
      case 'string':
        return stringSample(s);
      case 'integer':
        return numberSample(s, true);
      case 'number':
        return numberSample(s, false);
      case 'boolean':
        return true;
      case 'null':
        return null;
      case 'array': {
        if (Array.isArray(s.prefixItems)) {
          return s.prefixItems.map((p) => {
            const v = gen(p, opts, stack, depth + 1);
            return v === OMIT ? null : v;
          });
        }
        const item = gen(s.items, opts, stack, depth + 1);
        if (item === OMIT) return [];
        const n = Math.max(1, typeof s.minItems === 'number' ? s.minItems : 1);
        return Array.from({ length: Math.min(n, 5) }, () => item);
      }
      case 'object': {
        const out: Record<string, unknown> = {};
        const required = new Set(Array.isArray(s.required) ? (s.required as string[]) : []);
        for (const [name, prop] of Object.entries(isObj(s.properties) ? s.properties : {})) {
          if (isObj(prop)) {
            if (opts.mode === 'request' && prop.readOnly === true) continue;
            if (opts.mode === 'response' && prop.writeOnly === true) continue;
          }
          const v = gen(prop, opts, stack, depth + 1);
          if (v === OMIT) {
            if (required.has(name)) out[name] = null;
            continue;
          }
          out[name] = v;
        }
        if (Object.keys(out).length === 0 && isObj(s.additionalProperties)) {
          const v = gen(s.additionalProperties, opts, stack, depth + 1);
          if (v !== OMIT) out.key = v;
        }
        return out;
      }
      default:
        return null;
    }
  } finally {
    stack.delete(s);
  }
}

/** A value of the wrong type for `schema` (negative tests). */
export function wrongTypeValue(schema: unknown): unknown {
  const t = isObj(schema) ? schemaType(schema) : undefined;
  switch (t) {
    case 'string':
      return 12345;
    case 'integer':
    case 'number':
      return 'not-a-number';
    case 'boolean':
      return 'not-a-boolean';
    case 'array':
      return 'not-an-array';
    case 'object':
      return 'not-an-object';
    default:
      return undefined;
  }
}

/** Effective object view of a schema (merging allOf) for picking fields in negative tests. */
export function objectShape(schema: unknown, depth = 0): { properties: Record<string, Schema>; required: string[] } {
  const props: Record<string, Schema> = {};
  const required: string[] = [];
  if (!isObj(schema) || depth > 5) return { properties: props, required };
  if (Array.isArray(schema.allOf)) {
    for (const part of schema.allOf) {
      const sub = objectShape(part, depth + 1);
      Object.assign(props, sub.properties);
      required.push(...sub.required);
    }
  }
  if (isObj(schema.properties)) {
    for (const [k, v] of Object.entries(schema.properties)) if (isObj(v)) props[k] = v;
  }
  if (Array.isArray(schema.required)) required.push(...(schema.required as string[]));
  return { properties: props, required: [...new Set(required)] };
}
