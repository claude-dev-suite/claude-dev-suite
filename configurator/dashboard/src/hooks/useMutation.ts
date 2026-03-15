// SPDX-License-Identifier: MIT
/**
 * Custom hook for API mutations (POST, PUT, DELETE)
 *
 * Handles POST/DELETE requests with loading states and error handling.
 * Manages CSRF token automatically from sessionStorage.
 * Automatically invalidates related cache entries after successful mutations.
 *
 * @example
 * ```tsx
 * const { mutate, loading, error } = useMutation<InstallationResponse, InstallRequest>(
 *   '/api/install',
 *   'POST'
 * );
 *
 * const handleInstall = async () => {
 *   const result = await mutate({ projectPath, agents, mcpServers, envVars });
 *   if (result) {
 *     console.log('Installed:', result);
 *   }
 * };
 *
 * // Invalidate specific cache after mutation
 * const { mutate } = useMutation('/api/agents', 'POST', {
 *   invalidateCache: ['/api/agents', '/api/config']
 * });
 * ```
 */

import { useState, useCallback, useRef } from 'react';
import type { ApiResponse } from '@/types';
import { getLogger } from '@/utils/logger';
import {
  ApiError,
  isNetworkError,
  isValidationError,
  isServerError,
  getUserErrorMessage,
} from '@/utils/errors';
import { API_BASE } from '@/utils/api';
import { invalidateCache } from './useApi';

type HttpMethod = 'POST' | 'PUT' | 'DELETE';

export interface UseMutationOptions extends Omit<RequestInit, 'method' | 'body'> {
  /** Custom error handler */
  onError?: (error: Error | ApiError) => void;
  /** Success callback */
  onSuccess?: <T>(data: T) => void;
  /** Endpoints to invalidate cache after successful mutation */
  invalidateCache?: string[];
}

export interface UseMutationResult<T, P> {
  /** Mutation function */
  mutate: (payload: P) => Promise<T | null>;
  /** Whether mutation is in progress */
  loading: boolean;
  /** Error message if mutation failed */
  error: string | null;
  /** HTTP status code */
  status: number | null;
  /** Reset error state */
  reset: () => void;
  /** Full error object with type information */
  errorObj: ApiError | null;
  /** Whether the error is a network error */
  isNetworkError: boolean;
  /** Whether the error is a validation error (400) */
  isValidationError: boolean;
  /** Whether the error is a server error (5xx) */
  isServerError: boolean;
}

// API base URL - use shared config from @/utils/api

/**
 * Note: CSRF protection removed - this is a localhost-only tool
 * The server binds to 127.0.0.1 and is not network-accessible
 */

/**
 * Generic mutation hook for POST/PUT/DELETE requests
 */
export function useMutation<T, P = unknown>(
  endpoint: string,
  method: HttpMethod = 'POST',
  options: UseMutationOptions = {}
): UseMutationResult<T, P> {
  const { onError, onSuccess, invalidateCache: cacheEndpoints, ...fetchOptions } = options;
  const logger = getLogger('useMutation');

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [errorObj, setErrorObj] = useState<ApiError | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  const mutate = useCallback(
    async (payload: P): Promise<T | null> => {
      // Cancel any ongoing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const controller = new AbortController();
      abortControllerRef.current = controller;

      setLoading(true);
      setError(null);
      setStatus(null);
      setErrorObj(null);

      try {
        const url = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        // Add existing headers
        if (fetchOptions.headers) {
          const existingHeaders = new Headers(fetchOptions.headers);
          existingHeaders.forEach((value, key) => {
            headers[key] = value;
          });
        }

        const response = await fetch(url, {
          ...fetchOptions,
          method,
          headers,
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        setStatus(response.status);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || `HTTP ${response.status}: ${response.statusText}`);
        }

        const json: ApiResponse<T> = await response.json();

        if (!json.success) {
          throw new Error(json.error || 'Unknown API error');
        }

        const data = json.data ?? null;

        // Invalidate cache after successful mutation
        if (cacheEndpoints && cacheEndpoints.length > 0) {
          cacheEndpoints.forEach((endpoint) => {
            invalidateCache(endpoint);
            logger.debug('Invalidated cache', { endpoint });
          });
        }

        if (data && onSuccess) {
          onSuccess(data);
        }

        return data;
      } catch (err) {
        // Ignore abort errors
        if (err instanceof Error && err.name === 'AbortError') {
          return null;
        }

        // Store error object and message
        const errorObject = err instanceof ApiError ? err : null;
        const error = err instanceof Error || err instanceof ApiError ? err : new Error('Unknown error occurred');
        const message = getUserErrorMessage(err);

        setError(message);
        setErrorObj(errorObject);

        if (onError) {
          onError(error);
        }

        logger.error(`${method} ${endpoint} failed`, err);

        return null;
      } finally {
        setLoading(false);
        abortControllerRef.current = null;
      }
    },
    [endpoint, method, fetchOptions, onError, onSuccess, cacheEndpoints, logger]
  );

  const reset = useCallback(() => {
    setError(null);
    setStatus(null);
    setErrorObj(null);
  }, []);

  return {
    mutate,
    loading,
    error,
    status,
    reset,
    errorObj,
    isNetworkError: errorObj ? isNetworkError(errorObj) : false,
    isValidationError: errorObj ? isValidationError(errorObj) : false,
    isServerError: errorObj ? isServerError(errorObj) : false,
  };
}
