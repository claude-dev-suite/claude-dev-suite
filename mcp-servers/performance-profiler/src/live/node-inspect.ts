// SPDX-License-Identifier: MIT
/**
 * Profile a running Node process through its inspector (`--inspect`), or
 * enable the inspector on a PID first (`process._debugProcess`, the mechanism
 * behind `node --inspect -p "process._debugProcess(pid)"`; works on Windows).
 */

import { createWriteStream } from 'fs';
import { join } from 'path';
import { createRunDir, writeArtifact } from '../utils/artifacts.js';
import { isPidAlive } from '../utils/process.js';
import { fromV8CpuProfile, type V8CpuProfile } from '../profile/model.js';
import { buildCpuReport, writeCpuArtifacts } from '../profile/report.js';
import { recordRun } from '../results/store.js';
import { checkDuration } from '../profilers/common.js';
import { buildNodeMemoryResult, cpuMetrics } from '../profilers/nodejs.js';
import { CdpClient, listInspectorTargets } from './cdp.js';
import type { MemoryAnalysisResult, ProfileScriptResult } from '../types.js';

export interface InspectorRef {
  host?: string;
  port?: number;
  pid?: number;
}

async function connect(ref: InspectorRef): Promise<{ client: CdpClient; where: string; enabled: boolean }> {
  const host = ref.host ?? '127.0.0.1';
  const port = ref.port ?? 9229;
  let enabled = false;
  if (ref.pid !== undefined && ref.port === undefined) {
    if (!isPidAlive(ref.pid)) throw new Error(`Process ${ref.pid} is not running`);
    try {
      await listInspectorTargets(host, port, 1000);
    } catch {
      const debugProcess = (process as unknown as { _debugProcess?: (pid: number) => void })._debugProcess;
      if (!debugProcess) throw new Error('This Node build cannot enable the inspector on another process; start the target with --inspect.');
      debugProcess(ref.pid);
      enabled = true;
      // The target opens its inspector asynchronously.
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 250));
        try {
          await listInspectorTargets(host, port, 1000);
          break;
        } catch {
          // keep polling
        }
      }
    }
  }
  const targets = await listInspectorTargets(host, port);
  const target = targets.find((t) => t.type === 'node') ?? targets[0];
  if (!target?.webSocketDebuggerUrl) {
    throw new Error(`Inspector at ${host}:${port} lists no debuggable target (is a debugger already attached?)`);
  }
  return { client: await CdpClient.connect(target.webSocketDebuggerUrl), where: `${host}:${port} (${target.title || target.url})`, enabled };
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      resolve();
    }, { once: true });
  });
}

export async function inspectorCpuProfile(
  ref: InspectorRef,
  durationS: number,
  limit: number,
  intervalUs = 500,
  signal?: AbortSignal
): Promise<ProfileScriptResult> {
  checkDuration(durationS);
  const { client, where, enabled } = await connect(ref);
  const { runId, dir } = await createRunDir('node-attach');
  try {
    await client.send('Profiler.enable');
    await client.send('Profiler.setSamplingInterval', { interval: intervalUs });
    await client.send('Profiler.start');
    await wait(durationS * 1000, signal);
    const { profile: raw } = await client.send<{ profile: V8CpuProfile }>('Profiler.stop', {}, 120_000);
    const cpuprofile = await writeArtifact(dir, 'cpu.cpuprofile', JSON.stringify(raw));
    const profile = fromV8CpuProfile(raw, `node ${where}`);
    if (profile.stacks.length === 0) throw new Error(`No CPU samples collected from ${where} in ${durationS}s.`);
    const report = buildCpuReport(profile, limit);
    const artifacts = { cpuprofile, ...(await writeCpuArtifacts(profile, dir)) };
    await recordRun(dir, { runId, kind: 'cpu_profile', subject: where, metrics: cpuMetrics(report) });
    return {
      runId, runtime: 'nodejs', profiler: 'v8-inspector', scriptPath: where, duration: durationS, ...report, artifacts,
      notes: [
        'Idle time appears as "(idle)"; a mostly-idle profile means the process was waiting for I/O or requests.',
        ...(enabled ? [`The inspector was enabled on PID ${ref.pid} (port ${ref.port ?? 9229}) and stays open until that process exits.`] : []),
      ],
    };
  } finally {
    await client.send('Profiler.disable').catch(() => {});
    client.close();
  }
}

async function takeSnapshot(client: CdpClient, path: string): Promise<void> {
  const stream = createWriteStream(path);
  const off = client.on('HeapProfiler.addHeapSnapshotChunk', (p: { chunk: string }) => stream.write(p.chunk));
  try {
    await client.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false }, 300_000);
  } finally {
    off();
    await new Promise<void>((r) => stream.end(r));
  }
}

export async function inspectorMemory(
  ref: InspectorRef,
  opts: { durationS: number; intervalMs: number; forceGc: boolean; snapshots: boolean; limit: number; signal?: AbortSignal }
): Promise<MemoryAnalysisResult> {
  checkDuration(opts.durationS);
  const { client, where, enabled } = await connect(ref);
  const { runId, dir } = await createRunDir('node-memory-attach');
  const samples: Array<{ t: number; heapUsed: number; heapTotal: number }> = [];
  let snapshot1: string | undefined;
  let snapshot2: string | undefined;
  let heapProfile: string | undefined;
  try {
    await client.send('HeapProfiler.enable');
    await client.send('HeapProfiler.startSampling', { samplingInterval: 32768 });
    const sample = async (t: number) => {
      if (opts.forceGc) await client.send('HeapProfiler.collectGarbage');
      const u = await client.send<{ usedSize: number; totalSize: number }>('Runtime.getHeapUsage');
      samples.push({ t, heapUsed: u.usedSize, heapTotal: u.totalSize });
    };
    const t0 = Date.now();
    if (opts.snapshots) {
      snapshot1 = join(dir, 'heap-1.heapsnapshot');
      await takeSnapshot(client, snapshot1);
    }
    while (Date.now() - t0 < opts.durationS * 1000 && !opts.signal?.aborted) {
      await sample(Date.now() - t0);
      await wait(opts.intervalMs, opts.signal);
    }
    await sample(Date.now() - t0);
    const { profile } = await client.send<{ profile: unknown }>('HeapProfiler.stopSampling', {}, 120_000);
    heapProfile = await writeArtifact(dir, 'heap.heapprofile', JSON.stringify(profile));
    if (opts.snapshots) {
      snapshot2 = join(dir, 'heap-2.heapsnapshot');
      await takeSnapshot(client, snapshot2);
    }
  } finally {
    await client.send('HeapProfiler.disable').catch(() => {});
    client.close();
  }
  return buildNodeMemoryResult({
    runId, dir, subject: where, samples, warmupMs: 0, forcedGc: opts.forceGc, snapshot1, snapshot2, heapProfile,
    limit: opts.limit, measured: `running process via inspector ${where}`,
    notes: enabled ? [`The inspector was enabled on PID ${ref.pid} and stays open until that process exits.`] : [],
  });
}
