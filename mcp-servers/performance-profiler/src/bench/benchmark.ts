// SPDX-License-Identifier: MIT
/**
 * Microbenchmarks with proper statistics and A/B comparison.
 *
 *  - In-process mode: a harness imports the module and times its exported
 *    function (`default` or `bench` for Node, `bench` for Python) or an
 *    inline snippet (only with PERF_PROFILER_ALLOW_RAW_CODE).
 *  - Process mode: when a script exports no function (or for Java), the
 *    script is run as a whole process per iteration — `iterations` and
 *    `warmup` are honoured (they used to be silently ignored).
 *  - Statistics: Tukey outlier removal, mean/median/p95/p99, sample SD,
 *    95% t-interval, relative margin of error; A/B via Welch's t-test.
 */

import { readFile, writeFile } from 'fs/promises';
import { basename, delimiter, dirname, join } from 'path';
import { allowRawCode } from '../utils/env.js';
import { createRunDir } from '../utils/artifacts.js';
import {
  buildRunSpec,
  cleanupTempDir,
  createTempDir,
  nodeTsFlags,
  requirePython,
  runCommand,
  spawnProcess,
  validateScriptPath,
} from '../utils/process.js';
import { redactText } from '../utils/redact.js';
import { removeOutliers as dropOutliers, summarize, welchTTest } from '../utils/statistics.js';
import { recordRun } from '../results/store.js';
import { NODE_HARNESS, PYTHON_HARNESS } from './harness.js';
import type { BenchmarkResult, ProfileFunctionResult, Runtime } from '../types.js';

const MAX_PROFILE_ARGS = 100;
const MAX_PROFILE_ARGS_BYTES = 64 * 1024;
const MAX_PROCESS_ITERATIONS = 200;
const MAX_INPROC_ITERATIONS = 1_000_000;

export interface BenchTarget {
  scriptPath?: string;
  code?: string;
}

interface HarnessOutput {
  timings?: number[];
  batch?: number;
  heapBefore?: number;
  heapAfter?: number;
  error?: string;
  noExport?: boolean;
}

function rawCodeGate(): void {
  if (!allowRawCode()) {
    throw new Error(
      'Raw code execution is disabled. Pass a scriptPath instead, or set PERF_PROFILER_ALLOW_RAW_CODE=true ' +
        'to opt in (unsafe — only for trusted, single-user environments).'
    );
  }
  console.error('[SECURITY WARNING] PERF_PROFILER_ALLOW_RAW_CODE is enabled: executing a raw code snippet.');
}

async function runHarness(
  runtime: 'nodejs' | 'python',
  cfg: Record<string, unknown>,
  opts: { timeoutMs: number; exposeGc?: boolean; signal?: AbortSignal }
): Promise<HarnessOutput> {
  const dir = await createTempDir('pp-bench');
  try {
    const out = join(dir, 'result.json');
    const cfgPath = join(dir, 'config.json');
    await writeFile(cfgPath, JSON.stringify({ ...cfg, out }));
    let cmd: string;
    let args: string[];
    const target = (cfg.modulePath as string | undefined) ?? undefined;
    if (runtime === 'nodejs') {
      const harness = join(dir, 'harness.mjs');
      await writeFile(harness, NODE_HARNESS);
      cmd = process.execPath;
      args = [...(opts.exposeGc ? ['--expose-gc'] : []), ...(target ? nodeTsFlags(target) : []), harness, cfgPath];
    } else {
      const py = await requirePython();
      const harness = join(dir, 'harness.py');
      await writeFile(harness, PYTHON_HARNESS);
      cmd = py.cmd;
      args = [...py.prefixArgs, harness, cfgPath];
    }
    const res = await spawnProcess(cmd, args, {
      cwd: target ? dirname(target) : dir,
      timeout: opts.timeoutMs,
      signal: opts.signal,
    });
    let data: HarnessOutput | undefined;
    try {
      data = JSON.parse(await readFile(out, 'utf-8')) as HarnessOutput;
    } catch {
      // no result file
    }
    if (!data) {
      const why = res.spawnError ?? (res.timedOut ? `timed out after ${opts.timeoutMs} ms` : `exit code ${res.exitCode}`);
      throw new Error(`Benchmark harness failed (${why}): ${redactText(res.stderr.slice(-1500))}`);
    }
    if (data.error) throw new Error(data.error);
    return data;
  } finally {
    await cleanupTempDir(dir);
  }
}

/** Time `iterations` whole-process runs of a script (after `warmup` untimed runs). */
async function processTimings(
  runtime: Runtime,
  scriptPath: string,
  iterations: number,
  warmup: number,
  signal?: AbortSignal
): Promise<number[]> {
  if (iterations > MAX_PROCESS_ITERATIONS) {
    throw new Error(`Process-mode benchmarks are capped at ${MAX_PROCESS_ITERATIONS} iterations (got ${iterations}).`);
  }
  const spec = await buildRunSpec(runtime, scriptPath, []);
  const timings: number[] = [];
  for (let i = 0; i < warmup + iterations; i++) {
    if (signal?.aborted) throw new Error('Benchmark aborted');
    const start = performance.now();
    const res = await spawnProcess(spec.cmd, spec.args, { cwd: spec.cwd, timeout: 300_000, signal, maxOutputBytes: 64 * 1024 });
    const elapsed = performance.now() - start;
    if (res.exitCode !== 0) {
      throw new Error(`Benchmark script failed on run ${i + 1} (${res.spawnError ?? `exit ${res.exitCode}`}): ${redactText(res.stderr.slice(-1000))}`);
    }
    if (i >= warmup) timings.push(elapsed);
  }
  return timings;
}

interface Measured {
  timings: number[];
  mode: 'in-process' | 'process';
  batch?: number;
}

async function measure(
  runtime: Runtime,
  t: BenchTarget,
  iterations: number | undefined,
  warmup: number | undefined,
  signal?: AbortSignal
): Promise<Measured> {
  const inIter = iterations ?? 1000;
  const inWarm = warmup ?? 100;
  if (t.code !== undefined) {
    rawCodeGate();
    checkIterations(inIter, inWarm);
    if (runtime === 'java') return { timings: await javaRawCode(t.code, inIter, inWarm), mode: 'in-process' };
    if (runtime !== 'nodejs' && runtime !== 'python') throw new Error(`Inline code benchmarks are not supported for ${runtime}`);
    const out = await runHarness(runtime, { code: t.code, iterations: inIter, warmup: inWarm }, { timeoutMs: 300_000, signal });
    return { timings: out.timings!, mode: 'in-process', batch: out.batch };
  }
  const scriptPath = t.scriptPath!;
  validateScriptPath(scriptPath);
  if (runtime === 'nodejs' || runtime === 'python') {
    checkIterations(inIter, inWarm);
    const out = await runHarness(runtime, { modulePath: scriptPath, iterations: inIter, warmup: inWarm }, { timeoutMs: 300_000, signal });
    if (!out.noExport) return { timings: out.timings!, mode: 'in-process', batch: out.batch };
  }
  // Whole-process runs are expensive: smaller defaults, hard cap.
  const pIter = iterations ?? 20;
  const pWarm = warmup ?? 2;
  checkIterations(pIter, pWarm);
  return { timings: await processTimings(runtime, scriptPath, pIter, pWarm, signal), mode: 'process' };
}

function checkIterations(iterations: number, warmup: number): void {
  if (!Number.isInteger(iterations) || iterations < 2 || iterations > MAX_INPROC_ITERATIONS) {
    throw new Error(`iterations must be an integer in [2, ${MAX_INPROC_ITERATIONS}]`);
  }
  if (!Number.isInteger(warmup) || warmup < 0 || warmup > MAX_INPROC_ITERATIONS) {
    throw new Error('warmup must be a non-negative integer');
  }
}

export async function benchmark(
  runtime: Runtime,
  a: BenchTarget,
  opts: { iterations?: number; warmup?: number; compare?: BenchTarget; removeOutliers?: boolean; signal?: AbortSignal }
): Promise<BenchmarkResult> {
  if (a.scriptPath === undefined && a.code === undefined) throw new Error('Either scriptPath or code must be provided');
  const notes: string[] = [];
  let ma: Measured;
  let mb: Measured | undefined;
  if (opts.compare) {
    // Interleave A/B in two rounds so slow drift (thermal, background load)
    // affects both variants alike.
    const half = opts.iterations !== undefined ? Math.max(2, Math.ceil(opts.iterations / 2)) : undefined;
    const a1 = await measure(runtime, a, half, opts.warmup, opts.signal);
    const b1 = await measure(runtime, opts.compare, half, opts.warmup, opts.signal);
    const a2 = await measure(runtime, a, half, opts.warmup, opts.signal);
    const b2 = await measure(runtime, opts.compare, half, opts.warmup, opts.signal);
    ma = { ...a1, timings: [...a1.timings, ...a2.timings] };
    mb = { ...b1, timings: [...b1.timings, ...b2.timings] };
    if (ma.mode !== mb.mode) notes.push(`Variant A ran in ${ma.mode} mode and B in ${mb.mode} mode; the comparison is not like-for-like.`);
  } else {
    ma = await measure(runtime, a, opts.iterations, opts.warmup, opts.signal);
  }
  if (ma.mode === 'process') {
    notes.push('Process mode: each sample is a whole process run (includes runtime startup). Export a `default`/`bench` function to time it in-process.');
  }
  if (ma.batch && ma.batch > 1) notes.push(`Fast function: each sample is the mean of ${ma.batch} consecutive calls.`);
  const removeOutliers = opts.removeOutliers !== false;
  const { runId, dir } = await createRunDir('benchmark');
  const timing = summarize(ma.timings, { removeOutliers });
  if (timing.rme > 5) notes.push(`Relative margin of error is ${timing.rme}% — increase iterations or reduce background load for a stable result.`);
  const result: BenchmarkResult = {
    runId,
    mode: ma.mode,
    iterations: ma.timings.length,
    warmupIterations: opts.warmup ?? (ma.mode === 'process' ? 2 : 100),
    timing,
    ...(notes.length ? { notes } : {}),
  };
  if (mb) {
    const tb = summarize(mb.timings, { removeOutliers });
    const kept = (xs: number[]) => (removeOutliers ? dropOutliers(xs).kept : xs);
    const welch = welchTTest(kept(ma.timings), kept(mb.timings));
    const direction = welch.diffPct > 0 ? 'slower' : 'faster';
    const verdict = welch.significant
      ? `B is ${Math.abs(welch.diffPct)}% ${direction} than A (p=${welch.pValue}, significant at α=0.05).`
      : `No statistically significant difference (B ${welch.diffPct >= 0 ? '+' : ''}${welch.diffPct}%, p=${welch.pValue}).`;
    result.comparison = { variantB: { timing: tb }, welch, verdict };
  }
  await recordRun(dir, {
    runId,
    kind: 'benchmark',
    subject: a.scriptPath ?? '(inline code)',
    metrics: { time_mean: timing.mean, time_median: timing.median, time_p95: timing.p95, ops_per_sec: timing.opsPerSecond },
    samples: { time: ma.timings },
  });
  return result;
}

// ---------------------------------------------------------------------------
// profile_function
// ---------------------------------------------------------------------------

export async function profileFunction(
  runtime: Runtime,
  modulePath: string,
  functionName: string,
  args: unknown[] = [],
  iterations = 100,
  warmup = 10,
  signal?: AbortSignal
): Promise<ProfileFunctionResult> {
  validateScriptPath(modulePath);
  if (args.length > MAX_PROFILE_ARGS) throw new Error(`Too many arguments: ${args.length} (max ${MAX_PROFILE_ARGS})`);
  if (Buffer.byteLength(JSON.stringify(args), 'utf-8') > MAX_PROFILE_ARGS_BYTES) {
    throw new Error(`Serialized arguments exceed size limit (max ${MAX_PROFILE_ARGS_BYTES} bytes)`);
  }
  checkIterations(iterations, warmup);
  let out: HarnessOutput;
  if (runtime === 'nodejs') {
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(functionName)) {
      throw new Error(`Invalid function name: ${functionName}. Must be a valid JavaScript identifier.`);
    }
    out = await runHarness('nodejs', { modulePath, functionName, args, iterations, warmup }, { timeoutMs: 300_000, exposeGc: true, signal });
  } else if (runtime === 'python') {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(functionName)) throw new Error(`Invalid Python identifier: ${functionName}`);
    out = await runHarness('python', { modulePath, functionName, args, iterations, warmup, memory: true }, { timeoutMs: 300_000, signal });
  } else if (runtime === 'java') {
    out = await javaProfileFunction(modulePath, functionName, args, iterations, warmup);
  } else {
    throw new Error(`profile_function supports nodejs, python and java (got ${runtime})`);
  }
  const { runId, dir } = await createRunDir('function');
  const timing = summarize(out.timings!);
  await recordRun(dir, {
    runId,
    kind: 'function',
    subject: `${basename(modulePath)}#${functionName}`,
    metrics: { time_mean: timing.mean, time_median: timing.median, time_p95: timing.p95, ops_per_sec: timing.opsPerSecond },
    samples: { time: out.timings! },
  });
  return {
    runId,
    functionName,
    iterations,
    warmup,
    timing,
    unit: 'ms',
    ...(out.heapBefore !== undefined && out.heapAfter !== undefined
      ? { memory: { heapUsedBefore: out.heapBefore, heapUsedAfter: out.heapAfter, delta: out.heapAfter - out.heapBefore } }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Java
// ---------------------------------------------------------------------------

function validateJavaIdentifier(name: string): void {
  if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*(\.[a-zA-Z_$][a-zA-Z0-9_$]*)*$/.test(name)) {
    throw new Error(`Invalid Java identifier: ${name}`);
  }
}

const JAVA_TIMING_TAIL = `
        long memAfter = rt.totalMemory() - rt.freeMemory();
        StringBuilder json = new StringBuilder("{\\"timings\\":[");
        for (int i = 0; i < timings.length; i++) { if (i > 0) json.append(','); json.append(timings[i]); }
        json.append("],\\"heapBefore\\":").append(memBefore).append(",\\"heapAfter\\":").append(memAfter).append('}');
        java.nio.file.Files.writeString(java.nio.file.Path.of(args[0]), json.toString());
    }
}
`;

async function compileAndRunJava(
  source: string,
  classpath: string | undefined,
  timeoutMs: number
): Promise<HarnessOutput> {
  const dir = await createTempDir('pp-java-bench');
  try {
    await writeFile(join(dir, 'PpBenchmark.java'), source);
    const cp = classpath ? [classpath, dir].join(delimiter) : dir;
    const compile = await runCommand({ cmd: 'javac', args: ['-cp', cp, '-d', dir, join(dir, 'PpBenchmark.java')] }, { timeout: 60_000, cwd: dir });
    if (compile.exitCode !== 0) throw new Error(`javac failed: ${compile.spawnError ?? compile.stderr.slice(-1500)}`);
    const outFile = join(dir, 'result.json');
    const run = await runCommand({ cmd: 'java', args: ['-cp', cp, 'PpBenchmark', outFile] }, { timeout: timeoutMs, cwd: dir });
    if (run.exitCode !== 0) throw new Error(`Java benchmark failed: ${run.spawnError ?? redactText(run.stderr.slice(-1500))}`);
    return JSON.parse(await readFile(outFile, 'utf-8')) as HarnessOutput;
  } finally {
    await cleanupTempDir(dir);
  }
}

async function javaProfileFunction(
  modulePath: string,
  functionName: string,
  args: unknown[],
  iterations: number,
  warmup: number
): Promise<HarnessOutput> {
  if (args.length > 0) {
    throw new Error('Java profile_function supports no-argument methods only; wrap the call in a no-arg method.');
  }
  const parts = functionName.split('.');
  const methodName = parts.pop() || functionName;
  const className = parts.join('.');
  if (!className) throw new Error('For Java pass functionName as "fully.qualified.Class.method"');
  validateJavaIdentifier(className);
  validateJavaIdentifier(methodName);
  const source = `
public class PpBenchmark {
    public static void main(String[] args) throws Exception {
        Class<?> clazz = Class.forName("${className}");
        java.lang.reflect.Method method = clazz.getDeclaredMethod("${methodName}");
        method.setAccessible(true);
        Object instance = java.lang.reflect.Modifier.isStatic(method.getModifiers()) ? null : clazz.getDeclaredConstructor().newInstance();
        for (int i = 0; i < ${warmup}; i++) method.invoke(instance);
        double[] timings = new double[${iterations}];
        System.gc();
        Runtime rt = Runtime.getRuntime();
        long memBefore = rt.totalMemory() - rt.freeMemory();
        for (int i = 0; i < timings.length; i++) {
            long s = System.nanoTime();
            method.invoke(instance);
            timings[i] = (System.nanoTime() - s) / 1_000_000.0;
        }
${JAVA_TIMING_TAIL}`;
  if (modulePath.endsWith('.java')) {
    throw new Error('Java profile_function needs compiled code: pass a .jar, a classes directory, or a .class file.');
  }
  const classpath = modulePath.endsWith('.class') ? dirname(modulePath) : modulePath;
  return compileAndRunJava(source, classpath, 300_000);
}

async function javaRawCode(code: string, iterations: number, warmup: number): Promise<number[]> {
  const source = `
public class PpBenchmark {
    static void bench() throws Exception {
        ${code}
    }
    public static void main(String[] args) throws Exception {
        for (int i = 0; i < ${warmup}; i++) bench();
        double[] timings = new double[${iterations}];
        Runtime rt = Runtime.getRuntime();
        long memBefore = rt.totalMemory() - rt.freeMemory();
        for (int i = 0; i < timings.length; i++) {
            long s = System.nanoTime();
            bench();
            timings[i] = (System.nanoTime() - s) / 1_000_000.0;
        }
${JAVA_TIMING_TAIL}`;
  const out = await compileAndRunJava(source, undefined, 300_000);
  return out.timings!;
}
