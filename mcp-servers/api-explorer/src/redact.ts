// SPDX-License-Identifier: MIT
/**
 * Redaction for anything that is echoed back to the model: source URLs may
 * carry credentials in userinfo or in the query string, and configured headers
 * are credentials by construction.
 */

const SENSITIVE_PARAM = /^(.*[-_])?(token|key|apikey|api_key|secret|password|passwd|pwd|sig|signature|auth|authorization|access_token|refresh_token|client_secret|code|session|credential)s?$/i;

export function redactUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return raw;
  }
  if (u.username) u.username = "***";
  if (u.password) u.password = "***";
  for (const key of [...u.searchParams.keys()]) {
    if (SENSITIVE_PARAM.test(key)) u.searchParams.set(key, "***");
  }
  // URLSearchParams re-encodes "***" as "%2A%2A%2A"; keep it readable.
  return u.toString().replace(/%2A%2A%2A/g, "***");
}

/** Redact URLs and bearer/basic tokens that appear inside free text. */
export function redactText(text: string): string {
  return text
    .replace(/\bhttps?:\/\/[^\s"'<>)]+/g, (m) => redactUrl(m))
    .replace(/\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{8,}/g, "$1 ***");
}

/** Header names only — values are never returned. */
export function describeHeaders(headers: Record<string, string> | undefined): string[] | undefined {
  if (!headers) return undefined;
  const names = Object.keys(headers);
  return names.length > 0 ? names : undefined;
}
