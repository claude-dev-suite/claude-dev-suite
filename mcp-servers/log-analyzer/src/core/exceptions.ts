// SPDX-License-Identifier: MIT
/**
 * Exception extraction from the lines of one (multiline) log record.
 *
 * Supported shapes:
 *  - Java:   `java.lang.X: msg` + `\tat ...` frames, `Caused by:` chains,
 *            `Suppressed:`, `... N more`, `Exception in thread "main" ...`
 *  - .NET:   `System.X: msg ---> System.Y: inner` + `   at ... in f.cs:line N`,
 *            `--- End of inner exception stack trace ---`, `Unhandled exception.`
 *  - Node:   `TypeError: msg` + `    at fn (file:1:2)`, `[cause]: Error: ...`
 *  - Python: `Traceback (most recent call last):` blocks, chained with
 *            "During handling of the above exception…" / "The above exception
 *            was the direct cause…"
 *  - Go:     `panic: msg` / `fatal error: msg` + `goroutine N [running]:` +
 *            function/`\t/path/file.go:NN +0x..` pairs; zap-style stacktraces
 *  - Ruby:   `Message (NoMethodError):` (Rails) or `file.rb:1:in 'm': msg (Type)`
 *            + `from file.rb:..` / `app/x.rb:12:in ...` frames
 */

import type { ExceptionInfo } from '../types.js';

const MAX_FRAMES = 200;

// ---------- shared line classifiers ----------

const JAVA_FRAME = /^\s*at\s+\S/;
const OMITTED = /^\s*\.\.\.\s*(\d+)\s+(?:more|common frames omitted)/;
const CAUSE_PREFIX = /^\s*(?:Caused by|\[cause\]):\s*(.*)$/;
const SUPPRESSED_PREFIX = /^\s*Suppressed:\s*(.*)$/;
const DOTNET_INNER = /^\s*--->\s*(.*)$/;
const DOTNET_END_INNER = /^\s*---\s*End of inner exception stack trace\s*---/;
const DOTNET_END_PREV = /^\s*---\s*End of stack trace from previous location/;

const PY_TRACEBACK = /^\s*Traceback \(most recent call last\):\s*$/;
const PY_FRAME = /^\s*File "([^"]+)", line (\d+)(?:, in (.+))?$/;
const PY_CHAIN_CONTEXT = /^\s*During handling of the above exception, another exception occurred:/;
const PY_CHAIN_CAUSE = /^\s*The above exception was the direct cause of the following exception:/;

const GO_PANIC = /^(panic|fatal error): (.*)$/;
const GO_GOROUTINE = /^goroutine \d+ \[[^\]]*\]:?\s*$/;
const GO_FILE_LINE = /^\s+(\S+\.go:\d+)(?:\s+\+0x[0-9a-f]+)?\s*$/;
// Go frame function lines: pkg.Func(args), pkg.(*T).M(args), created by pkg.F in goroutine N, or zap's bare pkg.Func
const GO_FUNC = /^(?:[\w./\-]+?(?:\.\(\*?[\w\[\], ]+\))?(?:\.[\w\-\[\]]+)*\(.*\)|created by [\w./\-()*\[\]]+(?: in goroutine \d+)?|[\w./\-]+\.[\w\-]+(?:\.func\d+(?:\.\d+)*)*)\s*$/;

const RUBY_FRAME = /^\s*(?:from\s+)?\S+\.rb:\d+:in\s/;
const RUBY_RAILS_HEADER = /^\s*([A-Z]\w*(?:::[A-Z]\w*)*)\s+\((.*)\):?\s*$/;
const RUBY_FULL_HEADER = /^\s*(\S+\.rb:\d+:in\s.+?):\s(.*)\s\(([A-Z]\w*(?:::[A-Z]\w*)*)\)\s*$/;

/**
 * Exception header: a (possibly qualified) type name ending in a conventional
 * suffix, or a dotted qualified name, optionally followed by ": message".
 */
const HEADER =
  /^\s*(?:Exception in thread "[^"]*"\s+|Unhandled exception\.\s+|Uncaught\s+)?([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$`]*)*(?:\s*\[[\w-]+\])?)(?::\s?(.*))?$/;
const TYPE_SUFFIX = /(?:Exception|Error|Throwable|Fault|Failure|Panic|Interrupt|Exit|Warning)(?:`\d+)?$/;

interface Header { type: string; message: string }

/** Parse a header line into type/message when it plausibly is one. */
export function parseHeader(line: string, requireSuffix: boolean): Header | null {
  const m = line.match(HEADER);
  if (!m) return null;
  const type = m[1].trim();
  const bareType = type.replace(/\s*\[[\w-]+\]$/, '');
  const hasSuffix = TYPE_SUFFIX.test(bareType);
  const dotted = bareType.includes('.');
  if (!hasSuffix && (requireSuffix || !dotted)) return null;
  // The last segment must look like a type name ("Error", "IOException").
  if (!/^[A-Z]/.test(bareType.split('.').pop() ?? '')) return null;
  return { type, message: (m[2] ?? '').trim() };
}

// ---------- Java / .NET / Node ----------

function indentOf(line: string): number {
  const m = line.match(/^[ \t]*/);
  return m ? m[0].replace(/\t/g, '    ').length : 0;
}

function parseJvmLike(lines: string[], start: number): { info: ExceptionInfo; end: number } | null {
  const first = lines[start].replace(CAUSE_PREFIX, '$1').replace(SUPPRESSED_PREFIX, '$1');
  // .NET puts inner exceptions on the header line: "A: m1 ---> B: m2"
  const segments = first.split(/\s+--->\s+/);
  const headers = segments.map((s) => parseHeader(s, false));
  if (!headers[0]) return null;

  const chain: ExceptionInfo[] = headers.map((h, i) => ({
    type: h?.type ?? 'Unknown',
    message: h?.message ?? segments[i],
    stackTrace: [],
    language: 'unknown' as const,
  }));
  // Frames go to the innermost exception until "End of inner exception stack trace".
  let target = chain.length - 1;
  let i = start + 1;
  let sawFrame = false;
  // A nested block (Suppressed:, [cause]:) ends where indentation drops back.
  const baseIndent = indentOf(lines[start]);

  for (; i < lines.length; i++) {
    const line = lines[i];
    if (baseIndent > 0 && line.trim() !== '' && indentOf(line) < baseIndent) break;
    if (baseIndent > 0 && JAVA_FRAME.test(line) && indentOf(line) <= baseIndent && SUPPRESSED_PREFIX.test(lines[start])) break;
    if (JAVA_FRAME.test(line)) {
      sawFrame = true;
      if (chain[target].stackTrace.length < MAX_FRAMES) chain[target].stackTrace.push(line.trim());
      continue;
    }
    const om = line.match(OMITTED);
    if (om) {
      chain[target].omittedFrames = (chain[target].omittedFrames ?? 0) + parseInt(om[1], 10);
      continue;
    }
    if (DOTNET_END_INNER.test(line)) {
      if (target > 0) target--;
      continue;
    }
    if (DOTNET_END_PREV.test(line)) continue;
    const inner = line.match(DOTNET_INNER);
    if (inner) {
      const h = parseHeader(inner[1], false);
      if (h) {
        chain.push({ type: h.type, message: h.message, stackTrace: [], language: 'dotnet' });
        target = chain.length - 1;
        continue;
      }
    }
    if (CAUSE_PREFIX.test(line)) {
      const nested = parseJvmLike(lines, i);
      if (nested) {
        chain[chain.length - 1].causedBy = nested.info;
        chain[chain.length - 1].causeRelation = 'cause';
        i = nested.end;
      }
      break;
    }
    if (SUPPRESSED_PREFIX.test(line)) {
      // Skip the suppressed block (its frames are indented one level deeper).
      const nested = parseJvmLike(lines, i);
      if (nested) { i = nested.end - 1; continue; }
    }
    if (!sawFrame && line.trim() !== '' && !parseHeader(line, true)) {
      // Multi-line exception message before the first frame.
      if (chain[0].message.length < 2000) chain[0].message += '\n' + line.trim();
      continue;
    }
    if (line.trim() === '') continue;
    break;
  }

  // Link the chain: outer ---> inner is an "inner" relation.
  for (let k = chain.length - 2; k >= 0; k--) {
    if (!chain[k].causedBy) {
      chain[k].causedBy = chain[k + 1];
      chain[k].causeRelation = 'inner';
    }
  }
  const root = chain[0];
  if (!sawFrame && chain.length === 1 && !root.causedBy) {
    // A header with no frames is only an exception if the type is conventional.
    if (!TYPE_SUFFIX.test(root.type)) return null;
  }
  root.language = guessJvmLanguage(root, lines);
  let c = root.causedBy;
  while (c) { if (c.language === 'unknown') c.language = root.language; c = c.causedBy; }
  return { info: root, end: i };
}

function guessJvmLanguage(info: ExceptionInfo, lines: string[]): ExceptionInfo['language'] {
  const f = info.stackTrace[0] ?? '';
  if (/\bin\s.+:line \d+/.test(f) || /^System\./.test(info.type) || lines.some((l) => DOTNET_END_INNER.test(l))) return 'dotnet';
  if (/\(.*\.(?:js|mjs|cjs|ts):\d+:\d+\)|at .*\.(?:js|mjs|cjs|ts):\d+:\d+|node:internal/.test(f)) return 'node';
  if (/\(.*\.(?:java|kt|scala|groovy):\d+\)|\(Native Method\)|\(Unknown Source\)/.test(f) || info.type.includes('.')) return 'java';
  if (info.stackTrace.length > 0 && !info.type.includes('.')) return 'node';
  return 'unknown';
}

// ---------- Python ----------

function parsePython(lines: string[]): ExceptionInfo | null {
  const blocks: Array<{ info: ExceptionInfo; relation?: 'cause' | 'context' }> = [];
  let pendingRelation: 'cause' | 'context' | undefined;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (PY_CHAIN_CONTEXT.test(line)) { pendingRelation = 'context'; i++; continue; }
    if (PY_CHAIN_CAUSE.test(line)) { pendingRelation = 'cause'; i++; continue; }
    if (!PY_TRACEBACK.test(line)) { i++; continue; }

    const frames: string[] = [];
    i++;
    for (; i < lines.length; i++) {
      const l = lines[i];
      const fm = l.match(PY_FRAME);
      if (fm) {
        if (frames.length < MAX_FRAMES) frames.push(`${fm[1]}:${fm[2]}${fm[3] ? ` in ${fm[3]}` : ''}`);
        continue;
      }
      if (/^\s/.test(l) || l.trim() === '') continue; // source line / carets / blank
      break;
    }
    // The exception line: "module.Type: message" or bare "Type"
    let type = 'Unknown';
    let message = '';
    if (i < lines.length) {
      const hl = lines[i];
      const hm = hl.match(/^([A-Za-z_][\w.]*)(?::\s?(.*))?$/);
      if (hm) {
        type = hm[1];
        message = hm[2] ?? '';
        i++;
        // Multi-line message continues until a blank line or a chain marker
        while (i < lines.length && lines[i].trim() !== '' && !PY_TRACEBACK.test(lines[i])
          && !PY_CHAIN_CAUSE.test(lines[i]) && !PY_CHAIN_CONTEXT.test(lines[i]) && message.length < 2000) {
          message += '\n' + lines[i];
          i++;
        }
      } else {
        message = hl.trim();
        i++;
      }
    }
    blocks.push({ info: { type, message, stackTrace: frames, language: 'python' }, relation: pendingRelation });
    pendingRelation = undefined;
  }
  if (blocks.length === 0) return null;
  // Python prints the root cause first; the last block is what was raised.
  for (let k = blocks.length - 1; k > 0; k--) {
    blocks[k].info.causedBy = blocks[k - 1].info;
    blocks[k].info.causeRelation = blocks[k].relation ?? 'context';
  }
  return blocks[blocks.length - 1].info;
}

// ---------- Go ----------

function parseGo(lines: string[]): ExceptionInfo | null {
  let type = '';
  let message = '';
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(GO_PANIC);
    if (m) {
      type = m[1] === 'panic' ? 'panic' : 'fatal error';
      message = m[2].replace(/\s*\[recovered\]\s*$/, '');
      if (/^runtime error: /.test(message)) {
        type = 'runtime error';
        message = message.slice('runtime error: '.length);
      }
      start = i;
      break;
    }
  }
  const hasGoroutine = lines.some((l) => GO_GOROUTINE.test(l));
  const frames = goFrames(lines, Math.max(start, 0));
  if (start < 0 && !hasGoroutine && frames.length === 0) return null;
  if (start < 0) {
    if (frames.length === 0) return null;
    type = 'goroutine stack';
    message = '';
  }
  return { type, message, stackTrace: frames, language: 'go' };
}

/** Pair Go "function(args)" lines with the "\tfile.go:NN +0x.." line after them. */
export function goFrames(lines: string[], from = 0): string[] {
  const frames: string[] = [];
  for (let i = from; i < lines.length && frames.length < MAX_FRAMES; i++) {
    const fl = lines[i + 1]?.match(GO_FILE_LINE);
    if (fl && GO_FUNC.test(lines[i].trim())) {
      frames.push(`${lines[i].trim()} (${fl[1]})`);
      i++;
    }
  }
  return frames;
}

// ---------- Ruby ----------

function parseRuby(lines: string[]): ExceptionInfo | null {
  for (let i = 0; i < lines.length; i++) {
    const full = lines[i].match(RUBY_FULL_HEADER);
    const rails = full ? null : lines[i].match(RUBY_RAILS_HEADER);
    if (!full && !rails) continue;
    const frames: string[] = [];
    if (full) frames.push(full[1]);
    for (let j = i + 1; j < lines.length && frames.length < MAX_FRAMES; j++) {
      if (RUBY_FRAME.test(lines[j])) frames.push(lines[j].trim().replace(/^from\s+/, ''));
      else if (lines[j].trim() === '') continue;
      else if (frames.length > 0) break;
    }
    if (frames.length === 0 && rails && !TYPE_SUFFIX.test(rails[1])) continue;
    return full
      ? { type: full[3], message: full[2], stackTrace: frames, language: 'ruby' }
      : { type: rails![1], message: rails![2], stackTrace: frames, language: 'ruby' };
  }
  return null;
}

// ---------- entry point ----------

/**
 * Extract a structured exception from the lines of one record.
 * `lines[0]` is normally the entry message; the rest are continuation lines.
 */
export function extractException(lines: string[]): ExceptionInfo | undefined {
  if (lines.length === 0) return undefined;

  if (lines.some((l) => PY_TRACEBACK.test(l))) {
    const py = parsePython(lines);
    if (py) return py;
  }
  if (lines.some((l) => GO_PANIC.test(l) || GO_GOROUTINE.test(l) || GO_FILE_LINE.test(l))) {
    const go = parseGo(lines);
    if (go && (go.stackTrace.length > 0 || go.type !== 'goroutine stack')) return go;
  }
  if (lines.some((l) => RUBY_FRAME.test(l))) {
    const rb = parseRuby(lines);
    if (rb) return rb;
  }

  // JVM-like: find the first header followed by frames, or a conventional
  // exception type on a continuation line (Spring prints the header alone).
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (JAVA_FRAME.test(line)) continue;
    const candidate = line.replace(/^\s*(?:Caused by|\[cause\]):\s*/, '').split(/\s+--->\s+/)[0];
    const header = parseHeader(candidate, false);
    if (!header) continue;
    const followedByFrames = lines.slice(i + 1, i + 30).some((l) => JAVA_FRAME.test(l) || DOTNET_INNER.test(l));
    // Line 0 is the log message itself: "Error: timeout" there is prose unless frames follow.
    if (!followedByFrames && (i === 0 || !TYPE_SUFFIX.test(header.type))) continue;
    const parsed = parseJvmLike(lines, i);
    if (parsed) return parsed.info;
  }
  return undefined;
}

/**
 * Exception type mentioned inline in a single-line message, e.g.
 * "Request failed: java.io.IOException: Broken pipe". Used for grouping when
 * there is no stack to parse.
 */
export function inlineExceptionType(message: string): { type: string; message: string } | null {
  const m = message.match(/(?:^|[\s:(\[])((?:[a-z_$][\w$]*\.)+[A-Z][\w$]*(?:Exception|Error|Throwable)|[A-Z][A-Za-z]*(?:Exception|Error))(?::\s*([^\]\n]*))?/);
  if (!m) return null;
  return { type: m[1], message: (m[2] ?? '').trim() };
}

/** Flatten a cause chain into "Type: message" strings. */
export function causeChain(info: ExceptionInfo | undefined): string[] {
  const out: string[] = [];
  let c = info?.causedBy;
  while (c && out.length < 20) {
    out.push(`${c.type}${c.message ? ': ' + c.message.split('\n')[0] : ''}`);
    c = c.causedBy;
  }
  return out;
}

/** The deepest cause — usually the most useful thing to group on. */
export function rootCause(info: ExceptionInfo): ExceptionInfo {
  let c = info;
  let guard = 0;
  while (c.causedBy && guard++ < 50) c = c.causedBy;
  return c;
}

/**
 * Lines that are unmistakably part of a stack trace. The multiline assembler
 * never lets these start a new entry, whatever a loose parser thinks.
 */
export function isStackLine(line: string): boolean {
  return (
    JAVA_FRAME.test(line) ||
    OMITTED.test(line) ||
    /^\s*(?:Caused by|Suppressed|\[cause\]):\s/.test(line) ||
    DOTNET_INNER.test(line) ||
    DOTNET_END_INNER.test(line) ||
    DOTNET_END_PREV.test(line) ||
    PY_TRACEBACK.test(line) ||
    /^\s+File "[^"]+", line \d+/.test(line) ||
    PY_CHAIN_CONTEXT.test(line) ||
    PY_CHAIN_CAUSE.test(line) ||
    GO_GOROUTINE.test(line) ||
    GO_FILE_LINE.test(line) ||
    /^\s*from\s+\S+\.rb:\d+:in\s/.test(line)
  );
}

/**
 * Lines that, in a sample, are more likely part of a multi-line record than
 * the start of one: stack lines, exception headers, crash output, Go frames.
 * Format detection leaves them out of its denominator.
 */
export function isLikelyContinuation(line: string): boolean {
  return (
    /^\s/.test(line) ||
    isStackLine(line) ||
    isCrashStart(line) ||
    parseHeader(line.split(/\s+--->\s+/)[0], true) !== null ||
    /^[\w.]+(?:Error|Exception)(?::|$)/.test(line) ||
    GO_FUNC.test(line.trim()) ||
    /^exit status \d+$/.test(line)
  );
}

/** Lines that begin an uncaught crash — become their own entry when unparseable. */
export function isCrashStart(line: string): boolean {
  return GO_PANIC.test(line) || /^Exception in thread "[^"]*"\s/.test(line) || /^Unhandled exception\.\s/.test(line);
}

export { GO_FUNC, PY_TRACEBACK };
