// SPDX-License-Identifier: MIT
/**
 * Correlation across files and services.
 *
 * correlate_events — group entries of several sources into chains by a
 *   correlation field (requestId, traceId, spanId, sessionId, userId or any
 *   custom field). Ids come from structured fields at any depth, W3C
 *   traceparent, Sleuth/Micrometer MDC blocks, and key=value text, so this
 *   works for JSON, logfmt, text and access logs alike.
 * trace_timeline — every entry for one trace/request id across all sources,
 *   in time order, with the span parent/child tree when span ids are logged.
 */

import type { LogEntry, SourceInput } from '../types.js';
import { getField, fieldKey } from '../core/fields.js';
import { isErrorLevel } from '../core/levels.js';
import { scan, type PipelineDeps } from '../pipeline/index.js';
import { describeScan, serializeEntry, TimeSpan } from './output.js';

const MAX_EVENTS = 50000;
const MAX_CHAINS = 20000;

function sortByTime(a: LogEntry, b: LogEntry): number {
  if (a.timestamp && b.timestamp) return a.timestamp.getTime() - b.timestamp.getTime();
  if (a.timestamp) return -1;
  if (b.timestamp) return 1;
  return 0;
}

export function correlationValue(e: LogEntry, field: string): string | undefined {
  const v = getField(e, field);
  if (v === undefined || v === null || v === '' || v === '-') return undefined;
  return fieldKey(v);
}

export async function correlateEvents(
  input: SourceInput,
  o: { field: string; targetValue?: string; startTime?: Date; endTime?: Date; limit?: number; eventsPerChain?: number },
  deps: PipelineDeps = {},
): Promise<Record<string, unknown>> {
  const chains = new Map<string, LogEntry[]>();
  let events = 0;
  let dropped = 0;
  let chainOverflow = 0;
  const summary = await scan(input, { filter: { startTime: o.startTime, endTime: o.endTime } }, (e) => {
    const v = correlationValue(e, o.field);
    if (!v || (o.targetValue && v !== o.targetValue)) return;
    let list = chains.get(v);
    if (!list) {
      if (chains.size >= MAX_CHAINS) { chainOverflow++; return; }
      list = [];
      chains.set(v, list);
    }
    if (events >= MAX_EVENTS) { dropped++; return; }
    events++;
    list.push(e);
  }, deps);

  const perChain = Math.min(o.eventsPerChain ?? 20, 200);
  const built = [...chains.entries()].map(([value, list]) => {
    list.sort(sortByTime);
    const span = new TimeSpan();
    list.forEach((e) => span.add(e.timestamp));
    const sources = new Set(list.map((e) => e.source ?? ''));
    const hasError = list.some((e) => isErrorLevel(e.level));
    return {
      correlationValue: value,
      eventCount: list.length,
      sources: [...sources],
      timespanMs: span.start && span.end ? span.end.getTime() - span.start.getTime() : null,
      start: span.start?.toISOString() ?? null,
      hasError,
      events: list.slice(0, perChain).map((e) => serializeEntry(e, { maxFrames: 5, maxMessage: 500, maxMetadataChars: 800 })),
      ...(list.length > perChain ? { eventsOmitted: list.length - perChain } : {}),
    };
  });
  // Chains spanning several sources and chains with errors are the interesting ones.
  built.sort((a, b) => Number(b.hasError) - Number(a.hasError) || b.sources.length - a.sources.length || b.eventCount - a.eventCount);
  const limit = Math.min(o.limit ?? 20, 200);
  return {
    correlationField: o.field,
    totalChains: built.length,
    chainsWithErrors: built.filter((c) => c.hasError).length,
    crossSourceChains: built.filter((c) => c.sources.length > 1).length,
    avgEventsPerChain: built.length ? Math.round((events / built.length) * 100) / 100 : 0,
    chains: built.slice(0, limit),
    ...(built.length > limit ? { truncated: true, chainsOmitted: built.length - limit } : {}),
    ...(dropped ? { eventsDropped: dropped, note: `event cap ${MAX_EVENTS} reached` } : {}),
    ...(chainOverflow ? { entriesBeyondChainLimit: chainOverflow } : {}),
    scan: describeScan(summary),
  };
}

interface SpanNode {
  spanId: string;
  parentSpanId?: string;
  services: Set<string>;
  span: TimeSpan;
  entries: number;
  errors: number;
  firstMessage: string;
  children: SpanNode[];
}

function spanJson(n: SpanNode, depth = 0): Record<string, unknown> {
  return {
    spanId: n.spanId,
    ...(n.parentSpanId ? { parentSpanId: n.parentSpanId } : {}),
    services: [...n.services],
    start: n.span.start?.toISOString() ?? null,
    end: n.span.end?.toISOString() ?? null,
    logDurationMs: n.span.start && n.span.end ? n.span.end.getTime() - n.span.start.getTime() : null,
    entries: n.entries,
    errors: n.errors,
    firstMessage: n.firstMessage,
    ...(n.children.length && depth < 30 ? { children: n.children.map((c) => spanJson(c, depth + 1)) } : {}),
  };
}

export async function traceTimeline(
  input: SourceInput,
  o: { id: string; field?: string; startTime?: Date; endTime?: Date; limit?: number },
  deps: PipelineDeps = {},
): Promise<Record<string, unknown>> {
  const id = o.id.trim();
  const idLower = id.toLowerCase();
  const fields = o.field ? [o.field] : ['traceId', 'requestId'];
  const matched: LogEntry[] = [];
  let total = 0;
  const summary = await scan(input, { filter: { startTime: o.startTime, endTime: o.endTime } }, (e) => {
    const hit = fields.some((f) => {
      const v = correlationValue(e, f);
      return v !== undefined && (v === id || v.toLowerCase() === idLower);
    });
    if (!hit) return;
    total++;
    if (matched.length < MAX_EVENTS) matched.push(e);
  }, deps);

  matched.sort(sortByTime);
  const span = new TimeSpan();
  const services = new Map<string, { entries: number; errors: number; span: TimeSpan }>();
  const spans = new Map<string, SpanNode>();
  for (const e of matched) {
    span.add(e.timestamp);
    const svc = String(getField(e, 'service.name') ?? getField(e, 'service') ?? e.logger ?? e.source ?? 'unknown');
    const s = services.get(svc) ?? { entries: 0, errors: 0, span: new TimeSpan() };
    s.entries++;
    if (isErrorLevel(e.level)) s.errors++;
    s.span.add(e.timestamp);
    services.set(svc, s);
    if (e.spanId) {
      let n = spans.get(e.spanId);
      if (!n) {
        n = { spanId: e.spanId, parentSpanId: e.parentSpanId, services: new Set(), span: new TimeSpan(), entries: 0, errors: 0, firstMessage: e.message.split('\n')[0].slice(0, 200), children: [] };
        spans.set(e.spanId, n);
      }
      n.parentSpanId ??= e.parentSpanId;
      n.services.add(svc);
      n.span.add(e.timestamp);
      n.entries++;
      if (isErrorLevel(e.level)) n.errors++;
    }
  }
  const roots: SpanNode[] = [];
  let hasParents = false;
  for (const n of spans.values()) {
    const parent = n.parentSpanId ? spans.get(n.parentSpanId) : undefined;
    if (parent && parent !== n) { parent.children.push(n); hasParents = true; } else roots.push(n);
  }
  const bySpanStart = (a: SpanNode, b: SpanNode) => (a.span.start?.getTime() ?? 0) - (b.span.start?.getTime() ?? 0);
  roots.sort(bySpanStart);
  for (const n of spans.values()) n.children.sort(bySpanStart);

  const limit = Math.min(o.limit ?? 200, 1000);
  const t0 = span.start?.getTime();
  return {
    id,
    matchedFields: fields,
    entries: total,
    ...(total === 0 ? { note: `No entry carries ${fields.join(' or ')} = ${id}` } : {}),
    timeRange: { ...span.toJSON(), durationMs: span.start && span.end ? span.end.getTime() - span.start.getTime() : null },
    services: [...services.entries()].map(([name, v]) => ({ name, entries: v.entries, errors: v.errors, ...v.span.toJSON() })),
    spanTree: spans.size
      ? { spans: spans.size, linkedByParent: hasParents, roots: roots.slice(0, 100).map((r) => spanJson(r)) }
      : null,
    ...(spans.size === 0 ? { spanNote: 'No span ids were logged for this trace; showing the flat timeline only' } : {}),
    timeline: matched.slice(0, limit).map((e) => ({
      offsetMs: t0 !== undefined && e.timestamp ? e.timestamp.getTime() - t0 : null,
      ...serializeEntry(e, { maxFrames: 5, maxMessage: 600, maxMetadataChars: 600 }),
    })),
    ...(matched.length > limit ? { truncated: true, entriesOmitted: total - limit } : {}),
    scan: describeScan(summary),
  };
}
