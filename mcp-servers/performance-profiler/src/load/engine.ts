// SPDX-License-Identifier: MIT
/**
 * HTTP load engine shared by profile_endpoint and stress_test_flow.
 *
 *  - closed model: N virtual users loop (request → think time), optional ramp-up
 *    and an optional iterations/s ceiling (token bucket);
 *  - open model: a constant arrival rate, independent of response time (so a
 *    slow server cannot slow the test down and hide its own latency —
 *    "coordinated omission"); iterations that would exceed `maxVUs` in flight
 *    are dropped and counted, like k6's constant-arrival-rate executor;
 *  - hard caps on VUs, rate, duration and total requests (env-configurable);
 *  - SSRF validation once per origin and on every redirect hop.
 */

import { limits } from '../utils/env.js';
import { validateUrl } from '../utils/ssrf.js';
import { mean, percentile, round, sampleStdDev } from '../utils/statistics.js';
import { evaluateThresholds, type Threshold, type ThresholdResult } from './thresholds.js';

const MAX_REDIRECTS = 5;

export interface RequestSpec {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs: number;
  /** Parse the body as JSON (flows need it for captures). */
  wantJson?: boolean;
}

export interface RequestOutcome {
  latencyMs: number;
  status?: number;
  ok: boolean;
  bytes: number;
  error?: string;
  json?: unknown;
}

/** Sends requests; validates each origin for SSRF once per runner. */
export class HttpRunner {
  private readonly validated = new Set<string>();

  private async check(url: string): Promise<void> {
    let origin: string;
    try {
      origin = new URL(url).origin;
    } catch {
      throw new Error(`Invalid URL: ${url}`);
    }
    if (this.validated.has(origin)) return;
    await validateUrl(url);
    this.validated.add(origin);
  }

  /** Validate a URL up front (throws on SSRF-blocked targets). */
  async preflight(url: string): Promise<void> {
    await this.check(url);
  }

  async send(spec: RequestSpec, signal?: AbortSignal): Promise<RequestOutcome> {
    await this.check(spec.url);
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), spec.timeoutMs);
    const headers: Record<string, string> = { ...(spec.headers ?? {}) };
    let body: string | undefined;
    if (spec.body !== undefined && spec.body !== null && spec.method !== 'GET' && spec.method !== 'HEAD') {
      body = typeof spec.body === 'string' ? spec.body : JSON.stringify(spec.body);
      if (!Object.keys(headers).some((h) => h.toLowerCase() === 'content-type') && typeof spec.body !== 'string') {
        headers['Content-Type'] = 'application/json';
      }
    }
    const start = performance.now();
    try {
      let url = spec.url;
      let method = spec.method;
      let res: Response | undefined;
      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        res = await fetch(url, { method, headers, body, signal: controller.signal, redirect: 'manual' });
        if (![301, 302, 303, 307, 308].includes(res.status)) break;
        const loc = res.headers.get('location');
        if (!loc) break;
        await res.arrayBuffer().catch(() => undefined);
        if (hop === MAX_REDIRECTS) throw new Error(`Too many redirects (max ${MAX_REDIRECTS})`);
        url = new URL(loc, url).toString();
        await this.check(url);
        if (res.status === 303) {
          method = 'GET';
          body = undefined;
        }
      }
      const buf = await res!.arrayBuffer();
      const latencyMs = performance.now() - start;
      let json: unknown;
      if (spec.wantJson && buf.byteLength > 0) {
        try {
          json = JSON.parse(Buffer.from(buf).toString('utf-8'));
        } catch {
          // not JSON
        }
      }
      const ok = res!.status < 400;
      return { latencyMs, status: res!.status, ok, bytes: buf.byteLength, json, ...(ok ? {} : { error: `HTTP ${res!.status}` }) };
    } catch (e) {
      const latencyMs = performance.now() - start;
      const msg = e instanceof Error ? e.message : String(e);
      const cause = e instanceof Error && e.cause instanceof Error ? e.cause.message : '';
      const error = controller.signal.aborted && !signal?.aborted ? 'timeout' : signal?.aborted ? 'aborted' : cause || msg;
      return { latencyMs, ok: false, bytes: 0, error };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

const HISTOGRAM_BOUNDS_MS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];

export class Recorder {
  readonly startedAt = Date.now();
  /** Latencies of completed responses (any status); network errors excluded. */
  readonly latencies: number[] = [];
  requests = 0;
  failures = 0;
  bytes = 0;
  readonly statusCodes: Record<string, number> = {};
  readonly errorTypes: Record<string, number> = {};
  private readonly endpoints = new Map<string, { n: number; fail: number; lat: number[] }>();
  private readonly seconds = new Map<number, { n: number; errs: number; latSum: number }>();

  record(endpoint: string, o: RequestOutcome): void {
    // A request cut short because the test was stopped is not a server error.
    if (o.error === 'aborted') return;
    this.requests++;
    this.bytes += o.bytes;
    if (o.status !== undefined) {
      this.latencies.push(o.latencyMs);
      this.statusCodes[o.status] = (this.statusCodes[o.status] ?? 0) + 1;
    }
    if (!o.ok) {
      this.failures++;
      const t = o.error ?? 'error';
      this.errorTypes[t] = (this.errorTypes[t] ?? 0) + 1;
    }
    let ep = this.endpoints.get(endpoint);
    if (!ep) {
      if (this.endpoints.size >= 200) endpoint = '(other)';
      ep = this.endpoints.get(endpoint) ?? { n: 0, fail: 0, lat: [] };
      this.endpoints.set(endpoint, ep);
    }
    ep.n++;
    if (!o.ok) ep.fail++;
    if (o.status !== undefined) ep.lat.push(o.latencyMs);
    const sec = Math.floor((Date.now() - this.startedAt) / 1000);
    const b = this.seconds.get(sec) ?? { n: 0, errs: 0, latSum: 0 };
    b.n++;
    if (!o.ok) b.errs++;
    b.latSum += o.latencyMs;
    this.seconds.set(sec, b);
  }

  /** Cheap live view for background-job progress. */
  progress(extra: Record<string, unknown> = {}) {
    const now = Math.floor((Date.now() - this.startedAt) / 1000);
    const last = this.seconds.get(now - 1);
    const recent = this.latencies.slice(-2000).sort((a, b) => a - b);
    return {
      elapsedS: round((Date.now() - this.startedAt) / 1000, 1),
      requests: this.requests,
      failures: this.failures,
      currentRps: last?.n ?? 0,
      recentP95Ms: recent.length ? round(percentile(recent, 95), 2) : null,
      ...extra,
    };
  }

  finalize(elapsedMs: number, thresholds: Threshold[]) {
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const n = sorted.length;
    const secs = Math.max(elapsedMs / 1000, 0.001);
    const pct = (p: number) => (n ? percentile(sorted, p) : NaN);
    const errorRate = this.requests ? this.failures / this.requests : 0;
    const rps = this.requests / secs;
    const latency = {
      min: n ? round(sorted[0], 2) : 0,
      max: n ? round(sorted[n - 1], 2) : 0,
      mean: n ? round(mean(sorted), 2) : 0,
      median: n ? round(pct(50), 2) : 0,
      stdDev: n ? round(sampleStdDev(sorted), 2) : 0,
      p50: n ? round(pct(50), 2) : 0,
      p75: n ? round(pct(75), 2) : 0,
      p90: n ? round(pct(90), 2) : 0,
      p95: n ? round(pct(95), 2) : 0,
      p99: n ? round(pct(99), 2) : 0,
    };
    const histogram: Array<{ le: string; count: number; cumulativePercent: number }> = [];
    let idx = 0;
    let cum = 0;
    for (const bound of [...HISTOGRAM_BOUNDS_MS, Infinity]) {
      let c = 0;
      while (idx < n && sorted[idx] <= bound) {
        idx++;
        c++;
      }
      cum += c;
      if (c > 0 || (cum > 0 && cum < n)) {
        histogram.push({ le: bound === Infinity ? '+Inf' : `${bound}ms`, count: c, cumulativePercent: n ? round((cum / n) * 100, 2) : 0 });
      }
    }
    const endpoints: Record<string, { requests: number; failures: number; errorRate: number; mean: number; p95: number }> = {};
    const epList = [...this.endpoints.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 50);
    for (const [k, v] of epList) {
      const s = [...v.lat].sort((a, b) => a - b);
      endpoints[k] = {
        requests: v.n,
        failures: v.fail,
        errorRate: round(v.fail / v.n, 4),
        mean: s.length ? round(mean(s), 2) : 0,
        p95: s.length ? round(percentile(s, 95), 2) : 0,
      };
    }
    let timeline = [...this.seconds.entries()].sort((a, b) => a[0] - b[0]).map(([s, b]) => ({
      second: s,
      requests: b.n,
      errors: b.errs,
      meanLatency: round(b.latSum / b.n, 2),
    }));
    let timelineDownsampled = false;
    if (timeline.length > 120) {
      const step = Math.ceil(timeline.length / 120);
      const merged: typeof timeline = [];
      for (let i = 0; i < timeline.length; i += step) {
        const chunk = timeline.slice(i, i + step);
        const reqs = chunk.reduce((s, c) => s + c.requests, 0);
        merged.push({
          second: chunk[0].second,
          requests: reqs,
          errors: chunk.reduce((s, c) => s + c.errors, 0),
          meanLatency: round(chunk.reduce((s, c) => s + c.meanLatency * c.requests, 0) / Math.max(reqs, 1), 2),
        });
      }
      timeline = merged;
      timelineDownsampled = true;
    }
    const thresholdResults: ThresholdResult[] = evaluateThresholds(thresholds, {
      percentile: pct,
      mean: n ? mean(sorted) : NaN,
      min: n ? sorted[0] : NaN,
      max: n ? sorted[n - 1] : NaN,
      errorRate,
      rps,
    });
    return {
      summary: {
        totalRequests: this.requests,
        successfulRequests: this.requests - this.failures,
        failedRequests: this.failures,
        elapsedMs: Math.round(elapsedMs),
        requestsPerSecond: round(rps, 2),
        dataReceivedBytes: this.bytes,
      },
      latency,
      histogram,
      statusCodes: this.statusCodes,
      errors: { count: this.failures, rate: round(errorRate, 4), types: this.errorTypes },
      endpoints,
      timeline,
      timelineDownsampled,
      thresholds: thresholdResults,
      passed: thresholdResults.every((t) => t.passed),
    };
  }
}

// ---------------------------------------------------------------------------
// Executors
// ---------------------------------------------------------------------------

export interface LoadOptions {
  model: 'closed' | 'open';
  /** closed: concurrent VUs. open: maximum iterations in flight. */
  vus: number;
  /** open: iterations started per second. */
  rate?: number;
  /** closed: optional ceiling on iterations started per second. */
  maxRate?: number;
  durationS?: number;
  iterations?: number;
  rampUpS?: number;
  thinkTimeMs?: number;
  signal?: AbortSignal;
}

export interface LoadRunStats {
  iterations: number;
  droppedIterations: number;
  elapsedMs: number;
  stoppedReason: 'duration' | 'iterations' | 'maxRequests' | 'aborted';
}

export function validateLoadOptions(o: LoadOptions, requestsPerIteration = 1): void {
  const lim = limits();
  if (!Number.isInteger(o.vus) || o.vus < 1) throw new Error('vus/concurrency must be a positive integer');
  if (o.vus > lim.maxVus) throw new Error(`vus ${o.vus} exceeds the cap PERF_PROFILER_MAX_VUS=${lim.maxVus}`);
  if (o.model === 'open') {
    if (!o.rate || o.rate <= 0) throw new Error('open model requires a positive "rate" (iterations per second)');
    if (o.rate > lim.maxRate) throw new Error(`rate ${o.rate}/s exceeds the cap PERF_PROFILER_MAX_RATE=${lim.maxRate}`);
  }
  if (o.maxRate !== undefined && o.maxRate > lim.maxRate) {
    throw new Error(`maxRate ${o.maxRate}/s exceeds the cap PERF_PROFILER_MAX_RATE=${lim.maxRate}`);
  }
  if (o.durationS === undefined && o.iterations === undefined) throw new Error('Either duration or iterations is required');
  if (o.durationS !== undefined && (o.durationS <= 0 || o.durationS > lim.maxDurationS)) {
    throw new Error(`duration must be in (0, ${lim.maxDurationS}] s (PERF_PROFILER_MAX_DURATION_S)`);
  }
  if (o.iterations !== undefined) {
    if (!Number.isInteger(o.iterations) || o.iterations < 1) throw new Error('iterations must be a positive integer');
    if (o.iterations * requestsPerIteration > lim.maxRequests) {
      throw new Error(
        `iterations × requests per iteration = ${o.iterations * requestsPerIteration} exceeds PERF_PROFILER_MAX_REQUESTS=${lim.maxRequests}`
      );
    }
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (ms <= 0 || signal?.aborted) return resolve();
    const t = setTimeout(done, ms);
    function done() {
      clearTimeout(t);
      signal?.removeEventListener('abort', done);
      resolve();
    }
    signal?.addEventListener('abort', done, { once: true });
  });
}

/**
 * Run `iterate` under the given load model until duration, iteration count,
 * request cap or abort. Never throws for request failures — those are metrics.
 */
export async function runLoad(
  iterate: (vu: number, signal: AbortSignal) => Promise<void>,
  rec: Recorder,
  o: LoadOptions
): Promise<LoadRunStats> {
  const lim = limits();
  const internal = new AbortController();
  const onOuter = () => internal.abort();
  o.signal?.addEventListener('abort', onOuter, { once: true });
  const signal = internal.signal;
  const start = Date.now();
  const deadline = o.durationS !== undefined ? start + Math.min(o.durationS, lim.maxDurationS) * 1000 : start + lim.maxDurationS * 1000;
  let started = 0;
  let dropped = 0;
  let stoppedReason: LoadRunStats['stoppedReason'] = o.iterations !== undefined && o.durationS === undefined ? 'iterations' : 'duration';

  const shouldStop = (): boolean => {
    if (o.signal?.aborted) {
      stoppedReason = 'aborted';
      return true;
    }
    if (rec.requests >= lim.maxRequests) {
      stoppedReason = 'maxRequests';
      return true;
    }
    if (Date.now() >= deadline) {
      stoppedReason = 'duration';
      return true;
    }
    if (o.iterations !== undefined && started >= o.iterations) {
      stoppedReason = 'iterations';
      return true;
    }
    return false;
  };

  try {
    if (o.model === 'closed') {
      // Token bucket for the optional ceiling.
      let nextSlot = start;
      const interval = o.maxRate ? 1000 / o.maxRate : 0;
      const ramp = (o.rampUpS ?? 0) * 1000;
      const vu = async (id: number) => {
        const delay = o.vus > 1 && ramp > 0 ? (ramp * id) / o.vus : 0;
        await sleep(delay, signal);
        while (!shouldStop()) {
          if (interval > 0) {
            const now = Date.now();
            const slot = Math.max(nextSlot, now);
            nextSlot = slot + interval;
            await sleep(slot - now, signal);
            if (shouldStop()) break;
          }
          started++;
          await iterate(id, signal);
          if (o.thinkTimeMs) await sleep(o.thinkTimeMs, signal);
        }
      };
      await Promise.all(Array.from({ length: o.vus }, (_, i) => vu(i)));
    } else {
      const rate = o.rate!;
      const inFlight = new Set<Promise<void>>();
      let vuId = 0;
      while (!shouldStop()) {
        const due = Math.floor(((Date.now() - start) / 1000) * rate) + 1;
        while (started + dropped < due && !shouldStop()) {
          if (inFlight.size >= o.vus) {
            dropped++;
            continue;
          }
          started++;
          const p: Promise<void> = iterate(vuId++ % o.vus, signal).finally(() => inFlight.delete(p));
          inFlight.add(p);
        }
        const nextDue = ((started + dropped) / rate) * 1000 + start;
        await sleep(Math.max(1, Math.min(50, nextDue - Date.now())), signal);
      }
      // Let in-flight iterations finish (they carry their own request timeouts).
      await Promise.all([...inFlight]);
    }
  } finally {
    o.signal?.removeEventListener('abort', onOuter);
  }
  return { iterations: started, droppedIterations: dropped, elapsedMs: Date.now() - start, stoppedReason };
}
