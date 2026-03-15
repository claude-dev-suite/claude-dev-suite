// SPDX-License-Identifier: MIT
/**
 * Apache Log Parser
 * Parses Apache access and error logs
 */

import { BaseParser } from './base.js';
import type { LogEntry, LogFormat, LogLevel } from '../types.js';

/**
 * Apache Access Log - Combined Log Format:
 * 192.168.1.1 - user [10/Dec/2024:10:30:45 +0000] "GET /api/users HTTP/1.1" 200 1234 "https://example.com" "Mozilla/5.0..."
 *
 * Common Log Format (CLF):
 * 192.168.1.1 - user [10/Dec/2024:10:30:45 +0000] "GET /api/users HTTP/1.1" 200 1234
 */
export class ApacheAccessParser extends BaseParser {
  readonly format: LogFormat = 'apache';

  // Combined Log Format pattern
  private readonly combinedPattern = /^(\S+)\s+(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+"([^"]*)"\s+(\d+)\s+(\d+|-)\s+"([^"]*)"\s+"([^"]*)"$/;

  // Common Log Format (CLF) pattern
  private readonly clfPattern = /^(\S+)\s+(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+"([^"]*)"\s+(\d+)\s+(\d+|-)$/;

  // Virtual host format: host ip ident user [time] "request" status bytes "referer" "user-agent"
  private readonly vhostPattern = /^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+"([^"]*)"\s+(\d+)\s+(\d+|-)\s+"([^"]*)"\s+"([^"]*)"$/;

  parseLine(line: string, lineNumber: number): LogEntry | null {
    // Try vhost format first
    let match = line.match(this.vhostPattern);
    if (match) {
      return this.parseVhostFormat(match, line, lineNumber);
    }

    // Try combined format
    match = line.match(this.combinedPattern);
    if (match) {
      return this.parseCombinedFormat(match, line, lineNumber);
    }

    // Try common log format
    match = line.match(this.clfPattern);
    if (match) {
      return this.parseClfFormat(match, line, lineNumber);
    }

    return null;
  }

  private parseCombinedFormat(match: RegExpMatchArray, line: string, lineNumber: number): LogEntry {
    const [, remoteAddr, ident, remoteUser, timeLocal, request, status, bodyBytes, referer, userAgent] = match;
    return this.buildEntry(remoteAddr, ident, remoteUser, timeLocal, request, status, bodyBytes, referer, userAgent, line, lineNumber);
  }

  private parseClfFormat(match: RegExpMatchArray, line: string, lineNumber: number): LogEntry {
    const [, remoteAddr, ident, remoteUser, timeLocal, request, status, bodyBytes] = match;
    return this.buildEntry(remoteAddr, ident, remoteUser, timeLocal, request, status, bodyBytes, undefined, undefined, line, lineNumber);
  }

  private parseVhostFormat(match: RegExpMatchArray, line: string, lineNumber: number): LogEntry {
    const [, vhost, remoteAddr, ident, remoteUser, timeLocal, request, status, bodyBytes, referer, userAgent] = match;
    const entry = this.buildEntry(remoteAddr, ident, remoteUser, timeLocal, request, status, bodyBytes, referer, userAgent, line, lineNumber);
    entry.metadata = { ...entry.metadata, vhost };
    return entry;
  }

  private buildEntry(
    remoteAddr: string,
    ident: string,
    remoteUser: string,
    timeLocal: string,
    request: string,
    status: string,
    bodyBytes: string,
    referer: string | undefined,
    userAgent: string | undefined,
    line: string,
    lineNumber: number
  ): LogEntry {
    const timestamp = this.parseApacheTimestamp(timeLocal);

    // Parse request line
    const requestParts = request.split(' ');
    const method = requestParts[0] || '';
    const path = requestParts[1] || '';
    const protocol = requestParts[2] || '';

    const statusCode = parseInt(status, 10);
    const level = this.statusToLevel(statusCode);

    const message = `${method} ${path} - ${status}`;

    return {
      timestamp,
      level,
      message,
      metadata: {
        remoteAddr,
        ident: ident !== '-' ? ident : undefined,
        remoteUser: remoteUser !== '-' ? remoteUser : undefined,
        method,
        path,
        protocol,
        status: statusCode,
        bodyBytes: bodyBytes !== '-' ? parseInt(bodyBytes, 10) : 0,
        referer: referer && referer !== '-' ? referer : undefined,
        userAgent,
      },
      raw: line,
      lineNumber,
    };
  }

  private parseApacheTimestamp(timeLocal: string): Date {
    // Format: 10/Dec/2024:10:30:45 +0000
    const match = timeLocal.match(/(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})\s+([+-]\d{4})/);
    if (!match) return new Date();

    const [, day, month, year, hour, min, sec, tz] = match;

    const months: Record<string, number> = {
      Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
      Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
    };

    const date = new Date(
      parseInt(year),
      months[month] ?? 0,
      parseInt(day),
      parseInt(hour),
      parseInt(min),
      parseInt(sec)
    );

    // Apply timezone offset
    const tzHours = parseInt(tz.slice(0, 3), 10);
    const tzMins = parseInt(tz.slice(3), 10);
    const tzOffset = (tzHours * 60 + tzMins) * 60 * 1000;
    date.setTime(date.getTime() - tzOffset);

    return date;
  }

  private statusToLevel(status: number): LogLevel {
    if (status >= 500) return 'ERROR';
    if (status >= 400) return 'WARN';
    return 'INFO';
  }
}

/**
 * Apache Error Log format (Apache 2.4+):
 * [Sun Dec 10 10:30:45.123456 2024] [module:level] [pid 1234:tid 5678] [client 192.168.1.1:12345] AH00001: message
 *
 * Legacy format (Apache 2.2):
 * [Sun Dec 10 10:30:45 2024] [error] [client 192.168.1.1] message
 */
export class ApacheErrorParser extends BaseParser {
  readonly format: LogFormat = 'apache';

  // Apache 2.4+ error log pattern
  private readonly modernPattern = /^\[(\w+\s+\w+\s+\d+\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?\s+\d{4})\]\s+\[([^\]:]+):(\w+)\]\s+\[pid\s+(\d+)(?::tid\s+(\d+))?\](?:\s+\[client\s+([^\]]+)\])?\s+(.*)$/;

  // Apache 2.2 legacy error log pattern
  private readonly legacyPattern = /^\[(\w+\s+\w+\s+\d+\s+\d{2}:\d{2}:\d{2}\s+\d{4})\]\s+\[(\w+)\](?:\s+\[client\s+([^\]]+)\])?\s+(.*)$/;

  parseLine(line: string, lineNumber: number): LogEntry | null {
    // Try modern format first
    let match = line.match(this.modernPattern);
    if (match) {
      return this.parseModernFormat(match, line, lineNumber);
    }

    // Try legacy format
    match = line.match(this.legacyPattern);
    if (match) {
      return this.parseLegacyFormat(match, line, lineNumber);
    }

    return null;
  }

  private parseModernFormat(match: RegExpMatchArray, line: string, lineNumber: number): LogEntry {
    const [, timestamp, module, level, pid, tid, client, message] = match;

    // Extract error code if present (AH00001)
    let errorCode: string | undefined;
    let cleanMessage = message;
    const codeMatch = message.match(/^(AH\d+):\s*/);
    if (codeMatch) {
      errorCode = codeMatch[1];
      cleanMessage = message.slice(codeMatch[0].length);
    }

    return {
      timestamp: this.parseApacheErrorTimestamp(timestamp),
      level: this.parseLevel(level),
      message: cleanMessage,
      logger: module,
      metadata: {
        pid: parseInt(pid, 10),
        tid: tid ? parseInt(tid, 10) : undefined,
        client: client ? this.parseClientInfo(client) : undefined,
        errorCode,
      },
      raw: line,
      lineNumber,
    };
  }

  private parseLegacyFormat(match: RegExpMatchArray, line: string, lineNumber: number): LogEntry {
    const [, timestamp, level, client, message] = match;

    return {
      timestamp: this.parseApacheErrorTimestamp(timestamp),
      level: this.parseLevel(level),
      message,
      metadata: {
        client: client ? this.parseClientInfo(client) : undefined,
      },
      raw: line,
      lineNumber,
    };
  }

  private parseApacheErrorTimestamp(timestamp: string): Date {
    // Format: Sun Dec 10 10:30:45.123456 2024 or Sun Dec 10 10:30:45 2024
    const match = timestamp.match(/\w+\s+(\w+)\s+(\d+)\s+(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?\s+(\d{4})/);
    if (!match) return new Date();

    const [, month, day, hour, min, sec, year] = match;

    const months: Record<string, number> = {
      Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
      Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
    };

    return new Date(
      parseInt(year),
      months[month] ?? 0,
      parseInt(day),
      parseInt(hour),
      parseInt(min),
      parseInt(sec)
    );
  }

  private parseClientInfo(client: string): { ip: string; port?: number } {
    const parts = client.split(':');
    return {
      ip: parts[0],
      port: parts[1] ? parseInt(parts[1], 10) : undefined,
    };
  }
}

/**
 * Combined Apache parser that handles both access and error logs
 */
export class ApacheCombinedParser extends BaseParser {
  readonly format: LogFormat = 'apache';

  private accessParser = new ApacheAccessParser();
  private errorParser = new ApacheErrorParser();

  parseLine(line: string, lineNumber: number): LogEntry | null {
    // Try access log format first (more common in most setups)
    const accessEntry = this.accessParser.parseLine(line, lineNumber);
    if (accessEntry) return accessEntry;

    // Try error log format
    const errorEntry = this.errorParser.parseLine(line, lineNumber);
    if (errorEntry) return errorEntry;

    return null;
  }
}
