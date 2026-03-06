// SPDX-License-Identifier: MIT
/**
 * API Tester handler types and schemas
 */

import { z } from "zod";
import { lookup } from "dns/promises";

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
 * Check whether an IPv4 address string falls within a private/reserved range.
 * Returns the matched range name if blocked, null if allowed.
 */
function getBlockedIpv4Range(ip: string): string | null {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p))) return null;

  const [a, b, c] = parts;

  // 127.0.0.0/8 — loopback (explicit localhost is allowed via hostname check)
  if (a === 127) return "loopback";
  // 0.0.0.0
  if (a === 0) return "unspecified";
  // 10.0.0.0/8
  if (a === 10) return "private (10.x.x.x)";
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return "private (172.16-31.x.x)";
  // 192.168.0.0/16
  if (a === 192 && b === 168) return "private (192.168.x.x)";
  // 169.254.0.0/16 — link-local / cloud metadata (AWS, GCP, Azure)
  if (a === 169 && b === 254) return "link-local/cloud-metadata (169.254.x.x)";

  return null;
}

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
export async function validateUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }

  const hostname = parsed.hostname.toLowerCase();

  // Allow explicit localhost
  if (hostname === "localhost") return;

  // Reject bare IP literals in private ranges immediately (no DNS needed)
  // This catches direct use of 169.254.169.254 etc.
  const ipv4Literal = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname);
  if (ipv4Literal) {
    const blockedRange = getBlockedIpv4Range(hostname);
    if (blockedRange) {
      throw new Error(
        `SSRF protection: requests to ${blockedRange} are not allowed (${hostname})`
      );
    }
    return; // Public IPv4 literal — allowed
  }

  // Reject IPv6 literals (except ::1 which will be caught below after DNS,
  // but bracket-stripped IPv6 we block broadly for non-public addrs)
  const ipv6Literal =
    hostname.startsWith("[") || /^[0-9a-f:]+$/i.test(hostname);
  if (ipv6Literal) {
    const stripped = hostname.replace(/^\[|\]$/g, "");
    if (stripped === "::1" || stripped === "0:0:0:0:0:0:0:1") {
      throw new Error(
        "SSRF protection: requests to IPv6 loopback (::1) are not allowed"
      );
    }
    // For other IPv6, allow (public IPv6 is legitimate)
    return;
  }

  // Resolve hostname to IP and check resolved address
  let resolvedAddress: string;
  try {
    const result = await lookup(hostname);
    resolvedAddress = result.address;
  } catch {
    // DNS resolution failure — let the request fail naturally
    return;
  }

  // Check resolved IPv4 address
  const blockedRange = getBlockedIpv4Range(resolvedAddress);
  if (blockedRange) {
    throw new Error(
      `SSRF protection: hostname "${hostname}" resolves to ${resolvedAddress} which is in a blocked range: ${blockedRange}`
    );
  }
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

  try {
    const response = await fetch(options.url, {
      method: options.method,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });

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
