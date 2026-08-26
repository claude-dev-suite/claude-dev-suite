// SPDX-License-Identifier: MIT
/**
 * Regression tests for the Tier 1 findings of the 2026-08 audit — the
 * client/server contract mismatches that left whole panels functionally dead.
 *
 * Every one of these is a shape disagreement no type checked, because the two
 * sides declare their own copies. The tests below assert against the *server's*
 * real response and request shapes.
 *
 *   8   Usage panel: envelope not unwrapped, `path` vs `projectPath`, write-only key
 *   9   KB Analytics: wrong field names, wrong filter names, clear without a body
 *  10   eight relative fetch URLs that 404 under file:// in the packaged app
 *  11   detect → install round trip dropped meta_framework / db_type
 *  12   `skipped` capabilities never rendered
 *  13   useGitHooksForm returned a new object each render → infinite loop
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { renderHook } from '@testing-library/react';

import { useUsageStore } from '../stores/usage.store';
import { AnalyticsPanel } from '../components/analytics/AnalyticsPanel';
import { Step5Install } from '../components/wizard/Step5Install';
import { useGitHooksForm } from '../components/manage/hooks/useGitHooksForm';
import { toDetectedStackPayload } from '../utils/detected-stack';
import type { DetectionResponse } from '@/types';

/** Record every fetch call so request shape can be asserted, not just responses. */
function mockFetch(handler: (url: string, init?: RequestInit) => unknown) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const body = handler(String(url), init);
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => body,
    });
  }) as unknown as typeof fetch;
  return calls;
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── 8: Usage panel ──────────────────────────────────────────────────────────

describe('Tier 1 #8 — usage store speaks the server\'s contract', () => {
  beforeEach(() => {
    useUsageStore.setState({ summary: null, config: null, error: null });
  });

  it('unwraps the { success, data } envelope on the summary', async () => {
    mockFetch(() => ({
      success: true,
      data: { cost: { today: { totalCostUsd: 12.34 } }, usage: {}, alerts: [], deepLinks: [] },
    }));

    await useUsageStore.getState().fetchSummary('/tmp/p');

    // Before the fix the envelope itself was cast to UsageSummary, so every
    // read was undefined and the panel showed $0 no matter the real spend.
    expect(useUsageStore.getState().summary?.cost?.today?.totalCostUsd).toBe(12.34);
  });

  it('unwraps the envelope on the config and exposes the masked key fields', async () => {
    mockFetch(() => ({
      success: true,
      data: {
        hasApiKey: true,
        apiKeyPreview: 'sk-ant-a...9f2c',
        alertThresholds: [],
        pollingIntervalMs: 60000,
      },
    }));

    await useUsageStore.getState().fetchConfig('/tmp/p');

    const config = useUsageStore.getState().config;
    expect(config?.hasApiKey).toBe(true);
    expect(config?.apiKeyPreview).toBe('sk-ant-a...9f2c');
    // The secret is never sent, so it must never be the source of truth.
    expect(config?.adminApiKey).toBeUndefined();
  });

  it('posts projectPath, the name SaveUsageConfigRequestSchema requires', async () => {
    const calls = mockFetch(() => ({ success: true, data: {} }));

    await useUsageStore.getState().saveConfig('/tmp/p', {
      adminApiKey: 'sk-ant-admin-xyz',
      alertThresholds: [],
      pollingIntervalMs: 60000,
    });

    const post = calls.find(c => c.init?.method === 'POST');
    expect(post).toBeDefined();
    const body = JSON.parse(String(post!.init!.body));
    expect(body).toHaveProperty('projectPath', '/tmp/p');
    // `path` was the old name and produced a 400 on every save.
    expect(body).not.toHaveProperty('path');
  });

  it('re-fetches the masked config after saving', async () => {
    const calls = mockFetch(() => ({ success: true, data: { hasApiKey: true, alertThresholds: [], pollingIntervalMs: 1000 } }));

    await useUsageStore.getState().saveConfig('/tmp/p', {
      adminApiKey: 'sk-ant-admin-xyz',
      alertThresholds: [],
      pollingIntervalMs: 1000,
    });

    expect(calls.some(c => c.url.includes('/api/usage/config?path='))).toBe(true);
    expect(useUsageStore.getState().config?.hasApiKey).toBe(true);
  });
});

// ─── 9: KB Analytics ─────────────────────────────────────────────────────────

describe('Tier 1 #9 — analytics panel speaks the server\'s contract', () => {
  const entriesBody = {
    success: true,
    data: {
      entries: [
        {
          timestamp: '2026-08-01T10:00:00Z',
          technology: 'react',
          tool: 'fetch_docs',
          source: 'kb',
          success: true,
        },
      ],
      total: 1,
      offset: 0,
      limit: 20,
      hasMore: false,
    },
  };
  const statsBody = {
    success: true,
    data: {
      totalCalls: 1,
      successRate: 1,
      byTechnology: { react: 1 },
      byTool: { fetch_docs: 1 },
    },
  };

  function mockAnalytics() {
    return mockFetch(url =>
      url.includes('/api/analytics/kb-stats') ? statsBody : entriesBody
    );
  }

  it('reads entries/total, not items/totalPages', async () => {
    mockAnalytics();
    render(<AnalyticsPanel projectPath="/tmp/p" />);

    // `react` must appear twice: once in the technology filter (populated from
    // the /kb-stats response) and once as the table row's badge (from
    // /kb-usage's `entries`). The old code read `data.stats` and `data.items`,
    // neither of which exists, so both were empty.
    await waitFor(() => {
      expect(screen.getAllByText('react').length).toBeGreaterThanOrEqual(2);
    });
    expect(screen.getAllByText('fetch_docs').length).toBeGreaterThanOrEqual(2);
  });

  it('sends since/until and offset/limit, the names the route reads', async () => {
    const calls = mockAnalytics();
    render(<AnalyticsPanel projectPath="/tmp/p" />);

    await waitFor(() => {
      expect(calls.some(c => c.url.includes('/api/analytics/kb-usage'))).toBe(true);
    });

    const usage = calls.find(c => c.url.includes('/api/analytics/kb-usage'))!;
    expect(usage.url).toContain('offset=0');
    expect(usage.url).toContain('limit=20');
    expect(usage.url).not.toContain('pageSize=');
    expect(usage.url).not.toContain('page=');
  });

  it('fetches stats from their own endpoint so the filters can populate', async () => {
    const calls = mockAnalytics();
    render(<AnalyticsPanel projectPath="/tmp/p" />);

    await waitFor(() => {
      expect(calls.some(c => c.url.includes('/api/analytics/kb-stats'))).toBe(true);
    });
  });

  it('sends projectPath in the clear-data body', async () => {
    const calls = mockAnalytics();
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<AnalyticsPanel projectPath="/tmp/p" />);
    await waitFor(() => expect(screen.getByText('Clear Data')).toBeInTheDocument());

    await act(async () => {
      screen.getByText('Clear Data').click();
    });

    const clear = calls.find(c => c.url.includes('/api/analytics/clear'));
    expect(clear).toBeDefined();
    // Posting no body made resolveProjectPath(undefined) throw: the button was inert.
    expect(JSON.parse(String(clear!.init!.body))).toEqual({ projectPath: '/tmp/p' });
  });
});

// ─── 10: no relative API URLs survive ────────────────────────────────────────

describe('Tier 1 #10 — every API call is absolute', () => {
  it('no source file fetches a relative /api path', async () => {
    // Vite's import.meta.glob gives us the real sources at test time.
    const modules = import.meta.glob('../**/*.{ts,tsx}', {
      query: '?raw',
      import: 'default',
      eager: true,
    }) as Record<string, string>;

    const offenders: string[] = [];
    for (const [file, source] of Object.entries(modules)) {
      if (file.includes('__tests__') || file.endsWith('.test.ts') || file.endsWith('.test.tsx')) {
        continue;
      }
      // A relative literal: fetch('/api/…'), fetch(`/api/…`), new EventSource('/api/…')
      if (/(?:fetch|EventSource)\(\s*['"`]\/api\//.test(source)) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });
});

// ─── 11: detect → install round trip ─────────────────────────────────────────

describe('Tier 1 #11 — the detected stack survives the round trip', () => {
  const detection = {
    project_type: 'fullstack',
    frontend: { framework: 'react', meta_framework: 'nextjs', runtime: 'nodejs' },
    backend: { framework: 'express', runtime: 'nodejs' },
    database: { db_type: 'postgresql', orm: 'prisma' },
    testing: { unit: 'vitest', e2e: 'playwright' },
    is_monorepo: false,
    confidence: 0.9,
  } as unknown as DetectionResponse;

  it('converts snake_case to the camelCase the install schema expects', () => {
    const payload = toDetectedStackPayload(detection);

    // These two are the whole point: they were dropped in transit before.
    expect(payload.frontend?.metaFramework).toBe('nextjs');
    expect(payload.database?.dbType).toBe('postgresql');

    expect(payload.projectType).toBe('fullstack');
    expect(payload.frontend?.framework).toBe('react');
    expect(payload.database?.orm).toBe('prisma');
    expect(payload.isMonorepo).toBe(false);
  });

  it('emits no snake_case keys the server would ignore', () => {
    const payload = toDetectedStackPayload(detection);
    expect(JSON.stringify(payload)).not.toMatch(/meta_framework|db_type|project_type|is_monorepo/);
  });

  it('leaves absent sub-objects absent', () => {
    const bare = { project_type: 'library', is_monorepo: false } as unknown as DetectionResponse;
    const payload = toDetectedStackPayload(bare);

    expect(payload.frontend).toBeUndefined();
    expect(payload.database).toBeUndefined();
  });

  it('is what Step5Install actually sends', async () => {
    const calls = mockFetch(() => ({ success: true, manifest: { skipped: [] } }));

    render(
      <Step5Install
        projectPath="/tmp/p"
        selectedAgents={['react-expert']}
        selectedMcpServers={[]}
        selectedRules={[]}
        selectedAssistants={['claude-code']}
        envVars={{}}
        detection={detection}
        onComplete={() => {}}
      />
    );

    await act(async () => {
      screen.getByText('Start Installation').click();
    });

    await waitFor(() => {
      expect(calls.some(c => c.url.includes('/api/install'))).toBe(true);
    });

    const install = calls.find(c => c.url.includes('/api/install'))!;
    const body = JSON.parse(String(install.init!.body));
    expect(body.detectedStack.frontend.metaFramework).toBe('nextjs');
    expect(body.detectedStack.database.dbType).toBe('postgresql');
  });
});

// ─── 12: skipped capabilities reach the user ─────────────────────────────────

describe('Tier 1 #12 — degraded capabilities are shown', () => {
  it('renders each skipped capability after a successful install', async () => {
    mockFetch(url =>
      url.includes('/api/install')
        ? {
            success: true,
            manifest: {
              skipped: [
                {
                  target: 'cline',
                  capability: 'mcp',
                  reason: 'Cline has no project-level MCP configuration',
                },
              ],
            },
          }
        : { success: true }
    );

    render(
      <Step5Install
        projectPath="/tmp/p"
        selectedAgents={['react-expert']}
        selectedMcpServers={['documentation']}
        selectedRules={[]}
        selectedAssistants={['cline']}
        envVars={{}}
        detection={null}
        onComplete={() => {}}
      />
    );

    await act(async () => {
      screen.getByText('Start Installation').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('skipped-capabilities')).toBeInTheDocument();
    });
    expect(
      screen.getByText(/Cline has no project-level MCP configuration/)
    ).toBeInTheDocument();
  });

  it('shows nothing when no capability was skipped', async () => {
    mockFetch(() => ({ success: true, manifest: { skipped: [] } }));

    render(
      <Step5Install
        projectPath="/tmp/p"
        selectedAgents={['react-expert']}
        selectedMcpServers={[]}
        selectedRules={[]}
        selectedAssistants={['claude-code']}
        envVars={{}}
        detection={null}
        onComplete={() => {}}
      />
    );

    await act(async () => {
      screen.getByText('Start Installation').click();
    });

    await waitFor(() => {
      expect(screen.getByText('Installation Complete!')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('skipped-capabilities')).not.toBeInTheDocument();
  });
});

// ─── 13: the hooks form has a stable identity ────────────────────────────────

describe('Tier 1 #13 — useGitHooksForm is render-stable', () => {
  // `onError` is HooksConfig's `setError`, a useState setter, which React
  // guarantees is stable. The test mirrors that: a fresh arrow per render would
  // legitimately bust the memo and would be a bug at the call site, not here.
  const onError = () => {};

  it('returns the same object across renders when nothing changed', () => {
    const { result, rerender } = renderHook(() =>
      useGitHooksForm('/tmp/p', null, onError)
    );

    const first = result.current;
    rerender();

    // An unstable identity here is what turned HooksConfig's effect — which
    // calls setState — into an infinite render loop as soon as
    // /api/hooks/status answered.
    expect(result.current).toBe(first);
  });

  it('keeps initializeFromStatus stable so an effect can depend on it', () => {
    const { result, rerender } = renderHook(() =>
      useGitHooksForm('/tmp/p', null, onError)
    );

    const first = result.current.initializeFromStatus;
    rerender();

    expect(result.current.initializeFromStatus).toBe(first);
  });
});
