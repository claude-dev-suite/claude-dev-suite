// SPDX-License-Identifier: MIT
/**
 * profile_endpoint: latency/throughput of one HTTP endpoint, on the shared
 * load engine (closed or open model, caps, thresholds, histogram).
 */

import { createRunDir } from '../utils/artifacts.js';
import { redactUrl } from '../utils/redact.js';
import { HttpRunner, Recorder, runLoad, validateLoadOptions, type LoadOptions } from '../load/engine.js';
import { parseThreshold } from '../load/thresholds.js';
import { recordRun } from '../results/store.js';

export interface EndpointProfileInput {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  /** Count-bounded run (default 100 when no duration is given). */
  iterations?: number;
  /** Time-bounded run in seconds. */
  duration?: number;
  concurrency?: number;
  /** Open model: requests started per second. */
  rate?: number;
  rampUp?: number;
  warmupIterations?: number;
  timeoutMs?: number;
  thresholds?: string[];
  signal?: AbortSignal;
}

export function endpointLoadOptions(input: EndpointProfileInput): LoadOptions {
  const duration = input.duration;
  return {
    model: input.rate !== undefined ? 'open' : 'closed',
    vus: input.concurrency ?? (input.rate !== undefined ? Math.min(100, Math.max(10, Math.ceil(input.rate))) : 1),
    rate: input.rate,
    durationS: duration,
    iterations: duration === undefined ? (input.iterations ?? 100) : input.iterations,
    rampUpS: input.rampUp,
    signal: input.signal,
  };
}

/** Validate everything that can be validated before starting (so a background job fails fast). */
export async function prepareEndpoint(input: EndpointProfileInput) {
  const opts = endpointLoadOptions(input);
  validateLoadOptions(opts);
  const thresholds = (input.thresholds ?? []).map(parseThreshold);
  const runner = new HttpRunner();
  await runner.preflight(input.url);
  return { opts, thresholds, runner };
}

export async function profileEndpoint(input: EndpointProfileInput, prepared?: Awaited<ReturnType<typeof prepareEndpoint>>, rec = new Recorder()) {
  const { opts, thresholds, runner } = prepared ?? (await prepareEndpoint(input));
  const method = (input.method ?? 'GET').toUpperCase();
  const spec = { method, url: input.url, headers: input.headers, body: input.body, timeoutMs: input.timeoutMs ?? 30_000 };
  const warm = input.warmupIterations ?? 5;
  for (let i = 0; i < warm && !input.signal?.aborted; i++) await runner.send(spec, input.signal);
  const endpoint = `${method} ${redactUrl(input.url)}`;
  const run = await runLoad(async (_vu, signal) => {
    rec.record(endpoint, await runner.send(spec, signal));
  }, rec, opts);
  const metrics = rec.finalize(run.elapsedMs, thresholds);
  if (metrics.summary.totalRequests > 0 && metrics.summary.successfulRequests === 0 && rec.latencies.length === 0) {
    throw new Error(`All ${metrics.summary.totalRequests} requests failed: ${JSON.stringify(metrics.errors.types)}`);
  }
  const { runId, dir } = await createRunDir('load');
  await recordRun(dir, {
    runId, kind: 'load', subject: endpoint,
    metrics: {
      latency_mean: metrics.latency.mean, latency_p50: metrics.latency.p50, latency_p95: metrics.latency.p95,
      latency_p99: metrics.latency.p99, rps: metrics.summary.requestsPerSecond, error_rate: metrics.errors.rate,
    },
    samples: { latency: rec.latencies },
  });
  return {
    runId,
    url: redactUrl(input.url),
    method,
    model: opts.model,
    config: {
      concurrency: opts.vus,
      ...(opts.rate !== undefined ? { rate: opts.rate } : {}),
      ...(opts.durationS !== undefined ? { duration: opts.durationS } : {}),
      ...(opts.iterations !== undefined ? { iterations: opts.iterations } : {}),
      warmupIterations: warm,
    },
    iterations: run.iterations,
    droppedIterations: run.droppedIterations,
    stoppedReason: run.stoppedReason,
    ...metrics,
    throughput: { requestsPerSecond: metrics.summary.requestsPerSecond, totalTimeMs: metrics.summary.elapsedMs },
    ...(run.droppedIterations > 0
      ? { warning: `${run.droppedIterations} arrivals were dropped because ${opts.vus} requests were already in flight — the server cannot sustain ${opts.rate}/s at this concurrency.` }
      : {}),
  };
}
