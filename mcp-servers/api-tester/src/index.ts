// SPDX-License-Identifier: MIT
/**
 * API Tester MCP Server
 *
 * Provides HTTP testing, benchmarking, and API import/export capabilities.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { handlers, errorResponse } from "./handlers/index.js";

const server = new Server(
  {
    name: "api-tester-server",
    version: "2.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "http_request",
      description:
        "Make an HTTP request to test an API endpoint. Returns status, headers, body, and timing.",
      inputSchema: {
        type: "object",
        properties: {
          method: {
            type: "string",
            enum: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
            description: "HTTP method",
          },
          url: {
            type: "string",
            description: "Full URL to request",
          },
          headers: {
            type: "object",
            additionalProperties: { type: "string" },
            description: "Request headers",
          },
          body: {
            description: "Request body (for POST, PUT, PATCH)",
          },
          timeout: {
            type: "number",
            description: "Timeout in milliseconds",
            default: 30000,
          },
        },
        required: ["method", "url"],
      },
    },
    {
      name: "health_check",
      description: "Check the health of an API by testing common health endpoints",
      inputSchema: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "Base URL to check",
          },
          endpoints: {
            type: "array",
            items: { type: "string" },
            description: "Specific endpoints to check (defaults to common health endpoints)",
          },
        },
        required: ["url"],
      },
    },
    {
      name: "batch_request",
      description: "Execute multiple API requests in parallel or sequentially",
      inputSchema: {
        type: "object",
        properties: {
          requests: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Request name" },
                method: {
                  type: "string",
                  enum: ["GET", "POST", "PUT", "PATCH", "DELETE"],
                },
                url: { type: "string" },
                headers: { type: "object", additionalProperties: { type: "string" } },
                body: {},
              },
              required: ["name", "method", "url"],
            },
            description: "Array of requests to execute",
          },
          sequential: {
            type: "boolean",
            description: "Execute requests sequentially instead of in parallel",
            default: false,
          },
        },
        required: ["requests"],
      },
    },
    {
      name: "import_collection",
      description: "Import a Postman or Insomnia collection file and convert to batch requests. Auto-detects format if not specified.",
      inputSchema: {
        type: "object",
        properties: {
          filePath: {
            type: "string",
            description: "Path to the collection JSON file (Postman v2.1 or Insomnia export)",
          },
          format: {
            type: "string",
            enum: ["postman", "insomnia"],
            description: "Collection format. Auto-detected from file content if omitted.",
          },
          variables: {
            type: "object",
            additionalProperties: { type: "string" },
            description: "Override collection/environment variables",
          },
        },
        required: ["filePath"],
      },
    },
    {
      name: "generate_tests",
      description: "Generate test cases from an OpenAPI/Swagger specification",
      inputSchema: {
        type: "object",
        properties: {
          specPath: {
            type: "string",
            description: "Path to OpenAPI spec file (JSON or YAML)",
          },
          baseUrl: {
            type: "string",
            description: "Override base URL for tests",
          },
          outputFormat: {
            type: "string",
            enum: ["json", "vitest", "jest", "curl", "httpie"],
            description: "Output format for generated tests",
            default: "json",
          },
          filterTags: {
            type: "array",
            items: { type: "string" },
            description: "Filter endpoints by OpenAPI tags",
          },
          includeNegativeTests: {
            type: "boolean",
            description: "Include negative test cases",
            default: true,
          },
        },
        required: ["specPath"],
      },
    },
    {
      name: "mock_server",
      description: "Start, stop, or list mock servers based on OpenAPI specs",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["start", "stop", "list"],
            description: "Action to perform",
          },
          specPath: {
            type: "string",
            description: "Path to OpenAPI spec (required for start)",
          },
          port: {
            type: "number",
            description: "Port to run server on (for start action)",
          },
          delay: {
            type: "number",
            description: "Response delay in ms (for start action)",
          },
        },
        required: ["action"],
      },
    },
  ],
}));

// Handle tool calls using handlers registry
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const handler = handlers[name];
  if (!handler) {
    return errorResponse(`Unknown tool: ${name}`);
  }

  try {
    return await handler(args);
  } catch (error) {
    return errorResponse(error instanceof Error ? error.message : "Unknown error");
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("API Tester MCP Server running on stdio");
}

main().catch(console.error);
