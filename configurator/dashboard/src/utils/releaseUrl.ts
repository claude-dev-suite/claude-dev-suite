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

/**
 * Returns true only for URLs whose scheme is `https:`.
 * Rejects `javascript:`, `data:`, `file:`, `blob:`, and any other scheme that
 * can execute code or expose local files when passed to window.open /
 * electronAPI.openExternal.
 */
export function isSafeExternalUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Opens `url` in the system browser (Electron) or a new tab (browser).
 * Silently drops any URL that is not `https:` to prevent protocol-handler
 * abuse (javascript:, data:, file:, etc.).
 */
export function safeOpenExternal(url: string | null | undefined): void {
  if (!isSafeExternalUrl(url)) return;

  if (
    typeof window !== 'undefined' &&
    window.electronAPI &&
    'openExternal' in window.electronAPI
  ) {
    (
      window.electronAPI as Record<string, unknown> & {
        openExternal: (url: string) => void;
      }
    ).openExternal(url);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}
