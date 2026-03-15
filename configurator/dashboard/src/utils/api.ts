// SPDX-License-Identifier: MIT
/**
 * API utilities for making requests to the backend server.
 * Handles base URL for both development (Vite proxy) and Electron (direct).
 * Uses typed error classes for better error handling.
 * Includes timeout handling to prevent hanging requests.
 */

import { createApiError, createNetworkError } from './errors';
import { getLogger } from './logger';
import { config } from '@/config';

const logger = getLogger('api');

// In Electron with file:// protocol, we need absolute URLs
const isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;
const isFileProtocol = typeof window !== 'undefined' && window.location.protocol === 'file:';

// Base URL for API requests
export const API_BASE = isElectron || isFileProtocol ? config.api.baseUrl : '';

/**
 * Make a GET request to the API with timeout
 */
export async function apiGet<T>(endpoint: string, options?: { timeout?: number }): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const timeout = options?.timeout ?? config.api.timeout;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
    });

    if (!res.ok) {
      const error = await createApiError(res);
      logger.error(`GET ${endpoint} failed`, error);
      throw error;
    }

    return res.json();
  } catch (error) {
    // Handle timeout error
    if (error instanceof Error && error.name === 'AbortError') {
      const timeoutError = createNetworkError(new Error('Request timeout'));
      logger.error(`GET ${endpoint} timeout after ${timeout}ms`, timeoutError);
      throw timeoutError;
    }

    // If it's already an ApiError, rethrow it
    if (error instanceof Error && error.name !== 'TypeError') {
      throw error;
    }

    // Network/fetch failure
    const networkError = createNetworkError(error);
    logger.error(`GET ${endpoint} network error`, networkError);
    throw networkError;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Make a POST request to the API with timeout
 */
export async function apiPost<T>(endpoint: string, data?: unknown, options?: { timeout?: number }): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const timeout = options?.timeout ?? config.api.timeout;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: data ? JSON.stringify(data) : undefined,
      signal: controller.signal,
    });

    if (!res.ok) {
      const error = await createApiError(res);
      logger.error(`POST ${endpoint} failed`, error);
      throw error;
    }

    return res.json();
  } catch (error) {
    // Handle timeout error
    if (error instanceof Error && error.name === 'AbortError') {
      const timeoutError = createNetworkError(new Error('Request timeout'));
      logger.error(`POST ${endpoint} timeout after ${timeout}ms`, timeoutError);
      throw timeoutError;
    }

    // If it's already an ApiError, rethrow it
    if (error instanceof Error && error.name !== 'TypeError') {
      throw error;
    }

    // Network/fetch failure
    const networkError = createNetworkError(error);
    logger.error(`POST ${endpoint} network error`, networkError);
    throw networkError;
  } finally {
    clearTimeout(timeoutId);
  }
}
