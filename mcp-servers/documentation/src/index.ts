// SPDX-License-Identifier: MIT
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import path from "path";
import { fileURLToPath } from "url";
import { KBCache } from "./kb-cache.js";
import { KBFetcher } from "./kb-fetcher.js";
import { VersionResolver } from "./version-resolver.js";
import { SUPPORTED_TECHNOLOGIES } from "./docs-index.js";
import { handlers, type HandlerContext } from "./handlers/index.js";
import { analyticsLogger } from "./analytics-logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration from environment variables
const DEFAULT_KB_REPO = "https://github.com/claude-dev-suite/knowledge_base.git";
const KB_REPO_URL = process.env.KB_REPO_URL || DEFAULT_KB_REPO;
const KB_REPO_BRANCH = process.env.KB_REPO_BRANCH || "main";
const KB_CACHE_PATH = process.env.KB_CACHE_PATH || path.join(process.cwd(), ".kb-cache");
const KB_CACHE_TTL = parseInt(process.env.KB_CACHE_TTL || "7200", 10); // 2 hours default

// Initialize on-demand KB fetcher (Git-based, no bundled fallback)
let kbCache: KBCache | null = null;
let kbFetcher: KBFetcher | null = null;
let versionResolver: VersionResolver | null = null;
let kbMode: "git" | "live_only" = "git";

console.error("[KB] Initializing Git-based knowledge base");
console.error(`[KB] Repo: ${KB_REPO_URL}`);
console.error(`[KB] Cache: ${KB_CACHE_PATH}`);
console.error(`[KB] TTL: ${KB_CACHE_TTL}s`);

kbCache = new KBCache({
  cachePath: KB_CACHE_PATH,
  ttl: KB_CACHE_TTL,
});

kbFetcher = new KBFetcher({
  repoUrl: KB_REPO_URL,
  branch: KB_REPO_BRANCH,
  cache: kbCache,
});

// Initialize cache directory
await kbCache.init();

// Initialize analytics logger
await analyticsLogger.init();

// Check Git availability
const availability = await kbFetcher.checkAvailability();
if (!availability.available) {
  console.error(`[KB] Warning: Git KB not available: ${availability.error}`);
  console.error(`[KB] Falling back to live docs only (no caching)`);
  kbMode = "live_only";
  kbCache = null;
  kbFetcher = null;
} else {
  // Initialize version resolver for Git mode
  versionResolver = new VersionResolver(kbFetcher, kbCache);
  console.error("[KB] Version resolver initialized");
}

// Create handler context
const handlerContext: HandlerContext = {
  kbMode,
  kbCache,
  kbFetcher,
  versionResolver,
  config: {
    cachePath: KB_CACHE_PATH,
    ttl: KB_CACHE_TTL,
  },
};

const server = new Server(
  {
    name: "documentation-server",
    version: "2.4.0", // list_docs tool + CATEGORY_MAP
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const tools: any[] = [
    {
      name: "fetch_docs",
      description:
        "Fetch docs for a technology and topic. Supports versioning (e.g. React 18 vs 19); defaults to the latest.",
      inputSchema: {
        type: "object",
        properties: {
          technology: {
            type: "string",
            enum: SUPPORTED_TECHNOLOGIES,
            description: "Technology name",
          },
          topic: {
            type: "string",
            description: "Topic like 'caching', 'hooks', 'schema'",
          },
          version: {
            type: "string",
            description: "Technology version (e.g., '18' for React 18). Defaults to latest.",
          },
          source: {
            type: "string",
            enum: ["local", "live"],
            default: "local",
            description: "Source: 'local' for cached, 'live' for fresh",
          },
          refresh: {
            type: "boolean",
            description: "Force cache refresh (on-demand KB only)",
          },
          format: {
            type: "string",
            enum: ["full", "summary", "excerpt"],
            default: "full",
            description: "Output format: 'full' (all), 'summary' (500 chars), 'excerpt' (200 chars)",
          },
          maxTokens: {
            type: "number",
            description: "Max tokens to return. Truncates if exceeded. (1 token ≈ 4 chars)",
          },
          sections: {
            type: "array",
            items: { type: "string" },
            description: "Extract only specific sections (markdown headers). E.g., ['Installation', 'Usage']",
          },
        },
        required: ["technology", "topic"],
      },
    },
    {
      name: "list_versions",
      description: "List supported versions for a technology",
      inputSchema: {
        type: "object",
        properties: {
          technology: {
            type: "string",
            enum: SUPPORTED_TECHNOLOGIES,
            description: "Technology name",
          },
        },
        required: ["technology"],
      },
    },
    {
      name: "search_docs",
      description: "Search across all documentation for a query",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query",
          },
          technologies: {
            type: "array",
            items: { type: "string" },
            description: "Filter to specific technologies",
          },
          maxResults: {
            type: "number",
            default: 5,
            description: "Maximum results to return",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "list_topics",
      description: "List available documentation topics for a technology",
      inputSchema: {
        type: "object",
        properties: {
          technology: {
            type: "string",
            enum: SUPPORTED_TECHNOLOGIES,
            description: "Technology name",
          },
        },
        required: ["technology"],
      },
    },
    {
      name: "list_docs",
      // audit-justification: the return shape and the discover-then-fetch order are what let the model call this correctly first time; trimming either costs more in retries than it saves.
      description:
        "List all available KB articles as a compact catalog. Returns { technology: [topics...] } mapping. Use to discover what documentation is available, then fetch specific articles with fetch_docs.",
      inputSchema: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: [
              "frontend", "meta-frameworks", "backend", "databases", "testing",
              "infrastructure", "languages", "api", "auth", "desktop", "tooling",
              "standards", "observability", "architecture", "ai", "security", "ux",
              "rag", "retrieval", "embeddings", "vector-stores",
              "document-processing", "rag-frameworks", "rag-ops",
            ],
            description: "Filter by category. Omit for full catalog.",
          },
        },
      },
    },
  ];

  return { tools };
});

// Handle tool calls using handler registry with analytics logging
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const startTime = Date.now();

  try {
    const handler = handlers[name];

    if (!handler) {
      throw new Error(`Unknown tool: ${name}`);
    }

    const result = await handler(args, handlerContext);

    // Log analytics for fetch_docs and search_docs
    if (name === "fetch_docs" || name === "search_docs" || name === "list_topics" || name === "list_versions" || name === "list_docs") {
      const durationMs = Date.now() - startTime;
      const input = (args || {}) as Record<string, unknown>;

      // Extract result info
      let source: "git_cache" | "live" | "error" = "git_cache";
      let tokensEstimate: number | undefined;
      let success = true;
      let errorMsg: string | undefined;

      try {
        if (result?.content?.[0]?.text) {
          const data = JSON.parse(result.content[0].text as string);
          if (data.error) {
            success = false;
            errorMsg = data.error;
            source = "error";
          } else if (data.source) {
            source = data.source;
          }
          if (data.tokens_estimate) {
            tokensEstimate = data.tokens_estimate;
          }
        }
      } catch {}

      analyticsLogger.log({
        tool: name as "fetch_docs" | "search_docs" | "list_topics" | "list_versions" | "list_docs",
        technology: (input.technology as string) || "unknown",
        topic: input.topic as string | undefined,
        query: input.query as string | undefined,
        version: input.version as string | undefined,
        source,
        success,
        durationMs,
        tokensEstimate,
        error: errorMsg,
      }).catch(console.error);
    }

    return result;
  } catch (error) {
    // Log error for analytics
    if (name === "fetch_docs" || name === "search_docs" || name === "list_topics" || name === "list_versions" || name === "list_docs") {
      const durationMs = Date.now() - startTime;
      const input = (args || {}) as Record<string, unknown>;

      analyticsLogger.log({
        tool: name as "fetch_docs" | "search_docs" | "list_topics" | "list_versions" | "list_docs",
        technology: (input.technology as string) || "unknown",
        topic: input.topic as string | undefined,
        query: input.query as string | undefined,
        version: input.version as string | undefined,
        source: "error",
        success: false,
        durationMs,
        error: error instanceof Error ? error.message : "Unknown error",
      }).catch(console.error);
    }

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: error instanceof Error ? error.message : "Unknown error",
          }),
        },
      ],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Documentation MCP Server v2.3.0 running (mode: ${kbMode})`);
}

main().catch(console.error);
