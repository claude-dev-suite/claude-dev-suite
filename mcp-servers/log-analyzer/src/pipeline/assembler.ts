// SPDX-License-Identifier: MIT
/**
 * Multiline assembler: turns a stream of payload lines into complete entries.
 *
 * Rules (the same for every format):
 *  - A line the parser recognises starts a new entry — unless it is
 *    unmistakably a stack line (`\tat …`, `Caused by:`, `File "…", line N`,
 *    `goroutine 1 [running]:`, …), which always continues the current one.
 *  - Inside a Python traceback, the non-indented exception line that closes it
 *    ("ValueError: bad") is continuation; inside a Go goroutine dump, the
 *    non-indented function lines ("main.main()") are continuation.
 *  - An unrecognised line is continuation for multi-line formats; for
 *    one-record-per-line formats (access logs, JSON) only indented/stack lines
 *    are, anything else is counted as unparsed.
 *  - `panic:` / `Exception in thread "main"` start a synthetic FATAL entry
 *    when the parser does not recognise them (an uncaught crash printed raw).
 * On completion, the entry's lines go through the exception extractor and
 * correlation-id enrichment.
 */

import type { BaseParser } from '../parsers/base.js';
import type { InnerLine } from '../parsers/envelopes.js';
import type { LogEntry, LogFormat } from '../types.js';
import { extractException, isCrashStart, isStackLine, GO_FUNC, PY_TRACEBACK } from '../core/exceptions.js';
import { enrichCorrelation } from '../core/correlation.js';
import { looksLikeLogfmt, parseLogfmt } from '../core/logfmt.js';
import { levelNearStart } from '../parsers/plain.js';

export const MAX_CONTINUATION_LINES = 2000;
const MAX_MESSAGE_CHARS = 16000;

export interface AssemblerStats {
  lines: number;
  entries: number;
  continuationLines: number;
  unparsedLines: number;
  droppedContinuationLines: number;
  entriesWithoutTimestamp: number;
  sampleUnparsed: string[];
}

export function emptyAssemblerStats(): AssemblerStats {
  return { lines: 0, entries: 0, continuationLines: 0, unparsedLines: 0, droppedContinuationLines: 0, entriesWithoutTimestamp: 0, sampleUnparsed: [] };
}

interface Pending {
  entry: LogEntry;
  cont: string[];
  envelopeTime?: Date | null;
  stream?: string;
  labels?: Record<string, string>;
}

const GENERIC_EXC_TYPES = new Set(['Unknown', 'goroutine stack']);
/** Formats whose free-text message may carry key=value fields worth extracting. */
const KV_FORMATS = new Set<LogFormat>(['syslog', 'plain', 'heroku', 'logback', 'log4j', 'spring-boot', 'python', 'dotnet', 'custom']);

/** Assembles entries for one stream (one file, or one container/stream key). */
export class Assembler {
  private pending: Pending | null = null;
  private inPyTraceback = false;
  private inGoTrace = false;

  constructor(
    private readonly parser: BaseParser,
    private readonly stats: AssemblerStats,
    private readonly source?: string,
  ) {}

  push(line: InnerLine): LogEntry[] {
    this.stats.lines++;
    const text = line.text;
    const out: LogEntry[] = [];

    if (text.trim() === '') {
      if (this.pending && this.parser.multiline) this.appendCont('');
      if (this.inGoTrace) { /* blank lines separate goroutines; keep state */ }
      return out;
    }

    const normalized = this.normalize(text);
    let stackish = isStackLine(normalized);
    if (this.inPyTraceback && !stackish) {
      if (/^\s/.test(normalized)) stackish = true;
      else { stackish = true; this.inPyTraceback = false; } // the "Type: message" closing line
    }
    if (PY_TRACEBACK.test(normalized)) this.inPyTraceback = true;
    if (this.inGoTrace && !stackish) {
      if (GO_FUNC.test(normalized.trim()) || /^created by /.test(normalized)) stackish = true;
      else this.inGoTrace = false;
    }
    if (/^goroutine \d+ \[/.test(normalized)) this.inGoTrace = true;

    const crash = isCrashStart(text);
    let entry: LogEntry | null = null;
    if (!stackish || crash) entry = this.parser.parseLine(text, line.lineNumber);

    if (!entry && !this.pending && PY_TRACEBACK.test(normalized)) {
      // An uncaught Python traceback with nothing before it: its own entry.
      entry = { timestamp: null, level: 'ERROR', message: text.trim(), raw: text, lineNumber: line.lineNumber };
    } else if (crash && !entry) {
      entry = { timestamp: null, level: 'FATAL', message: text.trim(), raw: text, lineNumber: line.lineNumber };
    } else if (crash && entry) {
      entry.level = 'FATAL';
    }

    if (entry) {
      const done = this.complete();
      if (done) out.push(done);
      this.pending = { entry, cont: [], envelopeTime: line.timestamp, stream: line.stream, labels: line.labels };
      if (crash) this.inGoTrace = false;
      return out;
    }

    // A line from another stream (stderr vs stdout of one container) cannot
    // continue the open entry. If the payload parser does not recognise it, it
    // is still its own record: a container's stderr is rarely in the format its
    // stdout was detected as, and dropping it as "unparsed" loses exactly the
    // error output someone reads container logs for.
    if (line.stream && (!this.pending || this.pending.stream !== line.stream)) {
      const done = this.complete();
      if (done) out.push(done);
      const lv = levelNearStart(text);
      const level = lv ? lv.level : line.stream === 'stderr' ? 'ERROR' : 'INFO';
      const own: LogEntry = { timestamp: null, level, message: text.trim(), raw: text, lineNumber: line.lineNumber };
      this.pending = { entry: own, cont: [], envelopeTime: line.timestamp, stream: line.stream, labels: line.labels };
      return out;
    }

    if (this.pending && (stackish || this.parser.multiline || /^\s/.test(text))) {
      this.appendCont(normalized);
      return out;
    }

    this.stats.unparsedLines++;
    if (this.stats.sampleUnparsed.length < 5) this.stats.sampleUnparsed.push(text.slice(0, 300));
    return out;
  }

  /** A complete entry parsed upstream (OTLP records) — flush and pass through. */
  passthrough(entry: LogEntry): LogEntry[] {
    this.stats.lines++;
    const out: LogEntry[] = [];
    const done = this.complete();
    if (done) out.push(done);
    this.pending = { entry, cont: [] };
    const self = this.complete();
    if (self) out.push(self);
    return out;
  }

  flush(): LogEntry[] {
    const done = this.complete();
    return done ? [done] : [];
  }

  private normalize(text: string): string {
    const fn = (this.parser as { normalizeContinuation?: (l: string) => string }).normalizeContinuation;
    return fn ? fn.call(this.parser, text) : text;
  }

  private appendCont(line: string): void {
    const p = this.pending!;
    if (p.cont.length >= MAX_CONTINUATION_LINES) {
      this.stats.droppedContinuationLines++;
      return;
    }
    p.cont.push(line.replace(/\s+$/, ''));
    this.stats.continuationLines++;
  }

  private complete(): LogEntry | null {
    const p = this.pending;
    if (!p) return null;
    this.pending = null;
    this.inPyTraceback = false;
    const e = finalizeEntry(p, this.parser.format);
    if (this.source) e.source = this.source;
    this.stats.entries++;
    if (!e.timestamp) this.stats.entriesWithoutTimestamp++;
    return e;
  }
}

function finalizeEntry(p: Pending, format: LogFormat): LogEntry {
  const e = p.entry;
  // Trailing blank lines carry nothing.
  while (p.cont.length && p.cont[p.cont.length - 1] === '') p.cont.pop();

  // MEL console & friends put the message on the next line.
  if (!e.message && p.cont.length) {
    const idx = p.cont.findIndex((l) => l.trim() !== '');
    if (idx >= 0) {
      e.message = p.cont[idx].trim();
      p.cont.splice(0, idx + 1);
    }
  }
  if (e.raw && p.cont.length) {
    e.raw = [e.raw, ...p.cont].join('\n').slice(0, MAX_MESSAGE_CHARS);
  }

  const stackLines = [...p.cont, ...(e.stackTrace ?? [])];
  const hint = e.exception;
  const extracted = extractException([e.message, ...stackLines]);
  if (extracted && (!hint || !GENERIC_EXC_TYPES.has(extracted.type))) {
    if (hint && !extracted.message && hint.message) extracted.message = hint.message;
    e.exception = extracted;
  } else if (hint) {
    e.exception = { ...hint, stackTrace: extracted?.stackTrace ?? hint.stackTrace, language: extracted?.language ?? hint.language };
  }

  if (e.exception) {
    e.stackTrace = stackLines.filter((l) => l.trim() !== '');
    if (PY_TRACEBACK.test(e.message)) {
      e.message = `${e.exception.type}${e.exception.message ? ': ' + e.exception.message.split('\n')[0] : ''}`;
    }
  } else if (p.cont.length) {
    // A wrapped message rather than a stack trace.
    e.message = [e.message, ...p.cont.map((l) => l.trim())].join('\n').slice(0, MAX_MESSAGE_CHARS);
    delete e.stackTrace;
  } else if (e.stackTrace && e.stackTrace.length === 0) {
    delete e.stackTrace;
  }
  if (e.message.length > MAX_MESSAGE_CHARS) e.message = e.message.slice(0, MAX_MESSAGE_CHARS) + ' …[truncated]';

  // Envelope metadata: time fallback, stream, labels (container, pod, dyno…)
  if (!e.timestamp && p.envelopeTime) {
    e.timestamp = p.envelopeTime;
    e.metadata = { ...e.metadata, timestampSource: 'envelope' };
  }
  if (p.stream) e.stream = p.stream;
  if (p.labels && Object.keys(p.labels).length) e.metadata = { ...p.labels, ...e.metadata };
  // stderr lines without a level of their own are usually errors in plain output
  if (p.stream === 'stderr' && format === 'plain' && !levelNearStart(e.message)) e.level = 'ERROR';

  // key=value fields inside free-text messages become queryable fields.
  if (KV_FORMATS.has(format) && looksLikeLogfmt(e.message.split('\n')[0])) {
    const { pairs } = parseLogfmt(e.message.split('\n')[0]);
    const meta: Record<string, unknown> = { ...(e.metadata ?? {}) };
    for (const [k, v] of Object.entries(pairs)) {
      if (!(k in meta)) meta[k] = /^-?\d+(?:\.\d+)?$/.test(v) && v.length < 16 ? Number(v) : v;
    }
    e.metadata = meta;
  }

  enrichCorrelation(e);
  return e;
}
