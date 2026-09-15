// SPDX-License-Identifier: MIT
/**
 * Tests for useApi hook
 *
 * Tests data fetching, loading states, error handling, and refetch.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { invalidateCache, useApi } from '../useApi';
import type { ApiResponse } from '@/types';

// Helper to create mock response
const createMockResponse = (data: unknown, ok = true, status = 200) =>
  Promise.resolve({
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(typeof data === 'string' ? data : JSON.stringify(data)),
    headers: new Headers(),
    clone: function () {
      return this;
    },
  });

describe('useApi', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    invalidateCache();
    // Create fresh spy on fetch
    fetchSpy = vi.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('should fetch data successfully', async () => {
    const mockData = { id: 1, name: 'Test' };
    const mockResponse: ApiResponse<typeof mockData> = {
      success: true,
      data: mockData,
    };

    fetchSpy.mockImplementation(() => createMockResponse(mockResponse));

    const { result } = renderHook(() => useApi<typeof mockData>('/api/test'));

    // Initially loading
    expect(result.current.loading).toBe(true);

    // Wait for data
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual(mockData);
    expect(result.current.error).toBe(null);
    expect(result.current.status).toBe(200);
  });

  it('should handle fetch errors', async () => {
    const errorMessage = 'Network error';

    fetchSpy.mockImplementation(() => createMockResponse(errorMessage, false, 500));

    const { result } = renderHook(() => useApi('/api/test'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toBe(null);
    expect(result.current.error).toBe(errorMessage);
    expect(result.current.status).toBe(500);
  });

  it('should handle API errors', async () => {
    const mockResponse: ApiResponse<unknown> = {
      success: false,
      error: 'Invalid request',
    };

    fetchSpy.mockImplementation(() => createMockResponse(mockResponse));

    const { result } = renderHook(() => useApi('/api/test'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toBe(null);
    expect(result.current.error).toBe('Invalid request');
  });

  it('should skip initial fetch when skip option is true', async () => {
    const { result } = renderHook(() => useApi('/api/test', { skip: true }));

    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBe(null);
    expect(result.current.error).toBe(null);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('should refetch data manually', async () => {
    const mockData = { id: 1 };
    const refetchedData = { id: 2 };
    const mockResponse: ApiResponse<typeof mockData> = {
      success: true,
      data: mockData,
    };
    const refetchedResponse: ApiResponse<typeof refetchedData> = {
      success: true,
      data: refetchedData,
    };

    fetchSpy
      .mockImplementationOnce(() => createMockResponse(mockResponse))
      .mockImplementationOnce(() => createMockResponse(refetchedResponse));

    const { result } = renderHook(() => useApi<typeof mockData>('/api/test'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.refetch();
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(result.current.data).toEqual(refetchedData);
  });

  it('should allow manual refetch to use cached data', async () => {
    const mockData = { id: 1 };
    const mockResponse: ApiResponse<typeof mockData> = {
      success: true,
      data: mockData,
    };

    fetchSpy.mockImplementationOnce(() => createMockResponse(mockResponse));

    const { result } = renderHook(() => useApi<typeof mockData>('/api/test'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual(mockData);

    await act(async () => {
      await result.current.refetch({ force: false });
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual(mockData);
  });

  // CSRF test removed - CSRF protection not needed for localhost-only tools

  it('should construct full URL from endpoint', async () => {
    const mockResponse: ApiResponse<unknown> = {
      success: true,
      data: {},
    };

    fetchSpy.mockImplementation(() => createMockResponse(mockResponse));

    renderHook(() => useApi('/api/test'));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/test',
      expect.any(Object)
    );
  });

  it('should use absolute URL if provided', async () => {
    const mockResponse: ApiResponse<unknown> = {
      success: true,
      data: {},
    };

    fetchSpy.mockImplementation(() => createMockResponse(mockResponse));

    renderHook(() => useApi('https://example.com/api/test'));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalled();
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://example.com/api/test',
      expect.any(Object)
    );
  });
});
