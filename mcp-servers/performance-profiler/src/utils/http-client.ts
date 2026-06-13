// SPDX-License-Identifier: MIT
/**
 * HTTP Client
 * Reusable HTTP client with variable substitution and response capture
 */

import { validateUrl } from './ssrf.js';

export interface HttpRequest {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
}

export interface HttpResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  json?: unknown;
  latencyMs: number;
}

export interface HttpError {
  type: 'timeout' | 'network' | 'parse' | 'unknown';
  message: string;
  latencyMs: number;
}

export type HttpResult =
  | { success: true; response: HttpResponse }
  | { success: false; error: HttpError };

/**
 * Make an HTTP request
 * Includes SSRF protection via validateUrl.
 *
 * Redirect policy: redirects are NOT automatically followed.  Each Location
 * hop is re-validated through validateUrl before the next request is issued.
 * This prevents an attacker from redirecting a validated public URL to a
 * private/metadata address mid-flight.
 */
export async function httpRequest(request: HttpRequest): Promise<HttpResult> {
  const { method, url, headers = {}, body, timeoutMs = 30000 } = request;

  // SSRF protection — throws for blocked private/metadata addresses
  await validateUrl(url);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const start = performance.now();

  // Maximum redirect hops to follow (0 = no redirects by default is handled
  // below via redirect:"manual" + manual hop logic).
  const MAX_REDIRECTS = 5;

  try {
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      signal: controller.signal,
      // Do NOT follow redirects automatically — we re-validate each hop.
      redirect: 'manual',
    };

    if (body && method !== 'GET' && method !== 'HEAD') {
      options.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    // Follow redirects manually so each Location is validated for SSRF.
    let currentUrl = url;
    let response!: Response;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      response = await fetch(currentUrl, { ...options, redirect: 'manual' });

      const isRedirect =
        response.status === 301 ||
        response.status === 302 ||
        response.status === 303 ||
        response.status === 307 ||
        response.status === 308;

      if (!isRedirect) break;

      const location = response.headers.get('location');
      if (!location) break;

      // Re-validate the redirect target before following
      await validateUrl(location);
      currentUrl = location;

      if (hop === MAX_REDIRECTS) {
        throw new Error(`Too many redirects (max ${MAX_REDIRECTS})`);
      }
    }
    const responseBody = await response.text();
    const latencyMs = performance.now() - start;

    // Parse headers
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    // Try to parse JSON
    let json: unknown;
    try {
      json = JSON.parse(responseBody);
    } catch {
      // Not JSON, that's fine
    }

    return {
      success: true,
      response: {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        body: responseBody,
        json,
        latencyMs,
      },
    };
  } catch (error) {
    const latencyMs = performance.now() - start;
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('abort')) {
      return {
        success: false,
        error: { type: 'timeout', message: 'Request timed out', latencyMs },
      };
    }

    if (message.includes('fetch') || message.includes('network')) {
      return {
        success: false,
        error: { type: 'network', message, latencyMs },
      };
    }

    return {
      success: false,
      error: { type: 'unknown', message, latencyMs },
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Substitute variables in a string
 * Variables are in format: {{VARIABLE_NAME}}
 */
export function substituteVariables(
  value: string,
  variables: Record<string, string>
): string {
  return value.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
    const trimmedName = varName.trim();
    return variables[trimmedName] !== undefined ? variables[trimmedName] : match;
  });
}

/**
 * Substitute variables in an object recursively
 */
export function substituteInObject<T>(
  obj: T,
  variables: Record<string, string>
): T {
  if (typeof obj === 'string') {
    return substituteVariables(obj, variables) as T;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => substituteInObject(item, variables)) as T;
  }

  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = substituteInObject(value, variables);
    }
    return result as T;
  }

  return obj;
}

/**
 * Extract value from JSON using JSONPath-like syntax
 * Supports simple paths like "$.token" or "$.data.user.id"
 */
export function extractJsonPath(json: unknown, path: string): string | undefined {
  if (!path.startsWith('$.')) {
    return undefined;
  }

  const parts = path.slice(2).split('.');
  let current: unknown = json;

  for (const part of parts) {
    if (current === null || typeof current !== 'object') {
      return undefined;
    }

    // Handle array index notation [0]
    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, prop, indexStr] = arrayMatch;
      const index = parseInt(indexStr, 10);
      const arr = (current as Record<string, unknown>)[prop];
      if (!Array.isArray(arr) || index >= arr.length) {
        return undefined;
      }
      current = arr[index];
    } else {
      current = (current as Record<string, unknown>)[part];
    }
  }

  if (current === undefined || current === null) {
    return undefined;
  }

  return typeof current === 'string' ? current : JSON.stringify(current);
}

/**
 * Capture values from response based on capture rules
 */
export function captureFromResponse(
  responseJson: unknown,
  captureRules: Record<string, string>
): Record<string, string> {
  const captured: Record<string, string> = {};

  for (const [varName, jsonPath] of Object.entries(captureRules)) {
    const value = extractJsonPath(responseJson, jsonPath);
    if (value !== undefined) {
      captured[varName] = value;
    }
  }

  return captured;
}

/**
 * Build full URL from base and path
 */
export function buildUrl(baseUrl: string, path: string): string {
  // Remove trailing slash from base
  const base = baseUrl.replace(/\/+$/, '');

  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  return `${base}${normalizedPath}`;
}

/**
 * Parse cookies from Set-Cookie header
 */
export function parseCookies(setCookieHeaders: string[]): Record<string, string> {
  const cookies: Record<string, string> = {};

  for (const header of setCookieHeaders) {
    const [cookiePart] = header.split(';');
    const [name, ...valueParts] = cookiePart.split('=');
    if (name && valueParts.length > 0) {
      cookies[name.trim()] = valueParts.join('=').trim();
    }
  }

  return cookies;
}

/**
 * Build Cookie header from cookies object
 */
export function buildCookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}
