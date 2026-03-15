// SPDX-License-Identifier: MIT
/**
 * Python Log Parser
 * Parses Python logging module output
 */

import { BaseParser } from './base.js';
import type { LogEntry, LogFormat } from '../types.js';

/**
 * Python logging default format:
 * 2024-12-13 10:30:45,123 - module - INFO - Message here
 *
 * Or with more details:
 * 2024-12-13 10:30:45,123 - module - INFO - module.py:42 - Message here
 */
export class PythonParser extends BaseParser {
  readonly format: LogFormat = 'python';

  // Standard Python logging patterns
  private readonly patterns = [
    // With filename and line number
    /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:,\d{3})?)\s+-\s+(\S+)\s+-\s+(\w+)\s+-\s+(\S+):(\d+)\s+-\s+(.*)$/,
    // Without filename
    /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:,\d{3})?)\s+-\s+(\S+)\s+-\s+(\w+)\s+-\s+(.*)$/,
    // Simple format
    /^(\w+):(\S+):(\d+)\s+(\w+)\s+(.*)$/,
    // Django format: [13/Dec/2024 10:30:45] "GET /path HTTP/1.1" 200 1234
    /^\[([^\]]+)\]\s+"([A-Z]+)\s+([^\s]+)\s+HTTP\/[\d.]+"\s+(\d+)\s+(\d+)$/,
  ];

  parseLine(line: string, lineNumber: number): LogEntry | null {
    for (let i = 0; i < this.patterns.length; i++) {
      const match = line.match(this.patterns[i]);
      if (match) {
        return this.parseMatch(match, i, line, lineNumber);
      }
    }

    // Try as Django-style log
    return this.parseDjangoLine(line, lineNumber);
  }

  private parseMatch(match: RegExpMatchArray, patternIndex: number, line: string, lineNumber: number): LogEntry | null {
    switch (patternIndex) {
      case 0: {
        // With filename and line number
        const [, timestamp, module, level, file, lineNo, message] = match;
        return {
          timestamp: this.parsePythonTimestamp(timestamp),
          level: this.parseLevel(level),
          message: message.trim(),
          logger: module,
          class: file,
          line: parseInt(lineNo, 10),
          raw: line,
          lineNumber,
        };
      }
      case 1: {
        // Without filename
        const [, timestamp, module, level, message] = match;
        return {
          timestamp: this.parsePythonTimestamp(timestamp),
          level: this.parseLevel(level),
          message: message.trim(),
          logger: module,
          raw: line,
          lineNumber,
        };
      }
      case 2: {
        // Simple format
        const [, level, module, lineNo, levelAgain, message] = match;
        return {
          timestamp: new Date(),
          level: this.parseLevel(levelAgain || level),
          message: message.trim(),
          logger: module,
          line: parseInt(lineNo, 10),
          raw: line,
          lineNumber,
        };
      }
      default:
        return null;
    }
  }

  private parseDjangoLine(line: string, lineNumber: number): LogEntry | null {
    // Django development server log
    // [13/Dec/2024 10:30:45] "GET /admin/ HTTP/1.1" 200 1234
    const djangoMatch = line.match(/^\[(\d{2}\/\w{3}\/\d{4}\s+\d{2}:\d{2}:\d{2})\]\s+"([A-Z]+)\s+([^\s"]+)\s+HTTP\/[\d.]+"\s+(\d+)\s+(\d+)$/);

    if (djangoMatch) {
      const [, dateStr, method, url, status, size] = djangoMatch;
      const statusNum = parseInt(status, 10);

      return {
        timestamp: this.parseDjangoDate(dateStr),
        level: statusNum >= 500 ? 'ERROR' : statusNum >= 400 ? 'WARN' : 'INFO',
        message: `${method} ${url} ${status}`,
        metadata: {
          method,
          url,
          status: statusNum,
          size: parseInt(size, 10),
        },
        raw: line,
        lineNumber,
      };
    }

    // Django/Gunicorn worker log
    // [2024-12-13 10:30:45 +0000] [12345] [INFO] Message
    const gunicornMatch = line.match(/^\[(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\s+[+-]\d{4})?)\]\s+\[(\d+)\]\s+\[(\w+)\]\s+(.*)$/);

    if (gunicornMatch) {
      const [, timestamp, pid, level, message] = gunicornMatch;
      return {
        timestamp: this.parseTimestamp(timestamp),
        level: this.parseLevel(level),
        message: message.trim(),
        metadata: { pid: parseInt(pid, 10) },
        raw: line,
        lineNumber,
      };
    }

    // uvicorn/hypercorn format
    // INFO:     127.0.0.1:54321 - "GET / HTTP/1.1" 200
    const uvicornMatch = line.match(/^(\w+):\s+(.*)$/);
    if (uvicornMatch) {
      const [, level, message] = uvicornMatch;
      return {
        timestamp: new Date(),
        level: this.parseLevel(level),
        message: message.trim(),
        raw: line,
        lineNumber,
      };
    }

    return null;
  }

  private parsePythonTimestamp(timestamp: string): Date {
    // Python uses comma for milliseconds: 2024-12-13 10:30:45,123
    const normalized = timestamp.replace(',', '.');
    return this.parseTimestamp(normalized);
  }

  private parseDjangoDate(dateStr: string): Date {
    // Format: 13/Dec/2024 10:30:45
    const months: Record<string, number> = {
      'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
      'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11,
    };

    const match = dateStr.match(/(\d{2})\/(\w{3})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/);
    if (match) {
      const [, day, month, year, hour, min, sec] = match;
      return new Date(
        parseInt(year),
        months[month],
        parseInt(day),
        parseInt(hour),
        parseInt(min),
        parseInt(sec)
      );
    }

    return new Date();
  }
}
