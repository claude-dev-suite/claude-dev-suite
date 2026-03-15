// SPDX-License-Identifier: MIT
/**
 * Handler for benchmark_code tool
 */

import { BenchmarkCodeSchema, jsonResponse, type Handler, type HandlerResult } from "./types.js";
import { getProfiler } from "./utils.js";

export const handleBenchmarkCode: Handler = async (args): Promise<HandlerResult> => {
  const { code, runtime, iterations, warmup } = BenchmarkCodeSchema.parse(args);

  const profiler = getProfiler(runtime);
  const result = await profiler.benchmarkCode(code, iterations, warmup);

  return jsonResponse(result);
};
