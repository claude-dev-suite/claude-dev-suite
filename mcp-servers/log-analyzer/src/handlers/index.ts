// SPDX-License-Identifier: MIT
/**
 * Tool handlers: Zod validation of arguments, then the analyzer call.
 * Every result is redacted (secrets in URLs, tokens, passwords) before it is
 * returned, and oversized results are refused rather than silently cut.
 */

import { z } from 'zod';
import type { LiveSource, LogFormat, LogLevel, SourceInput, EntryFilter } from '../types.js';
import { LOG_FORMATS, LOG_LEVELS } from '../types.js';
import { parseTimeBound } from '../core/timestamp.js';
import { assertReadable, redactDeep, safeRegex, validateLogPath } from '../utils.js';
import type { PipelineDeps } from '../pipeline/index.js';
import { parseLogs, tailLogs, MAX_PAGE } from '../analyzers/parse.js';
import { findErrors } from '../analyzers/errors.js';
import { analyzePatterns } from '../analyzers/patterns.js';
import { aggregateStats } from '../analyzers/stats.js';
import { correlateEvents } from '../analyzers/correlate.js';
import { searchLogs } from '../analyzers/search.js';
import { compareLogs } from '../analyzers/compare.js';
import { exportReport } from '../analyzers/report.js';
import { watchLogs, getWatcher, stopWatching, listActiveWatchers } from '../analyzers/watch.js';
import { MAX_TAIL, MAX_TIMEOUT_S } from '../sources/live.js';

export interface HandlerResult {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export type Handler = (args: unknown, deps?: PipelineDeps) => Promise<HandlerResult>;

/** Largest JSON text a tool returns; beyond this the caller must narrow the request. */
const MAX_RESULT_CHARS = 3 * 1024 * 1024;

export function jsonResponse(data: unknown): HandlerResult {
  const text = JSON.stringify(redactDeep(data), null, 2);
  if (text.length > MAX_RESULT_CHARS) {
    throw new Error(`Result is ${text.length} characters, over the ${MAX_RESULT_CHARS} limit — lower limit/lines or narrow the time range`);
  }
  return { content: [{ type: 'text', text }] };
}

export function errorResponse(message: string, toolName?: string): HandlerResult {
  return { content: [{ type: 'text', text: JSON.stringify({ error: message, tool: toolName }) }], isError: true };
}

// ---------------------------------------------------------------- schemas

export const LogFormatEnum = z.enum(LOG_FORMATS);
export const LogLevelEnum = z.enum(LOG_LEVELS as [LogLevel, ...LogLevel[]]);

export const LiveSourceSchema = z.object({
  type: z.enum(['docker', 'compose', 'kubectl', 'journald']),
  container: z.string().max(253).optional(),
  projectDir: z.string().max(4096).optional(),
  composeFile: z.string().max(4096).optional(),
  services: z.array(z.string().max(253)).max(50).optional(),
  namespace: z.string().max(253).optional(),
  context: z.string().max(253).optional(),
  pod: z.string().max(253).optional(),
  deployment: z.string().max(253).optional(),
  selector: z.string().max(500).optional(),
  allContainers: z.boolean().optional(),
  previous: z.boolean().optional(),
  unit: z.string().max(253).optional(),
  since: z.string().max(64).optional(),
  tail: z.number().int().positive().max(MAX_TAIL).optional(),
  timeoutSeconds: z.number().positive().max(MAX_TIMEOUT_S).optional(),
}).strict();

const sourceFields = {
  filePath: z.string().max(4096).optional(),
  filePaths: z.array(z.string().max(4096)).max(100).optional(),
  source: z.union([LiveSourceSchema, z.array(LiveSourceSchema).max(10)]).optional(),
  format: LogFormatEnum.optional().default('auto'),
  customPattern: z.string().max(500).optional(),
};

const timeFields = {
  startTime: z.string().max(64).optional(),
  endTime: z.string().max(64).optional(),
};

type SourceArgs = {
  filePath?: string; filePaths?: string[]; source?: LiveSource | LiveSource[];
  format?: LogFormat; customPattern?: string;
};

export function toSourceInput(a: SourceArgs): SourceInput {
  const paths = [...(a.filePath ? [a.filePath] : []), ...(a.filePaths ?? [])];
  if (paths.length === 0 && !a.source) {
    throw new Error('Provide filePath / filePaths (file, directory or glob) or a live source');
  }
  // Glob roots are validated during expansion; plain paths here.
  for (const p of paths) if (!/[*?{[]/.test(p)) validateLogPath(p);
  if (a.format === 'custom' && !a.customPattern) throw new Error('format "custom" requires customPattern');
  return { paths, source: a.source, format: a.format, customPattern: a.customPattern };
}

function timeFilter(a: { startTime?: string; endTime?: string }): Pick<EntryFilter, 'startTime' | 'endTime'> {
  const startTime = parseTimeBound(a.startTime);
  const endTime = parseTimeBound(a.endTime);
  if (startTime && endTime && startTime > endTime) throw new Error('startTime is after endTime');
  return { startTime, endTime };
}

const ParseLogsSchema = z.object({
  ...sourceFields, ...timeFields,
  levels: z.array(LogLevelEnum).optional(),
  limit: z.number().int().positive().max(MAX_PAGE).optional().default(100),
  offset: z.number().int().min(0).optional().default(0),
  filter: z.string().max(500).optional(),
  includeRaw: z.boolean().optional().default(false),
});

const FindErrorsSchema = z.object({
  ...sourceFields, ...timeFields,
  includeWarnings: z.boolean().optional().default(false),
  limit: z.number().int().positive().max(200).optional().default(20),
  groupLimit: z.number().int().positive().max(500).optional().default(50),
  groupByException: z.boolean().optional().default(true),
  baselineFile: z.string().max(4096).optional(),
  baselinePaths: z.array(z.string().max(4096)).max(100).optional(),
  baselineStartTime: z.string().max(64).optional(),
  baselineEndTime: z.string().max(64).optional(),
  saveBaselineTo: z.string().max(4096).optional(),
  overwrite: z.boolean().optional().default(false),
});

const AnalyzePatternsSchema = z.object({
  ...sourceFields, ...timeFields,
  minOccurrences: z.number().int().positive().optional().default(2),
  timeWindow: z.number().positive().max(10080).optional(),
});

const AggregateStatsSchema = z.object({
  ...sourceFields, ...timeFields,
  groupBy: z.enum(['minute', 'hour', 'day']).optional().default('hour'),
});

const CorrelateEventsSchema = z.object({
  ...sourceFields, ...timeFields,
  correlationField: z.enum(['requestId', 'traceId', 'spanId', 'sessionId', 'userId', 'custom']),
  customField: z.string().max(200).optional(),
  targetValue: z.string().max(500).optional(),
  limit: z.number().int().positive().max(200).optional().default(20),
  eventsPerChain: z.number().int().positive().max(200).optional().default(20),
});

const TailLogsSchema = z.object({
  ...sourceFields,
  lines: z.number().int().positive().max(MAX_PAGE).optional().default(50),
  filter: z.string().max(500).optional(),
  levels: z.array(LogLevelEnum).optional(),
});

const SearchLogsSchema = z.object({
  ...sourceFields,
  query: z.string().min(1).max(500),
  caseSensitive: z.boolean().optional().default(false),
  useRegex: z.boolean().optional().default(false),
  invert: z.boolean().optional().default(false),
  context: z.number().int().min(0).max(20).optional().default(0),
  limit: z.number().int().positive().max(1000).optional().default(100),
});

const CompareLogsSchema = z.object({
  baselineFile: z.string().max(4096),
  comparisonFile: z.string().max(4096),
  format: LogFormatEnum.optional().default('auto'),
  customPattern: z.string().max(500).optional(),
  compareBy: z.enum(['level', 'pattern', 'time', 'errors', 'templates']).optional().default('level'),
});

const ExportReportSchema = z.object({
  ...sourceFields, ...timeFields,
  outputFormat: z.enum(['html', 'json', 'markdown']),
  outputPath: z.string().max(4096).optional(),
  includeCharts: z.boolean().optional().default(true),
  title: z.string().max(300).optional(),
  overwrite: z.boolean().optional().default(false),
});

const AlertRuleSchema = z.object({
  name: z.string().max(100).optional(),
  pattern: z.string().max(500).optional(),
  levels: z.array(LogLevelEnum).optional(),
  threshold: z.number().int().positive().max(100000).optional(),
  windowSeconds: z.number().positive().max(86400).optional(),
}).strict();

const WatchLogsSchema = z.object({
  action: z.enum(['start', 'status', 'stop', 'list']),
  filePath: z.string().max(4096).optional(),
  format: LogFormatEnum.optional().default('auto'),
  customPattern: z.string().max(500).optional(),
  filter: z.string().max(500).optional(),
  levels: z.array(LogLevelEnum).optional(),
  alertPatterns: z.array(z.string().max(500)).max(50).optional(),
  alertLevels: z.array(LogLevelEnum).optional(),
  alertRules: z.array(AlertRuleSchema).max(50).optional(),
  pollInterval: z.number().int().min(100).max(60000).optional().default(1000),
  maxEntries: z.number().int().min(10).max(5000).optional().default(1000),
  fromStart: z.boolean().optional().default(false),
  limit: z.number().int().positive().max(500).optional().default(50),
});

const ConditionSchema = z.object({
  field: z.string().min(1).max(200),
  op: z.enum(['=', '!=', '=~', '!~', '>', '>=', '<', '<=', 'contains', '!contains', 'exists', '!exists', 'in']),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]).optional(),
}).strict();

const QueryLogsSchema = z.object({
  ...sourceFields, ...timeFields,
  query: z.string().max(4000).optional(),
  where: z.array(ConditionSchema).max(50).optional(),
  text: z.array(z.string().max(500)).max(20).optional(),
  groupBy: z.array(z.string().max(200)).max(5).optional(),
  aggregate: z.object({
    op: z.enum(['count', 'sum', 'avg', 'min', 'max', 'percentiles', 'count_distinct']),
    field: z.string().max(200).optional(),
    percentiles: z.array(z.number().min(0).max(100)).max(10).optional(),
  }).strict().optional(),
  bucket: z.string().max(10).optional(),
  topK: z.number().int().positive().max(1000).optional(),
  limit: z.number().int().positive().max(500).optional(),
  newest: z.boolean().optional(),
});

const MineTemplatesSchema = z.object({
  ...sourceFields, ...timeFields,
  levels: z.array(LogLevelEnum).optional(),
  filter: z.string().max(500).optional(),
  similarity: z.number().min(0.1).max(1).optional(),
  depth: z.number().int().min(3).max(8).optional(),
  limit: z.number().int().positive().max(500).optional().default(50),
  minCount: z.number().int().positive().optional().default(1),
});

const AccessStatsSchema = z.object({
  ...sourceFields, ...timeFields,
  bucket: z.string().max(10).optional().default('5m'),
  top: z.number().int().positive().max(100).optional().default(10),
  normalizePaths: z.boolean().optional().default(true),
  minRequests: z.number().int().positive().optional().default(1),
});

const TraceTimelineSchema = z.object({
  ...sourceFields, ...timeFields,
  id: z.string().min(1).max(500),
  field: z.string().max(200).optional(),
  limit: z.number().int().positive().max(1000).optional().default(200),
});

const DetectFormatSchema = z.object({ ...sourceFields });

// ---------------------------------------------------------------- handlers

const regexOpt = (s?: string) => (s ? safeRegex(s, 'i') : undefined);

export const handlers: Record<string, Handler> = {
  parse_logs: async (args, deps) => {
    const a = ParseLogsSchema.parse(args);
    return jsonResponse(await parseLogs(toSourceInput(a), {
      filter: { ...timeFilter(a), levels: a.levels, filter: regexOpt(a.filter) },
      limit: a.limit, offset: a.offset, includeRaw: a.includeRaw,
    }, deps));
  },

  find_errors: async (args, deps) => {
    const a = FindErrorsSchema.parse(args);
    const t = timeFilter(a);
    return jsonResponse(await findErrors(toSourceInput(a), {
      ...t,
      includeWarnings: a.includeWarnings, limit: a.limit, groupLimit: a.groupLimit, groupByException: a.groupByException,
      baselineFile: a.baselineFile,
      baselinePaths: a.baselinePaths,
      baselineStartTime: parseTimeBound(a.baselineStartTime),
      baselineEndTime: parseTimeBound(a.baselineEndTime),
      saveBaselineTo: a.saveBaselineTo,
      overwrite: a.overwrite,
    }, deps));
  },

  analyze_patterns: async (args, deps) => {
    const a = AnalyzePatternsSchema.parse(args);
    return jsonResponse(await analyzePatterns(toSourceInput(a), { ...timeFilter(a), minOccurrences: a.minOccurrences, timeWindowMinutes: a.timeWindow }, deps));
  },

  aggregate_stats: async (args, deps) => {
    const a = AggregateStatsSchema.parse(args);
    return jsonResponse(await aggregateStats(toSourceInput(a), { ...timeFilter(a), groupBy: a.groupBy }, deps));
  },

  correlate_events: async (args, deps) => {
    const a = CorrelateEventsSchema.parse(args);
    const field = a.correlationField === 'custom' ? a.customField : a.correlationField;
    if (!field) throw new Error('customField is required when correlationField is "custom"');
    return jsonResponse(await correlateEvents(toSourceInput(a), {
      ...timeFilter(a), field, targetValue: a.targetValue, limit: a.limit, eventsPerChain: a.eventsPerChain,
    }, deps));
  },

  tail_logs: async (args, deps) => {
    const a = TailLogsSchema.parse(args);
    return jsonResponse(await tailLogs(toSourceInput(a), { lines: a.lines, filter: { levels: a.levels, filter: regexOpt(a.filter) } }, deps));
  },

  search_logs: async (args, deps) => {
    const a = SearchLogsSchema.parse(args);
    return jsonResponse(await searchLogs(toSourceInput(a), {
      query: a.query, caseSensitive: a.caseSensitive, useRegex: a.useRegex, context: a.context, limit: a.limit, invert: a.invert,
    }, deps));
  },

  compare_logs: async (args, deps) => {
    const a = CompareLogsSchema.parse(args);
    const side = (p: string) => toSourceInput({ filePath: p, format: a.format, customPattern: a.customPattern });
    return jsonResponse(await compareLogs(side(a.baselineFile), side(a.comparisonFile), a.compareBy, deps));
  },

  export_report: async (args, deps) => {
    const a = ExportReportSchema.parse(args);
    return jsonResponse(await exportReport(toSourceInput(a), {
      ...timeFilter(a), outputFormat: a.outputFormat, outputPath: a.outputPath, includeCharts: a.includeCharts, title: a.title, overwrite: a.overwrite,
    }, deps));
  },

  watch_logs: async (args) => {
    const a = WatchLogsSchema.parse(args);
    switch (a.action) {
      case 'start': {
        if (!a.filePath) throw new Error("filePath is required for 'start'");
        validateLogPath(a.filePath);
        if (/[*?{[]/.test(a.filePath)) throw new Error('watch_logs follows a single file; globs are not supported');
        // The file may not exist yet (it is waited for), but if it does it must be allowed.
        await assertReadable(a.filePath).catch((err: Error) => {
          if (!/does not exist/.test(err.message)) throw err;
        });
        const status = await watchLogs({
          filePath: a.filePath, format: a.format, customPattern: a.customPattern, filter: a.filter, levels: a.levels,
          alertPatterns: a.alertPatterns, alertLevels: a.alertLevels, alertRules: a.alertRules,
          pollInterval: a.pollInterval, maxEntries: a.maxEntries, fromStart: a.fromStart,
        });
        return jsonResponse({ message: `Started watching ${a.filePath}`, ...status });
      }
      case 'status': {
        if (!a.filePath) throw new Error("filePath is required for 'status'");
        const w = getWatcher(a.filePath);
        if (!w) throw new Error(`No active watcher for ${a.filePath} (active: ${listActiveWatchers().map((x) => x.filePath).join(', ') || 'none'})`);
        return jsonResponse(w.getStatus(a.limit));
      }
      case 'stop': {
        if (!a.filePath) throw new Error("filePath is required for 'stop'");
        const stopped = await stopWatching(a.filePath);
        if (!stopped) throw new Error(`No active watcher for ${a.filePath}`);
        return jsonResponse({ success: true, message: `Stopped watching ${a.filePath}`, activeWatchers: listActiveWatchers() });
      }
      case 'list': {
        const watchers = listActiveWatchers();
        return jsonResponse({ activeWatchers: watchers, count: watchers.length });
      }
    }
  },

};
