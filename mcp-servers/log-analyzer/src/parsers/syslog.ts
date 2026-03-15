// SPDX-License-Identifier: MIT
/**
 * Syslog Parser
 * Parses RFC 5424 Syslog format and BSD Syslog (RFC 3164)
 */

import { BaseParser } from './base.js';
import type { LogEntry, LogFormat, LogLevel } from '../types.js';

/**
 * RFC 5424 Syslog format:
 * <PRI>VERSION TIMESTAMP HOSTNAME APP-NAME PROCID MSGID [STRUCTURED-DATA] MSG
 * Example: <34>1 2024-12-10T10:30:45.123456Z myhost myapp 1234 ID47 [exampleSDID@32473 iut="3" eventSource="Application"] message
 *
 * RFC 3164 BSD Syslog format:
 * <PRI>TIMESTAMP HOSTNAME TAG: MSG
 * Example: <34>Dec 10 10:30:45 myhost myapp[1234]: message
 */

// Syslog severity levels (RFC 5424)
const SYSLOG_SEVERITY: Record<number, LogLevel> = {
  0: 'FATAL',    // Emergency
  1: 'FATAL',    // Alert
  2: 'FATAL',    // Critical
  3: 'ERROR',    // Error
  4: 'WARN',     // Warning
  5: 'INFO',     // Notice
  6: 'INFO',     // Informational
  7: 'DEBUG',    // Debug
};

// Syslog facility names (for metadata)
const SYSLOG_FACILITY: Record<number, string> = {
  0: 'kern',
  1: 'user',
  2: 'mail',
  3: 'daemon',
  4: 'auth',
  5: 'syslog',
  6: 'lpr',
  7: 'news',
  8: 'uucp',
  9: 'cron',
  10: 'authpriv',
  11: 'ftp',
  12: 'ntp',
  13: 'security',
  14: 'console',
  15: 'solaris-cron',
  16: 'local0',
  17: 'local1',
  18: 'local2',
  19: 'local3',
  20: 'local4',
  21: 'local5',
  22: 'local6',
  23: 'local7',
};

/**
 * RFC 5424 Syslog parser
 */
export class Rfc5424Parser extends BaseParser {
  readonly format: LogFormat = 'syslog';

  // RFC 5424 pattern
  // <PRI>VERSION TIMESTAMP HOSTNAME APP-NAME PROCID MSGID [SD] MSG
  private readonly pattern = /^<(\d{1,3})>(\d+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s*(?:\[([^\]]*)\])?\s*(.*)$/;

  // Simpler RFC 5424 without structured data
  private readonly simplePattern = /^<(\d{1,3})>(\d+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.*)$/;

  parseLine(line: string, lineNumber: number): LogEntry | null {
    let match = line.match(this.pattern);
    let hasStructuredData = true;

    if (!match) {
      match = line.match(this.simplePattern);
      hasStructuredData = false;
    }

    if (!match) return null;

    const [, pri, version, timestamp, hostname, appName, procId, msgId, sdOrMsg, msg] = match;

    const priority = parseInt(pri, 10);
    const facility = Math.floor(priority / 8);
    const severity = priority % 8;

    const structuredData = hasStructuredData ? this.parseStructuredData(sdOrMsg || '') : undefined;
    const message = hasStructuredData ? (msg || '') : (sdOrMsg || '');

    return {
      timestamp: this.parseRfc5424Timestamp(timestamp),
      level: SYSLOG_SEVERITY[severity] || 'INFO',
      message: message.trim(),
      logger: appName !== '-' ? appName : undefined,
      metadata: {
        syslog: {
          version: parseInt(version, 10),
          facility: SYSLOG_FACILITY[facility] || `facility${facility}`,
          facilityCode: facility,
          severity,
          hostname: hostname !== '-' ? hostname : undefined,
          appName: appName !== '-' ? appName : undefined,
          procId: procId !== '-' ? procId : undefined,
          msgId: msgId !== '-' ? msgId : undefined,
          structuredData,
        },
      },
      raw: line,
      lineNumber,
    };
  }

  private parseRfc5424Timestamp(timestamp: string): Date {
    if (timestamp === '-') return new Date();

    // RFC 5424 timestamp: 2024-12-10T10:30:45.123456Z or 2024-12-10T10:30:45.123456+00:00
    const date = new Date(timestamp);
    return isNaN(date.getTime()) ? new Date() : date;
  }

  private parseStructuredData(sd: string): Record<string, Record<string, string>> | undefined {
    if (!sd || sd === '-') return undefined;

    const result: Record<string, Record<string, string>> = {};

    // Parse multiple SD-ELEMENTs: [sdId param="value" param2="value2"][sdId2 ...]
    const sdElementPattern = /\[([^\s\]]+)([^\]]*)\]/g;
    let sdMatch;

    while ((sdMatch = sdElementPattern.exec(sd)) !== null) {
      const [, sdId, params] = sdMatch;
      const sdParams: Record<string, string> = {};

      // Parse params: key="value" key2="value2"
      const paramPattern = /(\S+)="([^"]*)"/g;
      let paramMatch;

      while ((paramMatch = paramPattern.exec(params)) !== null) {
        const [, key, value] = paramMatch;
        sdParams[key] = value;
      }

      result[sdId] = sdParams;
    }

    return Object.keys(result).length > 0 ? result : undefined;
  }
}

/**
 * RFC 3164 BSD Syslog parser
 */
export class Rfc3164Parser extends BaseParser {
  readonly format: LogFormat = 'syslog';

  // RFC 3164 pattern: <PRI>TIMESTAMP HOSTNAME TAG[PID]: MSG
  // Timestamp format: Dec 10 10:30:45 (note: no year)
  private readonly pattern = /^<(\d{1,3})>(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+(\S+)\s+([^\[:]+)(?:\[(\d+)\])?:\s*(.*)$/;

  // Alternative without priority
  private readonly noPriPattern = /^(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+(\S+)\s+([^\[:]+)(?:\[(\d+)\])?:\s*(.*)$/;

  parseLine(line: string, lineNumber: number): LogEntry | null {
    let match = line.match(this.pattern);
    let hasPriority = true;

    if (!match) {
      match = line.match(this.noPriPattern);
      hasPriority = false;
    }

    if (!match) return null;

    if (hasPriority) {
      const [, pri, timestamp, hostname, tag, pid, message] = match;

      const priority = parseInt(pri, 10);
      const facility = Math.floor(priority / 8);
      const severity = priority % 8;

      return {
        timestamp: this.parseBsdTimestamp(timestamp),
        level: SYSLOG_SEVERITY[severity] || 'INFO',
        message: message.trim(),
        logger: tag.trim(),
        metadata: {
          syslog: {
            facility: SYSLOG_FACILITY[facility] || `facility${facility}`,
            facilityCode: facility,
            severity,
            hostname,
            tag: tag.trim(),
            pid: pid ? parseInt(pid, 10) : undefined,
          },
        },
        raw: line,
        lineNumber,
      };
    } else {
      const [, timestamp, hostname, tag, pid, message] = match;

      return {
        timestamp: this.parseBsdTimestamp(timestamp),
        level: 'INFO',
        message: message.trim(),
        logger: tag.trim(),
        metadata: {
          syslog: {
            hostname,
            tag: tag.trim(),
            pid: pid ? parseInt(pid, 10) : undefined,
          },
        },
        raw: line,
        lineNumber,
      };
    }
  }

  private parseBsdTimestamp(timestamp: string): Date {
    // Format: Dec 10 10:30:45 (no year)
    const match = timestamp.match(/(\w{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})/);
    if (!match) return new Date();

    const [, month, day, hour, min, sec] = match;

    const months: Record<string, number> = {
      Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
      Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
    };

    const now = new Date();
    const date = new Date(
      now.getFullYear(),
      months[month] ?? 0,
      parseInt(day),
      parseInt(hour),
      parseInt(min),
      parseInt(sec)
    );

    // If the date is in the future, it's probably from last year
    if (date > now) {
      date.setFullYear(now.getFullYear() - 1);
    }

    return date;
  }
}

/**
 * Systemd journal export format parser
 * Format: key=value pairs, with MESSAGE= containing the log message
 */
export class SystemdJournalParser extends BaseParser {
  readonly format: LogFormat = 'syslog';

  // JSON export format from journalctl -o json
  parseLine(line: string, lineNumber: number): LogEntry | null {
    const trimmed = line.trim();

    // Try JSON format
    if (trimmed.startsWith('{')) {
      try {
        const json = JSON.parse(trimmed);
        return this.parseJsonEntry(json, line, lineNumber);
      } catch {
        // Not valid JSON
      }
    }

    return null;
  }

  private parseJsonEntry(json: Record<string, unknown>, line: string, lineNumber: number): LogEntry | null {
    const message = String(json.MESSAGE || json.message || '');

    // Parse timestamp from __REALTIME_TIMESTAMP (microseconds since epoch)
    let timestamp: Date;
    if (json.__REALTIME_TIMESTAMP) {
      timestamp = new Date(Number(json.__REALTIME_TIMESTAMP) / 1000);
    } else if (json._SOURCE_REALTIME_TIMESTAMP) {
      timestamp = new Date(Number(json._SOURCE_REALTIME_TIMESTAMP) / 1000);
    } else {
      timestamp = new Date();
    }

    // Parse priority to level
    const priority = json.PRIORITY ? Number(json.PRIORITY) : 6;
    const level = SYSLOG_SEVERITY[priority] || 'INFO';

    return {
      timestamp,
      level,
      message,
      logger: String(json.SYSLOG_IDENTIFIER || json._COMM || ''),
      metadata: {
        systemd: {
          unit: json._SYSTEMD_UNIT,
          pid: json._PID ? Number(json._PID) : undefined,
          uid: json._UID ? Number(json._UID) : undefined,
          gid: json._GID ? Number(json._GID) : undefined,
          hostname: json._HOSTNAME,
          machineId: json._MACHINE_ID,
          bootId: json._BOOT_ID,
          transport: json._TRANSPORT,
        },
        syslog: {
          facility: json.SYSLOG_FACILITY ? SYSLOG_FACILITY[Number(json.SYSLOG_FACILITY)] : undefined,
          identifier: json.SYSLOG_IDENTIFIER,
        },
      },
      raw: line,
      lineNumber,
    };
  }
}

/**
 * Combined Syslog parser that handles RFC 5424, RFC 3164, and systemd journal
 */
export class SyslogCombinedParser extends BaseParser {
  readonly format: LogFormat = 'syslog';

  private rfc5424Parser = new Rfc5424Parser();
  private rfc3164Parser = new Rfc3164Parser();
  private journalParser = new SystemdJournalParser();

  parseLine(line: string, lineNumber: number): LogEntry | null {
    // Try RFC 5424 first (newer format)
    const rfc5424Entry = this.rfc5424Parser.parseLine(line, lineNumber);
    if (rfc5424Entry) return rfc5424Entry;

    // Try systemd journal (JSON format)
    const journalEntry = this.journalParser.parseLine(line, lineNumber);
    if (journalEntry) return journalEntry;

    // Try RFC 3164 (legacy format)
    const rfc3164Entry = this.rfc3164Parser.parseLine(line, lineNumber);
    if (rfc3164Entry) return rfc3164Entry;

    return null;
  }
}
