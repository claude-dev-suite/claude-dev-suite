// SPDX-License-Identifier: MIT
/**
 * stress_test_flow: load-test a recorded flow on the shared load engine.
 * One iteration = one pass through the flow's requests (with captures).
 */

import { loadFlow, type Flow } from './storage.js';
import { buildUrl, captureFromResponse, substituteInObject } from '../utils/http-client.js';
import { createRunDir } from '../utils/artifacts.js';
import { redactUrl } from '../utils/redact.js';
import { HttpRunner, Recorder, runLoad, validateLoadOptions, type LoadOptions } from '../load/engine.js';
import { parseThreshold, type Threshold } from '../load/thresholds.js';
import { recordRun } from '../results/store.js';

export interface StressTestInput {
  flowName: string;
  users: number;
  duration: number;
  rampUp?: number;
  baseUrl?: string;
  variables?: Record<string, string>;
  thinkTime?: number;
  timeout?: number;
  /** Open model: flow iterations started per second (users = max in flight). */
  arrivalRate?: number;
  /** Closed model: ceiling on flow iterations per second. */
  maxRate?: number;
  thresholds?: string[];
  signal?: AbortSignal;
}

export interface PreparedStress {
  flow: Flow;
  baseUrl: string;
  opts: LoadOptions;
  thresholds: Threshold[];
  runner: HttpRunner;
}

export async function prepareStressTest(input: StressTestInput): Promise<PreparedStress> {
  const flow = await loadFlow(input.flowName);
  if (flow.requests.length === 0) throw new Error(`Flow "${input.flowName}" has no requests`);
  const baseUrl = input.baseUrl || flow.baseUrl;
  const opts: LoadOptions = {
    model: input.arrivalRate !== undefined ? 'open' : 'closed',
    vus: input.users,
    rate: input.arrivalRate,
    maxRate: input.maxRate,
    durationS: input.duration,
    rampUpS: input.rampUp ?? 5,
    thinkTimeMs: 0,
    signal: input.signal,
  };
  validateLoadOptions(opts, flow.requests.length);
  const thresholds = (input.thresholds ?? []).map(parseThreshold);
  const runner = new HttpRunner();
  await runner.preflight(buildUrl(baseUrl, '/'));
  return { flow, baseUrl, opts, thresholds, runner };
}

export async function stressTestFlow(input: StressTestInput, prepared?: PreparedStress, rec = new Recorder()) {
  const { flow, baseUrl, opts, thresholds, runner } = prepared ?? (await prepareStressTest(input));
  const baseVars = { ...flow.variables, ...(input.variables ?? {}) };
  const thinkTime = input.thinkTime ?? 0;
  const timeout = input.timeout ?? 30_000;

  const run = await runLoad(async (_vu, signal) => {
    const vars = { ...baseVars };
    for (const req of flow.requests) {
      if (signal.aborted) return;
      const path = substituteInObject(req.path, vars);
      const outcome = await runner.send(
        {
          method: req.method,
          url: buildUrl(baseUrl, path),
          headers: substituteInObject(req.headers, vars),
          body: req.body !== undefined ? substituteInObject(req.body, vars) : undefined,
          timeoutMs: timeout,
          wantJson: !!req.captureResponse,
        },
        signal
      );
      rec.record(`${req.method} ${req.path}`, outcome);
      if (req.captureResponse && outcome.json !== undefined) Object.assign(vars, captureFromResponse(outcome.json, req.captureResponse));
      if (thinkTime > 0) await new Promise((r) => setTimeout(r, thinkTime));
    }
  }, rec, opts);

  const metrics = rec.finalize(run.elapsedMs, thresholds);
  const { runId, dir } = await createRunDir('load');
  await recordRun(dir, {
    runId, kind: 'load', subject: `flow ${flow.name}`,
    metrics: {
      latency_mean: metrics.latency.mean, latency_p50: metrics.latency.p50, latency_p95: metrics.latency.p95,
      latency_p99: metrics.latency.p99, rps: metrics.summary.requestsPerSecond, error_rate: metrics.errors.rate,
    },
    samples: { latency: rec.latencies },
  });
  return {
    runId,
    flowName: flow.name,
    baseUrl: redactUrl(baseUrl),
    model: opts.model,
    config: {
      users: opts.vus,
      duration: opts.durationS,
      rampUp: opts.rampUpS,
      ...(opts.rate !== undefined ? { arrivalRate: opts.rate } : {}),
      ...(opts.maxRate !== undefined ? { maxRate: opts.maxRate } : {}),
      thinkTime,
    },
    flowIterations: run.iterations,
    droppedIterations: run.droppedIterations,
    stoppedReason: run.stoppedReason,
    ...metrics,
    iterationsPerSecond: Math.round((run.iterations / Math.max(run.elapsedMs / 1000, 0.001)) * 100) / 100,
  };
}
