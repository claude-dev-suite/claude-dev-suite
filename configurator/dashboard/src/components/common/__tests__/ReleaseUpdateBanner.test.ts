// SPDX-License-Identifier: MIT
/**
 * Unit tests for ReleaseUpdateBanner helpers.
 *
 * Covers the sanitizeReleaseUrl guard that prevents open-redirect / XSS via
 * an API-sourced href value (M2 security finding).
 */

import { describe, it, expect } from 'vitest';
import { sanitizeReleaseUrl } from '@/utils/releaseUrl';

describe('sanitizeReleaseUrl', () => {
  it('accepts a well-formed https://github.com URL', () => {
    const url = 'https://github.com/owner/repo/releases/tag/v1.2.3';
    expect(sanitizeReleaseUrl(url)).toBe(url);
  });

  it('accepts any https:// URL (frontend guard is scheme-only)', () => {
    // The backend already restricts to github.com; the frontend guard is a
    // secondary layer that only checks the scheme.
    expect(sanitizeReleaseUrl('https://example.com/path')).toBe('https://example.com/path');
  });

  it('rejects a javascript: URL', () => {
    expect(sanitizeReleaseUrl('javascript:alert(1)')).toBeUndefined();
  });

  it('rejects an http:// URL', () => {
    expect(sanitizeReleaseUrl('http://github.com/owner/repo/releases')).toBeUndefined();
  });

  it('rejects a data: URL', () => {
    expect(sanitizeReleaseUrl('data:text/html,<script>alert(1)</script>')).toBeUndefined();
  });

  it('rejects an empty string', () => {
    expect(sanitizeReleaseUrl('')).toBeUndefined();
  });

  it('returns undefined for null', () => {
    expect(sanitizeReleaseUrl(null)).toBeUndefined();
  });

  it('returns undefined for undefined', () => {
    expect(sanitizeReleaseUrl(undefined)).toBeUndefined();
  });

  it('rejects a URL with a leading newline (header-injection attempt)', () => {
    expect(sanitizeReleaseUrl('\nhttps://github.com/owner/repo')).toBeUndefined();
  });

  it('rejects a URL with mixed-case scheme trick', () => {
    // `startsWith` is case-sensitive, so 'HTTPS://' is rejected
    expect(sanitizeReleaseUrl('HTTPS://github.com/owner/repo')).toBeUndefined();
  });
});
