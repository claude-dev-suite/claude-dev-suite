// SPDX-License-Identifier: MIT
/**
 * Python profiling: cProfile (deterministic — exact self/total/call counts),
 * py-spy (sampling, flame graph, attach to a PID) and tracemalloc snapshot
 * diffs for memory. Wrappers write results to files, never stdout, and honour
 * the duration by interrupting the target.
 */

import { readFile, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { createRunDir } from '../utils/artifacts.js';
import {
  cleanupTempDir,
  commandAvailable,
  createTempDir,
  findOnPath,
  killTree,
  requirePython,
  runCommand,
  spawnProcess,
  validateScriptPath,
} from '../utils/process.js';
import { outputExcerpt } from '../utils/redact.js';
import { mean, round } from '../utils/statistics.js';
import { fromCollapsed, type FunctionStat } from '../profile/model.js';
import { buildCpuReport, writeCpuArtifacts } from '../profile/report.js';
import { recordRun } from '../results/store.js';
import { assessLeak } from '../memory/leak.js';
import { checkDuration, failureDetail, targetInfo, type CpuProfileOptions } from './common.js';
import { cpuMetrics } from './nodejs.js';
import { benchmark } from '../bench/benchmark.js';

/** @deprecated use bench/benchmark.ts `benchmark('python', …)` */
export function benchmarkCode(codeOrPath: string, iterations = 1000, warmup = 100, isScriptPath = true) {
  return benchmark('python', isScriptPath ? { scriptPath: codeOrPath } : { code: codeOrPath }, { iterations, warmup });
}
import type { MemoryAnalysisResult, ProfileScriptResult } from '../types.js';

const IS_WIN = process.platform === 'win32';

const CPROFILE_WRAPPER = String.raw`import sys, os, json, time, threading, runpy, cProfile, pstats, _thread, traceback
cfg = json.load(open(sys.argv[1], encoding='utf-8'))
script = cfg['script']
sys.argv = [script] + cfg['args']
sys.path[0] = os.path.dirname(script)
prof = cProfile.Profile()
state = {'reason': 'exit', 'done': False, 'exitCode': 0, 'error': None}
lock = threading.Lock()
t0 = time.perf_counter()
def finish():
    with lock:
        if state['done']:
            return
        state['done'] = True
    try:
        prof.disable()
    except Exception:
        pass
    prof.dump_stats(os.path.join(cfg['out'], 'cpu.prof'))
    st = pstats.Stats(prof)
    funcs = []
    total = 0.0
    for (fn, line, name), (cc, nc, tt, ct, callers) in st.stats.items():
        total += tt
        funcs.append([name, fn, line, tt * 1000.0, ct * 1000.0, nc, cc])
    funcs.sort(key=lambda f: -f[3])
    with open(os.path.join(cfg['out'], 'cprofile.json'), 'w', encoding='utf-8') as f:
        json.dump({'reason': state['reason'], 'exitCode': state['exitCode'], 'error': state['error'],
                   'totalMs': total * 1000.0, 'wallMs': (time.perf_counter() - t0) * 1000.0,
                   'count': len(funcs), 'functions': funcs[:cfg['limit']]}, f)
def timer():
    time.sleep(cfg['duration'])
    state['reason'] = 'duration'
    _thread.interrupt_main()
    time.sleep(5)
    if not state['done']:
        finish()
        os._exit(0)
threading.Thread(target=timer, daemon=True).start()
prof.enable()
try:
    runpy.run_path(script, run_name='__main__')
except KeyboardInterrupt:
    if state['reason'] != 'duration':
        state['error'] = 'KeyboardInterrupt'
except SystemExit as e:
    state['exitCode'] = e.code if isinstance(e.code, int) else (0 if e.code is None else 1)
except BaseException:
    state['error'] = traceback.format_exc()[-4000:]
    state['exitCode'] = 1
finish()
sys.stdout.flush()
sys.stderr.flush()
os._exit(state['exitCode'] if isinstance(state['exitCode'], int) else 1)
`;

const TRACEMALLOC_WRAPPER = String.raw`import sys, os, json, time, threading, runpy, tracemalloc, gc, traceback, atexit
cfg = json.load(open(sys.argv[1], encoding='utf-8'))
script = cfg['script']
sys.argv = [script] + cfg['args']
sys.path[0] = os.path.dirname(script)
tracemalloc.start(1)
t0 = time.time()
samples = []
lock = threading.Lock()
state = {'done': False, 'snap1': None, 'reason': 'exit', 'error': None}
flt = (tracemalloc.Filter(False, tracemalloc.__file__), tracemalloc.Filter(False, __file__), tracemalloc.Filter(False, '<frozen importlib._bootstrap>'))
def sample():
    if cfg['forceGc']:
        gc.collect()
    cur, peak = tracemalloc.get_traced_memory()
    samples.append({'t': (time.time() - t0) * 1000.0, 'heapUsed': cur, 'heapTotal': peak})
def finish():
    with lock:
        if state['done']:
            return
        state['done'] = True
    sample()
    diff = None
    net = None
    if state['snap1'] is not None:
        gc.collect()
        s2 = tracemalloc.take_snapshot().filter_traces(flt)
        stats = s2.compare_to(state['snap1'], 'lineno')
        net = sum(s.size_diff for s in stats)
        grow = [s for s in stats if s.size_diff > 0]
        diff = [{'file': s.traceback[0].filename, 'line': s.traceback[0].lineno, 'sizeDiff': s.size_diff,
                 'size': s.size, 'countDiff': s.count_diff, 'count': s.count} for s in grow[:cfg['limit']]]
    with open(os.path.join(cfg['out'], 'memory.json'), 'w', encoding='utf-8') as f:
        json.dump({'reason': state['reason'], 'error': state['error'], 'samples': samples,
                   'diff': diff, 'netSizeDelta': net, 'pid': os.getpid()}, f)
def sampler():
    while not state['done']:
        el = time.time() - t0
        if state['snap1'] is None and el * 1000.0 >= cfg['warmupMs']:
            gc.collect()
            state['snap1'] = tracemalloc.take_snapshot().filter_traces(flt)
        sample()
        if el >= cfg['duration']:
            state['reason'] = 'duration'
            finish()
            sys.stdout.flush()
            os._exit(0)
        time.sleep(cfg['intervalMs'] / 1000.0)
atexit.register(finish)
threading.Thread(target=sampler, daemon=True).start()
try:
    runpy.run_path(script, run_name='__main__')
except SystemExit:
    pass
except BaseException:
    state['error'] = traceback.format_exc()[-4000:]
finish()
`;

interface CProfileOutput {
  reason: 'exit' | 'duration';
  exitCode: number;
  error: string | null;
  totalMs: number;
  wallMs: number;
  count: number;
  functions: Array<[string, string, number, number, number, number, number]>;
}

export async function profileScript(scriptPath: string, args: string[], opts: CpuProfileOptions): Promise<ProfileScriptResult> {
  validateScriptPath(scriptPath);
  checkDuration(opts.durationS);
  if (opts.profiler === 'py-spy') return profileWithPySpy(scriptPath, args, opts);
  const py = await requirePython();
  const { runId, dir } = await createRunDir('python-cpu');
  const tmp = await createTempDir('pp-py');
  try {
    const wrapper = join(tmp, 'pp_cprofile.py');
    const cfgPath = join(tmp, 'config.json');
    await writeFile(wrapper, CPROFILE_WRAPPER);
    await writeFile(cfgPath, JSON.stringify({ script: scriptPath, args, out: dir, duration: opts.durationS, limit: Math.min(opts.limit, 500) }));
    const res = await spawnProcess(py.cmd, [...py.prefixArgs, wrapper, cfgPath], {
      cwd: dirname(scriptPath),
      timeout: opts.durationS * 1000 + 60_000,
      signal: opts.signal,
    });
    let data: CProfileOutput;
    try {
      data = JSON.parse(await readFile(join(dir, 'cprofile.json'), 'utf-8')) as CProfileOutput;
    } catch {
      throw new Error(`Python target produced no profile (${failureDetail(res)})`);
    }
    const total = data.totalMs || 1;
    const topFunctions: FunctionStat[] = data.functions.slice(0, opts.limit).map(([name, file, line, tt, ct, nc]) => ({
      name,
      file,
      line,
      selfTime: round(tt, 3),
      totalTime: round(ct, 3),
      selfPercent: round((tt / total) * 100, 2),
      totalPercent: round(Math.min((ct / total) * 100, 100), 2),
      percentage: round((tt / total) * 100, 2),
      calls: nc,
    }));
    const report = {
      topFunctions,
      truncated: data.count > topFunctions.length,
      hotPaths: [],
      summary: {
        totalTime: round(data.totalMs, 3),
        totalFunctions: data.count,
        samplesCollected: 0,
        unit: 'milliseconds' as const,
        timesAreEstimated: false,
      },
    };
    await recordRun(dir, { runId, kind: 'cpu_profile', subject: scriptPath, metrics: cpuMetrics(report) });
    const notes = [
      'cProfile is deterministic: call counts are exact, but its per-call overhead inflates times of very small functions. It profiles the main thread only.',
      'Open cpu.prof with `python -m pstats` or snakeviz; use profiler: "py-spy" for a sampled flame graph.',
    ];
    if (data.reason === 'duration') notes.unshift(`Target was interrupted after ${opts.durationS}s; the profile covers that window.`);
    if (data.error) notes.unshift(`Target raised: ${data.error.split('\n').slice(-3).join(' ').slice(0, 400)}`);
    return {
      runId,
      runtime: 'python',
      profiler: 'cprofile',
      scriptPath,
      duration: opts.durationS,
      ...report,
      artifacts: { pstats: join(dir, 'cpu.prof') },
      target: { ...targetInfo(res, data.reason === 'duration' ? 'duration' : 'exit'), exitCode: data.exitCode },
      notes,
    };
  } finally {
    await cleanupTempDir(tmp);
  }
}

export async function pySpyAvailable(): Promise<boolean> {
  return findOnPath('py-spy') !== null && (await commandAvailable('py-spy', ['--version']));
}

async function requirePySpy(): Promise<void> {
  if (!(await pySpyAvailable())) {
    throw new Error('py-spy is not installed (pip install py-spy). It is required for sampling profiles and PID attach.');
  }
}

async function profileWithPySpy(scriptPath: string, args: string[], opts: CpuProfileOptions): Promise<ProfileScriptResult> {
  await requirePySpy();
  const py = await requirePython();
  const { runId, dir } = await createRunDir('python-pyspy');
  const out = join(dir, 'cpu.collapsed.raw.txt');
  const rate = 100;
  let res;
  let targetPid: number | undefined;
  if (IS_WIN) {
    // Launch the target ourselves and attach, so the whole tree can be killed
    // afterwards (an orphaned child of py-spy cannot be found by taskkill /T).
    const target = spawnProcess(py.cmd, [...py.prefixArgs, scriptPath, ...args], {
      cwd: dirname(scriptPath),
      timeout: opts.durationS * 1000 + 30_000,
      onSpawn: (pid) => (targetPid = pid),
      signal: opts.signal,
    });
    await new Promise((r) => setTimeout(r, 300));
    if (!targetPid) throw new Error('Python target did not start');
    res = await runCommand(
      { cmd: 'py-spy', args: ['record', '--pid', String(targetPid), '--duration', String(opts.durationS), '--rate', String(rate), '--format', 'raw', '--output', out, '--nonblocking'] },
      { timeout: opts.durationS * 1000 + 30_000, signal: opts.signal }
    );
    await killTree(targetPid);
    await target;
  } else {
    res = await spawnProcess(
      'py-spy',
      ['record', '--duration', String(opts.durationS), '--rate', String(rate), '--format', 'raw', '--output', out, '--', py.cmd, ...py.prefixArgs, scriptPath, ...args],
      { cwd: dirname(scriptPath), timeout: opts.durationS * 1000 + 30_000, signal: opts.signal }
    );
    if (res.pid) await killTree(res.pid);
  }
  let text: string;
  try {
    text = await readFile(out, 'utf-8');
  } catch {
    throw new Error(`py-spy produced no profile (${failureDetail(res)})`);
  }
  const profile = fromCollapsed(text, `py-spy ${scriptPath}`, 'samples', 1000 / rate);
  if (profile.stacks.length === 0) throw new Error('py-spy collected no samples; the script may have exited immediately.');
  const report = buildCpuReport(profile, opts.limit);
  const artifacts = { collapsedRaw: out, ...(await writeCpuArtifacts(profile, dir)) };
  await recordRun(dir, { runId, kind: 'cpu_profile', subject: scriptPath, metrics: cpuMetrics(report) });
  return {
    runId,
    runtime: 'python',
    profiler: 'py-spy',
    scriptPath,
    duration: opts.durationS,
    ...report,
    artifacts,
    target: targetInfo(res, 'exit'),
    notes: ['py-spy samples all Python threads at 100 Hz; times are estimated from sample counts.'],
  };
}

/** py-spy record against a running PID. */
export async function pySpyRecordPid(pid: number, durationS: number, limit: number, signal?: AbortSignal): Promise<ProfileScriptResult> {
  await requirePySpy();
  const { runId, dir } = await createRunDir('python-attach');
  const out = join(dir, 'cpu.collapsed.raw.txt');
  const rate = 100;
  const res = await runCommand(
    { cmd: 'py-spy', args: ['record', '--pid', String(pid), '--duration', String(durationS), '--rate', String(rate), '--format', 'raw', '--output', out, '--nonblocking'] },
    { timeout: durationS * 1000 + 30_000, signal }
  );
  let text: string;
  try {
    text = await readFile(out, 'utf-8');
  } catch {
    throw new Error(`py-spy could not record PID ${pid} (${failureDetail(res)}). On Linux/macOS attaching may need elevated privileges.`);
  }
  const profile = fromCollapsed(text, `py-spy pid ${pid}`, 'samples', 1000 / rate);
  if (profile.stacks.length === 0) throw new Error(`py-spy collected no samples from PID ${pid} (idle process?).`);
  const report = buildCpuReport(profile, limit);
  const artifacts = { collapsedRaw: out, ...(await writeCpuArtifacts(profile, dir)) };
  await recordRun(dir, { runId, kind: 'cpu_profile', subject: `pid ${pid}`, metrics: cpuMetrics(report) });
  return { runId, runtime: 'python', profiler: 'py-spy', scriptPath: `pid:${pid}`, duration: durationS, ...report, artifacts };
}

/** py-spy dump: current stack of every thread of a running process. */
export async function pySpyDump(pid: number) {
  await requirePySpy();
  const res = await runCommand({ cmd: 'py-spy', args: ['dump', '--pid', String(pid), '--nonblocking'] }, { timeout: 30_000, maxOutputBytes: 512 * 1024 });
  if (res.exitCode !== 0) throw new Error(`py-spy dump failed for PID ${pid}: ${failureDetail(res)}`);
  return { pid, mode: 'dump', stacks: outputExcerpt(res.stdout, 20_000) };
}

// ---------------------------------------------------------------------------
// Memory (tracemalloc)
// ---------------------------------------------------------------------------

interface TracemallocOutput {
  reason: 'exit' | 'duration';
  error: string | null;
  samples: Array<{ t: number; heapUsed: number; heapTotal: number }>;
  diff: Array<{ file: string; line: number; sizeDiff: number; size: number; countDiff: number; count: number }> | null;
  netSizeDelta: number | null;
  pid: number;
}

export async function analyzeMemory(
  scriptPath: string,
  opts: { durationS: number; intervalMs: number; forceGc: boolean; limit: number; args?: string[]; signal?: AbortSignal }
): Promise<MemoryAnalysisResult> {
  validateScriptPath(scriptPath);
  checkDuration(opts.durationS);
  const py = await requirePython();
  const { runId, dir } = await createRunDir('python-memory');
  const tmp = await createTempDir('pp-py');
  const warmupMs = Math.min(Math.max(opts.intervalMs * 2, opts.durationS * 1000 * 0.2), 10_000);
  try {
    const wrapper = join(tmp, 'pp_tracemalloc.py');
    const cfgPath = join(tmp, 'config.json');
    await writeFile(wrapper, TRACEMALLOC_WRAPPER);
    await writeFile(cfgPath, JSON.stringify({
      script: scriptPath, args: opts.args ?? [], out: dir, duration: opts.durationS, intervalMs: opts.intervalMs,
      forceGc: opts.forceGc, warmupMs, limit: Math.min(opts.limit, 200),
    }));
    const res = await spawnProcess(py.cmd, [...py.prefixArgs, wrapper, cfgPath], {
      cwd: dirname(scriptPath),
      timeout: opts.durationS * 1000 + 60_000,
      signal: opts.signal,
    });
    let data: TracemallocOutput;
    try {
      data = JSON.parse(await readFile(join(dir, 'memory.json'), 'utf-8')) as TracemallocOutput;
    } catch {
      throw new Error(`Python target produced no memory data (${failureDetail(res)})`);
    }
    if (data.samples.length === 0) throw new Error('No memory samples collected');
    const heap = data.samples.map((s) => s.heapUsed);
    const leak = assessLeak(data.samples.map((s) => ({ t: s.t, used: s.heapUsed })), {
      warmupMs, forcedGc: opts.forceGc, confirmBytes: data.netSizeDelta ?? undefined,
    });
    const notes: string[] = ['Sizes are Python-level allocations traced by tracemalloc (not process RSS).'];
    if (data.reason === 'duration') notes.push(`Target was stopped after ${opts.durationS}s.`);
    if (data.error) notes.push(`Target raised: ${data.error.split('\n').slice(-3).join(' ').slice(0, 400)}`);
    if (!data.diff) notes.push(`Target exited before the ${Math.round(warmupMs)} ms warm-up, so no snapshot comparison.`);
    const step = Math.ceil(data.samples.length / 200);
    const result: MemoryAnalysisResult = {
      runId,
      runtime: 'python',
      target: scriptPath,
      snapshots: data.samples.filter((_, i) => i % step === 0 || i === data.samples.length - 1).map((s) => ({ timestamp: Math.round(s.t), heapUsed: s.heapUsed, heapTotal: s.heapTotal })),
      snapshotsTruncated: step > 1,
      summary: {
        initialHeap: heap[0],
        finalHeap: heap[heap.length - 1],
        peakHeap: Math.max(...data.samples.map((s) => s.heapTotal)),
        avgHeap: round(mean(heap), 0),
        heapGrowth: heap[heap.length - 1] - heap[0],
        measuredProcess: `target process (pid ${data.pid}, tracemalloc in-process)`,
        forcedGcBeforeSamples: opts.forceGc,
      },
      potentialLeaks: { ...leak, detected: leak.verdict === 'likely-leak' },
      ...(data.diff ? { diff: { kind: 'tracemalloc lineno comparison (post-warm-up → end)', netSizeDelta: data.netSizeDelta, topGrowth: data.diff } } : {}),
      artifacts: { data: join(dir, 'memory.json') },
      notes,
    };
    await recordRun(dir, {
      runId, kind: 'memory', subject: scriptPath,
      metrics: { heap_final: result.summary.finalHeap, heap_peak: result.summary.peakHeap, heap_growth_rate: leak.growthRate },
    });
    return result;
  } finally {
    await cleanupTempDir(tmp);
  }
}
