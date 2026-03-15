// SPDX-License-Identifier: MIT
/**
 * Base Log Parser
 * Common functionality for all log parsers
 */

import { readFile } from 'fs/promises';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import type { LogEntry, LogLevel, LogFormat, ExceptionInfo } from '../types.js';

export interface ParseOptions {
  startTime?: Date;
  endTime?: Date;
  levels?: LogLevel[];
  limit?: number;
  offset?: number;
  filter?: RegExp;
}

export interface ParseResult {
  entries: LogEntry[];
  totalLines: number;
  parsedEntries: number;
  failedLines: number;
}

/**
 * Abstract base parser class
 */
export abstract class BaseParser {
  abstract readonly format: LogFormat;
  abstract parseLine(line: string, lineNumber: number): LogEntry | null;

  /**
   * Parse a log file
   */
  async parseFile(filePath: string, options: ParseOptions = {}): Promise<ParseResult> {
    const { startTime, endTime, levels, limit, offset = 0, filter } = options;

    const entries: LogEntry[] = [];
    let totalLines = 0;
    let parsedEntries = 0;
    let failedLines = 0;
    let skippedByOffset = 0;

    const fileStream = createReadStream(filePath, { encoding: 'utf-8' });
    const rl = createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    let currentEntry: LogEntry | null = null;
    let stackTraceLines: string[] = [];

    for await (const line of rl) {
      totalLines++;

      // Try to parse as new entry
      const entry = this.parseLine(line, totalLines);

      if (entry) {
        // Save previous entry if exists
        if (currentEntry) {
          if (stackTraceLines.length > 0) {
            currentEntry.stackTrace = stackTraceLines;
            currentEntry.exception = this.parseStackTrace(stackTraceLines);
          }

          if (this.shouldInclude(currentEntry, { startTime, endTime, levels, filter })) {
            if (skippedByOffset < offset) {
              skippedByOffset++;
            } else if (!limit || entries.length < limit) {
              entries.push(currentEntry);
            }
          }
          parsedEntries++;
        }

        currentEntry = entry;
        stackTraceLines = [];
      } else if (currentEntry && this.isStackTraceLine(line)) {
        // Continuation of stack trace
        stackTraceLines.push(line);
      } else if (currentEntry && this.isContinuationLine(line)) {
        // Multi-line message
        currentEntry.message += '\n' + line.trim();
      } else if (line.trim()) {
        failedLines++;
      }
    }

    // Don't forget the last entry
    if (currentEntry) {
      if (stackTraceLines.length > 0) {
        currentEntry.stackTrace = stackTraceLines;
        currentEntry.exception = this.parseStackTrace(stackTraceLines);
      }

      if (this.shouldInclude(currentEntry, { startTime, endTime, levels, filter })) {
        if (skippedByOffset < offset) {
          // Skip
        } else if (!limit || entries.length < limit) {
          entries.push(currentEntry);
        }
      }
      parsedEntries++;
    }

    return {
      entries,
      totalLines,
      parsedEntries,
      failedLines,
    };
  }

  /**
   * Check if entry matches filters
   */
  protected shouldInclude(
    entry: LogEntry,
    options: Pick<ParseOptions, 'startTime' | 'endTime' | 'levels' | 'filter'>
  ): boolean {
    const { startTime, endTime, levels, filter } = options;

    if (startTime && entry.timestamp < startTime) return false;
    if (endTime && entry.timestamp > endTime) return false;
    if (levels && levels.length > 0 && !levels.includes(entry.level)) return false;
    if (filter && !filter.test(entry.message) && !filter.test(entry.raw)) return false;

    return true;
  }

  /**
   * Check if line is part of stack trace
   */
  protected isStackTraceLine(line: string): boolean {
    return (
      /^\s+at\s+/.test(line) ||           // Java/Node.js
      /^\s+File\s+"/.test(line) ||         // Python
      /^Caused by:/.test(line) ||          // Java
      /^\s+\.\.\.\s+\d+\s+more/.test(line) // Java truncated
    );
  }

  /**
   * Check if line is continuation of previous message
   */
  protected isContinuationLine(line: string): boolean {
    return /^\s+/.test(line) && !this.isStackTraceLine(line);
  }

  /**
   * Parse stack trace lines into structured exception
   */
  protected parseStackTrace(lines: string[]): ExceptionInfo | undefined {
    if (lines.length === 0) return undefined;

    const firstLine = lines[0];

    // Try to extract exception type and message
    // Java format: "java.lang.NullPointerException: message"
    const javaMatch = firstLine.match(/^([\w.]+(?:Exception|Error|Throwable)):\s*(.*)$/);
    if (javaMatch) {
      return {
        type: javaMatch[1],
        message: javaMatch[2],
        stackTrace: lines.slice(1),
        causedBy: this.findCausedBy(lines),
      };
    }

    // Node.js format: "Error: message"
    const nodeMatch = firstLine.match(/^(\w+Error):\s*(.*)$/);
    if (nodeMatch) {
      return {
        type: nodeMatch[1],
        message: nodeMatch[2],
        stackTrace: lines.slice(1),
      };
    }

    // Generic
    return {
      type: 'Unknown',
      message: firstLine,
      stackTrace: lines.slice(1),
    };
  }

  /**
   * Find "Caused by" chain in stack trace
   */
  protected findCausedBy(lines: string[]): ExceptionInfo | undefined {
    const causedByIndex = lines.findIndex((l) => l.startsWith('Caused by:'));
    if (causedByIndex === -1) return undefined;

    const causedByLine = lines[causedByIndex].replace('Caused by: ', '');
    const remainingLines = lines.slice(causedByIndex + 1);

    const match = causedByLine.match(/^([\w.]+(?:Exception|Error|Throwable)):\s*(.*)$/);
    if (match) {
      return {
        type: match[1],
        message: match[2],
        stackTrace: remainingLines.filter((l) => l.startsWith('\tat ')),
        causedBy: this.findCausedBy(remainingLines),
      };
    }

    return undefined;
  }

  /**
   * Parse log level string
   */
  protected parseLevel(level: string): LogLevel {
    const normalized = level.toUpperCase().trim();

    switch (normalized) {
      case 'TRACE':
        return 'TRACE';
      case 'DEBUG':
        return 'DEBUG';
      case 'INFO':
      case 'INFORMATION':
        return 'INFO';
      case 'WARN':
      case 'WARNING':
        return 'WARN';
      case 'ERROR':
      case 'ERR':
      case 'SEVERE':
        return 'ERROR';
      case 'FATAL':
      case 'CRITICAL':
        return 'FATAL';
      default:
        return 'INFO';
    }
  }

  /**
   * Parse timestamp string
   */
  protected parseTimestamp(timestamp: string): Date {
    // Try various formats
    const date = new Date(timestamp);
    if (!isNaN(date.getTime())) return date;

    // Spring Boot format: 2024-12-13 10:30:45.123
    const springMatch = timestamp.match(
      /(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?/
    );
    if (springMatch) {
      const [, year, month, day, hour, min, sec, ms] = springMatch;
      return new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        parseInt(hour),
        parseInt(min),
        parseInt(sec),
        parseInt(ms || '0')
      );
    }

    // Fallback to now
    return new Date();
  }
}

/**
 * Normalize log level from various formats
 */
export function normalizeLevel(level: string): LogLevel {
  const upper = level.toUpperCase().trim();

  const mapping: Record<string, LogLevel> = {
    'TRACE': 'TRACE',
    'DEBUG': 'DEBUG',
    'INFO': 'INFO',
    'INFORMATION': 'INFO',
    'WARN': 'WARN',
    'WARNING': 'WARN',
    'ERROR': 'ERROR',
    'ERR': 'ERROR',
    'SEVERE': 'ERROR',
    'FATAL': 'FATAL',
    'CRITICAL': 'FATAL',
  };

  return mapping[upper] || 'INFO';
}
