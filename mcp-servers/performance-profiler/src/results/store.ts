// SPDX-License-Identifier: MIT
/**
 * Run records, named baselines and regression comparison.
 *
 * Every measuring tool records its result (plus raw samples where they exist)
 * under `<output>/runs/<runId>-<kind>/result.json`. `save_baseline` copies a
 * run to `<output>/baselines/<name>.json`; `compare_results` compares a later
 * run against a baseline (or another run) metric by metric, using Welch's
 * t-test when both sides have raw samples so noise is not called a regression.
 */

import { copyFile, mkdir, readdir, readFile, stat, writeFile } from 'fs/promises';
import { join } from 'path';
import { outputRoot } from '../utils/env.js';
import { isValidRunId } from '../utils/artifacts.js';
import { round, welchTTest } from '../utils/statistics.js';

export type RunKind = 'cpu_profile' | 'benchmark' | 'function' | 'memory' | 'startup' | 'load' | 'web_vitals';

export interface RunRecord {
  runId: string;
  kind: RunKind;
  createdAt: string;
  /** Short human label (script, URL, flow). */
  subject: string;
  /** Comparable scalar metrics. */
  metrics: Record<string, number>;
  /** Raw samples for significance testing, keyed like metrics (e.g. `latency`). */
  samples?: Record<string, number[]>;
}

const MAX_SAMPLES = 200_000;

export async function recordRun(dir: string, rec: Omit<RunRecord, 'createdAt'>): Promise<string> {
  const record: RunRecord = { ...rec, createdAt: new Date().toISOString() };
  if (record.samples) {
    for (const k of Object.keys(record.samples)) {
      if (record.samples[k].length > MAX_SAMPLES) record.samples[k] = record.samples[k].slice(0, MAX_SAMPLES);
    }
  }
  const path = join(dir, 'result.json');
  await writeFile(path, JSON.stringify(record));
  return path;
}

async function findRunFile(runId: string): Promise<string> {
  if (!isValidRunId(runId)) throw new Error(`Invalid runId "${runId}"`);
  const runsDir = join(outputRoot(), 'runs');
  let entries: string[] = [];
  try {
    entries = await readdir(runsDir);
  } catch {
    // none yet
  }
  const dir = entries.find((e) => e.startsWith(runId));
  if (!dir) throw new Error(`Run ${runId} not found under ${runsDir}`);
  const path = join(runsDir, dir, 'result.json');
  try {
    await stat(path);
  } catch {
    throw new Error(`Run ${runId} has no recorded result (${path}); it may have failed.`);
  }
  return path;
}

export async function loadRun(runId: string): Promise<RunRecord> {
  return JSON.parse(await readFile(await findRunFile(runId), 'utf-8')) as RunRecord;
}

function baselineDir(): string {
  return join(outputRoot(), 'baselines');
}

function baselinePath(name: string): string {
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(name) || name.startsWith('.')) {
    throw new Error(`Invalid baseline name "${name}" (letters, digits, . _ - ; max 80)`);
  }
  return join(baselineDir(), `${name}.json`);
}

export async function saveBaseline(name: string, runId: string, overwrite = false) {
  const src = await findRunFile(runId);
  const dest = baselinePath(name);
  let existing: RunRecord | undefined;
  try {
    existing = JSON.parse(await readFile(dest, 'utf-8')) as RunRecord;
  } catch {
    // no existing baseline
  }
  const incoming = JSON.parse(await readFile(src, 'utf-8')) as RunRecord;
  if (existing && !overwrite) {
    return {
      saved: false,
      dryRun: true,
      message: `Baseline "${name}" exists (run ${existing.runId}, ${existing.kind}, ${existing.createdAt}). Pass overwrite: true to replace it with run ${runId}.`,
      wouldReplace: { runId: existing.runId, kind: existing.kind, subject: existing.subject },
      with: { runId: incoming.runId, kind: incoming.kind, subject: incoming.subject },
      path: dest,
    };
  }
  await mkdir(baselineDir(), { recursive: true });
  await copyFile(src, dest);
  return { saved: true, name, path: dest, runId: incoming.runId, kind: incoming.kind, subject: incoming.subject, replaced: existing?.runId };
}

export async function listBaselines() {
  let files: string[] = [];
  try {
    files = (await readdir(baselineDir())).filter((f) => f.endsWith('.json'));
  } catch {
    return { directory: baselineDir(), baselines: [] };
  }
  const baselines = [];
  for (const f of files.sort()) {
    try {
      const r = JSON.parse(await readFile(join(baselineDir(), f), 'utf-8')) as RunRecord;
      baselines.push({ name: f.slice(0, -5), runId: r.runId, kind: r.kind, subject: r.subject, createdAt: r.createdAt, metrics: r.metrics });
    } catch {
      baselines.push({ name: f.slice(0, -5), error: 'unreadable baseline file' });
    }
  }
  return { directory: baselineDir(), baselines };
}

async function resolveRef(ref: string): Promise<RunRecord> {
  if (isValidRunId(ref)) return loadRun(ref);
  try {
    return JSON.parse(await readFile(baselinePath(ref), 'utf-8')) as RunRecord;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') throw new Error(`No baseline named "${ref}" (and it is not a runId)`);
    throw e;
  }
}

/** Metrics where a larger value is better; everything else is lower-is-better. */
const HIGHER_IS_BETTER = /(^|_)(rps|ops_per_sec|throughput|score)$/;

export interface MetricComparison {
  metric: string;
  baseline: number;
  current: number;
  changePct: number;
  status: 'regression' | 'improvement' | 'unchanged';
  significance?: { pValue: number; significant: boolean };
}

export async function compareResults(baselineRef: string, currentRef: string, tolerancePct = 5) {
  const base = await resolveRef(baselineRef);
  const cur = await resolveRef(currentRef);
  if (base.kind !== cur.kind) {
    throw new Error(`Cannot compare a ${base.kind} run with a ${cur.kind} run`);
  }
  const rows: MetricComparison[] = [];
  for (const metric of Object.keys(base.metrics)) {
    const b = base.metrics[metric];
    const c = cur.metrics[metric];
    if (typeof b !== 'number' || typeof c !== 'number' || !Number.isFinite(b) || !Number.isFinite(c)) continue;
    const changePct = b !== 0 ? round(((c - b) / Math.abs(b)) * 100, 2) : c === 0 ? 0 : 100;
    const higherBetter = HIGHER_IS_BETTER.test(metric);
    const worse = higherBetter ? changePct < -tolerancePct : changePct > tolerancePct;
    const better = higherBetter ? changePct > tolerancePct : changePct < -tolerancePct;
    const row: MetricComparison = { metric, baseline: b, current: c, changePct, status: worse ? 'regression' : better ? 'improvement' : 'unchanged' };
    // Significance: samples keyed by the metric's family (e.g. latency_p95 → latency).
    const family = metric.split('_')[0];
    const sb = base.samples?.[family];
    const sc = cur.samples?.[family];
    if (sb && sc && sb.length >= 2 && sc.length >= 2 && /mean|median|p\d+/.test(metric)) {
      const w = welchTTest(sb, sc);
      row.significance = { pValue: w.pValue, significant: w.significant };
      if (row.status !== 'unchanged' && !w.significant) row.status = 'unchanged';
    }
    rows.push(row);
  }
  const regressions = rows.filter((r) => r.status === 'regression');
  const improvements = rows.filter((r) => r.status === 'improvement');
  return {
    kind: base.kind,
    baseline: { ref: baselineRef, runId: base.runId, subject: base.subject, createdAt: base.createdAt },
    current: { ref: currentRef, runId: cur.runId, subject: cur.subject, createdAt: cur.createdAt },
    tolerancePct,
    verdict: regressions.length > 0 ? 'regression' : improvements.length > 0 ? 'improved' : 'unchanged',
    passed: regressions.length === 0,
    regressions: regressions.map((r) => r.metric),
    metrics: rows,
  };
}
