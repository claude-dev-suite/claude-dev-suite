// SPDX-License-Identifier: MIT
/**
 * Bounded serialisation of entries and scan summaries for tool output.
 */

import type { ExceptionInfo, LogEntry, TimeRange } from '../types.js';
import type { ScanSummary } from '../pipeline/index.js';

export interface SerializeOptions {
  maxMessage?: number;
  maxFrames?: number;
  includeRaw?: boolean;
  maxMetadataChars?: number;
}

function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + ` …[+${s.length - n} chars]` : s;
}

function serializeException(ex: ExceptionInfo, maxFrames: number, depth = 0): Record<string, unknown> {
  const out: Record<string, unknown> = {
    type: ex.type,
    message: clip(ex.message, 2000),
    frames: ex.stackTrace.slice(0, maxFrames),
  };
  if (ex.stackTrace.length > maxFrames) out.framesTruncated = ex.stackTrace.length - maxFrames;
  if (ex.omittedFrames) out.omittedFrames = ex.omittedFrames;
  if (ex.language && ex.language !== 'unknown') out.language = ex.language;
  if (ex.causedBy && depth < 8) {
    out.causedBy = serializeException(ex.causedBy, Math.min(maxFrames, 10), depth + 1);
    if (ex.causeRelation) out.causeRelation = ex.causeRelation;
  }
  return out;
}

/** Plain, size-bounded representation of an entry. */
export function serializeEntry(e: LogEntry, opts: SerializeOptions = {}): Record<string, unknown> {
  const maxMessage = opts.maxMessage ?? 2000;
  const maxFrames = opts.maxFrames ?? 25;
  const out: Record<string, unknown> = {
    timestamp: e.timestamp ? e.timestamp.toISOString() : null,
    level: e.level,
    message: clip(e.message, maxMessage),
  };
  if (e.source) out.source = e.source;
  out.lineNumber = e.lineNumber;
  for (const k of ['logger', 'thread', 'class', 'method', 'line', 'stream', 'traceId', 'spanId', 'parentSpanId', 'requestId', 'userId', 'sessionId'] as const) {
    if (e[k] !== undefined && e[k] !== '') out[k] = e[k];
  }
  if (e.exception) out.exception = serializeException(e.exception, maxFrames);
  else if (e.stackTrace?.length) out.continuation = e.stackTrace.slice(0, maxFrames);
  if (e.metadata && Object.keys(e.metadata).length) {
    const json = JSON.stringify(e.metadata);
    const cap = opts.maxMetadataChars ?? 3000;
    out.fields = json.length <= cap ? e.metadata : { _truncated: true, _keys: Object.keys(e.metadata).slice(0, 50), _preview: json.slice(0, cap) };
  }
  if (opts.includeRaw) out.raw = clip(e.raw, maxMessage);
  return out;
}

/** Summary block describing what was read, for every tool result. */
export function describeScan(s: ScanSummary): Record<string, unknown> {
  const out: Record<string, unknown> = {
    sources: s.sources,
    entriesScanned: s.entriesScanned,
    entriesMatched: s.entriesMatched,
  };
  if (s.excludedNoTimestamp) {
    out.excludedNoTimestamp = s.excludedNoTimestamp;
    out.note = `${s.excludedNoTimestamp} entries had no parseable timestamp and were excluded by the time filter`;
  }
  if (s.skipped.length) out.skipped = s.skipped.slice(0, 50);
  if (s.filesTruncated) out.filesTruncated = true;
  if (s.stoppedEarly) out.stoppedEarly = true;
  return out;
}

/** Running min/max over nullable timestamps. */
export class TimeSpan {
  start: Date | null = null;
  end: Date | null = null;
  add(t: Date | null): void {
    if (!t) return;
    if (!this.start || t < this.start) this.start = t;
    if (!this.end || t > this.end) this.end = t;
  }
  get range(): TimeRange {
    return { start: this.start, end: this.end };
  }
  toJSON(): Record<string, string | null> {
    return { start: this.start?.toISOString() ?? null, end: this.end?.toISOString() ?? null };
  }
}

/** Bucket key for a timestamp at a given width. */
export function bucketKey(t: Date, widthMs: number): string {
  return new Date(Math.floor(t.getTime() / widthMs) * widthMs).toISOString();
}
