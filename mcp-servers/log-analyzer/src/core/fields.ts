// SPDX-License-Identifier: MIT
/**
 * Uniform field access over entries of any format, used by the query engine,
 * access-log analytics and correlation.
 *
 * Built-in names: timestamp, level, message (msg), raw (line), logger, thread,
 * source (file), stream, traceId, spanId, parentSpanId, requestId, userId,
 * sessionId, exception (exception.type), exception.message, lineNumber.
 * Anything else is looked up in the structured fields: first as a literal key
 * ("http.status_code"), then as a dotted path, then case-insensitively.
 */

import type { LogEntry } from '../types.js';
import { parseDurationMs } from './timestamp.js';

const BUILTINS: Record<string, (e: LogEntry) => unknown> = {
  timestamp: (e) => e.timestamp?.toISOString() ?? null,
  time: (e) => e.timestamp?.toISOString() ?? null,
  level: (e) => e.level,
  message: (e) => e.message,
  msg: (e) => e.message,
  raw: (e) => e.raw,
  _raw: (e) => e.raw,
  line: (e) => e.raw,
  logger: (e) => e.logger,
  thread: (e) => e.thread,
  source: (e) => e.source,
  file: (e) => e.source,
  stream: (e) => e.stream,
  traceid: (e) => e.traceId,
  spanid: (e) => e.spanId,
  parentspanid: (e) => e.parentSpanId,
  requestid: (e) => e.requestId,
  userid: (e) => e.userId,
  sessionid: (e) => e.sessionId,
  exception: (e) => e.exception?.type,
  'exception.type': (e) => e.exception?.type,
  'exception.message': (e) => e.exception?.message,
  linenumber: (e) => e.lineNumber,
};

function lookupPath(obj: Record<string, unknown>, path: string): unknown {
  if (path in obj) return obj[path];
  const parts = path.split('.');
  let cur: unknown = obj;
  for (let i = 0; i < parts.length; i++) {
    if (!cur || typeof cur !== 'object') return undefined;
    const rec = cur as Record<string, unknown>;
    // Allow a literal dotted remainder at any level ({"http": {"status.code": 1}})
    const rest = parts.slice(i).join('.');
    if (rest in rec) return rec[rest];
    let next = rec[parts[i]];
    if (next === undefined) {
      const lower = parts[i].toLowerCase();
      const key = Object.keys(rec).find((k) => k.toLowerCase() === lower);
      next = key !== undefined ? rec[key] : undefined;
    }
    cur = next;
  }
  return cur;
}

/** Resolve a field by name; undefined when absent. */
export function getField(entry: LogEntry, name: string): unknown {
  const builtin = BUILTINS[name.toLowerCase()];
  if (builtin) {
    const v = builtin(entry);
    if (v !== undefined && v !== null) return v;
  }
  if (entry.metadata) {
    const v = lookupPath(entry.metadata, name);
    if (v !== undefined) return v;
  }
  return undefined;
}

/** Coerce a field value to a number (numbers, numeric strings, durations like "18ms"). */
export function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'string') {
    const t = value.trim();
    if (/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(t)) return parseFloat(t);
    return parseDurationMs(t);
  }
  return null;
}

/** Stringify a field value for grouping keys. */
export function fieldKey(value: unknown): string {
  if (value === undefined) return '(missing)';
  if (value === null) return '(null)';
  if (typeof value === 'object') return JSON.stringify(value).slice(0, 200);
  return String(value).slice(0, 200);
}

/** First value found among several candidate field names. */
export function firstField(entry: LogEntry, names: string[]): unknown {
  for (const n of names) {
    const v = getField(entry, n);
    if (v !== undefined && v !== null && v !== '' && v !== '-') return v;
  }
  return undefined;
}
