// SPDX-License-Identifier: MIT
/**
 * Fallback parsers.
 *
 * PlainParser — for logs no specific parser recognises. In "timestamped" mode
 * (most sample lines start with a timestamp) a new entry starts exactly at a
 * leading timestamp, so everything else is continuation; in "line" mode every
 * non-indented line is an entry. Level comes from a level word near the start.
 *
 * CustomRegexParser — a user-supplied regex with named groups:
 *   timestamp|time|ts, level|severity, message|msg, logger, thread,
 *   trace_id|traceId, span_id|spanId, request_id|requestId; any other named
 *   group becomes a structured field.
 */

import { BaseParser } from './base.js';
import type { LogEntry, LogFormat, LogLevel } from '../types.js';
import { LEADING_TIMESTAMP_RE, parseTimestamp } from '../core/timestamp.js';
import { toLevel } from '../core/levels.js';
import { safeRegex } from '../utils.js';

const LEVEL_WORD = /(?:^|[\s\[(|<:])(TRACE|DEBUG|INFO|NOTICE|WARN(?:ING)?|ERROR|ERR|SEVERE|FATAL|CRIT(?:ICAL)?|EMERG|trace|debug|info|warn(?:ing)?|error|fatal|critical)(?=$|[\s\])|>:\-,])/;

export function levelNearStart(text: string): { level: LogLevel; index: number; length: number } | null {
  const m = text.slice(0, 80).match(LEVEL_WORD);
  if (!m || m.index === undefined) return null;
  const level = toLevel(m[1]);
  if (!level) return null;
  const offset = m[0].indexOf(m[1]);
  return { level, index: m.index + offset, length: m[1].length };
}

export class PlainParser extends BaseParser {
  readonly format: LogFormat = 'plain';
  constructor(private readonly mode: 'timestamped' | 'line' = 'line') {
    super();
  }

  parseLine(line: string, lineNumber: number): LogEntry | null {
    if (!line.trim()) return null;
    if (this.mode === 'timestamped') {
      const m = line.match(LEADING_TIMESTAMP_RE);
      if (!m) return null;
      const ts = parseTimestamp(m[0].replace(/^\[|\]$/g, ''));
      if (!ts) return null;
      return this.build(line, lineNumber, ts, line.slice(m[0].length));
    }
    if (/^\s/.test(line)) return null;
    return this.build(line, lineNumber, null, line);
  }

  private build(line: string, lineNumber: number, ts: Date | null, rest: string): LogEntry {
    let message = rest.trim();
    let level: LogLevel = 'INFO';
    const lv = levelNearStart(rest);
    if (lv) {
      level = lv.level;
      // Drop a level word that sits right at the start ("INFO  message", "[WARN] message").
      const before = rest.slice(0, lv.index).replace(/[\s\[(<|]/g, '');
      if (before === '') message = rest.slice(lv.index + lv.length).replace(/^[\])>|:\s-]+/, '').trim();
    }
    return { timestamp: ts, level, message, raw: line, lineNumber };
  }
}

const GROUP_ALIASES: Record<string, keyof LogEntry> = {
  timestamp: 'timestamp', time: 'timestamp', ts: 'timestamp', datetime: 'timestamp',
  level: 'level', severity: 'level', lvl: 'level',
  message: 'message', msg: 'message',
  logger: 'logger', thread: 'thread',
  trace_id: 'traceId', traceId: 'traceId', span_id: 'spanId', spanId: 'spanId',
  request_id: 'requestId', requestId: 'requestId',
};

export class CustomRegexParser extends BaseParser {
  readonly format: LogFormat = 'custom';
  private readonly re: RegExp;

  constructor(pattern: string) {
    super();
    this.re = safeRegex(pattern);
    const probe = new RegExp(`${pattern}|`).exec('');
    const groups = probe?.groups ? Object.keys(probe.groups) : [];
    if (groups.length === 0) {
      throw new Error('customPattern must use named groups, e.g. (?<timestamp>\\S+ \\S+) (?<level>\\w+) (?<message>.*)');
    }
  }

  parseLine(line: string, lineNumber: number): LogEntry | null {
    const m = this.re.exec(line);
    if (!m || !m.groups) return null;
    const entry: LogEntry = { timestamp: null, level: 'INFO', message: line, raw: line, lineNumber };
    const metadata: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(m.groups)) {
      if (value === undefined) continue;
      const target = GROUP_ALIASES[name];
      if (target === 'timestamp') entry.timestamp = parseTimestamp(value);
      else if (target === 'level') entry.level = toLevel(value) ?? 'INFO';
      else if (target === 'message') entry.message = value;
      else if (target) (entry as unknown as Record<string, unknown>)[target] = value;
      else metadata[name] = /^-?\d+(?:\.\d+)?$/.test(value) && value.length < 16 ? Number(value) : value;
    }
    if (Object.keys(metadata).length) entry.metadata = metadata;
    return entry;
  }
}
