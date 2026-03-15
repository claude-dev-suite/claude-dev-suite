// SPDX-License-Identifier: MIT
/**
 * Pattern Analyzer
 * Detects common problematic patterns in logs
 */

import { parseLogFile } from '../parsers/index.js';
import type {
  LogFormat,
  LogEntry,
  AnalyzePatternsInput,
  AnalyzePatternsResult,
  Pattern,
  PatternCategory,
} from '../types.js';

/**
 * Known problematic patterns to look for
 */
const KNOWN_PATTERNS: Array<{
  regex: RegExp;
  category: PatternCategory;
  severity: 'info' | 'warning' | 'critical';
  description: string;
  suggestion: string;
}> = [
  // Timeout patterns
  {
    regex: /timeout|timed?\s*out|deadline\s*exceeded/i,
    category: 'timeout',
    severity: 'warning',
    description: 'Request or operation timeout',
    suggestion: 'Consider increasing timeout values or optimizing slow operations',
  },
  {
    regex: /socket\s*timeout|read\s*timeout|connect\s*timeout/i,
    category: 'timeout',
    severity: 'critical',
    description: 'Network socket timeout',
    suggestion: 'Check network connectivity and server response times',
  },

  // Connection patterns
  {
    regex: /connection\s*(refused|reset|closed|failed)/i,
    category: 'connection',
    severity: 'critical',
    description: 'Connection failure',
    suggestion: 'Verify target service is running and network is accessible',
  },
  {
    regex: /no\s*route\s*to\s*host|host\s*unreachable/i,
    category: 'connection',
    severity: 'critical',
    description: 'Network routing failure',
    suggestion: 'Check network configuration and firewall rules',
  },
  {
    regex: /connection\s*pool\s*(exhausted|empty|depleted)/i,
    category: 'connection',
    severity: 'critical',
    description: 'Connection pool exhausted',
    suggestion: 'Increase pool size or investigate connection leaks',
  },

  // Authentication patterns
  {
    regex: /unauthorized|authentication\s*failed|invalid\s*(token|credentials)/i,
    category: 'authentication',
    severity: 'warning',
    description: 'Authentication failure',
    suggestion: 'Check credentials and token validity',
  },
  {
    regex: /forbidden|access\s*denied|permission\s*denied/i,
    category: 'permission',
    severity: 'warning',
    description: 'Authorization failure',
    suggestion: 'Verify user permissions and access rights',
  },
  {
    regex: /token\s*expired|session\s*expired/i,
    category: 'authentication',
    severity: 'info',
    description: 'Session or token expired',
    suggestion: 'Implement proper token refresh mechanism',
  },

  // Database patterns
  {
    regex: /deadlock|lock\s*wait\s*timeout/i,
    category: 'database',
    severity: 'critical',
    description: 'Database deadlock or lock timeout',
    suggestion: 'Optimize transaction ordering and reduce lock duration',
  },
  {
    regex: /too\s*many\s*connections|max\s*connections/i,
    category: 'database',
    severity: 'critical',
    description: 'Database connection limit reached',
    suggestion: 'Increase max connections or optimize connection usage',
  },
  {
    regex: /slow\s*query|query\s*took\s*\d+\s*(ms|s)/i,
    category: 'database',
    severity: 'warning',
    description: 'Slow database query',
    suggestion: 'Add indexes or optimize query',
  },
  {
    regex: /constraint\s*violation|duplicate\s*(key|entry)/i,
    category: 'database',
    severity: 'warning',
    description: 'Database constraint violation',
    suggestion: 'Check for duplicate data or fix data validation',
  },

  // Memory patterns
  {
    regex: /out\s*of\s*memory|heap\s*space|oom|memory\s*exhausted/i,
    category: 'memory',
    severity: 'critical',
    description: 'Memory exhaustion',
    suggestion: 'Increase heap size or investigate memory leaks',
  },
  {
    regex: /gc\s*overhead|garbage\s*collection\s*overhead/i,
    category: 'memory',
    severity: 'warning',
    description: 'High garbage collection overhead',
    suggestion: 'Tune GC parameters or reduce object allocations',
  },

  // Disk patterns
  {
    regex: /no\s*space\s*left|disk\s*full|insufficient\s*storage/i,
    category: 'disk',
    severity: 'critical',
    description: 'Disk space exhausted',
    suggestion: 'Free up disk space or increase storage capacity',
  },
  {
    regex: /too\s*many\s*open\s*files|file\s*descriptor\s*limit/i,
    category: 'disk',
    severity: 'critical',
    description: 'File descriptor limit reached',
    suggestion: 'Increase ulimit or fix file handle leaks',
  },

  // Rate limiting
  {
    regex: /rate\s*limit|too\s*many\s*requests|429/i,
    category: 'rate-limit',
    severity: 'warning',
    description: 'Rate limit exceeded',
    suggestion: 'Implement request throttling or increase rate limits',
  },
  {
    regex: /circuit\s*breaker\s*(open|tripped)/i,
    category: 'rate-limit',
    severity: 'warning',
    description: 'Circuit breaker activated',
    suggestion: 'Investigate downstream service health',
  },

  // Validation patterns
  {
    regex: /validation\s*(failed|error)|invalid\s*(input|data|format)/i,
    category: 'validation',
    severity: 'info',
    description: 'Input validation failure',
    suggestion: 'Review input validation rules and error messages',
  },
  {
    regex: /null\s*pointer|npe|undefined\s*is\s*not/i,
    category: 'validation',
    severity: 'critical',
    description: 'Null/undefined reference',
    suggestion: 'Add null checks or fix data flow',
  },

  // Not found patterns
  {
    regex: /not\s*found|404|no\s*such\s*(file|entity|record)/i,
    category: 'not-found',
    severity: 'info',
    description: 'Resource not found',
    suggestion: 'Verify resource existence or handle gracefully',
  },

  // Configuration patterns
  {
    regex: /configuration\s*(error|invalid)|missing\s*(config|property)/i,
    category: 'configuration',
    severity: 'critical',
    description: 'Configuration error',
    suggestion: 'Review application configuration',
  },
];

/**
 * Analyze patterns in a log file
 */
export async function analyzePatterns(input: AnalyzePatternsInput): Promise<AnalyzePatternsResult> {
  const {
    filePath,
    format = 'auto',
    minOccurrences = 2,
    timeWindow,
  } = input;

  // Parse the log file
  const { result } = await parseLogFile(filePath, format as LogFormat);

  // Track pattern occurrences
  const patternMatches = new Map<string, {
    pattern: Pattern;
    entries: LogEntry[];
  }>();

  for (const entry of result.entries) {
    const text = `${entry.message} ${entry.raw}`;

    for (const knownPattern of KNOWN_PATTERNS) {
      if (knownPattern.regex.test(text)) {
        const key = `${knownPattern.category}:${knownPattern.description}`;
        const existing = patternMatches.get(key);

        if (existing) {
          existing.entries.push(entry);
        } else {
          patternMatches.set(key, {
            pattern: {
              pattern: knownPattern.regex.source,
              category: knownPattern.category,
              count: 0,
              severity: knownPattern.severity,
              firstOccurrence: entry.timestamp,
              lastOccurrence: entry.timestamp,
              examples: [],
              suggestion: knownPattern.suggestion,
            },
            entries: [entry],
          });
        }
      }
    }
  }

  // Build pattern results
  const patterns: Pattern[] = [];

  for (const [, data] of patternMatches) {
    if (data.entries.length >= minOccurrences) {
      const timestamps = data.entries.map((e) => e.timestamp);

      patterns.push({
        ...data.pattern,
        count: data.entries.length,
        firstOccurrence: new Date(Math.min(...timestamps.map((t) => t.getTime()))),
        lastOccurrence: new Date(Math.max(...timestamps.map((t) => t.getTime()))),
        examples: data.entries.slice(0, 3).map((e) => e.message),
      });
    }
  }

  // Sort by severity then count
  const severityOrder = { critical: 0, warning: 1, info: 2 };
  patterns.sort((a, b) => {
    const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];
    if (severityDiff !== 0) return severityDiff;
    return b.count - a.count;
  });

  // Build summary
  const criticalPatterns = patterns.filter((p) => p.severity === 'critical').length;
  const warningPatterns = patterns.filter((p) => p.severity === 'warning').length;

  // Find top category
  const categoryCounts = new Map<PatternCategory, number>();
  for (const pattern of patterns) {
    categoryCounts.set(
      pattern.category,
      (categoryCounts.get(pattern.category) || 0) + pattern.count
    );
  }

  let topCategory: PatternCategory = 'other';
  let maxCount = 0;
  for (const [category, count] of categoryCounts) {
    if (count > maxCount) {
      maxCount = count;
      topCategory = category;
    }
  }

  // Generate recommendations
  const recommendations = generateRecommendations(patterns);

  return {
    filePath,
    patterns,
    summary: {
      totalPatterns: patterns.length,
      criticalPatterns,
      warningPatterns,
      topCategory,
    },
    recommendations,
  };
}

/**
 * Generate actionable recommendations based on patterns
 */
function generateRecommendations(patterns: Pattern[]): string[] {
  const recommendations: string[] = [];
  const seenCategories = new Set<PatternCategory>();

  for (const pattern of patterns) {
    if (pattern.severity === 'critical' && !seenCategories.has(pattern.category)) {
      seenCategories.add(pattern.category);

      switch (pattern.category) {
        case 'memory':
          recommendations.push(
            `CRITICAL: Memory issues detected (${pattern.count} occurrences). ` +
            `Run heap analysis and check for memory leaks.`
          );
          break;
        case 'database':
          recommendations.push(
            `CRITICAL: Database issues detected (${pattern.count} occurrences). ` +
            `Check slow query logs and connection pool settings.`
          );
          break;
        case 'connection':
          recommendations.push(
            `CRITICAL: Connection failures detected (${pattern.count} occurrences). ` +
            `Verify service health and network connectivity.`
          );
          break;
        case 'timeout':
          recommendations.push(
            `WARNING: Timeouts detected (${pattern.count} occurrences). ` +
            `Consider increasing timeouts or optimizing slow operations.`
          );
          break;
        case 'disk':
          recommendations.push(
            `CRITICAL: Disk issues detected (${pattern.count} occurrences). ` +
            `Check available disk space and file descriptors.`
          );
          break;
      }
    }
  }

  // Add general recommendations
  if (patterns.some((p) => p.category === 'rate-limit')) {
    recommendations.push(
      'Consider implementing request throttling or exponential backoff.'
    );
  }

  if (patterns.some((p) => p.category === 'validation')) {
    recommendations.push(
      'Review input validation and add proper error handling.'
    );
  }

  return recommendations;
}
