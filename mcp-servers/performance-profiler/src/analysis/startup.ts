// SPDX-License-Identifier: MIT
/**
 * Startup time = spawn → ready, where "ready" is a real signal:
 *  - readyPort: a TCP connect to localhost:<port> succeeds;
 *  - readyLogPattern: a stdout/stderr line matches a regex;
 *  - readyUrl: an HTTP GET returns 2xx (SSRF-validated).
 * Without one, the time to process exit is measured and labelled as such —
 * the old tool always measured total run time and called it startup.
 */

import { connect } from 'net';
import { createRunDir } from '../utils/artifacts.js';
import { buildRunSpec, killTree, spawnProcess, validateScriptPath } from '../utils/process.js';
import { validateUrl } from '../utils/ssrf.js';
import { round, summarize } from '../utils/statistics.js';
import { recordRun } from '../results/store.js';
import type { Runtime, StartupMeasurement, StartupResult } from '../types.js';

export interface StartupOptions {
  runs: number;
  args?: string[];
  readyPort?: number;
  readyLogPattern?: string;
  readyUrl?: string;
  timeoutS: number;
  signal?: AbortSignal;
}

function portOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = connect({ host: '127.0.0.1', port });
    const done = (ok: boolean) => {
      s.destroy();
      resolve(ok);
    };
    s.once('connect', () => done(true));
    s.once('error', () => done(false));
    s.setTimeout(500, () => done(false));
  });
}

async function httpReady(url: string): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 1000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, redirect: 'manual' });
    await r.arrayBuffer().catch(() => undefined);
    return r.status >= 200 && r.status < 300;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

/** Compile a user regex defensively (length cap; matched against capped lines). */
export function compileReadyPattern(p: string): RegExp {
  if (p.length > 200) throw new Error('readyLogPattern must be at most 200 characters');
  try {
    return new RegExp(p);
  } catch (e) {
    throw new Error(`Invalid readyLogPattern: ${e instanceof Error ? e.message : e}`);
  }
}

export async function measureStartup(runtime: Runtime, scriptPath: string, opts: StartupOptions): Promise<StartupResult> {
  validateScriptPath(scriptPath);
  if (!Number.isInteger(opts.runs) || opts.runs < 1 || opts.runs > 50) throw new Error('runs must be an integer in [1, 50]');
  const modes = [opts.readyPort !== undefined, !!opts.readyLogPattern, !!opts.readyUrl].filter(Boolean).length;
  if (modes > 1) throw new Error('Pass only one of readyPort, readyLogPattern, readyUrl');
  const mode: StartupResult['mode'] = opts.readyPort !== undefined ? 'port' : opts.readyLogPattern ? 'log' : opts.readyUrl ? 'http' : 'exit';
  const pattern = opts.readyLogPattern ? compileReadyPattern(opts.readyLogPattern) : undefined;
  if (opts.readyUrl) await validateUrl(opts.readyUrl);
  if (mode === 'port' && (await portOpen(opts.readyPort!))) {
    throw new Error(`Port ${opts.readyPort} is already open before the app starts; stop whatever is listening there first.`);
  }
  const spec = await buildRunSpec(runtime, scriptPath, opts.args ?? []);
  const runs: StartupMeasurement[] = [];

  for (let i = 0; i < opts.runs; i++) {
    if (opts.signal?.aborted) break;
    let readyAt: number | undefined;
    let pid: number | undefined;
    const start = performance.now();
    const markReady = () => {
      if (readyAt === undefined) readyAt = performance.now() - start;
    };
    const res = await spawnProcess(spec.cmd, spec.args, {
      cwd: spec.cwd,
      timeout: opts.timeoutS * 1000,
      signal: opts.signal,
      maxOutputBytes: 256 * 1024,
      onSpawn: (p) => (pid = p),
      onLine: pattern ? (line) => { if (pattern.test(line.slice(0, 4096))) markReady(); } : undefined,
      pollMs: 25,
      stopWhen:
        mode === 'exit'
          ? undefined
          : async () => {
              if (readyAt !== undefined) return true;
              if (mode === 'port' && (await portOpen(opts.readyPort!))) markReady();
              else if (mode === 'http' && (await httpReady(opts.readyUrl!))) markReady();
              return readyAt !== undefined;
            },
    });
    if (pid) await killTree(pid);
    if (mode === 'exit') {
      const ok = res.exitCode === 0 && !res.timedOut;
      runs.push({ run: i + 1, totalTime: round(res.duration, 2), ready: ok, ...(ok ? {} : { error: res.spawnError ?? (res.timedOut ? 'timed out' : `exit code ${res.exitCode}`) }) });
    } else if (readyAt !== undefined) {
      runs.push({ run: i + 1, totalTime: round(readyAt, 2), ready: true });
    } else {
      runs.push({
        run: i + 1, totalTime: round(res.duration, 2), ready: false,
        error: res.spawnError ?? (res.timedOut ? `not ready within ${opts.timeoutS}s` : `process exited (code ${res.exitCode}) before becoming ready`),
      });
    }
    // Let the port be released before the next run.
    if (mode === 'port') {
      for (let k = 0; k < 40 && (await portOpen(opts.readyPort!)); k++) await new Promise((r) => setTimeout(r, 100));
    }
  }

  const ok = runs.filter((r) => r.ready).map((r) => r.totalTime);
  if (ok.length === 0) {
    throw new Error(`No run reached readiness: ${runs.map((r) => `#${r.run} ${r.error}`).join('; ')}`);
  }
  const stats = summarize(ok, { removeOutliers: false, decimals: 2 });
  const warm = runs.slice(1).filter((r) => r.ready).map((r) => r.totalTime);
  const { runId, dir } = await createRunDir('startup');
  await recordRun(dir, {
    runId, kind: 'startup', subject: scriptPath,
    metrics: { startup_mean: stats.mean, startup_median: stats.median, startup_p95: stats.p95 },
    samples: { startup: ok },
  });
  return {
    runId,
    runtime,
    mode,
    runs,
    summary: {
      ...stats,
      coldStart: runs[0].ready ? runs[0].totalTime : NaN,
      warmStart: warm.length ? round(warm.reduce((s, v) => s + v, 0) / warm.length, 2) : NaN,
      failedRuns: runs.length - ok.length,
    },
  };
}
