// SPDX-License-Identifier: MIT
/**
 * Flow Replayer
 * Replay recorded HTTP flows with optional profiling
 */

import { loadFlow, type Flow, type FlowRequest } from './storage.js';
import {
  httpRequest,
  substituteInObject,
  captureFromResponse,
  buildUrl,
  type HttpResult,
} from '../utils/http-client.js';
import { attachProfiler, type AttachProfilerResult } from '../live/attach.js';
import { round } from '../utils/statistics.js';

export interface ReplayFlowInput {
  flowName: string;
  baseUrl?: string; // Override base URL
  variables?: Record<string, string>; // Override/add variables
  respectTiming?: boolean; // Wait between requests based on original timing
  withProfiling?: boolean; // Attach JFR during replay
  profilingPort?: number; // Port for process auto-detection
  profilingPid?: number; // PID for direct attachment
  stopOnError?: boolean; // Stop on first error
  timeoutMs?: number; // Request timeout
}

export interface RequestReplayResult {
  requestId: number;
  method: string;
  path: string;
  fullUrl: string;
  success: boolean;
  status?: number;
  latencyMs: number;
  error?: string;
  capturedVariables?: Record<string, string>;
}

export interface ReplayFlowResult {
  flowName: string;
  baseUrl: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalTimeMs: number;
  requests: RequestReplayResult[];
  capturedVariables: Record<string, string>;
  profiling?: AttachProfilerResult;
}

/**
 * Replay a recorded flow
 */
export async function replayFlow(input: ReplayFlowInput): Promise<ReplayFlowResult> {
  const {
    flowName,
    baseUrl: overrideBaseUrl,
    variables: overrideVariables = {},
    respectTiming = false,
    withProfiling = false,
    profilingPort,
    profilingPid,
    stopOnError = false,
    timeoutMs = 30000,
  } = input;

  // Load flow
  const flow = await loadFlow(flowName);
  const baseUrl = overrideBaseUrl || flow.baseUrl;

  // Merge variables
  const variables: Record<string, string> = {
    ...flow.variables,
    ...overrideVariables,
  };

  // Start profiling if requested
  let profilingPromise: Promise<AttachProfilerResult> | undefined;
  if (withProfiling && (profilingPort || profilingPid)) {
    console.error(`Starting JFR profiling...`);
    // Estimate duration based on flow (with buffer)
    const estimatedDuration = Math.max(
      Math.ceil((flow.requests[flow.requests.length - 1]?.timestamp || 0) / 1000) + 10,
      30
    );

    profilingPromise = attachProfiler({
      pid: profilingPid,
      port: profilingPort,
      duration: estimatedDuration,
    });
  }

  const results: RequestReplayResult[] = [];
  let lastRequestTime = 0;
  const startTime = Date.now();

  console.error(`Replaying flow "${flowName}" with ${flow.requests.length} requests...`);

  for (const request of flow.requests) {
    // Respect timing if configured
    if (respectTiming && request.timestamp > lastRequestTime) {
      const delay = request.timestamp - lastRequestTime;
      await sleep(delay);
    }
    lastRequestTime = request.timestamp;

    // Execute request
    const result = await executeRequest(request, baseUrl, variables, timeoutMs);
    results.push(result);

    // Update variables from captured response
    if (result.capturedVariables) {
      Object.assign(variables, result.capturedVariables);
    }

    // Log progress
    const status = result.success
      ? `✓ ${result.status}`
      : `✗ ${result.error}`;
    console.error(
      `  [${request.id}/${flow.requests.length}] ${request.method} ${request.path} - ${status} (${round(result.latencyMs, 1)}ms)`
    );

    // Stop on error if configured
    if (!result.success && stopOnError) {
      console.error(`Stopping replay due to error`);
      break;
    }
  }

  const totalTimeMs = Date.now() - startTime;
  const successfulRequests = results.filter((r) => r.success).length;
  const failedRequests = results.length - successfulRequests;

  // Wait for profiling to complete
  let profilingResult: AttachProfilerResult | undefined;
  if (profilingPromise) {
    try {
      profilingResult = await profilingPromise;
      console.error(`JFR profiling completed`);
    } catch (error) {
      console.error(`JFR profiling error: ${error}`);
    }
  }

  return {
    flowName,
    baseUrl,
    totalRequests: flow.requests.length,
    successfulRequests,
    failedRequests,
    totalTimeMs,
    requests: results,
    capturedVariables: variables,
    profiling: profilingResult,
  };
}

/**
 * Execute a single request from the flow
 */
async function executeRequest(
  request: FlowRequest,
  baseUrl: string,
  variables: Record<string, string>,
  timeoutMs: number
): Promise<RequestReplayResult> {
  // Substitute variables in path
  const path = substituteInObject(request.path, variables);
  const fullUrl = buildUrl(baseUrl, path);

  // Substitute variables in headers and body
  const headers = substituteInObject(request.headers, variables);
  const body = request.body ? substituteInObject(request.body, variables) : undefined;

  // Make request
  const result = await httpRequest({
    method: request.method,
    url: fullUrl,
    headers,
    body,
    timeoutMs,
  });

  const baseResult: RequestReplayResult = {
    requestId: request.id,
    method: request.method,
    path: request.path,
    fullUrl,
    success: result.success,
    latencyMs: result.success ? result.response.latencyMs : result.error.latencyMs,
  };

  if (result.success) {
    baseResult.status = result.response.status;

    // Capture variables from response if configured
    if (request.captureResponse && result.response.json) {
      baseResult.capturedVariables = captureFromResponse(
        result.response.json,
        request.captureResponse
      );
    }
  } else {
    baseResult.error = result.error.message;
  }

  return baseResult;
}

/**
 * Dry run - show what would be executed without making requests
 */
export async function dryRunFlow(input: {
  flowName: string;
  baseUrl?: string;
  variables?: Record<string, string>;
}): Promise<{
  flowName: string;
  baseUrl: string;
  requests: Array<{
    id: number;
    method: string;
    path: string;
    fullUrl: string;
    resolvedPath: string;
    headers: Record<string, string>;
    body?: unknown;
    hasUnresolvedVariables: boolean;
    unresolvedVariables: string[];
  }>;
  allVariables: Record<string, string>;
  unresolvedVariables: string[];
}> {
  const { flowName, baseUrl: overrideBaseUrl, variables: overrideVariables = {} } = input;

  const flow = await loadFlow(flowName);
  const baseUrl = overrideBaseUrl || flow.baseUrl;

  const variables: Record<string, string> = {
    ...flow.variables,
    ...overrideVariables,
  };

  const allUnresolved = new Set<string>();
  const requests: Array<{
    id: number;
    method: string;
    path: string;
    fullUrl: string;
    resolvedPath: string;
    headers: Record<string, string>;
    body?: unknown;
    hasUnresolvedVariables: boolean;
    unresolvedVariables: string[];
  }> = [];

  for (const request of flow.requests) {
    const resolvedPath = substituteInObject(request.path, variables);
    const resolvedHeaders = substituteInObject(request.headers, variables);
    const resolvedBody = request.body ? substituteInObject(request.body, variables) : undefined;

    // Find unresolved variables
    const unresolvedInRequest = findUnresolvedVariables(
      JSON.stringify({ path: resolvedPath, headers: resolvedHeaders, body: resolvedBody })
    );

    unresolvedInRequest.forEach((v) => allUnresolved.add(v));

    requests.push({
      id: request.id,
      method: request.method,
      path: request.path,
      fullUrl: buildUrl(baseUrl, resolvedPath),
      resolvedPath,
      headers: resolvedHeaders,
      body: resolvedBody,
      hasUnresolvedVariables: unresolvedInRequest.length > 0,
      unresolvedVariables: unresolvedInRequest,
    });
  }

  return {
    flowName,
    baseUrl,
    requests,
    allVariables: variables,
    unresolvedVariables: [...allUnresolved],
  };
}

/**
 * Find unresolved {{variables}} in a string
 */
function findUnresolvedVariables(str: string): string[] {
  const matches = str.match(/\{\{([^}]+)\}\}/g) || [];
  return [...new Set(matches.map((m) => m.slice(2, -2).trim()))];
}

/**
 * Replay flow multiple times and collect statistics
 */
export async function benchmarkFlow(input: {
  flowName: string;
  baseUrl?: string;
  variables?: Record<string, string>;
  iterations: number;
  warmupIterations?: number;
}): Promise<{
  flowName: string;
  iterations: number;
  warmupIterations: number;
  results: {
    totalTimeMs: {
      min: number;
      max: number;
      mean: number;
      stdDev: number;
    };
    requestLatencies: Record<
      string,
      {
        min: number;
        max: number;
        mean: number;
        p95: number;
      }
    >;
    successRate: number;
    errorsPerRequest: Record<string, number>;
  };
}> {
  const {
    flowName,
    baseUrl,
    variables,
    iterations,
    warmupIterations = 2,
  } = input;

  // Warmup
  if (warmupIterations > 0) {
    console.error(`Warming up with ${warmupIterations} iterations...`);
    for (let i = 0; i < warmupIterations; i++) {
      await replayFlow({
        flowName,
        baseUrl,
        variables,
        respectTiming: false,
        stopOnError: false,
      });
    }
  }

  // Collect data
  const totalTimes: number[] = [];
  const latenciesByRequest: Record<string, number[]> = {};
  const errorsByRequest: Record<string, number> = {};
  let totalSuccesses = 0;
  let totalRequests = 0;

  console.error(`Running ${iterations} benchmark iterations...`);

  for (let i = 0; i < iterations; i++) {
    const result = await replayFlow({
      flowName,
      baseUrl,
      variables,
      respectTiming: false,
      stopOnError: false,
    });

    totalTimes.push(result.totalTimeMs);

    for (const req of result.requests) {
      const key = `${req.method} ${req.path}`;

      if (!latenciesByRequest[key]) {
        latenciesByRequest[key] = [];
        errorsByRequest[key] = 0;
      }

      latenciesByRequest[key].push(req.latencyMs);
      totalRequests++;

      if (req.success) {
        totalSuccesses++;
      } else {
        errorsByRequest[key]++;
      }
    }

    console.error(`  Iteration ${i + 1}/${iterations}: ${result.totalTimeMs}ms`);
  }

  // Calculate statistics
  const { mean, stdDev, percentile } = await import('../utils/statistics.js');

  const requestLatencies: Record<
    string,
    { min: number; max: number; mean: number; p95: number }
  > = {};

  for (const [key, latencies] of Object.entries(latenciesByRequest)) {
    const sorted = [...latencies].sort((a, b) => a - b);
    requestLatencies[key] = {
      min: round(sorted[0], 2),
      max: round(sorted[sorted.length - 1], 2),
      mean: round(mean(latencies), 2),
      p95: round(percentile(sorted, 95), 2),
    };
  }

  const sortedTotalTimes = [...totalTimes].sort((a, b) => a - b);

  return {
    flowName,
    iterations,
    warmupIterations,
    results: {
      totalTimeMs: {
        min: round(sortedTotalTimes[0], 2),
        max: round(sortedTotalTimes[sortedTotalTimes.length - 1], 2),
        mean: round(mean(totalTimes), 2),
        stdDev: round(stdDev(totalTimes), 2),
      },
      requestLatencies,
      successRate: round((totalSuccesses / totalRequests) * 100, 2),
      errorsPerRequest: errorsByRequest,
    },
  };
}

/**
 * Helper: sleep for ms
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
