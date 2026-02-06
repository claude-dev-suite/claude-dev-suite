// SPDX-License-Identifier: MIT
/**
 * API Explorer MCP Server - OpenAPI Spec Fetcher
 * Handles fetching, caching, and retry logic for OpenAPI/Swagger specs
 */

import { parse as parseYaml } from "yaml";
import type {
  ApiEndpointConfig,
  OpenAPISpec,
  CachedSpec,
} from "./types.js";
import { CONFIG_DEFAULTS, getEnvConfig } from "./config.js";

// ============================================
// Cache
// ============================================

const specCache = new Map<string, CachedSpec>();

/**
 * Get cache TTL from environment
 */
function getCacheTTL(): number {
  return getEnvConfig("API_EXPLORER_CACHE_TTL", CONFIG_DEFAULTS.CACHE_TTL) * 1000;
}

/**
 * Get timeout from environment
 */
function getTimeout(): number {
  return getEnvConfig("API_EXPLORER_TIMEOUT", CONFIG_DEFAULTS.TIMEOUT);
}

/**
 * Get retry count from environment
 */
function getRetryCount(): number {
  return getEnvConfig("API_EXPLORER_RETRY_COUNT", CONFIG_DEFAULTS.RETRY_COUNT);
}

// ============================================
// Fetcher Functions
// ============================================

/**
 * Fetch OpenAPI spec from endpoint with caching
 */
export async function fetchSpec(
  endpoint: ApiEndpointConfig,
  forceRefresh: boolean = false
): Promise<OpenAPISpec> {
  const cacheKey = endpoint.alias;

  // Check cache
  if (!forceRefresh) {
    const cached = specCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.spec;
    }
  }

  // Fetch with retry
  const spec = await fetchWithRetry(endpoint);

  // Cache result
  const cacheTTL = getCacheTTL();
  specCache.set(cacheKey, {
    spec,
    fetchedAt: Date.now(),
    expiresAt: Date.now() + cacheTTL,
  });

  return spec;
}

/**
 * Fetch with retry logic
 */
async function fetchWithRetry(
  endpoint: ApiEndpointConfig,
  attempt: number = 0
): Promise<OpenAPISpec> {
  const retryCount = getRetryCount();

  try {
    return await doFetch(endpoint);
  } catch (error) {
    if (attempt < retryCount) {
      // Exponential backoff
      const delay = Math.pow(2, attempt) * 500;
      await sleep(delay);
      return fetchWithRetry(endpoint, attempt + 1);
    }
    throw error;
  }
}

/**
 * Perform actual fetch
 */
async function doFetch(endpoint: ApiEndpointConfig): Promise<OpenAPISpec> {
  const timeout = endpoint.timeout || getTimeout();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const headers: Record<string, string> = {
      Accept: "application/json, application/yaml, text/yaml, */*",
      ...endpoint.headers,
    };

    const response = await fetch(endpoint.url, {
      method: "GET",
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch OpenAPI spec from ${endpoint.url}: ${response.status} ${response.statusText}`
      );
    }

    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();

    // Parse based on content type or file extension
    let spec: OpenAPISpec;

    if (
      contentType.includes("yaml") ||
      contentType.includes("yml") ||
      endpoint.url.endsWith(".yaml") ||
      endpoint.url.endsWith(".yml")
    ) {
      spec = parseYaml(text) as OpenAPISpec;
    } else {
      // Try JSON first, fall back to YAML
      try {
        spec = JSON.parse(text) as OpenAPISpec;
      } catch {
        spec = parseYaml(text) as OpenAPISpec;
      }
    }

    // Validate basic structure
    if (!spec || typeof spec !== "object") {
      throw new Error("Invalid OpenAPI spec: not an object");
    }

    if (!spec.openapi && !spec.swagger) {
      throw new Error(
        "Invalid OpenAPI spec: missing 'openapi' or 'swagger' version field"
      );
    }

    if (!spec.info || !spec.paths) {
      throw new Error("Invalid OpenAPI spec: missing 'info' or 'paths' field");
    }

    return spec;
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        throw new Error(
          `Timeout fetching OpenAPI spec from ${endpoint.url} after ${timeout}ms`
        );
      }
      throw error;
    }
    throw new Error(`Unknown error fetching spec from ${endpoint.url}`);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetch specs from multiple endpoints
 */
export async function fetchSpecs(
  endpoints: ApiEndpointConfig[],
  forceRefresh: boolean = false
): Promise<Map<string, OpenAPISpec | Error>> {
  const results = new Map<string, OpenAPISpec | Error>();

  // Fetch in parallel
  const promises = endpoints.map(async (endpoint) => {
    try {
      const spec = await fetchSpec(endpoint, forceRefresh);
      results.set(endpoint.alias, spec);
    } catch (error) {
      results.set(
        endpoint.alias,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  });

  await Promise.all(promises);
  return results;
}

/**
 * Clear cache for a specific endpoint or all
 */
export function clearCache(alias?: string): void {
  if (alias) {
    specCache.delete(alias);
  } else {
    specCache.clear();
  }
}

/**
 * Get cache status
 */
export function getCacheStatus(): Array<{
  alias: string;
  fetchedAt: Date;
  expiresAt: Date;
  isExpired: boolean;
}> {
  const status: Array<{
    alias: string;
    fetchedAt: Date;
    expiresAt: Date;
    isExpired: boolean;
  }> = [];

  for (const [alias, cached] of specCache) {
    status.push({
      alias,
      fetchedAt: new Date(cached.fetchedAt),
      expiresAt: new Date(cached.expiresAt),
      isExpired: Date.now() >= cached.expiresAt,
    });
  }

  return status;
}

/**
 * Probe an endpoint to check if it's accessible
 */
export async function probeEndpoint(
  url: string,
  timeout: number = 5000
): Promise<{
  accessible: boolean;
  statusCode?: number;
  contentType?: string;
  error?: string;
}> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
    });

    return {
      accessible: response.ok,
      statusCode: response.status,
      contentType: response.headers.get("content-type") || undefined,
    };
  } catch (error) {
    return {
      accessible: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Try multiple endpoint URLs and return the first successful one
 */
export async function tryEndpoints(
  baseUrl: string,
  endpoints: string[]
): Promise<{ url: string; spec: OpenAPISpec } | null> {
  for (const endpoint of endpoints) {
    const fullUrl = `${baseUrl.replace(/\/$/, "")}${endpoint}`;

    try {
      const spec = await fetchSpec({ alias: "probe", url: fullUrl });
      return { url: fullUrl, spec };
    } catch {
      // Try next endpoint
    }
  }

  return null;
}

// ============================================
// Utilities
// ============================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
