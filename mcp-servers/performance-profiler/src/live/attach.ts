// SPDX-License-Identifier: MIT
/**
 * attach_profiler: CPU-profile an already running process.
 *  - java:   JFR via jcmd (pid / port / JVM name);
 *  - nodejs: V8 profiler over the inspector (--inspect port, or enable it on a pid);
 *  - python: py-spy record (or `mode: "dump"` for a one-shot stack dump);
 *  - dotnet: dotnet-trace.
 */

import { findProcess, type ProcessInfo } from './process-finder.js';
import { inspectorCpuProfile } from './node-inspect.js';
import { listInspectorTargets } from './cdp.js';
import { commandAvailable, isPidAlive } from '../utils/process.js';
import { jfrAttach } from '../profilers/java.js';
import { pySpyAvailable, pySpyDump, pySpyRecordPid } from '../profilers/python.js';
import { traceAttach } from '../profilers/dotnet.js';
import { analyzeBottlenecks } from '../analysis/bottlenecks.js';
import type { BottlenecksResult, ProfileScriptResult } from '../types.js';

export interface AttachProfilerInput {
  runtime: 'java' | 'nodejs' | 'python' | 'dotnet';
  pid?: number;
  port?: number;
  processName?: string;
  inspectPort?: number;
  duration: number;
  limit: number;
  mode?: 'record' | 'dump';
  threshold?: number;
  signal?: AbortSignal;
}

export type AttachResult = (ProfileScriptResult & { process?: ProcessInfo; bottlenecks?: BottlenecksResult }) | Awaited<ReturnType<typeof pySpyDump>>;

async function resolvePid(input: AttachProfilerInput): Promise<ProcessInfo> {
  const proc = await findProcess({ pid: input.pid, port: input.port, name: input.processName, runtime: input.runtime });
  if (!proc) {
    const by = [input.pid && `PID ${input.pid}`, input.port && `port ${input.port}`, input.processName && `name "${input.processName}"`].filter(Boolean).join(', ');
    throw new Error(`Could not find a running ${input.runtime} process (searched by ${by || 'nothing — pass pid, port or processName'}).`);
  }
  return proc;
}

/**
 * Fast checks run before a (possibly background) attach, so a missing tool or
 * process is reported immediately instead of through a failed job.
 */
export async function preflightAttach(input: AttachProfilerInput): Promise<void> {
  const need = async (cmd: string, args: string[], hint: string) => {
    if (!(await commandAvailable(cmd, args))) throw new Error(`${cmd} is not available: ${hint}`);
  };
  switch (input.runtime) {
    case 'nodejs':
      if (input.inspectPort !== undefined) await listInspectorTargets('127.0.0.1', input.inspectPort);
      else if (input.pid === undefined) await listInspectorTargets('127.0.0.1', 9229);
      else if (!isPidAlive(input.pid)) throw new Error(`Process ${input.pid} is not running`);
      return;
    case 'python':
      if (!(await pySpyAvailable())) throw new Error('py-spy is not installed (pip install py-spy); it is required to attach to Python processes.');
      break;
    case 'dotnet':
      await need('dotnet-trace', ['--version'], 'install it with: dotnet tool install --global dotnet-trace');
      break;
    default:
      await need('jcmd', ['-h'], 'it ships with a full JDK; add $JAVA_HOME/bin to PATH');
      await need('jfr', ['version'], 'it ships with a full JDK (11+); add $JAVA_HOME/bin to PATH');
  }
  await resolvePid(input);
}

export async function attachProfiler(input: AttachProfilerInput): Promise<AttachResult> {
  const threshold = input.threshold ?? 5;
  switch (input.runtime) {
    case 'nodejs': {
      // The inspector port identifies the process; `pid` enables the inspector first.
      const r = await inspectorCpuProfile(
        { port: input.inspectPort, pid: input.inspectPort === undefined ? input.pid : undefined },
        input.duration,
        input.limit,
        500,
        input.signal
      );
      return { ...r, bottlenecks: analyzeBottlenecks('nodejs', r, threshold, { limit: 10 }) };
    }
    case 'python': {
      const proc = await resolvePid(input);
      if (input.mode === 'dump') return pySpyDump(proc.pid);
      const r = await pySpyRecordPid(proc.pid, input.duration, input.limit, input.signal);
      return { ...r, process: proc, bottlenecks: analyzeBottlenecks('python', r, threshold, { limit: 10 }) };
    }
    case 'dotnet': {
      const proc = await resolvePid(input);
      const r = await traceAttach(proc.pid, input.duration, input.limit, input.signal);
      return { ...r, process: proc, bottlenecks: analyzeBottlenecks('dotnet', r, threshold, { limit: 10 }) };
    }
    case 'java':
    default: {
      const proc = await resolvePid(input);
      const r = await jfrAttach(proc.pid, input.duration, input.limit, input.signal);
      return { ...r, process: proc, bottlenecks: analyzeBottlenecks('java', r, threshold, { jfr: r.breakdown, limit: 10 }) };
    }
  }
}
