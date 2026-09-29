// SPDX-License-Identifier: MIT
/**
 * Profile model: importers and self/total accounting.
 */

import { describe, it, expect } from 'vitest';
import {
  computeFunctionStats,
  dropSamplesWithFrame,
  fromCollapsed,
  fromJfrText,
  fromPprofTraces,
  fromSpeedscope,
  fromV8CpuProfile,
  hotPaths,
  parseGoDuration,
  parseIsoDurationMs,
  toCollapsed,
  toFlameGraphSvg,
  toSpeedscope,
  type V8CpuProfile,
} from '../src/profile/model.js';
import { buildCpuReport } from '../src/profile/report.js';

const cf = (functionName: string, lineNumber = 0) => ({ functionName, url: 'file:///app.js', lineNumber, columnNumber: 0, scriptId: '1' });

/** (root) → main → outer → inner ; main → other. Deltas are µs. */
const v8: V8CpuProfile = {
  nodes: [
    { id: 1, callFrame: cf('(root)'), children: [2, 6] },
    { id: 2, callFrame: cf('main', 0), children: [3, 5] },
    { id: 3, callFrame: cf('outer', 9), children: [4] },
    { id: 4, callFrame: cf('inner', 19) },
    { id: 5, callFrame: cf('other', 29) },
    { id: 6, callFrame: { functionName: '(garbage collector)', url: '', lineNumber: -1 } },
  ],
  startTime: 0,
  endTime: 10_000,
  // sample i gets the time until sample i+1
  samples: [4, 4, 4, 3, 5, 6, 4, 4, 4, 4],
  timeDeltas: [0, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000],
};

describe('fromV8CpuProfile + computeFunctionStats', () => {
  const p = fromV8CpuProfile(v8, 'test');
  const stats = computeFunctionStats(p);
  const by = (n: string) => stats.find((s) => s.name === n)!;

  it('drops (root) and attributes each sample the following time delta', () => {
    expect(p.frames.some((f) => f.name === '(root)')).toBe(false);
    expect(p.stacks.length).toBe(10);
    // 10 samples of 1 ms each; the last one takes the remainder to endTime (1 ms)
    expect(p.weights.reduce((a, b) => a + b, 0)).toBeCloseTo(10, 5);
  });

  it('separates self from total time (the old code reported total = self)', () => {
    expect(by('inner').selfTime).toBeCloseTo(7, 5);
    expect(by('outer').selfTime).toBeCloseTo(1, 5);
    expect(by('outer').totalTime).toBeCloseTo(8, 5);
    expect(by('main').selfTime).toBe(0);
    expect(by('main').totalTime).toBeCloseTo(9, 5);
    expect(by('main').totalPercent).toBe(90);
  });

  it('does not claim call counts for a sampling profile', () => {
    expect(by('inner').calls).toBeUndefined();
  });

  it('excludes V8 meta frames from the function table but reports their share', () => {
    expect(stats.some((s) => s.name === '(garbage collector)')).toBe(false);
    const report = buildCpuReport(p, 10);
    expect(report.summary.runtimeShares?.gcPercent).toBe(10);
  });

  it('hot paths follow the call tree', () => {
    const hp = hotPaths(p, 2);
    expect(hp[0].path).toEqual(['main', 'outer', 'inner']);
    expect(hp[0].percent).toBe(70);
  });

  it('can drop samples containing the profiler agent', () => {
    const filtered = dropSamplesWithFrame(p, (f) => f.name === 'other');
    expect(filtered.stacks.length).toBe(9);
  });
});

describe('recursion', () => {
  it('counts a recursive function once per sample in total time', () => {
    const p = fromCollapsed('main;fib;fib;fib 10\nmain;fib 5\n', 'rec');
    const fib = computeFunctionStats(p).find((s) => s.name === 'fib')!;
    expect(fib.totalSamples).toBe(15);
    expect(fib.selfSamples).toBe(15);
    expect(fib.totalPercent).toBe(100);
  });
});

// Captured from `jfr print --stack-depth 64 --events jdk.ExecutionSample` on JDK 21.
const JFR_TEXT = `jdk.ExecutionSample {
  startTime = 12:35:53.133 (2026-09-29)
  sampledThread = "main" (javaThreadId = 1)
  state = "STATE_RUNNABLE"
  stackTrace = [
    Hot.inner(int) line: 2
    Hot.outer(int) line: 3
    Hot.main(String[]) line: 6
  ]
}

jdk.ExecutionSample {
  startTime = 12:35:53.143 (2026-09-29)
  sampledThread = "main" (javaThreadId = 1)
  state = "STATE_RUNNABLE"
  stackTrace = [
    Hot.inner(int) line: 2
    Hot.outer(int) line: 3
    Hot.main(String[]) line: 6
  ]
}

jdk.ExecutionSample {
  startTime = 12:35:53.153 (2026-09-29)
  sampledThread = "main" (javaThreadId = 1)
  state = "STATE_RUNNABLE"
  stackTrace = [
    Hot.outer(int) line: 3
    Hot.main(String[]) line: 6
    ...
  ]
}

jdk.JavaMonitorEnter {
  startTime = 12:35:53.096 (2026-09-29)
  duration = 10,1 ms
  stackTrace = [
    jdk.jfr.internal.PlatformRecorder.periodicTask() line: 514
  ]
}
`;

describe('fromJfrText', () => {
  const { profile, truncatedStacks } = fromJfrText(JFR_TEXT, 'java', 10);
  const stats = computeFunctionStats(profile);
  const by = (n: string) => stats.find((s) => s.name === n)!;

  it('counts only the top frame as self time (the old parser counted every frame)', () => {
    expect(by('Hot.inner').selfSamples).toBe(2);
    expect(by('Hot.outer').selfSamples).toBe(1);
    expect(by('Hot.main').selfSamples).toBe(0);
  });

  it('counts every frame once for total time', () => {
    expect(by('Hot.outer').totalSamples).toBe(3);
    expect(by('Hot.main').totalSamples).toBe(3);
    expect(by('Hot.main').totalPercent).toBe(100);
  });

  it('only parses execution samples and reports truncated stacks', () => {
    expect(profile.stacks.length).toBe(3);
    expect(truncatedStacks).toBe(1);
    expect(stats.some((s) => s.name.includes('PlatformRecorder'))).toBe(false);
  });

  it('estimates ms from the sampling interval and says so', () => {
    expect(by('Hot.inner').selfTime).toBe(20);
    expect(buildCpuReport(profile).summary.timesAreEstimated).toBe(true);
  });
});

describe('ISO / Go durations', () => {
  it('parses jfr --json durations', () => {
    expect(parseIsoDurationMs('PT0.0061822S')).toBeCloseTo(6.1822, 4);
    expect(parseIsoDurationMs('PT1M2.5S')).toBe(62_500);
    expect(parseIsoDurationMs('garbage')).toBe(0);
  });
  it('parses pprof durations', () => {
    expect(parseGoDuration('10ms')).toBe(10);
    expect(parseGoDuration('1.20s')).toBe(1200);
    expect(parseGoDuration('500us')).toBe(0.5);
    expect(parseGoDuration('1m2s')).toBe(62_000);
    expect(parseGoDuration('bytes:64kB')).toBeNull();
  });
});

describe('fromPprofTraces', () => {
  const text = `File: pkg.test
Type: cpu
Time: 2026-09-29 10:00:00 CEST
Duration: 1.21s, Total samples = 1.10s (90.91%)
-----------+-------------------------------------------------------
      30ms   main.inner
             main.outer
             testing.(*B).runN
-----------+-------------------------------------------------------
      10ms   runtime.mallocgc
             main.outer
             testing.(*B).runN
-----------+-------------------------------------------------------
`;
  it('reads leaf-first blocks into root-first stacks with ms weights', () => {
    const p = fromPprofTraces(text);
    const stats = computeFunctionStats(p);
    expect(stats[0]).toMatchObject({ name: 'main.inner', selfTime: 30 });
    expect(stats.find((s) => s.name === 'main.outer')!.totalTime).toBe(40);
    expect(p.stacks[0][0]).toBe(p.frames.findIndex((f) => f.name === 'testing.(*B).runN'));
  });
});

describe('fromCollapsed (py-spy raw)', () => {
  it('parses "func (file:line)" frames', () => {
    const p = fromCollapsed('<module> (app.py:10);handler (app.py:3);compute (lib.py:7) 40\n<module> (app.py:10);io_wait (lib.py:20) 10\n', 'py', 'samples', 10);
    const stats = computeFunctionStats(p);
    expect(stats[0]).toMatchObject({ name: 'compute', file: 'lib.py', selfSamples: 40, selfTime: 400 });
  });
});

describe('fromSpeedscope', () => {
  it('converts evented profiles (dotnet-trace) into weighted stacks', () => {
    const p = fromSpeedscope({
      shared: { frames: [{ name: 'Main' }, { name: 'Work' }] },
      profiles: [
        {
          type: 'evented',
          unit: 'milliseconds',
          events: [
            { type: 'O', at: 0, frame: 0 },
            { type: 'O', at: 2, frame: 1 },
            { type: 'C', at: 7, frame: 1 },
            { type: 'C', at: 10, frame: 0 },
          ],
        },
      ],
    });
    const stats = computeFunctionStats(p);
    expect(stats.find((s) => s.name === 'Work')!.selfTime).toBe(5);
    expect(stats.find((s) => s.name === 'Main')!.totalTime).toBe(10);
    expect(stats.find((s) => s.name === 'Main')!.selfTime).toBe(5);
  });
});

describe('serialisers', () => {
  const p = fromCollapsed('a;b 3\na;c<&> 1\n', 'x');
  it('writes collapsed stacks', () => {
    expect(toCollapsed(p).text).toBe('a;b 3\na;c<&> 1\n');
  });
  it('writes a speedscope sampled profile', () => {
    const s = toSpeedscope(p) as { profiles: Array<{ type: string; samples: number[][]; weights: number[] }>; shared: { frames: unknown[] } };
    expect(s.profiles[0].type).toBe('sampled');
    expect(s.profiles[0].samples.length).toBe(s.profiles[0].weights.length);
    expect(s.shared.frames.length).toBe(3);
  });
  it('writes a self-contained, escaped flame graph', () => {
    const svg = toFlameGraphSvg(p);
    expect(svg.startsWith('<?xml')).toBe(true);
    expect(svg).toContain('<rect');
    expect(svg).toContain('c&lt;&amp;&gt;');
    expect(svg).not.toContain('<script');
  });
});
