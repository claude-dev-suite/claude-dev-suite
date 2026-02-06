// SPDX-License-Identifier: MIT
/**
 * Handler for parse_logs tool
 */

import { ParseLogsSchema, jsonResponse, type Handler, type HandlerResult } from "./types.js";
import { parseLogFile } from "../parsers/index.js";

export const handleParseLogs: Handler = async (args): Promise<HandlerResult> => {
  const input = ParseLogsSchema.parse(args);

  const { format, result } = await parseLogFile(input.filePath, input.format, {
    startTime: input.startTime ? new Date(input.startTime) : undefined,
    endTime: input.endTime ? new Date(input.endTime) : undefined,
    levels: input.levels as any[],
    limit: input.limit,
    offset: input.offset,
    filter: input.filter ? new RegExp(input.filter, 'i') : undefined,
  });

  // Calculate time range
  let timeRange = { start: null as Date | null, end: null as Date | null };
  if (result.entries.length > 0) {
    const timestamps = result.entries.map((e) => e.timestamp);
    timeRange = {
      start: new Date(Math.min(...timestamps.map((t) => t.getTime()))),
      end: new Date(Math.max(...timestamps.map((t) => t.getTime()))),
    };
  }

  // Count by level
  const levelCounts: Record<string, number> = {
    TRACE: 0, DEBUG: 0, INFO: 0, WARN: 0, ERROR: 0, FATAL: 0,
  };
  for (const entry of result.entries) {
    levelCounts[entry.level]++;
  }

  return jsonResponse({
    filePath: input.filePath,
    format,
    totalLines: result.totalLines,
    parsedEntries: result.parsedEntries,
    failedLines: result.failedLines,
    returnedEntries: result.entries.length,
    timeRange,
    levelCounts,
    entries: result.entries.slice(0, 100), // Limit output
  });
};
