// SPDX-License-Identifier: MIT
/**
 * Performance Profiler Types
 * Shared interfaces for all profiling operations
 */

export type Runtime = 'nodejs' | 'java' | 'python';

// ============================================
// Profile Script Types
// ============================================

export interface ProfileScriptInput {
  scriptPath: string;
  runtime?: Runtime;
  args?: string[];
  duration?: number; // seconds, default 10
}

export interface FunctionProfile {
  name: string;
  file: string;
  line: number;
  selfTime: number; // ms
  totalTime: number; // ms
  calls: number;
  percentage: number;
}

export interface ProfileScriptResult {
  runtime: Runtime;
  scriptPath: string;
  duration: number;
  topFunctions: FunctionProfile[];
  summary: {
    totalTime: number;
    totalFunctions: number;
    samplesCollected: number;
  };
}

// ============================================
// Profile Function Types
// ============================================

export interface ProfileFunctionInput {
  modulePath: string;
  functionName: string;
  args?: unknown[];
  iterations?: number; // default 100
  runtime: Runtime;
}

export interface ProfileFunctionResult {
  functionName: string;
  iterations: number;
  timing: {
    mean: number;
    median: number;
    min: number;
    max: number;
    stdDev: number;
  };
  memory?: {
    heapUsedBefore: number;
    heapUsedAfter: number;
    delta: number;
  };
}

// ============================================
// Benchmark Code Types
// ============================================

export interface BenchmarkCodeInput {
  code: string;
  runtime: Runtime;
  iterations?: number; // default 1000
  warmup?: number; // default 100
}

export interface BenchmarkResult {
  iterations: number;
  warmupIterations: number;
  timing: {
    mean: number; // ms
    median: number;
    min: number;
    max: number;
    stdDev: number;
    opsPerSecond: number;
    percentiles: {
      p50: number;
      p90: number;
      p95: number;
      p99: number;
    };
  };
}

// ============================================
// Analyze Memory Types
// ============================================

export interface AnalyzeMemoryInput {
  scriptPath: string;
  runtime?: Runtime;
  snapshotInterval?: number; // ms, default 1000
  duration?: number; // seconds, default 10
}

export interface MemorySnapshot {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  external?: number;
  arrayBuffers?: number;
}

export interface MemoryAnalysisResult {
  runtime: Runtime;
  snapshots: MemorySnapshot[];
  summary: {
    initialHeap: number;
    finalHeap: number;
    peakHeap: number;
    avgHeap: number;
    heapGrowth: number;
    gcEvents?: number;
  };
  potentialLeaks: {
    detected: boolean;
    reason?: string;
    growthRate?: number; // bytes per second
  };
}

// ============================================
// Measure Startup Types
// ============================================

export interface MeasureStartupInput {
  scriptPath: string;
  runtime?: Runtime;
  runs?: number; // default 5
}

export interface StartupMeasurement {
  run: number;
  totalTime: number; // ms
  breakdown?: {
    parse?: number;
    compile?: number;
    initialize?: number;
  };
}

export interface StartupResult {
  runtime: Runtime;
  runs: StartupMeasurement[];
  summary: {
    avgStartup: number;
    minStartup: number;
    maxStartup: number;
    stdDev: number;
    coldStart: number; // first run
    warmStart: number; // avg of subsequent runs
  };
}

// ============================================
// Find Bottlenecks Types
// ============================================

export interface FindBottlenecksInput {
  scriptPath: string;
  runtime?: Runtime;
  threshold?: number; // percentage, default 5
}

export interface Bottleneck {
  function: string;
  file: string;
  line: number;
  selfTime: number;
  percentage: number;
  category: 'cpu' | 'memory' | 'io' | 'gc';
}

export interface Recommendation {
  issue: string;
  suggestion: string;
  priority: 'high' | 'medium' | 'low';
  relatedFunction?: string;
}

export interface BottlenecksResult {
  runtime: Runtime;
  hotspots: Bottleneck[];
  recommendations: Recommendation[];
  summary: {
    totalBottlenecks: number;
    topCategory: string;
    estimatedImpact: string;
  };
}

// ============================================
// Live Process Profiling Types
// ============================================

export interface ProcessInfo {
  pid: number;
  name: string;
  command: string;
  port?: number;
}

export interface AttachProfilerInput {
  pid?: number;
  port?: number;
  processName?: string;
  duration: number; // seconds
}

export interface AttachProfilerResult {
  process: ProcessInfo;
  duration: number;
  jfrFile?: string;
  topFunctions: FunctionProfile[];
  summary: {
    totalSamples: number;
    totalFunctions: number;
    profilingTime: number;
  };
  error?: string;
}

// ============================================
// Endpoint Profiling Types
// ============================================

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

export interface LatencyBucket {
  rangeMs: string;
  count: number;
  percentage: number;
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

// ============================================
// Flow Recording Types
// ============================================

export interface FlowRequest {
  id: number;
  timestamp: number;
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: unknown;
  captureResponse?: Record<string, string>;
}

export interface Flow {
  version: string;
  name: string;
  description?: string;
  recorded: string;
  baseUrl: string;
  requests: FlowRequest[];
  variables: Record<string, string>;
}

export interface FlowListItem {
  name: string;
  description?: string;
  recorded: string;
  requestCount: number;
  baseUrl: string;
}

export interface ImportHarInput {
  harPath: string;
  flowName: string;
  filterHost?: string;
  excludeStaticAssets?: boolean;
  excludePatterns?: string[];
}

export interface ImportHarResult {
  flowName: string;
  savedPath: string;
  totalEntries: number;
  importedRequests: number;
  skippedRequests: number;
  baseUrl: string;
  requests: Array<{
    method: string;
    path: string;
    status: number;
  }>;
}

// ============================================
// Flow Replay Types
// ============================================

export interface ReplayFlowInput {
  flowName: string;
  baseUrl?: string;
  variables?: Record<string, string>;
  respectTiming?: boolean;
  withProfiling?: boolean;
  profilingPort?: number;
  profilingPid?: number;
  stopOnError?: boolean;
  timeoutMs?: number;
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

// ============================================
// Stress Test Types
// ============================================

export interface StressTestInput {
  flowName: string;
  users: number;
  duration: number;
  rampUp?: number;
  baseUrl?: string;
  variables?: Record<string, string>;
  thinkTime?: number;
  timeout?: number;
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
  timeline: Array<{
    timestamp: number;
    activeUsers: number;
    requestsPerSecond: number;
    avgLatency: number;
    errorRate: number;
  }>;
}

// ============================================
// Utility Types
// ============================================

export interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
}

export interface ProfilerCapabilities {
  runtime: Runtime;
  cpuProfiling: boolean;
  memoryProfiling: boolean;
  heapSnapshot: boolean;
  flameGraph: boolean;
}
