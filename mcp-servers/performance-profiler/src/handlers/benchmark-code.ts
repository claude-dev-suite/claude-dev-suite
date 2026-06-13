// SPDX-License-Identifier: MIT
/**
 * Handler for benchmark_code tool
 */

import { BenchmarkCodeSchema, jsonResponse, type Handler, type HandlerResult } from "./types.js";
import { getProfiler } from "./utils.js";

export const handleBenchmarkCode: Handler = async (args): Promise<HandlerResult> => {
  const { scriptPath, code, runtime, iterations, warmup } = BenchmarkCodeSchema.parse(args);

  const profiler = getProfiler(runtime);

  if (scriptPath !== undefined) {
    // Safe path: benchmark an existing file
    const result = await profiler.benchmarkCode(scriptPath, iterations, warmup, true);
    return jsonResponse(result);
  }

  // Raw-code path: gated behind PERF_PROFILER_ALLOW_RAW_CODE=1
  const result = await profiler.benchmarkCode(code as string, iterations, warmup, false);
  return jsonResponse(result);
};
