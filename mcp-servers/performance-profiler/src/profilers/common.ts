// SPDX-License-Identifier: MIT
/**
 * Helpers shared by the per-runtime profilers.
 */

import { limits } from '../utils/env.js';
import { outputExcerpt, redactText } from '../utils/redact.js';
import { tail, type SpawnResult } from '../utils/process.js';
import type { TargetRunInfo } from '../types.js';

export interface CpuProfileOptions {
  durationS: number;
  limit: number;
  /** Node only. */
  samplingIntervalUs?: number;
  /** Python: 'cprofile' (deterministic, exact call counts) or 'py-spy' (sampling). */
  profiler?: 'cprofile' | 'py-spy';
  /** Go: benchmark regex; when omitted tests are run. */
  goBench?: string;
  goTest?: string;
  signal?: AbortSignal;
}

export function checkDuration(durationS: number): void {
  const max = limits().maxDurationS;
  if (!(durationS > 0) || durationS > max) {
    throw new Error(`duration must be in (0, ${max}] seconds (PERF_PROFILER_MAX_DURATION_S)`);
  }
}

export function targetInfo(res: SpawnResult, stoppedBy: TargetRunInfo['stoppedBy']): TargetRunInfo {
  return {
    exitCode: res.spawnError ? null : res.exitCode,
    stoppedBy,
    wallTimeMs: res.duration,
    stdout: outputExcerpt(res.stdout, 1500),
    stderr: outputExcerpt(res.stderr, 1500),
  };
}

/** Error text for a target that produced no usable output. */
export function failureDetail(res: SpawnResult): string {
  if (res.spawnError) return `could not start: ${res.spawnError}`;
  const why = res.timedOut ? 'killed by the hard timeout' : `exit code ${res.exitCode}`;
  const err = res.stderr.trim() ? `; stderr: ${redactText(tail(res.stderr, 1500))}` : '';
  return `${why}${err}`;
}
