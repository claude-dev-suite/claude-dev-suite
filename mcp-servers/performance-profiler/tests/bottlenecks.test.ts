// SPDX-License-Identifier: MIT
/**
 * Bottleneck classification is evidence-based, not a guess from the name.
 */

import { describe, it, expect } from 'vitest';
import { analyzeBottlenecks, classify } from '../src/analysis/bottlenecks.js';
import type { FunctionStat } from '../src/profile/model.js';
import type { ProfileScriptResult } from '../src/types.js';

const fn = (name: string, file: string, selfPercent: number, totalPercent = selfPercent): FunctionStat => ({
  name, file, line: 1, selfTime: selfPercent, totalTime: totalPercent, selfPercent, totalPercent, percentage: selfPercent,
});

describe('classify', () => {
  it('does not call user code I/O just because of its name (old heuristic: "read" → io, "array" → memory)', () => {
    expect(classify('nodejs', fn('readConfig', 'file:///app/config.js', 30)).category).toBe('cpu');
    expect(classify('nodejs', fn('buildArray', 'file:///app/util.js', 30)).category).toBe('cpu');
    expect(classify('java', fn('com.acme.Reader.readAll', 'com.acme.Reader', 30)).category).toBe('cpu');
  });
  it('recognises runtime evidence', () => {
    expect(classify('nodejs', fn('readSync', 'node:fs', 10)).category).toBe('io');
    expect(classify('python', fn("<method 'recv' of '_socket.socket' objects>", '~', 10)).category).toBe('io');
    expect(classify('python', fn('<built-in method time.sleep>', '~', 10)).category).toBe('idle');
    expect(classify('java', fn('java.net.SocketInputStream.socketRead0', 'java.net.SocketInputStream', 10)).category).toBe('io');
    expect(classify('go', fn('runtime.mallocgc', '', 10)).category).toBe('gc');
    expect(classify('go', fn('sync.(*Mutex).lockSlow', '', 10)).category).toBe('lock');
  });
});

describe('analyzeBottlenecks', () => {
  const profile = (over: Partial<ProfileScriptResult>): ProfileScriptResult => ({
    runId: 'r', runtime: 'nodejs', profiler: 'v8', scriptPath: '/x.js', duration: 10, truncated: false, hotPaths: [], artifacts: {},
    topFunctions: [fn('hot', 'file:///x.js', 60, 70), fn('cold', 'file:///x.js', 1)],
    summary: { totalTime: 1000, totalFunctions: 2, samplesCollected: 100, unit: 'milliseconds', timesAreEstimated: false,
      runtimeShares: { gcPercent: 25, idlePercent: 2, programPercent: 1 } },
    ...over,
  });

  it('surfaces measured GC share and CPU hotspots above the threshold', () => {
    const r = analyzeBottlenecks('nodejs', profile({}), 5);
    expect(r.hotspots.map((h) => [h.function, h.category])).toEqual([
      ['(garbage collector)', 'gc'],
      ['hot', 'cpu'],
    ]);
    expect(r.breakdown.gcPercent).toBe(25);
    expect(r.recommendations.some((x) => /garbage collection/.test(x.issue) && x.priority === 'high')).toBe(true);
  });

  it('uses JFR GC pause and contention totals for Java', () => {
    const r = analyzeBottlenecks('java', profile({ summary: { ...profile({}).summary, runtimeShares: undefined } }), 5, {
      jfr: { gcPauseMs: 2000, gcCount: 40, ioMs: 0, ioEvents: 0, lockMs: 3000, lockEvents: 12 },
    });
    expect(r.breakdown.gcPausePercentOfWall).toBe(20);
    expect(r.recommendations.map((x) => x.issue).join(' ')).toMatch(/GC pauses took 20%.*blocked on monitors/s);
  });
});
