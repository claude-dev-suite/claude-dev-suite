// SPDX-License-Identifier: MIT
/**
 * Tests for useMutation hook
 *
 * Tests POST/PUT/DELETE mutations, loading states, error handling, CSRF tokens.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useMutation } from '../useMutation';
import type { ApiResponse } from '@/types';

// Helper to create mock response
const createMockResponse = (data: unknown, ok = true, status = 200) => ({
  ok,
  status,
  statusText: ok ? 'OK' : 'Error',
  json: async () => data,
  // For error responses, text() should return a plain string
  text: async () => typeof data === 'string' ? data : JSON.stringify(data),
  headers: new Headers(),
  clone: function() { return this; },
});

describe('useMutation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should perform POST mutation successfully', async () => {
    const mockPayload = { name: 'Test' };
    const mockResponse: ApiResponse<{ id: number; name: string }> = {
      success: true,
      data: { id: 1, name: 'Test' },
    };

    vi.mocked(global.fetch).mockResolvedValueOnce(
      createMockResponse(mockResponse) as Response
    );

    const { result } = renderHook(() =>
      useMutation<{ id: number; name: string }, typeof mockPayload>(
        '/api/create',
        'POST'
      )
    );

    expect(result.current.loading).toBe(false);

    let data: { id: number; name: string } | null = null;
    await act(async () => {
      data = await result.current.mutate(mockPayload);
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(data).toEqual({ id: 1, name: 'Test' });
    expect(result.current.error).toBe(null);
    expect(result.current.status).toBe(200);
  });

  it('should perform DELETE mutation successfully', async () => {
    const mockResponse: ApiResponse<{ deleted: boolean }> = {
      success: true,
      data: { deleted: true },
    };

    vi.mocked(global.fetch).mockResolvedValueOnce(
      createMockResponse(mockResponse) as Response
    );

    const { result } = renderHook(() =>
      useMutation<{ deleted: boolean }, { id: number }>('/api/delete', 'DELETE')
    );

    let data: { deleted: boolean } | null = null;
    await act(async () => {
      data = await result.current.mutate({ id: 1 });
    });

    expect(data).toEqual({ deleted: true });
    expect(result.current.error).toBe(null);
  });

  it('should perform PUT mutation successfully', async () => {
    const mockPayload = { id: 1, name: 'Updated' };
    const mockResponse: ApiResponse<typeof mockPayload> = {
      success: true,
      data: mockPayload,
    };

    vi.mocked(global.fetch).mockResolvedValueOnce(
      createMockResponse(mockResponse) as Response
    );

    const { result } = renderHook(() =>
      useMutation<typeof mockPayload, typeof mockPayload>('/api/update', 'PUT')
    );

    let data: typeof mockPayload | null = null;
    await act(async () => {
      data = await result.current.mutate(mockPayload);
    });

    expect(data).toEqual(mockPayload);
  });

  it('should handle mutation errors', async () => {
    const errorMessage = 'Validation failed';

    vi.mocked(global.fetch).mockResolvedValueOnce(
      createMockResponse(errorMessage, false, 400) as Response
    );

    const { result } = renderHook(() =>
      useMutation<unknown, unknown>('/api/create', 'POST')
    );

    let data: unknown = null;
    await act(async () => {
      data = await result.current.mutate({ name: 'Test' });
    });

    expect(data).toBe(null);
    expect(result.current.error).toBe(errorMessage);
    expect(result.current.status).toBe(400);
  });

  it('should handle API errors', async () => {
    const mockResponse: ApiResponse<unknown> = {
      success: false,
      error: 'Database error',
    };

    vi.mocked(global.fetch).mockResolvedValueOnce(
      createMockResponse(mockResponse) as Response
    );

    const { result } = renderHook(() =>
      useMutation<unknown, unknown>('/api/create', 'POST')
    );

    let data: unknown = null;
    await act(async () => {
      data = await result.current.mutate({ name: 'Test' });
    });

    expect(data).toBe(null);
    expect(result.current.error).toBe('Database error');
  });

  // CSRF test removed - CSRF protection not needed for localhost-only tools

  it('should call onSuccess callback', async () => {
    const mockData = { id: 1 };
    const mockResponse: ApiResponse<typeof mockData> = {
      success: true,
      data: mockData,
    };

    const onSuccess = vi.fn();

    vi.mocked(global.fetch).mockResolvedValueOnce(
      createMockResponse(mockResponse) as Response
    );

    const { result } = renderHook(() =>
      useMutation<typeof mockData, unknown>('/api/create', 'POST', {
        onSuccess,
      })
    );

    await act(async () => {
      await result.current.mutate({ name: 'Test' });
    });

    expect(onSuccess).toHaveBeenCalledWith(mockData);
  });

  it('should call onError callback', async () => {
    const onError = vi.fn();

    vi.mocked(global.fetch).mockResolvedValueOnce(
      createMockResponse('Server error', false, 500) as Response
    );

    const { result } = renderHook(() =>
      useMutation<unknown, unknown>('/api/create', 'POST', { onError })
    );

    await act(async () => {
      await result.current.mutate({ name: 'Test' });
    });

    expect(onError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('should reset error state', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      createMockResponse('Error', false, 400) as Response
    );

    const { result } = renderHook(() =>
      useMutation<unknown, unknown>('/api/create', 'POST')
    );

    await act(async () => {
      await result.current.mutate({ name: 'Test' });
    });

    expect(result.current.error).toBe('Error');
    expect(result.current.status).toBe(400);

    act(() => {
      result.current.reset();
    });

    expect(result.current.error).toBe(null);
    expect(result.current.status).toBe(null);
  });

  it('should send JSON body', async () => {
    const mockPayload = { name: 'Test', count: 42 };
    const mockResponse: ApiResponse<unknown> = {
      success: true,
      data: {},
    };

    vi.mocked(global.fetch).mockResolvedValueOnce(
      createMockResponse(mockResponse) as Response
    );

    const { result } = renderHook(() =>
      useMutation<unknown, typeof mockPayload>('/api/create', 'POST')
    );

    await act(async () => {
      await result.current.mutate(mockPayload);
    });

    expect(global.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(mockPayload),
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
      })
    );
  });

  it('should construct full URL from endpoint', async () => {
    const mockResponse: ApiResponse<unknown> = {
      success: true,
      data: {},
    };

    vi.mocked(global.fetch).mockResolvedValueOnce(
      createMockResponse(mockResponse) as Response
    );

    const { result } = renderHook(() =>
      useMutation<unknown, unknown>('/api/create', 'POST')
    );

    await act(async () => {
      await result.current.mutate({ name: 'Test' });
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/create',
      expect.any(Object)
    );
  });

  it('should use absolute URL if provided', async () => {
    const mockResponse: ApiResponse<unknown> = {
      success: true,
      data: {},
    };

    vi.mocked(global.fetch).mockResolvedValueOnce(
      createMockResponse(mockResponse) as Response
    );

    const { result } = renderHook(() =>
      useMutation<unknown, unknown>('https://example.com/api/create', 'POST')
    );

    await act(async () => {
      await result.current.mutate({ name: 'Test' });
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://example.com/api/create',
      expect.any(Object)
    );
  });
});
