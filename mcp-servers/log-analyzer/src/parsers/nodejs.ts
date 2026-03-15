// SPDX-License-Identifier: MIT
/**
 * Node.js Log Parsers
 * Parses Winston, Pino, and Morgan log formats
 */

import { BaseParser } from './base.js';
import type { LogEntry, LogFormat } from '../types.js';

/**
 * Winston JSON format parser
 * {"level":"info","message":"Server started","timestamp":"2024-12-13T10:30:45.123Z"}
 */
export class WinstonParser extends BaseParser {
  readonly format: LogFormat = 'winston';

  parseLine(line: string, lineNumber: number): LogEntry | null {
    if (!line.trim().startsWith('{')) return null;

    try {
      const json = JSON.parse(line);

      // Winston uses various field names
      const timestamp = json.timestamp || json.time || json['@timestamp'] || new Date().toISOString();
      const level = json.level || json.severity || 'info';
      const message = json.message || json.msg || '';

      return {
        timestamp: new Date(timestamp),
        level: this.parseLevel(level),
        message,
        logger: json.label || json.service || json.name,
        requestId: json.requestId || json.correlationId || json.request_id,
        traceId: json.traceId || json.trace_id,
        spanId: json.spanId || json.span_id,
        userId: json.userId || json.user_id,
        sessionId: json.sessionId || json.session_id,
        metadata: this.extractMetadata(json),
        raw: line,
        lineNumber,
      };
    } catch {
      return null;
    }
  }

  private extractMetadata(json: Record<string, unknown>): Record<string, unknown> {
    const reserved = [
      'level', 'message', 'timestamp', 'time', '@timestamp',
      'label', 'service', 'name', 'requestId', 'correlationId',
      'traceId', 'spanId', 'userId', 'sessionId', 'msg',
    ];

    const metadata: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(json)) {
      if (!reserved.includes(key)) {
        metadata[key] = value;
      }
    }

    return Object.keys(metadata).length > 0 ? metadata : {};
  }
}

/**
 * Pino JSON format parser
 * {"level":30,"time":1702468245123,"pid":12345,"hostname":"server","msg":"Request received"}
 */
export class PinoParser extends BaseParser {
  readonly format: LogFormat = 'pino';

  // Pino level numbers
  private readonly levelMap: Record<number, string> = {
    10: 'TRACE',
    20: 'DEBUG',
    30: 'INFO',
    40: 'WARN',
    50: 'ERROR',
    60: 'FATAL',
  };

  parseLine(line: string, lineNumber: number): LogEntry | null {
    if (!line.trim().startsWith('{')) return null;

    try {
      const json = JSON.parse(line);

      // Pino uses numeric levels
      const levelNum = json.level;
      const level = typeof levelNum === 'number'
        ? this.levelMap[levelNum] || 'INFO'
        : (json.level || 'info');

      // Pino uses epoch ms for time
      const timestamp = typeof json.time === 'number'
        ? new Date(json.time)
        : new Date(json.time || Date.now());

      const message = json.msg || json.message || '';

      return {
        timestamp,
        level: this.parseLevel(level),
        message,
        logger: json.name,
        requestId: json.reqId || json.req?.id,
        traceId: json.traceId,
        spanId: json.spanId,
        metadata: {
          pid: json.pid,
          hostname: json.hostname,
          ...this.extractMetadata(json),
        },
        raw: line,
        lineNumber,
      };
    } catch {
      return null;
    }
  }

  private extractMetadata(json: Record<string, unknown>): Record<string, unknown> {
    const reserved = [
      'level', 'time', 'pid', 'hostname', 'name', 'msg', 'message',
      'reqId', 'req', 'res', 'traceId', 'spanId',
    ];

    const metadata: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(json)) {
      if (!reserved.includes(key)) {
        metadata[key] = value;
      }
    }

    return metadata;
  }
}

/**
 * Morgan access log parser
 * Common Log Format and combined format
 */
export class MorganParser extends BaseParser {
  readonly format: LogFormat = 'morgan';

  // Combined format: :remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent"
  private readonly combinedPattern = /^(\S+)\s+-\s+(\S+)\s+\[([^\]]+)\]\s+"([A-Z]+)\s+([^\s"]+)\s+HTTP\/[\d.]+"\s+(\d+)\s+(\S+)(?:\s+"([^"]*)"\s+"([^"]*)")?$/;

  // Common format: :remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length]
  private readonly commonPattern = /^(\S+)\s+-\s+(\S+)\s+\[([^\]]+)\]\s+"([A-Z]+)\s+([^\s"]+)\s+HTTP\/[\d.]+"\s+(\d+)\s+(\S+)$/;

  // dev format: :method :url :status :response-time ms - :res[content-length]
  private readonly devPattern = /^(\w+)\s+(\S+)\s+(\d+)\s+([\d.]+)\s+ms\s+-\s+(\d+)$/;

  parseLine(line: string, lineNumber: number): LogEntry | null {
    // Try combined format
    let match = line.match(this.combinedPattern);
    if (match) {
      const [, ip, user, dateStr, method, url, status, size, referrer, userAgent] = match;

      return {
        timestamp: this.parseClfDate(dateStr),
        level: this.getAccessLogLevel(parseInt(status, 10)),
        message: `${method} ${url} ${status}`,
        metadata: {
          remoteAddr: ip,
          remoteUser: user !== '-' ? user : undefined,
          method,
          url,
          status: parseInt(status, 10),
          size: size !== '-' ? parseInt(size, 10) : undefined,
          referrer: referrer !== '-' ? referrer : undefined,
          userAgent,
        },
        raw: line,
        lineNumber,
      };
    }

    // Try common format
    match = line.match(this.commonPattern);
    if (match) {
      const [, ip, user, dateStr, method, url, status, size] = match;

      return {
        timestamp: this.parseClfDate(dateStr),
        level: this.getAccessLogLevel(parseInt(status, 10)),
        message: `${method} ${url} ${status}`,
        metadata: {
          remoteAddr: ip,
          remoteUser: user !== '-' ? user : undefined,
          method,
          url,
          status: parseInt(status, 10),
          size: size !== '-' ? parseInt(size, 10) : undefined,
        },
        raw: line,
        lineNumber,
      };
    }

    // Try dev format
    match = line.match(this.devPattern);
    if (match) {
      const [, method, url, status, responseTime, size] = match;

      return {
        timestamp: new Date(),
        level: this.getAccessLogLevel(parseInt(status, 10)),
        message: `${method} ${url} ${status} ${responseTime}ms`,
        metadata: {
          method,
          url,
          status: parseInt(status, 10),
          responseTime: parseFloat(responseTime),
          size: parseInt(size, 10),
        },
        raw: line,
        lineNumber,
      };
    }

    return null;
  }

  /**
   * Parse Common Log Format date
   * Example: 13/Dec/2024:10:30:45 +0000
   */
  private parseClfDate(dateStr: string): Date {
    const months: Record<string, number> = {
      'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
      'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11,
    };

    const match = dateStr.match(/(\d{2})\/(\w{3})\/(\d{4}):(\d{2}):(\d{2}):(\d{2})\s*([+-]\d{4})?/);
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

  /**
   * Determine log level from HTTP status code
   */
  private getAccessLogLevel(status: number): 'INFO' | 'WARN' | 'ERROR' {
    if (status >= 500) return 'ERROR';
    if (status >= 400) return 'WARN';
    return 'INFO';
  }
}

/**
 * Generic JSON lines parser
 * Works with any JSON log format
 */
export class JsonLinesParser extends BaseParser {
  readonly format: LogFormat = 'json';

  parseLine(line: string, lineNumber: number): LogEntry | null {
    if (!line.trim().startsWith('{')) return null;

    try {
      const json = JSON.parse(line);

      // Try common timestamp fields
      const timestamp = this.findTimestamp(json);

      // Try common level fields
      const level = this.findLevel(json);

      // Try common message fields
      const message = this.findMessage(json);

      return {
        timestamp,
        level: this.parseLevel(level),
        message,
        logger: json.logger || json.name || json.service,
        requestId: json.requestId || json.request_id || json.correlationId,
        traceId: json.traceId || json.trace_id,
        spanId: json.spanId || json.span_id,
        metadata: json,
        raw: line,
        lineNumber,
      };
    } catch {
      return null;
    }
  }

  private findTimestamp(json: Record<string, unknown>): Date {
    const fields = ['timestamp', 'time', '@timestamp', 'date', 'datetime', 'ts'];

    for (const field of fields) {
      const value = json[field];
      if (value) {
        if (typeof value === 'number') {
          // Epoch milliseconds or seconds
          return new Date(value > 1e12 ? value : value * 1000);
        }
        if (typeof value === 'string') {
          const date = new Date(value);
          if (!isNaN(date.getTime())) return date;
        }
      }
    }

    return new Date();
  }

  private findLevel(json: Record<string, unknown>): string {
    const fields = ['level', 'severity', 'loglevel', 'log_level'];

    for (const field of fields) {
      const value = json[field];
      if (value) {
        if (typeof value === 'string') return value;
        if (typeof value === 'number') {
          // Pino-style numeric levels
          const levelMap: Record<number, string> = {
            10: 'trace', 20: 'debug', 30: 'info', 40: 'warn', 50: 'error', 60: 'fatal',
          };
          return levelMap[value] || 'info';
        }
      }
    }

    return 'info';
  }

  private findMessage(json: Record<string, unknown>): string {
    const fields = ['message', 'msg', 'text', 'log', 'body'];

    for (const field of fields) {
      const value = json[field];
      if (value && typeof value === 'string') return value;
    }

    // Fallback: stringify the object
    return JSON.stringify(json);
  }
}
