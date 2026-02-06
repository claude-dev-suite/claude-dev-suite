// SPDX-License-Identifier: MIT
/**
 * API Explorer MCP Server - Configuration Parser
 * Supports 3 formats:
 * 1. Single URL: http://localhost:8080/v3/api-docs
 * 2. CSV URLs: http://localhost:8080/v3/api-docs,http://localhost:8081/openapi.json
 * 3. JSON Array: [{"alias":"api","url":"http://localhost:8080/v3/api-docs"}]
 */

import type { ApiEndpointConfig } from "./types.js";

/**
 * Parse API_EXPLORER_ENDPOINTS environment variable
 */
export function parseEndpointsConfig(envValue: string | undefined): ApiEndpointConfig[] {
  if (!envValue || envValue.trim() === "") {
    return [];
  }

  const trimmed = envValue.trim();

  // Try JSON format first
  if (trimmed.startsWith("[")) {
    return parseJsonFormat(trimmed);
  }

  // Check if it's CSV (contains comma but not in a JSON context)
  if (trimmed.includes(",") && !trimmed.includes("{")) {
    return parseCsvFormat(trimmed);
  }

  // Single URL
  return parseSingleUrl(trimmed);
}

/**
 * Parse JSON array format
 */
function parseJsonFormat(json: string): ApiEndpointConfig[] {
  try {
    const parsed = JSON.parse(json);

    if (!Array.isArray(parsed)) {
      throw new Error("API_EXPLORER_ENDPOINTS JSON must be an array");
    }

    return parsed.map((item, index) => {
      if (typeof item === "string") {
        // Simple string in array
        return {
          alias: `api-${index + 1}`,
          url: validateUrl(item),
        };
      }

      if (typeof item !== "object" || item === null) {
        throw new Error(`Invalid endpoint config at index ${index}`);
      }

      const config: ApiEndpointConfig = {
        alias: item.alias || `api-${index + 1}`,
        url: validateUrl(item.url),
      };

      // Optional fields
      if (item.framework) config.framework = item.framework;
      if (item.openApiLibrary) config.openApiLibrary = item.openApiLibrary;
      if (item.type) config.type = item.type;
      if (item.headers) config.headers = item.headers;
      if (item.timeout) config.timeout = Number(item.timeout);

      return config;
    });
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in API_EXPLORER_ENDPOINTS: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Parse CSV format (comma-separated URLs)
 */
function parseCsvFormat(csv: string): ApiEndpointConfig[] {
  const urls = csv.split(",").map((u) => u.trim()).filter(Boolean);

  return urls.map((url, index) => ({
    alias: `api-${index + 1}`,
    url: validateUrl(url),
  }));
}

/**
 * Parse single URL
 */
function parseSingleUrl(url: string): ApiEndpointConfig[] {
  return [
    {
      alias: "default",
      url: validateUrl(url),
    },
  ];
}

/**
 * Validate URL format
 */
function validateUrl(url: string): string {
  if (!url || typeof url !== "string") {
    throw new Error("URL is required");
  }

  const trimmed = url.trim();

  // Check for valid protocol
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    throw new Error(`Invalid URL protocol: ${trimmed}. Must start with http:// or https://`);
  }

  try {
    new URL(trimmed);
    return trimmed;
  } catch {
    throw new Error(`Invalid URL format: ${trimmed}`);
  }
}

/**
 * Get endpoint by alias
 */
export function getEndpointByAlias(
  endpoints: ApiEndpointConfig[],
  alias: string | undefined
): ApiEndpointConfig | ApiEndpointConfig[] {
  if (!alias) {
    return endpoints;
  }

  const found = endpoints.find((e) => e.alias === alias);
  if (!found) {
    const available = endpoints.map((e) => e.alias);
    throw new Error(
      `Alias "${alias}" not found. Available aliases: ${available.join(", ")}`
    );
  }

  return found;
}

/**
 * Get all available aliases
 */
export function getAvailableAliases(endpoints: ApiEndpointConfig[]): string[] {
  return endpoints.map((e) => e.alias);
}

/**
 * Configuration defaults
 */
export const CONFIG_DEFAULTS = {
  CACHE_TTL: 300,        // 5 minutes
  TIMEOUT: 30000,        // 30 seconds
  RETRY_COUNT: 2,
  MAX_DEPTH: 3,          // For detection
} as const;

/**
 * Get config value from environment with default
 */
export function getEnvConfig<T extends string | number>(
  key: string,
  defaultValue: T
): T {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }

  if (typeof defaultValue === "number") {
    const parsed = parseInt(value, 10);
    return (isNaN(parsed) ? defaultValue : parsed) as T;
  }

  return value as T;
}
