// SPDX-License-Identifier: MIT
/**
 * Base Log Parser
 *
 * A parser only recognises the *first line* of a record. Joining continuation
 * lines (stack traces, multi-line messages) is the job of the multiline
 * assembler in `pipeline/assembler.ts`, which works the same for every format —
 * that is what makes Java `Caused by:` chains, Python tracebacks, Go panics and
 * .NET inner exceptions come out whole regardless of the log layout around them.
 */

import type { LogEntry, LogLevel, LogFormat } from '../types.js';
import { normalizeLevel, toLevel } from '../core/levels.js';
import { parseTimestamp } from '../core/timestamp.js';

export abstract class BaseParser {
  abstract readonly format: LogFormat;
  /**
   * Whether lines this parser does not recognise may be appended to the
   * previous entry. True for application logs (stack traces, wrapped
   * messages); false for one-record-per-line formats such as access logs,
   * where an unrecognised line is a parse failure, not a continuation.
   */
  readonly multiline: boolean = true;

  abstract parseLine(line: string, lineNumber: number): LogEntry | null;

  protected parseLevel(level: string): LogLevel {
    return normalizeLevel(level);
  }

  /** A recognised level token, or null (used to reject lines that only look similar). */
  protected strictLevel(level: string): LogLevel | null {
    return toLevel(level);
  }

  /** Parse a timestamp; null when unparseable (never "now"). */
  protected parseTimestamp(timestamp: string): Date | null {
    return parseTimestamp(timestamp);
  }
}

export { normalizeLevel };
