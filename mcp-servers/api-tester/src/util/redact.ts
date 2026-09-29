// SPDX-License-Identifier: MIT
/**
 * Secret redaction for everything returned to the model.
 *
 * A Redactor collects the concrete secret values a request used (auth tokens,
 * passwords, variables marked secret) and scrubs every occurrence from the
 * result — including a response body that echoes them back, which httpbin-style
 * endpoints and many error pages do.
 */

const SENSITIVE_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'api-key',
  'x-auth-token',
  'x-access-token',
  'x-csrf-token',
  'x-xsrf-token',
]);

const SENSITIVE_KEY_RE = /(pass(word)?|secret|token|api[-_]?key|auth|credential|private[-_]?key|session)/i;

export function isSensitiveHeader(name: string): boolean {
  return SENSITIVE_HEADERS.has(name.toLowerCase());
}

export function isSensitiveKey(name: string): boolean {
  return SENSITIVE_KEY_RE.test(name);
}

/** Mask a header value but keep an auth scheme visible ("Bearer ***"). */
export function maskHeaderValue(name: string, value: string): string {
  const lower = name.toLowerCase();
  if (lower === 'authorization' || lower === 'proxy-authorization') {
    const m = /^(\w+)\s+/.exec(value);
    return m ? `${m[1]} ***` : '***';
  }
  if (lower === 'set-cookie' || lower === 'cookie') {
    // Keep cookie names and attributes, hide values.
    return value
      .split(';')
      .map((part, i) => {
        const eq = part.indexOf('=');
        if (eq < 0) return part;
        const key = part.slice(0, eq);
        if (lower === 'set-cookie' && i > 0) return part; // attributes (Path=/, Expires=…)
        return `${key}=***`;
      })
      .join(';');
  }
  return '***';
}

export function maskHeaders(headers: Record<string, string | string[]>): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (!isSensitiveHeader(k)) {
      out[k] = v;
    } else if (Array.isArray(v)) {
      out[k] = v.map((x) => maskHeaderValue(k, x));
    } else {
      out[k] = maskHeaderValue(k, v);
    }
  }
  return out;
}

/** Hide the password part of `scheme://user:password@host`. */
export function redactUrlCredentials(s: string): string {
  return s.replace(/\b([a-z][a-z0-9+.-]*:\/\/[^\s:/@]*:)([^\s@/]+)@/gi, '$1***@');
}

export class Redactor {
  private readonly secrets = new Set<string>();

  add(value: unknown): void {
    if (typeof value !== 'string') return;
    // Very short values would shred ordinary output ("1", "on", "abc").
    if (value.length < 4) return;
    this.secrets.add(value);
    // A secret placed in a query string travels URL-encoded. (Basic credentials
    // are registered in their base64 form by the auth helper itself.)
    const enc = encodeURIComponent(value);
    if (enc !== value) this.secrets.add(enc);
  }

  addAll(values: Iterable<unknown>): void {
    for (const v of values) this.add(v);
  }

  get size(): number {
    return this.secrets.size;
  }

  scrubString(s: string): string {
    let out = redactUrlCredentials(s);
    if (this.secrets.size === 0) return out;
    const ordered = [...this.secrets].sort((a, b) => b.length - a.length);
    for (const secret of ordered) {
      if (out.includes(secret)) out = out.split(secret).join('***');
    }
    return out;
  }

  /** Deep copy with every string scrubbed. Cycles are cut, not followed. */
  scrub<T>(value: T): T {
    const seen = new WeakSet<object>();
    const walk = (v: unknown): unknown => {
      if (typeof v === 'string') return this.scrubString(v);
      if (v === null || typeof v !== 'object') return v;
      if (Buffer.isBuffer(v)) return v;
      if (seen.has(v as object)) return '[circular]';
      seen.add(v as object);
      if (Array.isArray(v)) return v.map(walk);
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k] = walk(val);
      return out;
    };
    return walk(value) as T;
  }
}
