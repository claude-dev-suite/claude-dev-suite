// SPDX-License-Identifier: MIT
/**
 * Tests for useApi caching functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useApi, invalidateCache } from '../useApi';

describe('useApi caching', () => {
  beforeEach(() => {
    // Clear all caches before each test
    invalidateCache();
    // Reset fetch mock
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should cache GET requests by default', async () => {
    const mockData = { success: true, data: { id: 1, name: 'Test' } };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockData,
    });

    // First call
    const { result: result1 } = renderHook(() => useApi<{ id: number; name: string }>('/api/test'));

    await waitFor(() => {
      expect(result1.current.loading).toBe(false);
    });

    expect(result1.current.data).toEqual({ id: 1, name: 'Test' });
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Second call - should use cache
    const { result: result2 } = renderHook(() => useApi<{ id: number; name: string }>('/api/test'));

    await waitFor(() => {
      expect(result2.current.loading).toBe(false);
    });

    expect(result2.current.data).toEqual({ id: 1, name: 'Test' });
    expect(global.fetch).toHaveBeenCalledTimes(1); // Still 1, cache was used
  });

  it('should not cache when cache option is false', async () => {
    const mockData = { success: true, data: { id: 1, name: 'Test' } };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockData,
    });

    // First call with caching disabled
    const { result: result1 } = renderHook(() =>
      useApi<{ id: number; name: string }>('/api/test', { useCache: false })
    );

    await waitFor(() => {
      expect(result1.current.loading).toBe(false);
    });

    expect(result1.current.data).toEqual({ id: 1, name: 'Test' });
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Second call - should NOT use cache
    const { result: result2 } = renderHook(() =>
      useApi<{ id: number; name: string }>('/api/test', { useCache: false })
    );

    await waitFor(() => {
      expect(result2.current.loading).toBe(false);
    });

    expect(result2.current.data).toEqual({ id: 1, name: 'Test' });
    expect(global.fetch).toHaveBeenCalledTimes(2); // Called twice
  });

  it('should bypass cache when forceRefresh is true', async () => {
    const mockData1 = { success: true, data: { id: 1, name: 'Test 1' } };
    const mockData2 = { success: true, data: { id: 2, name: 'Test 2' } };

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockData1,
    }).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockData2,
    });

    // First call - populates cache
    const { result: result1 } = renderHook(() => useApi<{ id: number; name: string }>('/api/test'));

    await waitFor(() => {
      expect(result1.current.loading).toBe(false);
    });

    expect(result1.current.data).toEqual({ id: 1, name: 'Test 1' });
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Second call with forceRefresh - should bypass cache
    const { result: result2 } = renderHook(() =>
      useApi<{ id: number; name: string }>('/api/test', { forceRefresh: true })
    );

    await waitFor(() => {
      expect(result2.current.loading).toBe(false);
    });

    expect(result2.current.data).toEqual({ id: 2, name: 'Test 2' });
    expect(global.fetch).toHaveBeenCalledTimes(2); // Called twice
  });

  it('should invalidate cache for specific endpoint', async () => {
    const mockData1 = { success: true, data: { id: 1, name: 'Test 1' } };
    const mockData2 = { success: true, data: { id: 2, name: 'Test 2' } };

    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockData1,
    }).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockData2,
    });

    // First call - populates cache
    const { result: result1 } = renderHook(() => useApi<{ id: number; name: string }>('/api/test'));

    await waitFor(() => {
      expect(result1.current.loading).toBe(false);
    });

    expect(result1.current.data).toEqual({ id: 1, name: 'Test 1' });
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Invalidate cache
    invalidateCache('/api/test');

    // Second call - should fetch fresh data
    const { result: result2 } = renderHook(() => useApi<{ id: number; name: string }>('/api/test'));

    await waitFor(() => {
      expect(result2.current.loading).toBe(false);
    });

    expect(result2.current.data).toEqual({ id: 2, name: 'Test 2' });
    expect(global.fetch).toHaveBeenCalledTimes(2); // Called twice
  });

  it('should invalidate all cache when called without arguments', async () => {
    const mockData1 = { success: true, data: { id: 1 } };
    const mockData2 = { success: true, data: { id: 2 } };

    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockData1,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockData1,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockData2,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockData2,
      });

    // Populate cache for two endpoints
    const { result: result1 } = renderHook(() => useApi('/api/test1'));
    const { result: result2 } = renderHook(() => useApi('/api/test2'));

    await waitFor(() => {
      expect(result1.current.loading).toBe(false);
      expect(result2.current.loading).toBe(false);
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);

    // Invalidate all cache
    invalidateCache();

    // Fetch again - should refetch both
    const { result: result3 } = renderHook(() => useApi('/api/test1'));
    const { result: result4 } = renderHook(() => useApi('/api/test2'));

    await waitFor(() => {
      expect(result3.current.loading).toBe(false);
      expect(result4.current.loading).toBe(false);
    });

    expect(global.fetch).toHaveBeenCalledTimes(4); // 2 initial + 2 after invalidation
  });

  it('should respect custom cache TTL', async () => {
    const mockData = { success: true, data: { id: 1, name: 'Test' } };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockData,
    });

    // First call with short TTL (100ms)
    const { result } = renderHook(() =>
      useApi<{ id: number; name: string }>('/api/test', { cacheTtl: 100 })
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Wait for cache to expire
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Second call - cache expired, should refetch
    const { result: result2 } = renderHook(() =>
      useApi<{ id: number; name: string }>('/api/test', { cacheTtl: 100 })
    );

    await waitFor(() => {
      expect(result2.current.loading).toBe(false);
    });

    expect(global.fetch).toHaveBeenCalledTimes(2); // Called twice
  });

  it('should only cache successful GET requests', async () => {
    const mockData = { success: true, data: null };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockData,
    });

    // Call with null data - should not cache
    const { result } = renderHook(() => useApi('/api/test'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Second call - should NOT use cache (data was null)
    const { result: result2 } = renderHook(() => useApi('/api/test'));

    await waitFor(() => {
      expect(result2.current.loading).toBe(false);
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('should not cache POST requests', async () => {
    const mockData = { success: true, data: { id: 1 } };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockData,
    });

    // First POST call
    const { result: result1 } = renderHook(() =>
      useApi('/api/test', { method: 'POST', body: JSON.stringify({ data: 'test' }) })
    );

    await waitFor(() => {
      expect(result1.current.loading).toBe(false);
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Second POST call - should NOT use cache
    const { result: result2 } = renderHook(() =>
      useApi('/api/test', { method: 'POST', body: JSON.stringify({ data: 'test' }) })
    );

    await waitFor(() => {
      expect(result2.current.loading).toBe(false);
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
