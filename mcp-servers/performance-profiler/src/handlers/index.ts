// SPDX-License-Identifier: MIT
/**
 * Tool name → handler registry.
 */

import type { Handler } from './types.js';
import {
  handleAnalyzeMemory,
  handleAttachProfiler,
  handleBenchmarkCode,
  handleFindBottlenecks,
  handleMeasureStartup,
  handleProfileFunction,
  handleProfileScript,
} from './profiling.js';
import {
  handleImportHar,
  handleListFlows,
  handleListJavaProcesses,
  handleProfileEndpoint,
  handleReplayFlow,
  handleStressTestFlow,
} from './http.js';
import {
  handleAuditWebVitals,
  handleCompareResults,
  handleGetJob,
  handleListBaselines,
  handleListJobs,
  handleSaveBaseline,
  handleStopJob,
} from './results.js';

export type { Handler, HandlerResult } from './types.js';
export { jsonResponse, errorResponse } from './types.js';

export const handlers: Record<string, Handler> = {
  // Script profiling
  profile_script: handleProfileScript,
  profile_function: handleProfileFunction,
  benchmark_code: handleBenchmarkCode,
  analyze_memory: handleAnalyzeMemory,
  measure_startup: handleMeasureStartup,
  find_bottlenecks: handleFindBottlenecks,
  // Live profiling
  attach_profiler: handleAttachProfiler,
  profile_endpoint: handleProfileEndpoint,
  list_java_processes: handleListJavaProcesses,
  // Flows
  import_har: handleImportHar,
  list_flows: handleListFlows,
  replay_flow: handleReplayFlow,
  stress_test_flow: handleStressTestFlow,
  // Background jobs
  get_job: handleGetJob,
  stop_job: handleStopJob,
  list_jobs: handleListJobs,
  // Baselines / regression
  save_baseline: handleSaveBaseline,
  list_baselines: handleListBaselines,
  compare_results: handleCompareResults,
  // Frontend
  audit_web_vitals: handleAuditWebVitals,
};
