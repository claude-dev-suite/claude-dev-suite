// SPDX-License-Identifier: MIT
/**
 * Parsers for external tool output, fed with captured/fake output.
 */

import { describe, it, expect } from 'vitest';
import { diffHistograms, parseClassHistogram, parseHeapInfo } from '../src/profilers/java.js';
import { parseGoBench } from '../src/profilers/go.js';
import { parseCountersJson } from '../src/profilers/dotnet.js';
import { parseJps, parseNetstatListening, parseSsListening } from '../src/live/process-finder.js';
import { parseLighthouseResult } from '../src/web/vitals.js';
import { diffSnapshots, parseSnapshotJson, summarizeHeapProfile } from '../src/memory/heap-snapshot.js';

describe('jcmd GC.heap_info', () => {
  it('parses G1 (captured from JDK 21)', () => {
    const g1 = `30172:
 garbage-first heap   total 524288K, used 18064K [0x0000000601400000, 0x0000000800000000)
  region size 4096K, 5 young (20480K), 1 survivors (4096K)
 Metaspace       used 10008K, committed 10240K, reserved 1114112K
  class space    used 1164K, committed 1280K, reserved 1048576K`;
    expect(parseHeapInfo(g1)).toEqual({ used: 18064 * 1024, total: 524288 * 1024 });
  });
  it('sums generations for Parallel GC and ignores Metaspace', () => {
    const par = ` PSYoungGen      total 76288K, used 3932K [0x00000007, 0x0000000, 0x00000)
  eden space 65536K, 6% used [0x0000,0x0000,0x0000)
 ParOldGen       total 175104K, used 1000K [0x0000, 0x0000, 0x0000)
 Metaspace       used 5000K, committed 5120K, reserved 1056768K`;
    expect(parseHeapInfo(par)).toEqual({ used: (3932 + 1000) * 1024, total: (76288 + 175104) * 1024 });
  });
  it('parses ZGC', () => {
    expect(parseHeapInfo(' ZHeap           used 10M, capacity 20M, max capacity 4096M')).toEqual({ used: 10 * 1048576, total: 20 * 1048576 });
  });
  it('returns null for unknown formats', () => {
    expect(parseHeapInfo('nothing here')).toBeNull();
  });
});

describe('jcmd GC.class_histogram', () => {
  const before = ` num     #instances         #bytes  class name (module)
-------------------------------------------------------
   1:         12167        9292320  [B (java.base@21.0.7)
   2:          2835         338928  java.lang.Class (java.base@21.0.7)
   3:           100           2400  com.acme.Session
Total         15102        9633648`;
  const after = before.replace('12167        9292320', '12548       13210360').replace('100           2400', '5100         122400');
  it('parses rows and diffs by class', () => {
    const a = parseClassHistogram(before);
    expect(a.get('[B')).toEqual({ className: '[B', instances: 12167, bytes: 9292320 });
    const d = diffHistograms(a, parseClassHistogram(after));
    expect(d.topGrowth[0].className).toBe('[B');
    expect(d.topGrowth[1]).toMatchObject({ className: 'com.acme.Session', instancesDelta: 5000, bytesDelta: 120000 });
    expect(d.netSizeDelta).toBe(13210360 - 9292320 + 120000);
  });
});

describe('process discovery parsers', () => {
  it('netstat -ano (Windows)', () => {
    const out = `
Connessioni attive

  Proto  Indirizzo locale       Indirizzo esterno      Stato           PID
  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       1234
  TCP    127.0.0.1:8080         127.0.0.1:50000        ESTABLISHED     999
  TCP    0.0.0.0:8080           0.0.0.0:0              LISTENING       4321
  TCP    [::]:9229              [::]:0                 LISTENING       777`;
    expect(parseNetstatListening(out, 8080)).toBe(4321);
    expect(parseNetstatListening(out, 9229)).toBe(777);
    expect(parseNetstatListening(out, 1)).toBeNull();
  });
  it('ss -ltnpH (Linux)', () => {
    const out = `LISTEN 0      511          0.0.0.0:3000      0.0.0.0:*    users:(("node",pid=4242,fd=21))
LISTEN 0      4096            [::]:8080         [::]:*    users:(("java",pid=5151,fd=9))`;
    expect(parseSsListening(out, 8080)).toBe(5151);
    expect(parseSsListening(out, 3000)).toBe(4242);
  });
  it('jps -l skips itself', () => {
    expect(parseJps('123 com.acme.App\n456 jdk.jcmd/sun.tools.jps.Jps\n789 app.jar\n')).toEqual([
      { pid: 123, name: 'com.acme.App', command: 'java com.acme.App' },
      { pid: 789, name: 'app.jar', command: 'java app.jar' },
    ]);
  });
});

describe('go test -bench', () => {
  it('parses ns/op, B/op, allocs/op', () => {
    const out = 'goos: linux\nBenchmarkParse-8   \t  123456\t      9876 ns/op\t     512 B/op\t       3 allocs/op\nPASS\n';
    expect(parseGoBench(out)).toEqual([{ name: 'BenchmarkParse-8', iterations: 123456, nsPerOp: 9876, bytesPerOp: 512, allocsPerOp: 3 }]);
  });
});

describe('dotnet-counters json', () => {
  it('extracts the GC heap series even from an unterminated file', () => {
    const text = `{"TargetProcess": "app", "StartTime": "9/29/2026 10:00:00 AM", "Events": [
{"timestamp": "2026-09-29 10:00:01Z", "provider": "System.Runtime", "name": "GC Heap Size (MB)", "tags": "", "counterType": "Metric", "value": 10.5 },
{"timestamp": "2026-09-29 10:00:01Z", "provider": "System.Runtime", "name": "CPU Usage (%)", "tags": "", "counterType": "Metric", "value": 3 },
{"timestamp": "2026-09-29 10:00:02Z", "provider": "System.Runtime", "name": "GC Heap Size (MB)", "tags": "", "counterType": "Metric", "value": 12 },`;
    const s = parseCountersJson(text);
    expect(s).toEqual([
      { t: 0, used: 10.5 * 1048576 },
      { t: 1000, used: 12 * 1048576 },
    ]);
  });
});

describe('Lighthouse result', () => {
  it('extracts metrics, score and top opportunities', () => {
    const lhr = {
      lighthouseVersion: '12.2.0',
      finalDisplayedUrl: 'http://localhost:3000/',
      categories: { performance: { score: 0.73 } },
      audits: {
        'largest-contentful-paint': { id: 'largest-contentful-paint', title: 'LCP', score: 0.5, numericValue: 3120.44 },
        'cumulative-layout-shift': { id: 'cumulative-layout-shift', title: 'CLS', score: 0.9, numericValue: 0.123456 },
        'total-blocking-time': { id: 'total-blocking-time', title: 'TBT', score: 0.6, numericValue: 410 },
        'first-contentful-paint': { id: 'first-contentful-paint', title: 'FCP', score: 0.8, numericValue: 1500 },
        interactive: { id: 'interactive', title: 'TTI', score: 0.7, numericValue: 5200 },
        'render-blocking-resources': { id: 'render-blocking-resources', title: 'Eliminate render-blocking resources', score: 0.3, details: { type: 'opportunity', overallSavingsMs: 900 } },
        'unused-javascript': { id: 'unused-javascript', title: 'Reduce unused JavaScript', score: 0.4, details: { type: 'opportunity', overallSavingsMs: 1500, overallSavingsBytes: 200000 } },
        'uses-http2': { id: 'uses-http2', title: 'HTTP/2', score: 1, details: { type: 'opportunity', overallSavingsMs: 0 } },
      },
    };
    const r = parseLighthouseResult(lhr);
    expect(r.metrics).toMatchObject({ performanceScore: 73, lcpMs: 3120.4, cls: 0.1235, tbtMs: 410, fcpMs: 1500, ttiMs: 5200 });
    expect(r.opportunities.map((o) => o.id)).toEqual(['unused-javascript', 'render-blocking-resources']);
  });
  it('surfaces Lighthouse runtime errors instead of empty metrics', () => {
    expect(() => parseLighthouseResult({ runtimeError: { code: 'NO_FCP', message: 'no paint' }, audits: {} })).toThrow(/NO_FCP/);
  });
});

describe('V8 heap snapshot diff', () => {
  const meta = {
    node_fields: ['type', 'name', 'id', 'self_size', 'edge_count', 'trace_node_id', 'detachedness'],
    node_types: [['hidden', 'array', 'string', 'object', 'code', 'closure', 'regexp', 'number', 'native', 'synthetic'], 'string', 'number'],
  };
  const strings = ['', 'Session', 'Cache', 'x'];
  // type, name, id, self_size, edge_count, trace, detached
  const snap = (rows: number[][]) => ({ snapshot: { meta }, nodes: rows.flat(), strings });
  const s1 = snap([
    [3, 1, 1, 100, 0, 0, 0],
    [3, 2, 3, 50, 0, 0, 0],
    [2, 3, 5, 20, 0, 0, 0],
    [9, 0, 7, 0, 0, 0, 0],
  ]);
  const s2 = snap([
    [3, 1, 1, 100, 0, 0, 0],
    [3, 1, 11, 100, 0, 0, 0],
    [3, 1, 13, 100, 0, 0, 0],
    [2, 3, 15, 20, 0, 0, 0],
  ]);
  it('reports new/freed objects per constructor using stable ids', () => {
    const d = diffSnapshots(parseSnapshotJson(s1 as never), parseSnapshotJson(s2 as never));
    const session = d.topGrowth.find((r) => r.constructor === 'Session')!;
    expect(session).toMatchObject({ countBefore: 1, countAfter: 3, newObjects: 2, newSize: 200, freedObjects: 0, netSizeDelta: 200 });
    expect(d.topGrowth.some((r) => r.constructor === 'Cache')).toBe(false); // shrank
    expect(d.netSizeDelta).toBe(320 - 170);
    expect(d.sizeKind).toBe('shallow');
  });
  it('aggregates a sampling heap profile by allocation site', () => {
    const r = summarizeHeapProfile({
      head: {
        callFrame: { functionName: '(root)', url: '', lineNumber: -1 },
        selfSize: 0,
        children: [
          { callFrame: { functionName: 'alloc', url: 'file:///a.js', lineNumber: 4 }, selfSize: 300 },
          { callFrame: { functionName: 'other', url: 'file:///a.js', lineNumber: 9 }, selfSize: 100 },
        ],
      },
    });
    expect(r.totalBytes).toBe(400);
    expect(r.sites[0]).toMatchObject({ function: 'alloc', line: 5, liveBytes: 300, percent: 75 });
  });
});
