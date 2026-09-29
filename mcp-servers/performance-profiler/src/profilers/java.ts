// SPDX-License-Identifier: MIT
/**
 * Java profiling with JFR and jcmd.
 *
 * Fixes over the previous implementation (all verified against JDK 21):
 *  - `jfr print --json` nests events under `recording.events`; the old parser
 *    read `data.events` and always returned an empty profile.
 *  - `jfr print` truncates stacks to 5 frames unless `--stack-depth` is given,
 *    which made total time meaningless; we pass 64 and report truncation.
 *  - Self time is the top frame only; total time counts each method once per
 *    sample — the old code counted every frame as self time.
 *  - A failing `jfr` is an error, not an empty "success".
 *  - Memory is measured on the PID we launched (or the PID given), not "the
 *    first JVM jcmd lists" through a POSIX shell pipe that broke on Windows.
 */

import { createReadStream } from 'fs';
import { access } from 'fs/promises';
import { createInterface } from 'readline';
import { join } from 'path';
import { createRunDir } from '../utils/artifacts.js';
import { buildRunSpec, commandAvailable, isPidAlive, killTree, runCommand, spawnProcess, validateScriptPath } from '../utils/process.js';
import { mean, round } from '../utils/statistics.js';
import { JfrTextParser, parseIsoDurationMs, type SampledProfile } from '../profile/model.js';
import { buildCpuReport, writeCpuArtifacts } from '../profile/report.js';
import { recordRun } from '../results/store.js';
import { assessLeak } from '../memory/leak.js';
import { checkDuration, failureDetail, targetInfo, type CpuProfileOptions } from './common.js';
import { cpuMetrics } from './nodejs.js';
import type { MemoryAnalysisResult, ProfileScriptResult } from '../types.js';

const STACK_DEPTH = 64;
/** jdk.ExecutionSample period in the JDK's `profile` settings. */
const PROFILE_SAMPLE_MS = 10;

async function requireJdkTool(tool: 'jfr' | 'jcmd'): Promise<void> {
  const args = tool === 'jfr' ? ['version'] : ['-h'];
  if (!(await commandAvailable(tool, args))) {
    throw new Error(`\`${tool}\` was not found on PATH. It ships with a full JDK (not a JRE); add $JAVA_HOME/bin to PATH.`);
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/** Stream `jfr print` text output through the JFR parser. */
export async function parseJfrRecording(jfrPath: string, dir: string): Promise<{ profile: SampledProfile; truncatedStacks: number }> {
  await requireJdkTool('jfr');
  const textPath = join(dir, 'execution-samples.txt');
  const res = await runCommand(
    { cmd: 'jfr', args: ['print', '--stack-depth', String(STACK_DEPTH), '--events', 'jdk.ExecutionSample', jfrPath] },
    { timeout: 180_000, stdoutFile: textPath }
  );
  if (res.exitCode !== 0) throw new Error(`jfr print failed: ${failureDetail(res)}`);
  const parser = new JfrTextParser('java', PROFILE_SAMPLE_MS);
  const rl = createInterface({ input: createReadStream(textPath, 'utf-8'), crlfDelay: Infinity });
  for await (const line of rl) parser.push(line);
  return parser.result();
}

export interface JfrBreakdown {
  gcPauseMs: number;
  gcCount: number;
  ioMs: number;
  ioEvents: number;
  lockMs: number;
  lockEvents: number;
}

/** Sum GC pauses, blocking I/O and monitor contention recorded by JFR. */
export async function jfrBreakdown(jfrPath: string): Promise<JfrBreakdown | null> {
  const res = await runCommand(
    {
      cmd: 'jfr',
      args: ['print', '--json', '--stack-depth', '1', '--events',
        'jdk.GarbageCollection,jdk.SocketRead,jdk.SocketWrite,jdk.FileRead,jdk.FileWrite,jdk.JavaMonitorEnter', jfrPath],
    },
    { timeout: 120_000, maxOutputBytes: 200 * 1024 * 1024 }
  );
  if (res.exitCode !== 0 || res.truncated) return null;
  try {
    const data = JSON.parse(res.stdout) as { recording?: { events?: Array<{ type: string; values?: { duration?: string; sumOfPauses?: string } }> } };
    const b: JfrBreakdown = { gcPauseMs: 0, gcCount: 0, ioMs: 0, ioEvents: 0, lockMs: 0, lockEvents: 0 };
    for (const ev of data.recording?.events ?? []) {
      const d = parseIsoDurationMs(ev.values?.sumOfPauses ?? ev.values?.duration ?? '');
      if (ev.type === 'jdk.GarbageCollection') {
        b.gcPauseMs += d;
        b.gcCount++;
      } else if (ev.type === 'jdk.JavaMonitorEnter') {
        b.lockMs += d;
        b.lockEvents++;
      } else {
        b.ioMs += d;
        b.ioEvents++;
      }
    }
    return b;
  } catch {
    return null;
  }
}

export async function profileScript(scriptPath: string, args: string[], opts: CpuProfileOptions): Promise<ProfileScriptResult> {
  validateScriptPath(scriptPath);
  checkDuration(opts.durationS);
  await requireJdkTool('jfr');
  const { runId, dir } = await createRunDir('java-cpu');
  const jfrPath = join(dir, 'cpu.jfr');
  const flags = [
    `-XX:StartFlightRecording=name=pp,filename=${jfrPath},settings=profile,dumponexit=true`,
    '-Xlog:jfr+startup=warning',
  ];
  const spec = await buildRunSpec('java', scriptPath, args, flags);
  let pid: number | undefined;
  const started = Date.now();
  let stoppedByDuration = false;
  const res = await spawnProcess(spec.cmd, spec.args, {
    cwd: spec.cwd,
    timeout: opts.durationS * 1000 + 60_000,
    onSpawn: (p) => (pid = p),
    signal: opts.signal,
    pollMs: 500,
    stopWhen: async () => {
      if (Date.now() - started < opts.durationS * 1000 || !pid) return false;
      // Still running after the duration: dump the recording, then stop it.
      const dump = await runCommand({ cmd: 'jcmd', args: [String(pid), 'JFR.dump', 'name=pp', `filename=${jfrPath}`] }, { timeout: 60_000 });
      stoppedByDuration = true;
      return dump.exitCode === 0 || !isPidAlive(pid);
    },
  });
  if (!(await exists(jfrPath))) {
    throw new Error(`The JVM produced no JFR recording (${failureDetail(res)})`);
  }
  const { profile, truncatedStacks } = await parseJfrRecording(jfrPath, dir);
  profile.name = `java ${scriptPath}`;
  if (profile.stacks.length === 0) {
    throw new Error('The JFR recording contains no execution samples (the program may have finished before sampling started).');
  }
  const report = buildCpuReport(profile, opts.limit);
  const artifacts = { jfr: jfrPath, ...(await writeCpuArtifacts(profile, dir)) };
  await recordRun(dir, { runId, kind: 'cpu_profile', subject: scriptPath, metrics: cpuMetrics(report) });
  const notes = [`JFR samples running Java threads every ~${PROFILE_SAMPLE_MS} ms; times are estimated from sample counts. Open cpu.jfr in JDK Mission Control for more.`];
  if (truncatedStacks > 0) notes.push(`${truncatedStacks} stack(s) deeper than ${STACK_DEPTH} frames were truncated; their total times are underestimated for outer frames.`);
  if (stoppedByDuration) notes.unshift(`Target was still running after ${opts.durationS}s and was stopped after dumping the recording.`);
  return {
    runId,
    runtime: 'java',
    profiler: 'jfr',
    scriptPath,
    duration: opts.durationS,
    ...report,
    artifacts,
    target: targetInfo(res, stoppedByDuration ? 'duration' : 'exit'),
    notes,
  };
}

// ---------------------------------------------------------------------------
// Memory: GC.heap_info time series + GC.class_histogram diff on the right PID
// ---------------------------------------------------------------------------

const UNIT: Record<string, number> = { K: 1024, M: 1024 ** 2, G: 1024 ** 3, B: 1 };

/** Parse `jcmd <pid> GC.heap_info` → used/committed bytes (G1, Parallel, Serial, ZGC, Shenandoah). */
export function parseHeapInfo(text: string): { used: number; total: number } | null {
  let used = 0;
  let total = 0;
  let found = false;
  // G1 / Parallel / Serial: "<name> total 524288K, used 18064K [...]" — one line per heap/generation.
  for (const m of text.matchAll(/^\s*(?!Metaspace|class space)[\w -]*?\btotal (\d+)([KMG]), used (\d+)([KMG])/gm)) {
    total += Number(m[1]) * UNIT[m[2]];
    used += Number(m[3]) * UNIT[m[4]];
    found = true;
  }
  if (found) return { used, total };
  // ZGC: " ZHeap   used 10M, capacity 20M, max capacity 4096M"; Shenandoah: "... 12345K max, 1024K soft max, 20480K committed, 5120K used"
  const z = text.match(/ZHeap\s+used (\d+)([KMG]), capacity (\d+)([KMG])/);
  if (z) return { used: Number(z[1]) * UNIT[z[2]], total: Number(z[3]) * UNIT[z[4]] };
  const sh = text.match(/(\d+)([KMG]) committed, (\d+)([KMG]) used/);
  if (sh) return { used: Number(sh[3]) * UNIT[sh[4]], total: Number(sh[1]) * UNIT[sh[2]] };
  return null;
}

export interface HistogramRow {
  className: string;
  instances: number;
  bytes: number;
}

/** Parse `jcmd <pid> GC.class_histogram`. */
export function parseClassHistogram(text: string): Map<string, HistogramRow> {
  const rows = new Map<string, HistogramRow>();
  for (const m of text.matchAll(/^\s*\d+:\s+(\d+)\s+(\d+)\s+(\S+)/gm)) {
    const className = m[3];
    const prev = rows.get(className);
    const row = { className, instances: Number(m[1]), bytes: Number(m[2]) };
    if (prev) {
      prev.instances += row.instances;
      prev.bytes += row.bytes;
    } else rows.set(className, row);
  }
  return rows;
}

export function diffHistograms(a: Map<string, HistogramRow>, b: Map<string, HistogramRow>, limit = 20) {
  const names = new Set([...a.keys(), ...b.keys()]);
  const rows = [...names].map((n) => {
    const x = a.get(n);
    const y = b.get(n);
    return {
      className: n,
      instancesBefore: x?.instances ?? 0,
      instancesAfter: y?.instances ?? 0,
      instancesDelta: (y?.instances ?? 0) - (x?.instances ?? 0),
      bytesBefore: x?.bytes ?? 0,
      bytesAfter: y?.bytes ?? 0,
      bytesDelta: (y?.bytes ?? 0) - (x?.bytes ?? 0),
    };
  });
  const growing = rows.filter((r) => r.bytesDelta > 0).sort((p, q) => q.bytesDelta - p.bytesDelta);
  const sum = (m: Map<string, HistogramRow>) => [...m.values()].reduce((s, r) => s + r.bytes, 0);
  const cap = Math.max(1, Math.min(limit, 200));
  return {
    kind: 'live-object class histogram (jcmd GC.class_histogram, after full GC)',
    totalBytesBefore: sum(a),
    totalBytesAfter: sum(b),
    netSizeDelta: sum(b) - sum(a),
    topGrowth: growing.slice(0, cap),
    truncated: growing.length > cap,
  };
}

async function jcmd(pid: number, ...cmd: string[]): Promise<string> {
  const r = await runCommand({ cmd: 'jcmd', args: [String(pid), ...cmd] }, { timeout: 60_000, maxOutputBytes: 64 * 1024 * 1024 });
  if (r.exitCode !== 0) throw new Error(`jcmd ${pid} ${cmd.join(' ')} failed: ${failureDetail(r)}`);
  return r.stdout;
}

/**
 * Sample heap usage of `pid` and diff class histograms between warm-up and
 * the end. Used for both a JVM we launched and an existing PID.
 */
async function observeJvm(
  pid: number,
  opts: { durationS: number; intervalMs: number; forceGc: boolean; warmupMs: number; limit: number; signal?: AbortSignal; isDone?: () => boolean }
) {
  const samples: Array<{ t: number; used: number; total: number }> = [];
  const t0 = Date.now();
  let hist1: Map<string, HistogramRow> | undefined;
  let hist2: Map<string, HistogramRow> | undefined;
  const errors: string[] = [];
  while (Date.now() - t0 < opts.durationS * 1000 && !opts.signal?.aborted && !opts.isDone?.() && isPidAlive(pid)) {
    try {
      if (!hist1 && Date.now() - t0 >= opts.warmupMs) hist1 = parseClassHistogram(await jcmd(pid, 'GC.class_histogram'));
      if (opts.forceGc) await jcmd(pid, 'GC.run');
      const h = parseHeapInfo(await jcmd(pid, 'GC.heap_info'));
      if (h) samples.push({ t: Date.now() - t0, ...h });
      else if (errors.length === 0) errors.push('Unrecognised GC.heap_info format');
    } catch (e) {
      if (!isPidAlive(pid)) break;
      if (errors.length < 3) errors.push(e instanceof Error ? e.message : String(e));
    }
    await new Promise((r) => setTimeout(r, opts.intervalMs));
  }
  if (hist1 && isPidAlive(pid)) {
    try {
      hist2 = parseClassHistogram(await jcmd(pid, 'GC.class_histogram'));
    } catch (e) {
      errors.push(`final histogram: ${e instanceof Error ? e.message : e}`);
    }
  }
  return { samples, diff: hist1 && hist2 ? diffHistograms(hist1, hist2, opts.limit) : undefined, errors };
}

function memoryResult(
  runId: string,
  subject: string,
  measured: string,
  obs: Awaited<ReturnType<typeof observeJvm>>,
  opts: { warmupMs: number; forceGc: boolean },
  notes: string[],
  artifacts: Record<string, string>
): MemoryAnalysisResult {
  if (obs.samples.length === 0) {
    throw new Error(`No heap samples could be taken from the JVM (${obs.errors.join('; ') || 'process ended too early'}).`);
  }
  const used = obs.samples.map((s) => s.used);
  const leak = assessLeak(obs.samples.map((s) => ({ t: s.t, used: s.used })), {
    warmupMs: opts.warmupMs, forcedGc: opts.forceGc, confirmBytes: obs.diff?.netSizeDelta,
  });
  if (obs.errors.length) notes.push(...obs.errors.map((e) => `jcmd: ${e}`));
  if (!obs.diff) notes.push('No class-histogram comparison (the JVM ended before the warm-up finished).');
  return {
    runId,
    runtime: 'java',
    target: subject,
    snapshots: obs.samples.map((s) => ({ timestamp: s.t, heapUsed: s.used, heapTotal: s.total })),
    snapshotsTruncated: false,
    summary: {
      initialHeap: used[0],
      finalHeap: used[used.length - 1],
      peakHeap: Math.max(...used),
      avgHeap: round(mean(used), 0),
      heapGrowth: used[used.length - 1] - used[0],
      measuredProcess: measured,
      forcedGcBeforeSamples: opts.forceGc,
    },
    potentialLeaks: { ...leak, detected: leak.verdict === 'likely-leak' },
    ...(obs.diff ? { diff: obs.diff } : {}),
    artifacts,
    ...(notes.length ? { notes } : {}),
  };
}

export async function analyzeMemory(
  scriptPath: string,
  opts: { durationS: number; intervalMs: number; forceGc: boolean; limit: number; args?: string[]; signal?: AbortSignal }
): Promise<MemoryAnalysisResult> {
  validateScriptPath(scriptPath);
  checkDuration(opts.durationS);
  await requireJdkTool('jcmd');
  const { runId, dir } = await createRunDir('java-memory');
  const spec = await buildRunSpec('java', scriptPath, opts.args ?? []);
  let pid: number | undefined;
  let exited = false;
  const proc = spawnProcess(spec.cmd, spec.args, {
    cwd: spec.cwd,
    timeout: opts.durationS * 1000 + 120_000,
    onSpawn: (p) => (pid = p),
    signal: opts.signal,
  }).finally(() => (exited = true));
  const warmupMs = Math.min(Math.max(opts.intervalMs * 2, opts.durationS * 1000 * 0.2), 10_000);
  // The attach listener needs the JVM to be up; give it a moment.
  await new Promise((r) => setTimeout(r, 500));
  if (!pid) {
    const res = await proc;
    throw new Error(`JVM did not start (${failureDetail(res)})`);
  }
  const obs = await observeJvm(pid, { ...opts, warmupMs, isDone: () => exited });
  const exitedOnItsOwn = exited;
  if (!exitedOnItsOwn) await killTree(pid);
  const res = await proc;
  const result = memoryResult(runId, scriptPath, `launched JVM (pid ${pid})`, obs, { warmupMs, forceGc: opts.forceGc },
    [exitedOnItsOwn ? `The JVM exited on its own (code ${res.exitCode}) after ${Math.round(res.duration / 1000)}s.` : `The JVM was stopped after ${opts.durationS}s.`], {});
  await recordRun(dir, {
    runId, kind: 'memory', subject: scriptPath,
    metrics: { heap_final: result.summary.finalHeap, heap_peak: result.summary.peakHeap, heap_growth_rate: result.potentialLeaks.growthRate },
  });
  return result;
}

export async function analyzeMemoryPid(
  pid: number,
  opts: { durationS: number; intervalMs: number; forceGc: boolean; limit: number; signal?: AbortSignal }
): Promise<MemoryAnalysisResult> {
  checkDuration(opts.durationS);
  await requireJdkTool('jcmd');
  if (!isPidAlive(pid)) throw new Error(`Process ${pid} is not running`);
  const { runId, dir } = await createRunDir('java-memory-attach');
  // An already-running JVM is past its warm-up: compare from the first sample.
  const warmupMs = 0;
  const obs = await observeJvm(pid, { ...opts, warmupMs });
  const result = memoryResult(runId, `pid ${pid}`, `existing JVM (pid ${pid})`, obs, { warmupMs, forceGc: opts.forceGc },
    ['Each sample runs jcmd (a short-lived JVM), so the effective sampling interval is at least ~0.5-1.5 s.'], {});
  await recordRun(dir, {
    runId, kind: 'memory', subject: `pid ${pid}`,
    metrics: { heap_final: result.summary.finalHeap, heap_peak: result.summary.peakHeap, heap_growth_rate: result.potentialLeaks.growthRate },
  });
  return result;
}

/** Start JFR on a running JVM, wait, and analyse the dump. */
export async function jfrAttach(pid: number, durationS: number, limit: number, signal?: AbortSignal): Promise<ProfileScriptResult & { breakdown?: JfrBreakdown | null }> {
  checkDuration(durationS);
  await requireJdkTool('jcmd');
  await requireJdkTool('jfr');
  if (!isPidAlive(pid)) throw new Error(`Process ${pid} is not running`);
  const { runId, dir } = await createRunDir('java-attach');
  const jfrPath = join(dir, 'cpu.jfr');
  const name = `pp-${runId}`;
  const start = await runCommand(
    { cmd: 'jcmd', args: [String(pid), 'JFR.start', `name=${name}`, 'settings=profile', `filename=${jfrPath}`] },
    { timeout: 30_000 }
  );
  if (start.exitCode !== 0 || /error|exception/i.test(start.stdout)) {
    throw new Error(`Failed to start JFR in PID ${pid}: ${start.stdout.trim() || failureDetail(start)}`);
  }
  try {
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, durationS * 1000);
      signal?.addEventListener('abort', () => {
        clearTimeout(t);
        resolve();
      }, { once: true });
    });
  } finally {
    await runCommand({ cmd: 'jcmd', args: [String(pid), 'JFR.stop', `name=${name}`, `filename=${jfrPath}`] }, { timeout: 60_000 });
  }
  if (!(await exists(jfrPath))) throw new Error(`JFR did not write ${jfrPath}`);
  const { profile, truncatedStacks } = await parseJfrRecording(jfrPath, dir);
  profile.name = `java pid ${pid}`;
  if (profile.stacks.length === 0) throw new Error(`No execution samples recorded from PID ${pid} in ${durationS}s (idle JVM?).`);
  const report = buildCpuReport(profile, limit);
  const artifacts = { jfr: jfrPath, ...(await writeCpuArtifacts(profile, dir)) };
  const breakdown = await jfrBreakdown(jfrPath);
  await recordRun(dir, { runId, kind: 'cpu_profile', subject: `pid ${pid}`, metrics: cpuMetrics(report) });
  return {
    runId, runtime: 'java', profiler: 'jfr', scriptPath: `pid:${pid}`, duration: durationS, ...report, artifacts, breakdown,
    notes: truncatedStacks > 0 ? [`${truncatedStacks} stack(s) truncated at ${STACK_DEPTH} frames.`] : undefined,
  };
}
