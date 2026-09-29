// SPDX-License-Identifier: MIT
/**
 * Node.js profiling: CPU (V8 sampling profiler via an in-process agent) and
 * memory (target-process heap samples, two heap snapshots and a sampling heap
 * profile), all measured inside the *target*.
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { createRunDir } from '../utils/artifacts.js';
import { buildRunSpec, cleanupTempDir, createTempDir, spawnProcess, validateScriptPath } from '../utils/process.js';
import { mean, round } from '../utils/statistics.js';
import { dropSamplesWithFrame, fromV8CpuProfile, type V8CpuProfile } from '../profile/model.js';
import { buildCpuReport, writeCpuArtifacts } from '../profile/report.js';
import { recordRun } from '../results/store.js';
import { assessLeak } from '../memory/leak.js';
import { diffSnapshots, parseSnapshotFile, summarizeHeapProfile } from '../memory/heap-snapshot.js';
import { AGENT_RESULT_FILE, writeNodeAgent, type NodeAgentResult } from './node-agent.js';
import { benchmark, profileFunction as profileFunctionImpl } from '../bench/benchmark.js';
import { checkDuration, failureDetail, targetInfo, type CpuProfileOptions } from './common.js';
import type { MemoryAnalysisResult, ProfileScriptResult } from '../types.js';

async function readAgentResult(dir: string): Promise<NodeAgentResult | null> {
  try {
    return JSON.parse(await readFile(join(dir, AGENT_RESULT_FILE), 'utf-8')) as NodeAgentResult;
  } catch {
    return null;
  }
}

/** Metrics recorded for regression comparison of a CPU profile. */
export function cpuMetrics(report: ReturnType<typeof buildCpuReport>): Record<string, number> {
  const m: Record<string, number> = { cpu_total_ms: report.summary.totalTime };
  for (const f of report.topFunctions.slice(0, 10)) m[`fn_self_pct:${f.name}`] = f.selfPercent;
  return m;
}

export async function profileScript(scriptPath: string, args: string[], opts: CpuProfileOptions): Promise<ProfileScriptResult> {
  validateScriptPath(scriptPath);
  checkDuration(opts.durationS);
  const { runId, dir } = await createRunDir('node-cpu');
  const agentDir = await createTempDir('pp-node-agent');
  try {
    const agent = await writeNodeAgent(agentDir, {
      outDir: dir,
      durationMs: opts.durationS * 1000,
      cpu: { intervalUs: opts.samplingIntervalUs ?? 500 },
    });
    const spec = await buildRunSpec('nodejs', scriptPath, args, ['--require', agent]);
    const res = await spawnProcess(spec.cmd, spec.args, {
      cwd: spec.cwd,
      timeout: opts.durationS * 1000 + 30_000,
      signal: opts.signal,
    });
    const agentResult = await readAgentResult(dir);
    if (!agentResult?.cpuProfile) {
      throw new Error(`Node target produced no CPU profile (${failureDetail(res)})${agentResult?.error ? `; agent: ${agentResult.error}` : ''}`);
    }
    const raw = JSON.parse(await readFile(join(dir, agentResult.cpuProfile), 'utf-8')) as V8CpuProfile;
    const profile = dropSamplesWithFrame(fromV8CpuProfile(raw, `node ${scriptPath}`), (f) => !!f.file?.endsWith('pp-agent.cjs'));
    if (profile.stacks.length === 0) {
      throw new Error(`CPU profile contains no samples (target ran ${agentResult.elapsedMs} ms); run a longer workload.`);
    }
    const report = buildCpuReport(profile, opts.limit);
    const artifacts = { cpuprofile: join(dir, agentResult.cpuProfile), ...(await writeCpuArtifacts(profile, dir)) };
    await recordRun(dir, { runId, kind: 'cpu_profile', subject: scriptPath, metrics: cpuMetrics(report) });
    return {
      runId,
      runtime: 'nodejs',
      profiler: 'v8-sampling',
      scriptPath,
      duration: opts.durationS,
      ...report,
      artifacts,
      target: targetInfo(res, agentResult.reason === 'duration' ? 'duration' : 'exit'),
      notes:
        agentResult.reason === 'duration'
          ? [`Target was still running after ${opts.durationS}s and was stopped; the profile covers that window.`]
          : undefined,
    };
  } finally {
    await cleanupTempDir(agentDir);
  }
}

export interface MemoryOptions {
  durationS: number;
  intervalMs: number;
  forceGc: boolean;
  snapshots: boolean;
  limit: number;
  args?: string[];
  signal?: AbortSignal;
}

export async function analyzeMemory(scriptPath: string, opts: MemoryOptions): Promise<MemoryAnalysisResult> {
  validateScriptPath(scriptPath);
  checkDuration(opts.durationS);
  const { runId, dir } = await createRunDir('node-memory');
  const agentDir = await createTempDir('pp-node-agent');
  const warmupMs = Math.min(Math.max(opts.intervalMs * 2, opts.durationS * 1000 * 0.2), 10_000);
  try {
    const agent = await writeNodeAgent(agentDir, {
      outDir: dir,
      durationMs: opts.durationS * 1000,
      memory: { intervalMs: opts.intervalMs, forceGc: opts.forceGc, snapshots: opts.snapshots, warmupMs, samplingHeap: true },
    });
    const flags = ['--require', agent, ...(opts.forceGc ? ['--expose-gc'] : [])];
    const spec = await buildRunSpec('nodejs', scriptPath, opts.args ?? [], flags);
    const res = await spawnProcess(spec.cmd, spec.args, {
      cwd: spec.cwd,
      timeout: opts.durationS * 1000 + 120_000,
      signal: opts.signal,
    });
    const ar = await readAgentResult(dir);
    if (!ar?.samples || ar.samples.length === 0) {
      throw new Error(`Node target produced no memory samples (${failureDetail(res)})${ar?.error ? `; agent: ${ar.error}` : ''}`);
    }
    return await buildNodeMemoryResult({
      runId, dir, subject: scriptPath, samples: ar.samples.map((s) => ({ ...s, t: s.t })),
      warmupMs, forcedGc: opts.forceGc && ar.gcExposed === true,
      snapshot1: ar.snapshot1 ? join(dir, ar.snapshot1) : undefined,
      snapshot2: ar.snapshot2 ? join(dir, ar.snapshot2) : undefined,
      heapProfile: ar.heapProfile ? join(dir, ar.heapProfile) : undefined,
      limit: opts.limit,
      measured: `target process (pid ${ar.pid}, measured in-process)`,
      notes: [
        ...(ar.reason === 'duration' ? [`Target was stopped after ${opts.durationS}s.`] : []),
        ...(ar.error ? [`Agent warning: ${ar.error.split('\n')[0]}`] : []),
        ...(opts.snapshots && !ar.snapshot1 ? [`Target exited before the ${Math.round(warmupMs)} ms warm-up, so no snapshot comparison.`] : []),
      ],
    });
  } finally {
    await cleanupTempDir(agentDir);
  }
}

/** Shared by the script mode and the inspector-attach mode. */
export async function buildNodeMemoryResult(input: {
  runId: string;
  dir: string;
  subject: string;
  samples: Array<{ t: number; heapUsed: number; heapTotal: number; rss?: number; external?: number }>;
  warmupMs: number;
  forcedGc: boolean;
  snapshot1?: string;
  snapshot2?: string;
  heapProfile?: string;
  limit: number;
  measured: string;
  notes: string[];
}): Promise<MemoryAnalysisResult> {
  const { samples } = input;
  const notes = [...input.notes];
  const artifacts: Record<string, string> = {};
  let diff: ReturnType<typeof diffSnapshots> | undefined;
  if (input.snapshot1 && input.snapshot2) {
    artifacts.snapshotBefore = input.snapshot1;
    artifacts.snapshotAfter = input.snapshot2;
    try {
      diff = diffSnapshots(await parseSnapshotFile(input.snapshot1), await parseSnapshotFile(input.snapshot2), input.limit);
    } catch (e) {
      notes.push(`Snapshot comparison skipped: ${e instanceof Error ? e.message : e}`);
    }
  } else if (input.snapshot2) {
    artifacts.snapshot = input.snapshot2;
  }
  let allocationSites: ReturnType<typeof summarizeHeapProfile> | undefined;
  if (input.heapProfile) {
    artifacts.heapProfile = input.heapProfile;
    try {
      allocationSites = summarizeHeapProfile(JSON.parse(await readFile(input.heapProfile, 'utf-8')), Math.min(input.limit, 30));
    } catch (e) {
      notes.push(`Sampling heap profile unreadable: ${e instanceof Error ? e.message : e}`);
    }
  }
  const heap = samples.map((s) => s.heapUsed);
  const leak = assessLeak(
    samples.map((s) => ({ t: s.t, used: s.heapUsed })),
    { warmupMs: input.warmupMs, forcedGc: input.forcedGc, confirmBytes: diff?.netSizeDelta }
  );
  const maxSnapshots = 200;
  const step = Math.ceil(samples.length / maxSnapshots);
  const series = samples
    .filter((_, i) => i % step === 0 || i === samples.length - 1)
    .map((s) => ({ timestamp: Math.round(s.t), heapUsed: s.heapUsed, heapTotal: s.heapTotal, rss: s.rss, external: s.external }));
  const result: MemoryAnalysisResult = {
    runId: input.runId,
    runtime: 'nodejs',
    target: input.subject,
    snapshots: series,
    snapshotsTruncated: step > 1,
    summary: {
      initialHeap: heap[0],
      finalHeap: heap[heap.length - 1],
      peakHeap: Math.max(...heap),
      avgHeap: round(mean(heap), 0),
      heapGrowth: heap[heap.length - 1] - heap[0],
      measuredProcess: input.measured,
      forcedGcBeforeSamples: input.forcedGc,
    },
    potentialLeaks: { ...leak, detected: leak.verdict === 'likely-leak' },
    ...(diff ? { diff } : {}),
    ...(allocationSites ? { allocationSites: { kind: 'live sampled allocations by site', ...allocationSites } } : {}),
    artifacts,
    ...(notes.length ? { notes } : {}),
  };
  await recordRun(input.dir, {
    runId: input.runId,
    kind: 'memory',
    subject: input.subject,
    metrics: { heap_final: result.summary.finalHeap, heap_peak: result.summary.peakHeap, heap_growth_rate: leak.growthRate },
  });
  return result;
}

// ---------------------------------------------------------------------------
// Back-compat entry points (the benchmark implementation lives in bench/)
// ---------------------------------------------------------------------------

/** @deprecated use bench/benchmark.ts `benchmark('nodejs', …)` */
export function benchmarkCode(codeOrPath: string, iterations = 1000, warmup = 100, isScriptPath = true) {
  return benchmark('nodejs', isScriptPath ? { scriptPath: codeOrPath } : { code: codeOrPath }, { iterations, warmup });
}

/** @deprecated use bench/benchmark.ts `profileFunction('nodejs', …)` */
export function profileFunction(modulePath: string, functionName: string, args: unknown[] = [], iterations = 100) {
  return profileFunctionImpl('nodejs', modulePath, functionName, args, iterations);
}
