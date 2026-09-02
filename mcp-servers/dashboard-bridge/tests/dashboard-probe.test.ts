// SPDX-License-Identifier: MIT
/**
 * The dashboard handlers run under concurrency: the MCP SDK dispatches
 * requests without awaiting the previous one, so a Claude Code session with a
 * dozen subagents hits these code paths simultaneously. These tests pin the
 * two properties that behaviour depends on — a bounded wait, and one probe per
 * burst rather than one per caller — plus the user-facing strings, which are
 * deliberately unchanged.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  handleDashboardStatus,
  handleDashboardListAgents,
  handleDashboardDetectStack,
} from '../src/handlers/dashboard.js';
import {
  invalidateDashboardProbe,
  probeDashboard,
  DASHBOARD_FETCH_TIMEOUT_MS,
} from '../src/handlers/dashboard-probe.js';

const realFetch = globalThis.fetch;

/** A fetch that never resolves on its own, but honours the abort signal. */
function hangingFetch(calls: { count: number }) {
  return (_url: string, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      calls.count++;
      const signal = init?.signal;
      if (signal) {
        signal.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      }
    });
}

function jsonFetch(body: unknown, calls: { count: number }, delayMs = 0) {
  return async () => {
    calls.count++;
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    return {
      ok: true,
      json: async () => body,
    } as unknown as Response;
  };
}

beforeEach(() => {
  invalidateDashboardProbe();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  invalidateDashboardProbe();
  vi.restoreAllMocks();
});

describe('dashboard reachability probe', () => {
  it('gives up on a fetch that never resolves, within the timeout', async () => {
    const calls = { count: 0 };
    globalThis.fetch = hangingFetch(calls) as typeof fetch;

    const started = Date.now();
    const result = await handleDashboardStatus({});
    const elapsed = Date.now() - started;

    const payload = JSON.parse(result.content[0].text);
    expect(payload.status).toBe('not_running');
    // Generous upper bound: the point is that it terminates at all.
    expect(elapsed).toBeLessThan(DASHBOARD_FETCH_TIMEOUT_MS + 1500);
    expect(calls.count).toBe(1);
  });

  it('keeps the not-running message exactly as users have seen it', async () => {
    const calls = { count: 0 };
    globalThis.fetch = hangingFetch(calls) as typeof fetch;

    const status = JSON.parse((await handleDashboardStatus({})).content[0].text);
    expect(status.message).toBe('Dashboard is not running. Use dashboard_start to start it.');

    const agents = await handleDashboardListAgents({});
    expect(agents.content[0].text).toBe(
      'Dashboard is not running. Start it with dashboard_start first.'
    );

    const detect = await handleDashboardDetectStack({ projectPath: '/tmp/project' });
    expect(detect.content[0].text).toBe(
      'Dashboard is not running. Start it with dashboard_start first.'
    );
  });

  it('collapses 16 concurrent dashboard_status calls into one fetch', async () => {
    const calls = { count: 0 };
    globalThis.fetch = jsonFetch({ total: 7 }, calls, 20) as typeof fetch;

    const results = await Promise.all(
      Array.from({ length: 16 }, () => handleDashboardStatus({}))
    );

    expect(calls.count).toBe(1);
    for (const result of results) {
      const payload = JSON.parse(result.content[0].text);
      expect(payload.status).toBe('running');
      expect(payload.agents).toBe(7);
    }
  });

  it('shares one negative probe across the handlers that need reachability', async () => {
    const calls = { count: 0 };
    globalThis.fetch = hangingFetch(calls) as typeof fetch;

    await Promise.all([
      handleDashboardStatus({}),
      handleDashboardListAgents({}),
      handleDashboardDetectStack({ projectPath: '/tmp/project' }),
      handleDashboardStatus({}),
    ]);

    expect(calls.count).toBe(1);
  });

  it('caches the answer, and re-probes once invalidated', async () => {
    const calls = { count: 0 };
    globalThis.fetch = jsonFetch({ total: 1 }, calls) as typeof fetch;

    await probeDashboard();
    await probeDashboard();
    expect(calls.count).toBe(1);

    invalidateDashboardProbe();
    await probeDashboard();
    expect(calls.count).toBe(2);
  });

  it('reports the agents payload when the dashboard answers', async () => {
    const calls = { count: 0 };
    globalThis.fetch = jsonFetch({ total: 3, agents: ['a', 'b', 'c'] }, calls) as typeof fetch;

    const result = await handleDashboardListAgents({});
    expect(JSON.parse(result.content[0].text)).toEqual({
      total: 3,
      agents: ['a', 'b', 'c'],
    });
  });
});
