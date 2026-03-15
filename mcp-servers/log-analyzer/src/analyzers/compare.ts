// SPDX-License-Identifier: MIT
/**
 * Log Compare Analyzer
 * Compare two log files and highlight differences
 */

import { parseLogFile } from '../parsers/index.js';
import { findErrors } from './errors.js';
import { analyzePatterns } from './patterns.js';
import { aggregateStats } from './stats.js';
import type {
  CompareLogsInput,
  CompareLogsResult,
  LogComparison,
  LogFormat,
  LogLevel,
  Pattern,
} from '../types.js';

/**
 * Compare two log files
 */
export async function compareLogs(input: CompareLogsInput): Promise<CompareLogsResult> {
  const { baselineFile, comparisonFile, format = 'auto', compareBy = 'level' } = input;

  // Parse both files
  const [baselineResult, comparisonResult] = await Promise.all([
    parseLogFile(baselineFile, format),
    parseLogFile(comparisonFile, format),
  ]);

  // Calculate time ranges
  const baselineTimeRange = calculateTimeRange(baselineResult.result.entries);
  const comparisonTimeRange = calculateTimeRange(comparisonResult.result.entries);

  // Build comparisons based on mode
  let comparisons: LogComparison[] = [];
  let newPatterns: string[] = [];
  let resolvedPatterns: string[] = [];

  switch (compareBy) {
    case 'level':
      comparisons = compareLevelDistribution(
        baselineResult.result.entries,
        comparisonResult.result.entries
      );
      break;
    case 'pattern':
      const patternComparison = await comparePatterns(baselineFile, comparisonFile, format);
      comparisons = patternComparison.comparisons;
      newPatterns = patternComparison.newPatterns;
      resolvedPatterns = patternComparison.resolvedPatterns;
      break;
    case 'time':
      comparisons = compareTimeDistribution(
        baselineResult.result.entries,
        comparisonResult.result.entries
      );
      break;
  }

  // Generate summary
  const summary = generateSummary(comparisons, newPatterns, resolvedPatterns);

  return {
    baselineFile,
    comparisonFile,
    baselineTimeRange,
    comparisonTimeRange,
    comparisons,
    newPatterns,
    resolvedPatterns,
    summary,
  };
}

/**
 * Calculate time range from entries
 */
function calculateTimeRange(entries: Array<{ timestamp: Date }>): { start: Date | null; end: Date | null } {
  if (entries.length === 0) {
    return { start: null, end: null };
  }

  const timestamps = entries.map((e) => e.timestamp.getTime());
  return {
    start: new Date(Math.min(...timestamps)),
    end: new Date(Math.max(...timestamps)),
  };
}

/**
 * Compare level distribution between two log sets
 */
function compareLevelDistribution(
  baseline: Array<{ level: LogLevel }>,
  comparison: Array<{ level: LogLevel }>
): LogComparison[] {
  const levels: LogLevel[] = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];
  const comparisons: LogComparison[] = [];

  // Count levels
  const baselineCounts = countLevels(baseline);
  const comparisonCounts = countLevels(comparison);

  // Compare each level
  for (const level of levels) {
    const baselineCount = baselineCounts[level] || 0;
    const comparisonCount = comparisonCounts[level] || 0;

    // Calculate percentage change
    let change = 0;
    if (baselineCount > 0) {
      change = ((comparisonCount - baselineCount) / baselineCount) * 100;
    } else if (comparisonCount > 0) {
      change = 100; // New entries
    }

    // Determine significance
    let significance: 'none' | 'minor' | 'major' | 'critical' = 'none';
    const absChange = Math.abs(change);

    if (level === 'ERROR' || level === 'FATAL') {
      if (absChange >= 50) significance = 'critical';
      else if (absChange >= 20) significance = 'major';
      else if (absChange >= 5) significance = 'minor';
    } else if (level === 'WARN') {
      if (absChange >= 100) significance = 'major';
      else if (absChange >= 30) significance = 'minor';
    } else {
      if (absChange >= 200) significance = 'minor';
    }

    comparisons.push({
      metric: `${level} count`,
      baseline: baselineCount,
      comparison: comparisonCount,
      change: Math.round(change * 100) / 100,
      significance,
    });
  }

  // Add total and error rate
  const baselineTotal = baseline.length;
  const comparisonTotal = comparison.length;
  const totalChange = baselineTotal > 0
    ? ((comparisonTotal - baselineTotal) / baselineTotal) * 100
    : (comparisonTotal > 0 ? 100 : 0);

  comparisons.push({
    metric: 'Total entries',
    baseline: baselineTotal,
    comparison: comparisonTotal,
    change: Math.round(totalChange * 100) / 100,
    significance: 'none',
  });

  // Error rate
  const baselineErrorRate = baselineTotal > 0
    ? ((baselineCounts['ERROR'] || 0) + (baselineCounts['FATAL'] || 0)) / baselineTotal * 100
    : 0;
  const comparisonErrorRate = comparisonTotal > 0
    ? ((comparisonCounts['ERROR'] || 0) + (comparisonCounts['FATAL'] || 0)) / comparisonTotal * 100
    : 0;
  const errorRateChange = baselineErrorRate > 0
    ? ((comparisonErrorRate - baselineErrorRate) / baselineErrorRate) * 100
    : (comparisonErrorRate > 0 ? 100 : 0);

  let errorSignificance: 'none' | 'minor' | 'major' | 'critical' = 'none';
  if (Math.abs(errorRateChange) >= 50) errorSignificance = 'critical';
  else if (Math.abs(errorRateChange) >= 20) errorSignificance = 'major';
  else if (Math.abs(errorRateChange) >= 5) errorSignificance = 'minor';

  comparisons.push({
    metric: 'Error rate (%)',
    baseline: Math.round(baselineErrorRate * 100) / 100,
    comparison: Math.round(comparisonErrorRate * 100) / 100,
    change: Math.round(errorRateChange * 100) / 100,
    significance: errorSignificance,
  });

  return comparisons;
}

/**
 * Count entries by level
 */
function countLevels(entries: Array<{ level: LogLevel }>): Record<LogLevel, number> {
  const counts: Record<LogLevel, number> = {
    TRACE: 0,
    DEBUG: 0,
    INFO: 0,
    WARN: 0,
    ERROR: 0,
    FATAL: 0,
  };

  for (const entry of entries) {
    counts[entry.level]++;
  }

  return counts;
}

/**
 * Compare patterns between two log files
 */
async function comparePatterns(
  baselineFile: string,
  comparisonFile: string,
  format: LogFormat
): Promise<{
  comparisons: LogComparison[];
  newPatterns: string[];
  resolvedPatterns: string[];
}> {
  // Analyze patterns in both files
  const [baselinePatterns, comparisonPatterns] = await Promise.all([
    analyzePatterns({ filePath: baselineFile, format, minOccurrences: 1 }),
    analyzePatterns({ filePath: comparisonFile, format, minOccurrences: 1 }),
  ]);

  const comparisons: LogComparison[] = [];
  const newPatterns: string[] = [];
  const resolvedPatterns: string[] = [];

  // Create maps for easy lookup
  const baselineMap = new Map<string, Pattern>();
  const comparisonMap = new Map<string, Pattern>();

  for (const pattern of baselinePatterns.patterns) {
    baselineMap.set(pattern.pattern, pattern);
  }
  for (const pattern of comparisonPatterns.patterns) {
    comparisonMap.set(pattern.pattern, pattern);
  }

  // Find new patterns (in comparison but not baseline)
  for (const [patternStr, pattern] of comparisonMap) {
    if (!baselineMap.has(patternStr)) {
      newPatterns.push(patternStr);

      comparisons.push({
        metric: `NEW: ${patternStr.substring(0, 50)}`,
        baseline: 0,
        comparison: pattern.count,
        change: 100,
        significance: pattern.severity === 'critical' ? 'critical' : 'major',
      });
    }
  }

  // Find resolved patterns (in baseline but not comparison)
  for (const [patternStr, pattern] of baselineMap) {
    if (!comparisonMap.has(patternStr)) {
      resolvedPatterns.push(patternStr);

      comparisons.push({
        metric: `RESOLVED: ${patternStr.substring(0, 50)}`,
        baseline: pattern.count,
        comparison: 0,
        change: -100,
        significance: 'none', // Resolved patterns are good
      });
    }
  }

  // Compare patterns that exist in both
  for (const [patternStr, baselinePattern] of baselineMap) {
    const comparisonPattern = comparisonMap.get(patternStr);
    if (comparisonPattern) {
      const change = baselinePattern.count > 0
        ? ((comparisonPattern.count - baselinePattern.count) / baselinePattern.count) * 100
        : 100;

      let significance: 'none' | 'minor' | 'major' | 'critical' = 'none';
      const absChange = Math.abs(change);

      if (baselinePattern.severity === 'critical') {
        if (absChange >= 20) significance = 'critical';
        else if (absChange >= 10) significance = 'major';
      } else if (baselinePattern.severity === 'warning') {
        if (absChange >= 50) significance = 'major';
        else if (absChange >= 20) significance = 'minor';
      }

      comparisons.push({
        metric: patternStr.substring(0, 50),
        baseline: baselinePattern.count,
        comparison: comparisonPattern.count,
        change: Math.round(change * 100) / 100,
        significance,
      });
    }
  }

  return { comparisons, newPatterns, resolvedPatterns };
}

/**
 * Compare time distribution between two log sets
 */
function compareTimeDistribution(
  baseline: Array<{ timestamp: Date }>,
  comparison: Array<{ timestamp: Date }>
): LogComparison[] {
  const comparisons: LogComparison[] = [];

  // Calculate entries per hour for both
  const baselineByHour = groupByHour(baseline);
  const comparisonByHour = groupByHour(comparison);

  // Calculate average entries per hour
  const baselineAvg = baseline.length > 0
    ? baseline.length / Object.keys(baselineByHour).length
    : 0;
  const comparisonAvg = comparison.length > 0
    ? comparison.length / Object.keys(comparisonByHour).length
    : 0;

  const avgChange = baselineAvg > 0
    ? ((comparisonAvg - baselineAvg) / baselineAvg) * 100
    : (comparisonAvg > 0 ? 100 : 0);

  comparisons.push({
    metric: 'Avg entries/hour',
    baseline: Math.round(baselineAvg * 100) / 100,
    comparison: Math.round(comparisonAvg * 100) / 100,
    change: Math.round(avgChange * 100) / 100,
    significance: Math.abs(avgChange) >= 50 ? 'major' : Math.abs(avgChange) >= 20 ? 'minor' : 'none',
  });

  // Peak hour comparison
  const baselinePeak = findPeakHour(baselineByHour);
  const comparisonPeak = findPeakHour(comparisonByHour);

  if (baselinePeak && comparisonPeak) {
    const peakChange = baselinePeak.count > 0
      ? ((comparisonPeak.count - baselinePeak.count) / baselinePeak.count) * 100
      : 100;

    comparisons.push({
      metric: 'Peak hour entries',
      baseline: baselinePeak.count,
      comparison: comparisonPeak.count,
      change: Math.round(peakChange * 100) / 100,
      significance: Math.abs(peakChange) >= 100 ? 'major' : 'minor',
    });
  }

  // Time span comparison
  const baselineSpan = calculateSpanHours(baseline);
  const comparisonSpan = calculateSpanHours(comparison);

  comparisons.push({
    metric: 'Time span (hours)',
    baseline: Math.round(baselineSpan * 100) / 100,
    comparison: Math.round(comparisonSpan * 100) / 100,
    change: 0, // Time span doesn't have a meaningful change %
    significance: 'none',
  });

  return comparisons;
}

/**
 * Group entries by hour
 */
function groupByHour(entries: Array<{ timestamp: Date }>): Record<string, number> {
  const byHour: Record<string, number> = {};

  for (const entry of entries) {
    const hourKey = entry.timestamp.toISOString().substring(0, 13);
    byHour[hourKey] = (byHour[hourKey] || 0) + 1;
  }

  return byHour;
}

/**
 * Find peak hour
 */
function findPeakHour(byHour: Record<string, number>): { hour: string; count: number } | null {
  let peakHour = '';
  let peakCount = 0;

  for (const [hour, count] of Object.entries(byHour)) {
    if (count > peakCount) {
      peakHour = hour;
      peakCount = count;
    }
  }

  return peakHour ? { hour: peakHour, count: peakCount } : null;
}

/**
 * Calculate time span in hours
 */
function calculateSpanHours(entries: Array<{ timestamp: Date }>): number {
  if (entries.length < 2) return 0;

  const timestamps = entries.map((e) => e.timestamp.getTime());
  const minTime = Math.min(...timestamps);
  const maxTime = Math.max(...timestamps);

  return (maxTime - minTime) / (1000 * 60 * 60);
}

/**
 * Generate comparison summary
 */
function generateSummary(
  comparisons: LogComparison[],
  newPatterns: string[],
  resolvedPatterns: string[]
): string {
  const lines: string[] = [];

  // Count significant changes
  const critical = comparisons.filter((c) => c.significance === 'critical');
  const major = comparisons.filter((c) => c.significance === 'major');
  const minor = comparisons.filter((c) => c.significance === 'minor');

  if (critical.length > 0) {
    lines.push(`⚠️ CRITICAL: ${critical.length} critical changes detected`);
    for (const c of critical) {
      lines.push(`  - ${c.metric}: ${c.change > 0 ? '+' : ''}${c.change}%`);
    }
  }

  if (major.length > 0) {
    lines.push(`🔸 MAJOR: ${major.length} major changes detected`);
  }

  if (minor.length > 0) {
    lines.push(`📌 MINOR: ${minor.length} minor changes detected`);
  }

  if (newPatterns.length > 0) {
    lines.push(`🆕 NEW PATTERNS: ${newPatterns.length} new patterns appeared`);
  }

  if (resolvedPatterns.length > 0) {
    lines.push(`✅ RESOLVED: ${resolvedPatterns.length} patterns no longer present`);
  }

  if (critical.length === 0 && major.length === 0) {
    lines.push('✅ No significant changes detected between the two log files');
  }

  return lines.join('\n');
}
