// SPDX-License-Identifier: MIT
/**
 * The streaming pipeline every tool reads through:
 *
 *   source (file | dir | glob | .gz | live CLI)
 *     → raw lines
 *     → envelope unwrap (docker json-file, CRI, heroku, cloudwatch, otlp, CLI prefixes)
 *     → payload parser (per detected / explicit format)
 *     → multiline assembler (stack traces, tracebacks, panics) per stream key
 *     → finalize (exception, correlation ids, key=value fields)
 *     → filter (time / level / regex) → visitor
 *
 * Nothing here holds more than one pending entry per stream key; aggregates
 * live in the visitors. Detection reads only each source's head.
 */

import { readFile, stat } from 'fs/promises';
import type { EntryFilter, LogEntry, LogFormat, SourceInput } from '../types.js';
import { createEnvelope, createParser, detectFormat, type Detection, type EnvelopeName, type InnerItem } from '../parsers/index.js';
import { Assembler, emptyAssemblerStats, type AssemblerStats } from './assembler.js';
import { readFileLines, readHead, readTailWindow, isGzip, type RawLine } from '../sources/files.js';
import { resolvePaths, DEFAULT_MAX_FILES } from '../sources/resolve.js';
import { fetchLive, type ExecFn } from '../sources/live.js';

/** Largest file read whole when it is a single JSON document (CloudWatch export, pretty OTLP). */
const MAX_DOCUMENT_BYTES = 256 * 1024 * 1024;

export interface SourceHandle {
  label: string;
  kind: 'file' | 'live';
  forcedEnvelope?: EnvelopeName | null;
  head(): Promise<string[]>;
  lines(): AsyncIterable<RawLine>;
  /** Plain seekable file (tail can read from the end). */
  seekable: boolean;
  path?: string;
  size?: number;
  command?: string;
  warnings: string[];
}

export interface SourceReport {
  source: string;
  format: LogFormat;
  envelope: EnvelopeName | null;
  detectedBy: Detection['detectedBy'];
  confidence: number;
  lines: number;
  entries: number;
  continuationLines: number;
  unparsedLines: number;
  entriesWithoutTimestamp: number;
  droppedContinuationLines?: number;
  sampleUnparsed?: string[];
  command?: string;
  warnings?: string[];
}

export interface OpenResult {
  handles: SourceHandle[];
  skipped: Array<{ path: string; reason: string }>;
  filesTruncated: boolean;
}

export interface PipelineDeps {
  exec?: ExecFn;
  maxFiles?: number;
}

function arrayLines(lines: RawLine[]): AsyncIterable<RawLine> {
  return (async function* () { yield* lines; })();
}

/** Detect a file that is one JSON document rather than JSON lines. */
function looksLikeDocument(head: string[]): boolean {
  const first = head.find((l) => l.trim())?.trim() ?? '';
  if (!(first.startsWith('{') || first.startsWith('['))) return false;
  if (first.startsWith('{') && first.endsWith('}')) {
    try { JSON.parse(first); return false; } catch { /* not a complete line */ }
  }
  const joined = head.join('\n');
  return /"(events|logEvents|resourceLogs)"\s*:/.test(joined) || first === '[';
}

async function fileHandle(path: string, size: number): Promise<SourceHandle> {
  const gz = await isGzip(path);
  let headCache: string[] | null = null;
  const head = async () => (headCache ??= await readHead(path));
  const h = await head();
  if (looksLikeDocument(h)) {
    // Whole-document JSON: parse once, present each record as a line.
    let docLines: RawLine[] | null = null;
    const load = async () => {
      if (docLines) return docLines;
      if (!gz && size > MAX_DOCUMENT_BYTES) {
        throw new Error(`${path} is a single JSON document larger than ${MAX_DOCUMENT_BYTES} bytes; export it as JSON lines instead`);
      }
      let text: string;
      if (gz) {
        const parts: string[] = [];
        for await (const l of readFileLines(path, { gz: true })) parts.push(l.text);
        text = parts.join('\n');
      } else {
        text = await readFile(path, 'utf-8');
      }
      let doc: unknown;
      try {
        doc = JSON.parse(text.replace(/^﻿/, ''));
      } catch (err) {
        throw new Error(`${path} looks like a JSON document but does not parse: ${(err as Error).message}`);
      }
      const records = Array.isArray(doc) ? doc : [doc];
      docLines = records.map((r, i) => ({ text: JSON.stringify(r), lineNumber: i + 1 }));
      return docLines;
    };
    return {
      label: path, kind: 'file', path, size, seekable: false, warnings: [],
      head: async () => (await load()).slice(0, 50).map((l) => l.text),
      lines: () => (async function* () { yield* await load(); })(),
    };
  }
  return {
    label: path, kind: 'file', path, size, seekable: !gz, warnings: [],
    head,
    lines: () => readFileLines(path, { gz }),
  };
}

/** Resolve the input into readable source handles. */
export async function openSources(input: SourceInput, deps: PipelineDeps = {}): Promise<OpenResult> {
  const handles: SourceHandle[] = [];
  let skipped: OpenResult['skipped'] = [];
  let filesTruncated = false;

  if (input.paths && input.paths.length > 0) {
    const r = await resolvePaths(input.paths, deps.maxFiles ?? DEFAULT_MAX_FILES);
    skipped = r.skipped;
    filesTruncated = r.truncated;
    for (const f of r.files) handles.push(await fileHandle(f.path, f.size));
  }
  const liveSources = input.source ? (Array.isArray(input.source) ? input.source : [input.source]) : [];
  if (liveSources.length > 10) throw new Error('At most 10 live sources per call');
  for (const src of liveSources) {
    const live = await fetchLive(src, deps.exec);
    handles.push({
      label: live.label, kind: 'live', forcedEnvelope: live.envelope, seekable: false,
      command: live.command, warnings: live.warnings,
      head: async () => live.lines.slice(0, 200).map((l) => l.text),
      lines: () => arrayLines(live.lines),
    });
  }
  if (handles.length === 0) {
    const reasons = skipped.map((s) => `${s.path}: ${s.reason}`).join('; ');
    throw new Error(reasons ? `No readable log sources (${reasons})` : 'No log source given: pass filePath/filePaths or source');
  }
  return { handles, skipped, filesTruncated };
}

/** Does an entry pass the filter? Updates the no-timestamp counter. */
export function matchEntry(e: LogEntry, f: EntryFilter | undefined, counters: { excludedNoTimestamp: number }): boolean {
  if (!f) return true;
  if (f.startTime || f.endTime) {
    if (!e.timestamp) {
      // Explicit, counted exclusion — never a silent pass or a fake "now".
      counters.excludedNoTimestamp++;
      return false;
    }
    if (f.startTime && e.timestamp < f.startTime) return false;
    if (f.endTime && e.timestamp > f.endTime) return false;
  }
  if (f.levels && f.levels.length > 0 && !f.levels.includes(e.level)) return false;
  if (f.filter) {
    f.filter.lastIndex = 0;
    if (!f.filter.test(e.message)) {
      f.filter.lastIndex = 0;
      if (!f.filter.test(e.raw)) return false;
    }
  }
  return true;
}

export interface ScanOptions {
  format?: LogFormat;
  customPattern?: string;
  filter?: EntryFilter;
}

export interface ScanSummary {
  sources: SourceReport[];
  skipped: OpenResult['skipped'];
  filesTruncated: boolean;
  entriesScanned: number;
  entriesMatched: number;
  excludedNoTimestamp: number;
  stoppedEarly: boolean;
}

/** Visitor: return false to stop reading. */
export type Visitor = (entry: LogEntry, source: SourceHandle) => boolean | void;

/**
 * Push-based decoder for one source: raw line → envelope → parser → assembler.
 * Used by both the batch pipeline and the live watcher.
 */
export class Decoder {
  readonly stats: AssemblerStats = emptyAssemblerStats();
  rawLines = 0;
  private readonly envelope;
  private readonly assemblers = new Map<string, Assembler>();
  private readonly payloadFormat: LogFormat;

  constructor(private readonly detection: Detection, private readonly label: string, private readonly customPattern?: string) {
    this.envelope = detection.envelope ? createEnvelope(detection.envelope) : null;
    this.payloadFormat = detection.format;
  }

  private asm(key: string | undefined): Assembler {
    const k = key ?? '';
    let a = this.assemblers.get(k);
    if (!a) {
      if (this.assemblers.size >= 1000) return this.assemblers.values().next().value!;
      a = new Assembler(createParser(this.payloadFormat, { customPattern: this.customPattern, plainMode: this.detection.plainMode }), this.stats, this.label);
      this.assemblers.set(k, a);
    }
    return a;
  }

  private items(items: InnerItem[]): LogEntry[] {
    const out: LogEntry[] = [];
    for (const it of items) {
      if (it.kind === 'line') out.push(...this.asm(it.line.key).push(it.line));
      else out.push(...this.asm(undefined).passthrough(it.entry));
    }
    return out;
  }

  push(raw: RawLine): LogEntry[] {
    this.rawLines++;
    if (!this.envelope) {
      return this.items([{ kind: 'line', line: { text: raw.text, lineNumber: raw.lineNumber, stream: raw.stream, key: raw.stream } }]);
    }
    const items = this.envelope.push(raw.text, raw.lineNumber, raw.stream);
    if (items === null) {
      if (raw.text.trim()) {
        this.stats.unparsedLines++;
        if (this.stats.sampleUnparsed.length < 5) this.stats.sampleUnparsed.push(raw.text.slice(0, 300));
      }
      return [];
    }
    return this.items(items);
  }

  /** Complete every pending entry (end of input). */
  flush(): LogEntry[] {
    const out = this.envelope ? this.items(this.envelope.flush()) : [];
    for (const a of this.assemblers.values()) out.push(...a.flush());
    return out;
  }

  /** Complete pending entries but keep envelope partial lines (watcher idle flush). */
  flushAssemblers(): LogEntry[] {
    const out: LogEntry[] = [];
    for (const a of this.assemblers.values()) out.push(...a.flush());
    return out;
  }
}

/** Run lines of one source through the decoder, calling `emit` per entry (false stops). */
export async function runSource(
  handle: SourceHandle,
  lines: AsyncIterable<RawLine> | Iterable<RawLine>,
  detection: Detection,
  opts: ScanOptions,
  emit: (e: LogEntry) => boolean,
): Promise<{ report: SourceReport; stopped: boolean }> {
  const decoder = new Decoder(detection, handle.label, opts.customPattern);
  const stats = decoder.stats;
  let stopped = false;
  const deliver = (list: LogEntry[]) => {
    for (const e of list) {
      if (!emit(e)) { stopped = true; return; }
    }
  };
  for await (const raw of lines) {
    deliver(decoder.push(raw));
    if (stopped) break;
  }
  if (!stopped) deliver(decoder.flush());
  const rawLines = decoder.rawLines;

  const report: SourceReport = {
    source: handle.label,
    format: detection.format,
    envelope: detection.envelope,
    detectedBy: detection.detectedBy,
    confidence: Math.round(detection.confidence * 100) / 100,
    lines: rawLines,
    entries: stats.entries,
    continuationLines: stats.continuationLines,
    unparsedLines: stats.unparsedLines,
    entriesWithoutTimestamp: stats.entriesWithoutTimestamp,
  };
  if (stats.droppedContinuationLines) report.droppedContinuationLines = stats.droppedContinuationLines;
  if (stats.sampleUnparsed.length) report.sampleUnparsed = stats.sampleUnparsed;
  if (handle.command) report.command = handle.command;
  const warnings = [...handle.warnings, ...(detection.warning ? [detection.warning] : [])];
  if (warnings.length) report.warnings = warnings;
  return { report, stopped };
}

/** Detect the format of one handle. */
export async function detectHandle(handle: SourceHandle, opts: ScanOptions): Promise<Detection> {
  const head = await handle.head();
  return detectFormat(head, { format: opts.format, customPattern: opts.customPattern, forcedEnvelope: handle.forcedEnvelope ?? undefined });
}

/**
 * Stream every entry of every source through `visit`. Entries failing the
 * filter are counted but not visited.
 */
export async function scan(
  input: SourceInput,
  opts: ScanOptions,
  visit: Visitor,
  deps: PipelineDeps = {},
): Promise<ScanSummary> {
  const opened = await openSources(input, deps);
  const summary: ScanSummary = {
    sources: [], skipped: opened.skipped, filesTruncated: opened.filesTruncated,
    entriesScanned: 0, entriesMatched: 0, excludedNoTimestamp: 0, stoppedEarly: false,
  };
  for (const handle of opened.handles) {
    const detection = await detectHandle(handle, { ...opts, format: opts.format ?? input.format, customPattern: opts.customPattern ?? input.customPattern });
    const { report, stopped } = await runSource(handle, handle.lines(), detection, { ...opts, customPattern: opts.customPattern ?? input.customPattern }, (e) => {
      summary.entriesScanned++;
      if (!matchEntry(e, opts.filter, summary)) return true;
      summary.entriesMatched++;
      return visit(e, handle) !== false;
    });
    summary.sources.push(report);
    if (stopped) { summary.stoppedEarly = true; break; }
  }
  return summary;
}

export interface TailResult {
  entries: LogEntry[];
  summary: ScanSummary;
  /** Bytes scanned from the end of a seekable file (undefined when the whole source was read). */
  scannedBytes?: number;
  reachedStart: boolean;
  lineNumbersRelative: boolean;
}

const TAIL_WINDOWS = [256 * 1024, 1024 * 1024, 4 * 1024 * 1024, 16 * 1024 * 1024, 64 * 1024 * 1024];

/**
 * Last `n` matching entries. Plain files are read backwards in growing windows
 * (a 10 GB file costs a few hundred KB); gzip, whole-document and live sources
 * are streamed with a ring buffer of `n` entries.
 */
export async function tail(input: SourceInput, opts: ScanOptions, n: number, deps: PipelineDeps = {}): Promise<TailResult> {
  const opened = await openSources(input, deps);
  const counters = { excludedNoTimestamp: 0 };
  const summary: ScanSummary = {
    sources: [], skipped: opened.skipped, filesTruncated: opened.filesTruncated,
    entriesScanned: 0, entriesMatched: 0, excludedNoTimestamp: 0, stoppedEarly: false,
  };
  const customPattern = opts.customPattern ?? input.customPattern;
  const format = opts.format ?? input.format;

  // Single seekable file: seek from the end.
  if (opened.handles.length === 1 && opened.handles[0].seekable) {
    const handle = opened.handles[0];
    const detection = await detectHandle(handle, { format, customPattern });
    for (const bytes of TAIL_WINDOWS) {
      const win = await readTailWindow(handle.path!, bytes);
      const collected: LogEntry[] = [];
      let scanned = 0;
      const windowCounters = { excludedNoTimestamp: 0 };
      const { report } = await runSource(
        handle,
        win.lines.map((text, i) => ({ text, lineNumber: i + 1 })),
        detection,
        { customPattern },
        (e) => {
          scanned++;
          if (matchEntry(e, opts.filter, windowCounters)) collected.push(e);
          return true;
        },
      );
      const isLast = bytes === TAIL_WINDOWS[TAIL_WINDOWS.length - 1];
      if (collected.length >= n || win.reachedStart || isLast) {
        summary.sources.push(report);
        summary.entriesScanned = scanned;
        summary.entriesMatched = collected.length;
        summary.excludedNoTimestamp = windowCounters.excludedNoTimestamp;
        return {
          entries: collected.slice(-n),
          summary,
          scannedBytes: win.bytesRead,
          reachedStart: win.reachedStart,
          lineNumbersRelative: !win.reachedStart,
        };
      }
    }
  }

  // Everything else: stream, keep the last n.
  const ring: LogEntry[] = [];
  for (const handle of opened.handles) {
    const detection = await detectHandle(handle, { format, customPattern });
    const { report } = await runSource(handle, handle.lines(), detection, { customPattern }, (e) => {
      summary.entriesScanned++;
      if (!matchEntry(e, opts.filter, counters)) return true;
      summary.entriesMatched++;
      ring.push(e);
      if (ring.length > n) ring.shift();
      return true;
    });
    summary.sources.push(report);
  }
  summary.excludedNoTimestamp = counters.excludedNoTimestamp;
  return { entries: ring, summary, reachedStart: true, lineNumbersRelative: false };
}

/** File size helper for reports. */
export async function fileSize(path: string): Promise<number | undefined> {
  return (await stat(path).catch(() => undefined))?.size;
}
