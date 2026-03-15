// SPDX-License-Identifier: MIT
/**
 * Handler for measure_startup tool
 */

import { MeasureStartupSchema, jsonResponse, type Handler, type HandlerResult } from "./types.js";
import { getProfiler, resolveRuntime } from "./utils.js";

export const handleMeasureStartup: Handler = async (args): Promise<HandlerResult> => {
  const { scriptPath, runtime: specifiedRuntime, runs } =
    MeasureStartupSchema.parse(args);

  const runtime = await resolveRuntime(specifiedRuntime, scriptPath);
  const profiler = getProfiler(runtime);

  const result = await profiler.measureStartup(scriptPath, runs);

  return jsonResponse(result);
};
