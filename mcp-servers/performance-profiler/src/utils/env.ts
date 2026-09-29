// SPDX-License-Identifier: MIT
/**
 * Environment-driven configuration.
 *
 * Every variable read here is declared in metadata.json. Boolean flags accept
 * `true`/`1`/`yes`/`on` (case-insensitive): the metadata documents "true", the
 * code used to check `=== '1'` only, so a user following the docs got nothing.
 */

import { isAbsolute, join, resolve } from 'path';

export function envFlag(value: string | undefined): boolean {
  if (value === undefined) return false;
  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

function envInt(value: string | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined || value.trim() === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

/** PERF_PROFILER_ALLOW_RAW_CODE — allow benchmarking inline code strings. */
export function allowRawCode(): boolean {
  return envFlag(process.env.PERF_PROFILER_ALLOW_RAW_CODE);
}

/** PERF_PROFILER_ALLOW_PRIVATE_URLS — allow private/loopback targets (SSRF escape hatch). */
export function allowPrivateUrls(): boolean {
  return envFlag(process.env.PERF_PROFILER_ALLOW_PRIVATE_URLS);
}

/**
 * Directory that receives profiles, flame graphs, heap snapshots, run records
 * and baselines. Defaults to `.perf-profiler/` under the server's working
 * directory, which is the project root when an assistant launches the server.
 */
export function outputRoot(): string {
  const configured = process.env.PERF_PROFILER_OUTPUT_DIR;
  if (configured && configured.trim()) {
    return isAbsolute(configured) ? configured : resolve(process.cwd(), configured);
  }
  return join(process.cwd(), '.perf-profiler');
}

/** Hard safety caps for load generation and long-running work. */
export interface Limits {
  maxVus: number;
  maxRate: number;
  maxDurationS: number;
  maxRequests: number;
  /** Anything expected to run longer than this goes to a background job. */
  syncMaxS: number;
}

export function limits(): Limits {
  return {
    maxVus: envInt(process.env.PERF_PROFILER_MAX_VUS, 200, 1, 10_000),
    maxRate: envInt(process.env.PERF_PROFILER_MAX_RATE, 1000, 1, 100_000),
    maxDurationS: envInt(process.env.PERF_PROFILER_MAX_DURATION_S, 600, 1, 86_400),
    maxRequests: envInt(process.env.PERF_PROFILER_MAX_REQUESTS, 100_000, 1, 10_000_000),
    syncMaxS: envInt(process.env.PERF_PROFILER_SYNC_MAX_S, 30, 1, 3600),
  };
}

/** Optional explicit interpreter / tool overrides. */
export function pythonOverride(): string | undefined {
  const v = process.env.PERF_PROFILER_PYTHON;
  return v && v.trim() ? v.trim() : undefined;
}
