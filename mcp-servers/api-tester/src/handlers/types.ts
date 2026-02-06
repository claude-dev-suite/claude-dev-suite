// SPDX-License-Identifier: MIT
/**
 * API Tester handler types and schemas
 */

import { z } from "zod";

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
