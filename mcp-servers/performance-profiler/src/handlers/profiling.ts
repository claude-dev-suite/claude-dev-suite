// SPDX-License-Identifier: MIT
/**
 * Handlers for the profiling tools.
 */

import * as node from '../profilers/nodejs.js';
import * as python from '../profilers/python.js';
import * as java from '../profilers/java.js';
import * as go from '../profilers/go.js';
import * as dotnet from '../profilers/dotnet.js';
import { benchmark, profileFunction } from '../bench/benchmark.js';
import { measureStartup } from '../analysis/startup.js';
import { analyzeBottlenecks } from '../analysis/bottlenecks.js';
import { attachProfiler, preflightAttach } from '../live/attach.js';
import { inspectorMemory } from '../live/node-inspect.js';
import { checkRuntimeAvailable, commandAvailable, detectRuntime, validateScriptPath } from '../utils/process.js';
import type { CpuProfileOptions } from '../profilers/common.js';
import type { ProfileScriptResult } from '../types.js';
import { runMaybeInBackground } from './background.js';
import {
  AnalyzeMemorySchema,
  AttachProfilerSchema,
  BenchmarkCodeSchema,
  FindBottlenecksSchema,
  MeasureStartupSchema,
  ProfileFunctionSchema,
  ProfileScriptSchema,
  jsonResponse,
  type Handler,
  type Runtime,
} from './types.js';

export async function resolveRuntime(specified: Runtime | undefined, scriptPath: string): Promise<Runtime> {
  const runtime = specified ?? detectRuntime(scriptPath);
  if (!(await checkRuntimeAvailable(runtime))) {
    const hint: Record<Runtime, string> = {
      nodejs: 'Node.js',
      java: 'a JDK (java on PATH)',
      python: 'Python 3 (or set PERF_PROFILER_PYTHON)',
      go: 'Go (go on PATH)',
      dotnet: 'the .NET SDK (dotnet on PATH)',
    };
    throw new Error(`Runtime '${runtime}' is not available on this system: install ${hint[runtime]}.`);
  }
  return runtime;
}

/** Fail fast (before any background job) when the profiler itself is missing. */
async function preflightCpu(runtime: Runtime, scriptPath: string, profiler?: 'cprofile' | 'py-spy'): Promise<void> {
  validateScriptPath(scriptPath);
  if (runtime === 'java' && !(await commandAvailable('jfr', ['version']))) {
    throw new Error('`jfr` was not found on PATH. It ships with a full JDK (11+); add $JAVA_HOME/bin to PATH.');
  }
  if (runtime === 'python' && profiler === 'py-spy' && !(await python.pySpyAvailable())) {
    throw new Error('py-spy is not installed (pip install py-spy).');
  }
  if (runtime === 'dotnet' && !(await commandAvailable('dotnet-trace', ['--version']))) {
    throw new Error('dotnet-trace is not installed. Install it with: dotnet tool install --global dotnet-trace');
  }
}

function cpuProfiler(runtime: Runtime): (s: string, a: string[], o: CpuProfileOptions) => Promise<ProfileScriptResult> {
  switch (runtime) {
    case 'nodejs':
      return node.profileScript;
    case 'python':
      return python.profileScript;
    case 'java':
      return java.profileScript;
    case 'go':
      return go.profileScript;
    case 'dotnet':
      return dotnet.profileScript;
  }
}

export const handleProfileScript: Handler = async (args) => {
  const a = ProfileScriptSchema.parse(args);
  const runtime = await resolveRuntime(a.runtime, a.scriptPath);
  await preflightCpu(runtime, a.scriptPath, a.profiler);
  const result = await runMaybeInBackground('profile_script', `${runtime} ${a.scriptPath}`, a.background, a.duration + 10, (signal) =>
    cpuProfiler(runtime)(a.scriptPath, a.args ?? [], {
      durationS: a.duration, limit: a.limit, samplingIntervalUs: a.samplingIntervalUs, profiler: a.profiler,
      goBench: a.goBench, goTest: a.goTest, signal,
    })
  );
  return jsonResponse(result);
};

export const handleFindBottlenecks: Handler = async (args) => {
  const a = FindBottlenecksSchema.parse(args);
  const runtime = await resolveRuntime(a.runtime, a.scriptPath);
  await preflightCpu(runtime, a.scriptPath, a.profiler);
  const result = await runMaybeInBackground('find_bottlenecks', `${runtime} ${a.scriptPath}`, a.background, a.duration + 10, async (signal) => {
    const profile = await cpuProfiler(runtime)(a.scriptPath, a.args ?? [], {
      durationS: a.duration, limit: 500, profiler: a.profiler, goBench: a.goBench, signal,
    });
    const jfr = runtime === 'java' && profile.artifacts.jfr ? await java.jfrBreakdown(profile.artifacts.jfr) : undefined;
    return analyzeBottlenecks(runtime, profile, a.threshold, { jfr, limit: 20 });
  });
  return jsonResponse(result);
};

export const handleProfileFunction: Handler = async (args) => {
  const a = ProfileFunctionSchema.parse(args);
  return jsonResponse(await profileFunction(a.runtime, a.modulePath, a.functionName, a.args ?? [], a.iterations, a.warmup));
};

export const handleBenchmarkCode: Handler = async (args) => {
  const a = BenchmarkCodeSchema.parse(args);
  const compare =
    a.compareScriptPath !== undefined || a.compareCode !== undefined ? { scriptPath: a.compareScriptPath, code: a.compareCode } : undefined;
  const result = await runMaybeInBackground('benchmark_code', a.scriptPath ?? 'inline code', a.background ?? false, 0, (signal) =>
    benchmark(a.runtime, { scriptPath: a.scriptPath, code: a.code }, {
      iterations: a.iterations, warmup: a.warmup, compare, removeOutliers: a.removeOutliers, signal,
    })
  );
  return jsonResponse(result);
};

export const handleAnalyzeMemory: Handler = async (args) => {
  const a = AnalyzeMemorySchema.parse(args);
  const opts = {
    durationS: a.duration, intervalMs: a.snapshotInterval, forceGc: a.forceGc, snapshots: a.heapSnapshots, limit: a.limit, args: a.args,
  };
  let runtime: Runtime;
  if (a.scriptPath) runtime = await resolveRuntime(a.runtime, a.scriptPath);
  else if (a.inspectPort !== undefined) runtime = 'nodejs';
  else if (a.runtime) runtime = a.runtime;
  else throw new Error('Pass "runtime" together with "pid" (java, nodejs or dotnet)');

  const body = async (signal?: AbortSignal) => {
    const o = { ...opts, signal };
    if (!a.scriptPath) {
      switch (runtime) {
        case 'nodejs':
          return inspectorMemory({ port: a.inspectPort, pid: a.inspectPort === undefined ? a.pid : undefined }, o);
        case 'java':
          return java.analyzeMemoryPid(a.pid!, o);
        case 'dotnet':
          return dotnet.analyzeMemoryPid(a.pid!, o);
        default:
          throw new Error(`Attaching for memory analysis supports nodejs, java and dotnet (got ${runtime}); for Python run the script via scriptPath.`);
      }
    }
    switch (runtime) {
      case 'nodejs':
        return node.analyzeMemory(a.scriptPath, o);
      case 'python':
        return python.analyzeMemory(a.scriptPath, o);
      case 'java':
        return java.analyzeMemory(a.scriptPath, o);
      case 'dotnet':
        return dotnet.analyzeMemory(a.scriptPath, o);
      default:
        throw new Error(`analyze_memory does not support ${runtime}`);
    }
  };
  return jsonResponse(await runMaybeInBackground('analyze_memory', a.scriptPath ?? `pid ${a.pid ?? a.inspectPort}`, a.background, a.duration + 15, body));
};

export const handleMeasureStartup: Handler = async (args) => {
  const a = MeasureStartupSchema.parse(args);
  const runtime = await resolveRuntime(a.runtime, a.scriptPath);
  return jsonResponse(
    await measureStartup(runtime, a.scriptPath, {
      runs: a.runs, args: a.args, readyPort: a.readyPort, readyLogPattern: a.readyLogPattern, readyUrl: a.readyUrl, timeoutS: a.timeout,
    })
  );
};

export const handleAttachProfiler: Handler = async (args) => {
  const a = AttachProfilerSchema.parse(args);
  await preflightAttach({ ...a, limit: a.limit });
  const estimated = a.mode === 'dump' ? 5 : a.duration + 10;
  const result = await runMaybeInBackground('attach_profiler', `${a.runtime} ${a.pid ?? a.port ?? a.processName ?? a.inspectPort ?? ''}`, a.background, estimated, (signal) =>
    attachProfiler({
      runtime: a.runtime, pid: a.pid, port: a.port, processName: a.processName, inspectPort: a.inspectPort,
      duration: a.duration, limit: a.limit, mode: a.mode, threshold: a.threshold, signal,
    })
  );
  return jsonResponse(result);
};
