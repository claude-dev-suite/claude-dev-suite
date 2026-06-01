/**
 * Release Check Service Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReleaseCheckService, parseVersion, isNewer } from '../src/services/release-check.service.js';

function mockFetchOnce(body: unknown, ok = true, status = 200): ReturnType<typeof vi.fn> {
  const fn = vi.fn().mockResolvedValue({
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: async () => body,
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('parseVersion', () => {
  it('parses v-prefixed and plain versions', () => {
    expect(parseVersion('v1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: null });
    expect(parseVersion('1.2.3-rc.1')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: 'rc.1' });
  });
  it('returns null for junk', () => {
    expect(parseVersion('not-a-version')).toBeNull();
    expect(parseVersion('1.2')).toBeNull();
  });
});

describe('isNewer', () => {
  it('compares core versions', () => {
    expect(isNewer('1.11.0', '1.10.0')).toBe(true);
    expect(isNewer('2.0.0', '1.99.99')).toBe(true);
    expect(isNewer('1.10.0', '1.10.0')).toBe(false);
    expect(isNewer('1.9.0', '1.10.0')).toBe(false);
    expect(isNewer('v1.10.1', '1.10.0')).toBe(true);
  });
  it('treats stable as newer than its prerelease, and vice versa', () => {
    expect(isNewer('1.10.0', '1.10.0-rc.1')).toBe(true);
    expect(isNewer('1.10.0-rc.1', '1.10.0')).toBe(false);
  });
  it('returns false on unparseable input', () => {
    expect(isNewer('garbage', '1.0.0')).toBe(false);
  });
});

describe('ReleaseCheckService', () => {
  let svc: ReleaseCheckService;

  beforeEach(() => {
    svc = new ReleaseCheckService();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('reads a real current version from package.json', () => {
    expect(parseVersion(svc.getCurrentVersion())).not.toBeNull();
  });

  it('reports updateAvailable when the latest release is newer', async () => {
    mockFetchOnce({ tag_name: 'v999.0.0', name: 'v999.0.0', html_url: 'https://example/r', published_at: '2026-01-01T00:00:00Z' });
    const r = await svc.checkLatestRelease({ force: true });
    expect(r.latestVersion).toBe('999.0.0');
    expect(r.updateAvailable).toBe(true);
    expect(r.releaseUrl).toBe('https://example/r');
    expect(r.repo).toBe('claude-dev-suite/claude-dev-suite');
    expect(r.error).toBeUndefined();
  });

  it('reports no update when the latest release is older/equal', async () => {
    mockFetchOnce({ tag_name: 'v0.0.1' });
    const r = await svc.checkLatestRelease({ force: true });
    expect(r.latestVersion).toBe('0.0.1');
    expect(r.updateAvailable).toBe(false);
  });

  it('degrades gracefully on a non-ok response', async () => {
    mockFetchOnce({}, false, 403);
    const r = await svc.checkLatestRelease({ force: true });
    expect(r.updateAvailable).toBe(false);
    expect(r.latestVersion).toBeNull();
    expect(r.error).toMatch(/403/);
  });

  it('degrades gracefully on a network error', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('ENOTFOUND'));
    vi.stubGlobal('fetch', fn);
    const r = await svc.checkLatestRelease({ force: true });
    expect(r.updateAvailable).toBe(false);
    expect(r.error).toMatch(/ENOTFOUND/);
  });

  it('caches results (no second fetch within TTL) and force bypasses', async () => {
    const fn = mockFetchOnce({ tag_name: 'v999.0.0' });
    await svc.checkLatestRelease({ force: true }); // 1st call
    await svc.checkLatestRelease();                // cached, no fetch
    expect(fn).toHaveBeenCalledTimes(1);
    await svc.checkLatestRelease({ force: true });  // bypass cache
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('sends an Authorization header only when a token is present', async () => {
    const fn = mockFetchOnce({ tag_name: 'v1.0.0' });
    delete process.env.GH_TOKEN;
    delete process.env.GITHUB_TOKEN;
    await svc.checkLatestRelease({ force: true });
    const headers1 = (fn.mock.calls[0]?.[1] as { headers: Record<string, string> }).headers;
    expect(headers1.Authorization).toBeUndefined();
    expect(headers1['User-Agent']).toBe('dev-suite-dashboard');

    process.env.GH_TOKEN = 'tok123';
    await svc.checkLatestRelease({ force: true });
    const headers2 = (fn.mock.calls[1]?.[1] as { headers: Record<string, string> }).headers;
    expect(headers2.Authorization).toBe('Bearer tok123');
    delete process.env.GH_TOKEN;
  });
});
