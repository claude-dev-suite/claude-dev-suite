// SPDX-License-Identifier: MIT
/**
 * Last-line redaction applied to every string returned to the model.
 *
 * Parsers already drop the fields where tools put the secret itself
 * (gitleaks `Secret`/`Match`, trufflehog `Raw`/`RawV2`/`SecretParts`, trivy
 * `Match`/`Code`, semgrep `lines`); this pass catches credentials that leak in
 * through free text — advisory descriptions, error messages, stderr tails.
 */

const RULES: Array<[RegExp, string | ((m: string, ...g: string[]) => string)]> = [
  // user:password@ in any URL
  [/([a-z][a-z0-9+.-]*:\/\/[^\s:/@]+:)[^\s@/]+@/gi, '$1***@'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g, '-----BEGIN PRIVATE KEY-----***REDACTED***'],
  [/\b(AKIA|ASIA)[0-9A-Z]{16}\b/g, '$1****************'],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}\b/g, 'gh*_***REDACTED***'],
  [/\bgithub_pat_[A-Za-z0-9_]{30,}\b/g, 'github_pat_***REDACTED***'],
  [/\bglpat-[A-Za-z0-9_-]{20,}\b/g, 'glpat-***REDACTED***'],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g, 'xox*-***REDACTED***'],
  [/\b(sk|rk)_(live|test)_[A-Za-z0-9]{16,}\b/g, '$1_$2_***REDACTED***'],
  [/\bsk-(ant-)?[A-Za-z0-9_-]{20,}\b/g, 'sk-***REDACTED***'],
  [/\bAIza[0-9A-Za-z_-]{35}\b/g, 'AIza***REDACTED***'],
  [/\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, 'eyJ***REDACTED-JWT***'],
  // KEY=value / "password": "value" style assignments of obvious credential names
  [
    /\b((?:[A-Za-z0-9_]*?)(?:password|passwd|secret|token|api[_-]?key|access[_-]?key)["']?\s*[:=]\s*["']?)([^\s"',;]{6,})/gi,
    (_m: string, prefix: string) => `${prefix}***`,
  ],
];

export function redactText(text: string): string {
  let out = text;
  for (const [re, replacement] of RULES) {
    out = out.replace(re, replacement as never);
  }
  return out;
}

/** Deep-redact every string in a JSON-serialisable value. */
export function redactDeep<T>(value: T): T {
  if (typeof value === 'string') return redactText(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => redactDeep(v)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = redactDeep(v);
    return out as T;
  }
  return value;
}
