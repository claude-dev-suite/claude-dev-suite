// SPDX-License-Identifier: MIT
/**
 * Types and input schemas for performance-profiler handlers.
 */

import { z } from 'zod';
import { redactText } from '../utils/redact.js';

export interface HandlerResult {
  [key: string]: unknown; // index signature for MCP SDK compatibility
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export type Handler = (args: unknown) => Promise<HandlerResult>;

export function jsonResponse(data: unknown): HandlerResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

export function errorResponse(error: unknown, toolName: string): HandlerResult {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: redactText(errorMessage), tool: toolName }) }],
    isError: true,
  };
}

// ---------------------------------------------------------------------------
// Shared fields
// ---------------------------------------------------------------------------

export const RUNTIMES = ['nodejs', 'java', 'python', 'go', 'dotnet'] as const;
export const RuntimeEnum = z.enum(RUNTIMES);
export type Runtime = z.infer<typeof RuntimeEnum>;

const duration = (def: number) => z.number().positive().optional().default(def);
const limit = z.number().int().min(1).max(500).optional().default(20);
const background = z.boolean().optional();
const pid = z.number().int().positive();
const port = z.number().int().min(1).max(65535);
const scriptArgs = z.array(z.string().max(4096)).max(200).optional();

// ---------------------------------------------------------------------------
// Script profiling
// ---------------------------------------------------------------------------

export const ProfileScriptSchema = z.object({
  scriptPath: z.string(),
  runtime: RuntimeEnum.optional(),
  args: scriptArgs,
  duration: duration(10),
  limit,
  samplingIntervalUs: z.number().int().min(50).max(100_000).optional(),
  profiler: z.enum(['cprofile', 'py-spy']).optional(),
  goBench: z.string().max(200).optional(),
  goTest: z.string().max(200).optional(),
  background,
});

export const ProfileFunctionSchema = z.object({
  modulePath: z.string(),
  functionName: z.string().max(300),
  args: z.array(z.unknown()).optional(),
  iterations: z.number().int().optional().default(100),
  warmup: z.number().int().min(0).optional().default(10),
  runtime: RuntimeEnum,
});

export const BenchmarkCodeSchema = z
  .object({
    scriptPath: z.string().optional(),
    code: z.string().max(100_000).optional(),
    runtime: RuntimeEnum,
    iterations: z.number().int().optional(),
    warmup: z.number().int().min(0).optional(),
    compareScriptPath: z.string().optional(),
    compareCode: z.string().max(100_000).optional(),
    removeOutliers: z.boolean().optional().default(true),
    background,
  })
  .refine((d) => d.scriptPath !== undefined || d.code !== undefined, { message: 'Either scriptPath or code must be provided' });

export const AnalyzeMemorySchema = z
  .object({
    scriptPath: z.string().optional(),
    runtime: RuntimeEnum.optional(),
    pid: pid.optional(),
    inspectPort: port.optional(),
    args: scriptArgs,
    snapshotInterval: z.number().int().min(100).max(60_000).optional().default(1000),
    duration: duration(10),
    forceGc: z.boolean().optional().default(true),
    heapSnapshots: z.boolean().optional().default(true),
    limit,
    background,
  })
  .refine((d) => d.scriptPath !== undefined || d.pid !== undefined || d.inspectPort !== undefined, {
    message: 'Pass scriptPath, or pid / inspectPort to observe a running process',
  });

export const MeasureStartupSchema = z.object({
  scriptPath: z.string(),
  runtime: RuntimeEnum.optional(),
  runs: z.number().int().min(1).max(50).optional().default(5),
  args: scriptArgs,
  readyPort: port.optional(),
  readyLogPattern: z.string().max(200).optional(),
  readyUrl: z.string().url().optional(),
  timeout: z.number().positive().max(600).optional().default(60),
});

export const FindBottlenecksSchema = z.object({
  scriptPath: z.string(),
  runtime: RuntimeEnum.optional(),
  threshold: z.number().min(0).max(100).optional().default(5),
  duration: duration(10),
  args: scriptArgs,
  profiler: z.enum(['cprofile', 'py-spy']).optional(),
  goBench: z.string().max(200).optional(),
  background,
});

// ---------------------------------------------------------------------------
// Live profiling
// ---------------------------------------------------------------------------

export const AttachProfilerSchema = z.object({
  runtime: z.enum(['java', 'nodejs', 'python', 'dotnet']).optional().default('java'),
  pid: pid.optional(),
  port: port.optional(),
  processName: z.string().max(200).optional(),
  inspectPort: port.optional(),
  duration: duration(30),
  mode: z.enum(['record', 'dump']).optional().default('record'),
  threshold: z.number().min(0).max(100).optional().default(5),
  limit,
  background,
});

const thresholds = z.array(z.string().max(100)).max(20).optional();

export const ProfileEndpointSchema = z.object({
  url: z.string().url(),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']).optional().default('GET'),
  headers: z.record(z.string(), z.string()).optional(),
  body: z.unknown().optional(),
  iterations: z.number().int().positive().optional(),
  duration: z.number().positive().optional(),
  concurrency: z.number().int().positive().optional(),
  rate: z.number().positive().optional(),
  rampUp: z.number().min(0).optional(),
  warmupIterations: z.number().int().min(0).max(1000).optional().default(5),
  timeoutMs: z.number().int().positive().max(300_000).optional().default(30_000),
  thresholds,
  background,
});

// ---------------------------------------------------------------------------
// Flows
// ---------------------------------------------------------------------------

export const ImportHarSchema = z.object({
  harPath: z.string(),
  flowName: z.string(),
  filterHost: z.string().optional(),
  excludeStaticAssets: z.boolean().optional().default(true),
  excludePatterns: z.array(z.string()).optional(),
});

export const ReplayFlowSchema = z.object({
  flowName: z.string(),
  baseUrl: z.string().optional(),
  variables: z.record(z.string(), z.string()).optional(),
  respectTiming: z.boolean().optional().default(false),
  withProfiling: z.boolean().optional().default(false),
  profilingPort: port.optional(),
  profilingPid: pid.optional(),
  stopOnError: z.boolean().optional().default(false),
  timeoutMs: z.number().int().positive().max(300_000).optional().default(30_000),
});

export const StressTestSchema = z.object({
  flowName: z.string(),
  users: z.number().int().positive(),
  duration: z.number().positive(),
  rampUp: z.number().min(0).optional().default(5),
  baseUrl: z.string().optional(),
  variables: z.record(z.string(), z.string()).optional(),
  thinkTime: z.number().min(0).optional().default(0),
  timeout: z.number().int().positive().max(300_000).optional().default(30_000),
  arrivalRate: z.number().positive().optional(),
  maxRate: z.number().positive().optional(),
  thresholds,
  background,
});

// ---------------------------------------------------------------------------
// Jobs, baselines, web vitals
// ---------------------------------------------------------------------------

export const GetJobSchema = z.object({
  jobId: z.string().max(64),
  wait: z.number().min(0).max(25).optional().default(0),
});

export const StopJobSchema = z.object({ jobId: z.string().max(64) });

export const SaveBaselineSchema = z.object({
  name: z.string().max(80),
  runId: z.string().max(64),
  overwrite: z.boolean().optional().default(false),
});

export const CompareResultsSchema = z.object({
  baseline: z.string().max(80),
  current: z.string().max(64),
  tolerancePct: z.number().min(0).max(1000).optional().default(5),
});

export const AuditWebVitalsSchema = z.object({
  url: z.string().url(),
  formFactor: z.enum(['mobile', 'desktop']).optional().default('mobile'),
  runs: z.number().int().min(1).max(5).optional().default(1),
  engine: z.enum(['auto', 'lighthouse', 'chrome']).optional().default('auto'),
  background,
});
