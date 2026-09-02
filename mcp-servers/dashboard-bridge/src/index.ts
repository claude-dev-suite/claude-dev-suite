#!/usr/bin/env node
// SPDX-License-Identifier: MIT

/**
 * Dashboard Bridge MCP Server
 *
 * Provides integration between Claude Code and the dev-suite dashboard.
 * Includes orchestrator support for task queue management.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { handlers } from "./handlers/index.js";
import { startWebSocketServer } from "./ws-server.js";

// ============================================================================
// MCP SERVER
// ============================================================================

const server = new Server(
  {
    name: "dashboard-bridge",
    version: "2.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Tool definitions
const tools = [
  // Dashboard tools
  {
    name: "dashboard_open",
    description: "Open the dev-suite dashboard in default browser. Pages: wizard, agents, mcp, knowledge, settings.",
    inputSchema: {
      type: "object" as const,
      properties: {
        page: {
          type: "string",
          enum: ["home", "wizard", "agents", "mcp", "knowledge", "settings", "projects"],
          description: "Dashboard page to open (default: home)",
        },
        projectPath: {
          type: "string",
          description: "Optional project path to pass to the wizard",
        },
      },
    },
  },
  {
    name: "dashboard_status",
    description: "Check if the dev-suite dashboard is running and accessible",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "dashboard_start",
    description: "Start the dev-suite dashboard server if not already running",
    inputSchema: {
      type: "object" as const,
      properties: {
        devSuiteDir: {
          type: "string",
          description: "Path to dev-suite directory (auto-detected if not provided)",
        },
      },
    },
  },
  {
    name: "dashboard_get_config",
    description: "Read the dev-suite configuration from a project directory",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectPath: {
          type: "string",
          description: "Path to the project directory",
        },
      },
      required: ["projectPath"],
    },
  },
  {
    name: "dashboard_list_agents",
    description: "List all available agents from dev-suite",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "dashboard_detect_stack",
    description: "Detect the technology stack of a project",
    inputSchema: {
      type: "object" as const,
      properties: {
        projectPath: {
          type: "string",
          description: "Path to the project directory",
        },
      },
      required: ["projectPath"],
    },
  },

  // Orchestrator tools
  {
    name: "get_orchestrator_task",
    description: "Get next pending orchestrator task from the dashboard queue (call to receive GUI-submitted tasks).",
    inputSchema: {
      type: "object" as const,
      properties: {
        claim: {
          type: "boolean",
          description: "If true (default), marks the task as claimed by this Claude instance",
        },
      },
    },
  },
  {
    name: "report_orchestrator_status",
    description: "Report progress or completion of an orchestrator task. Call this to update the dashboard with execution status.",
    inputSchema: {
      type: "object" as const,
      properties: {
        jobId: {
          type: "string",
          description: "The job ID being reported on",
        },
        status: {
          type: "string",
          enum: ["progress", "completed", "failed"],
          description: "Current status of the task",
        },
        currentAgent: {
          type: "string",
          description: "Agent currently executing (for progress updates)",
        },
        message: {
          type: "string",
          description: "Progress message or status description",
        },
        summary: {
          type: "string",
          description: "Final summary (for completed/failed status)",
        },
        recap: {
          type: "object",
          description: "Full recap data for job completion (agentResults, files, tests, build, notes)",
        },
      },
      required: ["jobId", "status"],
    },
  },
  {
    name: "list_pending_jobs",
    description: "List all pending orchestrator jobs in the queue",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
];

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Handle tool calls using handlers registry
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const handler = handlers[name];
  if (!handler) {
    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }

  try {
    return await handler(args);
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true,
    };
  }
});

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  // Start WebSocket server for dashboard communication
  startWebSocketServer();

  // Start MCP server for Claude Code
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Dashboard Bridge MCP server v2.0 running with orchestrator support");
}

main().catch(console.error);
