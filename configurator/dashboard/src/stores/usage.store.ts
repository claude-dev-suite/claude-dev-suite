// SPDX-License-Identifier: MIT
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { API_BASE } from '../utils/api';

// ============================================================
// Types (mirror backend types)
// ============================================================

export type AlertSeverity = 'info' | 'warning' | 'critical';
export type AlertMetric = 'daily_cost_usd' | 'monthly_cost_usd' | 'daily_tokens' | 'monthly_tokens';
export type AlertOperator = 'gt' | 'gte' | 'lt' | 'lte';

export interface AlertThreshold {
  id: string;
  name: string;
  metric: AlertMetric;
  operator: AlertOperator;
  value: number;
  severity: AlertSeverity;
  enabled: boolean;
}

/**
 * The usage monitor configuration as the client sees it.
 *
 * `adminApiKey` is WRITE-ONLY: `GET /api/usage/config` deliberately returns a
 * masked view (`hasApiKey` + `apiKeyPreview`) and never the secret itself, so
 * reading `config.adminApiKey` back is always `undefined`. The panel used to
 * derive "is a key configured?" from it and therefore reported "no key" forever,
 * even right after a successful save.
 */
export interface UsageConfig {
  adminApiKey?: string;
  hasApiKey?: boolean;
  apiKeyPreview?: string;
  alertThresholds: AlertThreshold[];
  pollingIntervalMs: number;
}

export interface ModelUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  requestCount: number;
}

export interface UsageReport {
  period: { start: string; end: string };
  models: ModelUsage[];
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
  totalRequests: number;
}

export interface CostBreakdown {
  workspace: string;
  tokenCostUsd: number;
  searchCostUsd: number;
  totalCostUsd: number;
}

export interface CostReport {
  period: { start: string; end: string };
  totalCostUsd: number;
  breakdown: CostBreakdown[];
}

export interface UsageAlert {
  id: string;
  timestamp: string;
  threshold: AlertThreshold;
  currentValue: number;
  message: string;
}

export interface DeepLink {
  label: string;
  url: string;
  description: string;
  icon: 'credits' | 'dashboard' | 'plan' | 'settings' | 'external';
}

export interface UsageSummary {
  usage: {
    today: UsageReport | null;
    monthly: UsageReport | null;
  };
  cost: {
    today: CostReport | null;
    monthly: CostReport | null;
  };
  alerts: UsageAlert[];
  deepLinks: DeepLink[];
  lastFetched: string | null;
  error: string | null;
}

// ============================================================
// Store
// ============================================================

interface UsageState {
  // Data
  summary: UsageSummary | null;
  config: UsageConfig | null;
  loading: boolean;
  configLoading: boolean;
  configSaving: boolean;
  error: string | null;

  // Actions
  fetchSummary: (projectPath: string) => Promise<void>;
  fetchConfig: (projectPath: string) => Promise<void>;
  saveConfig: (projectPath: string, config: UsageConfig) => Promise<void>;
  setPollingInterval: (ms: number) => void;
  clearError: () => void;
}

const initialState = {
  summary: null as UsageSummary | null,
  config: null as UsageConfig | null,
  loading: false,
  configLoading: false,
  configSaving: false,
  error: null as string | null,
};

export const useUsageStore = create<UsageState>()(
  devtools(
    (set, get) => ({
      ...initialState,

      fetchSummary: async (projectPath: string) => {
        set({ loading: true, error: null }, false, 'fetchSummary/start');
        try {
          const res = await fetch(
            `${API_BASE}/api/usage/summary?path=${encodeURIComponent(projectPath)}`
          );
          if (!res.ok) {
            const body = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(body.error ?? `HTTP ${res.status}`);
          }
          // Both usage routes answer with the standard { success, data }
          // envelope. Casting the envelope straight to UsageSummary left every
          // field undefined, which is why the panel reported $0 regardless of
          // the real spend.
          const body = (await res.json()) as { data: UsageSummary };
          set({ summary: body.data, loading: false }, false, 'fetchSummary/success');
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to fetch usage summary';
          set({ error: message, loading: false }, false, 'fetchSummary/error');
        }
      },

      fetchConfig: async (projectPath: string) => {
        set({ configLoading: true }, false, 'fetchConfig/start');
        try {
          const res = await fetch(
            `${API_BASE}/api/usage/config?path=${encodeURIComponent(projectPath)}`
          );
          if (!res.ok) {
            const body = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(body.error ?? `HTTP ${res.status}`);
          }
          const body = (await res.json()) as { data: UsageConfig };
          set({ config: body.data, configLoading: false }, false, 'fetchConfig/success');
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to fetch usage config';
          set({ error: message, configLoading: false }, false, 'fetchConfig/error');
        }
      },

      saveConfig: async (projectPath: string, config: UsageConfig) => {
        set({ configSaving: true, error: null }, false, 'saveConfig/start');
        try {
          const res = await fetch(`${API_BASE}/api/usage/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectPath, config }),
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(body.error ?? `HTTP ${res.status}`);
          }
          set({ configSaving: false }, false, 'saveConfig/success');
          await get().fetchConfig(projectPath);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to save usage config';
          set({ error: message, configSaving: false }, false, 'saveConfig/error');
        }
      },

      setPollingInterval: (ms: number) => {
        const current = get().config;
        if (!current) return;
        set(
          { config: { ...current, pollingIntervalMs: ms } },
          false,
          'setPollingInterval'
        );
      },

      clearError: () => set({ error: null }, false, 'clearError'),
    }),
    { name: 'UsageStore' }
  )
);
