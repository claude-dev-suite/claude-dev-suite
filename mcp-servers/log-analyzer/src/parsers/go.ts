// SPDX-License-Identifier: MIT
/**
 * Go text log parsers.
 *
 * zap console encoder (production and development):
 *   2024-01-02T15:04:05.000Z	INFO	server/main.go:42	listening	{"port": 8080}
 *   2024-01-02T15:04:05.000+0100	ERROR	http	handler/api.go:88	request failed	{"error": "boom"}
 *   1.7042e+09	info	main.go:12	started
 *
 * zap / zerolog / logrus JSON go through the JSON mapping; logrus text through
 * logfmt; Go panics and goroutine dumps through the exception extractor.
 */

import { BaseParser } from './base.js';
import type { LogEntry, LogFormat } from '../types.js';
import { parseTimestamp } from '../core/timestamp.js';

export class ZapConsoleParser extends BaseParser {
  readonly format: LogFormat = 'zap';

  parseLine(line: string, lineNumber: number): LogEntry | null {
    if (!line.includes('\t')) return null;
    const parts = line.split('\t');
    if (parts.length < 3) return null;
    const ts = parseTimestamp(/^\d+(?:\.\d+)?(?:e\+\d+)?$/i.test(parts[0]) ? Number(parts[0]) : parts[0]);
    const level = this.strictLevel(parts[1]);
    if (!ts || !level) return null;

    let rest = parts.slice(2);
    let fields: Record<string, unknown> = {};
    const last = rest[rest.length - 1];
    if (rest.length > 1 && last.trim().startsWith('{') && last.trim().endsWith('}')) {
      try {
        fields = JSON.parse(last) as Record<string, unknown>;
        rest = rest.slice(0, -1);
      } catch {
        // keep as text
      }
    }
    const callerIdx = rest.findIndex((p) => /^\S+\.go:\d+$/.test(p));
    let logger: string | undefined;
    let caller: string | undefined;
    let message: string;
    if (callerIdx >= 0) {
      logger = callerIdx > 0 ? rest.slice(0, callerIdx).join('.') : undefined;
      caller = rest[callerIdx];
      message = rest.slice(callerIdx + 1).join('\t');
    } else if (rest.length >= 2) {
      logger = rest[0];
      message = rest.slice(1).join('\t');
    } else {
      message = rest[0] ?? '';
    }
    const entry: LogEntry = {
      timestamp: ts,
      level,
      message,
      logger,
      metadata: fields,
      raw: line,
      lineNumber,
    };
    if (caller) {
      const cm = caller.match(/^(.*):(\d+)$/)!;
      entry.class = cm[1];
      entry.line = parseInt(cm[2], 10);
    }
    if (typeof fields.error === 'string') {
      entry.exception = { type: 'Error', message: fields.error, stackTrace: [] };
    }
    if (typeof fields.stacktrace === 'string') entry.stackTrace = fields.stacktrace.split('\n');
    return entry;
  }
}
