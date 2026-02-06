// SPDX-License-Identifier: MIT
/**
 * Handler for analyze_memory tool
 */

import { AnalyzeMemorySchema, jsonResponse, type Handler, type HandlerResult } from "./types.js";
import { getProfiler, resolveRuntime } from "./utils.js";

export const handleAnalyzeMemory: Handler = async (args): Promise<HandlerResult> => {
  const {
    scriptPath,
    runtime: specifiedRuntime,
    snapshotInterval,
    duration,
  } = AnalyzeMemorySchema.parse(args);

  const runtime = await resolveRuntime(specifiedRuntime, scriptPath);
  const profiler = getProfiler(runtime);

  const result = await profiler.analyzeMemory(
    scriptPath,
    snapshotInterval,
    duration
  );

  return jsonResponse(result);
};
