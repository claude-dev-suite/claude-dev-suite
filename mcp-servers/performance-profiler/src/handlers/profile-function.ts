// SPDX-License-Identifier: MIT
/**
 * Handler for profile_function tool
 */

import { ProfileFunctionSchema, jsonResponse, type Handler, type HandlerResult } from "./types.js";
import { getProfiler } from "./utils.js";

export const handleProfileFunction: Handler = async (args): Promise<HandlerResult> => {
  const {
    modulePath,
    functionName,
    args: fnArgs,
    iterations,
    runtime,
  } = ProfileFunctionSchema.parse(args);

  const profiler = getProfiler(runtime);

  const result = await profiler.profileFunction(
    modulePath,
    functionName,
    fnArgs || [],
    iterations
  );

  return jsonResponse(result);
};
