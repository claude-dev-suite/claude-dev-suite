// SPDX-License-Identifier: MIT
/**
 * Custom hook for fetching data from API endpoints
 *
 * Handles loading states, error handling, and automatic retries.
 * Manages CSRF token automatically from sessionStorage.
 * Includes in-memory caching with TTL for GET requests.
 *
 * @example
 * ```tsx
 * const { data, loading, error, refetch } = useApi<Agent[]>('/api/agents');
 *
 * // Disable caching
 * const { data } = useApi<Config>('/api/config', { useCache: false });
 *
 * // Force refresh (bypass cache)
 * const { data } = useApi<Data>('/api/data', { forceRefresh: true });
 * ```
 */

import { useState, useEffect, useCallback, useRef } from 'react';
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

// Cache storage
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const cache = new Map<string, CacheEntry<unknown>>();
const DEFAULT_CACHE_TTL = 30000; // 30 seconds

/**
 * Generate a unique cache key from endpoint and request options
 */
function getCacheKey(endpoint: string, options?: RequestInit): string {
  const method = options?.method || 'GET';
  const body = options?.body ? JSON.stringify(options.body) : '';
  return `${method}:${endpoint}:${body}`;
}

/**
 * Check if a cache entry is still valid based on TTL
 */
function isCacheValid<T>(entry: CacheEntry<T> | undefined, ttl: number): entry is CacheEntry<T> {
  if (!entry) return false;
  return Date.now() - entry.timestamp < ttl;
}

/**
 * Clear cached responses for specific endpoint or all endpoints
 *
 * @param endpoint - Optional endpoint pattern to clear (clears all if not provided)
 *
 * @example
 * ```tsx
 * // Clear all cache
 * invalidateCache();
 *
 * // Clear cache for specific endpoint
 * invalidateCache('/api/agents');
 * ```
 */
export function invalidateCache(endpoint?: string): void {
  if (endpoint) {
    // Clear specific endpoint
    for (const key of cache.keys()) {
      if (key.includes(endpoint)) {
        cache.delete(key);
      }
    }
  } else {
    // Clear all
    cache.clear();
  }
}

export interface UseApiOptions extends Omit<RequestInit, 'cache'> {
  /** Whether to skip the initial fetch (default: false) */
  skip?: boolean;
  /** Whether to automatically refetch on mount (default: false) */
  refetchOnMount?: boolean;
  /** Polling interval in ms (default: null - no polling) */
  pollingInterval?: number;
  /** Enable response caching (default: true for GET requests) */
  useCache?: boolean;
  /** Cache TTL in milliseconds (default: 30000) */
  cacheTtl?: number;
  /** Bypass cache and force fresh fetch (default: false) */
  forceRefresh?: boolean;
}

export interface UseApiResult<T> {
  /** Response data (null if not loaded or error) */
  data: T | null;
  /** Whether request is in progress */
  loading: boolean;
  /** Error message if request failed */
  error: string | null;
  /** Function to manually refetch data */
  refetch: () => void;
  /** HTTP status code */
  status: number | null;
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
 * Generic API fetch hook with loading/error states
 */
export function useApi<T>(
  endpoint: string,
  options: UseApiOptions = {}
): UseApiResult<T> {
  const {
    skip = false,
    refetchOnMount = false,
    pollingInterval,
    useCache: enableCache = true,
    cacheTtl = DEFAULT_CACHE_TTL,
    forceRefresh = false,
    ...fetchOptions
  } = options;
  const logger = getLogger('useApi');

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(!skip);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [errorObj, setErrorObj] = useState<ApiError | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const pollingTimeoutRef = useRef<number | null>(null);
  const fetchDataRef = useRef<() => Promise<void>>(undefined);
  // FIX: Track in-flight requests to prevent overlapping polling requests
  const isInFlightRef = useRef<boolean>(false);

  const fetchData = useCallback(async () => {
    // FIX: Prevent overlapping requests during polling
    if (isInFlightRef.current) {
      logger.debug('Skipping fetch - request already in flight', { endpoint });
      return;
    }

    const method = fetchOptions.method || 'GET';
    const cacheKey = getCacheKey(endpoint, fetchOptions);

    // Check cache first (only for GET requests)
    if (enableCache && method === 'GET' && !forceRefresh) {
      const cached = cache.get(cacheKey) as CacheEntry<T> | undefined;
      if (isCacheValid(cached, cacheTtl)) {
        logger.debug('Using cached response', { endpoint, cacheKey });
        setData(cached.data);
        setLoading(false);
        setError(null);
        setErrorObj(null);
        return;
      }
    }

    // Cancel any ongoing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);
    setErrorObj(null);
    isInFlightRef.current = true;

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
        headers,
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

      const result = json.data ?? null;

      // Store in cache (only for successful GET requests)
      if (enableCache && method === 'GET' && result !== null) {
        cache.set(cacheKey, { data: result, timestamp: Date.now() });
        logger.debug('Cached response', { endpoint, cacheKey });
      }

      setData(result);
      setError(null);
      setErrorObj(null);
    } catch (err) {
      // Ignore abort errors
      if (err instanceof Error && err.name === 'AbortError') {
        return;
      }

      // Store error object and message
      const errorObject = err instanceof ApiError ? err : null;
      const message = getUserErrorMessage(err);

      setError(message);
      setErrorObj(errorObject);
      setData(null);

      logger.error(`Error fetching ${endpoint}`, err);
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
      isInFlightRef.current = false;
    }
  }, [endpoint, fetchOptions, logger, enableCache, cacheTtl, forceRefresh]);

  // Keep ref up to date with latest fetchData
  useEffect(() => {
    fetchDataRef.current = fetchData;
  }, [fetchData]);

  // Initial fetch
  useEffect(() => {
    if (!skip && fetchDataRef.current) {
      fetchDataRef.current();
    }

    return () => {
      // Cleanup: abort ongoing request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [skip, endpoint]);

  // Refetch on mount
  useEffect(() => {
    if (refetchOnMount && !skip && fetchDataRef.current) {
      fetchDataRef.current();
    }
  }, [refetchOnMount, skip]);

  // Polling - FIX: in-flight check now handled in fetchData callback
  useEffect(() => {
    if (pollingInterval && !skip && fetchDataRef.current) {
      pollingTimeoutRef.current = window.setInterval(() => {
        // In-flight check is now inside fetchData, preventing overlapping requests
        fetchDataRef.current?.();
      }, pollingInterval);

      return () => {
        if (pollingTimeoutRef.current !== null) {
          clearInterval(pollingTimeoutRef.current);
        }
      };
    }
  }, [pollingInterval, skip]);

  return {
    data,
    loading,
    error,
    refetch: fetchData,
    status,
    errorObj,
    isNetworkError: errorObj ? isNetworkError(errorObj) : false,
    isValidationError: errorObj ? isValidationError(errorObj) : false,
    isServerError: errorObj ? isServerError(errorObj) : false,
  };
}
