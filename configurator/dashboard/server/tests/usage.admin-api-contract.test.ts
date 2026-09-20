/**
 * The Usage panel against the Admin API's real wire format.
 *
 * Every figure in the panel rendered $0.00 on a real, billed account, and the
 * alert strip affirmed "All thresholds clear" underneath it. Three separate
 * causes, all invisible because each one degrades to a zero:
 *
 *  1. The request was built from invented parameters — `start_date`,
 *     `end_date`, `bucket_size` — none of which the API defines. It answers
 *     with its own default window instead of the one asked for.
 *  2. The response was parsed as a flat list of items carrying `input_tokens`
 *     and `total_cost_usd`. The API returns *time buckets*: `data[].results[]`,
 *     with `uncached_input_tokens` and an `amount` string. Every read missed
 *     and fell through `?? 0`.
 *  3. The server sent one month-to-date report while the dashboard read
 *     `summary.cost.today.totalCostUsd`, a shape it never produced — and the
 *     "daily" figure it did compute came from a helper whose own comment said
 *     it returned the monthly total.
 *
 * So the fixtures below are copied from the published response schemas, not
 * from what the code expects. That is the point of the test: a parser can only
 * be verified against the wire, never against itself.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UsageService } from '../src/services/usage.service.js';
import type { UsageConfig } from '../src/types/usage.js';

const PROJECT = process.platform === 'win32' ? 'C:\\projects\\demo' : '/projects/demo';
const KEY = 'sk-ant-admin-test';

/** 2026-09-20T13:00:00Z — a Sunday mid-month, so "today" ≠ the month start. */
const NOW = new Date('2026-09-20T13:00:00Z');
const TODAY = '2026-09-20';
const YESTERDAY = '2026-09-19';

function usageBucket(date: string, model: string, uncached: number, output: number) {
  return {
    starting_at: `${date}T00:00:00Z`,
    ending_at: `${date}T23:59:59Z`,
    results: [
      {
        model,
        uncached_input_tokens: uncached,
        output_tokens: output,
        cache_read_input_tokens: 10,
        cache_creation: {
          ephemeral_1h_input_tokens: 3,
          ephemeral_5m_input_tokens: 4,
        },
        server_tool_use: { web_search_requests: 0 },
      },
    ],
  };
}

/** `amount` is a decimal string in the lowest currency unit: "500" is $5.00. */
function costBucket(date: string, rows: Array<{ amount: string; cost_type: string }>) {
  return {
    starting_at: `${date}T00:00:00Z`,
    ending_at: `${date}T23:59:59Z`,
    results: rows.map(r => ({
      ...r,
      currency: 'USD',
      workspace_id: null,
      description: 'Claude Opus 5 Usage',
    })),
  };
}

interface Call {
  url: URL;
}

function stubFetch(pages: Record<string, unknown[]>) {
  const calls: Call[] = [];

  const fetchMock = vi.fn(async (input: string | URL) => {
    const url = new URL(String(input));
    calls.push({ url });

    const endpoint = url.pathname.includes('cost_report') ? 'cost' : 'usage';
    const queue = pages[endpoint] ?? [];
    const page = Number(url.searchParams.get('page') ?? '0');

    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => queue[page] ?? { data: [], has_more: false, next_page: null },
      text: async () => '',
    } as unknown as Response;
  });

  vi.stubGlobal('fetch', fetchMock);
  return calls;
}

function config(over: Partial<UsageConfig> = {}): UsageConfig {
  return { adminApiKey: KEY, alertThresholds: [], pollingIntervalMs: 300_000, ...over };
}

function withConfig(service: UsageService, cfg: UsageConfig) {
  vi.spyOn(service, 'getConfig').mockReturnValue(cfg);
}

describe('the Admin API request', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('asks for daily buckets over the month, in the parameters the API defines', async () => {
    const service = new UsageService();
    withConfig(service, config());
    const calls = stubFetch({});

    await service.getSummary(PROJECT);

    expect(calls).toHaveLength(2);

    for (const { url } of calls) {
      // `starting_at`/`ending_at`/`bucket_width`, not `start_date`/`end_date`/
      // `bucket_size`. The old names were silently ignored.
      expect(url.searchParams.get('starting_at')).toBe('2026-09-01T00:00:00Z');
      expect(url.searchParams.get('bucket_width')).toBe('1d');
      expect(url.searchParams.has('start_date')).toBe(false);
      expect(url.searchParams.has('bucket_size')).toBe(false);

      // `ending_at` is exclusive, so today's own bucket only comes back when
      // the window is closed at tomorrow's midnight.
      expect(url.searchParams.get('ending_at')).toBe('2026-09-21T00:00:00Z');
    }

    const usage = calls.find(c => c.url.pathname.endsWith('/usage_report/messages'));
    const cost = calls.find(c => c.url.pathname.endsWith('/cost_report'));
    expect(usage?.url.searchParams.getAll('group_by[]')).toEqual(['model']);
    expect(cost?.url.searchParams.getAll('group_by[]')).toEqual(['description', 'workspace_id']);
  });

  it('starts the month in UTC, the same calendar the buckets use', async () => {
    // `new Date(y, m, 1)` is local midnight; east of Greenwich that is the
    // previous month in UTC, which pulled an extra day into every monthly
    // figure for half the world.
    const service = new UsageService();
    withConfig(service, config());
    const calls = stubFetch({});

    await service.getSummary(PROJECT);

    expect(calls[0]?.url.searchParams.get('starting_at')).toMatch(/^2026-09-01T/);
  });
});

describe('parsing the Admin API response', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('separates today from the month instead of reporting the month twice', async () => {
    const service = new UsageService();
    withConfig(service, config());
    stubFetch({
      usage: [
        {
          data: [
            usageBucket(YESTERDAY, 'claude-opus-5', 1000, 200),
            usageBucket(TODAY, 'claude-opus-5', 300, 50),
          ],
          has_more: false,
          next_page: null,
        },
      ],
      cost: [
        {
          data: [
            costBucket(YESTERDAY, [{ amount: '4000', cost_type: 'tokens' }]),
            costBucket(TODAY, [{ amount: '1500', cost_type: 'tokens' }]),
          ],
          has_more: false,
          next_page: null,
        },
      ],
    });

    const summary = await service.getSummary(PROJECT);

    expect(summary.error).toBeNull();
    // "500" lowest-currency-units is $5.00, not $500.
    expect(summary.cost.today?.totalCostUsd).toBeCloseTo(15, 5);
    expect(summary.cost.monthly?.totalCostUsd).toBeCloseTo(55, 5);
    expect(summary.usage.today?.totalInputTokens).toBe(300);
    expect(summary.usage.monthly?.totalInputTokens).toBe(1300);
    expect(summary.usage.monthly?.totalOutputTokens).toBe(250);
  });

  it('reads the field names the API actually sends', async () => {
    const service = new UsageService();
    withConfig(service, config());
    stubFetch({
      usage: [
        { data: [usageBucket(TODAY, 'claude-opus-5', 300, 50)], has_more: false, next_page: null },
      ],
      cost: [{ data: [], has_more: false, next_page: null }],
    });

    const summary = await service.getSummary(PROJECT);

    // `uncached_input_tokens`, not `input_tokens`.
    expect(summary.usage.today?.totalInputTokens).toBe(300);
    expect(summary.usage.today?.totalCacheReadTokens).toBe(10);
    // Cache creation arrives split by TTL and must be summed, not picked.
    expect(summary.usage.today?.totalCacheCreationTokens).toBe(7);
    expect(summary.usage.today?.models[0]?.model).toBe('claude-opus-5');
  });

  it('splits cost by type and keeps untyped rows in the total', async () => {
    const service = new UsageService();
    withConfig(service, config());
    stubFetch({
      usage: [{ data: [], has_more: false, next_page: null }],
      cost: [
        {
          data: [
            costBucket(TODAY, [
              { amount: '1000', cost_type: 'tokens' },
              { amount: '250', cost_type: 'web_search' },
              { amount: '125', cost_type: 'code_execution' },
              // `session_usage` has no column of its own; it must still be
              // billed in the total, or the panel understates the bill.
              { amount: '625', cost_type: 'session_usage' },
            ]),
          ],
          has_more: false,
          next_page: null,
        },
      ],
    });

    const summary = await service.getSummary(PROJECT);
    const breakdown = summary.cost.today?.breakdown[0];

    expect(breakdown?.tokenCostUsd).toBeCloseTo(10, 5);
    expect(breakdown?.searchCostUsd).toBeCloseTo(2.5, 5);
    expect(breakdown?.codeExecutionCostUsd).toBeCloseTo(1.25, 5);
    expect(summary.cost.today?.totalCostUsd).toBeCloseTo(20, 5);
  });

  it('treats a day the API did not return as a real zero', async () => {
    const service = new UsageService();
    withConfig(service, config());
    stubFetch({
      usage: [{ data: [], has_more: false, next_page: null }],
      cost: [{ data: [], has_more: false, next_page: null }],
    });

    const summary = await service.getSummary(PROJECT);

    // Not null: the request succeeded and the answer is zero. `null` would be
    // indistinguishable from "we never asked", which is what it used to mean.
    expect(summary.cost.today?.totalCostUsd).toBe(0);
    expect(summary.cost.today?.period.start).toBe(TODAY);
    expect(summary.error).toBeNull();
  });

  it('follows next_page rather than losing the buckets past the first page', async () => {
    const service = new UsageService();
    withConfig(service, config());
    const calls = stubFetch({
      usage: [
        { data: [usageBucket(YESTERDAY, 'm', 1, 1)], has_more: true, next_page: '1' },
        { data: [usageBucket(TODAY, 'm', 5, 5)], has_more: false, next_page: null },
      ],
      cost: [{ data: [], has_more: false, next_page: null }],
    });

    const summary = await service.getSummary(PROJECT);

    expect(calls.filter(c => c.url.pathname.includes('usage_report'))).toHaveLength(2);
    expect(summary.usage.monthly?.totalInputTokens).toBe(6);
    expect(summary.usage.today?.totalInputTokens).toBe(5);
  });

  it('does not let a malformed amount poison the total', async () => {
    const service = new UsageService();
    withConfig(service, config());
    stubFetch({
      usage: [{ data: [], has_more: false, next_page: null }],
      cost: [
        {
          data: [
            costBucket(TODAY, [
              { amount: 'not-a-number', cost_type: 'tokens' },
              { amount: '300', cost_type: 'tokens' },
            ]),
          ],
          has_more: false,
          next_page: null,
        },
      ],
    });

    const summary = await service.getSummary(PROJECT);

    // One NaN row would otherwise make the whole total NaN, and every
    // threshold compared against it false.
    expect(summary.cost.today?.totalCostUsd).toBeCloseTo(3, 5);
  });

  it('reports an API failure instead of a plausible zero', async () => {
    const service = new UsageService();
    withConfig(service, config());
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'invalid x-api-key',
        json: async () => ({}),
      })) as unknown as typeof fetch,
    );

    const summary = await service.getSummary(PROJECT);

    expect(summary.error).toContain('401');
    expect(summary.cost.today).toBeNull();
  });
});

describe('thresholds read the window they name', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('a daily cost threshold compares today, not the month to date', async () => {
    const service = new UsageService();
    withConfig(
      service,
      config({
        alertThresholds: [
          {
            id: 'daily',
            name: 'Daily Cost Warning',
            metric: 'daily_cost',
            operator: 'gt',
            value: 20,
            severity: 'warning',
            enabled: true,
          },
        ],
      }),
    );
    stubFetch({
      usage: [{ data: [], has_more: false, next_page: null }],
      cost: [
        {
          data: [
            // $400 so far this month, $5 today. The old `getDailyTotal`
            // returned the monthly total, so this fired every day.
            costBucket(YESTERDAY, [{ amount: '39500', cost_type: 'tokens' }]),
            costBucket(TODAY, [{ amount: '500', cost_type: 'tokens' }]),
          ],
          has_more: false,
          next_page: null,
        },
      ],
    });

    const summary = await service.getSummary(PROJECT);

    expect(summary.cost.monthly?.totalCostUsd).toBeCloseTo(400, 5);
    expect(summary.cost.today?.totalCostUsd).toBeCloseTo(5, 5);
    expect(summary.alerts).toHaveLength(0);
  });

  it('a daily cost threshold still fires on a genuinely expensive day', async () => {
    const service = new UsageService();
    withConfig(
      service,
      config({
        alertThresholds: [
          {
            id: 'daily',
            name: 'Daily Cost Warning',
            metric: 'daily_cost',
            operator: 'gt',
            value: 20,
            severity: 'warning',
            enabled: true,
          },
        ],
      }),
    );
    stubFetch({
      usage: [{ data: [], has_more: false, next_page: null }],
      cost: [
        {
          data: [costBucket(TODAY, [{ amount: '7500', cost_type: 'tokens' }])],
          has_more: false,
          next_page: null,
        },
      ],
    });

    const summary = await service.getSummary(PROJECT);

    expect(summary.alerts).toHaveLength(1);
    expect(summary.alerts[0]?.currentValue).toBeCloseTo(75, 5);
  });

  it('a daily token threshold reads today, not the whole month', async () => {
    const service = new UsageService();
    withConfig(
      service,
      config({
        alertThresholds: [
          {
            id: 'tokens',
            name: 'Daily Token Warning',
            metric: 'daily_tokens',
            operator: 'gt',
            value: 5_000,
            severity: 'info',
            enabled: true,
          },
        ],
      }),
    );
    stubFetch({
      usage: [
        {
          data: [
            usageBucket(YESTERDAY, 'claude-opus-5', 100_000, 10_000),
            usageBucket(TODAY, 'claude-opus-5', 1_000, 100),
          ],
          has_more: false,
          next_page: null,
        },
      ],
      cost: [{ data: [], has_more: false, next_page: null }],
    });

    const summary = await service.getSummary(PROJECT);

    expect(summary.alerts).toHaveLength(0);
  });
});

describe('deep links', () => {
  it('every link carries an icon the dashboard can draw', () => {
    // The dashboard switches on this name and renders nothing for anything
    // else; the server's links replace the client's defaults as soon as a key
    // is configured, so an iconless link here is a blank glyph in the panel.
    const known = new Set(['credits', 'dashboard', 'plan', 'settings', 'external']);
    for (const link of new UsageService().getDeepLinks()) {
      expect(known.has(link.icon)).toBe(true);
    }
  });
});
