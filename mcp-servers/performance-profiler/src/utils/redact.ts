// SPDX-License-Identifier: MIT
/**
 * Redaction of secrets from anything returned to the model: target process
 * output, URLs, captured flow variables, headers.
 */

const SECRET_KEY = /(pass(word|wd)?|secret|token|api[-_]?key|apikey|auth(orization)?|session|cookie|credential|private[-_]?key|bearer|jwt)/i;

export function isSecretKey(key: string): boolean {
  return SECRET_KEY.test(key);
}

/** Remove userinfo and secret-looking query parameters from a URL string. */
export function redactUrl(raw: string): string {
  try {
    const u = new URL(raw);
    if (u.username || u.password) {
      u.username = u.username ? '***' : '';
      u.password = u.password ? '***' : '';
    }
    for (const key of [...u.searchParams.keys()]) {
      if (isSecretKey(key)) u.searchParams.set(key, '***');
    }
    return u.toString();
  } catch {
    return redactText(raw);
  }
}

/** Redact secret-looking query parameters in a path such as `/login?token=abc`. */
export function redactPath(path: string): string {
  if (!path.includes('?')) return path;
  const base = 'http://redact.invalid';
  const out = redactUrl(base + (path.startsWith('/') ? path : `/${path}`));
  return out.startsWith(base) ? out.slice(base.length) : path;
}

/** Redact common secret patterns in free text (process output, error messages). */
export function redactText(text: string): string {
  return text
    // scheme://user:pass@host
    .replace(/([a-z][a-z0-9+.-]*:\/\/)([^\s:/@]+):([^\s@/]+)@/gi, '$1***:***@')
    // Authorization: Bearer xxx / Basic xxx
    .replace(/\b(authorization\s*[:=]\s*)(bearer|basic|token)?\s*[^\s"',;]+/gi, (_m, p1, p2) => `${p1}${p2 ? p2 + ' ' : ''}***`)
    .replace(/\bbearer\s+[a-z0-9._~+/=-]{8,}/gi, 'Bearer ***')
    // key=value / "key": "value" for secret-looking keys
    .replace(
      /(["']?)([a-z0-9_.-]*(?:pass(?:word|wd)?|secret|token|api[-_]?key|apikey|credential|private[-_]?key)[a-z0-9_.-]*)\1(\s*[:=]\s*)(["']?)([^"'\s,;&}]+)\4/gi,
      (_m, q, key, sep, vq) => `${q}${key}${q}${sep}${vq}***${vq}`
    )
    // AWS access key ids, GitHub tokens, Slack tokens, JWTs
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, 'AKIA***')
    .replace(/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, 'gh*_***')
    .replace(/\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, 'xox*-***')
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/g, '***.jwt.***');
}

/** Redact the values of secret-looking keys in a flat string map. */
export function redactRecord(rec: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!rec) return rec;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(rec)) out[k] = isSecretKey(k) ? '***' : redactText(String(v));
  return out;
}

/** Truncate and redact process output for inclusion in a tool result. */
export function outputExcerpt(text: string, max = 2000): { text: string; truncated: boolean } | undefined {
  if (!text) return undefined;
  const truncated = text.length > max;
  const body = truncated ? text.slice(-max) : text;
  return { text: redactText(body), truncated };
}
