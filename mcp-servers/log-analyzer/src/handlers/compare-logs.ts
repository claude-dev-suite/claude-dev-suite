// SPDX-License-Identifier: MIT
/**
 * Handler for compare_logs tool
 */

import { CompareLogsSchema, jsonResponse, type Handler, type HandlerResult } from "./types.js";
import { compareLogs } from "../analyzers/compare.js";
import { validateLogPath } from "../utils.js";

export const handleCompareLogs: Handler = async (args): Promise<HandlerResult> => {
  const input = CompareLogsSchema.parse(args);
  validateLogPath(input.baselineFile);
  validateLogPath(input.comparisonFile);
  const result = await compareLogs(input);
  return jsonResponse(result);
};
