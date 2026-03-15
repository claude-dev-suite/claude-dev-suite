// SPDX-License-Identifier: MIT
/**
 * Dashboard Bridge types and schemas
 */

import { z } from "zod";
import type { WebSocket } from "ws";

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
// ORCHESTRATOR TYPES
// ============================================================================

export interface SubTask {
  agentId: string;
  task: string;
  priority?: "high" | "normal";
  dependencies?: string[];
}

export interface OrchestratorJob {
  id: string;
  projectPath: string;
  title: string;
  context?: string;
  subTasks: SubTask[];
  mcpServers: string[];
  createdAt: string;
  status: "pending" | "claimed" | "running" | "completed" | "failed";
  claimedAt?: string;
  completedAt?: string;
}

export interface AgentResult {
  agentId: string;
  status: "completed" | "skipped" | "failed";
  summary: string;
  duration: string;
}

export interface TestResultByAgent {
  agentId: string;
  testType: string;
  passed: number;
  failed: number;
  skipped: number;
  coverage?: string;
  failedTests?: Array<{ name: string; error: string }>;
}

export interface JobRecap {
  agentResults?: AgentResult[];
  files?: {
    created: string[];
    modified: string[];
    deleted: string[];
  };
  tests?: {
    ran: boolean;
    summary: {
      passed: number;
      failed: number;
      skipped: number;
      coverage?: string;
    };
    byAgent: TestResultByAgent[];
  };
  build?: {
    ran: boolean;
    success: boolean;
    warnings: number;
    errors: string[];
  };
  notes?: string[];
  nextSteps?: string[];
}

export interface JobWithRecap extends OrchestratorJob {
  recap?: JobRecap;
  summary?: string;
}

// ============================================================================
// INPUT SCHEMAS
// ============================================================================

export const DashboardOpenSchema = z.object({
  page: z.enum(["home", "wizard", "agents", "mcp", "orchestrator", "settings"]).optional().default("home"),
  projectPath: z.string().optional(),
});

export const DashboardStartSchema = z.object({
  devSuiteDir: z.string().optional(),
});

export const ProjectPathSchema = z.object({
  projectPath: z.string(),
});

export const GetOrchestratorTaskSchema = z.object({
  claim: z.boolean().optional().default(true),
});

export const ReportStatusSchema = z.object({
  jobId: z.string(),
  status: z.enum(["progress", "completed", "failed"]),
  currentAgent: z.string().optional(),
  message: z.string().optional(),
  summary: z.string().optional(),
  recap: z.object({
    agentResults: z.array(z.object({
      agentId: z.string(),
      status: z.enum(["completed", "skipped", "failed"]),
      summary: z.string(),
      duration: z.string(),
    })).optional(),
    files: z.object({
      created: z.array(z.string()),
      modified: z.array(z.string()),
      deleted: z.array(z.string()),
    }).optional(),
    tests: z.object({
      ran: z.boolean(),
      summary: z.object({
        passed: z.number(),
        failed: z.number(),
        skipped: z.number(),
        coverage: z.string().optional(),
      }),
      byAgent: z.array(z.object({
        agentId: z.string(),
        testType: z.string(),
        passed: z.number(),
        failed: z.number(),
        skipped: z.number(),
        coverage: z.string().optional(),
      })),
    }).optional(),
    build: z.object({
      ran: z.boolean(),
      success: z.boolean(),
      warnings: z.number(),
      errors: z.array(z.string()),
    }).optional(),
    notes: z.array(z.string()).optional(),
    nextSteps: z.array(z.string()).optional(),
  }).optional(),
});

// ============================================================================
// CONFIGURATION
// ============================================================================

export const DASHBOARD_PORT = process.env.DASHBOARD_PORT || "3456";
export const DASHBOARD_HOST = process.env.DASHBOARD_HOST || "localhost";
export const DASHBOARD_URL = `http://${DASHBOARD_HOST}:${DASHBOARD_PORT}`;
export const ORCHESTRATOR_WS_PORT = parseInt(process.env.ORCHESTRATOR_WS_PORT || "3457");

// ============================================================================
// SHARED STATE
// ============================================================================

export const jobQueue: JobWithRecap[] = [];
export const connectedClients: Set<WebSocket> = new Set();

// ============================================================================
// HELPERS
// ============================================================================

export function jsonResponse(data: object): HandlerResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

export function textResponse(text: string): HandlerResult {
  return {
    content: [{ type: "text", text }],
  };
}

export function errorResponse(message: string): HandlerResult {
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
}

export function broadcastToClients(message: object): void {
  const { WebSocket: WS } = require("ws");
  const data = JSON.stringify(message);
  for (const client of connectedClients) {
    if (client.readyState === WS.OPEN) {
      client.send(data);
    }
  }
}

export function generateOrchestratorPrompt(job: OrchestratorJob): string {
  const lines: string[] = [];

  lines.push(`# Orchestrator Task: ${job.title}`);
  lines.push("");
  lines.push(`**Job ID**: ${job.id}`);
  lines.push(`**Project**: ${job.projectPath}`);
  lines.push("");

  if (job.context) {
    lines.push("## Context");
    lines.push(job.context);
    lines.push("");
  }

  if (job.mcpServers.length > 0) {
    lines.push("## Available MCP Servers");
    lines.push(`Suggested for this workflow: ${job.mcpServers.join(", ")}`);
    lines.push("");
  }

  lines.push("## Sub-Tasks by Agent");
  lines.push("");

  job.subTasks.forEach((subTask, index) => {
    lines.push(`### ${index + 1}. Agent: ${subTask.agentId}`);
    lines.push(`**File**: .claude/agents/${subTask.agentId}.md`);
    lines.push(`**Task**: ${subTask.task}`);
    if (subTask.priority === "high") {
      lines.push(`**Priority**: HIGH`);
    }
    if (subTask.dependencies && subTask.dependencies.length > 0) {
      lines.push(`**Depends on**: ${subTask.dependencies.join(", ")}`);
    }
    lines.push("");
  });

  lines.push("## Execution Instructions");
  lines.push("");
  lines.push("- Use the Task tool to delegate to specialized agents listed above");
  lines.push("- Parallelize independent tasks where possible for efficiency");
  lines.push("- Tasks with dependencies should wait for prerequisite completion");
  lines.push("- Report progress via `mcp__dashboard-bridge__report_orchestrator_status` tool");
  lines.push("- When complete, call `report_orchestrator_status` with full recap data");
  lines.push("");

  return lines.join("\n");
}
