// SPDX-License-Identifier: MIT
/**
 * Envelopes: formats that wrap the application's own log line.
 *
 *   docker      json-file driver   {"log":"text\n","stream":"stdout","time":"…"}   (lines > 16 KB split, re-joined here)
 *   cri         containerd/CRI-O   2024-01-02T15:04:05.123456789Z stdout F text      (P = partial, re-joined)
 *   heroku      logplex drain      2024-01-02T15:04:05.123456+00:00 app[web.1]: text
 *   cloudwatch  AWS CloudWatch     {"events":[{timestamp,message,logStreamName}]} (filter-log-events / get-log-events),
 *                                  {"logEvents":[…]} (subscription payloads), or one event object per line
 *   otlp        OpenTelemetry      {"resourceLogs":[…]} (OTLP/JSON, collector file exporter)
 *   ts-prefix   `docker logs --timestamps`, `kubectl logs --timestamps`
 *   compose     `docker compose logs --timestamps`  → "web-1  | 2024-…Z text"
 *   kubectl     `kubectl logs --prefix --timestamps` → "[pod/api-7d/app] 2024-…Z text"
 *
 * Unwrapping first and parsing the payload second is what lets the multiline
 * assembler join a Java stack trace that the container runtime split into one
 * JSON record per line, and lets the payload's own format be auto-detected.
 */

import type { LogEntry } from '../types.js';
import { parseTimestamp } from '../core/timestamp.js';
import { jsonToEntry } from './json.js';

export type EnvelopeName = 'docker' | 'cri' | 'heroku' | 'cloudwatch' | 'otlp' | 'ts-prefix' | 'compose' | 'kubectl';

export interface InnerLine {
  text: string;
  lineNumber: number;
  timestamp?: Date | null;
  stream?: string;
  labels?: Record<string, string>;
  /** Multiline assembly is done per key (stream / container / dyno). */
  key?: string;
}

export type InnerItem = { kind: 'line'; line: InnerLine } | { kind: 'entry'; entry: LogEntry };

export interface Envelope {
  readonly name: EnvelopeName;
  /** null → the raw line is not a record of this envelope. */
  push(raw: string, lineNumber: number, stream?: string): InnerItem[] | null;
  flush(): InnerItem[];
}

const MAX_PARTIAL = 1024 * 1024;
const RFC3339 = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2}))\s(.*)$/;

function tryJson(raw: string): Record<string, unknown> | null {
  const t = raw.trim();
  if (!t.startsWith('{') || !t.endsWith('}')) return null;
  try {
    const v = JSON.parse(t);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Split a payload that may contain several lines into inner lines sharing the envelope metadata. */
function splitPayload(text: string, base: Omit<InnerLine, 'text'>): InnerItem[] {
  const parts = text.replace(/\r?\n$/, '').split(/\r?\n/);
  return parts.map((p, i) => ({ kind: 'line' as const, line: { ...base, text: p, timestamp: i === 0 ? base.timestamp : undefined } }));
}

class DockerJsonEnvelope implements Envelope {
  readonly name = 'docker' as const;
  private partial = new Map<string, { text: string; time: Date | null; lineNumber: number }>();

  push(raw: string, lineNumber: number): InnerItem[] | null {
    const obj = tryJson(raw);
    if (!obj || typeof obj.log !== 'string') return null;
    const stream = typeof obj.stream === 'string' ? obj.stream : 'stdout';
    const time = parseTimestamp(obj.time);
    const pending = this.partial.get(stream);
    const text = (pending?.text ?? '') + obj.log;
    if (!obj.log.endsWith('\n') && text.length < MAX_PARTIAL) {
      this.partial.set(stream, { text, time: pending?.time ?? time, lineNumber: pending?.lineNumber ?? lineNumber });
      return [];
    }
    this.partial.delete(stream);
    const attrs = obj.attrs && typeof obj.attrs === 'object' ? (obj.attrs as Record<string, string>) : undefined;
    return splitPayload(text, {
      lineNumber: pending?.lineNumber ?? lineNumber, timestamp: pending?.time ?? time, stream, key: stream, labels: attrs,
    });
  }

  flush(): InnerItem[] {
    const out: InnerItem[] = [];
    for (const [stream, p] of this.partial) {
      out.push(...splitPayload(p.text, { lineNumber: p.lineNumber, timestamp: p.time, stream, key: stream }));
    }
    this.partial.clear();
    return out;
  }
}

const CRI = /^(\d{4}-\d{2}-\d{2}T\S+)\s(stdout|stderr)\s([FP])(?:\s(.*))?$/;

class CriEnvelope implements Envelope {
  readonly name = 'cri' as const;
  private partial = new Map<string, { text: string; time: Date | null; lineNumber: number }>();

  push(raw: string, lineNumber: number): InnerItem[] | null {
    const m = raw.match(CRI);
    if (!m) return null;
    const [, ts, stream, tag, content = ''] = m;
    const pending = this.partial.get(stream);
    const text = (pending?.text ?? '') + content;
    if (tag === 'P' && text.length < MAX_PARTIAL) {
      this.partial.set(stream, { text, time: pending?.time ?? parseTimestamp(ts), lineNumber: pending?.lineNumber ?? lineNumber });
      return [];
    }
    this.partial.delete(stream);
    return [{ kind: 'line', line: { text, lineNumber: pending?.lineNumber ?? lineNumber, timestamp: pending?.time ?? parseTimestamp(ts), stream, key: stream } }];
  }

  flush(): InnerItem[] {
    const out: InnerItem[] = [];
    for (const [stream, p] of this.partial) {
      out.push({ kind: 'line', line: { text: p.text, lineNumber: p.lineNumber, timestamp: p.time, stream, key: stream } });
    }
    this.partial.clear();
    return out;
  }
}

const HEROKU = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2}))\s+(app|heroku|[\w-]+)\[([\w.\-]+)\]:\s?(.*)$/;

class HerokuEnvelope implements Envelope {
  readonly name = 'heroku' as const;
  push(raw: string, lineNumber: number): InnerItem[] | null {
    const m = raw.match(HEROKU);
    if (!m) return null;
    const [, ts, source, dyno, text] = m;
    return [{ kind: 'line', line: { text, lineNumber, timestamp: parseTimestamp(ts), labels: { source, dyno }, key: `${source}[${dyno}]` } }];
  }
  flush(): InnerItem[] { return []; }
}

class CloudWatchEnvelope implements Envelope {
  readonly name = 'cloudwatch' as const;
  push(raw: string, lineNumber: number): InnerItem[] | null {
    const obj = tryJson(raw);
    if (!obj) return null;
    const out: InnerItem[] = [];
    const group = typeof obj.logGroup === 'string' ? obj.logGroup : undefined;
    const events = Array.isArray(obj.events) ? obj.events : Array.isArray(obj.logEvents) ? obj.logEvents : null;
    const list = events ?? (typeof obj.message === 'string' && obj.timestamp !== undefined ? [obj] : null);
    if (!list) return null;
    for (const ev of list as Array<Record<string, unknown>>) {
      if (typeof ev.message !== 'string') continue;
      const stream = typeof ev.logStreamName === 'string' ? ev.logStreamName : typeof obj.logStream === 'string' ? obj.logStream : undefined;
      const labels: Record<string, string> = {};
      if (stream) labels.logStream = stream;
      if (group) labels.logGroup = group;
      out.push(...splitPayload(ev.message, {
        lineNumber, timestamp: parseTimestamp(ev.timestamp), labels, key: stream ?? 'default',
      }));
    }
    return out;
  }
  flush(): InnerItem[] { return []; }
}

/** OTLP AnyValue → plain JS value. */
function anyValue(v: unknown): unknown {
  if (!v || typeof v !== 'object') return v;
  const o = v as Record<string, unknown>;
  if ('stringValue' in o) return o.stringValue;
  if ('intValue' in o) return Number(o.intValue);
  if ('doubleValue' in o) return o.doubleValue;
  if ('boolValue' in o) return o.boolValue;
  if ('arrayValue' in o) return ((o.arrayValue as { values?: unknown[] })?.values ?? []).map(anyValue);
  if ('kvlistValue' in o) return attrs((o.kvlistValue as { values?: unknown[] })?.values);
  if ('bytesValue' in o) return o.bytesValue;
  return v;
}

function attrs(list: unknown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!Array.isArray(list)) return out;
  for (const kv of list as Array<{ key?: string; value?: unknown }>) {
    if (kv && typeof kv.key === 'string') out[kv.key] = anyValue(kv.value);
  }
  return out;
}

/** Flatten one OTLP/JSON document into OTel data-model records. */
export function otlpRecords(doc: Record<string, unknown>): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const rl of (doc.resourceLogs as Array<Record<string, unknown>>) ?? []) {
    const resource = attrs((rl.resource as { attributes?: unknown })?.attributes);
    for (const sl of (rl.scopeLogs as Array<Record<string, unknown>>) ?? (rl.instrumentationLibraryLogs as Array<Record<string, unknown>>) ?? []) {
      const scope = (sl.scope ?? sl.instrumentationLibrary) as { name?: string } | undefined;
      for (const r of (sl.logRecords as Array<Record<string, unknown>>) ?? []) {
        const attributes = attrs(r.attributes);
        out.push({
          Timestamp: r.timeUnixNano && r.timeUnixNano !== '0' ? Number(r.timeUnixNano) : Number(r.observedTimeUnixNano ?? 0) || undefined,
          SeverityText: r.severityText,
          SeverityNumber: r.severityNumber,
          Body: anyValue(r.body),
          TraceId: r.traceId || undefined,
          SpanId: r.spanId || undefined,
          logger: scope?.name || (resource['service.name'] as string | undefined),
          Resource: resource,
          Attributes: attributes,
          ...(typeof attributes['exception.type'] === 'string' ? { 'exception.type': attributes['exception.type'] } : {}),
          ...(typeof attributes['exception.message'] === 'string' ? { 'exception.message': attributes['exception.message'] } : {}),
          ...(typeof attributes['exception.stacktrace'] === 'string' ? { 'exception.stacktrace': attributes['exception.stacktrace'] } : {}),
        });
      }
    }
  }
  return out;
}

class OtlpEnvelope implements Envelope {
  readonly name = 'otlp' as const;
  push(raw: string, lineNumber: number): InnerItem[] | null {
    const obj = tryJson(raw);
    if (!obj || !Array.isArray(obj.resourceLogs)) return null;
    return otlpRecords(obj).map((rec) => {
      const entry = jsonToEntry(rec, JSON.stringify(rec).slice(0, 4000), lineNumber);
      return { kind: 'entry' as const, entry };
    });
  }
  flush(): InnerItem[] { return []; }
}

class TsPrefixEnvelope implements Envelope {
  readonly name = 'ts-prefix' as const;
  push(raw: string, lineNumber: number, stream?: string): InnerItem[] | null {
    const m = raw.match(RFC3339);
    if (!m) return [{ kind: 'line', line: { text: raw, lineNumber, stream, key: stream } }];
    return [{ kind: 'line', line: { text: m[2], lineNumber, timestamp: parseTimestamp(m[1]), stream, key: stream } }];
  }
  flush(): InnerItem[] { return []; }
}

const COMPOSE = /^([\w.\-]+)\s+\|\s?(.*)$/;

class ComposeEnvelope implements Envelope {
  readonly name = 'compose' as const;
  push(raw: string, lineNumber: number, stream?: string): InnerItem[] | null {
    const m = raw.match(COMPOSE);
    if (!m) return null;
    const [, service, rest] = m;
    const t = rest.match(RFC3339);
    return [{
      kind: 'line',
      line: { text: t ? t[2] : rest, lineNumber, timestamp: t ? parseTimestamp(t[1]) : undefined, stream, labels: { service }, key: service },
    }];
  }
  flush(): InnerItem[] { return []; }
}

const KUBECTL_PREFIX = /^\[([^\]]+)\]\s(.*)$/;

class KubectlPrefixEnvelope implements Envelope {
  readonly name = 'kubectl' as const;
  push(raw: string, lineNumber: number, stream?: string): InnerItem[] | null {
    const m = raw.match(KUBECTL_PREFIX);
    let text = raw;
    const labels: Record<string, string> = {};
    if (m) {
      const parts = m[1].split('/'); // pod/<name>/<container>
      if (parts[0] === 'pod' && parts.length >= 3) { labels.pod = parts[1]; labels.container = parts[2]; }
      else labels.prefix = m[1];
      text = m[2];
    }
    const t = text.match(RFC3339);
    return [{
      kind: 'line',
      line: { text: t ? t[2] : text, lineNumber, timestamp: t ? parseTimestamp(t[1]) : undefined, stream, labels, key: m ? m[1] : stream },
    }];
  }
  flush(): InnerItem[] { return []; }
}

export function createEnvelope(name: EnvelopeName): Envelope {
  switch (name) {
    case 'docker': return new DockerJsonEnvelope();
    case 'cri': return new CriEnvelope();
    case 'heroku': return new HerokuEnvelope();
    case 'cloudwatch': return new CloudWatchEnvelope();
    case 'otlp': return new OtlpEnvelope();
    case 'ts-prefix': return new TsPrefixEnvelope();
    case 'compose': return new ComposeEnvelope();
    case 'kubectl': return new KubectlPrefixEnvelope();
  }
}

/** Detect an envelope from sample raw lines: the name when ≥ 60% of non-blank lines match. */
export function detectEnvelope(sample: string[]): EnvelopeName | null {
  const lines = sample.filter((l) => l.trim());
  if (lines.length === 0) return null;
  const threshold = Math.max(1, Math.ceil(lines.length * 0.6));
  const count = (pred: (l: string) => boolean) => lines.filter(pred).length;

  if (count((l) => { const o = tryJson(l); return !!o && typeof o.log === 'string' && ('stream' in o || 'time' in o); }) >= threshold) return 'docker';
  if (count((l) => CRI.test(l)) >= threshold) return 'cri';
  if (count((l) => HEROKU.test(l)) >= threshold) return 'heroku';
  if (count((l) => { const o = tryJson(l); return !!o && Array.isArray(o.resourceLogs); }) >= threshold) return 'otlp';
  if (count((l) => {
    const o = tryJson(l);
    if (!o) return false;
    if (Array.isArray(o.events) || Array.isArray(o.logEvents)) return true;
    return typeof o.message === 'string' && typeof o.timestamp === 'number' && ('logStreamName' in o || 'ingestionTime' in o || 'eventId' in o);
  }) >= threshold) return 'cloudwatch';
  return null;
}
