// SPDX-License-Identifier: MIT
/**
 * API Tester handler types and schemas
 */

import { z } from "zod";
import { lookup } from "dns/promises";
import { validateUrl as validateUrlShared } from '@dev-suite/shared';

// ============================================================================
// HANDLER TYPES
// ============================================================================

export interface HandlerResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export type Handler = (args: unknown) => Promise<HandlerResult>;

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

export const HttpRequestSchema = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]),
  url: z.string().url().describe("Full URL to request"),
  headers: z.record(z.string()).optional().describe("Request headers"),
  body: z.unknown().optional().describe("Request body (for POST, PUT, PATCH)"),
  timeout: z.number().optional().default(30000).describe("Timeout in milliseconds"),
});

export const HealthCheckSchema = z.object({
  url: z.string().url().describe("Base URL to check"),
  endpoints: z.array(z.string()).optional().describe("Specific endpoints to check"),
});

export const BatchRequestSchema = z.object({
  requests: z.array(
    z.object({
      name: z.string().describe("Request name for identification"),
      method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
      url: z.string().url(),
      headers: z.record(z.string()).optional(),
      body: z.unknown().optional(),
    })
  ),
  sequential: z.boolean().optional().default(false),
});

export const ImportCollectionSchema = z.object({
  filePath: z.string(),
  format: z.enum(["postman", "insomnia"]).optional().describe("Collection format. Auto-detected if omitted."),
  variables: z.record(z.string()).optional(),
});

export const GenerateTestsSchema = z.object({
  specPath: z.string(),
  baseUrl: z.string().optional(),
  outputFormat: z.enum(["json", "vitest", "jest", "curl", "httpie"]).optional().default("json"),
  filterTags: z.array(z.string()).optional(),
  includeNegativeTests: z.boolean().optional().default(true),
});

export const MockServerSchema = z.object({
  action: z.enum(["start", "stop", "list"]),
  specPath: z.string().optional(),
  port: z.number().optional(),
  delay: z.number().optional(),
});

// ============================================================================
// HELPERS
// ============================================================================

export function jsonResponse(data: object): HandlerResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data) }],
  };
}

export function errorResponse(message: string): HandlerResult {
  return {
    content: [{ type: "text", text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}

// ============================================================================
// URL VALIDATION (SSRF prevention)
// ============================================================================


/**
 * Validate a URL against SSRF risks.
 *
 * Policy:
 *  - Explicit "localhost" hostname is ALLOWED (tool is designed for local API testing).
 *  - 169.254.0.0/16 (cloud metadata endpoints) is ALWAYS blocked.
 *  - Other private/loopback ranges are blocked to prevent internal network scanning.
 *  - IPv6 loopback (::1) resolved addresses are blocked except for explicit "localhost" hostname.
 *
 * Throws an Error if the URL is blocked.
 */
/**
 * Validate a URL for SSRF risks before making an HTTP request.
 *
 * Delegates to the shared guard. The local implementation this replaces let
 * every non-loopback IPv6 address through — `fd00::/7` unique-local and
 * `fe80::/10` link-local included — and never decoded decimal/hex/octal IPv4
 * literals, so `http://2852039166/` reached the cloud-metadata endpoint. The
 * shared guard handles both.
 */
export async function validateUrl(rawUrl: string): Promise<void> {
  return validateUrlShared(rawUrl);
}

// ============================================================================
// HTTP REQUEST HELPER
// ============================================================================

export async function makeRequest(options: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
}): Promise<{
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: unknown;
  timing: number;
}> {
  const startTime = Date.now();

  // SSRF protection: validate URL before making the request
  await validateUrl(options.url);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), options.timeout || 30000);

  // Redirects are NOT followed automatically. `fetch` defaults to
  // redirect:"follow", so validating only the initial URL left the whole SSRF
  // guard bypassable: a public URL answering 302 with
  // `Location: http://169.254.169.254/...` was fetched without any further
  // check. Each hop is re-validated instead — the same policy
  // performance-profiler/src/utils/http-client.ts already applies.
  const MAX_REDIRECTS = 5;

  try {
    let currentUrl = options.url;
    let response!: Response;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      response = await fetch(currentUrl, {
        method: options.method,
        headers: {
          "Content-Type": "application/json",
          ...options.headers,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
        redirect: "manual",
      });

      const isRedirect = [301, 302, 303, 307, 308].includes(response.status);
      if (!isRedirect) break;

      const location = response.headers.get("location");
      if (!location) break;

      if (hop === MAX_REDIRECTS) {
        throw new Error(`Too many redirects (max ${MAX_REDIRECTS})`);
      }

      // Resolve relative Locations against the current URL before validating.
      const next = new URL(location, currentUrl).toString();
      await validateUrl(next);
      currentUrl = next;
    }

    clearTimeout(timeoutId);

    const timing = Date.now() - startTime;

    // Parse response body
    let body: unknown;
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      body = await response.json();
    } else {
      body = await response.text();
    }

    // Convert headers to object
    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    return {
      status: response.status,
      statusText: response.statusText,
      headers,
      body,
      timing,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}
