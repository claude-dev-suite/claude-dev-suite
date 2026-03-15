// SPDX-License-Identifier: MIT
/**
 * Shared fetch utility for API calls
 *
 * Provides a consistent way to make API requests with:
 * - Automatic URL building with API_BASE
 * - JSON content type headers
 * - Response parsing and error handling
 * - AbortController support
 *
 * Use this utility in custom hooks that need more control than useApi/useMutation provide,
 * such as hooks with multiple concurrent requests or complex state management.
 *
 * @example
 * ```ts
 * // Simple GET request
 * const result = await fetchApi<AgentsResponse>('/api/agents');
 *
 * // GET with query params
 * const result = await fetchApi<ConfigResponse>('/api/config', {
 *   params: { path: projectPath }
 * });
 *
 * // POST request
 * const result = await fetchApi<CreateResponse>('/api/agents', {
 *   method: 'POST',
 *   body: { name: 'test', content: '...' }
 * });
 *
 * // With abort controller
 * const controller = new AbortController();
 * const result = await fetchApi<DataResponse>('/api/data', {
 *   signal: controller.signal
 * });
 * ```
 */

import { API_BASE } from './api';
import { getUserErrorMessage } from './errors';
import { getLogger } from './logger';

const logger = getLogger('fetchApi');

export interface FetchApiOptions<TBody = unknown> {
  /** HTTP method (default: 'GET') */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  /** Request body (will be JSON.stringify'd) */
  body?: TBody;
  /** URL query parameters */
  params?: Record<string, string | number | boolean | undefined>;
  /** Additional headers */
  headers?: Record<string, string>;
  /** AbortSignal for request cancellation */
  signal?: AbortSignal;
  /** Skip JSON parsing of response (return raw Response) */
  rawResponse?: boolean;
}

export interface FetchApiResult<T> {
  /** Whether the request was successful */
  success: boolean;
  /** Response data (if successful) */
  data?: T;
  /** Error message (if failed) */
  error?: string;
  /** HTTP status code */
  status: number;
}

/**
 * Build URL with query parameters
 */
function buildUrl(endpoint: string, params?: Record<string, string | number | boolean | undefined>): string {
  const baseUrl = endpoint.startsWith('http') ? endpoint : `${API_BASE}${endpoint}`;

  if (!params) return baseUrl;

  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      searchParams.set(key, String(value));
    }
  }

  const queryString = searchParams.toString();
  return queryString ? `${baseUrl}?${queryString}` : baseUrl;
}

/**
 * Make an API request with consistent handling
 *
 * @returns Result object with success, data, error, and status
 */
export async function fetchApi<T, TBody = unknown>(
  endpoint: string,
  options: FetchApiOptions<TBody> = {}
): Promise<FetchApiResult<T>> {
  const { method = 'GET', body, params, headers: customHeaders, signal, rawResponse } = options;

  const url = buildUrl(endpoint, params);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...customHeaders,
  };

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });

    if (rawResponse) {
      return {
        success: response.ok,
        data: response as unknown as T,
        status: response.status,
      };
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      let errorMessage = `HTTP ${response.status}`;

      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.message || errorMessage;
      } catch {
        if (errorText) errorMessage = errorText;
      }

      return {
        success: false,
        error: errorMessage,
        status: response.status,
      };
    }

    const json = await response.json();

    // Handle API response format { success, data, error }
    if (typeof json === 'object' && json !== null && 'success' in json) {
      if (!json.success) {
        return {
          success: false,
          error: json.error || 'Unknown API error',
          status: response.status,
        };
      }
      return {
        success: true,
        data: json.data as T,
        status: response.status,
      };
    }

    // Raw JSON response
    return {
      success: true,
      data: json as T,
      status: response.status,
    };
  } catch (err) {
    // Handle abort
    if (err instanceof Error && err.name === 'AbortError') {
      return {
        success: false,
        error: 'Request aborted',
        status: 0,
      };
    }

    const message = getUserErrorMessage(err);
    logger.error(`fetchApi error: ${endpoint}`, err);

    return {
      success: false,
      error: message,
      status: 0,
    };
  }
}

/**
 * Make multiple API requests concurrently
 *
 * @example
 * ```ts
 * const [agents, skills] = await fetchApiAll([
 *   fetchApi<AgentsResponse>('/api/agents'),
 *   fetchApi<SkillsResponse>('/api/skills'),
 * ]);
 * ```
 */
export function fetchApiAll<T extends readonly unknown[]>(
  requests: { [K in keyof T]: Promise<FetchApiResult<T[K]>> }
): Promise<{ [K in keyof T]: FetchApiResult<T[K]> }> {
  return Promise.all(requests);
}

/**
 * Create an abort controller and return with cleanup function
 *
 * @example
 * ```ts
 * useEffect(() => {
 *   const { signal, abort } = createAbortController();
 *
 *   fetchApi('/api/data', { signal }).then(handleResult);
 *
 *   return abort; // Cleanup on unmount
 * }, []);
 * ```
 */
export function createAbortController(): { signal: AbortSignal; abort: () => void } {
  const controller = new AbortController();
  return {
    signal: controller.signal,
    abort: () => controller.abort(),
  };
}
