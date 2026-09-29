// SPDX-License-Identifier: MIT
/**
 * Background jobs, so a multi-minute load test or profile never blocks an MCP
 * call: the tool returns a job id immediately and `get_job` / `stop_job` /
 * `list_jobs` observe and control it. Jobs live in this server process only.
 */

import { randomBytes } from 'crypto';

export type JobStatus = 'running' | 'completed' | 'failed' | 'stopped';

export interface JobContext {
  signal: AbortSignal;
  setProgress: (p: unknown) => void;
}

interface Job {
  id: string;
  kind: string;
  description: string;
  status: JobStatus;
  startedAt: number;
  finishedAt?: number;
  progress?: unknown;
  progressFn?: () => unknown;
  result?: unknown;
  error?: string;
  controller: AbortController;
  done: Promise<void>;
}

const MAX_JOBS = 50;
const jobs = new Map<string, Job>();

function evict(): void {
  if (jobs.size < MAX_JOBS) return;
  const finished = [...jobs.values()].filter((j) => j.status !== 'running').sort((a, b) => a.startedAt - b.startedAt);
  for (const j of finished) {
    if (jobs.size < MAX_JOBS) break;
    jobs.delete(j.id);
  }
  if (jobs.size >= MAX_JOBS) {
    throw new Error(`Too many running jobs (${MAX_JOBS}); stop one with stop_job first.`);
  }
}

export function startJob(
  kind: string,
  description: string,
  run: (ctx: JobContext) => Promise<unknown>,
  progressFn?: () => unknown
): { jobId: string } {
  evict();
  const id = `job-${randomBytes(4).toString('hex')}`;
  const controller = new AbortController();
  const job: Job = {
    id, kind, description, status: 'running', startedAt: Date.now(), controller, progressFn,
    done: Promise.resolve(),
  };
  job.done = (async () => {
    try {
      const result = await run({ signal: controller.signal, setProgress: (p) => (job.progress = p) });
      job.result = result;
      job.status = controller.signal.aborted ? 'stopped' : 'completed';
    } catch (e) {
      job.error = e instanceof Error ? e.message : String(e);
      job.status = controller.signal.aborted ? 'stopped' : 'failed';
    } finally {
      job.finishedAt = Date.now();
    }
  })();
  jobs.set(id, job);
  return { jobId: id };
}

function view(j: Job, includeResult: boolean) {
  let progress = j.progress;
  if (j.status === 'running' && j.progressFn) {
    try {
      progress = j.progressFn();
    } catch {
      // keep the last reported progress
    }
  }
  return {
    jobId: j.id,
    kind: j.kind,
    description: j.description,
    status: j.status,
    startedAt: new Date(j.startedAt).toISOString(),
    elapsedS: Math.round(((j.finishedAt ?? Date.now()) - j.startedAt) / 100) / 10,
    ...(j.finishedAt ? { finishedAt: new Date(j.finishedAt).toISOString() } : {}),
    ...(progress !== undefined && j.status === 'running' ? { progress } : {}),
    ...(j.error ? { error: j.error } : {}),
    ...(includeResult && j.result !== undefined ? { result: j.result } : {}),
  };
}

/** Status (and result once finished). Optionally waits up to `waitS` seconds for completion. */
export async function getJob(id: string, waitS = 0): Promise<ReturnType<typeof view>> {
  const j = jobs.get(id);
  if (!j) throw new Error(`Unknown job: ${id}. Jobs are kept in memory and are lost when the server restarts.`);
  if (waitS > 0 && j.status === 'running') {
    await Promise.race([j.done, new Promise((r) => setTimeout(r, Math.min(waitS, 25) * 1000))]);
  }
  return view(j, true);
}

export async function stopJob(id: string): Promise<ReturnType<typeof view>> {
  const j = jobs.get(id);
  if (!j) throw new Error(`Unknown job: ${id}`);
  if (j.status === 'running') {
    j.controller.abort();
    await Promise.race([j.done, new Promise((r) => setTimeout(r, 10_000))]);
  }
  return view(j, true);
}

export function listJobs(): Array<ReturnType<typeof view>> {
  return [...jobs.values()].sort((a, b) => b.startedAt - a.startedAt).map((j) => view(j, false));
}

/** For tests. */
export function clearJobs(): void {
  for (const j of jobs.values()) j.controller.abort();
  jobs.clear();
}
