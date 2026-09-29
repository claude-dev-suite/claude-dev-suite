// SPDX-License-Identifier: MIT
/**
 * logfmt / key=value parser: logrus TextFormatter, Go slog TextHandler,
 * Heroku router lines, go-kit, and any generic `key=value key2="v w"` log.
 *
 *   time="2024-01-02T15:04:05Z" level=info msg="started" port=8080
 *   time=2024-01-02T15:04:05.000Z level=ERROR source=/app/main.go:42 msg="db down" err="dial tcp: refused"
 *   at=info method=GET path="/" host=x.herokuapp.com request_id=8601b555 fwd="1.2.3.4" dyno=web.1 connect=1ms service=18ms status=200 bytes=13
 *   2024-01-02T15:04:05Z level=warn msg="slow"      (leading timestamp prefix)
 */

import { BaseParser } from './base.js';
import type { LogEntry, LogFormat } from '../types.js';
import { parseLogfmt } from '../core/logfmt.js';
import { statusToLevel, toLevel } from '../core/levels.js';
import { LEADING_TIMESTAMP_RE, parseDurationMs, parseTimestamp } from '../core/timestamp.js';

const TIME_KEYS = ['time', 'ts', 'timestamp', 't', 'date', '@timestamp'];
const LEVEL_KEYS = ['level', 'lvl', 'severity', 'loglevel', 'log.level', 'at'];
const MSG_KEYS = ['msg', 'message', 'event'];

export class LogfmtParser extends BaseParser {
  constructor(readonly format: LogFormat = 'logfmt') {
    super();
  }

  parseLine(line: string, lineNumber: number): LogEntry | null {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('{') || /^\s/.test(line)) return null;
    const { pairs, count, prefix } = parseLogfmt(trimmed);
    if (count < 2) return null;
    const keys = Object.keys(pairs);
    const known = keys.some((k) => TIME_KEYS.includes(k) || LEVEL_KEYS.includes(k) || MSG_KEYS.includes(k));
    let prefixTs: Date | null = null;
    if (prefix) {
      const lt = prefix.match(LEADING_TIMESTAMP_RE);
      if (!lt || lt[0].length !== prefix.length) return null; // free text before pairs → not logfmt
      prefixTs = parseTimestamp(lt[0].replace(/^\[|\]$/g, ''));
    }
    if (!known && count < 3) return null;

    const pick = (list: string[]) => {
      for (const k of list) if (pairs[k] !== undefined && pairs[k] !== '') return { k, v: pairs[k] };
      return undefined;
    };
    const t = pick(TIME_KEYS);
    const lv = pick(LEVEL_KEYS);
    const mv = pick(MSG_KEYS);

    const metadata: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(pairs)) {
      if (k === t?.k || k === lv?.k || k === mv?.k) continue;
      metadata[k] = /^-?\d+(?:\.\d+)?$/.test(v) && v.length < 16 ? Number(v) : v;
    }

    let level = lv ? toLevel(lv.v) : null;
    const status = typeof metadata.status === 'number' ? metadata.status : undefined;
    if (!level && status !== undefined) level = statusToLevel(status);

    // Heroku router: service=18ms connect=1ms → durationMs
    if (metadata.service !== undefined && metadata.path !== undefined) {
      const d = parseDurationMs(String(metadata.service));
      if (d !== null) metadata.durationMs = d;
    }
    if (metadata.fwd !== undefined && metadata.remoteAddr === undefined) {
      metadata.remoteAddr = String(metadata.fwd).split(',')[0].trim();
    }

    let message = mv?.v;
    if (message === undefined) {
      if (metadata.method && metadata.path) message = `${metadata.method} ${metadata.path} ${metadata.status ?? ''}`.trim();
      else message = trimmed;
    }

    const entry: LogEntry = {
      timestamp: t ? parseTimestamp(t.v) : prefixTs,
      level: level ?? 'INFO',
      message,
      logger: typeof metadata.logger === 'string' ? metadata.logger : typeof metadata.component === 'string' ? metadata.component : undefined,
      metadata,
      raw: line,
      lineNumber,
    };
    const source = metadata.source ?? metadata.caller;
    if (typeof source === 'string') {
      const sm = source.match(/^(.*):(\d+)$/);
      if (sm) { entry.class = sm[1]; entry.line = parseInt(sm[2], 10); }
    }
    const err = metadata.error ?? metadata.err;
    if (typeof err === 'string' && err) {
      entry.exception = { type: 'Error', message: err, stackTrace: [] };
    }
    if (typeof metadata.stack === 'string' || typeof metadata.stacktrace === 'string') {
      entry.stackTrace = String(metadata.stack ?? metadata.stacktrace).split(/\\n|\n/);
    }
    return entry;
  }
}
