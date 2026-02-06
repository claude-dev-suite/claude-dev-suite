// SPDX-License-Identifier: MIT
/**
 * Spring Boot Log Parser
 * Parses Spring Boot default log format (Logback)
 */

import { BaseParser } from './base.js';
import type { LogEntry, LogFormat } from '../types.js';

/**
 * Spring Boot default format:
 * 2024-12-13 10:30:45.123  INFO 12345 --- [main] c.e.MyClass : Message here
 * 2024-12-13T10:30:45.123+00:00  INFO 12345 --- [main] c.e.MyClass : Message here
 */
export class SpringBootParser extends BaseParser {
  readonly format: LogFormat = 'spring-boot';

  // Standard Spring Boot log pattern
  private readonly pattern = /^(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:[+-]\d{2}:\d{2})?)\s+(\w+)\s+(\d+)\s+---\s+\[([^\]]+)\]\s+([^\s:]+)\s*:\s*(.*)$/;

  parseLine(line: string, lineNumber: number): LogEntry | null {
    const match = line.match(this.pattern);
    if (!match) return null;

    const [, timestamp, level, pid, thread, logger, message] = match;

    // Extract class and method from logger if possible
    let className: string | undefined;
    let methodName: string | undefined;

    // Logger format: c.example.MyClass or com.example.MyClass
    const loggerParts = logger.split('.');
    if (loggerParts.length > 0) {
      className = loggerParts[loggerParts.length - 1];
    }

    // Extract request/trace IDs from MDC if present
    let requestId: string | undefined;
    let traceId: string | undefined;
    let spanId: string | undefined;

    // Common MDC patterns: [requestId=xxx] or {traceId=xxx}
    const mdcMatch = message.match(/\[(?:requestId|correlationId)=([^\]]+)\]/);
    if (mdcMatch) {
      requestId = mdcMatch[1];
    }

    const traceMatch = message.match(/(?:traceId|X-B3-TraceId)=([a-f0-9]+)/i);
    if (traceMatch) {
      traceId = traceMatch[1];
    }

    const spanMatch = message.match(/(?:spanId|X-B3-SpanId)=([a-f0-9]+)/i);
    if (spanMatch) {
      spanId = spanMatch[1];
    }

    return {
      timestamp: this.parseTimestamp(timestamp),
      level: this.parseLevel(level),
      message: message.trim(),
      logger,
      thread,
      class: className,
      requestId,
      traceId,
      spanId,
      metadata: {
        pid: parseInt(pid, 10),
      },
      raw: line,
      lineNumber,
    };
  }
}

/**
 * Log4j2 format parser
 * Pattern: %d{yyyy-MM-dd HH:mm:ss.SSS} [%t] %-5level %logger{36} - %msg%n
 * Also supports: %d{yyyy-MM-dd HH:mm:ss,SSS} (comma separator)
 */
export class Log4j2Parser extends BaseParser {
  readonly format: LogFormat = 'log4j';

  // Support both . and , for milliseconds, multiple spaces after level
  private readonly patterns = [
    // Standard: 2024-12-13 10:30:45,123 [main] INFO  com.example.App - Message
    /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[.,]\d{3})\s+\[([^\]]+)\]\s+(\w+)\s+([^\s]+)\s+-\s+(.*)$/,
    // Without milliseconds
    /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s+\[([^\]]+)\]\s+(\w+)\s+([^\s]+)\s+-\s+(.*)$/,
    // With optional thread brackets
    /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}[.,]?\d*)\s+(\w+)\s+\[([^\]]+)\]\s+([^\s]+)\s+-\s+(.*)$/,
  ];

  parseLine(line: string, lineNumber: number): LogEntry | null {
    for (const pattern of this.patterns) {
      const match = line.match(pattern);
      if (match) {
        // Handle different capture group orders
        let timestamp: string, thread: string, level: string, logger: string, message: string;

        if (match.length === 6) {
          if (match[2].match(/^\w+$/)) {
            // Pattern 3: level before thread
            [, timestamp, level, thread, logger, message] = match;
          } else {
            // Pattern 1,2: thread before level
            [, timestamp, thread, level, logger, message] = match;
          }
        } else {
          continue;
        }

        // Normalize timestamp (replace comma with dot)
        const normalizedTimestamp = timestamp.replace(',', '.');

        return {
          timestamp: this.parseTimestamp(normalizedTimestamp),
          level: this.parseLevel(level),
          message: message.trim(),
          logger,
          thread,
          raw: line,
          lineNumber,
        };
      }
    }

    return null;
  }
}

/**
 * Logback format parser (more flexible)
 * Common pattern: %d{HH:mm:ss.SSS} [%thread] %-5level %logger{36} - %msg%n
 */
export class LogbackParser extends BaseParser {
  readonly format: LogFormat = 'logback';

  private readonly patterns = [
    // With date and thread
    /^(\d{2}:\d{2}:\d{2}(?:\.\d{3})?)\s+\[([^\]]+)\]\s+(\w+)\s+([^\s-]+)\s+-\s+(.*)$/,
    // Full date
    /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d{3})?)\s+\[([^\]]+)\]\s+(\w+)\s+([^\s-]+)\s+-\s+(.*)$/,
    // Without thread
    /^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d{3})?)\s+(\w+)\s+([^\s-]+)\s+-\s+(.*)$/,
  ];

  parseLine(line: string, lineNumber: number): LogEntry | null {
    for (const pattern of this.patterns) {
      const match = line.match(pattern);
      if (match) {
        if (match.length === 6) {
          // With thread
          const [, timestamp, thread, level, logger, message] = match;
          return {
            timestamp: this.parseTimestamp(timestamp),
            level: this.parseLevel(level),
            message: message.trim(),
            logger,
            thread,
            raw: line,
            lineNumber,
          };
        } else if (match.length === 5) {
          // Without thread
          const [, timestamp, level, logger, message] = match;
          return {
            timestamp: this.parseTimestamp(timestamp),
            level: this.parseLevel(level),
            message: message.trim(),
            logger,
            raw: line,
            lineNumber,
          };
        }
      }
    }

    return null;
  }
}
