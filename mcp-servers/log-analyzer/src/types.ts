// SPDX-License-Identifier: MIT
/**
 * Log Analyzer Types
 * Shared interfaces for log parsing and analysis
 */

export type LogLevel = 'TRACE' | 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'FATAL';

export type LogFormat =
  | 'spring-boot'      // Spring Boot default format
  | 'log4j'            // Log4j/Log4j2
  | 'logback'          // Logback
  | 'winston'          // Winston JSON
  | 'pino'             // Pino JSON
  | 'morgan'           // Morgan access logs
  | 'python'           // Python logging
  | 'json'             // Generic JSON lines
  | 'clf'              // Common Log Format (Apache/Nginx)
  | 'nginx'            // Nginx access/error logs
  | 'apache'           // Apache access/error logs
  | 'kubernetes'       // Kubernetes JSON logs
  | 'syslog'           // RFC 5424 Syslog
  | 'auto';            // Auto-detect

// ============================================
// Log Entry Types
// ============================================

export interface LogEntry {
  timestamp: Date;
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
  userId?: string;
  sessionId?: string;
  stackTrace?: string[];
  exception?: ExceptionInfo;
  metadata?: Record<string, unknown>;
  raw: string;
  lineNumber: number;
}

export interface ExceptionInfo {
  type: string;
  message: string;
  stackTrace: string[];
  causedBy?: ExceptionInfo;
}

// ============================================
// Parse Logs Types
// ============================================

export interface ParseLogsInput {
  filePath: string;
  format?: LogFormat;
  startTime?: string;  // ISO date
  endTime?: string;    // ISO date
  levels?: LogLevel[];
  limit?: number;
  offset?: number;
  filter?: string;     // Regex pattern
}

export interface ParseLogsResult {
  filePath: string;
  format: LogFormat;
  totalLines: number;
  parsedEntries: number;
  failedLines: number;
  entries: LogEntry[];
  timeRange: {
    start: Date | null;
    end: Date | null;
  };
  levelCounts: Record<LogLevel, number>;
}

// ============================================
// Find Errors Types
// ============================================

export interface FindErrorsInput {
  filePath: string;
  format?: LogFormat;
  includeWarnings?: boolean;
  limit?: number;
  groupByException?: boolean;
  startTime?: string;
  endTime?: string;
}

export interface ErrorGroup {
  exceptionType: string;
  message: string;
  count: number;
  firstOccurrence: Date;
  lastOccurrence: Date;
  stackTrace: string[];
  examples: LogEntry[];
}

export interface FindErrorsResult {
  filePath: string;
  totalErrors: number;
  totalWarnings: number;
  errorGroups: ErrorGroup[];
  recentErrors: LogEntry[];
  errorTimeline: {
    hour: string;
    count: number;
  }[];
}

// ============================================
// Analyze Patterns Types
// ============================================

export interface AnalyzePatternsInput {
  filePath: string;
  format?: LogFormat;
  minOccurrences?: number;
  timeWindow?: number;  // minutes
}

export interface Pattern {
  pattern: string;
  category: PatternCategory;
  count: number;
  severity: 'info' | 'warning' | 'critical';
  firstOccurrence: Date;
  lastOccurrence: Date;
  examples: string[];
  suggestion?: string;
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
  | 'other';

export interface AnalyzePatternsResult {
  filePath: string;
  patterns: Pattern[];
  summary: {
    totalPatterns: number;
    criticalPatterns: number;
    warningPatterns: number;
    topCategory: PatternCategory;
  };
  recommendations: string[];
}

// ============================================
// Aggregate Stats Types
// ============================================

export interface AggregateStatsInput {
  filePath: string;
  format?: LogFormat;
  groupBy?: 'hour' | 'minute' | 'day';
  startTime?: string;
  endTime?: string;
}

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
  errorRate: number;  // errors per 1000 entries
  avgEntriesPerMinute: number;
  peakHour: string;
  quietestHour: string;
}

export interface AggregateStatsResult {
  filePath: string;
  timeRange: {
    start: Date | null;
    end: Date | null;
    durationMinutes: number;
  };
  stats: LogStats;
}

// ============================================
// Correlate Events Types
// ============================================

export interface CorrelateEventsInput {
  filePaths: string[];
  correlationField: 'requestId' | 'traceId' | 'sessionId' | 'userId' | 'custom';
  customField?: string;
  targetValue?: string;  // Specific value to correlate
  startTime?: string;
  endTime?: string;
}

export interface CorrelatedEvent {
  file: string;
  entry: LogEntry;
}

export interface CorrelationChain {
  correlationValue: string;
  events: CorrelatedEvent[];
  timespan: number;  // ms
  hasError: boolean;
  summary: string;
}

export interface CorrelateEventsResult {
  correlationField: string;
  totalChains: number;
  chains: CorrelationChain[];
  chainsWithErrors: number;
  avgEventsPerChain: number;
}

// ============================================
// Tail Logs Types
// ============================================

export interface TailLogsInput {
  filePath: string;
  format?: LogFormat;
  lines?: number;       // Last N lines
  follow?: boolean;     // Continuous monitoring
  filter?: string;      // Regex pattern
  levels?: LogLevel[];
}

export interface TailLogsResult {
  filePath: string;
  entries: LogEntry[];
  watching: boolean;
}

// ============================================
// Search Logs Types
// ============================================

export interface SearchLogsInput {
  filePaths: string[];
  query: string;          // Search query (regex or text)
  caseSensitive?: boolean;
  useRegex?: boolean;
  context?: number;       // Lines of context around match
  limit?: number;
  format?: LogFormat;
}

export interface SearchMatch {
  file: string;
  lineNumber: number;
  line: string;
  matchStart: number;
  matchEnd: number;
  contextBefore: string[];
  contextAfter: string[];
  entry?: LogEntry;
}

export interface SearchLogsResult {
  query: string;
  totalMatches: number;
  filesSearched: number;
  filesWithMatches: number;
  matches: SearchMatch[];
  searchTime: number;  // ms
}

// ============================================
// Compare Logs Types
// ============================================

export interface CompareLogsInput {
  baselineFile: string;
  comparisonFile: string;
  format?: LogFormat;
  compareBy?: 'level' | 'pattern' | 'time';
}

export interface LogComparison {
  metric: string;
  baseline: number;
  comparison: number;
  change: number;        // percentage
  significance: 'none' | 'minor' | 'major' | 'critical';
}

export interface CompareLogsResult {
  baselineFile: string;
  comparisonFile: string;
  baselineTimeRange: { start: Date | null; end: Date | null };
  comparisonTimeRange: { start: Date | null; end: Date | null };
  comparisons: LogComparison[];
  newPatterns: string[];
  resolvedPatterns: string[];
  summary: string;
}

// ============================================
// Export Report Types
// ============================================

export interface ExportReportInput {
  filePath: string;
  format?: LogFormat;
  outputFormat: 'html' | 'json' | 'markdown';
  outputPath?: string;
  includeCharts?: boolean;
  title?: string;
}

export interface ExportReportResult {
  outputPath: string;
  format: string;
  size: number;
  sections: string[];
}

// ============================================
// Watch Logs Types
// ============================================

export interface WatchLogsInput {
  filePath: string;
  format?: LogFormat;
  filter?: string;           // Regex pattern to filter
  levels?: LogLevel[];       // Filter by levels
  alertPatterns?: string[];  // Patterns that trigger alerts
  alertLevels?: LogLevel[];  // Levels that trigger alerts (default: ERROR, FATAL)
  pollInterval?: number;     // Polling interval in ms (default: 1000)
  maxEntries?: number;       // Max entries to keep in memory (default: 1000)
}

export interface WatchAlert {
  timestamp: Date;
  type: 'pattern' | 'level' | 'threshold';
  message: string;
  entry: LogEntry;
  pattern?: string;
}

export interface WatchLogsResult {
  filePath: string;
  status: 'watching' | 'stopped' | 'error';
  entriesProcessed: number;
  alertsTriggered: number;
  recentEntries: LogEntry[];
  recentAlerts: WatchAlert[];
  stats: {
    byLevel: Record<LogLevel, number>;
    errorsPerMinute: number;
    lastEntry?: Date;
  };
}
