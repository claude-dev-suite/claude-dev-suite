// SPDX-License-Identifier: MIT
/**
 * Kubernetes Log Parser
 * Parses Kubernetes JSON logs and kubectl logs output
 */

import { BaseParser } from './base.js';
import type { LogEntry, LogFormat, LogLevel } from '../types.js';

/**
 * Kubernetes JSON log format (used by container runtimes):
 * {"log":"message\n","stream":"stdout","time":"2024-12-10T10:30:45.123456789Z"}
 *
 * Also handles structured logs from Kubernetes components:
 * {"ts":1702203045.123,"caller":"server.go:123","msg":"message","level":"info","v":0}
 *
 * And klog format:
 * I1210 10:30:45.123456  12345 server.go:123] message
 */
export class KubernetesParser extends BaseParser {
  readonly format: LogFormat = 'kubernetes';

  // klog format pattern: I1210 10:30:45.123456  12345 file.go:123] message
  private readonly klogPattern = /^([IWEF])(\d{4})\s+(\d{2}:\d{2}:\d{2}\.\d+)\s+(\d+)\s+([^:]+):(\d+)\]\s+(.*)$/;

  parseLine(line: string, lineNumber: number): LogEntry | null {
    const trimmed = line.trim();

    // Try JSON format first
    if (trimmed.startsWith('{')) {
      try {
        const json = JSON.parse(trimmed);
        return this.parseJsonLog(json, line, lineNumber);
      } catch {
        // Not valid JSON, try other formats
      }
    }

    // Try klog format
    const klogMatch = trimmed.match(this.klogPattern);
    if (klogMatch) {
      return this.parseKlog(klogMatch, line, lineNumber);
    }

    return null;
  }

  private parseJsonLog(json: Record<string, unknown>, line: string, lineNumber: number): LogEntry | null {
    // Container runtime format: {"log":"...", "stream":"...", "time":"..."}
    if ('log' in json && 'time' in json) {
      return this.parseContainerLog(json, line, lineNumber);
    }

    // Kubernetes component structured format
    if ('msg' in json || 'message' in json) {
      return this.parseStructuredLog(json, line, lineNumber);
    }

    // Generic JSON log
    return this.parseGenericJson(json, line, lineNumber);
  }

  private parseContainerLog(json: Record<string, unknown>, line: string, lineNumber: number): LogEntry {
    const logMessage = String(json.log || '').replace(/\n$/, '');
    const timestamp = new Date(String(json.time));
    const stream = String(json.stream || 'stdout');

    // Try to extract level from the log message
    const level = this.extractLevelFromMessage(logMessage, stream);

    // Try to parse nested JSON in the log message
    let metadata: Record<string, unknown> = { stream };
    let message = logMessage;

    if (logMessage.trim().startsWith('{')) {
      try {
        const nested = JSON.parse(logMessage);
        if (nested.message || nested.msg) {
          message = String(nested.message || nested.msg);
          metadata = { ...metadata, ...nested };
          delete metadata.message;
          delete metadata.msg;
        }
      } catch {
        // Not nested JSON
      }
    }

    return {
      timestamp,
      level,
      message,
      metadata: {
        ...metadata,
        kubernetes: {
          stream,
        },
      },
      raw: line,
      lineNumber,
    };
  }

  private parseStructuredLog(json: Record<string, unknown>, line: string, lineNumber: number): LogEntry {
    const message = String(json.msg || json.message || '');

    // Parse timestamp from various formats
    let timestamp: Date;
    if (json.ts) {
      // Unix timestamp (float)
      timestamp = new Date(Number(json.ts) * 1000);
    } else if (json.time || json.timestamp || json.t) {
      timestamp = new Date(String(json.time || json.timestamp || json.t));
    } else {
      timestamp = new Date();
    }

    // Parse level
    let level: LogLevel = 'INFO';
    if (json.level) {
      level = this.parseLevel(String(json.level));
    } else if (json.severity) {
      level = this.parseLevel(String(json.severity));
    } else if (typeof json.v === 'number') {
      // Kubernetes verbosity level
      level = json.v >= 4 ? 'DEBUG' : json.v >= 2 ? 'TRACE' : 'INFO';
    }

    // Extract caller info
    let logger: string | undefined;
    let method: string | undefined;
    let lineNum: number | undefined;

    if (json.caller) {
      const callerMatch = String(json.caller).match(/^([^:]+):(\d+)$/);
      if (callerMatch) {
        logger = callerMatch[1];
        lineNum = parseInt(callerMatch[2], 10);
      } else {
        logger = String(json.caller);
      }
    } else if (json.source) {
      logger = String(json.source);
    }

    // Build metadata excluding known fields
    const knownFields = ['msg', 'message', 'ts', 'time', 'timestamp', 't', 'level', 'severity', 'v', 'caller', 'source'];
    const metadata: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(json)) {
      if (!knownFields.includes(key)) {
        metadata[key] = value;
      }
    }

    return {
      timestamp,
      level,
      message,
      logger,
      method,
      line: lineNum,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      raw: line,
      lineNumber,
    };
  }

  private parseGenericJson(json: Record<string, unknown>, line: string, lineNumber: number): LogEntry {
    // Try to find common fields
    const message = String(json.log || json.msg || json.message || JSON.stringify(json));

    let timestamp: Date;
    if (json.time || json.timestamp || json.ts) {
      const timeValue = json.time || json.timestamp || json.ts;
      if (typeof timeValue === 'number') {
        timestamp = new Date(timeValue > 1e12 ? timeValue : timeValue * 1000);
      } else {
        timestamp = new Date(String(timeValue));
      }
    } else {
      timestamp = new Date();
    }

    const level = json.level || json.severity
      ? this.parseLevel(String(json.level || json.severity))
      : 'INFO';

    return {
      timestamp,
      level,
      message,
      metadata: json,
      raw: line,
      lineNumber,
    };
  }

  private parseKlog(match: RegExpMatchArray, line: string, lineNumber: number): LogEntry {
    const [, levelChar, dateStr, timeStr, pid, file, fileLine, message] = match;

    // Parse klog level character
    const levelMap: Record<string, LogLevel> = {
      'I': 'INFO',
      'W': 'WARN',
      'E': 'ERROR',
      'F': 'FATAL',
    };
    const level = levelMap[levelChar] || 'INFO';

    // Parse timestamp: I1210 10:30:45.123456
    // dateStr is MMDD, need to add current year
    const month = parseInt(dateStr.slice(0, 2), 10) - 1;
    const day = parseInt(dateStr.slice(2, 4), 10);
    const [hour, min, secMs] = timeStr.split(':');
    const [sec, ms] = secMs.split('.');

    const now = new Date();
    const timestamp = new Date(
      now.getFullYear(),
      month,
      day,
      parseInt(hour, 10),
      parseInt(min, 10),
      parseInt(sec, 10),
      parseInt(ms?.slice(0, 3) || '0', 10)
    );

    // Adjust year if the date seems to be in the future
    if (timestamp > now) {
      timestamp.setFullYear(now.getFullYear() - 1);
    }

    return {
      timestamp,
      level,
      message,
      logger: file,
      line: parseInt(fileLine, 10),
      metadata: {
        pid: parseInt(pid, 10),
        format: 'klog',
      },
      raw: line,
      lineNumber,
    };
  }

  private extractLevelFromMessage(message: string, stream: string): LogLevel {
    const upper = message.toUpperCase();

    // Check for explicit level indicators
    if (/\[ERROR\]|\bERROR\b|"level":\s*"error"/i.test(message)) return 'ERROR';
    if (/\[WARN\]|\bWARN(?:ING)?\b|"level":\s*"warn"/i.test(message)) return 'WARN';
    if (/\[DEBUG\]|\bDEBUG\b|"level":\s*"debug"/i.test(message)) return 'DEBUG';
    if (/\[INFO\]|\bINFO\b|"level":\s*"info"/i.test(message)) return 'INFO';

    // stderr is usually for errors
    if (stream === 'stderr') return 'ERROR';

    return 'INFO';
  }
}

/**
 * Parser for kubectl logs output with pod/container prefixes
 * Format: [pod-name/container-name] log message
 * Or just raw log lines from kubectl logs
 */
export class KubectlLogsParser extends BaseParser {
  readonly format: LogFormat = 'kubernetes';

  private kubernetesParser = new KubernetesParser();

  // Pattern for kubectl logs --prefix output
  private readonly prefixPattern = /^\[([^\]]+)\]\s+(.*)$/;

  parseLine(line: string, lineNumber: number): LogEntry | null {
    const trimmed = line.trim();

    // Check for prefix format
    const prefixMatch = trimmed.match(this.prefixPattern);
    if (prefixMatch) {
      const [, prefix, rest] = prefixMatch;
      const entry = this.kubernetesParser.parseLine(rest, lineNumber);

      if (entry) {
        // Parse pod/container from prefix
        const parts = prefix.split('/');
        entry.metadata = {
          ...entry.metadata,
          kubernetes: {
            ...((entry.metadata?.kubernetes as Record<string, unknown>) || {}),
            pod: parts[0],
            container: parts[1],
          },
        };
        entry.raw = line;
        return entry;
      }
    }

    // Fall back to standard Kubernetes parser
    return this.kubernetesParser.parseLine(line, lineNumber);
  }
}
