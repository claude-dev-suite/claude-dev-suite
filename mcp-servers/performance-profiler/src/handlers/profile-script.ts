// SPDX-License-Identifier: MIT
/**
 * Handler for profile_script tool
 */

import { ProfileScriptSchema, jsonResponse, type Handler, type HandlerResult } from "./types.js";
import { getProfiler, resolveRuntime } from "./utils.js";

export const handleProfileScript: Handler = async (args): Promise<HandlerResult> => {
  const { scriptPath, runtime: specifiedRuntime, args: scriptArgs, duration } =
    ProfileScriptSchema.parse(args);

  const runtime = await resolveRuntime(specifiedRuntime, scriptPath);
  const profiler = getProfiler(runtime);

  const result = await profiler.profileScript(
    scriptPath,
    scriptArgs || [],
    duration
  );

  return jsonResponse(result);
};
