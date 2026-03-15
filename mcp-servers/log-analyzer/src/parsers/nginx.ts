// SPDX-License-Identifier: MIT
/**
 * Nginx Log Parser
 * Parses Nginx access and error logs
 */

import { BaseParser } from './base.js';
import type { LogEntry, LogFormat, LogLevel } from '../types.js';

/**
 * Nginx Access Log - Combined Log Format:
 * 192.168.1.1 - user [10/Dec/2024:10:30:45 +0000] "GET /api/users HTTP/1.1" 200 1234 "https://example.com" "Mozilla/5.0..."
 *
 * Fields: remote_addr - remote_user [time_local] "request" status body_bytes_sent "http_referer" "http_user_agent"
 */
export class NginxAccessParser extends BaseParser {
  readonly format: LogFormat = 'nginx';

  // Combined Log Format pattern
  private readonly pattern = /^(\S+)\s+-\s+(\S+)\s+\[([^\]]+)\]\s+"([^"]*)"\s+(\d+)\s+(\d+)\s+"([^"]*)"\s+"([^"]*)"(?:\s+"([^"]*)")?$/;

  // Extended format with additional fields (request_time, upstream_response_time)
  private readonly extendedPattern = /^(\S+)\s+-\s+(\S+)\s+\[([^\]]+)\]\s+"([^"]*)"\s+(\d+)\s+(\d+)\s+"([^"]*)"\s+"([^"]*)"\s+(\d+\.\d+)(?:\s+(\d+\.\d+))?$/;

  parseLine(line: string, lineNumber: number): LogEntry | null {
    // Try extended format first
    let match = line.match(this.extendedPattern);
    let isExtended = true;

    if (!match) {
      match = line.match(this.pattern);
      isExtended = false;
    }

    if (!match) return null;

    const [, remoteAddr, remoteUser, timeLocal, request, status, bodyBytes, referer, userAgent, requestTime, upstreamTime] = match;

    // Parse timestamp: 10/Dec/2024:10:30:45 +0000
    const timestamp = this.parseNginxTimestamp(timeLocal);

    // Parse request line: "GET /api/users HTTP/1.1"
    const requestParts = request.split(' ');
    const method = requestParts[0] || '';
    const path = requestParts[1] || '';
    const protocol = requestParts[2] || '';

    // Determine log level based on status code
    const statusCode = parseInt(status, 10);
    const level = this.statusToLevel(statusCode);

    // Build message
    const message = `${method} ${path} - ${status}`;

    return {
      timestamp,
      level,
      message,
      metadata: {
        remoteAddr,
        remoteUser: remoteUser !== '-' ? remoteUser : undefined,
        method,
        path,
        protocol,
        status: statusCode,
        bodyBytes: parseInt(bodyBytes, 10),
        referer: referer !== '-' ? referer : undefined,
        userAgent,
        ...(isExtended && requestTime && {
          requestTime: parseFloat(requestTime),
          upstreamTime: upstreamTime ? parseFloat(upstreamTime) : undefined,
        }),
      },
      raw: line,
      lineNumber,
    };
  }

  private parseNginxTimestamp(timeLocal: string): Date {
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
    if (status >= 300) return 'INFO';
    return 'INFO';
  }
}

/**
 * Nginx Error Log format:
 * 2024/12/10 10:30:45 [error] 1234#5678: *91011 message, client: 192.168.1.1, server: example.com, request: "GET /path HTTP/1.1"
 *
 * Format: YYYY/MM/DD HH:MM:SS [level] pid#tid: *cid message
 */
export class NginxErrorParser extends BaseParser {
  readonly format: LogFormat = 'nginx';

  // Error log pattern
  private readonly pattern = /^(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2})\s+\[(\w+)\]\s+(\d+)#(\d+):\s+(?:\*(\d+)\s+)?(.*)$/;

  parseLine(line: string, lineNumber: number): LogEntry | null {
    const match = line.match(this.pattern);
    if (!match) return null;

    const [, timestamp, level, pid, tid, cid, message] = match;

    // Parse additional context from message
    const context = this.parseErrorContext(message);

    return {
      timestamp: this.parseErrorTimestamp(timestamp),
      level: this.parseLevel(level),
      message: context.cleanMessage,
      metadata: {
        pid: parseInt(pid, 10),
        tid: parseInt(tid, 10),
        cid: cid ? parseInt(cid, 10) : undefined,
        client: context.client,
        server: context.server,
        request: context.request,
        upstream: context.upstream,
        host: context.host,
      },
      raw: line,
      lineNumber,
    };
  }

  private parseErrorTimestamp(timestamp: string): Date {
    // Format: 2024/12/10 10:30:45
    const match = timestamp.match(/(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
    if (!match) return new Date();

    const [, year, month, day, hour, min, sec] = match;
    return new Date(
      parseInt(year),
      parseInt(month) - 1,
      parseInt(day),
      parseInt(hour),
      parseInt(min),
      parseInt(sec)
    );
  }

  private parseErrorContext(message: string): {
    cleanMessage: string;
    client?: string;
    server?: string;
    request?: string;
    upstream?: string;
    host?: string;
  } {
    const context: Record<string, string> = {};
    let cleanMessage = message;

    // Extract client
    const clientMatch = message.match(/,?\s*client:\s*([^,]+)/);
    if (clientMatch) {
      context.client = clientMatch[1].trim();
      cleanMessage = cleanMessage.replace(clientMatch[0], '');
    }

    // Extract server
    const serverMatch = message.match(/,?\s*server:\s*([^,]+)/);
    if (serverMatch) {
      context.server = serverMatch[1].trim();
      cleanMessage = cleanMessage.replace(serverMatch[0], '');
    }

    // Extract request
    const requestMatch = message.match(/,?\s*request:\s*"([^"]+)"/);
    if (requestMatch) {
      context.request = requestMatch[1];
      cleanMessage = cleanMessage.replace(requestMatch[0], '');
    }

    // Extract upstream
    const upstreamMatch = message.match(/,?\s*upstream:\s*"([^"]+)"/);
    if (upstreamMatch) {
      context.upstream = upstreamMatch[1];
      cleanMessage = cleanMessage.replace(upstreamMatch[0], '');
    }

    // Extract host
    const hostMatch = message.match(/,?\s*host:\s*"([^"]+)"/);
    if (hostMatch) {
      context.host = hostMatch[1];
      cleanMessage = cleanMessage.replace(hostMatch[0], '');
    }

    return {
      cleanMessage: cleanMessage.trim().replace(/,\s*$/, ''),
      ...context,
    };
  }
}

/**
 * Combined Nginx parser that handles both access and error logs
 */
export class NginxCombinedParser extends BaseParser {
  readonly format: LogFormat = 'nginx';

  private accessParser = new NginxAccessParser();
  private errorParser = new NginxErrorParser();

  parseLine(line: string, lineNumber: number): LogEntry | null {
    // Try access log format first (more common)
    const accessEntry = this.accessParser.parseLine(line, lineNumber);
    if (accessEntry) return accessEntry;

    // Try error log format
    const errorEntry = this.errorParser.parseLine(line, lineNumber);
    if (errorEntry) return errorEntry;

    return null;
  }
}
