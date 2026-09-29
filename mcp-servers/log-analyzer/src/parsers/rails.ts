// SPDX-License-Identifier: MIT
/**
 * Ruby / Rails log parser.
 *
 * Ruby Logger default format:
 *   I, [2024-01-02T15:04:05.123456 #12345]  INFO -- : message
 *   E, [2024-01-02T15:04:05.123456 #12345] ERROR -- myapp: message
 *
 * Rails request lines (optionally tagged, e.g. config.log_tags = [:request_id]):
 *   [8a1c…] Started GET "/users/1" for 127.0.0.1 at 2024-01-02 15:04:05 +0000
 *   [8a1c…] Processing by UsersController#show as HTML
 *   [8a1c…] Completed 500 Internal Server Error in 12ms (ActiveRecord: 1.1ms | Allocations: 900)
 *   [8a1c…] NoMethodError (undefined method `name' for nil):
 *   [8a1c…] app/controllers/users_controller.rb:12:in `show'
 *
 * Tags are stripped from continuation lines so tagged backtraces still parse,
 * and `Completed` lines inherit method/path/time from their `Started` line
 * (matched by request tag), which is what makes Rails logs usable by the
 * access-log analytics.
 */

import { BaseParser } from './base.js';
import type { LogEntry, LogFormat } from '../types.js';
import { parseTimestamp } from '../core/timestamp.js';

const LOGGER_LINE = /^([DIWEFAU]), \[(\S+) #(\d+)\]\s+(\w+) -- ([^:]*): ?(.*)$/;
const TAGS = /^((?:\[[^\]\s][^\]]*\]\s*)+)(.*)$/;
const UUIDISH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^[0-9a-f]{20,}$/i;
const STARTED = /^Started (\w+) "([^"]*)" for (\S+) at (.+)$/;
const COMPLETED = /^Completed (\d{3})(?: [\w' -]+?)? in (\d+(?:\.\d+)?)ms/;
const PROCESSING = /^Processing by ([\w:]+)#(\w+) as (\S+)/;
const EXCEPTION_HEADER = /^([A-Z]\w*(?:::[A-Z]\w*)*) \((.*)\):?$/;
const FRAME = /^\s*(?:from\s+)?\S+\.rb:\d+:in\s/;
const RAILS_MARKER = /^(?:Started \w+ "|Processing by \S+#|Completed \d{3} |Parameters: \{|Redirected to |Rendered |Rendering |Filter chain halted|Can't verify CSRF|[A-Z]\w*(?:::[A-Z]\w*)+ \()/;

interface RequestInfo { method: string; path: string; remoteAddr: string; timestamp: Date | null }

export class RailsParser extends BaseParser {
  readonly format: LogFormat = 'rails';
  private readonly requests = new Map<string, RequestInfo>();
  private lastRequest: RequestInfo | null = null;

  /**
   * strict: accept only lines that are unmistakably Ruby/Rails (Logger prefix
   * or a Rails request line). Detection uses it; parsing a known Rails log does not.
   */
  constructor(private readonly strict = false) {
    super();
  }

  /** Strip request tags so "[id] app/models/x.rb:3:in `y'" reads as a frame. */
  normalizeContinuation(line: string): string {
    const t = line.match(TAGS);
    return t ? t[2] : line;
  }

  parseLine(line: string, lineNumber: number): LogEntry | null {
    const lm = line.match(LOGGER_LINE);
    if (lm) {
      const [, , ts, pid, level, progname, rest] = lm;
      const entry = this.parseBody(rest, line, lineNumber);
      entry.timestamp = parseTimestamp(ts) ?? entry.timestamp;
      entry.level = this.parseLevel(level === 'ANY' ? 'INFO' : level);
      entry.logger = progname.trim() || undefined;
      entry.metadata = { ...entry.metadata, pid: parseInt(pid, 10) };
      return entry;
    }
    if (/^\s/.test(line) || line.trim() === '') return null;
    const body = this.normalizeContinuation(line);
    if (!body.trim() || FRAME.test(body)) return null; // backtrace line → continuation
    if (this.strict && !RAILS_MARKER.test(body.trim())) return null;
    return this.parseBody(line, line, lineNumber);
  }

  private parseBody(text: string, raw: string, lineNumber: number): LogEntry {
    const metadata: Record<string, unknown> = {};
    let body = text;
    let requestTag: string | undefined;
    const t = text.match(TAGS);
    if (t) {
      const tags = [...t[1].matchAll(/\[([^\]]+)\]/g)].map((x) => x[1]);
      body = t[2];
      requestTag = tags.find((x) => UUIDISH.test(x)) ?? tags[0];
      metadata.tags = tags;
    }
    const entry: LogEntry = {
      timestamp: null,
      level: 'INFO',
      message: body.trim(),
      requestId: requestTag && UUIDISH.test(requestTag) ? requestTag : undefined,
      metadata,
      raw,
      lineNumber,
    };

    const s = body.match(STARTED);
    if (s) {
      const info: RequestInfo = { method: s[1], path: s[2], remoteAddr: s[3], timestamp: parseTimestamp(s[4]) };
      Object.assign(metadata, { method: info.method, path: info.path, remoteAddr: info.remoteAddr });
      entry.timestamp = info.timestamp;
      this.remember(requestTag, info);
      return entry;
    }
    const c = body.match(COMPLETED);
    if (c) {
      const status = parseInt(c[1], 10);
      metadata.status = status;
      metadata.durationMs = parseFloat(c[2]);
      entry.level = status >= 500 ? 'ERROR' : status >= 400 ? 'WARN' : 'INFO';
      const req = (requestTag && this.requests.get(requestTag)) || this.lastRequest;
      if (req) {
        Object.assign(metadata, { method: req.method, path: req.path, remoteAddr: req.remoteAddr });
        entry.timestamp = req.timestamp;
      }
      return entry;
    }
    const p = body.match(PROCESSING);
    if (p) {
      Object.assign(metadata, { controller: p[1], action: p[2], responseFormat: p[3] });
      return entry;
    }
    if (EXCEPTION_HEADER.test(body.trim())) entry.level = 'FATAL';
    return entry;
  }

  private remember(tag: string | undefined, info: RequestInfo): void {
    this.lastRequest = info;
    if (!tag) return;
    this.requests.set(tag, info);
    if (this.requests.size > 2000) {
      const oldest = this.requests.keys().next().value;
      if (oldest !== undefined) this.requests.delete(oldest);
    }
  }
}
