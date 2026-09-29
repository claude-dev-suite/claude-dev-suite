// SPDX-License-Identifier: MIT
/**
 * .NET text log parsers.
 *
 * Microsoft.Extensions.Logging console (default, multi-line):
 *   info: Microsoft.Hosting.Lifetime[14]
 *         Now listening on: http://localhost:5000
 *   fail: Microsoft.AspNetCore.Diagnostics.ExceptionHandlerMiddleware[1]
 *         An unhandled exception has occurred while executing the request.
 *         System.InvalidOperationException: boom
 *            at Program.<>c.<<Main>$>b__0_0() in /src/Program.cs:line 10
 * (optionally with a TimestampFormat prefix, or SingleLine = true)
 *
 * Serilog text sinks:   [10:30:45 INF] msg   /   2024-01-02 10:30:45.123 +00:00 [INF] msg
 * NLog default layout:  2024-01-02 10:30:45.1234|INFO|MyApp.Program|msg
 *
 * Serilog compact JSON (CLEF) and the MEL JSON console go through the JSON mapping.
 */

import { BaseParser } from './base.js';
import type { LogEntry, LogFormat, LogLevel } from '../types.js';

const SERILOG_LEVELS: Record<string, LogLevel> = {
  VRB: 'TRACE', DBG: 'DEBUG', INF: 'INFO', WRN: 'WARN', ERR: 'ERROR', FTL: 'FATAL',
};

const TS = '\\d{4}-\\d{2}-\\d{2}[T ]\\d{2}:\\d{2}:\\d{2}(?:[.,]\\d{1,7})?(?:\\s?(?:Z|[+-]\\d{2}:?\\d{2}))?';

export class DotnetParser extends BaseParser {
  readonly format: LogFormat;
  private readonly mel = new RegExp(
    `^(?:\\[?(${TS}|\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?)\\]?\\s+)?(trce|dbug|info|warn|fail|crit): ([^\\s\\[]+)\\[(-?\\d+)\\](?:\\s+(.*))?$`,
  );
  private readonly serilog = new RegExp(`^(?:(${TS})\\s+)?\\[(?:(\\d{2}:\\d{2}:\\d{2})\\s+)?(VRB|DBG|INF|WRN|ERR|FTL)\\]\\s?(.*)$`);
  private readonly nlog = new RegExp(`^(${TS})\\|([A-Za-z]+)\\|([^|]+)\\|(.*)$`);

  constructor(format: LogFormat = 'dotnet') {
    super();
    this.format = format;
  }

  parseLine(line: string, lineNumber: number): LogEntry | null {
    let m = line.match(this.mel);
    if (m) {
      const [, ts, lvl, category, eventId, message] = m;
      const dated = ts && ts.length > 12;
      return {
        timestamp: dated ? this.parseTimestamp(ts) : null,
        level: this.parseLevel(lvl),
        message: (message ?? '').trim(), // empty: the message is on the next (indented) line
        logger: category,
        metadata: { eventId: parseInt(eventId, 10), ...(ts && !dated ? { timeOfDay: ts } : {}) },
        raw: line,
        lineNumber,
      };
    }
    m = line.match(this.serilog);
    if (m) {
      const [, ts, time, lvl, message] = m;
      return {
        timestamp: ts ? this.parseTimestamp(ts) : null,
        level: SERILOG_LEVELS[lvl],
        message: message.trim(),
        metadata: time ? { timeOfDay: time } : {},
        raw: line,
        lineNumber,
      };
    }
    m = line.match(this.nlog);
    if (m) {
      const [, ts, lvl, logger, message] = m;
      const level = this.strictLevel(lvl);
      if (!level) return null;
      return { timestamp: this.parseTimestamp(ts), level, message: message.trim(), logger, raw: line, lineNumber };
    }
    return null;
  }
}
