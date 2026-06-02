// SPDX-License-Identifier: MIT
/**
 * Release Update Banner
 *
 * Compact header pill shown when a newer dev-suite GitHub release exists than
 * the running version. Links to the release page and is dismissible per
 * version. Suppressed inside the packaged Electron app, where the native
 * auto-updater (UpdateNotification) already handles app updates with a richer
 * download/install flow.
 */

import { useReleaseCheck } from '@/hooks';

/** True when running inside the packaged Electron shell (native updater present). */
function isElectron(): boolean {
  return typeof window !== 'undefined' &&
    !!(window as unknown as { electronAPI?: { updater?: unknown } }).electronAPI?.updater;
}

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

export function ReleaseUpdateBanner() {
  const { result, showAlert, dismiss } = useReleaseCheck();

  // Electron app has its own auto-updater UI; avoid double-alerting.
  if (isElectron()) return null;
  if (!showAlert || !result?.latestVersion) return null;

  const title = `dev-suite v${result.latestVersion} is available — you have v${result.currentVersion}`;

  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10"
      title={title}
      data-testid="release-update-banner"
    >
      <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16" transform="rotate(180 12 12)" />
      </svg>
      <a
        href={sanitizeReleaseUrl(result.releaseUrl) ?? `https://github.com/${result.repo}/releases`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm font-medium text-amber-300 hover:text-amber-200 whitespace-nowrap"
      >
        Update available: v{result.latestVersion}
      </a>
      <button
        onClick={dismiss}
        className="ml-1 text-amber-400/70 hover:text-amber-200 text-sm leading-none"
        title="Dismiss until the next release"
        aria-label="Dismiss update notification"
      >
        ✕
      </button>
    </div>
  );
}
