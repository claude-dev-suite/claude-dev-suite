// SPDX-License-Identifier: MIT
/**
 * Types and schemas for performance-profiler handlers
 */

import { z } from "zod";

// ============================================
// Handler Types
// ============================================

export interface HandlerResult {
  [key: string]: unknown; // Index signature for MCP SDK compatibility
  content: Array<{
    type: "text";
    text: string;
  }>;
  isError?: boolean;
}

export type Handler = (args: unknown) => Promise<HandlerResult>;

// ============================================
// Response Helpers
// ============================================

export function jsonResponse(data: unknown): HandlerResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

export function errorResponse(error: unknown, toolName: string): HandlerResult {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ error: errorMessage, tool: toolName }),
      },
    ],
    isError: true,
  };
}

// ============================================
// Input Schemas - Script Profiling
// ============================================

export const RuntimeEnum = z.enum(["nodejs", "java", "python"]);
export type Runtime = z.infer<typeof RuntimeEnum>;

export const ProfileScriptSchema = z.object({
  scriptPath: z.string().describe("Absolute path to the script/jar/module to profile"),
  runtime: RuntimeEnum.optional().describe("Runtime to use (auto-detected if not specified)"),
  args: z.array(z.string()).optional().describe("Arguments to pass to the script"),
  duration: z.number().optional().default(10).describe("Duration of profiling in seconds"),
});

export const ProfileFunctionSchema = z.object({
  modulePath: z.string().describe("Absolute path to the module/class containing the function"),
  functionName: z.string().describe("Name of the function to profile"),
  args: z.array(z.unknown()).optional().describe("Arguments to pass to the function"),
  iterations: z.number().optional().default(100).describe("Number of iterations to run"),
  runtime: RuntimeEnum.describe("Runtime to use"),
});

export const BenchmarkCodeSchema = z.object({
  /**
   * Path to an existing script file to benchmark (recommended, safe).
   * Mutually exclusive with `code`.
   */
  scriptPath: z.string().optional().describe(
    "Absolute path to a script file to benchmark. " +
    "The script should output JSON { timings: number[] } for best results, " +
    "or simply run its workload and total elapsed time is reported."
  ),
  /**
   * Raw code string to benchmark.
   * UNSAFE: only accepted when PERF_PROFILER_ALLOW_RAW_CODE=1 is set server-side.
   * Prefer scriptPath in all environments.
   * @deprecated use scriptPath instead
   */
  code: z.string().optional().describe(
    "Raw code snippet to benchmark (UNSAFE — disabled by default; " +
    "use scriptPath instead)."
  ),
  runtime: RuntimeEnum.describe("Runtime to use"),
  iterations: z.number().optional().default(1000).describe("Number of iterations to run"),
  warmup: z.number().optional().default(100).describe("Number of warmup iterations"),
}).refine(
  (data) => data.scriptPath !== undefined || data.code !== undefined,
  { message: "Either scriptPath or code must be provided" }
);

export const AnalyzeMemorySchema = z.object({
  scriptPath: z.string().describe("Absolute path to the script to analyze"),
  runtime: RuntimeEnum.optional().describe("Runtime to use (auto-detected if not specified)"),
  snapshotInterval: z.number().optional().default(1000).describe("Interval between memory snapshots in ms"),
  duration: z.number().optional().default(10).describe("Duration of analysis in seconds"),
});

export const MeasureStartupSchema = z.object({
  scriptPath: z.string().describe("Absolute path to the script/jar/module to measure"),
  runtime: RuntimeEnum.optional().describe("Runtime to use (auto-detected if not specified)"),
  runs: z.number().optional().default(5).describe("Number of runs to measure"),
});

export const FindBottlenecksSchema = z.object({
  scriptPath: z.string().describe("Absolute path to the script to analyze"),
  runtime: RuntimeEnum.optional().describe("Runtime to use (auto-detected if not specified)"),
  threshold: z.number().optional().default(5).describe("Minimum percentage to report as bottleneck"),
});

// ============================================
// Input Schemas - Live Profiling
// ============================================

export const AttachProfilerSchema = z.object({
  pid: z.number().optional().describe("PID of the process to profile"),
  port: z.number().optional().describe("Port to auto-detect process (e.g., 8080)"),
  processName: z.string().optional().describe("Process name pattern to search"),
  duration: z.number().default(30).describe("Duration of profiling in seconds"),
});

export const ProfileEndpointSchema = z.object({
  url: z.string().url().describe("Full URL of the endpoint to profile"),
  method: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH"]).optional().default("GET"),
  headers: z.record(z.string(), z.string()).optional().describe("HTTP headers to include"),
  body: z.unknown().optional().describe("Request body for POST/PUT requests"),
  iterations: z.number().optional().default(100).describe("Number of requests to make"),
  concurrency: z.number().optional().default(1).describe("Concurrent requests"),
  warmupIterations: z.number().optional().default(5),
  timeoutMs: z.number().optional().default(30000),
});

// ============================================
// Input Schemas - Flow Recording
// ============================================

export const ImportHarSchema = z.object({
  harPath: z.string().describe("Absolute path to the .har file"),
  flowName: z.string().describe("Name to assign to the flow"),
  filterHost: z.string().optional().describe("Only import requests to this host"),
  excludeStaticAssets: z.boolean().optional().default(true),
  excludePatterns: z.array(z.string()).optional(),
});

export const ReplayFlowSchema = z.object({
  flowName: z.string().describe("Name of the flow to replay"),
  baseUrl: z.string().optional().describe("Override base URL"),
  variables: z.record(z.string(), z.string()).optional().describe("Variables to substitute"),
  respectTiming: z.boolean().optional().default(false).describe("Wait between requests"),
  withProfiling: z.boolean().optional().default(false).describe("Attach JFR during replay"),
  profilingPort: z.number().optional().describe("Port for process detection"),
  profilingPid: z.number().optional().describe("PID for direct attachment"),
  stopOnError: z.boolean().optional().default(false),
  timeoutMs: z.number().optional().default(30000),
});

export const StressTestSchema = z.object({
  flowName: z.string().describe("Name of the flow to stress test"),
  users: z.number().describe("Number of concurrent virtual users"),
  duration: z.number().describe("Test duration in seconds"),
  rampUp: z.number().optional().default(5).describe("Ramp-up time in seconds"),
  baseUrl: z.string().optional().describe("Override base URL"),
  variables: z.record(z.string(), z.string()).optional(),
  thinkTime: z.number().optional().default(0).describe("Delay between requests in ms"),
  timeout: z.number().optional().default(30000),
});
