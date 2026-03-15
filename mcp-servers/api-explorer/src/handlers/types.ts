// SPDX-License-Identifier: MIT
/**
 * API Explorer handler types and schemas
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

export const AliasSchema = z.string().optional().describe(
  "Alias of the API endpoint (e.g., 'users-service'). If omitted, returns results from all configured endpoints as separate array items."
);

export const ListEndpointsSchema = z.object({});

export const GetSchemaSchema = z.object({
  alias: AliasSchema,
  format: z.enum(["full", "summary"]).optional().default("full").describe(
    "Output format: 'full' returns complete spec, 'summary' returns info and stats only"
  ),
  refresh: z.boolean().optional().default(false).describe(
    "Force refresh from server, bypassing cache"
  ),
});

export const ListPathsSchema = z.object({
  alias: AliasSchema,
  tag: z.string().optional().describe("Filter by tag name"),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]).optional().describe(
    "Filter by HTTP method"
  ),
  includeDeprecated: z.boolean().optional().default(true).describe(
    "Include deprecated endpoints"
  ),
  limit: z.number().min(1).max(500).optional().default(100).describe(
    "Max paths to return (default: 100, max: 500)"
  ),
});

export const GetEndpointDetailsSchema = z.object({
  alias: AliasSchema,
  path: z.string().describe("API path (e.g., '/users/{id}')"),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"]).describe(
    "HTTP method"
  ),
  resolveRefs: z.boolean().optional().default(true).describe(
    "Resolve $ref pointers in schemas"
  ),
});

export const GetModelsSchema = z.object({
  alias: AliasSchema,
  model: z.string().optional().describe(
    "Specific model name to retrieve. If omitted, returns all models."
  ),
  resolveRefs: z.boolean().optional().default(false).describe(
    "Resolve $ref pointers in schemas"
  ),
  limit: z.number().min(1).max(500).optional().default(100).describe(
    "Max models to return (default: 100, max: 500)"
  ),
  compact: z.boolean().optional().default(false).describe(
    "Return compact output (only model names and property names, no full schemas)"
  ),
});

export const SearchApiSchema = z.object({
  query: z.string().describe("Search query"),
  alias: AliasSchema,
  searchIn: z.array(z.enum(["paths", "models", "tags", "descriptions"])).optional().default(
    ["paths", "models", "tags", "descriptions"]
  ).describe("Where to search"),
  limit: z.number().optional().default(20).describe("Maximum results to return"),
});

export const DetectFrameworksSchema = z.object({
  path: z.string().optional().describe(
    "Path to scan for API frameworks. Defaults to current working directory."
  ),
  maxDepth: z.number().optional().default(3).describe(
    "Maximum directory depth to scan"
  ),
  includeConfidence: z.enum(["all", "high", "medium"]).optional().default("all").describe(
    "Filter by detection confidence level"
  ),
});

// ============================================================================
// HELPERS
// ============================================================================

export function jsonResponse(data: object): HandlerResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

export function errorResponse(message: string, hint?: string, availableAliases?: string[]): HandlerResult {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        error: message,
        ...(hint && { hint }),
        ...(availableAliases && availableAliases.length > 0 && { availableAliases }),
      }, null, 2),
    }],
    isError: true,
  };
}
