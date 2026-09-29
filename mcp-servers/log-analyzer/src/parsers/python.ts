// SPDX-License-Identifier: MIT
/**
 * Python Log Parser
 *
 * Recognised layouts:
 *   2024-12-13 10:30:45,123 - module - INFO - message            (common custom format)
 *   2024-12-13 10:30:45,123 - module - INFO - file.py:42 - message
 *   2024-12-13 10:30:45,123 INFO module: message                 (asctime levelname name)
 *   2024-12-13 10:30:45,123 [INFO] module: message
 *   WARNING:root:message                                         (logging.basicConfig default)
 *   [2024-12-13 10:30:45 +0000] [12345] [INFO] message           (gunicorn)
 *   INFO:     127.0.0.1:54321 - "GET / HTTP/1.1" 200 OK          (uvicorn)
 *   [13/Dec/2024 10:30:45] "GET /path HTTP/1.1" 200 1234         (Django runserver)
 *
 * The bare "LEVEL:" layouts only accept real Python level names. The previous
 * catch-all `^(\w+):\s+(.*)$` also matched `ValueError: bad value`, so the
 * last line of every traceback was split off into its own INFO entry.
 */

import { BaseParser } from './base.js';
import type { LogEntry, LogFormat } from '../types.js';

const PY_LEVELS = 'DEBUG|INFO|WARNING|WARN|ERROR|CRITICAL|FATAL|NOTSET';
const TS = '(\\d{4}-\\d{2}-\\d{2}[ T]\\d{2}:\\d{2}:\\d{2}(?:[.,]\\d{1,6})?(?:Z|[+-]\\d{2}:?\\d{2})?)';

export class PythonParser extends BaseParser {
  readonly format: LogFormat = 'python';

  private readonly dashedWithFile = new RegExp(`^${TS}\\s+-\\s+(\\S+)\\s+-\\s+(${PY_LEVELS})\\s+-\\s+(\\S+?):(\\d+)\\s+-\\s?(.*)$`);
  private readonly dashed = new RegExp(`^${TS}\\s+-\\s+(\\S+)\\s+-\\s+(${PY_LEVELS})\\s+-\\s?(.*)$`);
  private readonly levelName = new RegExp(`^${TS}\\s+\\[?(${PY_LEVELS})\\]?\\s+(?:\\[?([\\w.\\-]+)\\]?:?\\s+)?(.*)$`);
  private readonly basic = new RegExp(`^(${PY_LEVELS}):([\\w.\\-]*):(.*)$`);
  private readonly gunicorn = /^\[(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\s+[+-]\d{4})?)\]\s+\[(\d+)\]\s+\[(\w+)\]\s+(.*)$/;
  private readonly uvicorn = new RegExp(`^(${PY_LEVELS}):\\s+(.*)$`);
  private readonly django = /^\[(\d{2}\/\w{3}\/\d{4}\s+\d{2}:\d{2}:\d{2})\]\s+"([A-Z]+)\s+([^\s"]+)\s+HTTP\/[\d.]+"\s+(\d{3})\s+(\d+|-)$/;

  parseLine(line: string, lineNumber: number): LogEntry | null {
    let m = line.match(this.dashedWithFile);
    if (m) {
      const [, ts, logger, level, file, lineNo, message] = m;
      return this.entry(line, lineNumber, ts, level, message, { logger, class: file, line: parseInt(lineNo, 10) });
    }
    m = line.match(this.dashed);
    if (m) {
      const [, ts, logger, level, message] = m;
      return this.entry(line, lineNumber, ts, level, message, { logger });
    }
    m = line.match(this.levelName);
    if (m) {
      const [, ts, level, logger, message] = m;
      return this.entry(line, lineNumber, ts, level, message, { logger });
    }
    m = line.match(this.gunicorn);
    if (m) {
      const [, ts, pid, level, message] = m;
      if (!this.strictLevel(level)) return null;
      return this.entry(line, lineNumber, ts, level, message, { metadata: { pid: parseInt(pid, 10) } });
    }
    m = line.match(this.django);
    if (m) {
      const [, ts, method, path, status, size] = m;
      const code = parseInt(status, 10);
      return {
        timestamp: this.parseTimestamp(ts),
        level: code >= 500 ? 'ERROR' : code >= 400 ? 'WARN' : 'INFO',
        message: `${method} ${path} ${status}`,
        metadata: { method, path, status: code, bytes: size === '-' ? 0 : parseInt(size, 10) },
        raw: line,
        lineNumber,
      };
    }
    m = line.match(this.uvicorn);
    if (m) {
      // uvicorn has no timestamp in its default format.
      return this.entry(line, lineNumber, null, m[1], m[2], {});
    }
    m = line.match(this.basic);
    if (m) {
      // logging.basicConfig() default: LEVEL:logger:message — no timestamp.
      return this.entry(line, lineNumber, null, m[1], m[3], { logger: m[2] || undefined });
    }
    return null;
  }

  private entry(
    line: string, lineNumber: number, ts: string | null, level: string, message: string,
    extra: Partial<LogEntry>,
  ): LogEntry {
    return {
      timestamp: ts ? this.parseTimestamp(ts) : null,
      level: this.parseLevel(level),
      message: message.trim(),
      ...extra,
      raw: line,
      lineNumber,
    };
  }
}
