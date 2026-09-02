// SPDX-License-Identifier: MIT
/**
 * Dashboard tool handlers
 */

import { spawn, execFile } from "child_process";
import { promisify } from "util";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  DashboardOpenSchema,
  DashboardStartSchema,
  ProjectPathSchema,
  DASHBOARD_URL,
  ORCHESTRATOR_WS_PORT,
  jobQueue,
  jsonResponse,
  textResponse,
  type Handler,
  type HandlerResult,
} from "./types.js";
import {
  dashboardFetch,
  invalidateDashboardProbe,
  probeDashboard,
} from "./dashboard-probe.js";

const execFileAsync = promisify(execFile);

export const handleDashboardOpen: Handler = async (args): Promise<HandlerResult> => {
  const { page, projectPath } = DashboardOpenSchema.parse(args);

  let url = DASHBOARD_URL;
  if (page === "home") {
    url = DASHBOARD_URL;
  } else if (page === "wizard" && projectPath) {
    url = `${DASHBOARD_URL}/wizard?project=${encodeURIComponent(projectPath)}`;
  } else {
    url = `${DASHBOARD_URL}/${page}`;
  }

  // Validate URL is http/https to prevent command injection
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return textResponse(`Invalid URL protocol: ${parsed.protocol}. Please open manually: ${url}`);
    }
  } catch {
    return textResponse(`Invalid URL. Please open manually: ${url}`);
  }

  const openCommand = process.platform === "darwin"
    ? "open"
    : process.platform === "win32"
    ? "cmd"
    : "xdg-open";

  try {
    if (process.platform === "win32") {
      // On Windows, use 'cmd /c start "" <url>' via execFile to avoid shell injection
      await execFileAsync("cmd", ["/c", "start", "", url]);
    } else {
      await execFileAsync(openCommand, [url]);
    }
    return textResponse(`Opened dashboard at ${url}`);
  } catch {
    return textResponse(`Please open manually: ${url}`);
  }
};

export const handleDashboardStatus: Handler = async (): Promise<HandlerResult> => {
  const probe = await probeDashboard();
  if (probe.reachable) {
    return jsonResponse({
      status: "running",
      url: DASHBOARD_URL,
      orchestratorWsPort: ORCHESTRATOR_WS_PORT,
      agents: probe.agents?.total || 0,
      pendingJobs: jobQueue.filter(j => j.status === "pending").length,
    });
  }

  return jsonResponse({
    status: "not_running",
    url: DASHBOARD_URL,
    orchestratorWsPort: ORCHESTRATOR_WS_PORT,
    message: "Dashboard is not running. Use dashboard_start to start it.",
  });
};

export const handleDashboardStart: Handler = async (args): Promise<HandlerResult> => {
  let devSuiteDir = DashboardStartSchema.parse(args).devSuiteDir;

  if (!devSuiteDir) {
    const possiblePaths = [
      process.env.DEV_SUITE_DIR,
      join(process.cwd(), ".."),
      join(process.cwd(), "..", "dev-suite"),
    ];

    for (const path of possiblePaths) {
      if (path && existsSync(join(path, "configurator", "dashboard"))) {
        devSuiteDir = path;
        break;
      }
    }
  }

  if (!devSuiteDir) {
    return textResponse("Could not find dev-suite directory. Please provide devSuiteDir parameter.");
  }

  const dashboardDir = join(devSuiteDir, "configurator", "dashboard");

  if ((await probeDashboard()).reachable) {
    return textResponse(`Dashboard is already running at ${DASHBOARD_URL}`);
  }

  const child = spawn("node", ["server.cjs"], {
    cwd: dashboardDir,
    detached: true,
    stdio: "ignore",
  });
  child.unref();

  // We just changed the answer the cache is holding: the next status check
  // must go back to the socket instead of repeating "not running" for the
  // rest of the TTL.
  invalidateDashboardProbe();

  return textResponse(`Starting dashboard at ${DASHBOARD_URL}. It may take a few seconds to be ready.`);
};

export const handleDashboardGetConfig: Handler = async (args): Promise<HandlerResult> => {
  const { projectPath } = ProjectPathSchema.parse(args);

  const configPath = join(projectPath, ".dev-suite.json");
  const mcpPath = join(projectPath, ".mcp.json");

  const result: Record<string, unknown> = {};

  if (existsSync(configPath)) {
    try {
      result.devSuiteConfig = JSON.parse(readFileSync(configPath, "utf-8"));
    } catch (e) {
      result.devSuiteConfigError = String(e);
    }
  } else {
    result.devSuiteConfig = null;
  }

  if (existsSync(mcpPath)) {
    try {
      result.mcpConfig = JSON.parse(readFileSync(mcpPath, "utf-8"));
    } catch (e) {
      result.mcpConfigError = String(e);
    }
  } else {
    result.mcpConfig = null;
  }

  return jsonResponse(result);
};

export const handleDashboardListAgents: Handler = async (): Promise<HandlerResult> => {
  const probe = await probeDashboard();
  if (probe.reachable) {
    return jsonResponse(probe.agents);
  }

  return textResponse("Dashboard is not running. Start it with dashboard_start first.");
};

export const handleDashboardDetectStack: Handler = async (args): Promise<HandlerResult> => {
  const { projectPath } = ProjectPathSchema.parse(args);

  // Detection is project-specific so it cannot be served from the shared
  // probe, but the probe still decides whether it is worth one request: with
  // the dashboard down, N agents would otherwise each wait out a timeout.
  if (!(await probeDashboard()).reachable) {
    return textResponse("Dashboard is not running. Start it with dashboard_start first.");
  }

  try {
    const response = await dashboardFetch(
      `${DASHBOARD_URL}/api/detect?project_path=${encodeURIComponent(projectPath)}`
    );
    if (response.ok) {
      const data = await response.json();
      return jsonResponse(data);
    }
  } catch {
    // Dashboard went away between the probe and the request.
  }

  return textResponse("Dashboard is not running. Start it with dashboard_start first.");
};
