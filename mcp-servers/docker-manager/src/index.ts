// SPDX-License-Identifier: MIT
/**
 * Docker Manager MCP Server
 *
 * Provides Docker and Docker Compose management capabilities.
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
    name: "docker-manager-server",
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
      name: "docker_ps",
      description: "List running Docker containers with their status",
      inputSchema: {
        type: "object",
        properties: {
          all: {
            type: "boolean",
            description: "Show all containers (including stopped)",
            default: false,
          },
        },
      },
    },
    {
      name: "docker_container",
      description: "Manage a Docker container (start, stop, restart, logs, inspect)",
      inputSchema: {
        type: "object",
        properties: {
          container: {
            type: "string",
            description: "Container name or ID",
          },
          action: {
            type: "string",
            enum: ["start", "stop", "restart", "logs", "inspect"],
            description: "Action to perform",
          },
          tail: {
            type: "number",
            description: "Number of log lines (for logs action)",
            default: 100,
          },
        },
        required: ["container", "action"],
      },
    },
    {
      name: "docker_compose",
      description: "Run Docker Compose commands (up, down, ps, logs, build, restart)",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["up", "down", "ps", "logs", "build", "restart"],
            description: "Compose action to perform",
          },
          service: {
            type: "string",
            description: "Specific service name (optional)",
          },
          detach: {
            type: "boolean",
            description: "Run in detached mode (for up)",
            default: true,
          },
          build: {
            type: "boolean",
            description: "Build images before starting (for up)",
          },
        },
        required: ["action"],
      },
    },
    {
      name: "docker_images",
      description: "Manage Docker images (list, pull, remove, inspect)",
      inputSchema: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["list", "pull", "remove", "inspect"],
            description: "Image action to perform",
          },
          image: {
            type: "string",
            description: "Image name (required for pull/remove/inspect)",
          },
        },
        required: ["action"],
      },
    },
    {
      name: "docker_stats",
      description: "Show resource usage statistics for containers",
      inputSchema: {
        type: "object",
        properties: {
          container: {
            type: "string",
            description: "Specific container (optional, shows all if omitted)",
          },
        },
      },
    },
    {
      name: "docker_networks",
      description: "List Docker networks",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "docker_volumes",
      description: "List Docker volumes",
      inputSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: "cleanup_unused",
      description: "Remove unused Docker resources (images, containers, volumes, networks)",
      inputSchema: {
        type: "object",
        properties: {
          target: {
            type: "string",
            enum: ["all", "images", "containers", "volumes", "networks"],
            description: "What to clean up (default: all)",
          },
          force: {
            type: "boolean",
            description: "Skip confirmation prompts",
            default: true,
          },
          dryRun: {
            type: "boolean",
            description: "Show what would be removed without actually removing",
            default: false,
          },
        },
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
  console.error("Docker Manager MCP Server running on stdio");
}

main().catch(console.error);
