// SPDX-License-Identifier: MIT
/**
 * API Explorer MCP Server
 *
 * Fetches and explores OpenAPI/Swagger schemas from multiple API endpoints.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { parseEndpointsConfig, getAvailableAliases } from "./config.js";
import { handlers, setEndpoints, getEndpoints, errorResponse } from "./handlers/index.js";

// ============================================
// Configuration
// ============================================

const API_EXPLORER_ENDPOINTS = process.env.API_EXPLORER_ENDPOINTS;

try {
  const endpoints = parseEndpointsConfig(API_EXPLORER_ENDPOINTS);
  setEndpoints(endpoints);
} catch (error) {
  console.error("Error parsing API_EXPLORER_ENDPOINTS:", error);
}

// ============================================
// Server Setup
// ============================================

const server = new Server(
  { name: "api-explorer", version: "2.2.0" },
  { capabilities: { tools: {} } }
);

// ============================================
// Tool Definitions
// ============================================

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_api_endpoints",
      description:
        "List all configured API endpoints with their aliases, URLs, and detected frameworks",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "get_api_schema",
      description:
        "Fetch the complete OpenAPI/Swagger schema from an API endpoint. Returns full spec or summary.",
      inputSchema: {
        type: "object",
        properties: {
          alias: {
            type: "string",
            description:
              "Alias of the API endpoint. If omitted, returns schemas from all endpoints.",
          },
          format: {
            type: "string",
            enum: ["full", "summary"],
            default: "full",
            description: "Output format",
          },
          refresh: {
            type: "boolean",
            default: false,
            description: "Force refresh from server",
          },
        },
      },
    },
    {
      name: "list_api_paths",
      description:
        "List API paths/routes from an OpenAPI spec with optional filtering. Results limited by default (100).",
      inputSchema: {
        type: "object",
        properties: {
          alias: {
            type: "string",
            description: "Alias of the API endpoint",
          },
          tag: {
            type: "string",
            description: "Filter by tag name",
          },
          method: {
            type: "string",
            enum: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
            description: "Filter by HTTP method",
          },
          includeDeprecated: {
            type: "boolean",
            default: true,
            description: "Include deprecated endpoints",
          },
          limit: {
            type: "number",
            default: 100,
            description: "Max paths to return (default: 100, max: 500)",
          },
        },
      },
    },
    {
      name: "get_api_endpoint_details",
      description:
        "Get detailed information about a specific API endpoint including parameters, request body, and responses",
      inputSchema: {
        type: "object",
        properties: {
          alias: {
            type: "string",
            description: "Alias of the API endpoint",
          },
          path: {
            type: "string",
            description: "API path (e.g., '/users/{id}')",
          },
          method: {
            type: "string",
            enum: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
            description: "HTTP method",
          },
          resolveRefs: {
            type: "boolean",
            default: true,
            description: "Resolve $ref pointers",
          },
        },
        required: ["path", "method"],
      },
    },
    {
      name: "get_api_models",
      description:
        "Get schema models/DTOs from an OpenAPI spec. Use compact=true for minimal output. Results limited by default (100).",
      inputSchema: {
        type: "object",
        properties: {
          alias: {
            type: "string",
            description: "Alias of the API endpoint",
          },
          model: {
            type: "string",
            description: "Specific model name to retrieve",
          },
          resolveRefs: {
            type: "boolean",
            default: false,
            description: "Resolve $ref pointers in schemas",
          },
          limit: {
            type: "number",
            default: 100,
            description: "Max models to return (default: 100, max: 500)",
          },
          compact: {
            type: "boolean",
            default: false,
            description: "Return only model names and property names, no full schemas",
          },
        },
      },
    },
    {
      name: "search_api",
      description:
        "Search across API specs for paths, models, tags, or descriptions matching a query",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query",
          },
          alias: {
            type: "string",
            description: "Alias of the API endpoint (searches all if omitted)",
          },
          searchIn: {
            type: "array",
            items: {
              type: "string",
              enum: ["paths", "models", "tags", "descriptions"],
            },
            default: ["paths", "models", "tags", "descriptions"],
            description: "Where to search",
          },
          limit: {
            type: "number",
            default: 20,
            description: "Maximum results",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "detect_api_frameworks",
      description:
        "Scan a directory to detect API frameworks and their OpenAPI endpoints, including across a monorepo.",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Path to scan (defaults to cwd)",
          },
          maxDepth: {
            type: "number",
            default: 3,
            description: "Max directory depth",
          },
          includeConfidence: {
            type: "string",
            enum: ["all", "high", "medium"],
            default: "all",
            description: "Filter by confidence level",
          },
        },
      },
    },
  ],
}));

// ============================================
// Tool Handler Dispatch
// ============================================

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const endpoints = getEndpoints();

  const handler = handlers[name];
  if (!handler) {
    return errorResponse(`Unknown tool: ${name}`);
  }

  try {
    return await handler(args);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const availableAliases = getAvailableAliases(endpoints);

    return errorResponse(
      errorMessage,
      endpoints.length === 0
        ? "No API endpoints configured. Set API_EXPLORER_ENDPOINTS environment variable."
        : `Available aliases: ${availableAliases.join(", ")}`,
      availableAliases.length > 0 ? availableAliases : undefined
    );
  }
});

// ============================================
// Server Startup
// ============================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  const endpoints = getEndpoints();
  console.error("API Explorer MCP server running on stdio");
  console.error(`Configured endpoints: ${endpoints.length}`);
  if (endpoints.length > 0) {
    console.error(`Aliases: ${getAvailableAliases(endpoints).join(", ")}`);
  }
}

main().catch(console.error);
