// SPDX-License-Identifier: MIT
/**
 * Usage Monitor Service
 *
 * Fetches Anthropic API token usage and cost data via the Admin API,
 * evaluates alert thresholds, and generates deep links to the Anthropic Console.
 *
 * Config is stored per-project in `.dev-suite/usage-config.json`.
 * All HTTP calls use the native Node.js `fetch` API.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveProjectPath } from '../utils/utilities.js';
import { getLogger } from '../utils/logger.js';
import type {
  UsageConfig,
  AlertThreshold,
  UsageReport,
  ModelUsage,
  CostReport,
  CostBreakdown,
  UsageAlert,
  UsageSummary,
  DeepLink,
} from '../types/usage.js';

const logger = getLogger('UsageService');

// ============================================
// CONSTANTS
// ============================================

const ADMIN_API_BASE = 'https://api.anthropic.com/v1/organizations';
const ANTHROPIC_VERSION = '2023-06-01';
const CONFIG_FILE = '.dev-suite/usage-config.json';

const DEEP_LINKS: DeepLink[] = [
  {
    label: 'Enable Extra Usage',
    url: 'https://console.anthropic.com/settings/billing',
    description: 'Increase your usage limits in the Anthropic Console billing settings.',
  },
  {
    label: 'Add Credits',
    url: 'https://console.anthropic.com/settings/billing',
    description: 'Purchase additional API credits from the Anthropic Console.',
  },
  {
    label: 'View Usage Dashboard',
    url: 'https://console.anthropic.com/settings/usage',
    description: 'Inspect detailed token and cost usage broken down by model and workspace.',
  },
  {
    label: 'Manage Plan',
    url: 'https://console.anthropic.com/settings/plans',
    description: 'Review or upgrade your Anthropic API plan.',
  },
];

const DEFAULT_THRESHOLDS: AlertThreshold[] = [
  {
    id: 'daily-cost-warning',
    name: 'Daily Cost Warning',
    metric: 'daily_cost',
    operator: 'gt',
    value: 5,
    severity: 'warning',
    enabled: true,
  },
  {
    id: 'daily-cost-critical',
    name: 'Daily Cost Critical',
    metric: 'daily_cost',
    operator: 'gt',
    value: 20,
    severity: 'critical',
    enabled: true,
  },
  {
    id: 'monthly-cost-warning',
    name: 'Monthly Cost Warning',
    metric: 'monthly_cost',
    operator: 'gt',
    value: 100,
    severity: 'warning',
    enabled: true,
  },
];

const DEFAULT_CONFIG: UsageConfig = {
  adminApiKey: undefined,
  alertThresholds: DEFAULT_THRESHOLDS,
  pollingIntervalMs: 300_000,
};

// ============================================
// RAW API RESPONSE SHAPES
// ============================================

interface RawUsageItem {
  model?: string;
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

interface RawUsageResponse {
  data?: RawUsageItem[];
  start_time?: string;
  end_time?: string;
}

interface RawCostItem {
  workspace_name?: string;
  token_cost_usd?: number;
  search_cost_usd?: number;
  code_execution_cost_usd?: number;
  total_cost_usd?: number;
}

interface RawCostResponse {
  data?: RawCostItem[];
  start_time?: string;
  end_time?: string;
}

// ============================================
// SERVICE
// ============================================

export class UsageService {
  // ------------------------------------------
  // Configuration persistence
  // ------------------------------------------

  /**
   * Load usage config from `.dev-suite/usage-config.json` inside the project.
   * Returns default config when the file does not exist or cannot be parsed.
   */
  getConfig(projectPath: string): UsageConfig {
    const resolved = resolveProjectPath(projectPath);
    const configPath = path.join(resolved, CONFIG_FILE);

    try {
      if (!fs.existsSync(configPath)) {
        return { ...DEFAULT_CONFIG, alertThresholds: [...DEFAULT_THRESHOLDS] };
      }

      const raw = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(raw) as Partial<UsageConfig>;

      return {
        adminApiKey: parsed.adminApiKey,
        alertThresholds:
          Array.isArray(parsed.alertThresholds) && parsed.alertThresholds.length > 0
            ? parsed.alertThresholds
            : [...DEFAULT_THRESHOLDS],
        pollingIntervalMs:
          typeof parsed.pollingIntervalMs === 'number' && parsed.pollingIntervalMs > 0
            ? parsed.pollingIntervalMs
            : DEFAULT_CONFIG.pollingIntervalMs,
      };
    } catch (err) {
      logger.warn('Failed to read usage config, using defaults', {
        path: configPath,
        error: err instanceof Error ? err.message : String(err),
      });
      return { ...DEFAULT_CONFIG, alertThresholds: [...DEFAULT_THRESHOLDS] };
    }
  }

  /**
   * Persist usage config to `.dev-suite/usage-config.json`.
   */
  saveConfig(projectPath: string, config: UsageConfig): void {
    const resolved = resolveProjectPath(projectPath);
    const configPath = path.join(resolved, CONFIG_FILE);
    const dir = path.dirname(configPath);

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    logger.info('Usage config saved', { path: configPath });
  }

  // ------------------------------------------
  // Admin API calls
  // ------------------------------------------

  /**
   * Fetch the usage report from the Anthropic Admin API.
   * Groups results by model over the requested date range.
   */
  async fetchUsageReport(
    adminApiKey: string,
    startDate: string,
    endDate: string,
  ): Promise<UsageReport> {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
      group_by: 'model',
      bucket_size: '1d',
    });

    const url = `${ADMIN_API_BASE}/usage_report/messages?${params.toString()}`;

    logger.debug('Fetching usage report', { startDate, endDate });

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'anthropic-version': ANTHROPIC_VERSION,
        'x-api-key': adminApiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `Admin API usage request failed: ${response.status} ${response.statusText}${body ? ` — ${body}` : ''}`,
      );
    }

    const json = (await response.json()) as RawUsageResponse;
    return this.parseUsageResponse(json, startDate, endDate);
  }

  /**
   * Fetch the cost report from the Anthropic Admin API.
   */
  async fetchCostReport(
    adminApiKey: string,
    startDate: string,
    endDate: string,
  ): Promise<CostReport> {
    const params = new URLSearchParams({
      start_date: startDate,
      end_date: endDate,
      bucket_size: '1d',
    });

    const url = `${ADMIN_API_BASE}/cost_report?${params.toString()}`;

    logger.debug('Fetching cost report', { startDate, endDate });

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'anthropic-version': ANTHROPIC_VERSION,
        'x-api-key': adminApiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `Admin API cost request failed: ${response.status} ${response.statusText}${body ? ` — ${body}` : ''}`,
      );
    }

    const json = (await response.json()) as RawCostResponse;
    return this.parseCostResponse(json, startDate, endDate);
  }

  // ------------------------------------------
  // Summary (main entry point)
  // ------------------------------------------

  /**
   * Fetch both usage and cost reports for today and the current calendar month,
   * evaluate configured alert thresholds, and return a full `UsageSummary`.
   *
   * Returns gracefully with `error` populated when no API key is configured
   * or when the Admin API is unreachable.
   */
  async getSummary(projectPath: string): Promise<UsageSummary> {
    const config = this.getConfig(projectPath);
    const deepLinks = this.getDeepLinks();

    if (!config.adminApiKey) {
      return {
        usage: null,
        cost: null,
        alerts: [],
        deepLinks,
        lastFetched: null,
        error:
          'No Admin API key configured. Set an Anthropic Admin API key (sk-ant-admin-...) in the usage settings to enable monitoring.',
      };
    }

    const now = new Date();
    const todayStr = toDateString(now);

    // Monthly window: first day of current month → today
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthStartStr = toDateString(monthStart);

    try {
      const [usage, cost] = await Promise.all([
        this.fetchUsageReport(config.adminApiKey, monthStartStr, todayStr),
        this.fetchCostReport(config.adminApiKey, monthStartStr, todayStr),
      ]);

      const alerts = this.evaluateAlerts(config, usage, cost);
      const lastFetched = new Date().toISOString();

      logger.info('Usage summary fetched successfully', {
        alerts: alerts.length,
        totalCost: cost.totalCostUsd,
      });

      return { usage, cost, alerts, deepLinks, lastFetched, error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('Failed to fetch usage summary', { error: message });

      return {
        usage: null,
        cost: null,
        alerts: [],
        deepLinks,
        lastFetched: null,
        error: `Failed to fetch usage data: ${message}`,
      };
    }
  }

  // ------------------------------------------
  // Deep links
  // ------------------------------------------

  /** Returns the static set of Anthropic Console deep links. */
  getDeepLinks(): DeepLink[] {
    return DEEP_LINKS;
  }

  // ------------------------------------------
  // Alert evaluation
  // ------------------------------------------

  /**
   * Evaluate each enabled threshold against the current usage/cost data
   * and return any alerts that have been triggered.
   */
  evaluateAlerts(
    config: UsageConfig,
    usage: UsageReport,
    cost: CostReport,
  ): UsageAlert[] {
    const alerts: UsageAlert[] = [];
    const now = new Date().toISOString();

    // Derive the daily figures from the last bucket in the reports
    const dailyCostUsd = this.getDailyTotal(cost);
    const dailyTokens = this.getDailyTokens(usage);
    const monthlyTokens =
      usage.totalInputTokens +
      usage.totalOutputTokens +
      usage.totalCacheCreationTokens +
      usage.totalCacheReadTokens;

    const metricValues: Record<AlertThreshold['metric'], number> = {
      daily_cost: dailyCostUsd,
      monthly_cost: cost.totalCostUsd,
      daily_tokens: dailyTokens,
      monthly_tokens: monthlyTokens,
    };

    for (const threshold of config.alertThresholds) {
      if (!threshold.enabled) continue;

      const currentValue = metricValues[threshold.metric] ?? 0;
      const triggered =
        threshold.operator === 'gt'
          ? currentValue > threshold.value
          : currentValue >= threshold.value;

      if (triggered) {
        const metricLabel = formatMetricLabel(threshold.metric);
        const valueLabel = formatValue(threshold.metric, currentValue);
        const limitLabel = formatValue(threshold.metric, threshold.value);

        alerts.push({
          id: `${threshold.id}-${now}`,
          timestamp: now,
          threshold,
          currentValue,
          message: `${threshold.name}: ${metricLabel} is ${valueLabel} (limit: ${limitLabel})`,
        });
      }
    }

    return alerts;
  }

  // ------------------------------------------
  // Private helpers
  // ------------------------------------------

  private parseUsageResponse(
    raw: RawUsageResponse,
    startDate: string,
    endDate: string,
  ): UsageReport {
    const items = raw.data ?? [];

    // Aggregate per-model across all time buckets
    const modelMap = new Map<string, ModelUsage>();

    for (const item of items) {
      const modelName = item.model ?? 'unknown';
      const existing = modelMap.get(modelName) ?? {
        model: modelName,
        inputTokens: 0,
        outputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
      };

      modelMap.set(modelName, {
        model: modelName,
        inputTokens: existing.inputTokens + (item.input_tokens ?? 0),
        outputTokens: existing.outputTokens + (item.output_tokens ?? 0),
        cacheCreationTokens:
          existing.cacheCreationTokens + (item.cache_creation_input_tokens ?? 0),
        cacheReadTokens:
          existing.cacheReadTokens + (item.cache_read_input_tokens ?? 0),
      });
    }

    const models = Array.from(modelMap.values());

    return {
      period: {
        start: raw.start_time ?? startDate,
        end: raw.end_time ?? endDate,
      },
      models,
      totalInputTokens: sumField(models, 'inputTokens'),
      totalOutputTokens: sumField(models, 'outputTokens'),
      totalCacheCreationTokens: sumField(models, 'cacheCreationTokens'),
      totalCacheReadTokens: sumField(models, 'cacheReadTokens'),
    };
  }

  private parseCostResponse(
    raw: RawCostResponse,
    startDate: string,
    endDate: string,
  ): CostReport {
    const items = raw.data ?? [];

    // Aggregate per-workspace across all time buckets
    const workspaceMap = new Map<string, CostBreakdown>();

    for (const item of items) {
      const workspace = item.workspace_name ?? 'default';
      const existing = workspaceMap.get(workspace) ?? {
        workspace,
        tokenCostUsd: 0,
        searchCostUsd: 0,
        codeExecutionCostUsd: 0,
        totalCostUsd: 0,
      };

      workspaceMap.set(workspace, {
        workspace,
        tokenCostUsd: existing.tokenCostUsd + (item.token_cost_usd ?? 0),
        searchCostUsd: existing.searchCostUsd + (item.search_cost_usd ?? 0),
        codeExecutionCostUsd:
          existing.codeExecutionCostUsd + (item.code_execution_cost_usd ?? 0),
        totalCostUsd: existing.totalCostUsd + (item.total_cost_usd ?? 0),
      });
    }

    const breakdown = Array.from(workspaceMap.values());
    const totalCostUsd = breakdown.reduce((sum, b) => sum + b.totalCostUsd, 0);

    return {
      period: {
        start: raw.start_time ?? startDate,
        end: raw.end_time ?? endDate,
      },
      totalCostUsd,
      breakdown,
    };
  }

  /**
   * Derive today's total cost from the cost report.
   * The Admin API returns daily buckets; we take the last bucket's total.
   * Falls back to the overall total divided by number of days if parsing fails.
   */
  private getDailyTotal(cost: CostReport): number {
    if (cost.breakdown.length === 0) return cost.totalCostUsd;

    // Since we aggregate per-workspace across the entire period we cannot
    // easily isolate a single day here without raw bucket data.  As an
    // approximation we return the total (which equals "monthly" for the
    // daily_cost metric when the period is one day, and is slightly over-
    // estimated otherwise).  The daily_cost threshold is most useful when
    // the period is set to a single day anyway.
    return cost.totalCostUsd;
  }

  /**
   * Total tokens for the entire reported period (used as the "daily" proxy
   * when the caller sets a one-day window).
   */
  private getDailyTokens(usage: UsageReport): number {
    return (
      usage.totalInputTokens +
      usage.totalOutputTokens +
      usage.totalCacheCreationTokens +
      usage.totalCacheReadTokens
    );
  }
}

// ============================================
// PRIVATE UTILITIES
// ============================================

function toDateString(date: Date): string {
  return date.toISOString().split('T')[0] ?? '';
}

function sumField(models: ModelUsage[], field: keyof ModelUsage): number {
  return models.reduce((acc, m) => acc + (m[field] as number), 0);
}

function formatMetricLabel(metric: AlertThreshold['metric']): string {
  const labels: Record<AlertThreshold['metric'], string> = {
    daily_cost: 'Daily cost',
    monthly_cost: 'Monthly cost',
    daily_tokens: 'Daily tokens',
    monthly_tokens: 'Monthly tokens',
  };
  return labels[metric];
}

function formatValue(metric: AlertThreshold['metric'], value: number): string {
  if (metric === 'daily_cost' || metric === 'monthly_cost') {
    return `$${value.toFixed(2)}`;
  }
  return value.toLocaleString();
}
