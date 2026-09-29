// SPDX-License-Identifier: MIT
/**
 * In-process profiling agent for Node targets, preloaded with `--require`.
 *
 * Why an agent instead of `--cpu-prof`: `--cpu-prof` only writes its file on a
 * clean exit, but a duration limit has to stop a long-running process (a
 * server never exits by itself) — and on Windows every "kill" is a hard
 * TerminateProcess, so nothing gets written. The agent drives the inspector
 * Profiler/HeapProfiler domains from inside the target and writes its results
 * itself, both when the process exits on its own and when the duration
 * elapses (it then exits the process). Results go to files, never stdout, so
 * the target's own output cannot corrupt them.
 */

import { writeFile } from 'fs/promises';
import { join } from 'path';

export interface NodeAgentConfig {
  outDir: string;
  /** Stop profiling and exit the target after this many ms (0 = only on exit). */
  durationMs: number;
  cpu?: { intervalUs: number };
  memory?: {
    intervalMs: number;
    forceGc: boolean;
    snapshots: boolean;
    warmupMs: number;
    samplingHeap: boolean;
  };
}

export interface NodeAgentResult {
  reason: 'exit' | 'duration';
  elapsedMs: number;
  pid: number;
  exitCode?: number;
  cpuProfile?: string;
  heapProfile?: string;
  snapshot1?: string;
  snapshot2?: string;
  samples?: Array<{ t: number; heapUsed: number; heapTotal: number; rss: number; external: number; arrayBuffers?: number }>;
  gcExposed?: boolean;
  error?: string;
}

export const AGENT_RESULT_FILE = 'agent-result.json';

const AGENT_SOURCE = String.raw`'use strict';
// dev-suite performance-profiler agent (preloaded with --require).
const wt = require('worker_threads');
if (!wt.isMainThread) return;
const inspector = require('inspector');
const fs = require('fs');
const path = require('path');
const v8 = require('v8');
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'agent-config.json'), 'utf8'));
const session = new inspector.Session();
session.connect();
function post(method, params) {
  let out, error;
  session.post(method, params || {}, (err, res) => { error = err; out = res; });
  if (error) throw error;
  return out;
}
const t0 = Date.now();
let finished = false;
const samples = [];
let snapshot1;
if (cfg.cpu) {
  post('Profiler.enable');
  post('Profiler.setSamplingInterval', { interval: cfg.cpu.intervalUs });
  post('Profiler.start');
}
function sample() {
  if (cfg.memory.forceGc && typeof global.gc === 'function') global.gc();
  const m = process.memoryUsage();
  samples.push({ t: Date.now() - t0, heapUsed: m.heapUsed, heapTotal: m.heapTotal, rss: m.rss, external: m.external, arrayBuffers: m.arrayBuffers });
}
if (cfg.memory) {
  if (cfg.memory.samplingHeap) {
    post('HeapProfiler.enable');
    post('HeapProfiler.startSampling', { samplingInterval: 32768 });
  }
  sample();
  setInterval(sample, cfg.memory.intervalMs).unref();
  if (cfg.memory.snapshots) {
    setTimeout(() => {
      if (finished) return;
      if (typeof global.gc === 'function') global.gc();
      snapshot1 = v8.writeHeapSnapshot(path.join(cfg.outDir, 'heap-1.heapsnapshot'));
    }, cfg.memory.warmupMs).unref();
  }
}
function finish(reason, code) {
  if (finished) return;
  finished = true;
  const result = { reason, elapsedMs: Date.now() - t0, pid: process.pid, exitCode: code, gcExposed: typeof global.gc === 'function' };
  try {
    if (cfg.cpu) {
      const r = post('Profiler.stop');
      fs.writeFileSync(path.join(cfg.outDir, 'cpu.cpuprofile'), JSON.stringify(r.profile));
      result.cpuProfile = 'cpu.cpuprofile';
    }
    if (cfg.memory) {
      sample();
      result.samples = samples;
      if (cfg.memory.samplingHeap) {
        const r = post('HeapProfiler.stopSampling');
        fs.writeFileSync(path.join(cfg.outDir, 'heap.heapprofile'), JSON.stringify(r.profile));
        result.heapProfile = 'heap.heapprofile';
      }
      if (cfg.memory.snapshots) {
        if (typeof global.gc === 'function') global.gc();
        result.snapshot1 = snapshot1 ? path.basename(snapshot1) : undefined;
        result.snapshot2 = path.basename(v8.writeHeapSnapshot(path.join(cfg.outDir, 'heap-2.heapsnapshot')));
      }
    }
  } catch (e) {
    result.error = String((e && e.stack) || e);
  }
  fs.writeFileSync(path.join(cfg.outDir, 'agent-result.json'), JSON.stringify(result));
}
process.on('exit', (code) => finish('exit', code));
if (cfg.durationMs > 0) {
  setTimeout(() => { finish('duration'); process.exit(0); }, cfg.durationMs).unref();
}
`;

/** Write the agent and its config into `agentDir`; returns the path to --require. */
export async function writeNodeAgent(agentDir: string, cfg: NodeAgentConfig): Promise<string> {
  const agentPath = join(agentDir, 'pp-agent.cjs');
  await writeFile(join(agentDir, 'agent-config.json'), JSON.stringify(cfg));
  await writeFile(agentPath, AGENT_SOURCE);
  return agentPath;
}
