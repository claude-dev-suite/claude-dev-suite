// SPDX-License-Identifier: MIT
/**
 * Java log parsers: Spring Boot default layout, Log4j2 and Logback patterns.
 */

import { BaseParser } from './base.js';
import type { LogEntry, LogFormat } from '../types.js';

/**
 * Spring Boot default format (2.x and 3.x):
 *   2024-12-13 10:30:45.123  INFO 12345 --- [main] c.e.MyClass : Message
 *   2024-12-13T10:30:45.123+01:00  INFO 12345 --- [myapp] [    main] c.e.MyClass : Message
 *   2024-12-13T10:30:45.123Z  INFO 1 --- [app] [nio-8080-exec-1] [6f9f…,1a2b…] c.e.C : Message
 */
export class SpringBootParser extends BaseParser {
  readonly format: LogFormat = 'spring-boot';

  private readonly pattern =
    /^(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:[.,]\d{1,9})?(?:Z|[+-]\d{2}:?\d{2})?)\s+([A-Za-z]+)\s+(?:(\d+)\s+)?---\s+((?:\[[^\]]*\]\s*)+)\s*([^\s:][^\s]*?)\s*:\s?(.*)$/;

  parseLine(line: string, lineNumber: number): LogEntry | null {
    const match = line.match(this.pattern);
    if (!match) return null;
    const [, timestamp, level, pid, brackets, logger, message] = match;
    if (!this.strictLevel(level)) return null;

    // Bracket groups: [app] [thread] [traceId,spanId] — order varies by version.
    const groups = [...brackets.matchAll(/\[([^\]]*)\]/g)].map((m) => m[1].trim());
    let thread: string | undefined;
    let app: string | undefined;
    let traceId: string | undefined;
    let spanId: string | undefined;
    const rest: string[] = [];
    for (const g of groups) {
      const corr = g.match(/^(?:[\w.-]*,)?([0-9a-f]{16,32})[,-]([0-9a-f]{16})(?:,\w+)?$/);
      if (corr) { traceId = corr[1]; spanId = corr[2]; continue; }
      if (g === '' || g === ',' || g === '-') continue;
      rest.push(g);
    }
    if (rest.length >= 2) { app = rest[0]; thread = rest[rest.length - 1]; }
    else thread = rest[0];

    const mdc = message.match(/\[(?:requestId|correlationId)=([^\]]+)\]/);
    return {
      timestamp: this.parseTimestamp(timestamp),
      level: this.parseLevel(level),
      message: message.trim(),
      logger,
      thread,
      class: logger.split('.').pop(),
      requestId: mdc?.[1],
      traceId,
      spanId,
      metadata: {
        ...(pid ? { pid: parseInt(pid, 10) } : {}),
        ...(app ? { application: app } : {}),
      },
      raw: line,
      lineNumber,
    };
  }
}

/**
 * Log4j2 pattern: %d{yyyy-MM-dd HH:mm:ss.SSS} [%t] %-5level %logger{36} - %msg%n
 * (comma or dot millis; level/thread order either way).
 */
export class Log4j2Parser extends BaseParser {
  readonly format: LogFormat = 'log4j';

  private readonly threadFirst =
    /^(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:[.,]\d{1,9})?(?:Z|[+-]\d{2}:?\d{2})?)\s+\[([^\]]+)\]\s+([A-Za-z]+)\s+(\S+)\s+-\s?(.*)$/;
  private readonly levelFirst =
    /^(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:[.,]\d{1,9})?(?:Z|[+-]\d{2}:?\d{2})?)\s+([A-Za-z]+)\s+\[([^\]]+)\]\s+(\S+)\s+-\s?(.*)$/;

  parseLine(line: string, lineNumber: number): LogEntry | null {
    let m = line.match(this.threadFirst);
    let timestamp: string, thread: string, level: string, logger: string, message: string;
    if (m) {
      [, timestamp, thread, level, logger, message] = m;
    } else {
      m = line.match(this.levelFirst);
      if (!m) return null;
      [, timestamp, level, thread, logger, message] = m;
    }
    if (!this.strictLevel(level)) return null;
    return {
      timestamp: this.parseTimestamp(timestamp),
      level: this.parseLevel(level),
      message: message.trim(),
      logger,
      thread,
      raw: line,
      lineNumber,
    };
  }
}

/**
 * Logback: %d{HH:mm:ss.SSS} [%thread] %-5level %logger{36} - %msg%n
 * A time-of-day-only stamp has no date, so the entry's timestamp is null and
 * the time is kept in metadata.timeOfDay.
 */
export class LogbackParser extends BaseParser {
  readonly format: LogFormat = 'logback';

  private readonly timeOnly = /^(\d{2}:\d{2}:\d{2}(?:[.,]\d{1,9})?)\s+\[([^\]]+)\]\s+([A-Za-z]+)\s+(\S+)\s+-\s?(.*)$/;
  private readonly full =
    /^(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:[.,]\d{1,9})?(?:Z|[+-]\d{2}:?\d{2})?)\s+(?:\[([^\]]+)\]\s+)?([A-Za-z]+)\s+(\S+)\s+-\s?(.*)$/;

  parseLine(line: string, lineNumber: number): LogEntry | null {
    let m = line.match(this.full);
    if (m) {
      const [, timestamp, thread, level, logger, message] = m;
      if (!this.strictLevel(level)) return null;
      return {
        timestamp: this.parseTimestamp(timestamp),
        level: this.parseLevel(level),
        message: message.trim(),
        logger,
        thread,
        raw: line,
        lineNumber,
      };
    }
    m = line.match(this.timeOnly);
    if (!m) return null;
    const [, time, thread, level, logger, message] = m;
    if (!this.strictLevel(level)) return null;
    return {
      timestamp: null,
      level: this.parseLevel(level),
      message: message.trim(),
      logger,
      thread,
      metadata: { timeOfDay: time },
      raw: line,
      lineNumber,
    };
  }
}
