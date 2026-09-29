// SPDX-License-Identifier: MIT
/**
 * `{{var}}` substitution at request time, plus dynamic variables.
 *
 * Syntax accepted: `{{name}}`, `{{ name }}`, Insomnia's `{{ _.name }}`, and the
 * dynamic forms `{{$uuid}}` / `{{$guid}}` / `{{$randomUUID}}`, `{{$timestamp}}`
 * (unix seconds), `{{$timestampMs}}`, `{{$isoTimestamp}}`,
 * `{{$randomInt}}` / `{{$randomInt 1 100}}`, `{{$randomEmail}}`,
 * `{{$randomString 12}}`, `{{$datetime iso8601|rfc1123}}` (REST Client).
 *
 * Unresolved names are REPORTED, never silently left in a URL — the old
 * importer left `{{baseUrl}}` in place and the request then failed URL
 * validation with a message that never mentioned the variable.
 */

import { randomInt, randomUUID, randomBytes } from 'crypto';

export type Vars = Record<string, unknown>;

const VAR_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;
const MAX_DEPTH = 5;

export interface SubstituteResult<T> {
  value: T;
  missing: string[];
  /** Names of variables that were substituted (for secret redaction). */
  used: string[];
}

function dynamicValue(expr: string): string | undefined {
  const [name, ...args] = expr.trim().split(/\s+/);
  switch (name) {
    case '$uuid':
    case '$guid':
    case '$randomUUID':
      return randomUUID();
    case '$timestamp':
      return String(Math.floor(Date.now() / 1000));
    case '$timestampMs':
      return String(Date.now());
    case '$isoTimestamp':
      return new Date().toISOString();
    case '$datetime':
    case '$localDatetime': {
      const fmt = (args[0] ?? 'iso8601').replace(/['"]/g, '');
      return fmt === 'rfc1123' ? new Date().toUTCString() : new Date().toISOString();
    }
    case '$randomInt': {
      const min = args[0] !== undefined ? Number(args[0]) : 0;
      const max = args[1] !== undefined ? Number(args[1]) : 1000;
      if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return String(min);
      return String(randomInt(Math.ceil(min), Math.floor(max)));
    }
    case '$randomEmail':
      return `user${randomInt(100000, 999999)}@example.com`;
    case '$randomString': {
      const len = Math.min(256, Math.max(1, Number(args[0]) || 12));
      return randomBytes(len).toString('base64url').slice(0, len);
    }
    default:
      return undefined;
  }
}

function lookupVar(name: string, vars: Vars): { found: boolean; value?: unknown } {
  const key = name.startsWith('_.') ? name.slice(2) : name;
  if (Object.prototype.hasOwnProperty.call(vars, key)) return { found: true, value: vars[key] };
  // Dotted lookup into object-valued variables: {{user.id}}
  if (key.includes('.')) {
    const parts = key.split('.');
    let cur: unknown = vars;
    for (const p of parts) {
      if (cur && typeof cur === 'object' && Object.prototype.hasOwnProperty.call(cur, p)) {
        cur = (cur as Record<string, unknown>)[p];
      } else {
        return { found: false };
      }
    }
    return { found: true, value: cur };
  }
  return { found: false };
}

function stringify(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function substituteString(input: string, vars: Vars): SubstituteResult<string> {
  const missing = new Set<string>();
  const used = new Set<string>();
  let out = input;
  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    let changed = false;
    out = out.replace(VAR_RE, (whole, expr: string) => {
      const name = expr.trim();
      if (name.startsWith('$')) {
        const dyn = dynamicValue(name);
        if (dyn !== undefined) {
          changed = true;
          return dyn;
        }
        missing.add(name);
        return whole;
      }
      const hit = lookupVar(name, vars);
      if (!hit.found) {
        missing.add(name);
        return whole;
      }
      used.add(name.startsWith('_.') ? name.slice(2) : name);
      changed = true;
      return stringify(hit.value);
    });
    if (!changed || !VAR_RE.test(out)) break;
    VAR_RE.lastIndex = 0;
  }
  VAR_RE.lastIndex = 0;
  // Only report names still present in the final output.
  const stillMissing = [...missing].filter((m) => out.includes(m));
  return { value: out, missing: stillMissing, used: [...used] };
}

/**
 * Deep substitution over strings in objects/arrays (keys included).
 * `preserveTypes`: a string that is exactly one `{{var}}` becomes the variable's
 * raw value (number, object…) — used for assertion expectations.
 */
export function substituteDeep<T>(input: T, vars: Vars, opts: { preserveTypes?: boolean } = {}): SubstituteResult<T> {
  const missing = new Set<string>();
  const used = new Set<string>();
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string' && opts.preserveTypes) {
      const whole = /^\{\{\s*([^{}\s$][^{}]*?)\s*\}\}$/.exec(v);
      if (whole) {
        const hit = lookupVar(whole[1], vars);
        if (hit.found) {
          used.add(whole[1]);
          return hit.value;
        }
      }
    }
    if (typeof v === 'string') {
      const r = substituteString(v, vars);
      r.missing.forEach((m) => missing.add(m));
      r.used.forEach((u) => used.add(u));
      return r.value;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object' && !Buffer.isBuffer(v)) {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[walk(k) as string] = walk(val);
      return out;
    }
    return v;
  };
  const value = walk(input) as T;
  return { value, missing: [...missing], used: [...used] };
}

/** Names referenced by `{{…}}` in any string inside `input` (dynamic ones excluded). */
export function referencedVariables(input: unknown): string[] {
  const names = new Set<string>();
  const walk = (v: unknown) => {
    if (typeof v === 'string') {
      for (const m of v.matchAll(VAR_RE)) {
        const n = m[1].trim();
        if (!n.startsWith('$')) names.add(n.startsWith('_.') ? n.slice(2) : n);
      }
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => (walk(k), walk(x)));
  };
  walk(input);
  return [...names];
}
