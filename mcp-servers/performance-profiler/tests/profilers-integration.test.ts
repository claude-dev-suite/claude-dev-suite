// SPDX-License-Identifier: MIT
/**
 * Real profiler runs. Node is always available; Python and Java tests skip
 * automatically when the interpreter / JDK tools are missing.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync } from 'fs';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import * as node from '../src/profilers/nodejs.js';
import * as python from '../src/profilers/python.js';
import * as java from '../src/profilers/java.js';
import { benchmark, profileFunction } from '../src/bench/benchmark.js';
import { measureStartup } from '../src/analysis/startup.js';
import { commandAvailable, resolvePython } from '../src/utils/process.js';

let dir: string;
const f = (name: string) => join(dir, name);

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'pp-int-'));
  await writeFile(
    f('forever.js'),
    `function hot() { let s = 0; for (let i = 0; i < 3e5; i++) s += Math.sqrt(i); return s; }
     console.log('{"looks":"like json"}');
     setInterval(hot, 1);`
  );
  await writeFile(
    f('short.js'),
    `function inner(n) { let s = 0; for (let i = 0; i < n; i++) s += Math.sqrt(i); return s; }
     function outer() { let t = 0; for (let i = 0; i < 20; i++) t += inner(2e5); return t; }
     const end = Date.now() + 700; let x = 0; while (Date.now() < end) x += outer(); console.log(x);`
  );
  await writeFile(
    f('leak.js'),
    `class LeakyThing { constructor(i) { this.i = i; this.s = 'x'.repeat(100) + i; } }
     const keep = []; setInterval(() => { for (let i = 0; i < 3000; i++) keep.push(new LeakyThing(i)); }, 40);`
  );
  await writeFile(f('bench.mjs'), `console.log('stdout noise that used to break JSON parsing');\nexport default function () { let s = 0; for (let i = 0; i < 500; i++) s += i; return s; }\nexport function add(a, b) { console.log('noise'); return a + b; }\n`);
  await writeFile(f('ready.js'), `setTimeout(() => console.log('Listening on :0'), 150); setTimeout(() => {}, 60000);`);
  await writeFile(
    f('forever.py'),
    `import math\nprint('{"noise": true}')\ndef hot():\n    return sum(math.sqrt(i) for i in range(20000))\nwhile True:\n    hot()\n`
  );
  await writeFile(f('leak.py'), `import time\nkeep = []\nwhile True:\n    keep.extend(['q' * 100 + str(i) for i in range(3000)])\n    time.sleep(0.04)\n`);
  await writeFile(f('bench.py'), `print('noise')\ndef bench():\n    return sum(range(300))\n`);
  await writeFile(
    f('Hot.java'),
    `public class Hot {
       static double inner(int n){ double s=0; for(int i=0;i<n;i++) s+=Math.sqrt(i); return s; }
       static double outer(int n){ double t=0; for(int i=0;i<50;i++) t+=inner(n); return t; }
       public static void main(String[] a) throws Exception { double x=0; while(true) x+=outer(100000); }
     }`
  );
});
afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('Node', () => {
  it('profiles a process that never exits, stopping it after the duration (--cpu-prof never wrote a file here)', async () => {
    const r = await node.profileScript(f('forever.js'), [], { durationS: 2, limit: 10 });
    expect(r.target?.stoppedBy).toBe('duration');
    expect(r.topFunctions[0].name).toBe('hot');
    expect(existsSync(r.artifacts.cpuprofile)).toBe(true);
    expect(existsSync(r.artifacts.flameGraph)).toBe(true);
    expect(existsSync(r.artifacts.speedscope)).toBe(true);
    expect(r.topFunctions.some((t) => t.file.endsWith('pp-agent.cjs'))).toBe(false);
  });

  it('reports total time above self time for callers', async () => {
    const r = await node.profileScript(f('short.js'), [], { durationS: 10, limit: 50 });
    expect(r.target?.stoppedBy).toBe('exit');
    const outer = r.topFunctions.find((t) => t.name === 'outer')!;
    const inner = r.topFunctions.find((t) => t.name === 'inner')!;
    expect(inner.selfPercent).toBeGreaterThan(50);
    expect(outer.totalTime).toBeGreaterThanOrEqual(inner.totalTime);
    expect(outer.selfTime).toBeLessThan(outer.totalTime);
  });

  it("measures the target's heap, not the wrapper's, and detects the leak", async () => {
    const r = await node.analyzeMemory(f('leak.js'), { durationS: 4, intervalMs: 250, forceGc: true, snapshots: true, limit: 10 });
    expect(r.summary.measuredProcess).toMatch(/target process/);
    expect(r.summary.finalHeap - r.summary.initialHeap).toBeGreaterThan(3 * 1024 * 1024);
    expect(r.potentialLeaks.verdict).toBe('likely-leak');
    const diff = r.diff as { topGrowth: Array<{ constructor: string; newObjects: number }> };
    expect(diff.topGrowth.some((g) => g.constructor === 'LeakyThing' && g.newObjects > 1000)).toBe(true);
  }, 90_000);

  it('benchmarks an exported function in-process despite stdout noise, and compares A/B', async () => {
    const r = await benchmark('nodejs', { scriptPath: f('bench.mjs') }, { iterations: 50, warmup: 5, compare: { scriptPath: f('bench.mjs') } });
    expect(r.mode).toBe('in-process');
    expect(r.timing.n + r.timing.outliersRemoved).toBe(50);
    expect(r.timing.n).toBeGreaterThan(25);
    expect(r.timing.ci95[0]).toBeLessThanOrEqual(r.timing.mean);
    expect(r.comparison?.welch.pValue).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(r.comparison!.welch.diffPct)).toBe(true);
    expect(r.comparison!.verdict).toMatch(/B is|No statistically significant/);
  });

  it('profile_function passes args and survives console.log in the function', async () => {
    const r = await profileFunction('nodejs', f('bench.mjs'), 'add', [1, 2], 20, 2);
    expect(r.timing.n).toBeGreaterThan(10);
  });

  it('benchmark in process mode honours iterations (they used to be ignored)', async () => {
    const r = await benchmark('nodejs', { scriptPath: f('short.js') }, { iterations: 2, warmup: 0 });
    expect(r.mode).toBe('process');
    expect(r.iterations).toBe(2);
    expect(r.timing.mean).toBeGreaterThan(600);
  }, 60_000);

  it('measure_startup measures time-to-ready from a log line, not total run time', async () => {
    const r = await measureStartup('nodejs', f('ready.js'), { runs: 2, readyLogPattern: 'Listening on', timeoutS: 20 });
    expect(r.mode).toBe('log');
    expect(r.runs.every((x) => x.ready)).toBe(true);
    // the process would run for 60 s; readiness is ~150 ms after start
    expect(r.summary.max).toBeLessThan(5000);
  });

  it('raw code stays gated behind the env flag', async () => {
    delete process.env.PERF_PROFILER_ALLOW_RAW_CODE;
    await expect(benchmark('nodejs', { code: 'return 1' }, {})).rejects.toThrow(/disabled/);
  });
});

describe('Python', async () => {
  const py = await resolvePython();
  const it_ = py ? it : it.skip;

  it_('cProfile honours the duration on an endless script and reports exact call counts', async () => {
    const r = await python.profileScript(f('forever.py'), [], { durationS: 2, limit: 20 });
    expect(r.target?.stoppedBy).toBe('duration');
    const hot = r.topFunctions.find((t) => t.name === 'hot');
    expect(hot?.calls).toBeGreaterThan(0);
    expect(r.target?.wallTimeMs).toBeLessThan(15_000);
  }, 60_000);

  it_('tracemalloc diff points at the leaking line', async () => {
    const r = await python.analyzeMemory(f('leak.py'), { durationS: 4, intervalMs: 250, forceGc: false, limit: 5 });
    expect(r.potentialLeaks.verdict).toBe('likely-leak');
    const diff = r.diff as { topGrowth: Array<{ file: string; line: number }> };
    expect(diff.topGrowth[0].file).toMatch(/leak\.py$/);
    expect(diff.topGrowth[0].line).toBe(4);
  }, 60_000);

  it_('benchmarks a bench() function in-process despite stdout noise', async () => {
    const r = await benchmark('python', { scriptPath: f('bench.py') }, { iterations: 30, warmup: 3 });
    expect(r.mode).toBe('in-process');
    expect(r.timing.n).toBeGreaterThan(20);
  }, 60_000);
});

describe('Java (JFR)', async () => {
  const hasJfr = (await commandAvailable('jfr', ['version'])) && (await commandAvailable('java', ['-version']));
  const it_ = hasJfr ? it : it.skip;

  it_('parses JFR samples (recording.events / --stack-depth) with self vs total, stopping a never-ending JVM', async () => {
    const r = await java.profileScript(f('Hot.java'), [], { durationS: 4, limit: 10 });
    expect(r.target?.stoppedBy).toBe('duration');
    expect(r.summary.samplesCollected).toBeGreaterThan(20);
    const inner = r.topFunctions.find((t) => t.name === 'Hot.inner')!;
    const outer = r.topFunctions.find((t) => t.name === 'Hot.outer');
    expect(inner.selfPercent).toBeGreaterThan(50);
    if (outer) expect(outer.totalPercent).toBeGreaterThanOrEqual(inner.totalPercent);
    expect(existsSync(r.artifacts.jfr)).toBe(true);
  }, 120_000);

  it_('a failing `jfr print` is an error, not an empty profile', async () => {
    await expect(java.parseJfrRecording(f('not-a-recording.jfr'), dir)).rejects.toThrow(/jfr print failed/);
  });

  it_('measures heap and class histogram of the JVM it launched (not "the first JVM jcmd lists")', async () => {
    await writeFile(
      f('Leak.java'),
      `import java.util.*;
       public class Leak { static List<byte[]> keep = new ArrayList<>();
         public static void main(String[] a) throws Exception { while (true) { keep.add(new byte[20000]); Thread.sleep(3); } } }`
    );
    const r = await java.analyzeMemory(f('Leak.java'), { durationS: 8, intervalMs: 500, forceGc: true, limit: 5 });
    expect(r.summary.measuredProcess).toMatch(/launched JVM \(pid \d+\)/);
    expect(r.snapshots.length).toBeGreaterThanOrEqual(3);
    const diff = r.diff as { topGrowth: Array<{ className: string; bytesDelta: number }> };
    expect(diff.topGrowth[0].className).toBe('[B');
    expect(diff.topGrowth[0].bytesDelta).toBeGreaterThan(1_000_000);
  }, 120_000);
});
