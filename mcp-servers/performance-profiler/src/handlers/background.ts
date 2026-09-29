// SPDX-License-Identifier: MIT
/**
 * Run a tool body inline or as a background job.
 *
 * `background: true` always returns a job id; `false` always runs inline;
 * when omitted, anything expected to take longer than PERF_PROFILER_SYNC_MAX_S
 * (default 30 s) becomes a job so one MCP call never blocks for minutes.
 */

import { limits } from '../utils/env.js';
import { startJob } from '../jobs/manager.js';

export async function runMaybeInBackground<T>(
  kind: string,
  description: string,
  background: boolean | undefined,
  estimatedS: number,
  body: (signal?: AbortSignal) => Promise<T>,
  progress?: () => unknown
): Promise<T | { jobId: string; status: 'running'; message: string }> {
  const goBackground = background ?? estimatedS > limits().syncMaxS;
  if (!goBackground) return body();
  const { jobId } = startJob(kind, description, ({ signal }) => body(signal), progress);
  return {
    jobId,
    status: 'running',
    message: `Started in the background (expected ~${Math.round(estimatedS)}s). Poll get_job with this jobId (wait up to 25s per call); stop_job cancels it.`,
  };
}
