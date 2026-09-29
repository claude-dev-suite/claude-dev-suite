// SPDX-License-Identifier: MIT
/**
 * Parser registry and format detection.
 *
 * Detection reads only a head sample (see sources/files.ts), first looks for
 * an envelope (docker/CRI/heroku/cloudwatch/otlp), then scores every text
 * parser on the (unwrapped) sample. The result carries a confidence so a
 * caller can tell a sure detection from a guess, and an explicit `format`
 * always wins.
 */

import { BaseParser } from './base.js';
import { SpringBootParser, Log4j2Parser, LogbackParser } from './spring-boot.js';
import { PythonParser } from './python.js';
import { JsonParser, classifyJson } from './json.js';
import { AccessLogParser, WebServerParser, NginxErrorParser, ApacheErrorParser } from './access.js';
import { KubernetesParser } from './kubernetes.js';
import { SyslogCombinedParser } from './syslog.js';
import { LogfmtParser } from './logfmt.js';
import { ZapConsoleParser } from './go.js';
import { DotnetParser } from './dotnet.js';
import { RailsParser } from './rails.js';
import { PlainParser, CustomRegexParser } from './plain.js';
import { createEnvelope, detectEnvelope, type EnvelopeName, type InnerItem } from './envelopes.js';
import type { LogEntry, LogFormat } from '../types.js';
import { isLikelyContinuation, isStackLine } from '../core/exceptions.js';
import { LEADING_TIMESTAMP_RE } from '../core/timestamp.js';

export { BaseParser };
export * from './envelopes.js';

/** Try several parsers in order (a format that exists as JSON and as text). */
class FirstOfParser extends BaseParser {
  readonly multiline: boolean;
  constructor(readonly format: LogFormat, private readonly parsers: BaseParser[]) {
    super();
    this.multiline = parsers.some((p) => p.multiline);
  }
  parseLine(line: string, lineNumber: number): LogEntry | null {
    for (const p of this.parsers) {
      const e = p.parseLine(line, lineNumber);
      if (e) return e;
    }
    return null;
  }
  normalizeContinuation(line: string): string {
    for (const p of this.parsers) {
      const fn = (p as { normalizeContinuation?: (l: string) => string }).normalizeContinuation;
      if (fn) return fn.call(p, line);
    }
    return line;
  }
}

export interface Detection {
  format: LogFormat;
  envelope: EnvelopeName | null;
  /** Fraction of sample record-start lines the chosen parser recognised (0-1). */
  confidence: number;
  detectedBy: 'explicit' | 'auto';
  sampleLines: number;
  candidates: Array<{ format: LogFormat; matched: number }>;
  plainMode?: 'timestamped' | 'line';
  warning?: string;
}

/** Envelope-only formats: the payload inside is auto-detected. */
const ENVELOPE_FORMATS: Partial<Record<LogFormat, EnvelopeName>> = {
  docker: 'docker', cri: 'cri', heroku: 'heroku', cloudwatch: 'cloudwatch',
};

/** Build the parser for a (detected or explicit) format. */
export function createParser(format: LogFormat, opts: { customPattern?: string; plainMode?: 'timestamped' | 'line' } = {}): BaseParser {
  switch (format) {
    case 'spring-boot': return new SpringBootParser();
    case 'log4j': return new Log4j2Parser();
    case 'logback': return new LogbackParser();
    case 'python': return new FirstOfParser('python', [new PythonParser(), new JsonParser('python' as LogFormat)]);
    case 'winston': case 'pino': case 'json': case 'journald': case 'otel': case 'zerolog':
      return new JsonParser(format);
    case 'zap': return new FirstOfParser('zap', [new JsonParser('zap'), new ZapConsoleParser()]);
    case 'logrus': return new FirstOfParser('logrus', [new JsonParser('logrus'), new LogfmtParser('logrus')]);
    case 'serilog': return new FirstOfParser('serilog', [new JsonParser('serilog'), new DotnetParser('serilog')]);
    case 'dotnet': return new FirstOfParser('dotnet', [new JsonParser('dotnet'), new DotnetParser('dotnet')]);
    case 'rails': return new RailsParser();
    case 'logfmt': return new LogfmtParser('logfmt');
    case 'morgan': case 'clf': return new AccessLogParser(format);
    case 'nginx': case 'apache': return new WebServerParser(format);
    case 'kubernetes': return new KubernetesParser();
    case 'syslog': return new SyslogCombinedParser();
    case 'plain': return new PlainParser(opts.plainMode ?? 'line');
    case 'custom':
      if (!opts.customPattern) throw new Error('format "custom" requires customPattern (a regex with named groups)');
      return new CustomRegexParser(opts.customPattern);
    case 'heroku': return new LogfmtParser('heroku');
    default:
      throw new Error(`No parser for format "${format}" (it names an envelope; use auto for its payload)`);
  }
}

/** Text parsers scored during auto-detection, most specific first. */
function textCandidates(): Array<{ format: LogFormat; parser: BaseParser }> {
  return [
    { format: 'spring-boot', parser: new SpringBootParser() },
    { format: 'log4j', parser: new Log4j2Parser() },
    { format: 'logback', parser: new LogbackParser() },
    { format: 'zap', parser: new ZapConsoleParser() },
    { format: 'dotnet', parser: new DotnetParser() },
    { format: 'rails', parser: new RailsParser(true) },
    { format: 'python', parser: new PythonParser() },
    { format: 'clf', parser: new AccessLogParser('clf') },
    { format: 'nginx', parser: new NginxErrorParser() },
    { format: 'apache', parser: new ApacheErrorParser() },
    { format: 'syslog', parser: new SyslogCombinedParser() },
    { format: 'kubernetes', parser: new KubernetesParser() },
    { format: 'logfmt', parser: new LogfmtParser() },
  ];
}

function isJsonObjectLine(l: string): boolean {
  const t = l.trim();
  if (!t.startsWith('{') || !t.endsWith('}')) return false;
  try {
    const v = JSON.parse(t);
    return !!v && typeof v === 'object' && !Array.isArray(v);
  } catch {
    return false;
  }
}

/** Unwrap an envelope over sample lines to get the payload sample. */
function unwrapSample(env: EnvelopeName, sample: string[]): { lines: string[]; entries: number } {
  const e = createEnvelope(env);
  const out: string[] = [];
  let entries = 0;
  const take = (items: InnerItem[] | null) => {
    for (const it of items ?? []) {
      if (it.kind === 'line') out.push(it.line.text);
      else entries++;
    }
  };
  sample.forEach((l, i) => take(e.push(l, i + 1)));
  take(e.flush());
  return { lines: out, entries };
}

/** Choose a format for payload lines (no envelope). */
function detectPayload(sample: string[]): Omit<Detection, 'envelope' | 'detectedBy'> {
  const lines = sample.filter((l) => l.trim() !== '');
  let starts = lines.filter((l) => !isLikelyContinuation(l));
  if (starts.length === 0) starts = lines.filter((l) => !isStackLine(l) && !/^\s/.test(l));
  const n = starts.length;
  if (n === 0) {
    return { format: 'plain', confidence: 0, sampleLines: 0, candidates: [], plainMode: 'line', warning: 'Source is empty' };
  }

  // JSON family: classify the dialect by majority vote.
  const jsonLines = starts.filter(isJsonObjectLine);
  if (jsonLines.length >= n * 0.5) {
    const votes = new Map<LogFormat, number>();
    for (const l of jsonLines) {
      const f = classifyJson(JSON.parse(l.trim()));
      votes.set(f, (votes.get(f) ?? 0) + 1);
    }
    const [format] = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      format,
      confidence: jsonLines.length / n,
      sampleLines: n,
      candidates: [...votes.entries()].map(([f, c]) => ({ format: f, matched: c })),
    };
  }

  const scored = textCandidates().map(({ format, parser }) => ({
    format,
    matched: starts.reduce((acc, l, i) => acc + (parser.parseLine(l, i + 1) ? 1 : 0), 0),
  }));
  let best = scored[0];
  for (const s of scored) if (s.matched > best.matched) best = s;
  const candidates = scored.filter((s) => s.matched > 0).sort((a, b) => b.matched - a.matched);

  if (best.matched / n < 0.3) {
    const tsLines = starts.filter((l) => LEADING_TIMESTAMP_RE.test(l)).length;
    const plainMode = tsLines >= n * 0.5 ? 'timestamped' : 'line';
    return {
      format: 'plain', confidence: best.matched / n, sampleLines: n, candidates, plainMode,
      warning: best.matched > 0
        ? `No parser matched most lines (best: ${best.format} ${best.matched}/${n}); using plain ${plainMode} mode`
        : `Unrecognised format; using plain ${plainMode} mode`,
    };
  }

  // The access family shares one grammar; label it by what else is present.
  let format = best.format;
  if (format === 'clf' || format === 'nginx' || format === 'apache') {
    const nginxErr = new NginxErrorParser();
    const apacheErr = new ApacheErrorParser();
    const access = new AccessLogParser('clf');
    const parsed = starts.map((l, i) => access.parseLine(l, i)).filter((e): e is LogEntry => !!e);
    if (starts.some((l) => nginxErr.parseLine(l, 0))) format = 'nginx';
    else if (starts.some((l) => apacheErr.parseLine(l, 0))) format = 'apache';
    else if (parsed.some((e) => e.metadata?.requestTime !== undefined)) format = 'nginx';
    else if (parsed.some((e) => e.metadata?.userAgent !== undefined)) format = 'apache';
    else format = 'clf';
    const matched = starts.filter((l, i) => new WebServerParser(format).parseLine(l, i)).length;
    return { format, confidence: matched / n, sampleLines: n, candidates };
  }
  return { format, confidence: best.matched / n, sampleLines: n, candidates };
}

/**
 * Detect envelope + payload format from head sample lines.
 * `forcedEnvelope` comes from live sources (we know what `docker logs --timestamps` prints).
 */
export function detectFormat(
  sample: string[],
  opts: { format?: LogFormat; customPattern?: string; forcedEnvelope?: EnvelopeName } = {},
): Detection {
  const requested = opts.format ?? 'auto';
  let envelope: EnvelopeName | null = opts.forcedEnvelope ?? ENVELOPE_FORMATS[requested] ?? null;
  if (!envelope && (requested === 'auto' || requested === 'kubernetes' || requested === 'otel')) {
    envelope = detectEnvelope(sample);
  }

  let payload = sample;
  let otlpOnly = false;
  if (envelope) {
    const u = unwrapSample(envelope, sample);
    payload = u.lines;
    otlpOnly = u.lines.length === 0 && u.entries > 0;
  }

  const explicit = requested !== 'auto' && !ENVELOPE_FORMATS[requested] && !(requested === 'kubernetes' && envelope)
    && !(requested === 'otel' && envelope === 'otlp');
  if (otlpOnly) {
    return { format: 'otel', envelope, confidence: 1, detectedBy: explicit ? 'explicit' : 'auto', sampleLines: sample.length, candidates: [] };
  }

  if (explicit) {
    const starts = payload.filter((l) => l.trim() && !isLikelyContinuation(l));
    let plainMode: 'timestamped' | 'line' | undefined;
    if (requested === 'plain') {
      plainMode = starts.filter((l) => LEADING_TIMESTAMP_RE.test(l)).length >= starts.length * 0.5 && starts.length > 0 ? 'timestamped' : 'line';
    }
    const parser = createParser(requested, { customPattern: opts.customPattern, plainMode });
    const matched = starts.filter((l, i) => parser.parseLine(l, i + 1)).length;
    return {
      format: requested,
      envelope,
      confidence: starts.length ? matched / starts.length : 0,
      detectedBy: 'explicit',
      sampleLines: starts.length,
      candidates: [{ format: requested, matched }],
      plainMode,
      warning: starts.length > 0 && matched === 0
        ? `format "${requested}" matched none of the ${starts.length} sampled lines — check the format or use auto`
        : undefined,
    };
  }

  const d = detectPayload(payload);
  return { ...d, envelope, detectedBy: 'auto' };
}
