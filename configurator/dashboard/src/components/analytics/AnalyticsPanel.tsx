// SPDX-License-Identifier: MIT
import { useState, useEffect, useCallback } from 'react';
import type { KBUsageStats, KBUsageEntry } from '@/types';
import { StatsCards } from './StatsCards';
import { UsageTable } from './UsageTable';
import { Button, Select, Input } from '../common';
import { PanelSection } from '../layout';
import { API_BASE } from '@/utils/api';

export interface AnalyticsPanelProps {
  projectPath: string;
}

export function AnalyticsPanel({ projectPath }: AnalyticsPanelProps) {
  const [stats, setStats] = useState<KBUsageStats | null>(null);
  const [entries, setEntries] = useState<KBUsageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [technology, setTechnology] = useState<string>('');
  const [tool, setTool] = useState<string>('');
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({
    start: '',
    end: '',
  });

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const pageSize = 20;

  // Fetch analytics data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Filter and pagination names are the server's: `since`/`until` and
      // `offset`/`limit`. The panel used to send `startDate`/`endDate` and
      // `page`/`pageSize`, which the route simply ignored — every filter and
      // every page beyond the first was a no-op.
      const params = new URLSearchParams();
      params.append('path', projectPath);
      if (technology) params.append('technology', technology);
      if (tool) params.append('tool', tool);
      if (dateRange.start) params.append('since', dateRange.start);
      if (dateRange.end) params.append('until', dateRange.end);
      params.append('offset', ((page - 1) * pageSize).toString());
      params.append('limit', pageSize.toString());

      // Stats come from their own endpoint; `kb-usage` never carried them, so
      // the filter dropdowns (built from `stats`) were always empty.
      const statsParams = new URLSearchParams({ path: projectPath });
      if (dateRange.start) statsParams.append('since', dateRange.start);

      const [entriesRes, statsRes] = await Promise.all([
        fetch(`${API_BASE}/api/analytics/kb-usage?${params.toString()}`),
        fetch(`${API_BASE}/api/analytics/kb-stats?${statsParams.toString()}`),
      ]);

      if (entriesRes.ok) {
        // Both routes answer with the standard { success, data } envelope.
        const body = await entriesRes.json();
        const data = body.data ?? {};
        setEntries(data.entries || []);
        setTotalPages(Math.max(1, Math.ceil((data.total || 0) / pageSize)));
      } else {
        setError('Failed to load analytics data');
      }

      if (statsRes.ok) {
        const body = await statsRes.json();
        setStats(body.data ?? null);
      }
    } catch (_err) {
      setError('Failed to connect to server');
    } finally {
      setLoading(false);
    }
  }, [projectPath, technology, tool, dateRange, page]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loader toggles loading state; intentional fetch-on-mount
    fetchData();
  }, [fetchData]);

  const handleClearFilters = () => {
    setTechnology('');
    setTool('');
    setDateRange({ start: '', end: '' });
    setPage(1);
  };

  const handleClearData = async () => {
    if (!confirm('Are you sure you want to clear all analytics data?')) return;

    try {
      // The route reads `projectPath` off the body; posting nothing threw on
      // `resolveProjectPath(undefined)` and the button never cleared anything.
      const res = await fetch(`${API_BASE}/api/analytics/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectPath }),
      });
      if (!res.ok) {
        setError('Failed to clear analytics data');
        return;
      }
      setPage(1);
      fetchData();
    } catch (_err) {
      setError('Failed to clear analytics data');
    }
  };

  // Get unique technologies and tools for filters
  const technologies = stats ? Object.keys(stats.byTechnology) : [];
  const tools = stats ? Object.keys(stats.byTool) : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">Knowledge Base Analytics</h2>
          <p className="text-sm text-surface-400 mt-1">
            Track knowledge base usage and performance
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={fetchData}>
            Refresh
          </Button>
          <Button variant="ghost" onClick={handleClearData}>
            Clear Data
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && <StatsCards stats={stats} />}

      {/* Filters */}
      <PanelSection title="Usage History">
        <div className="flex flex-wrap items-end gap-4 mb-6">
          <div className="w-48">
            <Select
              label="Technology"
              options={[
                { value: '', label: 'All Technologies' },
                ...technologies.map((t) => ({ value: t, label: t })),
              ]}
              value={technology}
              onChange={(v) => {
                setTechnology(v as string);
                setPage(1);
              }}
              fullWidth
            />
          </div>
          <div className="w-48">
            <Select
              label="Tool"
              options={[
                { value: '', label: 'All Tools' },
                ...tools.map((t) => ({ value: t, label: t })),
              ]}
              value={tool}
              onChange={(v) => {
                setTool(v as string);
                setPage(1);
              }}
              fullWidth
            />
          </div>
          <div className="w-40">
            <Input
              label="Start Date"
              type="date"
              value={dateRange.start}
              onChange={(e) => {
                setDateRange((prev) => ({ ...prev, start: e.target.value }));
                setPage(1);
              }}
              fullWidth
            />
          </div>
          <div className="w-40">
            <Input
              label="End Date"
              type="date"
              value={dateRange.end}
              onChange={(e) => {
                setDateRange((prev) => ({ ...prev, end: e.target.value }));
                setPage(1);
              }}
              fullWidth
            />
          </div>
          <Button variant="ghost" size="sm" onClick={handleClearFilters}>
            Clear Filters
          </Button>
        </div>

        {/* Usage Table */}
        <UsageTable
          entries={entries}
          loading={loading}
          error={error}
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      </PanelSection>
    </div>
  );
}
