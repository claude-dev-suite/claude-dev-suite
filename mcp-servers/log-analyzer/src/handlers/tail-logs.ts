// SPDX-License-Identifier: MIT
/**
 * Handler for tail_logs tool
 */

import { TailLogsSchema, jsonResponse, type Handler, type HandlerResult } from "./types.js";
import { parseLogFile } from "../parsers/index.js";
import { safeRegex, validateLogPath } from "../utils.js";

export const handleTailLogs: Handler = async (args): Promise<HandlerResult> => {
  const input = TailLogsSchema.parse(args);

  // Path traversal protection
  validateLogPath(input.filePath);

  // For tail, we need to read from the end
  // We'll parse with a high offset and return the last N entries
  const { format, result } = await parseLogFile(input.filePath, input.format, {
    levels: input.levels as any[],
    filter: input.filter ? safeRegex(input.filter, 'i') : undefined,
  });

  // Get last N entries
  const entries = result.entries.slice(-input.lines);

  return jsonResponse({
    filePath: input.filePath,
    format,
    totalEntries: result.entries.length,
    returnedEntries: entries.length,
    entries,
  });
};
