// SPDX-License-Identifier: MIT
/**
 * Stress Test
 * Load testing for recorded flows
 */

import { loadFlow, type Flow } from './storage.js';
import {
  httpRequest,
  substituteInObject,
  captureFromResponse,
  buildUrl,
} from '../utils/http-client.js';
import { mean, stdDev, percentile, round } from '../utils/statistics.js';

export interface StressTestInput {
  flowName: string;
  users: number; // Concurrent virtual users
  duration: number; // Test duration in seconds
  rampUp?: number; // Ramp-up time in seconds
  baseUrl?: string; // Override base URL
  variables?: Record<string, string>; // Variables for each user
  thinkTime?: number; // Delay between requests (ms)
  timeout?: number; // Request timeout (ms)
}

export interface StressTestResult {
  flowName: string;
  config: {
    users: number;
    duration: number;
    rampUp: number;
  };
  summary: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    requestsPerSecond: number;
    avgResponseTime: number;
    totalDurationMs: number;
  };
  latency: {
    min: number;
    max: number;
    mean: number;
    stdDev: number;
    p50: number;
    p75: number;
    p90: number;
    p95: number;
    p99: number;
  };
  throughput: {
    requestsPerSecond: number;
    bytesPerSecond: number;
  };
  errors: {
    total: number;
    rate: number;
    byType: Record<string, number>;
    byEndpoint: Record<string, number>;
  };
  endpointBreakdown: Record<
    string,
    {
      requests: number;
      successes: number;
      failures: number;
      avgLatency: number;
      p95Latency: number;
      errRate: number;
    }
  >;
  timeline: {
    timestamp: number;
    activeUsers: number;
    requestsPerSecond: number;
    avgLatency: number;
    errorRate: number;
  }[];
}

interface RequestMetric {
  endpoint: string;
  method: string;
  latencyMs: number;
  success: boolean;
  statusCode?: number;
  error?: string;
  bytes: number;
  timestamp: number;
}

/**
 * Run stress test on a flow
 */
export async function stressTestFlow(input: StressTestInput): Promise<StressTestResult> {
  const {
    flowName,
    users,
    duration,
    rampUp = 5,
    baseUrl: overrideBaseUrl,
    variables: overrideVariables = {},
    thinkTime = 0,
    timeout = 30000,
  } = input;

  // Load flow
  const flow = await loadFlow(flowName);
  const baseUrl = overrideBaseUrl || flow.baseUrl;

  console.error(`Starting stress test: ${users} users, ${duration}s duration`);
  console.error(`Target: ${baseUrl}`);

  // Track metrics
  const metrics: RequestMetric[] = [];
  const startTime = Date.now();
  const endTime = startTime + duration * 1000;

  // Calculate user spawn intervals for ramp-up
  const userSpawnInterval = rampUp > 0 ? (rampUp * 1000) / users : 0;

  // Active user tracking
  const activeUsers = new Map<number, { cancel: boolean }>();

  // Spawn users progressively
  const userPromises: Promise<void>[] = [];

  for (let i = 0; i < users; i++) {
    const userDelay = userSpawnInterval * i;
    const userControl = { cancel: false };
    activeUsers.set(i, userControl);

    userPromises.push(
      runVirtualUser(
        i,
        flow,
        baseUrl,
        { ...flow.variables, ...overrideVariables },
        metrics,
        startTime + userDelay,
        endTime,
        thinkTime,
        timeout,
        userControl
      )
    );
  }

  // Progress reporting
  const progressInterval = setInterval(() => {
    const elapsed = (Date.now() - startTime) / 1000;
    const recentMetrics = metrics.filter((m) => m.timestamp > Date.now() - 1000);
    const rps = recentMetrics.length;
    console.error(`[${round(elapsed, 1)}s] Users: ${activeUsers.size}, RPS: ${rps}, Total: ${metrics.length}`);
  }, 2000);

  // Wait for test completion
  await Promise.all(userPromises);
  clearInterval(progressInterval);

  console.error(`Test completed. Analyzing ${metrics.length} requests...`);

  // Calculate results
  return analyzeMetrics(flowName, users, duration, rampUp, metrics);
}

/**
 * Run a virtual user executing the flow repeatedly
 */
async function runVirtualUser(
  userId: number,
  flow: Flow,
  baseUrl: string,
  baseVariables: Record<string, string>,
  metrics: RequestMetric[],
  userStartTime: number,
  endTime: number,
  thinkTime: number,
  timeout: number,
  control: { cancel: boolean }
): Promise<void> {
  // Wait for ramp-up
  const now = Date.now();
  if (userStartTime > now) {
    await sleep(userStartTime - now);
  }

  // Run flow repeatedly until end time
  while (Date.now() < endTime && !control.cancel) {
    // Each iteration gets fresh variables
    const variables = { ...baseVariables };

    for (const request of flow.requests) {
      if (Date.now() >= endTime || control.cancel) break;

      // Substitute variables
      const path = substituteInObject(request.path, variables);
      const fullUrl = buildUrl(baseUrl, path);
      const headers = substituteInObject(request.headers, variables);
      const body = request.body ? substituteInObject(request.body, variables) : undefined;

      // Make request
      const requestStart = Date.now();
      const result = await httpRequest({
        method: request.method,
        url: fullUrl,
        headers,
        body,
        timeoutMs: timeout,
      });

      const metric: RequestMetric = {
        endpoint: `${request.method} ${request.path}`,
        method: request.method,
        latencyMs: result.success ? result.response.latencyMs : result.error.latencyMs,
        success: result.success,
        bytes: 0,
        timestamp: requestStart,
      };

      if (result.success) {
        metric.statusCode = result.response.status;
        metric.bytes = result.response.body.length;
        metric.success = result.response.status >= 200 && result.response.status < 400;

        // Capture variables
        if (request.captureResponse && result.response.json) {
          const captured = captureFromResponse(result.response.json, request.captureResponse);
          Object.assign(variables, captured);
        }
      } else {
        metric.error = result.error.type;
      }

      metrics.push(metric);

      // Think time between requests
      if (thinkTime > 0) {
        await sleep(thinkTime);
      }
    }
  }
}

/**
 * Analyze collected metrics
 */
function analyzeMetrics(
  flowName: string,
  users: number,
  duration: number,
  rampUp: number,
  metrics: RequestMetric[]
): StressTestResult {
  if (metrics.length === 0) {
    return {
      flowName,
      config: { users, duration, rampUp },
      summary: {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        requestsPerSecond: 0,
        avgResponseTime: 0,
        totalDurationMs: 0,
      },
      latency: {
        min: 0, max: 0, mean: 0, stdDev: 0,
        p50: 0, p75: 0, p90: 0, p95: 0, p99: 0,
      },
      throughput: { requestsPerSecond: 0, bytesPerSecond: 0 },
      errors: { total: 0, rate: 0, byType: {}, byEndpoint: {} },
      endpointBreakdown: {},
      timeline: [],
    };
  }

  const latencies = metrics.map((m) => m.latencyMs);
  const sortedLatencies = [...latencies].sort((a, b) => a - b);

  const successful = metrics.filter((m) => m.success);
  const failed = metrics.filter((m) => !m.success);

  const totalBytes = successful.reduce((sum, m) => sum + m.bytes, 0);
  const minTimestamp = Math.min(...metrics.map((m) => m.timestamp));
  const maxTimestamp = Math.max(...metrics.map((m) => m.timestamp));
  const totalDurationMs = maxTimestamp - minTimestamp || 1;

  // Error breakdown
  const errorsByType: Record<string, number> = {};
  const errorsByEndpoint: Record<string, number> = {};

  for (const m of failed) {
    const errorType = m.error || 'unknown';
    errorsByType[errorType] = (errorsByType[errorType] || 0) + 1;
    errorsByEndpoint[m.endpoint] = (errorsByEndpoint[m.endpoint] || 0) + 1;
  }

  // Endpoint breakdown
  const endpointMetrics = new Map<string, RequestMetric[]>();
  for (const m of metrics) {
    if (!endpointMetrics.has(m.endpoint)) {
      endpointMetrics.set(m.endpoint, []);
    }
    endpointMetrics.get(m.endpoint)!.push(m);
  }

  const endpointBreakdown: Record<
    string,
    {
      requests: number;
      successes: number;
      failures: number;
      avgLatency: number;
      p95Latency: number;
      errRate: number;
    }
  > = {};

  for (const [endpoint, ems] of endpointMetrics) {
    const endpointSuccesses = ems.filter((m) => m.success);
    const endpointLatencies = ems.map((m) => m.latencyMs).sort((a, b) => a - b);

    endpointBreakdown[endpoint] = {
      requests: ems.length,
      successes: endpointSuccesses.length,
      failures: ems.length - endpointSuccesses.length,
      avgLatency: round(mean(endpointLatencies), 2),
      p95Latency: round(percentile(endpointLatencies, 95), 2),
      errRate: round(((ems.length - endpointSuccesses.length) / ems.length) * 100, 2),
    };
  }

  // Timeline (1-second buckets)
  const timeline: {
    timestamp: number;
    activeUsers: number;
    requestsPerSecond: number;
    avgLatency: number;
    errorRate: number;
  }[] = [];

  const bucketSize = 1000; // 1 second
  for (let t = minTimestamp; t < maxTimestamp; t += bucketSize) {
    const bucketMetrics = metrics.filter(
      (m) => m.timestamp >= t && m.timestamp < t + bucketSize
    );

    if (bucketMetrics.length > 0) {
      const bucketLatencies = bucketMetrics.map((m) => m.latencyMs);
      const bucketErrors = bucketMetrics.filter((m) => !m.success).length;

      timeline.push({
        timestamp: t - minTimestamp,
        activeUsers: users, // Simplified - would need better tracking for actual active users
        requestsPerSecond: bucketMetrics.length,
        avgLatency: round(mean(bucketLatencies), 2),
        errorRate: round((bucketErrors / bucketMetrics.length) * 100, 2),
      });
    }
  }

  return {
    flowName,
    config: { users, duration, rampUp },
    summary: {
      totalRequests: metrics.length,
      successfulRequests: successful.length,
      failedRequests: failed.length,
      requestsPerSecond: round((metrics.length / totalDurationMs) * 1000, 2),
      avgResponseTime: round(mean(latencies), 2),
      totalDurationMs,
    },
    latency: {
      min: round(sortedLatencies[0], 2),
      max: round(sortedLatencies[sortedLatencies.length - 1], 2),
      mean: round(mean(latencies), 2),
      stdDev: round(stdDev(latencies), 2),
      p50: round(percentile(sortedLatencies, 50), 2),
      p75: round(percentile(sortedLatencies, 75), 2),
      p90: round(percentile(sortedLatencies, 90), 2),
      p95: round(percentile(sortedLatencies, 95), 2),
      p99: round(percentile(sortedLatencies, 99), 2),
    },
    throughput: {
      requestsPerSecond: round((metrics.length / totalDurationMs) * 1000, 2),
      bytesPerSecond: round((totalBytes / totalDurationMs) * 1000, 2),
    },
    errors: {
      total: failed.length,
      rate: round((failed.length / metrics.length) * 100, 2),
      byType: errorsByType,
      byEndpoint: errorsByEndpoint,
    },
    endpointBreakdown,
    timeline,
  };
}

/**
 * Quick load test on a single endpoint
 */
export async function quickLoadTest(input: {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  users: number;
  duration: number;
  rampUp?: number;
}): Promise<StressTestResult> {
  const {
    url,
    method = 'GET',
    headers = {},
    body,
    users,
    duration,
    rampUp = 3,
  } = input;

  // Parse URL
  const parsedUrl = new URL(url);
  const baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;
  const path = parsedUrl.pathname + parsedUrl.search;

  // Create temporary flow
  const tempFlow: Flow = {
    version: '1.0',
    name: '_temp_load_test',
    recorded: new Date().toISOString(),
    baseUrl,
    requests: [
      {
        id: 1,
        timestamp: 0,
        method,
        path,
        headers,
        body,
      },
    ],
    variables: {},
  };

  console.error(`Quick load test: ${users} users, ${duration}s`);

  // Run test inline
  const metrics: RequestMetric[] = [];
  const startTime = Date.now();
  const endTime = startTime + duration * 1000;
  const userSpawnInterval = rampUp > 0 ? (rampUp * 1000) / users : 0;

  const userPromises: Promise<void>[] = [];

  for (let i = 0; i < users; i++) {
    const userDelay = userSpawnInterval * i;
    const userControl = { cancel: false };

    userPromises.push(
      runVirtualUser(
        i,
        tempFlow,
        baseUrl,
        {},
        metrics,
        startTime + userDelay,
        endTime,
        0,
        30000,
        userControl
      )
    );
  }

  await Promise.all(userPromises);

  return analyzeMetrics('_quick_load_test', users, duration, rampUp, metrics);
}

/**
 * Helper: sleep for ms
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
