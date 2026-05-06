// SPDX-License-Identifier: MIT
/**
 * TokenAnalyticsPanel
 *
 * Visualises token consumption per agent, per skill, per MCP tool, and per
 * model.  Helps validate the ROI of token-optimisation work and surface
 * future hot-spots.
 *
 * Token tracking is OPT-IN — the panel renders an informative empty state
 * when the feature is disabled (server returns 403) or when no data exists.
 */

import { useState, useEffect, useCallback } from 'react';
import clsx from 'clsx';
import { API_BASE } from '../../utils/api';

// ============================================================
// Types (mirroring backend TokenAggregatedRow)
// ============================================================

interface TokenAggregatedRow {
  key: string;
  totalTokens: number;
  totalCostUsd: number;
  callCount: number;
  avgTokensPerCall: number;
}

type GroupBy = 'agent' | 'skill' | 'mcpTool' | 'model';

type TimeRange = '24h' | '7d' | '30d' | 'all';

// ============================================================
// Constants
// ============================================================

const GROUP_BY_TABS: Array<{ id: GroupBy; label: string }> = [
  { id: 'agent', label: 'By Agent' },
  { id: 'skill', label: 'By Skill' },
  { id: 'mcpTool', label: 'By MCP Tool' },
  { id: 'model', label: 'By Model' },
];

const TIME_RANGES: Array<{ id: TimeRange; label: string }> = [
  { id: '24h', label: 'Last 24h' },
  { id: '7d', label: 'Last 7d' },
  { id: '30d', label: 'Last 30d' },
  { id: 'all', label: 'All time' },
];

function sinceFromRange(range: TimeRange): string | undefined {
  if (range === 'all') return undefined;
  const now = Date.now();
  const msMap: Record<Exclude<TimeRange, 'all'>, number> = {
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
  };
  return new Date(now - msMap[range as Exclude<TimeRange, 'all'>]).toISOString();
}

// ============================================================
// Formatting helpers
// ============================================================

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatCost(usd: number): string {
  if (usd === 0) return '$0.00';
  if (usd < 0.0001) return '<$0.0001';
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

// ============================================================
// Sub-components
// ============================================================

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
}

function StatCard({ label, value, sub }: StatCardProps) {
  return (
    <div className="bg-surface-800 border border-surface-700 rounded-lg p-4 flex flex-col gap-1">
      <p className="text-xs font-medium text-surface-400 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-surface-500">{sub}</p>}
    </div>
  );
}

interface RowBarProps {
  row: TokenAggregatedRow;
  maxTokens: number;
  rank: number;
}

function RowBar({ row, maxTokens, rank }: RowBarProps) {
  const pct = maxTokens > 0 ? (row.totalTokens / maxTokens) * 100 : 0;
  const shortKey = row.key.length > 40 ? `...${row.key.slice(-37)}` : row.key;

  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-surface-700/50 last:border-0">
      {/* Rank */}
      <span className="w-5 text-xs text-surface-500 text-right flex-shrink-0">{rank}</span>

      {/* Label + bar */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1">
          <span
            className="text-sm text-surface-200 truncate"
            title={row.key}
          >
            {shortKey}
          </span>
          <span className="text-xs text-surface-400 flex-shrink-0 ml-2">
            {formatTokens(row.totalTokens)}
          </span>
        </div>
        <div className="h-1.5 bg-surface-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary-500 rounded-full transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="flex-shrink-0 text-right space-y-0.5 w-24">
        <p className="text-xs text-surface-300">{formatCost(row.totalCostUsd)}</p>
        <p className="text-xs text-surface-500">{row.callCount} call{row.callCount !== 1 ? 's' : ''}</p>
      </div>
    </div>
  );
}

// ============================================================
// Main panel
// ============================================================

export interface TokenAnalyticsPanelProps {
  projectPath: string;
}

type FetchStatus = 'idle' | 'loading' | 'success' | 'disabled' | 'error';

export function TokenAnalyticsPanel({ projectPath }: TokenAnalyticsPanelProps) {
  const [groupBy, setGroupBy] = useState<GroupBy>('agent');
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const [rows, setRows] = useState<TokenAggregatedRow[]>([]);
  const [status, setStatus] = useState<FetchStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!projectPath) return;

    setStatus('loading');
    setErrorMsg(null);

    try {
      const params = new URLSearchParams({ path: projectPath, groupBy });
      const since = sinceFromRange(timeRange);
      if (since) params.set('since', since);

      const res = await fetch(`${API_BASE}/api/analytics/token-usage/aggregate?${params.toString()}`);

      if (res.status === 403) {
        setStatus('disabled');
        setRows([]);
        return;
      }

      if (!res.ok) {
        setStatus('error');
        setErrorMsg(`Server returned ${res.status}`);
        return;
      }

      const json = await res.json() as { success: boolean; data?: TokenAggregatedRow[]; error?: string };

      if (!json.success) {
        setStatus('error');
        setErrorMsg(json.error ?? 'Unknown server error');
        return;
      }

      setRows(json.data ?? []);
      setStatus('success');
    } catch (e) {
      setStatus('error');
      setErrorMsg(e instanceof Error ? e.message : 'Failed to connect to server');
    }
  }, [projectPath, groupBy, timeRange]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Aggregate totals for stat cards
  const totalTokens = rows.reduce((s, r) => s + r.totalTokens, 0);
  const totalCost = rows.reduce((s, r) => s + r.totalCostUsd, 0);
  const totalCalls = rows.reduce((s, r) => s + r.callCount, 0);
  const maxTokens = rows[0]?.totalTokens ?? 0;

  const top10 = rows.slice(0, 10);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-surface-700">
        <div>
          <h2 className="text-lg font-semibold text-white">Token Analytics</h2>
          <p className="text-sm text-surface-400">
            Track token consumption by agent, skill, MCP tool, and model
          </p>
        </div>
        <button
          onClick={() => void fetchData()}
          disabled={status === 'loading'}
          className={clsx(
            'flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition-colors',
            status === 'loading'
              ? 'text-surface-500 cursor-not-allowed'
              : 'text-surface-400 hover:text-white hover:bg-surface-700'
          )}
        >
          <svg
            className={clsx('w-4 h-4', status === 'loading' && 'animate-spin')}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          {status === 'loading' ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* Opt-in notice */}
        {status === 'disabled' && (
          <div className="bg-surface-800 border border-surface-700 rounded-xl p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-surface-700 flex items-center justify-center mx-auto">
              <svg className="w-6 h-6 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-surface-200">Token tracking is not enabled</h3>
            <p className="text-sm text-surface-400 max-w-md mx-auto">
              No token usage tracked yet. Token tracking is opt-in — see{' '}
              <code className="text-primary-400 font-mono text-xs">docs/TOKEN-ANALYTICS.md</code>{' '}
              for instructions on how to enable it.
            </p>
            <p className="text-xs text-surface-500 font-mono">
              Set <span className="text-surface-300">TOKEN_ANALYTICS_ENABLED=true</span> in the dashboard server environment to activate.
            </p>
          </div>
        )}

        {/* Error state */}
        {status === 'error' && (
          <div className="flex items-start gap-3 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
            <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm">{errorMsg ?? 'Failed to load token analytics'}</span>
          </div>
        )}

        {/* Content when enabled */}
        {status !== 'disabled' && (
          <>
            {/* Stat cards */}
            {(status === 'success' || status === 'loading') && (
              <div className="grid grid-cols-3 gap-3">
                <StatCard
                  label="Total Tokens"
                  value={formatTokens(totalTokens)}
                  sub={`In selected time range`}
                />
                <StatCard
                  label="Estimated Cost"
                  value={formatCost(totalCost)}
                  sub="Approximate (see docs)"
                />
                <StatCard
                  label="Total Calls"
                  value={String(totalCalls)}
                  sub={`Across all ${groupBy}s`}
                />
              </div>
            )}

            {/* Controls: group-by tabs + time range */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              {/* Group-by tab bar */}
              <div className="flex items-center gap-1 bg-surface-900/50 rounded-lg px-2 py-1">
                {GROUP_BY_TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setGroupBy(tab.id)}
                    className={clsx(
                      'px-3 py-1.5 rounded-md text-sm font-medium transition-all',
                      groupBy === tab.id
                        ? 'bg-primary-500/20 text-primary-400'
                        : 'text-surface-400 hover:text-white hover:bg-surface-700'
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Time range selector */}
              <div className="flex items-center gap-1 bg-surface-900/50 rounded-lg px-2 py-1">
                {TIME_RANGES.map((range) => (
                  <button
                    key={range.id}
                    onClick={() => setTimeRange(range.id)}
                    className={clsx(
                      'px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                      timeRange === range.id
                        ? 'bg-surface-700 text-white'
                        : 'text-surface-500 hover:text-surface-300'
                    )}
                  >
                    {range.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Top-10 table */}
            <div className="bg-surface-800 border border-surface-700 rounded-xl">
              {/* Table header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-surface-700">
                <h3 className="text-sm font-semibold text-surface-200">
                  Top {Math.min(top10.length, 10)}{' '}
                  {groupBy === 'agent' ? 'Agents' :
                   groupBy === 'skill' ? 'Skills' :
                   groupBy === 'mcpTool' ? 'MCP Tools' : 'Models'}
                </h3>
                <span className="text-xs text-surface-500">
                  {TIME_RANGES.find((r) => r.id === timeRange)?.label}
                </span>
              </div>

              <div className="px-4 py-2">
                {/* Loading skeleton */}
                {status === 'loading' && (
                  <div className="space-y-3 py-2">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-5 h-3 bg-surface-700 rounded animate-pulse" />
                        <div className="flex-1 h-3 bg-surface-700 rounded animate-pulse" />
                        <div className="w-16 h-3 bg-surface-700 rounded animate-pulse" />
                      </div>
                    ))}
                  </div>
                )}

                {/* Empty state */}
                {status === 'success' && top10.length === 0 && (
                  <div className="py-10 text-center">
                    <p className="text-sm text-surface-400">
                      No token usage data for this time range.
                    </p>
                    <p className="text-xs text-surface-500 mt-1">
                      Token tracking is active — usage will appear here once calls are made.
                    </p>
                  </div>
                )}

                {/* Rows */}
                {status === 'success' && top10.length > 0 && (
                  <div>
                    {top10.map((row, i) => (
                      <RowBar key={row.key} row={row} maxTokens={maxTokens} rank={i + 1} />
                    ))}
                  </div>
                )}
              </div>

              {/* Column header legend */}
              {status === 'success' && top10.length > 0 && (
                <div className="flex items-center gap-3 px-4 py-2 border-t border-surface-700 text-xs text-surface-500">
                  <span className="w-5" />
                  <span className="flex-1">Name</span>
                  <span className="w-16 text-right">Tokens</span>
                  <div className="w-24 text-right space-y-0">
                    <span className="block">Est. cost</span>
                    <span className="block">Calls</span>
                  </div>
                </div>
              )}
            </div>

            {/* Pricing disclaimer */}
            {status === 'success' && (
              <p className="text-xs text-surface-500 text-center">
                Cost estimates use approximate Anthropic list pricing (Haiku ~$0.25/MTok in, Sonnet ~$3/MTok in, Opus ~$15/MTok in).
                Actual costs may differ. See{' '}
                <code className="font-mono">docs/TOKEN-ANALYTICS.md</code> for details.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
