// SPDX-License-Identifier: MIT
/**
 * Level normalisation across ecosystems.
 */

import type { LogLevel } from '../types.js';

const ALIASES: Record<string, LogLevel> = {
  // generic
  TRACE: 'TRACE', FINEST: 'TRACE', FINER: 'TRACE', VERBOSE: 'TRACE', SILLY: 'TRACE',
  DEBUG: 'DEBUG', FINE: 'DEBUG', CONFIG: 'DEBUG',
  INFO: 'INFO', INFORMATION: 'INFO', INFORMATIONAL: 'INFO', NOTICE: 'INFO', HTTP: 'INFO', LOG: 'INFO',
  WARN: 'WARN', WARNING: 'WARN',
  ERROR: 'ERROR', ERR: 'ERROR', SEVERE: 'ERROR', DPANIC: 'ERROR',
  FATAL: 'FATAL', CRITICAL: 'FATAL', CRIT: 'FATAL', EMERG: 'FATAL', EMERGENCY: 'FATAL',
  ALERT: 'FATAL', PANIC: 'FATAL',
  // Microsoft.Extensions.Logging console abbreviations
  TRCE: 'TRACE', DBUG: 'DEBUG', FAIL: 'ERROR',
  // Ruby Logger / klog single letters
  T: 'TRACE', D: 'DEBUG', I: 'INFO', W: 'WARN', E: 'ERROR', F: 'FATAL',
};

/** Pino / bunyan numeric levels. */
const PINO: Record<number, LogLevel> = { 10: 'TRACE', 20: 'DEBUG', 30: 'INFO', 40: 'WARN', 50: 'ERROR', 60: 'FATAL' };

/** Syslog / journald PRIORITY (0 = emerg … 7 = debug). */
export const SYSLOG_SEVERITY: Record<number, LogLevel> = {
  0: 'FATAL', 1: 'FATAL', 2: 'FATAL', 3: 'ERROR', 4: 'WARN', 5: 'INFO', 6: 'INFO', 7: 'DEBUG',
};

/** OpenTelemetry SeverityNumber (1-4 TRACE, 5-8 DEBUG, 9-12 INFO, 13-16 WARN, 17-20 ERROR, 21-24 FATAL). */
export function otelSeverity(n: number): LogLevel | null {
  if (!Number.isFinite(n) || n < 1 || n > 24) return null;
  return (['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'] as LogLevel[])[Math.floor((n - 1) / 4)];
}

/** Map a level token to a LogLevel, or null when it is not a recognisable level. */
export function toLevel(value: unknown): LogLevel | null {
  if (typeof value === 'number') return PINO[value] ?? null;
  if (typeof value !== 'string') return null;
  const key = value.trim().toUpperCase();
  if (!key) return null;
  if (/^\d+$/.test(key)) return PINO[parseInt(key, 10)] ?? null;
  return ALIASES[key] ?? null;
}

/** Like toLevel but defaults to INFO — for formats where a level is optional. */
export function normalizeLevel(value: unknown): LogLevel {
  return toLevel(value) ?? 'INFO';
}

const ORDER: Record<LogLevel, number> = { TRACE: 0, DEBUG: 1, INFO: 2, WARN: 3, ERROR: 4, FATAL: 5 };

export function levelRank(level: LogLevel): number {
  return ORDER[level];
}

export function isErrorLevel(level: LogLevel): boolean {
  return level === 'ERROR' || level === 'FATAL';
}

export function emptyLevelCounts(): Record<LogLevel, number> {
  return { TRACE: 0, DEBUG: 0, INFO: 0, WARN: 0, ERROR: 0, FATAL: 0 };
}

/** Level implied by an HTTP status code. */
export function statusToLevel(status: number): LogLevel {
  if (status >= 500) return 'ERROR';
  if (status >= 400) return 'WARN';
  return 'INFO';
}
