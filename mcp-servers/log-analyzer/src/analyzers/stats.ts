// SPDX-License-Identifier: MIT
/**
 * Statistics Aggregator
 * Aggregates and summarizes log statistics
 */

import { parseLogFile } from '../parsers/index.js';
import type {
  LogFormat,
  LogLevel,
  LogEntry,
  AggregateStatsInput,
  AggregateStatsResult,
  LogStats,
} from '../types.js';

/**
 * Aggregate statistics from a log file
 */
export async function aggregateStats(input: AggregateStatsInput): Promise<AggregateStatsResult> {
  const {
    filePath,
    format = 'auto',
    groupBy = 'hour',
    startTime,
    endTime,
  } = input;

  // Parse the log file
  const { result } = await parseLogFile(filePath, format as LogFormat, {
    startTime: startTime ? new Date(startTime) : undefined,
    endTime: endTime ? new Date(endTime) : undefined,
  });

  const entries = result.entries;

  if (entries.length === 0) {
    return {
      filePath,
      timeRange: {
        start: null,
        end: null,
        durationMinutes: 0,
      },
      stats: emptyStats(),
    };
  }

  // Calculate time range
  const timestamps = entries.map((e) => e.timestamp.getTime());
  const minTime = new Date(Math.min(...timestamps));
  const maxTime = new Date(Math.max(...timestamps));
  const durationMinutes = (maxTime.getTime() - minTime.getTime()) / 60000;

  // Count by level
  const byLevel: Record<LogLevel, number> = {
    TRACE: 0,
    DEBUG: 0,
    INFO: 0,
    WARN: 0,
    ERROR: 0,
    FATAL: 0,
  };

  // Count by logger
  const byLogger = new Map<string, { total: number; errors: number }>();

  // Count by hour
  const byHourMap = new Map<string, { total: number; errors: number; warnings: number }>();

  for (const entry of entries) {
    // By level
    byLevel[entry.level]++;

    // By logger
    const logger = entry.logger || 'unknown';
    const loggerStats = byLogger.get(logger) || { total: 0, errors: 0 };
    loggerStats.total++;
    if (entry.level === 'ERROR' || entry.level === 'FATAL') {
      loggerStats.errors++;
    }
    byLogger.set(logger, loggerStats);

    // By hour
    const hour = getTimeKey(entry.timestamp, groupBy);
    const hourStats = byHourMap.get(hour) || { total: 0, errors: 0, warnings: 0 };
    hourStats.total++;
    if (entry.level === 'ERROR' || entry.level === 'FATAL') {
      hourStats.errors++;
    }
    if (entry.level === 'WARN') {
      hourStats.warnings++;
    }
    byHourMap.set(hour, hourStats);
  }

  // Convert to arrays
  const byHour = [...byHourMap.entries()]
    .map(([hour, stats]) => ({ hour, ...stats }))
    .sort((a, b) => a.hour.localeCompare(b.hour));

  // Top loggers by count
  const topLoggers = [...byLogger.entries()]
    .map(([logger, stats]) => ({
      logger,
      count: stats.total,
      errorCount: stats.errors,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  // Calculate error rate
  const totalErrors = byLevel.ERROR + byLevel.FATAL;
  const errorRate = entries.length > 0 ? (totalErrors / entries.length) * 1000 : 0;

  // Avg entries per minute
  const avgEntriesPerMinute = durationMinutes > 0 ? entries.length / durationMinutes : 0;

  // Peak and quietest hours
  let peakHour = '';
  let peakCount = 0;
  let quietestHour = '';
  let quietestCount = Infinity;

  for (const hourData of byHour) {
    if (hourData.total > peakCount) {
      peakCount = hourData.total;
      peakHour = hourData.hour;
    }
    if (hourData.total < quietestCount) {
      quietestCount = hourData.total;
      quietestHour = hourData.hour;
    }
  }

  // Build logger count object
  const byLoggerObj: Record<string, number> = {};
  for (const [logger, stats] of byLogger) {
    byLoggerObj[logger] = stats.total;
  }

  const stats: LogStats = {
    totalEntries: entries.length,
    byLevel,
    byLogger: byLoggerObj,
    byHour,
    topLoggers,
    errorRate: Math.round(errorRate * 100) / 100,
    avgEntriesPerMinute: Math.round(avgEntriesPerMinute * 100) / 100,
    peakHour,
    quietestHour,
  };

  return {
    filePath,
    timeRange: {
      start: minTime,
      end: maxTime,
      durationMinutes: Math.round(durationMinutes),
    },
    stats,
  };
}

/**
 * Get time grouping key
 */
function getTimeKey(date: Date, groupBy: 'hour' | 'minute' | 'day'): string {
  switch (groupBy) {
    case 'minute':
      return date.toISOString().slice(0, 16); // YYYY-MM-DDTHH:mm
    case 'hour':
      return date.toISOString().slice(0, 13) + ':00'; // YYYY-MM-DDTHH:00
    case 'day':
      return date.toISOString().slice(0, 10); // YYYY-MM-DD
  }
}

/**
 * Create empty stats object
 */
function emptyStats(): LogStats {
  return {
    totalEntries: 0,
    byLevel: {
      TRACE: 0,
      DEBUG: 0,
      INFO: 0,
      WARN: 0,
      ERROR: 0,
      FATAL: 0,
    },
    byLogger: {},
    byHour: [],
    topLoggers: [],
    errorRate: 0,
    avgEntriesPerMinute: 0,
    peakHour: '',
    quietestHour: '',
  };
}

/**
 * Compare stats between two time periods
 */
export async function compareStats(
  filePath: string,
  period1: { start: string; end: string },
  period2: { start: string; end: string },
  format: LogFormat = 'auto'
): Promise<{
  period1: AggregateStatsResult;
  period2: AggregateStatsResult;
  comparison: {
    entryCountChange: number;
    errorRateChange: number;
    peakVolumeChange: number;
    newLoggers: string[];
    droppedLoggers: string[];
  };
}> {
  const stats1 = await aggregateStats({
    filePath,
    format,
    startTime: period1.start,
    endTime: period1.end,
  });

  const stats2 = await aggregateStats({
    filePath,
    format,
    startTime: period2.start,
    endTime: period2.end,
  });

  // Calculate changes
  const entryCountChange = stats2.stats.totalEntries - stats1.stats.totalEntries;
  const errorRateChange = stats2.stats.errorRate - stats1.stats.errorRate;

  const peak1 = stats1.stats.byHour.reduce((max, h) => Math.max(max, h.total), 0);
  const peak2 = stats2.stats.byHour.reduce((max, h) => Math.max(max, h.total), 0);
  const peakVolumeChange = peak2 - peak1;

  const loggers1 = new Set(Object.keys(stats1.stats.byLogger));
  const loggers2 = new Set(Object.keys(stats2.stats.byLogger));

  const newLoggers = [...loggers2].filter((l) => !loggers1.has(l));
  const droppedLoggers = [...loggers1].filter((l) => !loggers2.has(l));

  return {
    period1: stats1,
    period2: stats2,
    comparison: {
      entryCountChange,
      errorRateChange: Math.round(errorRateChange * 100) / 100,
      peakVolumeChange,
      newLoggers,
      droppedLoggers,
    },
  };
}
