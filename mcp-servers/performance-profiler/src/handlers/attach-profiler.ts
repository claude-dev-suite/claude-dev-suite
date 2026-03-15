// SPDX-License-Identifier: MIT
/**
 * Handler for attach_profiler tool
 */

import { AttachProfilerSchema, jsonResponse, type Handler, type HandlerResult } from "./types.js";
import { attachAndFindBottlenecks } from "../live/attach.js";

export const handleAttachProfiler: Handler = async (args): Promise<HandlerResult> => {
  const { pid, port, processName, duration } = AttachProfilerSchema.parse(args);

  const result = await attachAndFindBottlenecks({
    pid,
    port,
    processName,
    duration,
  });

  return jsonResponse(result);
};
