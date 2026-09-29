// SPDX-License-Identifier: MIT
/**
 * Bottleneck classification from profile evidence.
 *
 * The old version guessed a category from substrings of the function name
 * ("read" → I/O, "array" → memory). This classifies by what the profile
 * actually shows: V8's own "(garbage collector)" / "(idle)" samples, the module
 * a frame belongs to (node:fs, _io, java.net, internal/poll …), and — for Java
 * — JFR's recorded GC pauses, blocking I/O and monitor contention.
 */

import { round } from '../utils/statistics.js';
import type { FunctionStat } from '../profile/model.js';
import type { JfrBreakdown } from '../profilers/java.js';
import type { Bottleneck, BottleneckCategory, BottlenecksResult, ProfileScriptResult, Recommendation, Runtime } from '../types.js';

interface Rule {
  test: (f: FunctionStat) => boolean;
  category: BottleneckCategory;
  evidence: string;
}

const RULES: Record<Runtime, Rule[]> = {
  nodejs: [
    { test: (f) => f.name === '(garbage collector)', category: 'gc', evidence: 'V8 garbage-collector samples' },
    { test: (f) => f.name === '(idle)', category: 'idle', evidence: 'V8 idle samples (event loop waiting)' },
    { test: (f) => /^node:(fs|net|http|https|http2|dgram|dns|stream|zlib|internal\/(fs|net|stream|http|streams))/.test(f.file), category: 'io', evidence: 'frame in a Node I/O module' },
    { test: (f) => /^(JSON\.(parse|stringify)|structuredClone)$/.test(f.name), category: 'memory', evidence: 'serialisation / cloning builtin' },
  ],
  python: [
    { test: (f) => /gc\.collect/.test(f.name), category: 'gc', evidence: 'explicit gc.collect()' },
    { test: (f) => /time\.sleep|asyncio.*(select|poll)|selectors?\./.test(f.name), category: 'idle', evidence: 'sleeping / waiting in the event loop' },
    { test: (f) => /_thread\.lock|_thread\.RLock|threading\.py/.test(f.name + f.file) && /acquire|wait/.test(f.name), category: 'lock', evidence: 'lock acquire / wait' },
    { test: (f) => /'_io\.|'_socket\.|'_ssl\.|built-in method (select|_socket|posix\.read|nt\.read|io\.open)|socket\.py|ssl\.py/.test(f.name + ' ' + f.file), category: 'io', evidence: 'C-level I/O builtin' },
  ],
  java: [
    { test: (f) => /^(java\.io|java\.net|java\.nio|sun\.nio|sun\.net|javax\.net\.ssl|sun\.security\.ssl)\./.test(f.name) || /\.(socketRead0|read0|write0|poll0)$/.test(f.name), category: 'io', evidence: 'frame in a JDK I/O package' },
    { test: (f) => /^(java\.util\.concurrent\.locks|jdk\.internal\.misc\.Unsafe\.park)/.test(f.name), category: 'lock', evidence: 'lock / park' },
  ],
  go: [
    { test: (f) => /^runtime\.(gcBgMarkWorker|gcDrain|scanobject|markroot|gcMarkDone|sweepone|mallocgc|greyobject|findObject)/.test(f.name), category: 'gc', evidence: 'Go runtime GC / allocator frame' },
    { test: (f) => /^(syscall\.|internal\/poll\.|net\.|os\.\(\*File\)\.(Read|Write)|runtime\.netpoll)/.test(f.name), category: 'io', evidence: 'syscall / netpoll frame' },
    { test: (f) => /^(sync\.\(\*(RW)?Mutex\)|runtime\.(lock|lock2|semacquire|futex))/.test(f.name), category: 'lock', evidence: 'mutex / semaphore frame' },
  ],
  dotnet: [
    { test: (f) => /GarbageCollect|GC\.Collect|\bgc_heap::/i.test(f.name), category: 'gc', evidence: 'GC frame' },
    { test: (f) => /^System\.(IO|Net)\./.test(f.name), category: 'io', evidence: 'System.IO / System.Net frame' },
    { test: (f) => /^System\.Threading\.(Monitor|SpinWait|SemaphoreSlim|Lock)/.test(f.name), category: 'lock', evidence: 'System.Threading wait' },
  ],
};

export function classify(runtime: Runtime, f: FunctionStat): { category: BottleneckCategory; evidence: string } {
  for (const r of RULES[runtime] ?? []) if (r.test(f)) return { category: r.category, evidence: r.evidence };
  return { category: 'cpu', evidence: 'on-CPU in this function (self time)' };
}

function recommend(b: Bottleneck, runtime: Runtime): Recommendation | null {
  const pri = (hi: number): Recommendation['priority'] => (b.percentage >= hi ? 'high' : 'medium');
  switch (b.category) {
    case 'gc':
      return {
        issue: `${b.percentage}% of samples in garbage collection`,
        suggestion:
          runtime === 'nodejs'
            ? 'Cut allocation rate in the hot paths (reuse buffers/objects, avoid per-call closures and array copies); check analyze_memory for retained growth.'
            : runtime === 'java'
              ? 'Reduce allocation rate in hot methods; review heap sizing and GC choice (-Xmx, G1/ZGC) and check analyze_memory.'
              : 'Reduce allocation rate in hot loops; check analyze_memory for retained growth.',
        priority: pri(15),
        relatedFunction: b.function,
      };
    case 'idle':
      return {
        issue: `${b.percentage}% of samples idle / waiting`,
        suggestion: 'The process is mostly waiting (I/O, timers, requests). A CPU profile cannot explain that latency — measure the dependency (profile_endpoint, DB timings) instead.',
        priority: 'low',
        relatedFunction: b.function,
      };
    case 'io':
      return {
        issue: `Synchronous or heavy I/O in ${b.function} (${b.percentage}% self)`,
        suggestion: 'Batch or stream the I/O, cache repeated reads, move blocking calls off the hot path (async APIs, worker pool).',
        priority: pri(20),
        relatedFunction: b.function,
      };
    case 'lock':
      return {
        issue: `Lock contention / waiting in ${b.function} (${b.percentage}%)`,
        suggestion: 'Shorten critical sections, shard the lock, or use lock-free / concurrent structures.',
        priority: pri(10),
        relatedFunction: b.function,
      };
    case 'memory':
      return {
        issue: `Serialisation or copying in ${b.function} (${b.percentage}% self)`,
        suggestion: 'Avoid repeated (de)serialisation or deep copies of large objects; cache or stream instead.',
        priority: pri(20),
        relatedFunction: b.function,
      };
    default:
      if (b.percentage < 10 && b.totalPercent < 30) return null;
      return {
        issue: `CPU hotspot: ${b.function} (${b.percentage}% self, ${b.totalPercent}% total)`,
        suggestion: 'Optimise the algorithm or data structure in this function, memoise repeated work, or move it off the request path.',
        priority: pri(25),
        relatedFunction: b.function,
      };
  }
}

export function analyzeBottlenecks(
  runtime: Runtime,
  profile: ProfileScriptResult,
  threshold: number,
  opts: { jfr?: JfrBreakdown | null; limit?: number } = {}
): BottlenecksResult {
  const breakdown: Record<string, number> = {};
  const shares = profile.summary.runtimeShares;
  if (shares) {
    breakdown.gcPercent = shares.gcPercent;
    breakdown.idlePercent = shares.idlePercent;
    breakdown.programPercent = shares.programPercent;
  }
  const catTotals: Record<string, number> = {};
  for (const f of profile.topFunctions) {
    const { category } = classify(runtime, f);
    catTotals[category] = (catTotals[category] ?? 0) + f.selfPercent;
  }
  for (const [k, v] of Object.entries(catTotals)) breakdown[`${k}SelfPercent`] = round(v, 2);

  const hotspots: Bottleneck[] = [];
  // V8 meta frames are excluded from topFunctions; surface them from the shares.
  if (shares && shares.gcPercent >= threshold) {
    hotspots.push({ function: '(garbage collector)', file: '', line: 0, selfTime: 0, totalTime: 0, percentage: shares.gcPercent, totalPercent: shares.gcPercent, category: 'gc', evidence: 'V8 garbage-collector samples' });
  }
  if (shares && shares.idlePercent >= Math.max(threshold, 50)) {
    hotspots.push({ function: '(idle)', file: '', line: 0, selfTime: 0, totalTime: 0, percentage: shares.idlePercent, totalPercent: shares.idlePercent, category: 'idle', evidence: 'V8 idle samples (event loop waiting)' });
  }
  for (const f of profile.topFunctions) {
    if (f.selfPercent < threshold) continue;
    const { category, evidence } = classify(runtime, f);
    hotspots.push({
      function: f.name, file: f.file, line: f.line, selfTime: f.selfTime, totalTime: f.totalTime,
      percentage: f.selfPercent, totalPercent: f.totalPercent, category, evidence,
    });
  }
  const recommendations: Recommendation[] = [];
  if (opts.jfr) {
    const wall = Math.max(profile.duration * 1000, 1);
    breakdown.gcPausePercentOfWall = round((opts.jfr.gcPauseMs / wall) * 100, 2);
    breakdown.gcCount = opts.jfr.gcCount;
    breakdown.blockingIoMs = round(opts.jfr.ioMs, 1);
    breakdown.monitorContentionMs = round(opts.jfr.lockMs, 1);
    if (breakdown.gcPausePercentOfWall >= 5) {
      recommendations.push({
        issue: `GC pauses took ${breakdown.gcPausePercentOfWall}% of wall time (${opts.jfr.gcCount} collections, JFR)`,
        suggestion: 'Reduce allocation rate or tune the heap/GC; inspect jdk.GarbageCollection in the kept .jfr with JMC.',
        priority: breakdown.gcPausePercentOfWall >= 15 ? 'high' : 'medium',
      });
    }
    if (opts.jfr.lockMs > 0.1 * wall) {
      recommendations.push({
        issue: `Threads spent ${round(opts.jfr.lockMs, 0)} ms blocked on monitors (JFR jdk.JavaMonitorEnter)`,
        suggestion: 'Find the contended monitors in JMC (Lock Instances) and shorten or split those critical sections.',
        priority: 'medium',
      });
    }
  }
  for (const h of hotspots) {
    const r = recommend(h, runtime);
    if (r) recommendations.push(r);
  }
  const limit = opts.limit ?? 20;
  const top = hotspots.slice(0, limit);
  const counts = new Map<string, number>();
  for (const h of top) counts.set(h.category, (counts.get(h.category) ?? 0) + h.percentage);
  const topCategory = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'none';
  return {
    runId: profile.runId,
    runtime,
    hotspots: top,
    breakdown,
    hotPaths: profile.hotPaths,
    recommendations,
    summary: {
      totalBottlenecks: top.length,
      topCategory,
      estimatedImpact: top.length
        ? `${round(top.filter((h) => h.function !== '(idle)').reduce((s, h) => s + h.percentage, 0), 1)}% of sampled time in the listed hotspots`
        : `No function above ${threshold}% self time`,
    },
    artifacts: profile.artifacts,
  };
}
