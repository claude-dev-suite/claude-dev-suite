// SPDX-License-Identifier: MIT
/**
 * Handler for list_java_processes tool
 */

import { jsonResponse, type Handler, type HandlerResult } from "./types.js";
import { listJavaProcesses } from "../live/process-finder.js";

export const handleListJavaProcesses: Handler = async (_args): Promise<HandlerResult> => {
  const processes = await listJavaProcesses();

  return jsonResponse({ processes });
};
