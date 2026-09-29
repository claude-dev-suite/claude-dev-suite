// SPDX-License-Identifier: MIT
/**
 * Correlation-id extraction that works for every format, not just JSON/MDC.
 *
 * Sources, in order of trust:
 *  1. Structured fields at any depth (trace_id, traceId, trace.id, @tr,
 *     otelTraceID, dd.trace_id, x-b3-traceid, traceparent, request_id,
 *     x-request-id, correlationId, req.id, …)
 *  2. A W3C `traceparent` value anywhere in the raw line
 *  3. Spring Boot / Sleuth `[app,traceId,spanId]` and `[traceId,spanId]` MDC blocks
 *  4. key=value / key: value mentions in the raw text
 */

import type { LogEntry } from '../types.js';

type Role = 'trace' | 'span' | 'parent' | 'request' | 'user' | 'session';

/** Normalised key path (lowercase, separators removed) → role. */
const KEY_ROLES: Record<string, Role> = {
  traceid: 'trace', oteltraceid: 'trace', ddtraceid: 'trace', xb3traceid: 'trace', b3traceid: 'trace',
  tr: 'trace', loggingtrace: 'trace', loggingoogleapiscomtrace: 'trace', awsxraytraceid: 'trace',
  spanid: 'span', otelspanid: 'span', ddspanid: 'span', xb3spanid: 'span', b3spanid: 'span', sp: 'span',
  loggingoogleapiscomspanid: 'span',
  parentspanid: 'parent', xb3parentspanid: 'parent', parentid: 'parent',
  requestid: 'request', reqid: 'request', xrequestid: 'request', correlationid: 'request',
  xcorrelationid: 'request', httprequestid: 'request', requestuuid: 'request', awsrequestid: 'request',
  xamznrequestid: 'request', cfray: 'request',
  userid: 'user', enduserid: 'user', usrid: 'user',
  sessionid: 'session',
};

function normKey(path: string): string {
  return path.toLowerCase().replace(/[^a-z0-9]/g, '');
}

const TRACEPARENT = /\b00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}\b/i;
const SLEUTH = /\[(?:[\w.\-]*,)?([0-9a-f]{32}|[0-9a-f]{16}),([0-9a-f]{16})(?:,(?:true|false))?\]/;
const TEXT_PATTERNS: Array<[Role, RegExp]> = [
  ['trace', /\b(?:trace[_-]?id|x-b3-traceid|otelTraceID|dd\.trace_id)["']?\s*[=:]\s*["']?([0-9a-fA-F-]{16,36}|\d{6,20})\b/i],
  ['span', /\b(?:span[_-]?id|x-b3-spanid|otelSpanID|dd\.span_id)["']?\s*[=:]\s*["']?([0-9a-fA-F]{16}|\d{6,20})\b/i],
  ['parent', /\b(?:parent[_-]?span[_-]?id|x-b3-parentspanid)["']?\s*[=:]\s*["']?([0-9a-fA-F]{16})\b/i],
  ['request', /\b(?:x-request-id|request[_-]?id|req[_-]?id|correlation[_-]?id|x-correlation-id)["']?\s*[=:]\s*["']?([\w.:\-]{4,128})/i],
];

function cleanId(role: Role, value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  let s = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : undefined;
  if (!s) return undefined;
  if (role === 'trace' || role === 'span' || role === 'parent') {
    // GCP: "projects/<p>/traces/<id>"
    const gcp = s.match(/traces\/([0-9a-f]{16,32})$/i);
    if (gcp) s = gcp[1];
    // X-Ray: "1-5759e988-bd862e3fe1be46a994272793"
    if (/^1-[0-9a-f]{8}-[0-9a-f]{24}$/i.test(s)) return s.toLowerCase();
    const tp = s.match(TRACEPARENT);
    if (tp) s = role === 'trace' ? tp[1] : tp[2];
    if (!/^(?:[0-9a-fA-F]{8,64}|\d{6,20})$/.test(s)) return undefined;
    if (/^0+$/.test(s)) return undefined; // invalid all-zero id
    return s.toLowerCase();
  }
  if (s.length > 200 || s === '-' || s.toLowerCase() === 'null') return undefined;
  return s;
}

/** Walk structured metadata (bounded depth) collecting id candidates. */
function scanFields(
  obj: Record<string, unknown>, prefix: string, depth: number, found: Partial<Record<Role, string>>,
): void {
  if (depth > 3) return;
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      scanFields(value as Record<string, unknown>, path, depth + 1, found);
      continue;
    }
    const nk = normKey(path);
    const leaf = normKey(key);
    if (leaf === 'traceparent' && typeof value === 'string') {
      const tp = value.match(TRACEPARENT);
      if (tp) {
        found.trace ??= tp[1].toLowerCase();
        found.parent ??= tp[2].toLowerCase();
      }
      continue;
    }
    const role = KEY_ROLES[nk] ?? KEY_ROLES[leaf];
    if (!role || found[role]) continue;
    // `sp`/`tr` only count as Serilog's `@sp`/`@tr`, not arbitrary short keys.
    if ((leaf === 'sp' || leaf === 'tr') && !key.startsWith('@')) continue;
    if (leaf === 'parentid' && !/^[0-9a-f]{16}$/i.test(String(value))) continue;
    const id = cleanId(role, value);
    if (id) found[role] = id;
  }
}

/**
 * Fill traceId / spanId / parentSpanId / requestId / userId / sessionId on the
 * entry from whatever the record carries. Existing values win.
 */
export function enrichCorrelation(entry: LogEntry): void {
  const found: Partial<Record<Role, string>> = {};
  if (entry.metadata) scanFields(entry.metadata, '', 0, found);

  const text = entry.raw.length > 8192 ? entry.raw.slice(0, 8192) : entry.raw;
  if (!found.trace || !found.span) {
    const tp = text.match(TRACEPARENT);
    if (tp) {
      found.trace ??= tp[1].toLowerCase();
      // In a traceparent header the span is the *caller's* span → our parent.
      found.parent ??= tp[2].toLowerCase();
    }
  }
  if (!found.trace) {
    const sl = text.match(SLEUTH);
    if (sl) {
      found.trace = sl[1].toLowerCase();
      found.span ??= sl[2].toLowerCase();
    }
  }
  for (const [role, re] of TEXT_PATTERNS) {
    if (found[role]) continue;
    const m = text.match(re);
    if (m) {
      const id = cleanId(role, m[1]);
      if (id) found[role] = id;
    }
  }

  entry.traceId ||= found.trace;
  entry.spanId ||= found.span;
  entry.parentSpanId ||= found.parent;
  entry.requestId ||= found.request;
  entry.userId ||= found.user;
  entry.sessionId ||= found.session;
  // Normalise ids the parsers already set.
  if (entry.traceId) entry.traceId = cleanId('trace', entry.traceId) ?? entry.traceId;
  if (entry.spanId) entry.spanId = cleanId('span', entry.spanId) ?? entry.spanId;
}
