// SPDX-License-Identifier: MIT
/**
 * Tests for useMutation cache invalidation functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useMutation } from '../useMutation';
import { useApi, invalidateCache } from '../useApi';

describe('useMutation cache invalidation', () => {
  beforeEach(() => {
    // Clear all caches before each test
    invalidateCache();
    // Reset fetch mock
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should invalidate cache after successful mutation', async () => {
    const mockGetData = { success: true, data: { id: 1, name: 'Original' } };
    const mockPostData = { success: true, data: { id: 1, name: 'Updated' } };

    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockGetData,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockPostData,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockPostData,
      });

    // 1. Fetch data (populates cache)
    const { result: getResult } = renderHook(() => useApi<{ id: number; name: string }>('/api/test'));

    await waitFor(() => {
      expect(getResult.current.loading).toBe(false);
    });

    expect(getResult.current.data).toEqual({ id: 1, name: 'Original' });
    expect(global.fetch).toHaveBeenCalledTimes(1);

    // 2. Perform mutation with cache invalidation
    const { result: mutationResult } = renderHook(() =>
      useMutation<{ id: number; name: string }, { name: string }>('/api/test', 'POST', {
        invalidateCache: ['/api/test'],
      })
    );

    await mutationResult.current.mutate({ name: 'Updated' });

    await waitFor(() => {
      expect(mutationResult.current.loading).toBe(false);
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);

    // 3. Fetch data again (should refetch due to cache invalidation)
    const { result: getResult2 } = renderHook(() =>
      useApi<{ id: number; name: string }>('/api/test')
    );

    await waitFor(() => {
      expect(getResult2.current.loading).toBe(false);
    });

    expect(global.fetch).toHaveBeenCalledTimes(3); // New fetch after invalidation
  });

  it('should invalidate multiple cache endpoints', async () => {
    const mockData1 = { success: true, data: { id: 1 } };
    const mockData2 = { success: true, data: { id: 2 } };
    const mockPostData = { success: true, data: { success: true } };

    global.fetch = vi.fn()
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
        json: async () => mockPostData,
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
      });

    // Populate cache for two endpoints
    const { result: getResult1 } = renderHook(() => useApi('/api/test1'));
    const { result: getResult2 } = renderHook(() => useApi('/api/test2'));

    await waitFor(() => {
      expect(getResult1.current.loading).toBe(false);
      expect(getResult2.current.loading).toBe(false);
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);

    // Perform mutation that invalidates both caches
    const { result: mutationResult } = renderHook(() =>
      useMutation('/api/update', 'POST', {
        invalidateCache: ['/api/test1', '/api/test2'],
      })
    );

    await mutationResult.current.mutate({ data: 'test' });

    await waitFor(() => {
      expect(mutationResult.current.loading).toBe(false);
    });

    expect(global.fetch).toHaveBeenCalledTimes(3);

    // Fetch again - both should refetch
    const { result: getResult3 } = renderHook(() => useApi('/api/test1'));
    const { result: getResult4 } = renderHook(() => useApi('/api/test2'));

    await waitFor(() => {
      expect(getResult3.current.loading).toBe(false);
      expect(getResult4.current.loading).toBe(false);
    });

    expect(global.fetch).toHaveBeenCalledTimes(5); // 2 initial + 1 mutation + 2 refetch
  });

  it('should not invalidate cache on failed mutation', async () => {
    const mockGetData = { success: true, data: { id: 1, name: 'Original' } };

    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockGetData,
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Server error',
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockGetData,
      });

    // Populate cache
    const { result: getResult } = renderHook(() => useApi<{ id: number; name: string }>('/api/test'));

    await waitFor(() => {
      expect(getResult.current.loading).toBe(false);
    });

    expect(global.fetch).toHaveBeenCalledTimes(1);

    // Perform mutation that fails
    const { result: mutationResult } = renderHook(() =>
      useMutation<{ id: number; name: string }, { name: string }>('/api/test', 'POST', {
        invalidateCache: ['/api/test'],
      })
    );

    await mutationResult.current.mutate({ name: 'Updated' });

    await waitFor(() => {
      expect(mutationResult.current.loading).toBe(false);
      expect(mutationResult.current.error).toBeTruthy();
    });
    expect(global.fetch).toHaveBeenCalledTimes(2);

    // Fetch again - should use cache (not invalidated due to failed mutation)
    const { result: getResult2 } = renderHook(() =>
      useApi<{ id: number; name: string }>('/api/test')
    );

    await waitFor(() => {
      expect(getResult2.current.loading).toBe(false);
    });

    expect(global.fetch).toHaveBeenCalledTimes(2); // Still 2, cache was used
  });

  it('should work without invalidateCache option', async () => {
    const mockPostData = { success: true, data: { success: true } };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockPostData,
    });

    // Perform mutation without cache invalidation
    const { result: mutationResult } = renderHook(() =>
      useMutation<{ success: boolean }, { data: string }>('/api/test', 'POST')
    );

    await mutationResult.current.mutate({ data: 'test' });

    await waitFor(() => {
      expect(mutationResult.current.loading).toBe(false);
    });

    expect(mutationResult.current.error).toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('should support PUT and DELETE methods', async () => {
    const mockData = { success: true, data: { id: 1 } };

    global.fetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockData,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockData,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockData,
      });

    // Populate cache
    const { result: getResult } = renderHook(() => useApi('/api/test'));

    await waitFor(() => {
      expect(getResult.current.loading).toBe(false);
    });

    // PUT mutation with cache invalidation
    const { result: putResult } = renderHook(() =>
      useMutation('/api/test', 'PUT', {
        invalidateCache: ['/api/test'],
      })
    );

    await putResult.current.mutate({ data: 'updated' });

    await waitFor(() => {
      expect(putResult.current.loading).toBe(false);
    });

    // DELETE mutation with cache invalidation
    const { result: deleteResult } = renderHook(() =>
      useMutation('/api/test', 'DELETE', {
        invalidateCache: ['/api/test'],
      })
    );

    await deleteResult.current.mutate({ id: 1 });

    await waitFor(() => {
      expect(deleteResult.current.loading).toBe(false);
    });

    expect(global.fetch).toHaveBeenCalledTimes(3);
  });
});
