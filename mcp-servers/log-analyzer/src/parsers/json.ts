// SPDX-License-Identifier: MIT
/**
 * Structured JSON log parser.
 *
 * One mapping handles the JSON dialects in common use, because they differ
 * only in key names:
 *   winston / pino / bunyan (Node), zap / zerolog / logrus (Go),
 *   Serilog compact (CLEF: @t @m @mt @l @x @tr @sp) and Serilog JsonFormatter,
 *   Microsoft.Extensions.Logging JSON console, ECS (@timestamp, log.level,
 *   error.stack_trace), GCP structured logging, python-json-logger,
 *   OpenTelemetry flat log records (Timestamp/SeverityText/Body/TraceId/…),
 *   journald `-o json`, Kubernetes component logs (ts/msg/v).
 * The `format` label only records which dialect was selected.
 */

import { BaseParser } from './base.js';
import type { LogEntry, LogFormat, LogLevel } from '../types.js';
import { otelSeverity, SYSLOG_SEVERITY, statusToLevel, toLevel } from '../core/levels.js';
import { parseTimestamp } from '../core/timestamp.js';

type Json = Record<string, unknown>;

const TIME_KEYS = [
  '@t', '@timestamp', 'timestamp', 'Timestamp', 'time', 'ts', 'TimeStamp', 'datetime', 'date', 'asctime',
  'timeUnixNano', 'observedTimeUnixNano', 'ObservedTimestamp', '__REALTIME_TIMESTAMP',
  '_SOURCE_REALTIME_TIMESTAMP', 'eventTime', 'receiveTimestamp', 't',
];
const LEVEL_KEYS = [
  '@l', 'level', 'lvl', 'severity', 'Level', 'LogLevel', 'loglevel', 'log_level', 'levelname', 'levelName',
  'log.level', 'SeverityText', 'severityText', 'severity_text',
];
const MESSAGE_KEYS = [
  '@m', 'msg', 'message', 'Message', 'MESSAGE', 'RenderedMessage', 'body', 'Body', 'log', 'text',
  'event', 'short_message', 'textPayload', 'jsonPayload.message',
];
const LOGGER_KEYS = [
  'logger', 'logger_name', 'loggerName', 'SourceContext', 'Category', 'name', 'SYSLOG_IDENTIFIER',
  'label', 'component', 'module', 'service', 'service.name', '_COMM',
];
const THREAD_KEYS = ['thread', 'thread_name', 'threadName', 'ThreadId', 'thread.name'];
const STACK_KEYS = [
  '@x', 'stack', 'stacktrace', 'stack_trace', 'StackTrace', 'exception', 'Exception', 'exc_info', 'exc_text',
  'error.stack_trace', 'error.stack', 'err.stack', 'errorVerbose', 'exception.stacktrace',
  'Attributes.exception.stacktrace', 'attributes.exception.stacktrace',
];

/** Keys whose values are represented elsewhere on the entry. */
const CONSUMED = new Set([...TIME_KEYS, ...LEVEL_KEYS, ...MESSAGE_KEYS, '@mt', 'MessageTemplate', 'SeverityNumber', 'severityNumber', 'PRIORITY']);

/** Get a key, supporting dotted paths into nested objects. */
function pick(obj: Json, key: string): unknown {
  if (key in obj) return obj[key];
  if (!key.includes('.')) return undefined;
  let cur: unknown = obj;
  for (const part of key.split('.')) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Json)[part];
  }
  return cur;
}

function first(obj: Json, keys: string[]): { key: string; value: unknown } | undefined {
  for (const k of keys) {
    const v = pick(obj, k);
    if (v !== undefined && v !== null && v !== '') return { key: k, value: v };
  }
  return undefined;
}

/** OTel AnyValue ({stringValue: "x"}) or journald byte arrays → string. */
function asText(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v) && v.every((b) => typeof b === 'number')) {
    return Buffer.from(v as number[]).toString('utf-8');
  }
  if (v && typeof v === 'object') {
    const o = v as Json;
    for (const k of ['stringValue', 'intValue', 'doubleValue', 'boolValue']) {
      if (o[k] !== undefined) return String(o[k]);
    }
  }
  return undefined;
}

/** Serilog message template rendering: "Hello {Name}" + {Name: "x"} → "Hello x". */
export function renderTemplate(template: string, props: Json): string {
  return template.replace(/\{([@$]?)([A-Za-z_][\w]*)(?:,[^}:]*)?(?::[^}]*)?\}/g, (whole, _op, name) => {
    const v = props[name];
    if (v === undefined) return whole;
    return typeof v === 'string' ? v : JSON.stringify(v);
  });
}

function levelFrom(obj: Json): LogLevel | null {
  const sevNum = obj.SeverityNumber ?? obj.severityNumber;
  const lv = first(obj, LEVEL_KEYS);
  if (lv) {
    const l = toLevel(lv.value);
    if (l) return l;
    // GCP "DEFAULT"
    if (typeof lv.value === 'string' && /^default$/i.test(lv.value)) return 'INFO';
  }
  if (typeof sevNum === 'number') return otelSeverity(sevNum);
  if (obj.PRIORITY !== undefined) return SYSLOG_SEVERITY[Number(obj.PRIORITY)] ?? null;
  // Serilog CLEF: absent @l means Information
  if ('@t' in obj && ('@m' in obj || '@mt' in obj)) return 'INFO';
  // Kubernetes components: verbosity
  if (typeof obj.v === 'number' && 'msg' in obj) return obj.v >= 4 ? 'DEBUG' : 'INFO';
  // Access logs emitted as JSON (nginx json log_format, ALB, GCP httpRequest)
  const status = Number(obj.status ?? (obj.httpRequest as Json | undefined)?.status ?? obj.status_code);
  if (Number.isInteger(status) && status >= 100 && status < 600) return statusToLevel(status);
  return null;
}

function stackFrom(obj: Json): { lines: string[]; type?: string; message?: string } | undefined {
  // Structured error objects: pino `err`, ECS `error`, zerolog `error` string
  for (const key of ['err', 'error', 'Error', 'exception', 'Exception']) {
    const v = obj[key];
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const e = v as Json;
      const stack = asText(e.stack ?? e.stack_trace ?? e.stacktrace ?? e.StackTrace);
      const type = asText(e.type ?? e.kind ?? e.name ?? e.Type ?? e.ClassName);
      const message = asText(e.message ?? e.Message);
      if (stack || type || message) {
        return { lines: stack ? stack.split(/\r?\n/) : [], type, message };
      }
    }
  }
  let lines: string[] = [];
  const hit = first(obj, STACK_KEYS);
  if (hit) {
    if (Array.isArray(hit.value)) {
      // zerolog pkgerrors: [{func, line, source}] ; python-json-logger: list of strings
      lines = (hit.value as unknown[]).map((f) => {
        if (typeof f === 'string') return f;
        const o = f as Json;
        return `\tat ${o.func ?? o.function ?? '?'} (${o.source ?? o.file ?? '?'}:${o.line ?? '?'})`;
      });
    } else {
      const text = asText(hit.value);
      if (text) lines = text.split(/\r?\n/);
    }
  }
  // zerolog / zap / logrus: `error` / `err` as a plain string (Go errors have no type).
  const errText = typeof obj.error === 'string' ? obj.error : typeof obj.err === 'string' ? obj.err : undefined;
  if (errText) {
    const errLines = errText.split(/\r?\n/);
    return { lines: lines.length ? lines : errLines.length > 1 ? errLines : [], type: 'Error', message: errLines[0] };
  }
  const otelType = pick(obj, 'exception.type') ?? pick(obj, 'Attributes.exception.type') ?? pick(obj, 'attributes.exception.type');
  if (typeof otelType === 'string') {
    const msg = pick(obj, 'exception.message') ?? pick(obj, 'Attributes.exception.message') ?? pick(obj, 'attributes.exception.message');
    return { lines, type: otelType, message: asText(msg) };
  }
  if (lines.length) return { lines };
  return undefined;
}

/** Convert a parsed JSON object to a LogEntry. */
export function jsonToEntry(obj: Json, raw: string, lineNumber: number): LogEntry {
  const ts = first(obj, TIME_KEYS);
  let timestamp: Date | null = null;
  if (ts) {
    timestamp = typeof ts.value === 'object' && ts.value !== null
      ? parseTimestamp((ts.value as Json).$date ?? (ts.value as Json).seconds)
      : parseTimestamp(ts.value);
  }

  let message = '';
  const mv = first(obj, MESSAGE_KEYS);
  if (mv) message = asText(mv.value) ?? JSON.stringify(mv.value).slice(0, 2000);
  const template = asText(obj['@mt'] ?? obj.MessageTemplate);
  if (!mv && template) {
    const props = { ...(obj.Properties as Json | undefined), ...obj };
    message = renderTemplate(template, props);
  }
  if (!message) {
    const rest: Json = {};
    for (const [k, v] of Object.entries(obj)) if (!CONSUMED.has(k)) rest[k] = v;
    message = JSON.stringify(rest).slice(0, 500);
  }
  message = message.replace(/\r?\n$/, '');

  const logger = first(obj, LOGGER_KEYS);
  const thread = first(obj, THREAD_KEYS);

  const metadata: Json = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!CONSUMED.has(k)) metadata[k] = v;
  }
  if (template) metadata.messageTemplate = template;

  const entry: LogEntry = {
    timestamp,
    level: levelFrom(obj) ?? 'INFO',
    message,
    logger: logger ? asText(logger.value) : undefined,
    thread: thread ? asText(thread.value) : undefined,
    metadata,
    raw,
    lineNumber,
  };

  // zap / k8s "caller": "pkg/file.go:123"
  const caller = asText(obj.caller);
  if (caller) {
    const cm = caller.match(/^(.*):(\d+)$/);
    if (cm) { entry.class = cm[1]; entry.line = parseInt(cm[2], 10); }
  }

  const stack = stackFrom(obj);
  if (stack) {
    // The assembler's finalize step parses these lines into an ExceptionInfo;
    // the hint is used when the text alone does not name a type.
    entry.stackTrace = stack.lines.filter((l) => l.trim() !== '');
    if (stack.type || stack.message) {
      entry.exception = { type: stack.type ?? 'Error', message: stack.message ?? '', stackTrace: [] };
    }
  }
  return entry;
}

export class JsonParser extends BaseParser {
  readonly multiline = false;
  constructor(readonly format: LogFormat = 'json') {
    super();
  }

  parseLine(line: string, lineNumber: number): LogEntry | null {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;
    let obj: unknown;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      return null;
    }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
    return jsonToEntry(obj as Json, line, lineNumber);
  }
}

/**
 * Name the JSON dialect from a sample object's keys (reporting only — the
 * mapping above is shared).
 */
export function classifyJson(obj: Json): LogFormat {
  const has = (k: string) => k in obj;
  if (has('__REALTIME_TIMESTAMP') || (has('MESSAGE') && has('PRIORITY'))) return 'journald';
  if (has('resourceLogs') || has('SeverityText') || has('SeverityNumber') || has('severityNumber')
    || (has('Body') && (has('TraceId') || has('Resource'))) || has('timeUnixNano')) return 'otel';
  if (has('@t') && (has('@m') || has('@mt'))) return 'serilog';
  if (has('MessageTemplate') && has('Level') && has('Timestamp')) return 'serilog';
  if (has('EventId') && has('LogLevel') && has('Category')) return 'dotnet';
  if (typeof obj.level === 'number' && (has('msg') || has('pid') || has('hostname'))) return 'pino';
  if (typeof obj.ts === 'number' && has('msg') && typeof obj.level === 'string') return 'zap';
  if (typeof obj.ts === 'number' && has('msg') && typeof obj.v === 'number') return 'kubernetes';
  if (typeof obj.level === 'string' && has('msg') && has('time') && !has('message')) return 'logrus';
  if (typeof obj.level === 'string' && has('message') && has('time') && !has('timestamp')) return 'zerolog';
  if (typeof obj.level === 'string' && has('message')) return 'winston';
  return 'json';
}
