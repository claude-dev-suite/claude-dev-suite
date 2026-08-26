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
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import { randomUUID, timingSafeEqual } from "crypto";
import {
  handlers,
  ORCHESTRATOR_WS_PORT,
  jobQueue,
  connectedClients,
  type JobWithRecap,
  type OrchestratorJob,
} from "./handlers/index.js";

// ============================================================================
// WEBSOCKET SERVER
// ============================================================================

/**
 * Shared secret required to drive the orchestrator over the WebSocket.
 *
 * Read once at startup. When unset, a per-process token is generated and
 * printed to stderr: an operator can copy it, but nothing on the network can
 * guess it. Either way an unauthenticated peer can no longer queue jobs.
 */
const ORCHESTRATOR_WS_TOKEN =
  process.env.ORCHESTRATOR_WS_TOKEN && process.env.ORCHESTRATOR_WS_TOKEN.length > 0
    ? process.env.ORCHESTRATOR_WS_TOKEN
    : randomUUID();

/** Host to bind. Loopback only — this socket takes privileged commands. */
const ORCHESTRATOR_WS_HOST = process.env.ORCHESTRATOR_WS_HOST || "127.0.0.1";

/** Sockets that have completed the handshake. */
const authenticated = new WeakSet<WebSocket>();

/** Constant-time comparison, so a wrong token leaks nothing through timing. */
function tokenMatches(candidate: unknown): boolean {
  if (typeof candidate !== "string") return false;
  const a = Buffer.from(candidate, "utf8");
  const b = Buffer.from(ORCHESTRATOR_WS_TOKEN, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function startWebSocketServer() {
  const httpServer = createServer();
  const wss = new WebSocketServer({ server: httpServer });

  wss.on("connection", (ws) => {
    console.error("[Orchestrator] Dashboard connected — awaiting auth");
    connectedClients.add(ws);

    // A peer that does not authenticate promptly is dropped, so an unauthorised
    // connection cannot sit idle holding a slot.
    const authTimer = setTimeout(() => {
      if (!authenticated.has(ws)) {
        ws.send(JSON.stringify({ type: "error", payload: { message: "Auth timeout" } }));
        ws.close();
      }
    }, 5000);

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());

        // The socket accepts privileged commands — `submit_job` runs an agent
        // with a caller-supplied projectPath. It used to accept them from any
        // peer, on every interface. Nothing but `auth` is honoured until the
        // handshake succeeds.
        if (!authenticated.has(ws)) {
          if (message?.type === "auth" && tokenMatches(message?.token)) {
            authenticated.add(ws);
            clearTimeout(authTimer);
            ws.send(JSON.stringify({ type: "auth_ok" }));
          } else {
            ws.send(JSON.stringify({ type: "error", payload: { message: "Unauthorized" } }));
            ws.close();
          }
          return;
        }

        handleDashboardMessage(ws, message);
      } catch (error) {
        console.error("[Orchestrator] Invalid message:", error);
        ws.send(JSON.stringify({ type: "error", payload: { message: "Invalid JSON" } }));
      }
    });

    ws.on("close", () => {
      console.error("[Orchestrator] Dashboard disconnected");
      clearTimeout(authTimer);
      connectedClients.delete(ws);
    });

    ws.on("error", (error) => {
      console.error("[Orchestrator] WebSocket error:", error);
      clearTimeout(authTimer);
      connectedClients.delete(ws);
    });
  });

  // Bind loopback explicitly: `listen(port)` binds 0.0.0.0, which exposed an
  // unauthenticated job-submission endpoint to the whole network.
  httpServer.listen(ORCHESTRATOR_WS_PORT, ORCHESTRATOR_WS_HOST, () => {
    console.error(
      `[Orchestrator] WebSocket server listening on ${ORCHESTRATOR_WS_HOST}:${ORCHESTRATOR_WS_PORT}`
    );
    if (!process.env.ORCHESTRATOR_WS_TOKEN) {
      console.error(`[Orchestrator] Generated auth token: ${ORCHESTRATOR_WS_TOKEN}`);
    }
  });

  return wss;
}

function handleDashboardMessage(ws: WebSocket, message: { type: string; payload: unknown }) {
  switch (message.type) {
    case "submit_job": {
      const jobData = message.payload as Omit<OrchestratorJob, "id" | "status" | "createdAt">;
      const job: JobWithRecap = {
        ...jobData,
        id: randomUUID(),
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      jobQueue.push(job);
      console.error(`[Orchestrator] Job queued: ${job.id} - ${job.title}`);

      ws.send(JSON.stringify({
        type: "job_queued",
        payload: { jobId: job.id, position: jobQueue.length }
      }));
      break;
    }

    case "cancel_job": {
      const { jobId } = message.payload as { jobId: string };
      const index = jobQueue.findIndex(j => j.id === jobId);
      if (index !== -1 && jobQueue[index].status === "pending") {
        jobQueue.splice(index, 1);
        ws.send(JSON.stringify({
          type: "job_cancelled",
          payload: { jobId }
        }));
      } else {
        ws.send(JSON.stringify({
          type: "error",
          payload: { jobId, message: "Job not found or already in progress" }
        }));
      }
      break;
    }

    case "get_job_status": {
      const { jobId } = message.payload as { jobId?: string };
      if (jobId) {
        const job = jobQueue.find(j => j.id === jobId);
        ws.send(JSON.stringify({
          type: "job_status",
          payload: job || { error: "Job not found" }
        }));
      } else {
        ws.send(JSON.stringify({
          type: "job_status",
          payload: { jobs: jobQueue }
        }));
      }
      break;
    }

    default:
      ws.send(JSON.stringify({
        type: "error",
        payload: { message: `Unknown message type: ${message.type}` }
      }));
  }
}

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
