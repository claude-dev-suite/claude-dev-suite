// SPDX-License-Identifier: MIT
/**
 * Handler for find_bottlenecks tool
 */

import { FindBottlenecksSchema, jsonResponse, type Handler, type HandlerResult } from "./types.js";
import { getProfiler, resolveRuntime } from "./utils.js";

export const handleFindBottlenecks: Handler = async (args): Promise<HandlerResult> => {
  const { scriptPath, runtime: specifiedRuntime, threshold } =
    FindBottlenecksSchema.parse(args);

  const runtime = await resolveRuntime(specifiedRuntime, scriptPath);
  const profiler = getProfiler(runtime);

  const result = await profiler.findBottlenecks(scriptPath, threshold);

  return jsonResponse(result);
};
