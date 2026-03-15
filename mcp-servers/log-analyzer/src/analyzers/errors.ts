// SPDX-License-Identifier: MIT
/**
 * Error Finder
 * Finds and groups errors/exceptions in log files
 */

import { parseLogFile } from '../parsers/index.js';
import type {
  LogFormat,
  LogEntry,
  FindErrorsInput,
  FindErrorsResult,
  ErrorGroup,
} from '../types.js';

/**
 * Find errors in a log file
 */
export async function findErrors(input: FindErrorsInput): Promise<FindErrorsResult> {
  const {
    filePath,
    format = 'auto',
    includeWarnings = false,
    limit = 100,
    groupByException = true,
    startTime,
    endTime,
  } = input;

  // Parse the log file
  const levels = includeWarnings ? ['ERROR', 'FATAL', 'WARN'] : ['ERROR', 'FATAL'];

  const { result } = await parseLogFile(filePath, format as LogFormat, {
    levels: levels as any[],
    startTime: startTime ? new Date(startTime) : undefined,
    endTime: endTime ? new Date(endTime) : undefined,
  });

  const errors = result.entries.filter((e) => e.level === 'ERROR' || e.level === 'FATAL');
  const warnings = result.entries.filter((e) => e.level === 'WARN');

  // Group errors by exception type
  const errorGroups: ErrorGroup[] = [];

  if (groupByException) {
    const groupMap = new Map<string, {
      entries: LogEntry[];
      exceptionType: string;
      message: string;
      stackTrace: string[];
    }>();

    for (const entry of errors) {
      const key = getGroupKey(entry);
      const existing = groupMap.get(key);

      if (existing) {
        existing.entries.push(entry);
      } else {
        groupMap.set(key, {
          entries: [entry],
          exceptionType: entry.exception?.type || 'Unknown',
          message: entry.exception?.message || entry.message,
          stackTrace: entry.exception?.stackTrace || entry.stackTrace || [],
        });
      }
    }

    for (const [, group] of groupMap) {
      const timestamps = group.entries.map((e) => e.timestamp);

      errorGroups.push({
        exceptionType: group.exceptionType,
        message: group.message,
        count: group.entries.length,
        firstOccurrence: new Date(Math.min(...timestamps.map((t) => t.getTime()))),
        lastOccurrence: new Date(Math.max(...timestamps.map((t) => t.getTime()))),
        stackTrace: group.stackTrace,
        examples: group.entries.slice(0, 3),
      });
    }

    // Sort by count descending
    errorGroups.sort((a, b) => b.count - a.count);
  }

  // Get recent errors
  const recentErrors = [...errors]
    .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    .slice(0, limit);

  // Build error timeline
  const errorTimeline = buildTimeline(errors);

  return {
    filePath,
    totalErrors: errors.length,
    totalWarnings: warnings.length,
    errorGroups: errorGroups.slice(0, 50),
    recentErrors,
    errorTimeline,
  };
}

/**
 * Get grouping key for an error entry
 */
function getGroupKey(entry: LogEntry): string {
  if (entry.exception) {
    // Group by exception type + first line of message
    const msgPart = entry.exception.message.split('\n')[0].slice(0, 100);
    return `${entry.exception.type}:${msgPart}`;
  }

  // Group by message pattern (remove variable parts)
  const normalizedMessage = normalizeMessage(entry.message);
  return normalizedMessage;
}

/**
 * Normalize a message by removing variable parts
 */
function normalizeMessage(message: string): string {
  return message
    // Remove UUIDs
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>')
    // Remove numbers
    .replace(/\d+/g, '<N>')
    // Remove quoted strings
    .replace(/"[^"]+"/g, '"<STR>"')
    .replace(/'[^']+'/g, "'<STR>'")
    // Remove IP addresses
    .replace(/\d+\.\d+\.\d+\.\d+/g, '<IP>')
    // Remove timestamps
    .replace(/\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}/g, '<TIMESTAMP>')
    // Truncate
    .slice(0, 150);
}

/**
 * Build hourly error timeline
 */
function buildTimeline(errors: LogEntry[]): { hour: string; count: number }[] {
  const hourCounts = new Map<string, number>();

  for (const error of errors) {
    const hour = error.timestamp.toISOString().slice(0, 13) + ':00';
    hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
  }

  return [...hourCounts.entries()]
    .map(([hour, count]) => ({ hour, count }))
    .sort((a, b) => a.hour.localeCompare(b.hour));
}

/**
 * Find similar errors across multiple files
 */
export async function findSimilarErrors(
  filePaths: string[],
  format: LogFormat = 'auto'
): Promise<{
  totalErrors: number;
  commonErrors: Array<{
    pattern: string;
    files: string[];
    totalCount: number;
  }>;
}> {
  const allErrors: Array<{ file: string; entry: LogEntry }> = [];

  for (const filePath of filePaths) {
    const result = await findErrors({ filePath, format });
    for (const entry of result.recentErrors) {
      allErrors.push({ file: filePath, entry });
    }
  }

  // Group by normalized message
  const patterns = new Map<string, { files: Set<string>; count: number }>();

  for (const { file, entry } of allErrors) {
    const pattern = normalizeMessage(entry.message);
    const existing = patterns.get(pattern);

    if (existing) {
      existing.files.add(file);
      existing.count++;
    } else {
      patterns.set(pattern, { files: new Set([file]), count: 1 });
    }
  }

  // Find patterns that appear in multiple files
  const commonErrors = [...patterns.entries()]
    .filter(([, data]) => data.files.size > 1)
    .map(([pattern, data]) => ({
      pattern,
      files: [...data.files],
      totalCount: data.count,
    }))
    .sort((a, b) => b.totalCount - a.totalCount);

  return {
    totalErrors: allErrors.length,
    commonErrors,
  };
}
