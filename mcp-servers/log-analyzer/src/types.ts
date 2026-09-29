// SPDX-License-Identifier: MIT
/**
 * Log Analyzer Types
 * Shared interfaces for log parsing and analysis
 */

export type LogLevel = 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

export const LOG_LEVELS: LogLevel[] = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];

/**
 * Every format name accepted by the `format` parameter. `auto` detects from the
 * head of each source; `custom` requires `customPattern`.
 */
export const LOG_FORMATS = [
  'auto',
  // Java
  'spring-boot', 'log4j', 'logback',
  // Node.js
  'winston', 'pino', 'morgan',
  // Python
  'python',
  // Go
  'zap', 'zerolog', 'logrus',
  // .NET
  'serilog', 'dotnet',
  // Ruby
  'rails',
  // Generic
  'json', 'logfmt', 'plain', 'custom',
  // Web servers / access logs
  'clf', 'nginx', 'apache',
  // Platforms / envelopes
  'kubernetes', 'docker', 'cri', 'heroku', 'cloudwatch', 'otel',
  // System
  'syslog', 'journald',
] as const;

export type LogFormat = (typeof LOG_FORMATS)[number];

// ============================================
// Log Entry Types
// ============================================

export interface LogEntry {
  /** null when the line carried no parseable timestamp — never a made-up "now". */
  timestamp: Date | null;
  level: LogLevel;
  message: string;
  logger?: string;
  thread?: string;
  class?: string;
  method?: string;
  line?: number;
  requestId?: string;
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  userId?: string;
  sessionId?: string;
  stackTrace?: string[];
  exception?: ExceptionInfo;
  metadata?: Record<string, unknown>;
  raw: string;
  lineNumber: number;
  /** File path or live-source label the entry came from. */
  source?: string;
  /** stdout / stderr when the envelope says so. */
  stream?: string;
}

export interface ExceptionInfo {
  type: string;
  message: string;
  stackTrace: string[];
  /** Frames elided by the runtime ("... 12 more"). */
  omittedFrames?: number;
  language?: 'java' | 'python' | 'node' | 'go' | 'dotnet' | 'ruby' | 'unknown';
  causedBy?: ExceptionInfo;
  /** How `causedBy` relates: Java "Caused by", Python "direct cause" vs "during handling". */
  causeRelation?: 'cause' | 'context' | 'inner';
}

export interface TimeRange {
  start: Date | null;
  end: Date | null;
}

// ============================================
// Tool inputs shared across analyzers
// ============================================

/** A live source fetched through an external CLI. */
export interface LiveSource {
  type: 'docker' | 'compose' | 'kubectl' | 'journald';
  container?: string;
  projectDir?: string;
  composeFile?: string;
  services?: string[];
  namespace?: string;
  context?: string;
  pod?: string;
  deployment?: string;
  selector?: string;
  allContainers?: boolean;
  previous?: boolean;
  unit?: string;
  since?: string;
  tail?: number;
  timeoutSeconds?: number;
}

export interface SourceInput {
  /** Files, directories or glob patterns (absolute). */
  paths?: string[];
  source?: LiveSource | LiveSource[];
  format?: LogFormat;
  customPattern?: string;
}

export interface EntryFilter {
  startTime?: Date;
  endTime?: Date;
  levels?: LogLevel[];
  filter?: RegExp;
}

// ============================================
// Analyzer result types
// ============================================

export interface ErrorGroup {
  fingerprint: string;
  exceptionType: string;
  message: string;
  normalizedMessage: string;
  count: number;
  firstOccurrence: Date | null;
  lastOccurrence: Date | null;
  stackTrace: string[];
  causedBy?: string[];
  sources: string[];
  status?: 'new' | 'known';
  examples: unknown[];
}

export interface Pattern {
  pattern: string;
  description: string;
  category: PatternCategory;
  count: number;
  severity: 'info' | 'warning' | 'critical';
  firstOccurrence: Date | null;
  lastOccurrence: Date | null;
  examples: string[];
  suggestion?: string;
  peakWindow?: { start: string; count: number };
}

export type PatternCategory =
  | 'timeout'
  | 'connection'
  | 'authentication'
  | 'database'
  | 'memory'
  | 'disk'
  | 'rate-limit'
  | 'validation'
  | 'permission'
  | 'not-found'
  | 'configuration'
  | 'crash'
  | 'other';

export interface LogStats {
  totalEntries: number;
  byLevel: Record<LogLevel, number>;
  byLogger: Record<string, number>;
  byHour: {
    hour: string;
    total: number;
    errors: number;
    warnings: number;
  }[];
  topLoggers: {
    logger: string;
    count: number;
    errorCount: number;
  }[];
  errorRate: number; // errors per 1000 entries
  avgEntriesPerMinute: number;
  peakHour: string;
  quietestHour: string;
  entriesWithoutTimestamp: number;
}

export interface WatchAlert {
  timestamp: Date;
  type: 'pattern' | 'level' | 'threshold';
  rule: string;
  message: string;
  entry: LogEntry;
}
