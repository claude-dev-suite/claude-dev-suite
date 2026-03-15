// SPDX-License-Identifier: MIT
/**
 * Performance Profiler handlers registry
 */

// Type exports
export type { Handler, HandlerResult } from "./types.js";
export { jsonResponse, errorResponse } from "./types.js";

// Schema exports
export {
  ProfileScriptSchema,
  ProfileFunctionSchema,
  BenchmarkCodeSchema,
  AnalyzeMemorySchema,
  MeasureStartupSchema,
  FindBottlenecksSchema,
  AttachProfilerSchema,
  ProfileEndpointSchema,
  ImportHarSchema,
  ReplayFlowSchema,
  StressTestSchema,
} from "./types.js";

// Handler imports
import type { Handler } from "./types.js";
import { handleProfileScript } from "./profile-script.js";
import { handleProfileFunction } from "./profile-function.js";
import { handleBenchmarkCode } from "./benchmark-code.js";
import { handleAnalyzeMemory } from "./analyze-memory.js";
import { handleMeasureStartup } from "./measure-startup.js";
import { handleFindBottlenecks } from "./find-bottlenecks.js";
import { handleAttachProfiler } from "./attach-profiler.js";
import { handleProfileEndpoint } from "./profile-endpoint.js";
import { handleListJavaProcesses } from "./list-java-processes.js";
import { handleImportHar } from "./import-har.js";
import { handleListFlows } from "./list-flows.js";
import { handleReplayFlow } from "./replay-flow.js";
import { handleStressTestFlow } from "./stress-test-flow.js";

// Handler exports
export { handleProfileScript } from "./profile-script.js";
export { handleProfileFunction } from "./profile-function.js";
export { handleBenchmarkCode } from "./benchmark-code.js";
export { handleAnalyzeMemory } from "./analyze-memory.js";
export { handleMeasureStartup } from "./measure-startup.js";
export { handleFindBottlenecks } from "./find-bottlenecks.js";
export { handleAttachProfiler } from "./attach-profiler.js";
export { handleProfileEndpoint } from "./profile-endpoint.js";
export { handleListJavaProcesses } from "./list-java-processes.js";
export { handleImportHar } from "./import-har.js";
export { handleListFlows } from "./list-flows.js";
export { handleReplayFlow } from "./replay-flow.js";
export { handleStressTestFlow } from "./stress-test-flow.js";

/**
 * Handler registry - maps tool names to their handlers
 */
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
  // Flow recording
  import_har: handleImportHar,
  list_flows: handleListFlows,
  replay_flow: handleReplayFlow,
  stress_test_flow: handleStressTestFlow,
};
