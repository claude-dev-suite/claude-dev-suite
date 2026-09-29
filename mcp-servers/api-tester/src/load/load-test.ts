// SPDX-License-Identifier: MIT
/**
 * A light, bounded load test: fixed concurrency or a target request rate for
 * at most 60 s / 10 000 requests, reporting latency percentiles, throughput,
 * status distribution and error rate. Heavier profiling belongs to the
 * performance-profiler server.
 */

import http from 'http';
import https from 'https';
import { send } from '../http/client.js';
import { validateTargetUrl } from '../http/ssrf-policy.js';
import { prepareRequest, type RequestInput, type VarContext } from '../http/executor.js';

export const LOAD_LIMITS = { maxDurationSec: 60, maxConcurrency: 50, maxRps: 200, maxRequests: 10_000 };

export interface LoadOptions {
  mode: 'concurrency' | 'rps';
  concurrency: number;
  rps: number;
  durationSec: number;
  maxRequests: number;
  expectStatus?: number[];
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Math.round(sorted[idx] * 100) / 100;
}

export async function runLoadTest(input: RequestInput, ctx: VarContext, opts: LoadOptions): Promise<Record<string, unknown>> {
  const prepared = await prepareRequest(input, ctx);
  await validateTargetUrl(prepared.url);
  const isHttps = prepared.url.startsWith('https:');
  const agentOpts = {
    keepAlive: true,
    maxSockets: opts.mode === 'concurrency' ? opts.concurrency : Math.min(256, opts.rps * 2),
  };
  const agent = isHttps ? new https.Agent(agentOpts) : new http.Agent(agentOpts);

  const latencies: number[] = [];
  const statuses: Record<string, number> = {};
  const errors = new Map<string, number>();
  let sent = 0;
  let completed = 0;
  let unexpected = 0;
  let dropped = 0;
  let inFlight = 0;
  const started = Date.now();
  const deadline = started + opts.durationSec * 1000;
  const perRequestTimeout = Math.min(prepared.timeoutMs, 30_000);

  const one = async () => {
    sent++;
    inFlight++;
    const t0 = process.hrtime.bigint();
    try {
      const res = await send({
        method: prepared.method,
        url: prepared.url,
        headers: prepared.headers,
        body: prepared.body,
        timeoutMs: perRequestTimeout,
        maxResponseBytes: 1024 * 1024,
        redirect: 'manual',
        tls: prepared.tls,
        proxy: prepared.proxy,
        digest: prepared.digest,
        agent,
        prevalidated: true,
      });
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      latencies.push(ms);
      statuses[String(res.status)] = (statuses[String(res.status)] ?? 0) + 1;
      const ok = opts.expectStatus?.length ? opts.expectStatus.includes(res.status) : res.status < 400;
      if (!ok) unexpected++;
    } catch (e) {
      const msg = (e as Error).message.slice(0, 200);
      errors.set(msg, (errors.get(msg) ?? 0) + 1);
    } finally {
      completed++;
      inFlight--;
    }
  };

  if (opts.mode === 'concurrency') {
    const worker = async () => {
      while (Date.now() < deadline && sent < opts.maxRequests) await one();
    };
    await Promise.all(Array.from({ length: opts.concurrency }, worker));
  } else {
    const interval = 1000 / opts.rps;
    const maxInFlight = Math.min(512, opts.rps * 4);
    let next = Date.now();
    while (Date.now() < deadline && sent + dropped < opts.maxRequests) {
      const now = Date.now();
      if (now < next) {
        await new Promise((r) => setTimeout(r, Math.min(next - now, 50)));
        continue;
      }
      next += interval;
      if (inFlight >= maxInFlight) {
        dropped++;
        continue;
      }
      void one();
    }
    // Drain: every request is bounded by its own timeout.
    const drainUntil = Date.now() + perRequestTimeout + 1000;
    while (inFlight > 0 && Date.now() < drainUntil) await new Promise((r) => setTimeout(r, 20));
  }
  agent.destroy();

  const elapsed = (Date.now() - started) / 1000;
  const sorted = latencies.slice().sort((a, b) => a - b);
  const errorCount = [...errors.values()].reduce((a, b) => a + b, 0);
  const failures = errorCount + unexpected;
  const mean = sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0;
  return ctx.redactor.scrub({
    target: { method: prepared.method, url: prepared.url },
    config: {
      mode: opts.mode,
      ...(opts.mode === 'concurrency' ? { concurrency: opts.concurrency } : { targetRps: opts.rps }),
      durationSec: opts.durationSec,
      maxRequests: opts.maxRequests,
      expectStatus: opts.expectStatus,
    },
    summary: {
      requests: completed,
      elapsedSec: Math.round(elapsed * 100) / 100,
      throughputRps: elapsed > 0 ? Math.round((completed / elapsed) * 100) / 100 : 0,
      errorRate: completed ? `${((failures / completed) * 100).toFixed(2)}%` : 'n/a',
      transportErrors: errorCount,
      unexpectedStatus: unexpected,
      ...(dropped ? { droppedBecauseSaturated: dropped } : {}),
      stoppedBy: sent >= opts.maxRequests ? 'maxRequests' : 'duration',
    },
    latencyMs: {
      min: percentile(sorted, 0),
      mean: Math.round(mean * 100) / 100,
      p50: percentile(sorted, 50),
      p90: percentile(sorted, 90),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
      max: sorted.length ? Math.round(sorted[sorted.length - 1] * 100) / 100 : 0,
    },
    statusCodes: statuses,
    errors: [...errors.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([message, count]) => ({ message, count })),
  });
}
