// SPDX-License-Identifier: MIT
/**
 * Shared types and context for documentation handlers
 */

import { z } from "zod";
import type { KBCache } from "../kb-cache.js";
import type { KBFetcher } from "../kb-fetcher.js";
import type { VersionResolver } from "../version-resolver.js";
import { SUPPORTED_TECHNOLOGIES } from "../docs-index.js";

/**
 * Handler context shared across all tool handlers
 */
export interface HandlerContext {
  kbMode: "git" | "live_only";
  kbCache: KBCache | null;
  kbFetcher: KBFetcher | null;
  versionResolver: VersionResolver | null;
  config: {
    cachePath: string;
    ttl: number;
  };
}

/**
 * Standard handler result compatible with MCP SDK
 */
export interface HandlerResult {
  [key: string]: unknown;
  content: Array<{
    type: "text";
    text: string;
  }>;
  isError?: boolean;
}

/**
 * Handler function signature
 */
export type Handler = (args: unknown, ctx: HandlerContext) => Promise<HandlerResult>;

// ============ Input Schemas ============

export const FetchDocsSchema = z.object({
  technology: z.enum([...SUPPORTED_TECHNOLOGIES] as [string, ...string[]]),
  topic: z.string().describe("Topic like 'caching', 'hooks', 'schema'"),
  version: z.string().optional().describe("Technology version (e.g., '18' for React 18). Defaults to latest."),
  source: z.enum(["local", "live"]).default("local"),
  refresh: z.boolean().optional().describe("Force cache refresh (on-demand KB only)"),
  format: z.enum(["full", "summary", "excerpt"]).optional().default("full").describe(
    "Output format: 'full' returns entire content, 'summary' returns first 500 chars, 'excerpt' returns first 200 chars"
  ),
  maxTokens: z.number().min(100).max(50000).optional().describe(
    "Max tokens to return (1 token ≈ 4 chars). Truncates output if exceeded."
  ),
  sections: z.array(z.string()).optional().describe(
    "Extract only specific sections (markdown headers). E.g., ['Installation', 'Usage']"
  ),
});

export const ListVersionsSchema = z.object({
  technology: z.enum([...SUPPORTED_TECHNOLOGIES] as [string, ...string[]]),
});

export const SearchDocsSchema = z.object({
  query: z.string().describe("Search query"),
  technologies: z.array(z.string()).optional(),
  maxResults: z.number().default(5),
});

export const ListTopicsSchema = z.object({
  technology: z.enum([...SUPPORTED_TECHNOLOGIES] as [string, ...string[]]),
});

export const CATEGORIES = [
  "frontend", "meta-frameworks", "backend", "databases", "testing",
  "infrastructure", "languages", "api", "auth", "desktop", "tooling",
  "standards", "observability", "architecture", "ai", "security", "ux",
  "rag", "retrieval", "embeddings", "vector-stores",
  "document-processing", "rag-frameworks", "rag-ops",
] as const;

export const ListDocsSchema = z.object({
  category: z.enum([...CATEGORIES] as [string, ...string[]])
    .optional()
    .describe("Filter by category (e.g., 'rag', 'frontend'). Omit for full catalog."),
});

// ============ Helper Functions ============

/**
 * Create a standard JSON response
 */
export function jsonResponse(data: unknown): HandlerResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data),
      },
    ],
  };
}

/**
 * Create an error response
 */
export function errorResponse(message: string): HandlerResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ error: message }),
      },
    ],
    isError: true,
  };
}
