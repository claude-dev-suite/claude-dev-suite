// SPDX-License-Identifier: MIT
/**
 * One bounded, shared answer to "is the dashboard up?".
 *
 * Four tools reach for `http://localhost:3456`, and the MCP SDK dispatches
 * requests concurrently, so a dozen subagents produced a dozen simultaneous
 * probes of the same socket. Two failure modes followed:
 *
 * - `fetch` has no default timeout. When the dashboard is not listening the
 *   connection is usually refused at once, but not always: dropped SYNs, or a
 *   `localhost` that resolves to `::1` with nothing bound on IPv6, leave the
 *   request pending indefinitely — and the tool call with it.
 * - Every caller paid the full probe. Nothing remembered the answer, even for
 *   a second.
 *
 * So: a hard `AbortSignal.timeout`, single-flight so concurrent callers share
 * one request, and a short TTL cache of BOTH outcomes so a burst costs one
 * attempt rather than one per agent. The cache is deliberately short — the
 * dashboard can start at any moment, and `dashboard_start` invalidates it.
 */

import { SingleFlight } from "@dev-suite/shared";
import { DASHBOARD_URL } from "./types.js";

/** Ceiling on any single dashboard request. */
export const DASHBOARD_FETCH_TIMEOUT_MS = 1500;

/** How long a reachability answer — positive or negative — is reused. */
export const REACHABILITY_TTL_MS = 30_000;

export interface DashboardProbe {
  reachable: boolean;
  /** Body of `/api/agents` when the probe succeeded. */
  agents?: any;
}

let cached: { at: number; result: DashboardProbe } | null = null;
const inFlight = new SingleFlight<DashboardProbe>();

/**
 * `fetch` with a hard deadline. Every call to the dashboard goes through here.
 */
export async function dashboardFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(DASHBOARD_FETCH_TIMEOUT_MS) });
}

/**
 * Reachability plus the `/api/agents` payload, cached and de-duplicated.
 */
export async function probeDashboard(): Promise<DashboardProbe> {
  const now = Date.now();
  if (cached && now - cached.at < REACHABILITY_TTL_MS) {
    return cached.result;
  }

  return inFlight.run("dashboard", async () => {
    // A probe may have completed while we were queued behind it.
    const fresh = Date.now();
    if (cached && fresh - cached.at < REACHABILITY_TTL_MS) return cached.result;

    let result: DashboardProbe = { reachable: false };
    try {
      const response = await dashboardFetch(`${DASHBOARD_URL}/api/agents`);
      if (response.ok) {
        result = { reachable: true, agents: await response.json() };
      }
    } catch {
      // Not running, unreachable, or too slow to be worth waiting for.
    }

    cached = { at: Date.now(), result };
    return result;
  });
}

/**
 * Forget the cached answer.
 *
 * Called after `dashboard_start` spawns the server: without it the negative
 * result would keep reporting "not running" for the rest of the TTL, after we
 * ourselves started it.
 */
export function invalidateDashboardProbe(): void {
  cached = null;
}
