// SPDX-License-Identifier: MIT
/**
 * Handler for search_logs tool
 */

import { SearchLogsSchema, jsonResponse, type Handler, type HandlerResult } from "./types.js";
import { searchLogs } from "../analyzers/search.js";

export const handleSearchLogs: Handler = async (args): Promise<HandlerResult> => {
  const input = SearchLogsSchema.parse(args);
  const result = await searchLogs(input);
  return jsonResponse(result);
};
