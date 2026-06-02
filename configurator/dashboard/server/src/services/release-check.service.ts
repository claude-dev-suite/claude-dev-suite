// SPDX-License-Identifier: MIT
/**
 * Release Check Service
 *
 * Queries the latest published GitHub release of the dev-suite repo and
 * compares it against the running dev-suite version (from the server
 * package.json). Used to surface an "update available" alert in the dashboard.
 *
 * Design notes:
 * - The repo is public, so the call is unauthenticated by default. A
 *   GH_TOKEN / GITHUB_TOKEN is used only if present (raises the 60 req/h
 *   anonymous limit and supports private forks).
 * - Results are cached in-memory (1h TTL) so page loads / hot-reloads don't
 *   hammer the API.
 * - Network/rate-limit failures are non-fatal: a result is still returned with
 *   `updateAvailable=false` and an `error` message, so the UI degrades quietly.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { getLogger } from '../utils/logger.js';
import type { ReleaseCheckResult } from '../types/index.js';

const logger = getLogger('ReleaseCheckService');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_REPO = 'claude-dev-suite/claude-dev-suite';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const FETCH_TIMEOUT_MS = 5000;

interface GithubRelease {
  tag_name?: string;
  name?: string;
  html_url?: string;
  published_at?: string;
  draft?: boolean;
  prerelease?: boolean;
}

/**
 * Parse a semver-ish string ("v1.2.3", "1.2.3-rc.1") into comparable parts.
 * Returns null if it doesn't look like a version.
 */
export function parseVersion(
  raw: string
): { major: number; minor: number; patch: number; prerelease: string | null } | null {
  const cleaned = raw.trim().replace(/^v/i, '');
  const m = cleaned.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
  if (!m) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] ?? null,
  };
}

/**
 * Returns true if `latest` is strictly newer than `current`.
 * A version WITH a prerelease tag is considered older than the same core
 * version without one (1.2.3-rc.1 < 1.2.3). Unparseable inputs → false.
 */
export function isNewer(latest: string, current: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  if (!a || !b) return false;
  if (a.major !== b.major) return a.major > b.major;
  if (a.minor !== b.minor) return a.minor > b.minor;
  if (a.patch !== b.patch) return a.patch > b.patch;
  // same core version: no-prerelease > prerelease; otherwise lexical compare
  if (a.prerelease === b.prerelease) return false;
  if (a.prerelease === null) return true; // latest is stable, current is pre
  if (b.prerelease === null) return false; // current is stable, latest is pre
  return a.prerelease > b.prerelease;
}

export class ReleaseCheckService {
  private cache: { result: ReleaseCheckResult; expiresAt: number } | null = null;

  /** Read the running dev-suite version from the server package.json. */
  getCurrentVersion(): string {
    try {
      // dist/services/release-check.service.js -> ../../package.json (server root)
      // src/services/release-check.service.ts -> ../../package.json (server root)
      const pkgPath = path.resolve(__dirname, '..', '..', 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version?: string };
      return pkg.version ?? '0.0.0';
    } catch (error) {
      logger.warn('Failed to read server package.json version', { error });
      return '0.0.0';
    }
  }

  /**
   * Check the latest GitHub release vs the running version.
   * @param opts.repo  override the queried repo (default dev-suite repo)
   * @param opts.force bypass the in-memory cache
   */
  async checkLatestRelease(opts: { repo?: string; force?: boolean } = {}): Promise<ReleaseCheckResult> {
    const repo = opts.repo ?? DEFAULT_REPO;
    const now = Date.now();

    if (!opts.force && this.cache && this.cache.expiresAt > now && this.cache.result.repo === repo) {
      return this.cache.result;
    }

    const currentVersion = this.getCurrentVersion();
    const checkedAt = new Date().toISOString();

    let result: ReleaseCheckResult;
    try {
      const release = await this.fetchLatestRelease(repo);
      const tag = release.tag_name ?? release.name ?? '';
      const latestVersion = tag ? tag.replace(/^v/i, '') : null;
      const updateAvailable = !!latestVersion && isNewer(latestVersion, currentVersion);

      // Only expose releaseUrl if it is a legitimate GitHub https URL.
      // A malicious or unexpected html_url (javascript:, http:, etc.) is dropped
      // so the frontend can safely use it as an href without an open-redirect risk.
      const rawUrl = release.html_url ?? '';
      const safeReleaseUrl = rawUrl.startsWith('https://github.com/') ? rawUrl : undefined;

      result = {
        currentVersion,
        latestVersion,
        updateAvailable,
        releaseUrl: safeReleaseUrl,
        releaseName: release.name || release.tag_name,
        publishedAt: release.published_at,
        repo,
        checkedAt,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn('Release check failed; returning non-fatal result', { error, context: { repo } });
      result = {
        currentVersion,
        latestVersion: null,
        updateAvailable: false,
        repo,
        checkedAt,
        error: message,
      };
    }

    // Cache successful AND failed results (a failed result is cached for a
    // shorter window so we retry sooner).
    const ttl = result.error ? 5 * 60 * 1000 : CACHE_TTL_MS;
    this.cache = { result, expiresAt: now + ttl };
    return result;
  }

  private async fetchLatestRelease(repo: string): Promise<GithubRelease> {
    const url = `https://api.github.com/repos/${repo}/releases/latest`;
    const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'dev-suite-dashboard',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(url, { headers, signal: controller.signal });
      if (!res.ok) {
        throw new Error(`GitHub API returned ${res.status} ${res.statusText}`);
      }
      return (await res.json()) as GithubRelease;
    } finally {
      clearTimeout(timer);
    }
  }
}
