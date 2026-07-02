// SPDX-License-Identifier: MIT
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sanitizeReleaseUrl, isSafeExternalUrl, safeOpenExternal } from '../releaseUrl';

// ── sanitizeReleaseUrl ──────────────────────────────────────────────────────

describe('sanitizeReleaseUrl', () => {
  it('returns the url for https:// links', () => {
    expect(sanitizeReleaseUrl('https://example.com/release')).toBe(
      'https://example.com/release'
    );
  });

  it('returns undefined for http:// links', () => {
    expect(sanitizeReleaseUrl('http://example.com')).toBeUndefined();
  });

  it('returns undefined for javascript: links', () => {
    expect(sanitizeReleaseUrl('javascript:alert(1)')).toBeUndefined();
  });

  it('returns undefined for null', () => {
    expect(sanitizeReleaseUrl(null)).toBeUndefined();
  });

  it('returns undefined for undefined', () => {
    expect(sanitizeReleaseUrl(undefined)).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(sanitizeReleaseUrl('')).toBeUndefined();
  });
});

// ── isSafeExternalUrl ───────────────────────────────────────────────────────

describe('isSafeExternalUrl', () => {
  it('returns true for https: URLs', () => {
    expect(isSafeExternalUrl('https://console.anthropic.com')).toBe(true);
    expect(isSafeExternalUrl('https://example.com/path?q=1#hash')).toBe(true);
  });

  it('returns false for http: URLs', () => {
    expect(isSafeExternalUrl('http://example.com')).toBe(false);
  });

  it('returns false for javascript: URLs', () => {
    expect(isSafeExternalUrl('javascript:alert(1)')).toBe(false);
  });

  it('returns false for data: URLs', () => {
    expect(isSafeExternalUrl('data:text/html,<h1>hi</h1>')).toBe(false);
  });

  it('returns false for file: URLs', () => {
    expect(isSafeExternalUrl('file:///etc/passwd')).toBe(false);
  });

  it('returns false for blob: URLs', () => {
    expect(isSafeExternalUrl('blob:https://example.com/uuid')).toBe(false);
  });

  it('returns false for null', () => {
    expect(isSafeExternalUrl(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isSafeExternalUrl(undefined)).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isSafeExternalUrl('')).toBe(false);
  });

  it('returns false for a non-URL string', () => {
    expect(isSafeExternalUrl('not a url at all')).toBe(false);
  });
});

// ── safeOpenExternal ────────────────────────────────────────────────────────

describe('safeOpenExternal', () => {
  beforeEach(() => {
    // Reset all mocks (clears call counts) then set up a fresh spy.
    vi.clearAllMocks();
    (window as Record<string, unknown>).electronAPI = undefined;
    vi.spyOn(window, 'open').mockImplementation(() => null);
  });

  it('calls window.open for a safe https URL in a browser context', () => {
    safeOpenExternal('https://example.com');
    expect(window.open).toHaveBeenCalledWith(
      'https://example.com',
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('does NOT call window.open for a javascript: URL', () => {
    safeOpenExternal('javascript:alert(1)');
    expect(window.open).not.toHaveBeenCalled();
  });

  it('does NOT call window.open for a data: URL', () => {
    safeOpenExternal('data:text/html,<h1>xss</h1>');
    expect(window.open).not.toHaveBeenCalled();
  });

  it('does NOT call window.open for a file: URL', () => {
    safeOpenExternal('file:///etc/passwd');
    expect(window.open).not.toHaveBeenCalled();
  });

  it('does NOT call window.open for null', () => {
    safeOpenExternal(null);
    expect(window.open).not.toHaveBeenCalled();
  });

  it('does NOT call window.open for undefined', () => {
    safeOpenExternal(undefined);
    expect(window.open).not.toHaveBeenCalled();
  });

  it('calls electronAPI.openExternal when available for a safe https URL', () => {
    const mockOpenExternal = vi.fn();
    (window as Record<string, unknown>).electronAPI = {
      openExternal: mockOpenExternal,
    };

    safeOpenExternal('https://example.com');

    expect(mockOpenExternal).toHaveBeenCalledWith('https://example.com');
    expect(window.open).not.toHaveBeenCalled();
  });

  it('does NOT call electronAPI.openExternal for a javascript: URL', () => {
    const mockOpenExternal = vi.fn();
    (window as Record<string, unknown>).electronAPI = {
      openExternal: mockOpenExternal,
    };

    safeOpenExternal('javascript:alert(1)');

    expect(mockOpenExternal).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
  });
});
