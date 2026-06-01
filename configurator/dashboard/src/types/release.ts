// SPDX-License-Identifier: MIT
/**
 * Release Update Check Types — client mirror of the server type.
 */

export interface ReleaseCheckResult {
  currentVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  releaseUrl?: string;
  releaseName?: string;
  publishedAt?: string;
  repo: string;
  checkedAt: string;
  error?: string;
}
