// SPDX-License-Identifier: MIT
/**
 * The orchestrator WebSocket server the dashboard talks to.
 *
 * This lives in the same process as the MCP server, which makes its failure
 * modes everyone's problem. `httpServer.listen()` had no `'error'` handler, so
 * a port already taken — a second project, a second Claude Code session, a
 * stale process — raised EADDRINUSE as an unhandled `'error'` event and killed
 * the process. Every agent then saw its MCP transport die, for a side channel
 * none of them were using.
 *
 * The socket is now optional. If the port cannot be bound, that is logged once
 * and the process carries on serving MCP tools; only dashboard-driven
 * orchestration is unavailable, and the tools that need it say so on their own.
 */

import { WebSocketServer, WebSocket } from "ws";
import { createServer, type Server as HttpServer } from "http";
import { randomUUID, timingSafeEqual } from "crypto";
import {
  ORCHESTRATOR_WS_PORT,
  jobQueue,
  connectedClients,
  type JobWithRecap,
  type OrchestratorJob,
} from "./handlers/index.js";

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

export interface OrchestratorSocket {
  /** null when the port could not be bound. */
  wss: WebSocketServer | null;
  httpServer: HttpServer;
  /** Resolves once the bind either succeeded or was given up on. */
  listening: Promise<boolean>;
  close(): Promise<void>;
}

export interface StartOptions {
  port?: number;
  host?: string;
}

export function startWebSocketServer(options: StartOptions = {}): OrchestratorSocket {
  const port = options.port ?? ORCHESTRATOR_WS_PORT;
  const host = options.host ?? ORCHESTRATOR_WS_HOST;

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

  // Without this, a `ws` internal error is an unhandled 'error' event, which
  // Node turns into an uncaught exception and a dead process.
  wss.on("error", (error) => {
    // `ws` re-emits the HTTP server's errors, so a failed bind arrives twice.
    // The HTTP handler below owns that message; reporting it here as well
    // would make one ordinary condition look like two faults.
    if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") return;
    console.error(`[Orchestrator] WebSocket server error: ${describe(error)}`);
  });

  const listening = new Promise<boolean>((resolve) => {
    let settled = false;

    httpServer.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        // The common case, and not an error for us: another dev-suite session
        // already owns the port. One line, then keep serving MCP tools.
        console.error(
          `[Orchestrator] Port ${host}:${port} already in use — continuing as MCP server only ` +
            `(dashboard orchestration is handled by the process that owns the port)`
        );
      } else {
        console.error(`[Orchestrator] HTTP server error: ${describe(error)}`);
      }
      if (!settled) {
        settled = true;
        resolve(false);
      }
    });

    // Bind loopback explicitly: `listen(port)` binds 0.0.0.0, which exposed an
    // unauthenticated job-submission endpoint to the whole network.
    httpServer.listen(port, host, () => {
      console.error(`[Orchestrator] WebSocket server listening on ${host}:${port}`);
      if (!process.env.ORCHESTRATOR_WS_TOKEN) {
        console.error(`[Orchestrator] Generated auth token: ${ORCHESTRATOR_WS_TOKEN}`);
      }
      if (!settled) {
        settled = true;
        resolve(true);
      }
    });
  });

  return {
    wss,
    httpServer,
    listening,
    close() {
      return new Promise<void>((resolve) => {
        wss.close(() => {
          httpServer.close(() => resolve());
        });
      });
    },
  };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function handleDashboardMessage(
  ws: WebSocket,
  message: { type: string; payload: unknown }
) {
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
