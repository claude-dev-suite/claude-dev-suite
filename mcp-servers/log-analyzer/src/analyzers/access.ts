// SPDX-License-Identifier: MIT
/**
 * Access-log analytics over any format that yields HTTP fields (nginx,
 * Apache, CLF, morgan, Heroku router, Rails, JSON access logs, GCP
 * httpRequest, ALB-style JSON): status-class distribution, error rate over
 * time, slowest endpoints with p50/p95/p99, top paths / IPs / user agents.
 */

import type { LogEntry, SourceInput } from '../types.js';
import { firstField, toNumber } from '../core/fields.js';
import { Reservoir, round, topK, bump } from '../core/quantile.js';
import { parseDurationMs, parseWindow } from '../core/timestamp.js';
import { scan, type PipelineDeps } from '../pipeline/index.js';
import { bucketKey, describeScan, TimeSpan } from './output.js';

const STATUS = ['status', 'status_code', 'statusCode', 'http.status_code', 'http.response.status_code', 'httpRequest.status', 'response.status', 'sc-status', 'elb_status_code'];
const METHOD = ['method', 'http.method', 'http.request.method', 'httpRequest.requestMethod', 'request_method', 'cs-method', 'verb'];
const PATH = ['path', 'url', 'uri', 'request_uri', 'http.target', 'http.url', 'url.path', 'httpRequest.requestUrl', 'request', 'cs-uri-stem', 'route'];
const IP = ['remoteAddr', 'remote_addr', 'client_ip', 'clientIp', 'ip', 'httpRequest.remoteIp', 'client.ip', 'source.ip', 'c-ip', 'x_forwarded_for', 'fwd', 'client'];
const UA = ['userAgent', 'user_agent', 'http_user_agent', 'httpRequest.userAgent', 'user_agent.original', 'cs(User-Agent)', 'ua'];
/** Latency fields and the unit a bare number is in. */
const LATENCY: Array<[string, number]> = [
  ['durationMs', 1], ['duration_ms', 1], ['latency_ms', 1], ['response_time_ms', 1], ['elapsed_ms', 1],
  ['request_time', 1000], ['requestTime', 1000], ['upstream_response_time', 1000], ['rt', 1000],
  ['httpRequest.latency', 1000], ['duration', 1], ['latency', 1], ['response_time', 1], ['responseTime', 1],
  ['elapsed', 1], ['time_taken', 1], ['time-taken', 1], ['http.duration', 1], ['target_processing_time', 1000],
];

function latencyMs(e: LogEntry): number | null {
  for (const [name, mult] of LATENCY) {
    const v = firstField(e, [name]);
    if (v === undefined) continue;
    if (typeof v === 'number') return v * mult;
    if (typeof v === 'string') {
      if (/^\d+(?:\.\d+)?$/.test(v)) return parseFloat(v) * mult;
      const d = parseDurationMs(v); // "0.123s", "18ms"
      if (d !== null) return d;
    }
  }
  return null;
}

/** Collapse ids so /users/123 and /users/456 are one endpoint. */
export function normalizePath(path: string): string {
  const noQuery = path.split('?')[0].split('#')[0];
  let p = noQuery;
  try {
    if (/^https?:\/\//i.test(p)) p = new URL(p).pathname;
  } catch { /* keep */ }
  return p
    .split('/')
    .map((seg) => {
      if (!seg) return seg;
      if (/^\d+$/.test(seg)) return '{id}';
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) return '{uuid}';
      if (/^[0-9a-f]{16,}$/i.test(seg) || (/\d/.test(seg) && /^[A-Za-z0-9_-]{20,}$/.test(seg))) return '{hash}';
      return seg;
    })
    .join('/') || '/';
}

interface Endpoint {
  count: number;
  errors5xx: number;
  errors4xx: number;
  latency: Reservoir;
}

export async function accessLogStats(
  input: SourceInput,
  o: { startTime?: Date; endTime?: Date; bucket?: string; top?: number; normalizePaths?: boolean; minRequests?: number },
  deps: PipelineDeps = {},
): Promise<Record<string, unknown>> {
  const top = Math.min(o.top ?? 10, 100);
  const statusClasses: Record<string, number> = { '1xx': 0, '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 };
  const statusCodes = new Map<string, number>();
  const ips = new Map<string, number>();
  const uas = new Map<string, number>();
  const endpoints = new Map<string, Endpoint>();
  const overall = new Reservoir(50000);
  const span = new TimeSpan();
  const series = new Map<string, { total: number; e5xx: number; e4xx: number }>();
  let requests = 0;
  let nonRequestEntries = 0;
  let withLatency = 0;
  let endpointOverflow = false;

  // Buckets need a width before the scan; default 5m, recomputed below if the span is huge.
  const widthMs = parseWindow(o.bucket ?? '5m');

  const summary = await scan(input, { filter: { startTime: o.startTime, endTime: o.endTime } }, (e) => {
    const status = toNumber(firstField(e, STATUS));
    if (status === null || status < 100 || status > 599) { nonRequestEntries++; return; }
    requests++;
    const cls = `${Math.floor(status / 100)}xx`;
    statusClasses[cls] = (statusClasses[cls] ?? 0) + 1;
    bump(statusCodes, String(status), 200, 'other');
    const ip = firstField(e, IP);
    if (ip !== undefined) bump(ips, String(ip).split(',')[0].trim(), 50000, '(other)');
    const ua = firstField(e, UA);
    if (ua !== undefined) bump(uas, String(ua).slice(0, 300), 20000, '(other)');

    const method = String(firstField(e, METHOD) ?? '').toUpperCase();
    let path = String(firstField(e, PATH) ?? '');
    if (path.includes(' ') && /^[A-Z]+ \S+/.test(path)) path = path.split(' ')[1]; // "GET /x HTTP/1.1"
    const key = `${method ? method + ' ' : ''}${o.normalizePaths === false ? path.split('?')[0] : normalizePath(path)}`;
    let ep = endpoints.get(key);
    if (!ep) {
      if (endpoints.size < 20000) {
        ep = { count: 0, errors5xx: 0, errors4xx: 0, latency: new Reservoir(5000) };
        endpoints.set(key, ep);
      } else endpointOverflow = true;
    }
    const ms = latencyMs(e);
    if (ms !== null) { withLatency++; overall.add(ms); }
    if (ep) {
      ep.count++;
      if (status >= 500) ep.errors5xx++;
      else if (status >= 400) ep.errors4xx++;
      if (ms !== null) ep.latency.add(ms);
    }
    span.add(e.timestamp);
    if (e.timestamp && series.size < 50000) {
      const k = bucketKey(e.timestamp, widthMs);
      const b = series.get(k) ?? { total: 0, e5xx: 0, e4xx: 0 };
      b.total++;
      if (status >= 500) b.e5xx++;
      else if (status >= 400) b.e4xx++;
      series.set(k, b);
    }
  }, deps);

  if (requests === 0) {
    return {
      requests: 0,
      error: 'No HTTP request entries found (no status field). Check the format or point at an access log.',
      scan: describeScan(summary),
    };
  }

  const minReq = o.minRequests ?? 1;
  const epList = [...endpoints.entries()].filter(([, v]) => v.count >= minReq);
  const slowest = withLatency > 0
    ? epList
      .filter(([, v]) => v.latency.count > 0)
      .map(([k, v]) => ({ endpoint: k, requests: v.count, ...v.latency.summary([50, 95, 99]), errorRate5xx: round((v.errors5xx / v.count) * 100, 2) }))
      .sort((a, b) => (((b as Record<string, unknown>).p95 as number) ?? 0) - (((a as Record<string, unknown>).p95 as number) ?? 0))
      .slice(0, top)
    : null;

  const seriesArr = [...series.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([t, v]) => ({
    time: t, requests: v.total, errors5xx: v.e5xx, errors4xx: v.e4xx,
    errorRate5xx: round((v.e5xx / v.total) * 100, 2),
  }));

  return {
    requests,
    timeRange: span.toJSON(),
    statusClasses,
    topStatusCodes: topK(statusCodes, top).map(([code, count]) => ({ code, count })),
    errorRate: {
      server5xxPercent: round((statusClasses['5xx'] / requests) * 100, 2),
      client4xxPercent: round((statusClasses['4xx'] / requests) * 100, 2),
    },
    latencyMs: withLatency > 0 ? overall.summary([50, 90, 95, 99]) : null,
    ...(withLatency === 0 ? { latencyNote: 'No latency field found (e.g. nginx $request_time, durationMs, service=18ms); percentiles unavailable' } : {}),
    ...(withLatency > 0 && withLatency < requests ? { requestsWithLatency: withLatency } : {}),
    slowestEndpoints: slowest,
    busiestEndpoints: epList.sort((a, b) => b[1].count - a[1].count).slice(0, top).map(([k, v]) => ({
      endpoint: k, requests: v.count, errors5xx: v.errors5xx, errors4xx: v.errors4xx,
    })),
    topIps: topK(ips, top).map(([ip, count]) => ({ ip, count })),
    topUserAgents: topK(uas, top).map(([userAgent, count]) => ({ userAgent, count })),
    errorRateOverTime: {
      bucket: o.bucket ?? '5m',
      series: seriesArr.slice(-500),
      ...(seriesArr.length > 500 ? { truncated: true, bucketsOmitted: seriesArr.length - 500 } : {}),
    },
    ...(endpointOverflow ? { endpointsTruncated: true } : {}),
    ...(nonRequestEntries ? { nonRequestEntries } : {}),
    scan: describeScan(summary),
  };
}
