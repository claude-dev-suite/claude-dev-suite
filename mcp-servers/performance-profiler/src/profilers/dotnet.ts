// SPDX-License-Identifier: MIT
/**
 * .NET profiling via the diagnostics global tools, when installed:
 *  - CPU: `dotnet-trace collect --format Speedscope` (parsed as speedscope);
 *  - memory: `dotnet-counters collect --format json` (GC heap size series).
 * Both attach to a PID; for a script we launch it and attach, so the runtime
 * startup itself is not in the profile.
 */

import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import { createRunDir } from '../utils/artifacts.js';
import { buildRunSpec, commandAvailable, isPidAlive, killTree, runCommand, spawnProcess, validateScriptPath } from '../utils/process.js';
import { mean, round } from '../utils/statistics.js';
import { fromSpeedscope } from '../profile/model.js';
import { buildCpuReport, writeCpuArtifacts } from '../profile/report.js';
import { recordRun } from '../results/store.js';
import { assessLeak } from '../memory/leak.js';
import { checkDuration, failureDetail, type CpuProfileOptions } from './common.js';
import { cpuMetrics } from './nodejs.js';
import type { MemoryAnalysisResult, ProfileScriptResult } from '../types.js';

function requireDll(scriptPath: string): void {
  if (!scriptPath.toLowerCase().endsWith('.dll')) {
    throw new Error(
      '.NET profiling needs the built application .dll (dotnet build -c Release, then pass bin/Release/<tfm>/<App>.dll): ' +
        '`dotnet run` hosts the app in a child process, so the traced PID would be the SDK, not your app.'
    );
  }
}

function hhmmss(totalS: number): string {
  const s = Math.max(1, Math.round(totalS));
  const p = (n: number) => String(n).padStart(2, '0');
  return `00:${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}

async function requireTool(tool: 'dotnet-trace' | 'dotnet-counters'): Promise<void> {
  if (!(await commandAvailable(tool, ['--version']))) {
    throw new Error(`${tool} is not installed. Install it with: dotnet tool install --global ${tool}`);
  }
}

async function traceToProfile(pid: number, durationS: number, dir: string, limit: number, subject: string, signal?: AbortSignal) {
  const out = join(dir, 'trace.nettrace');
  let res = await runCommand(
    { cmd: 'dotnet-trace', args: ['collect', '--process-id', String(pid), '--format', 'Speedscope', '--duration', hhmmss(durationS), '--output', out] },
    { timeout: durationS * 1000 + 120_000, signal }
  );
  if (res.exitCode !== 0 && /not.*(found|running)|could not/i.test(res.stderr + res.stdout)) {
    // The runtime's diagnostics IPC may not be up yet right after launch.
    await new Promise((r) => setTimeout(r, 1500));
    res = await runCommand(
      { cmd: 'dotnet-trace', args: ['collect', '--process-id', String(pid), '--format', 'Speedscope', '--duration', hhmmss(durationS), '--output', out] },
      { timeout: durationS * 1000 + 120_000, signal }
    );
  }
  const files = await readdir(dir);
  const ss = files.find((f) => f.endsWith('.speedscope.json'));
  if (!ss) throw new Error(`dotnet-trace produced no speedscope file (${failureDetail(res)})`);
  const profile = fromSpeedscope(JSON.parse(await readFile(join(dir, ss), 'utf-8')), subject);
  if (profile.stacks.length === 0) throw new Error('The .NET trace contains no samples.');
  const report = buildCpuReport(profile, limit);
  const artifacts = { nettrace: out, dotnetSpeedscope: join(dir, ss), ...(await writeCpuArtifacts(profile, dir)) };
  return { profile, report, artifacts };
}

export async function profileScript(scriptPath: string, args: string[], opts: CpuProfileOptions): Promise<ProfileScriptResult> {
  validateScriptPath(scriptPath);
  requireDll(scriptPath);
  checkDuration(opts.durationS);
  await requireTool('dotnet-trace');
  const { runId, dir } = await createRunDir('dotnet-cpu');
  const spec = await buildRunSpec('dotnet', scriptPath, args);
  let pid: number | undefined;
  const proc = spawnProcess(spec.cmd, spec.args, { cwd: spec.cwd, timeout: opts.durationS * 1000 + 180_000, onSpawn: (p) => (pid = p), signal: opts.signal });
  await new Promise((r) => setTimeout(r, 1000));
  if (!pid || !isPidAlive(pid)) {
    const r = await proc;
    throw new Error(`.NET target exited before it could be traced (${failureDetail(r)})`);
  }
  try {
    const { report, artifacts } = await traceToProfile(pid, opts.durationS, dir, opts.limit, `dotnet ${scriptPath}`, opts.signal);
    await recordRun(dir, { runId, kind: 'cpu_profile', subject: scriptPath, metrics: cpuMetrics(report) });
    return {
      runId, runtime: 'dotnet', profiler: 'dotnet-trace', scriptPath, duration: opts.durationS, ...report, artifacts,
      notes: ['dotnet-trace attaches after the process starts, so runtime startup is not included. Times are thread-merged.'],
    };
  } finally {
    await killTree(pid);
    await proc;
  }
}

export async function traceAttach(pid: number, durationS: number, limit: number, signal?: AbortSignal): Promise<ProfileScriptResult> {
  checkDuration(durationS);
  await requireTool('dotnet-trace');
  if (!isPidAlive(pid)) throw new Error(`Process ${pid} is not running`);
  const { runId, dir } = await createRunDir('dotnet-attach');
  const { report, artifacts } = await traceToProfile(pid, durationS, dir, limit, `dotnet pid ${pid}`, signal);
  await recordRun(dir, { runId, kind: 'cpu_profile', subject: `pid ${pid}`, metrics: cpuMetrics(report) });
  return { runId, runtime: 'dotnet', profiler: 'dotnet-trace', scriptPath: `pid:${pid}`, duration: durationS, ...report, artifacts };
}

/**
 * Extract a GC-heap time series from `dotnet-counters collect --format json`
 * output. The file may be unterminated when the collector is stopped, so it is
 * scanned event by event instead of parsed as a whole.
 */
export function parseCountersJson(text: string): Array<{ t: number; used: number }> {
  const events: Array<{ ts: number; name: string; value: number }> = [];
  for (const m of text.matchAll(/\{[^{}]*?"name"\s*:\s*"([^"]+)"[^{}]*?\}/g)) {
    const obj = m[0];
    const ts = obj.match(/"timestamp"\s*:\s*"([^"]+)"/);
    const val = obj.match(/"value"\s*:\s*(-?[\d.]+(?:[eE][+-]?\d+)?)/);
    if (!ts || !val) continue;
    const t = Date.parse(ts[1].replace(' ', 'T'));
    if (Number.isNaN(t)) continue;
    events.push({ ts: t, name: m[1], value: Number(val[1]) });
  }
  const legacy = events.filter((e) => /^GC Heap Size/i.test(e.name));
  let series: Array<{ ts: number; bytes: number }>;
  if (legacy.length > 0) {
    series = legacy.map((e) => ({ ts: e.ts, bytes: e.value * (/\(MB\)/i.test(e.name) ? 1024 * 1024 : 1) }));
  } else {
    const byTs = new Map<number, number>();
    for (const e of events.filter((x) => /gc\..*heap\.size/i.test(x.name))) byTs.set(e.ts, (byTs.get(e.ts) ?? 0) + e.value);
    series = [...byTs.entries()].map(([ts, bytes]) => ({ ts, bytes }));
  }
  series.sort((a, b) => a.ts - b.ts);
  const t0 = series[0]?.ts ?? 0;
  return series.map((s) => ({ t: s.ts - t0, used: s.bytes }));
}

export async function analyzeMemoryPid(
  pid: number,
  opts: { durationS: number; intervalMs: number; limit: number; subject?: string; signal?: AbortSignal }
): Promise<MemoryAnalysisResult> {
  checkDuration(opts.durationS);
  await requireTool('dotnet-counters');
  if (!isPidAlive(pid)) throw new Error(`Process ${pid} is not running`);
  const { runId, dir } = await createRunDir('dotnet-memory');
  const out = join(dir, 'counters.json');
  const started = Date.now();
  const res = await spawnProcess(
    'dotnet-counters',
    ['collect', '--process-id', String(pid), '--format', 'json', '--output', out, '--refresh-interval', String(Math.max(1, Math.round(opts.intervalMs / 1000))), '--counters', 'System.Runtime'],
    { timeout: opts.durationS * 1000 + 60_000, stopWhen: () => Date.now() - started >= opts.durationS * 1000, signal: opts.signal }
  );
  let text = '';
  try {
    text = await readFile(out, 'utf-8');
  } catch {
    throw new Error(`dotnet-counters produced no output (${failureDetail(res)})`);
  }
  const samples = parseCountersJson(text);
  if (samples.length === 0) throw new Error('dotnet-counters recorded no GC heap size values.');
  const used = samples.map((s) => s.used);
  const warmupMs = Math.min(opts.intervalMs * 2, opts.durationS * 1000 * 0.2);
  const leak = assessLeak(samples, { warmupMs, forcedGc: false });
  const result: MemoryAnalysisResult = {
    runId,
    runtime: 'dotnet',
    target: opts.subject ?? `pid ${pid}`,
    snapshots: samples.map((s) => ({ timestamp: s.t, heapUsed: s.used, heapTotal: s.used })),
    snapshotsTruncated: false,
    summary: {
      initialHeap: used[0], finalHeap: used[used.length - 1], peakHeap: Math.max(...used), avgHeap: round(mean(used), 0),
      heapGrowth: used[used.length - 1] - used[0], measuredProcess: `pid ${pid} (dotnet-counters)`, forcedGcBeforeSamples: false,
    },
    potentialLeaks: { ...leak, detected: leak.verdict === 'likely-leak' },
    artifacts: { counters: out },
    notes: ['GC heap size as reported by the runtime counters (not forced GC), so the verdict tolerates GC timing noise less well. Use dotnet-gcdump for type-level diffs.'],
  };
  await recordRun(dir, { runId, kind: 'memory', subject: result.target, metrics: { heap_final: result.summary.finalHeap, heap_peak: result.summary.peakHeap, heap_growth_rate: leak.growthRate } });
  return result;
}

export async function analyzeMemory(
  scriptPath: string,
  opts: { durationS: number; intervalMs: number; limit: number; args?: string[]; signal?: AbortSignal }
): Promise<MemoryAnalysisResult> {
  validateScriptPath(scriptPath);
  requireDll(scriptPath);
  checkDuration(opts.durationS);
  await requireTool('dotnet-counters');
  const spec = await buildRunSpec('dotnet', scriptPath, opts.args ?? []);
  let pid: number | undefined;
  const proc = spawnProcess(spec.cmd, spec.args, { cwd: spec.cwd, timeout: opts.durationS * 1000 + 180_000, onSpawn: (p) => (pid = p), signal: opts.signal });
  await new Promise((r) => setTimeout(r, 1000));
  if (!pid || !isPidAlive(pid)) {
    const r = await proc;
    throw new Error(`.NET target exited before it could be observed (${failureDetail(r)})`);
  }
  try {
    return await analyzeMemoryPid(pid, { ...opts, subject: scriptPath });
  } finally {
    await killTree(pid);
    await proc;
  }
}
