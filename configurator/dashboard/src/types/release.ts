// SPDX-License-Identifier: MIT
// KEPT IN SYNC with configurator/dashboard/{src,server/src}/types/release.ts — verified by scripts/check-type-sync.mjs
/**
 * Release Update Check Types
 *
 * Compares the running dev-suite version against the latest published GitHub
 * release of the dev-suite repo and reports whether an update is available.
 */

export interface ReleaseCheckResult {
  /** Version of dev-suite currently running (from package.json) */
  currentVersion: string;
  /** Latest published (non-prerelease) release version, or null if unknown */
  latestVersion: string | null;
  /** True when latestVersion is strictly newer than currentVersion */
  updateAvailable: boolean;
  /** GitHub release page URL (html_url) */
  releaseUrl?: string;
  /** Release display name (GitHub release `name`, falls back to tag) */
  releaseName?: string;
  /** ISO timestamp the release was published */
  publishedAt?: string;
  /** owner/repo that was queried */
  repo: string;
  /** ISO timestamp of when this result was computed (cache stamp) */
  checkedAt: string;
  /** Non-fatal error (network/rate-limit) — result is still returned, updateAvailable=false */
  error?: string;
}
