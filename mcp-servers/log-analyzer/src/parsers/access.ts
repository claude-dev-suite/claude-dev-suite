// SPDX-License-Identifier: MIT
/**
 * HTTP access logs: NCSA common / combined (nginx, Apache, morgan, most
 * proxies), Apache vhost_combined, morgan `dev` / `tiny`, plus the error-log
 * layouts of nginx and Apache.
 *
 * Every access entry carries the same canonical metadata so the analytics
 * tools do not care which server wrote it:
 *   remoteAddr, remoteUser, method, path, protocol, status, bytes, referer,
 *   userAgent, durationMs (when the line has a latency field), vhost
 * (plus the legacy aliases `url`, `size`, `bodyBytes` kept for compatibility).
 *
 * Latency sources, in order: key=value pairs after the core fields
 * (rt=, request_time=, urt=, upstream_response_time=, duration=, latency=);
 * a bare decimal number (nginx `$request_time`, seconds); for the `apache`
 * format a bare integer (`%D`, microseconds).
 */

import { BaseParser } from './base.js';
import type { LogEntry, LogFormat } from '../types.js';
import { statusToLevel } from '../core/levels.js';
import { parseLogfmt } from '../core/logfmt.js';
import { parseDurationMs } from '../core/timestamp.js';

const CORE =
  /^(?:(\S+)\s+)?(\S+)\s+(\S+)\s+(\S+)\s+\[([^\]]+)\]\s+"((?:[^"\\]|\\.)*)"\s+(\d{3}|-)\s+(\d+|-)(?:\s+"((?:[^"\\]|\\.)*)"\s+"((?:[^"\\]|\\.)*)")?(.*)$/;
const MORGAN_DEV = /^([A-Z]+)\s+(\S+)\s+(\d{3})\s+(\d+(?:\.\d+)?)\s+ms\s+-\s+(\d+|-)$/;
const MORGAN_TINY = /^([A-Z]+)\s+(\S+)\s+(\d{3})\s+(\d+|-)\s+-\s+(\d+(?:\.\d+)?)\s+ms$/;

const LATENCY_KEYS: Array<[string, number]> = [
  // key, multiplier to ms when the value is a bare number
  ['rt', 1000], ['request_time', 1000], ['req_time', 1000], ['duration', 1], ['duration_ms', 1],
  ['latency', 1], ['latency_ms', 1], ['elapsed', 1], ['response_time', 1], ['urt', 1000],
  ['upstream_response_time', 1000], ['D', 0.001], ['T', 1000],
];

export class AccessLogParser extends BaseParser {
  readonly multiline = false;
  constructor(readonly format: LogFormat = 'clf') {
    super();
  }

  parseLine(line: string, lineNumber: number): LogEntry | null {
    const m = line.match(CORE);
    if (m) return this.fromCore(m, line, lineNumber);

    let d = line.match(MORGAN_DEV);
    if (d) {
      const [, method, path, status, ms, size] = d;
      return this.build(line, lineNumber, null, {
        method, path, status: parseInt(status, 10), bytes: size === '-' ? 0 : parseInt(size, 10),
        durationMs: parseFloat(ms),
      });
    }
    d = line.match(MORGAN_TINY);
    if (d) {
      const [, method, path, status, size, ms] = d;
      return this.build(line, lineNumber, null, {
        method, path, status: parseInt(status, 10), bytes: size === '-' ? 0 : parseInt(size, 10),
        durationMs: parseFloat(ms),
      });
    }
    return null;
  }

  private fromCore(m: RegExpMatchArray, line: string, lineNumber: number): LogEntry | null {
    const [, vhost, remoteAddr, ident, remoteUser, time, request, status, bytes, referer, userAgent, trailing] = m;
    const ts = this.parseTimestamp(time);
    if (!ts) return null; // "[...]" that is not a CLF time — not an access line
    const reqParts = request.split(' ');
    const fields: Record<string, unknown> = {
      remoteAddr,
      ...(vhost ? { vhost } : {}),
      ...(ident !== '-' ? { ident } : {}),
      ...(remoteUser !== '-' ? { remoteUser } : {}),
      method: reqParts.length >= 2 ? reqParts[0] : undefined,
      path: reqParts.length >= 2 ? reqParts[1] : request,
      protocol: reqParts[2],
      status: status === '-' ? undefined : parseInt(status, 10),
      bytes: bytes === '-' ? 0 : parseInt(bytes, 10),
      ...(referer !== undefined && referer !== '-' ? { referer } : {}),
      ...(userAgent !== undefined ? { userAgent } : {}),
    };
    if (trailing && trailing.trim()) this.parseTrailing(trailing.trim(), fields);
    return this.build(line, lineNumber, ts, fields);
  }

  private parseTrailing(rest: string, fields: Record<string, unknown>): void {
    const kv = parseLogfmt(rest);
    if (kv.count > 0) {
      for (const [k, v] of Object.entries(kv.pairs)) fields[k] = v;
      for (const [key, mult] of LATENCY_KEYS) {
        const v = kv.pairs[key];
        if (v === undefined || v === '-') continue;
        const n = /^\d+(?:\.\d+)?$/.test(v) ? parseFloat(v) * mult : parseDurationMs(v);
        if (n !== null && Number.isFinite(n)) { fields.durationMs = n; break; }
      }
      return;
    }
    const tokens = [...rest.matchAll(/"([^"]*)"|(\S+)/g)].map((t) => t[1] ?? t[2]);
    const extra: string[] = [];
    for (const tok of tokens) {
      if (fields.durationMs === undefined && /^\d+\.\d+$/.test(tok)) {
        fields.requestTime = parseFloat(tok);
        fields.durationMs = parseFloat(tok) * 1000;
      } else if (fields.requestTime !== undefined && fields.upstreamTime === undefined && /^\d+\.\d+$/.test(tok)) {
        fields.upstreamTime = parseFloat(tok);
      } else if (this.format === 'apache' && fields.durationMs === undefined && /^\d+$/.test(tok)) {
        fields.durationMs = parseInt(tok, 10) / 1000; // %D microseconds
      } else {
        extra.push(tok);
      }
    }
    if (extra.length) fields.trailing = extra;
  }

  private build(line: string, lineNumber: number, ts: Date | null, fields: Record<string, unknown>): LogEntry {
    const status = typeof fields.status === 'number' ? fields.status : undefined;
    // Legacy aliases kept so existing consumers of `url` / `size` / `bodyBytes` still work.
    fields.url = fields.path;
    fields.size = fields.bytes;
    fields.bodyBytes = fields.bytes;
    return {
      timestamp: ts,
      level: status !== undefined ? statusToLevel(status) : 'INFO',
      message: `${fields.method ?? ''} ${fields.path ?? ''} ${status ?? '-'}`.trim(),
      metadata: fields,
      raw: line,
      lineNumber,
    };
  }
}

/**
 * nginx error log: 2024/12/10 10:30:45 [error] 1234#5678: *91011 message, client: 1.2.3.4, server: x, request: "GET / HTTP/1.1"
 */
export class NginxErrorParser extends BaseParser {
  readonly format: LogFormat = 'nginx';
  private readonly pattern = /^(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2})\s+\[(\w+)\]\s+(\d+)#(\d+):\s+(?:\*(\d+)\s+)?(.*)$/;

  parseLine(line: string, lineNumber: number): LogEntry | null {
    const m = line.match(this.pattern);
    if (!m) return null;
    const [, ts, level, pid, tid, cid, message] = m;
    const ctx: Record<string, unknown> = { pid: parseInt(pid, 10), tid: parseInt(tid, 10) };
    if (cid) ctx.connection = parseInt(cid, 10);
    let clean = message;
    for (const key of ['client', 'server', 'request', 'upstream', 'host', 'referrer']) {
      const re = new RegExp(`,\\s*${key}:\\s*("([^"]*)"|[^,]+)`);
      const km = clean.match(re);
      if (km) {
        ctx[key] = km[2] ?? km[1].trim();
        clean = clean.replace(km[0], '');
      }
    }
    if (typeof ctx.request === 'string') {
      const [method, path] = ctx.request.split(' ');
      ctx.method = method;
      ctx.path = path;
    }
    return {
      timestamp: this.parseTimestamp(ts),
      level: this.parseLevel(level),
      message: clean.trim(),
      metadata: ctx,
      raw: line,
      lineNumber,
    };
  }
}

/**
 * Apache error log (2.4): [Sun Dec 10 10:30:45.123456 2024] [module:level] [pid 1:tid 2] [client 1.2.3.4:5] AH00001: msg
 * Apache 2.2:             [Sun Dec 10 10:30:45 2024] [error] [client 1.2.3.4] msg
 */
export class ApacheErrorParser extends BaseParser {
  readonly format: LogFormat = 'apache';
  private readonly modern =
    /^\[(\w+\s+\w+\s+\d+\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?\s+\d{4})\]\s+\[([^\]:]*):(\w+)\]\s+\[pid\s+(\d+)(?::tid\s+(\d+))?\](?:\s+\[client\s+([^\]]+)\])?\s+(.*)$/;
  private readonly legacy = /^\[(\w+\s+\w+\s+\d+\s+\d{2}:\d{2}:\d{2}\s+\d{4})\]\s+\[(\w+)\](?:\s+\[client\s+([^\]]+)\])?\s+(.*)$/;

  parseLine(line: string, lineNumber: number): LogEntry | null {
    let m = line.match(this.modern);
    if (m) {
      const [, ts, module, level, pid, tid, client, message] = m;
      const code = message.match(/^(AH\d+):\s*/);
      return {
        timestamp: this.parseTimestamp(ts),
        level: this.parseLevel(level.replace(/^trace\d$/, 'trace')),
        message: code ? message.slice(code[0].length) : message,
        logger: module || undefined,
        metadata: {
          pid: parseInt(pid, 10),
          ...(tid ? { tid: parseInt(tid, 10) } : {}),
          ...(client ? { client: client.replace(/:\d+$/, '') } : {}),
          ...(code ? { errorCode: code[1] } : {}),
        },
        raw: line,
        lineNumber,
      };
    }
    m = line.match(this.legacy);
    if (!m) return null;
    const [, ts, level, client, message] = m;
    if (!this.strictLevel(level)) return null;
    return {
      timestamp: this.parseTimestamp(ts),
      level: this.parseLevel(level),
      message,
      metadata: client ? { client } : {},
      raw: line,
      lineNumber,
    };
  }
}

/** Access + error log for one server family. */
export class WebServerParser extends BaseParser {
  readonly multiline = false;
  private readonly access: AccessLogParser;
  private readonly error: BaseParser | null;

  constructor(readonly format: LogFormat) {
    super();
    this.access = new AccessLogParser(format);
    this.error = format === 'nginx' ? new NginxErrorParser() : format === 'apache' ? new ApacheErrorParser() : null;
  }

  parseLine(line: string, lineNumber: number): LogEntry | null {
    return this.access.parseLine(line, lineNumber) ?? this.error?.parseLine(line, lineNumber) ?? null;
  }
}
