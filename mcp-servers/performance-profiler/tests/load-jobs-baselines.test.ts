// SPDX-License-Identifier: MIT
/**
 * Load engine (against a local HTTP server), background jobs, run records,
 * baselines and regression comparison.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createServer, type Server } from 'http';
import type { AddressInfo } from 'net';
import { HttpRunner, Recorder, runLoad, validateLoadOptions } from '../src/load/engine.js';
import { parseThreshold } from '../src/load/thresholds.js';
import { prepareEndpoint, profileEndpoint } from '../src/live/endpoint.js';
import { clearJobs, getJob, listJobs, startJob, stopJob } from '../src/jobs/manager.js';
import { compareResults, listBaselines, loadRun, recordRun, saveBaseline } from '../src/results/store.js';
import { createRunDir } from '../src/utils/artifacts.js';

let server: Server;
let base: string;
let hits = 0;

beforeAll(async () => {
  server = createServer((req, res) => {
    hits++;
    if (req.url === '/slow') setTimeout(() => res.end('slow'), 30);
    else if (req.url === '/err') {
      res.statusCode = 500;
      res.end('boom');
    } else if (req.url === '/redirect-meta') {
      res.statusCode = 302;
      res.setHeader('location', 'http://169.254.169.254/latest/meta-data/');
      res.end();
    } else res.end('ok');
  });
  await new Promise<void>((r) => server.listen(0, 'localhost', r));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));
afterEach(() => clearJobs());

describe('load engine', () => {
  it('closed model runs exactly the requested iterations with the given concurrency', async () => {
    const runner = new HttpRunner();
    const rec = new Recorder();
    let inFlight = 0;
    let maxInFlight = 0;
    const stats = await runLoad(async (_vu, signal) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      rec.record('GET /slow', await runner.send({ method: 'GET', url: `${base}/slow`, timeoutMs: 5000 }, signal));
      inFlight--;
    }, rec, { model: 'closed', vus: 4, iterations: 20 });
    expect(stats.iterations).toBe(20);
    expect(rec.requests).toBe(20);
    expect(maxInFlight).toBe(4);
    const m = rec.finalize(stats.elapsedMs, [parseThreshold('p95<5000')]);
    expect(m.latency.p50).toBeGreaterThanOrEqual(25);
    expect(m.passed).toBe(true);
    expect(m.histogram.reduce((s, b) => s + b.count, 0)).toBe(20);
  });

  it('open model keeps a constant arrival rate independent of latency', async () => {
    const runner = new HttpRunner();
    const rec = new Recorder();
    const stats = await runLoad(async (_vu, signal) => {
      rec.record('GET /slow', await runner.send({ method: 'GET', url: `${base}/slow`, timeoutMs: 5000 }, signal));
    }, rec, { model: 'open', vus: 50, rate: 40, durationS: 1 });
    // 40/s for 1 s, even though each request takes 30 ms (a closed loop of 1 VU would do ~30)
    expect(stats.iterations).toBeGreaterThanOrEqual(36);
    expect(stats.iterations).toBeLessThanOrEqual(42);
    expect(stats.droppedIterations).toBe(0);
  });

  it('drops arrivals beyond maxVUs in flight and counts them', async () => {
    const runner = new HttpRunner();
    const rec = new Recorder();
    const stats = await runLoad(async (_vu, signal) => {
      rec.record('GET /slow', await runner.send({ method: 'GET', url: `${base}/slow`, timeoutMs: 5000 }, signal));
    }, rec, { model: 'open', vus: 1, rate: 200, durationS: 0.5 });
    expect(stats.droppedIterations).toBeGreaterThan(0);
  });

  it('counts HTTP errors and evaluates the error-rate threshold', async () => {
    const res = await profileEndpoint({ url: `${base}/err`, iterations: 5, warmupIterations: 0, thresholds: ['error_rate<1%'] });
    expect(res.errors.count).toBe(5);
    expect(res.statusCodes['500']).toBe(5);
    expect(res.passed).toBe(false);
  });

  it('enforces caps before starting', () => {
    process.env.PERF_PROFILER_MAX_VUS = '10';
    try {
      expect(() => validateLoadOptions({ model: 'closed', vus: 11, iterations: 1 })).toThrow(/PERF_PROFILER_MAX_VUS/);
      expect(() => validateLoadOptions({ model: 'closed', vus: 1 })).toThrow(/duration or iterations/);
      expect(() => validateLoadOptions({ model: 'open', vus: 1, durationS: 1 })).toThrow(/rate/);
    } finally {
      delete process.env.PERF_PROFILER_MAX_VUS;
    }
  });

  it('blocks SSRF targets and re-validates redirects', async () => {
    await expect(prepareEndpoint({ url: 'http://169.254.169.254/' })).rejects.toThrow(/SSRF/);
    const out = await new HttpRunner().send({ method: 'GET', url: `${base}/redirect-meta`, timeoutMs: 5000 });
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/SSRF/);
  });

  it('stops promptly when aborted', async () => {
    const runner = new HttpRunner();
    const rec = new Recorder();
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), 200);
    const t0 = Date.now();
    const stats = await runLoad(async (_vu, signal) => {
      rec.record('GET /', await runner.send({ method: 'GET', url: `${base}/`, timeoutMs: 5000 }, signal));
    }, rec, { model: 'closed', vus: 2, durationS: 30, signal: ctrl.signal });
    expect(stats.stoppedReason).toBe('aborted');
    expect(Date.now() - t0).toBeLessThan(3000);
  });
});

describe('background jobs', () => {
  it('runs, reports progress, and returns the result', async () => {
    const { jobId } = startJob('test', 'unit', async ({ setProgress }) => {
      setProgress({ step: 1 });
      await new Promise((r) => setTimeout(r, 100));
      return { answer: 42 };
    });
    const running = await getJob(jobId);
    expect(running.status).toBe('running');
    const done = await getJob(jobId, 5);
    expect(done.status).toBe('completed');
    expect(done.result).toEqual({ answer: 42 });
    expect(listJobs().map((j) => j.jobId)).toContain(jobId);
  });

  it('stop_job aborts a running job', async () => {
    const { jobId } = startJob('test', 'long', ({ signal }) => new Promise((resolve) => signal.addEventListener('abort', () => resolve('partial'))));
    const stopped = await stopJob(jobId);
    expect(stopped.status).toBe('stopped');
  });

  it('reports failures as failed, not completed', async () => {
    const { jobId } = startJob('test', 'fails', async () => {
      throw new Error('nope');
    });
    const j = await getJob(jobId, 5);
    expect(j.status).toBe('failed');
    expect(j.error).toBe('nope');
  });

  it('unknown jobs are an error', async () => {
    await expect(getJob('job-missing')).rejects.toThrow(/Unknown job/);
  });
});

describe('baselines and compare_results', () => {
  async function fakeRun(latency: number[], rps: number) {
    const { runId, dir } = await createRunDir('load');
    const sorted = [...latency].sort((a, b) => a - b);
    await recordRun(dir, {
      runId,
      kind: 'load',
      subject: 'GET /x',
      metrics: { latency_mean: latency.reduce((s, v) => s + v, 0) / latency.length, latency_p95: sorted[Math.floor(sorted.length * 0.95)], rps, error_rate: 0 },
      samples: { latency },
    });
    return runId;
  }

  it('saves a baseline, previews an overwrite, and flags a significant regression', async () => {
    const noise = (m: number) => Array.from({ length: 200 }, (_, i) => m + ((i * 7919) % 11) - 5);
    const baseRun = await fakeRun(noise(100), 500);
    const sameRun = await fakeRun(noise(100.5), 505);
    const slowRun = await fakeRun(noise(150), 300);

    const saved = await saveBaseline('api', baseRun);
    expect(saved.saved).toBe(true);
    const preview = await saveBaseline('api', slowRun);
    expect(preview.saved).toBe(false);
    expect(preview.dryRun).toBe(true);
    expect((await listBaselines()).baselines.find((b) => 'runId' in b && b.name === 'api')).toMatchObject({ runId: baseRun });

    const same = await compareResults('api', sameRun);
    expect(same.verdict).toBe('unchanged');

    const slow = await compareResults('api', slowRun);
    expect(slow.verdict).toBe('regression');
    expect(slow.regressions).toEqual(expect.arrayContaining(['latency_mean', 'latency_p95', 'rps']));
    expect(slow.metrics.find((m) => m.metric === 'latency_mean')?.significance?.significant).toBe(true);

    const over = await saveBaseline('api', slowRun, true);
    expect(over).toMatchObject({ saved: true, replaced: baseRun });
    expect((await loadRun(slowRun)).kind).toBe('load');
  });

  it('refuses to compare different kinds and bad names', async () => {
    const a = await fakeRun([1, 2, 3], 1);
    const { runId, dir } = await createRunDir('benchmark');
    await recordRun(dir, { runId, kind: 'benchmark', subject: 'x', metrics: { time_mean: 1 } });
    await expect(compareResults(a, runId)).rejects.toThrow(/Cannot compare/);
    await expect(saveBaseline('../evil', a)).rejects.toThrow(/Invalid baseline name/);
    await expect(compareResults('no-such-baseline', a)).rejects.toThrow(/No baseline/);
  });
});

describe('hits sanity', () => {
  it('the test server was actually exercised', () => {
    expect(hits).toBeGreaterThan(50);
  });
});
