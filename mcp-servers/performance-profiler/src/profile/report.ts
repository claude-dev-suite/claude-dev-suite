// SPDX-License-Identifier: MIT
/**
 * Turn a SampledProfile into (a) bounded tool output and (b) kept artifacts.
 */

import { writeArtifact } from '../utils/artifacts.js';
import { round } from '../utils/statistics.js';
import {
  computeFunctionStats,
  hotPaths,
  leafShare,
  toCollapsed,
  toFlameGraphSvg,
  toMs,
  toSpeedscope,
  totalWeight,
  type FunctionStat,
  type HotPath,
  type SampledProfile,
} from './model.js';

export interface CpuArtifacts {
  speedscope: string;
  collapsed: string;
  flameGraph: string;
  [raw: string]: string;
}

export interface CpuReport {
  topFunctions: FunctionStat[];
  truncated: boolean;
  hotPaths: HotPath[];
  summary: {
    totalTime: number;
    totalFunctions: number;
    samplesCollected: number;
    unit: 'milliseconds' | 'samples';
    timesAreEstimated: boolean;
    sampleIntervalMs?: number;
    /** V8 only: share of samples in GC, idle and "(program)" (native/runtime). */
    runtimeShares?: { gcPercent: number; idlePercent: number; programPercent: number };
  };
}

export function buildCpuReport(p: SampledProfile, limit = 20): CpuReport {
  const stats = computeFunctionStats(p);
  const cap = Math.max(1, Math.min(limit, 500));
  const share = (name: string) => round(leafShare(p, (f) => f.name === name) * 100, 2);
  const gc = share('(garbage collector)');
  const idle = share('(idle)');
  const program = share('(program)');
  return {
    topFunctions: stats.slice(0, cap),
    truncated: stats.length > cap,
    hotPaths: hotPaths(p, 5),
    summary: {
      totalTime: round(toMs(p, totalWeight(p)), 3),
      totalFunctions: stats.length,
      samplesCollected: p.stacks.length,
      unit: p.unit,
      timesAreEstimated: p.unit === 'samples',
      ...(p.sampleIntervalMs ? { sampleIntervalMs: p.sampleIntervalMs } : {}),
      ...(gc || idle || program ? { runtimeShares: { gcPercent: gc, idlePercent: idle, programPercent: program } } : {}),
    },
  };
}

/** Write speedscope JSON, collapsed stacks and a flame graph SVG next to any raw profile. */
export async function writeCpuArtifacts(p: SampledProfile, dir: string, base = 'cpu'): Promise<CpuArtifacts> {
  const collapsed = toCollapsed(p);
  return {
    speedscope: await writeArtifact(dir, `${base}.speedscope.json`, JSON.stringify(toSpeedscope(p))),
    collapsed: await writeArtifact(dir, `${base}.collapsed.txt`, collapsed.text),
    flameGraph: await writeArtifact(dir, `${base}.flamegraph.svg`, toFlameGraphSvg(p)),
  };
}
