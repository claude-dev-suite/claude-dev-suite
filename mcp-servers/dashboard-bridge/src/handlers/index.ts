// SPDX-License-Identifier: MIT
/**
 * Dashboard Bridge handlers registry
 */

// Type exports
export type { Handler, HandlerResult } from "./types.js";
export {
  jsonResponse,
  textResponse,
  errorResponse,
  broadcastToClients,
  generateOrchestratorPrompt,
  DASHBOARD_PORT,
  DASHBOARD_HOST,
  DASHBOARD_URL,
  ORCHESTRATOR_WS_PORT,
  jobQueue,
  connectedClients,
} from "./types.js";

// Type exports for orchestrator
export type {
  SubTask,
  OrchestratorJob,
  AgentResult,
  TestResultByAgent,
  JobRecap,
  JobWithRecap,
} from "./types.js";

// Handler imports
import type { Handler } from "./types.js";
import {
  handleDashboardOpen,
  handleDashboardStatus,
  handleDashboardStart,
  handleDashboardGetConfig,
  handleDashboardListAgents,
  handleDashboardDetectStack,
} from "./dashboard.js";
import {
  handleGetOrchestratorTask,
  handleReportOrchestratorStatus,
  handleListPendingJobs,
} from "./orchestrator.js";

// Handler exports
export {
  handleDashboardOpen,
  handleDashboardStatus,
  handleDashboardStart,
  handleDashboardGetConfig,
  handleDashboardListAgents,
  handleDashboardDetectStack,
} from "./dashboard.js";
export {
  handleGetOrchestratorTask,
  handleReportOrchestratorStatus,
  handleListPendingJobs,
} from "./orchestrator.js";

/**
 * Handler registry - maps tool names to their handlers
 */
export const handlers: Record<string, Handler> = {
  // Dashboard tools
  dashboard_open: handleDashboardOpen,
  dashboard_status: handleDashboardStatus,
  dashboard_start: handleDashboardStart,
  dashboard_get_config: handleDashboardGetConfig,
  dashboard_list_agents: handleDashboardListAgents,
  dashboard_detect_stack: handleDashboardDetectStack,

  // Orchestrator tools
  get_orchestrator_task: handleGetOrchestratorTask,
  report_orchestrator_status: handleReportOrchestratorStatus,
  list_pending_jobs: handleListPendingJobs,
};
