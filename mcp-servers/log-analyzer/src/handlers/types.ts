// SPDX-License-Identifier: MIT
/**
 * Shared types and schemas for log analyzer handlers
 */

import { z } from "zod";

/**
 * Handler result compatible with MCP SDK
 */
export interface HandlerResult {
  [key: string]: unknown;
  content: Array<{
    type: "text";
    text: string;
  }>;
  isError?: boolean;
}

/**
 * Handler function signature
 */
export type Handler = (args: unknown) => Promise<HandlerResult>;

// ============ Shared Enums ============

export const LogFormatEnum = z.enum([
  'spring-boot', 'log4j', 'logback', 'winston', 'pino',
  'morgan', 'python', 'json', 'clf', 'nginx', 'apache',
  'kubernetes', 'syslog', 'auto'
]);

export const LogLevelEnum = z.enum(['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL']);

export type LogFormat = z.infer<typeof LogFormatEnum>;
export type LogLevel = z.infer<typeof LogLevelEnum>;

// ============ Input Schemas ============

export const ParseLogsSchema = z.object({
  filePath: z.string().describe("Absolute path to the log file"),
  format: LogFormatEnum.optional().default('auto').describe("Log format (auto-detected if not specified)"),
  startTime: z.string().optional().describe("Filter logs after this time (ISO format)"),
  endTime: z.string().optional().describe("Filter logs before this time (ISO format)"),
  levels: z.array(LogLevelEnum).optional().describe("Filter by log levels"),
  limit: z.number().optional().default(1000).describe("Maximum entries to return"),
  offset: z.number().optional().default(0).describe("Skip first N entries"),
  filter: z.string().optional().describe("Regex pattern to filter messages"),
});

export const FindErrorsSchema = z.object({
  filePath: z.string().describe("Absolute path to the log file"),
  format: LogFormatEnum.optional().default('auto'),
  includeWarnings: z.boolean().optional().default(false).describe("Include warnings in results"),
  limit: z.number().optional().default(100).describe("Maximum recent errors to return"),
  groupByException: z.boolean().optional().default(true).describe("Group errors by exception type"),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
});

export const AnalyzePatternsSchema = z.object({
  filePath: z.string().describe("Absolute path to the log file"),
  format: LogFormatEnum.optional().default('auto'),
  minOccurrences: z.number().optional().default(2).describe("Minimum occurrences to report"),
  timeWindow: z.number().optional().describe("Time window in minutes for pattern detection"),
});

export const AggregateStatsSchema = z.object({
  filePath: z.string().describe("Absolute path to the log file"),
  format: LogFormatEnum.optional().default('auto'),
  groupBy: z.enum(['hour', 'minute', 'day']).optional().default('hour'),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
});

export const CorrelateEventsSchema = z.object({
  filePaths: z.array(z.string()).describe("Array of log file paths to correlate"),
  correlationField: z.enum(['requestId', 'traceId', 'sessionId', 'userId', 'custom'])
    .describe("Field to use for correlation"),
  customField: z.string().optional().describe("Custom field name if correlationField is 'custom'"),
  targetValue: z.string().optional().describe("Specific correlation value to search for"),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
});

export const TailLogsSchema = z.object({
  filePath: z.string().describe("Absolute path to the log file"),
  format: LogFormatEnum.optional().default('auto'),
  lines: z.number().optional().default(50).describe("Number of lines to return"),
  filter: z.string().optional().describe("Regex pattern to filter"),
  levels: z.array(LogLevelEnum).optional(),
});

export const SearchLogsSchema = z.object({
  filePaths: z.array(z.string()).describe("Array of log file paths to search"),
  query: z.string().describe("Search query (text or regex pattern)"),
  caseSensitive: z.boolean().optional().default(false).describe("Case-sensitive search"),
  useRegex: z.boolean().optional().default(false).describe("Interpret query as regex"),
  context: z.number().optional().default(0).describe("Lines of context around each match"),
  limit: z.number().optional().default(100).describe("Maximum matches to return"),
  format: LogFormatEnum.optional().default('auto'),
});

export const CompareLogsSchema = z.object({
  baselineFile: z.string().describe("Path to baseline log file"),
  comparisonFile: z.string().describe("Path to comparison log file"),
  format: LogFormatEnum.optional().default('auto'),
  compareBy: z.enum(['level', 'pattern', 'time']).optional().default('level')
    .describe("Comparison method: by level distribution, patterns, or time"),
});

export const ExportReportSchema = z.object({
  filePath: z.string().describe("Path to log file to analyze"),
  format: LogFormatEnum.optional().default('auto'),
  outputFormat: z.enum(['html', 'json', 'markdown']).describe("Output format"),
  outputPath: z.string().optional().describe("Output file path (defaults to input file path with new extension)"),
  includeCharts: z.boolean().optional().default(true).describe("Include ASCII charts in report"),
  title: z.string().optional().describe("Report title"),
});

export const WatchLogsSchema = z.object({
  action: z.enum(['start', 'status', 'stop', 'list']).describe("Action to perform"),
  filePath: z.string().optional().describe("Path to log file (required for start/status/stop)"),
  format: LogFormatEnum.optional().default('auto'),
  filter: z.string().optional().describe("Regex pattern to filter log entries"),
  levels: z.array(LogLevelEnum).optional().describe("Filter by log levels"),
  alertPatterns: z.array(z.string()).optional().describe("Regex patterns that trigger alerts"),
  alertLevels: z.array(LogLevelEnum).optional().default(['ERROR', 'FATAL']).describe("Log levels that trigger alerts"),
  pollInterval: z.number().optional().default(1000).describe("Polling interval in ms"),
  maxEntries: z.number().optional().default(1000).describe("Max entries to keep in memory"),
});

// ============ Helper Functions ============

/**
 * Create a standard JSON response
 */
export function jsonResponse(data: unknown): HandlerResult {
  return {
    content: [{
      type: "text",
      text: JSON.stringify(data, null, 2),
    }],
  };
}

/**
 * Create an error response
 */
export function errorResponse(message: string, toolName?: string): HandlerResult {
  return {
    content: [{
      type: "text",
      text: JSON.stringify({ error: message, tool: toolName }),
    }],
    isError: true,
  };
}
