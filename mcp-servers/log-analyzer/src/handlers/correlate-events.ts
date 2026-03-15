// SPDX-License-Identifier: MIT
/**
 * Handler for correlate_events tool
 */

import { CorrelateEventsSchema, jsonResponse, type Handler, type HandlerResult } from "./types.js";
import { correlateEvents } from "../analyzers/correlate.js";
import { validateLogPath } from "../utils.js";

export const handleCorrelateEvents: Handler = async (args): Promise<HandlerResult> => {
  const input = CorrelateEventsSchema.parse(args);
  for (const filePath of input.filePaths) {
    validateLogPath(filePath);
  }
  const result = await correlateEvents(input);
  return jsonResponse(result);
};
