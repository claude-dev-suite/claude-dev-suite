// SPDX-License-Identifier: MIT
/**
 * Returns `url` only when it starts with `https://` (defense-in-depth against
 * open-redirect / XSS via a compromised or unexpected API-sourced value).
 * Returns `undefined` for any other scheme so callers can fall back to a safe
 * hard-coded URL.
 */
export function sanitizeReleaseUrl(url: string | null | undefined): string | undefined {
  if (url && url.startsWith('https://')) return url;
  return undefined;
}
