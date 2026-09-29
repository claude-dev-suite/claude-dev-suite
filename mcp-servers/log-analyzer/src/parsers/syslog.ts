// SPDX-License-Identifier: MIT
/**
 * Syslog Parser
 *
 * RFC 5424:  <PRI>VERSION TIMESTAMP HOSTNAME APP-NAME PROCID MSGID STRUCTURED-DATA [MSG]
 *            <34>1 2024-12-10T10:30:45.123Z myhost myapp 1234 ID47 [ex@32473 iut="3"][b x="y"] message
 * RFC 3164:  <PRI>Mmm dd hh:mm:ss HOSTNAME TAG[PID]: MSG   (PRI optional, as in /var/log/syslog)
 * journald:  `journalctl -o json` lines (delegated to the JSON mapping).
 */

import { BaseParser } from './base.js';
import { JsonParser } from './json.js';
import type { LogEntry, LogFormat } from '../types.js';
import { SYSLOG_SEVERITY } from '../core/levels.js';
import { monthIndex, parseYearless } from '../core/timestamp.js';

const SYSLOG_FACILITY: Record<number, string> = {
  0: 'kern', 1: 'user', 2: 'mail', 3: 'daemon', 4: 'auth', 5: 'syslog', 6: 'lpr', 7: 'news',
  8: 'uucp', 9: 'cron', 10: 'authpriv', 11: 'ftp', 12: 'ntp', 13: 'security', 14: 'console',
  15: 'solaris-cron', 16: 'local0', 17: 'local1', 18: 'local2', 19: 'local3', 20: 'local4',
  21: 'local5', 22: 'local6', 23: 'local7',
};

function priority(pri: string): { facility: string; facilityCode: number; severity: number } {
  const p = parseInt(pri, 10);
  const facilityCode = Math.floor(p / 8);
  return { facility: SYSLOG_FACILITY[facilityCode] ?? `facility${facilityCode}`, facilityCode, severity: p % 8 };
}

const nil = (v: string) => (v === '-' ? undefined : v);

export class Rfc5424Parser extends BaseParser {
  readonly format: LogFormat = 'syslog';
  // SD is either NILVALUE or one or more [id param="value" ...] elements (values may contain escaped ] and ").
  private readonly pattern =
    /^<(\d{1,3})>(\d{1,2})\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(-|(?:\[(?:[^\]"\\]|\\.|"(?:[^"\\]|\\.)*")*\])+)(?:\s+(.*))?$/;

  parseLine(line: string, lineNumber: number): LogEntry | null {
    const m = line.match(this.pattern);
    if (!m) return null;
    const [, pri, version, ts, hostname, appName, procId, msgId, sd, msg] = m;
    const p = priority(pri);
    const structuredData = parseStructuredData(sd);
    return {
      timestamp: ts === '-' ? null : this.parseTimestamp(ts),
      level: SYSLOG_SEVERITY[p.severity] ?? 'INFO',
      message: (msg ?? '').replace(/^﻿/, '').trim(),
      logger: nil(appName),
      metadata: {
        syslog: {
          version: parseInt(version, 10),
          ...p,
          hostname: nil(hostname),
          appName: nil(appName),
          procId: nil(procId),
          msgId: nil(msgId),
          structuredData,
        },
        // Flatten SD params so they are queryable as plain fields.
        ...(structuredData ? Object.assign({}, ...Object.values(structuredData)) : {}),
      },
      raw: line,
      lineNumber,
    };
  }
}

function parseStructuredData(sd: string): Record<string, Record<string, string>> | undefined {
  if (!sd || sd === '-') return undefined;
  const result: Record<string, Record<string, string>> = {};
  const element = /\[([^\s\]]+)((?:[^\]"\\]|\\.|"(?:[^"\\]|\\.)*")*)\]/g;
  let em: RegExpExecArray | null;
  while ((em = element.exec(sd)) !== null) {
    const params: Record<string, string> = {};
    const param = /([^\s=]+)="((?:[^"\\]|\\.)*)"/g;
    let pm: RegExpExecArray | null;
    while ((pm = param.exec(em[2])) !== null) params[pm[1]] = pm[2].replace(/\\(["\\\]])/g, '$1');
    result[em[1]] = params;
  }
  return Object.keys(result).length ? result : undefined;
}

export class Rfc3164Parser extends BaseParser {
  readonly format: LogFormat = 'syslog';
  private readonly pattern = /^(?:<(\d{1,3})>)?(\w{3})\s+(\d{1,2})\s+(\d{2}:\d{2}:\d{2})\s+(\S+)\s+([^\s\[:]+)(?:\[(\d+)\])?:\s?(.*)$/;

  parseLine(line: string, lineNumber: number): LogEntry | null {
    const m = line.match(this.pattern);
    if (!m) return null;
    const [, pri, mon, day, hms, hostname, tag, pid, message] = m;
    const month = monthIndex(mon);
    if (month < 0) return null;
    const p = pri !== undefined ? priority(pri) : undefined;
    return {
      timestamp: parseYearless(month, parseInt(day, 10), hms),
      level: p ? SYSLOG_SEVERITY[p.severity] ?? 'INFO' : inferLevel(message),
      message: message.trim(),
      logger: tag,
      metadata: {
        syslog: { ...(p ?? {}), hostname, tag, pid: pid ? parseInt(pid, 10) : undefined },
        timestampYearInferred: true,
      },
      raw: line,
      lineNumber,
    };
  }
}

/** Without a PRI the level is only knowable from the text. */
function inferLevel(message: string): LogEntry['level'] {
  if (/\b(?:emerg|panic|fatal|critical)\b/i.test(message)) return 'FATAL';
  if (/\b(?:error|err|failed|failure)\b/i.test(message)) return 'ERROR';
  if (/\bwarn(?:ing)?\b/i.test(message)) return 'WARN';
  if (/\bdebug\b/i.test(message)) return 'DEBUG';
  return 'INFO';
}

/** journalctl -o json */
export class SystemdJournalParser extends JsonParser {
  constructor() {
    super('journald');
  }
}

export class SyslogCombinedParser extends BaseParser {
  readonly format: LogFormat = 'syslog';
  private readonly rfc5424 = new Rfc5424Parser();
  private readonly rfc3164 = new Rfc3164Parser();
  private readonly journal = new SystemdJournalParser();

  parseLine(line: string, lineNumber: number): LogEntry | null {
    return this.rfc5424.parseLine(line, lineNumber)
      ?? this.rfc3164.parseLine(line, lineNumber)
      ?? (line.includes('__REALTIME_TIMESTAMP') || line.includes('"MESSAGE"') ? this.journal.parseLine(line, lineNumber) : null);
  }
}
