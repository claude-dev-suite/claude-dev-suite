// SPDX-License-Identifier: MIT
/**
 * Performance Profiler shared types.
 */

import type { FunctionStat, HotPath } from './profile/model.js';
import type { CpuArtifacts } from './profile/report.js';
import type { LeakAssessment } from './memory/leak.js';
import type { SampleSummary, WelchResult } from './utils/statistics.js';

export type Runtime = 'nodejs' | 'java' | 'python' | 'go' | 'dotnet';

export interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  duration: number;
}

/** Back-compat name for a function row in a CPU profile. */
export type FunctionProfile = FunctionStat;

export interface OutputExcerpt {
  text: string;
  truncated: boolean;
}

export interface TargetRunInfo {
  exitCode: number | null;
  /** `duration` = stopped by the profiler when the duration elapsed; `exit` = finished on its own. */
  stoppedBy: 'exit' | 'duration' | 'timeout';
  wallTimeMs: number;
  stdout?: OutputExcerpt;
  stderr?: OutputExcerpt;
}

export interface ProfileScriptResult {
  runId: string;
  runtime: Runtime;
  profiler: string;
  scriptPath: string;
  duration: number;
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
    runtimeShares?: { gcPercent: number; idlePercent: number; programPercent: number };
  };
  artifacts: Partial<CpuArtifacts> & Record<string, string>;
  target?: TargetRunInfo;
  notes?: string[];
}

export interface ProfileFunctionResult {
  runId: string;
  functionName: string;
  iterations: number;
  warmup: number;
  timing: SampleSummary;
  memory?: {
    heapUsedBefore: number;
    heapUsedAfter: number;
    delta: number;
  };
  unit: 'ms';
}

export interface BenchmarkResult {
  runId: string;
  mode: 'in-process' | 'process';
  iterations: number;
  warmupIterations: number;
  /** Milliseconds per iteration. */
  timing: SampleSummary;
  comparison?: {
    variantB: { timing: SampleSummary };
    welch: WelchResult;
    verdict: string;
  };
  notes?: string[];
}

export interface MemorySnapshot {
  timestamp: number;
  heapUsed: number;
  heapTotal: number;
  rss?: number;
  external?: number;
}

export interface MemoryAnalysisResult {
  runId: string;
  runtime: Runtime;
  target: string;
  snapshots: MemorySnapshot[];
  snapshotsTruncated: boolean;
  summary: {
    initialHeap: number;
    finalHeap: number;
    peakHeap: number;
    avgHeap: number;
    heapGrowth: number;
    measuredProcess: string;
    forcedGcBeforeSamples: boolean;
  };
  potentialLeaks: LeakAssessment & { detected: boolean };
  /** Constructor / allocation-site / class level growth between two snapshots. */
  diff?: unknown;
  allocationSites?: unknown;
  artifacts: Record<string, string>;
  notes?: string[];
}

export interface StartupMeasurement {
  run: number;
  /** ms from spawn to readiness (or to exit in `exit` mode). */
  totalTime: number;
  ready: boolean;
  error?: string;
}

export interface StartupResult {
  runId: string;
  runtime: Runtime;
  mode: 'port' | 'log' | 'http' | 'exit';
  runs: StartupMeasurement[];
  summary: SampleSummary & {
    coldStart: number;
    warmStart: number;
    failedRuns: number;
  };
}

export type BottleneckCategory = 'cpu' | 'gc' | 'io' | 'lock' | 'idle' | 'memory';

export interface Bottleneck {
  function: string;
  file: string;
  line: number;
  selfTime: number;
  totalTime: number;
  percentage: number;
  totalPercent: number;
  category: BottleneckCategory;
  /** What the category is based on. */
  evidence: string;
}

export interface Recommendation {
  issue: string;
  suggestion: string;
  priority: 'high' | 'medium' | 'low';
  relatedFunction?: string;
}

export interface BottlenecksResult {
  runId?: string;
  runtime: Runtime;
  hotspots: Bottleneck[];
  /** Time shares measured from the profile (GC, idle/IO wait, locks), percent. */
  breakdown: Record<string, number>;
  hotPaths: HotPath[];
  recommendations: Recommendation[];
  summary: {
    totalBottlenecks: number;
    topCategory: string;
    estimatedImpact: string;
  };
  artifacts?: Record<string, string>;
}
