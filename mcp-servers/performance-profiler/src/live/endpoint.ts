// SPDX-License-Identifier: MIT
/**
 * HTTP Endpoint Profiler
 * Measures performance of HTTP endpoints with latency statistics
 */

import { mean, stdDev, percentile, round } from '../utils/statistics.js';

export interface EndpointProfileInput {
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: unknown;
  iterations?: number;
  concurrency?: number;
  warmupIterations?: number;
  timeoutMs?: number;
}

export interface EndpointProfileResult {
  url: string;
  method: string;
  iterations: number;
  concurrency: number;
  latency: {
    min: number;
    max: number;
    mean: number;
    median: number;
    stdDev: number;
    p50: number;
    p75: number;
    p90: number;
    p95: number;
    p99: number;
  };
  throughput: {
    requestsPerSecond: number;
    totalTimeMs: number;
  };
  statusCodes: Record<number, number>;
  errors: {
    count: number;
    types: Record<string, number>;
  };
  histogram: LatencyBucket[];
}

export interface LatencyBucket {
  rangeMs: string;
  count: number;
  percentage: number;
}

/**
 * Profile an HTTP endpoint
 */
export async function profileEndpoint(input: EndpointProfileInput): Promise<EndpointProfileResult> {
  const {
    url,
    method = 'GET',
    headers = {},
    body,
    iterations = 100,
    concurrency = 1,
    warmupIterations = 5,
    timeoutMs = 30000,
  } = input;

  // Validate URL
  try {
    new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }

  // Warmup phase
  if (warmupIterations > 0) {
    console.error(`Warming up with ${warmupIterations} requests...`);
    for (let i = 0; i < warmupIterations; i++) {
      await makeRequest(url, method, headers, body, timeoutMs);
    }
  }

  // Main profiling phase
  console.error(`Profiling ${url} with ${iterations} requests (concurrency: ${concurrency})...`);

  const latencies: number[] = [];
  const statusCodes: Record<number, number> = {};
  const errorTypes: Record<string, number> = {};
  let errorCount = 0;

  const startTime = Date.now();

  // Process in batches based on concurrency
  for (let i = 0; i < iterations; i += concurrency) {
    const batchSize = Math.min(concurrency, iterations - i);
    const batch = Array.from({ length: batchSize }, () =>
      measureRequest(url, method, headers, body, timeoutMs)
    );

    const results = await Promise.all(batch);

    for (const result of results) {
      if (result.error) {
        errorCount++;
        const errorType = result.error;
        errorTypes[errorType] = (errorTypes[errorType] || 0) + 1;
      } else {
        latencies.push(result.latencyMs);
        const status = result.statusCode || 0;
        statusCodes[status] = (statusCodes[status] || 0) + 1;
      }
    }

    // Progress indicator
    if ((i + batchSize) % 20 === 0 || i + batchSize >= iterations) {
      console.error(`Progress: ${i + batchSize}/${iterations}`);
    }
  }

  const totalTimeMs = Date.now() - startTime;

  // Calculate statistics
  if (latencies.length === 0) {
    throw new Error(`All ${iterations} requests failed. Error types: ${JSON.stringify(errorTypes)}`);
  }

  const sortedLatencies = [...latencies].sort((a, b) => a - b);

  const latencyStats = {
    min: round(sortedLatencies[0], 2),
    max: round(sortedLatencies[sortedLatencies.length - 1], 2),
    mean: round(mean(latencies), 2),
    median: round(percentile(sortedLatencies, 50), 2),
    stdDev: round(stdDev(latencies), 2),
    p50: round(percentile(sortedLatencies, 50), 2),
    p75: round(percentile(sortedLatencies, 75), 2),
    p90: round(percentile(sortedLatencies, 90), 2),
    p95: round(percentile(sortedLatencies, 95), 2),
    p99: round(percentile(sortedLatencies, 99), 2),
  };

  const throughput = {
    requestsPerSecond: round((latencies.length / totalTimeMs) * 1000, 2),
    totalTimeMs,
  };

  // Build histogram
  const histogram = buildHistogram(sortedLatencies);

  return {
    url,
    method,
    iterations,
    concurrency,
    latency: latencyStats,
    throughput,
    statusCodes,
    errors: {
      count: errorCount,
      types: errorTypes,
    },
    histogram,
  };
}

interface RequestResult {
  latencyMs: number;
  statusCode?: number;
  error?: string;
}

/**
 * Make a single HTTP request (no timing)
 */
async function makeRequest(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number
): Promise<Response | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      signal: controller.signal,
    };

    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    return response;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Make a single HTTP request and measure latency
 */
async function measureRequest(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: unknown,
  timeoutMs: number
): Promise<RequestResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const start = performance.now();

  try {
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      signal: controller.signal,
    };

    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const latencyMs = performance.now() - start;

    // Consume body to complete the request
    await response.text();

    return {
      latencyMs,
      statusCode: response.status,
    };
  } catch (error) {
    const latencyMs = performance.now() - start;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (errorMessage.includes('abort')) {
      return { latencyMs, error: 'Timeout' };
    }

    return { latencyMs, error: errorMessage };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Build latency histogram with automatic bucket sizing
 */
function buildHistogram(sortedLatencies: number[]): LatencyBucket[] {
  if (sortedLatencies.length === 0) return [];

  const min = sortedLatencies[0];
  const max = sortedLatencies[sortedLatencies.length - 1];
  const range = max - min;

  // Determine bucket size based on range
  let bucketSize: number;
  if (range <= 10) {
    bucketSize = 1;
  } else if (range <= 100) {
    bucketSize = 10;
  } else if (range <= 1000) {
    bucketSize = 50;
  } else {
    bucketSize = 100;
  }

  // Create buckets
  const buckets = new Map<number, number>();
  const bucketStart = Math.floor(min / bucketSize) * bucketSize;

  for (const latency of sortedLatencies) {
    const bucket = Math.floor(latency / bucketSize) * bucketSize;
    buckets.set(bucket, (buckets.get(bucket) || 0) + 1);
  }

  // Convert to array
  const total = sortedLatencies.length;
  const histogram: LatencyBucket[] = [];

  const sortedBuckets = [...buckets.entries()].sort((a, b) => a[0] - b[0]);

  for (const [bucket, count] of sortedBuckets) {
    histogram.push({
      rangeMs: `${bucket}-${bucket + bucketSize}ms`,
      count,
      percentage: round((count / total) * 100, 1),
    });
  }

  return histogram;
}

/**
 * Compare two endpoints
 */
export async function compareEndpoints(
  endpoint1: EndpointProfileInput,
  endpoint2: EndpointProfileInput,
  iterations: number = 50
): Promise<{
  endpoint1: EndpointProfileResult;
  endpoint2: EndpointProfileResult;
  comparison: {
    latencyDiff: {
      meanDiff: number;
      p95Diff: number;
      winner: string;
    };
    throughputDiff: {
      rpsDiff: number;
      winner: string;
    };
  };
}> {
  const result1 = await profileEndpoint({ ...endpoint1, iterations });
  const result2 = await profileEndpoint({ ...endpoint2, iterations });

  const meanDiff = result1.latency.mean - result2.latency.mean;
  const p95Diff = result1.latency.p95 - result2.latency.p95;
  const rpsDiff = result1.throughput.requestsPerSecond - result2.throughput.requestsPerSecond;

  return {
    endpoint1: result1,
    endpoint2: result2,
    comparison: {
      latencyDiff: {
        meanDiff: round(meanDiff, 2),
        p95Diff: round(p95Diff, 2),
        winner: meanDiff < 0 ? endpoint1.url : endpoint2.url,
      },
      throughputDiff: {
        rpsDiff: round(rpsDiff, 2),
        winner: rpsDiff > 0 ? endpoint1.url : endpoint2.url,
      },
    },
  };
}
