// SPDX-License-Identifier: MIT
/**
 * parse_logs, tail_logs and detect_format.
 */

import type { EntryFilter, LogEntry, SourceInput } from '../types.js';
import { emptyLevelCounts } from '../core/levels.js';
import { scan, tail, openSources, detectHandle, runSource, type PipelineDeps } from '../pipeline/index.js';
import { describeScan, serializeEntry, TimeSpan } from './output.js';

export const MAX_PAGE = 1000;

export async function parseLogs(
  input: SourceInput,
  o: { filter?: EntryFilter; limit?: number; offset?: number; includeRaw?: boolean },
  deps: PipelineDeps = {},
): Promise<Record<string, unknown>> {
  const limit = Math.min(Math.max(1, o.limit ?? 100), MAX_PAGE);
  const offset = Math.max(0, o.offset ?? 0);
  const page: LogEntry[] = [];
  const levelCounts = emptyLevelCounts();
  const span = new TimeSpan();
  let index = 0;
  // Counts and time range cover every matching entry, not just the page.
  const summary = await scan(input, { filter: o.filter }, (e) => {
    levelCounts[e.level]++;
    span.add(e.timestamp);
    if (index >= offset && page.length < limit) page.push(e);
    index++;
  }, deps);
  const matched = summary.entriesMatched;
  const truncated = offset + page.length < matched;
  return {
    formats: summary.sources.map((s) => ({ source: s.source, format: s.format, envelope: s.envelope, confidence: s.confidence })),
    totalLines: summary.sources.reduce((n, s) => n + s.lines, 0),
    parsedEntries: summary.entriesScanned,
    matchedEntries: matched,
    unparsedLines: summary.sources.reduce((n, s) => n + s.unparsedLines, 0),
    returnedEntries: page.length,
    offset,
    ...(truncated ? { truncated: true, nextOffset: offset + page.length } : {}),
    timeRange: span.toJSON(),
    levelCounts,
    entries: page.map((e) => serializeEntry(e, { includeRaw: o.includeRaw })),
    scan: describeScan(summary),
  };
}

export async function tailLogs(
  input: SourceInput,
  o: { lines?: number; filter?: EntryFilter },
  deps: PipelineDeps = {},
): Promise<Record<string, unknown>> {
  const n = Math.min(Math.max(1, o.lines ?? 50), MAX_PAGE);
  const r = await tail(input, { filter: o.filter }, n, deps);
  return {
    returnedEntries: r.entries.length,
    requested: n,
    ...(r.scannedBytes !== undefined ? { scannedBytesFromEnd: r.scannedBytes } : {}),
    ...(r.entries.length < n && !r.reachedStart ? { truncated: true, note: 'Scan window limit reached before finding enough matching entries' } : {}),
    ...(r.lineNumbersRelative ? { lineNumbers: 'relative to the scanned tail window' } : {}),
    entries: r.entries.map((e) => serializeEntry(e)),
    scan: describeScan(r.summary),
  };
}

export async function detectFormats(input: SourceInput, deps: PipelineDeps = {}): Promise<Record<string, unknown>> {
  const opened = await openSources(input, deps);
  const results = [];
  for (const h of opened.handles.slice(0, 50)) {
    const d = await detectHandle(h, { format: input.format, customPattern: input.customPattern });
    const head = await h.head();
    const sample: LogEntry[] = [];
    await runSource(h, head.slice(0, 60).map((text, i) => ({ text, lineNumber: i + 1 })), d, { customPattern: input.customPattern }, (e) => {
      sample.push(e);
      return sample.length < 3;
    });
    results.push({
      source: h.label,
      format: d.format,
      envelope: d.envelope,
      detectedBy: d.detectedBy,
      confidence: Math.round(d.confidence * 100) / 100,
      sampleLines: d.sampleLines,
      candidates: d.candidates.slice(0, 5),
      ...(d.plainMode ? { plainMode: d.plainMode } : {}),
      ...(d.warning ? { warning: d.warning } : {}),
      sampleEntries: sample.map((e) => serializeEntry(e, { maxMessage: 300, maxFrames: 3, maxMetadataChars: 600 })),
    });
  }
  return {
    sources: results,
    ...(opened.handles.length > 50 ? { truncated: true, sourcesOmitted: opened.handles.length - 50 } : {}),
    ...(opened.skipped.length ? { skipped: opened.skipped } : {}),
  };
}
