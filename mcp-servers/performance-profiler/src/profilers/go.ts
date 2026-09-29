// SPDX-License-Identifier: MIT
/**
 * Go CPU profiling via `go test -cpuprofile` and `go tool pprof -traces`.
 * `scriptPath` is a package directory (or any file in it).
 */

import { access, stat } from 'fs/promises';
import { dirname, join } from 'path';
import { createRunDir } from '../utils/artifacts.js';
import { commandAvailable, runCommand, spawnProcess, validateScriptPath } from '../utils/process.js';
import { outputExcerpt } from '../utils/redact.js';
import { fromPprofTraces } from '../profile/model.js';
import { buildCpuReport, writeCpuArtifacts } from '../profile/report.js';
import { recordRun } from '../results/store.js';
import { checkDuration, failureDetail, type CpuProfileOptions } from './common.js';
import { cpuMetrics } from './nodejs.js';
import type { ProfileScriptResult } from '../types.js';

export interface GoBenchLine {
  name: string;
  iterations: number;
  nsPerOp: number;
  bytesPerOp?: number;
  allocsPerOp?: number;
}

/** Parse `go test -bench` result lines. */
export function parseGoBench(text: string): GoBenchLine[] {
  const out: GoBenchLine[] = [];
  for (const m of text.matchAll(/^(Benchmark\S+)\s+(\d+)\s+([\d.]+) ns\/op(?:\s+([\d.]+) B\/op)?(?:\s+(\d+) allocs\/op)?/gm)) {
    out.push({
      name: m[1],
      iterations: Number(m[2]),
      nsPerOp: Number(m[3]),
      ...(m[4] ? { bytesPerOp: Number(m[4]) } : {}),
      ...(m[5] ? { allocsPerOp: Number(m[5]) } : {}),
    });
  }
  return out;
}

export async function profileScript(scriptPath: string, _args: string[], opts: CpuProfileOptions): Promise<ProfileScriptResult> {
  validateScriptPath(scriptPath);
  checkDuration(opts.durationS);
  if (!(await commandAvailable('go', ['version']))) {
    throw new Error('`go` was not found on PATH; install Go to profile Go packages.');
  }
  const pkgDir = (await stat(scriptPath)).isDirectory() ? scriptPath : dirname(scriptPath);
  const { runId, dir } = await createRunDir('go-cpu');
  const prof = join(dir, 'cpu.pprof');
  const bin = join(dir, process.platform === 'win32' ? 'pkg.test.exe' : 'pkg.test');
  const args = ['test', '-count=1', `-cpuprofile=${prof}`, `-o=${bin}`];
  if (opts.goBench) args.push('-run=^$', `-bench=${opts.goBench}`, `-benchtime=${Math.max(1, Math.round(opts.durationS))}s`, '-benchmem');
  else args.push(`-run=${opts.goTest ?? '.'}`, `-timeout=${Math.ceil(opts.durationS + 60)}s`);
  args.push('.');
  const res = await spawnProcess('go', args, { cwd: pkgDir, timeout: opts.durationS * 1000 + 300_000, signal: opts.signal });
  if (res.exitCode !== 0) throw new Error(`go test failed (${failureDetail(res)}): ${outputExcerpt(res.stdout, 1500)?.text ?? ''}`);
  try {
    await access(prof);
  } catch {
    throw new Error('go test wrote no CPU profile (no tests or benchmarks matched?).');
  }
  const traces = await runCommand({ cmd: 'go', args: ['tool', 'pprof', '-traces', bin, prof] }, { cwd: pkgDir, timeout: 120_000 });
  if (traces.exitCode !== 0) throw new Error(`go tool pprof failed: ${failureDetail(traces)}`);
  const profile = fromPprofTraces(traces.stdout, `go ${pkgDir}`);
  if (profile.stacks.length === 0) {
    throw new Error('The Go CPU profile has no samples; the tests/benchmarks ran too briefly. Use goBench with a longer duration.');
  }
  const report = buildCpuReport(profile, opts.limit);
  const artifacts = { pprof: prof, testBinary: bin, ...(await writeCpuArtifacts(profile, dir)) };
  const benchmarks = parseGoBench(res.stdout);
  await recordRun(dir, { runId, kind: 'cpu_profile', subject: pkgDir, metrics: cpuMetrics(report) });
  return {
    runId,
    runtime: 'go',
    profiler: 'pprof',
    scriptPath: pkgDir,
    duration: opts.durationS,
    ...report,
    artifacts,
    notes: [
      opts.goBench ? `Profiled benchmarks matching ${opts.goBench}.` : `Profiled tests matching ${opts.goTest ?? '.'}; pass goBench to profile benchmarks.`,
      ...(benchmarks.length ? [`Benchmarks: ${benchmarks.map((b) => `${b.name} ${b.nsPerOp} ns/op`).join(', ')}`] : []),
      `Explore interactively with: go tool pprof -http=: ${prof}`,
    ],
  };
}

