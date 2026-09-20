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
  UsageWindow,
  DeepLink,
} from '../types/usage.js';

const logger = getLogger('UsageService');

// ============================================
// CONSTANTS
// ============================================

const ADMIN_API_BASE = 'https://api.anthropic.com/v1/organizations';
const ANTHROPIC_VERSION = '2023-06-01';
const CONFIG_FILE = '.dev-suite/usage-config.json';

/** `1d` buckets cap at 31 per page, which is exactly one calendar month. */
const MAX_DAILY_BUCKETS = 31;

/** A month-to-date window is one page; the cap only bounds a pathological one. */
const MAX_REPORT_PAGES = 12;

const DEEP_LINKS: DeepLink[] = [
  {
    label: 'Enable Extra Usage',
    icon: 'settings' as const,
    url: 'https://console.anthropic.com/settings/billing',
    description: 'Increase your usage limits in the Anthropic Console billing settings.',
  },
  {
    label: 'Add Credits',
    icon: 'credits' as const,
    url: 'https://console.anthropic.com/settings/billing',
    description: 'Purchase additional API credits from the Anthropic Console.',
  },
  {
    label: 'View Usage Dashboard',
    icon: 'dashboard' as const,
    url: 'https://console.anthropic.com/settings/usage',
    description: 'Inspect detailed token and cost usage broken down by model and workspace.',
  },
  {
    label: 'Manage Plan',
    icon: 'plan' as const,
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

/**
 * The Admin API's real wire shapes.
 *
 * What was here before described an API that does not exist: flat `data`
 * items carrying `input_tokens` and `total_cost_usd`, fetched with
 * `start_date`/`end_date`/`bucket_size`. The live endpoints return *time
 * buckets* (`data[].results[]`), take `starting_at`/`ending_at`/`bucket_width`,
 * and name every field differently. Nothing matched, so every figure resolved
 * through `?? 0` and the panel rendered $0.00 against a real, billed account.
 *
 * Shapes below follow the published schemas for
 * `GET /v1/organizations/usage_report/messages` and
 * `GET /v1/organizations/cost_report`.
 */

interface RawBucket<R> {
  starting_at?: string;
  ending_at?: string;
  results?: R[];
}

interface RawPage<R> {
  data?: RawBucket<R>[];
  has_more?: boolean;
  next_page?: string | null;
}

interface RawUsageResult {
  model?: string | null;
  uncached_input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation?: {
    ephemeral_1h_input_tokens?: number;
    ephemeral_5m_input_tokens?: number;
  };
}

interface RawCostResult {
  /**
   * Cost in the *lowest currency unit* as a decimal string - "123.45" in USD
   * means $1.23. The published schema is explicit about this; reading it as
   * dollars would overstate every figure by 100x.
   */
  amount?: string;
  currency?: string;
  cost_type?: 'code_execution' | 'session_usage' | 'tokens' | 'web_search' | null;
  workspace_id?: string | null;
  description?: string | null;
}

/** One day of a report, keyed by its UTC calendar date (`YYYY-MM-DD`). */
interface DailyReport<T> {
  date: string;
  report: T;
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
   *
   * SECURITY: This returns the raw config including the plain-text adminApiKey
   * for internal use only.  The route layer MUST call getMaskedConfig() when
   * sending the response to the client.
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
   * Return the config with the admin API key masked.
   *
   * Instead of the raw key, the response includes:
   *   - `hasApiKey: boolean`   — whether a key is configured
   *   - `apiKeyPreview: string | undefined` — e.g. "sk-ant-...ab12" (first 8 + last 4 chars)
   *
   * The plain `adminApiKey` field is NEVER present in the returned object.
   */
  getMaskedConfig(
    projectPath: string,
  ): Omit<UsageConfig, 'adminApiKey'> & { hasApiKey: boolean; apiKeyPreview?: string } {
    const config = this.getConfig(projectPath);
    const { adminApiKey, ...rest } = config;

    const hasApiKey = Boolean(adminApiKey);
    let apiKeyPreview: string | undefined;
    if (adminApiKey && adminApiKey.length >= 12) {
      // Show first 8 + "..." + last 4 characters — enough to identify the key
      // without leaking it.
      apiKeyPreview = `${adminApiKey.slice(0, 8)}...${adminApiKey.slice(-4)}`;
    } else if (adminApiKey && adminApiKey.length > 0) {
      // Very short key — show only "****" to avoid partial leakage
      apiKeyPreview = '****';
    }

    return { ...rest, hasApiKey, apiKeyPreview };
  }

  /**
   * Persist usage config to `.dev-suite/usage-config.json`.
   *
   * `adminApiKey` is write-only across the API: `getMaskedConfig()` never sends
   * it to the client, so a client round-tripping the config it was given cannot
   * send it back. An **omitted** key therefore means "leave it as it is", and
   * only an explicit empty string clears it. Without this, editing an alert
   * threshold or the polling interval silently deleted the stored credential.
   */
  saveConfig(projectPath: string, config: UsageConfig): void {
    const resolved = resolveProjectPath(projectPath);
    const configPath = path.join(resolved, CONFIG_FILE);
    const dir = path.dirname(configPath);

    const next: UsageConfig = { ...config };
    if (next.adminApiKey === undefined) {
      const existing = this.getConfig(resolved).adminApiKey;
      if (existing) next.adminApiKey = existing;
    } else if (next.adminApiKey === '') {
      delete next.adminApiKey;
    }

    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(next, null, 2), 'utf-8');
    logger.info('Usage config saved', { path: configPath });
  }

  // ------------------------------------------
  // Admin API calls
  // ------------------------------------------

  /**
   * Page through one bucketed Admin API report.
   *
   * `limit` counts buckets, not rows, and tops out at 31 for `1d` - a
   * month-to-date window fits in one page. `next_page` is still followed, with
   * a hard cap, so a future change in bucketing cannot spin here.
   */
  private async fetchBuckets<R>(
    endpoint: string,
    adminApiKey: string,
    params: URLSearchParams,
  ): Promise<RawBucket<R>[]> {
    const buckets: RawBucket<R>[] = [];
    let page: string | null = null;

    for (let request = 0; request < MAX_REPORT_PAGES; request++) {
      const query = new URLSearchParams(params);
      if (page) query.set('page', page);

      const response = await fetch(`${ADMIN_API_BASE}/${endpoint}?${query.toString()}`, {
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
          `Admin API ${endpoint} request failed: ${response.status} ${response.statusText}${body ? ` - ${body}` : ''}`,
        );
      }

      const json = (await response.json()) as RawPage<R>;
      buckets.push(...(json.data ?? []));

      if (!json.has_more || !json.next_page) return buckets;
      page = json.next_page;
    }

    logger.warn('Admin API report truncated at the page cap', { endpoint });
    return buckets;
  }

  /**
   * Fetch daily usage buckets between two `YYYY-MM-DD` dates, inclusive.
   *
   * `ending_at` is exclusive and buckets are snapped to the UTC day, so the end
   * date is sent as the following midnight - otherwise today's own bucket,
   * which is the one the panel leads with, is never returned.
   */
  async fetchUsageDays(
    adminApiKey: string,
    startDate: string,
    endDate: string,
  ): Promise<DailyReport<UsageReport>[]> {
    const params = new URLSearchParams({
      starting_at: `${startDate}T00:00:00Z`,
      ending_at: `${nextDay(endDate)}T00:00:00Z`,
      bucket_width: '1d',
      limit: String(MAX_DAILY_BUCKETS),
    });
    params.append('group_by[]', 'model');

    logger.debug('Fetching usage report', { startDate, endDate });

    const buckets = await this.fetchBuckets<RawUsageResult>(
      'usage_report/messages',
      adminApiKey,
      params,
    );

    return buckets.map(bucket => {
      const date = bucketDate(bucket, startDate);
      return { date, report: this.parseUsageBuckets([bucket], date, date) };
    });
  }

  /** Fetch daily cost buckets between two `YYYY-MM-DD` dates, inclusive. */
  async fetchCostDays(
    adminApiKey: string,
    startDate: string,
    endDate: string,
  ): Promise<DailyReport<CostReport>[]> {
    const params = new URLSearchParams({
      starting_at: `${startDate}T00:00:00Z`,
      ending_at: `${nextDay(endDate)}T00:00:00Z`,
      bucket_width: '1d',
      limit: String(MAX_DAILY_BUCKETS),
    });
    // Without a grouping every row is an untyped lump; these two are what the
    // per-workspace, per-cost-type breakdown is built from.
    params.append('group_by[]', 'description');
    params.append('group_by[]', 'workspace_id');

    logger.debug('Fetching cost report', { startDate, endDate });

    const buckets = await this.fetchBuckets<RawCostResult>('cost_report', adminApiKey, params);

    return buckets.map(bucket => {
      const date = bucketDate(bucket, startDate);
      return { date, report: this.parseCostBuckets([bucket], date, date) };
    });
  }

  /** The whole window as one usage report. */
  async fetchUsageReport(
    adminApiKey: string,
    startDate: string,
    endDate: string,
  ): Promise<UsageReport> {
    const days = await this.fetchUsageDays(adminApiKey, startDate, endDate);
    return mergeUsageReports(days.map(d => d.report), startDate, endDate);
  }

  /** The whole window as one cost report. */
  async fetchCostReport(
    adminApiKey: string,
    startDate: string,
    endDate: string,
  ): Promise<CostReport> {
    const days = await this.fetchCostDays(adminApiKey, startDate, endDate);
    return mergeCostReports(days.map(d => d.report), startDate, endDate);
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
        usage: { today: null, monthly: null },
        cost: { today: null, monthly: null },
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
    // Built in UTC, like every other date here: the API's buckets are UTC days
    // and `toDateString` reads the UTC date, so a local-time month start
    // resolved to the previous month's last day east of Greenwich and pulled an
    // extra day into every "monthly" figure.
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const monthStartStr = toDateString(monthStart);

    try {
      // One request per report, bucketed by day: the month is the sum of the
      // buckets and today is the last of them. The daily figures used to come
      // from helpers that returned the monthly total - so "Today's Cost" and
      // any `daily_cost` threshold were actually month-to-date.
      const [usageDays, costDays] = await Promise.all([
        this.fetchUsageDays(config.adminApiKey, monthStartStr, todayStr),
        this.fetchCostDays(config.adminApiKey, monthStartStr, todayStr),
      ]);

      // A day with no activity is a real zero, not missing data: the API
      // returns empty buckets, and an absent one means the same thing.
      const usage: UsageWindow<UsageReport> = {
        today:
          usageDays.find(d => d.date === todayStr)?.report ?? emptyUsageReport(todayStr),
        monthly: mergeUsageReports(
          usageDays.map(d => d.report),
          monthStartStr,
          todayStr,
        ),
      };
      const cost: UsageWindow<CostReport> = {
        today: costDays.find(d => d.date === todayStr)?.report ?? emptyCostReport(todayStr),
        monthly: mergeCostReports(
          costDays.map(d => d.report),
          monthStartStr,
          todayStr,
        ),
      };
      const alerts = this.evaluateAlerts(config, usage, cost);
      const lastFetched = new Date().toISOString();

      logger.info('Usage summary fetched successfully', {
        alerts: alerts.length,
        days: costDays.length,
        todayCost: cost.today?.totalCostUsd,
        monthlyCost: cost.monthly?.totalCostUsd,
      });

      return { usage, cost, alerts, deepLinks, lastFetched, error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('Failed to fetch usage summary', { error: message });

      return {
        usage: { today: null, monthly: null },
        cost: { today: null, monthly: null },
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
    usage: UsageWindow<UsageReport>,
    cost: UsageWindow<CostReport>,
  ): UsageAlert[] {
    const alerts: UsageAlert[] = [];
    const now = new Date().toISOString();

    // Each metric reads the window it names. The daily pair used to come from
    // helpers that admitted in their own comments to returning the monthly
    // total, so a "$50/day" threshold fired on the month's spend.
    const metricValues: Record<AlertThreshold['metric'], number> = {
      daily_cost: cost.today?.totalCostUsd ?? 0,
      monthly_cost: cost.monthly?.totalCostUsd ?? 0,
      daily_tokens: totalTokens(usage.today),
      monthly_tokens: totalTokens(usage.monthly),
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

  private parseUsageBuckets(
    buckets: RawBucket<RawUsageResult>[],
    startDate: string,
    endDate: string,
  ): UsageReport {
    const modelMap = new Map<string, ModelUsage>();

    for (const bucket of buckets) {
      for (const item of bucket.results ?? []) {
        const modelName = item.model ?? 'unknown';
        const existing = modelMap.get(modelName) ?? {
          model: modelName,
          inputTokens: 0,
          outputTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
        };

        // Cache creation arrives split by TTL; the report carries one figure.
        const cacheCreation =
          (item.cache_creation?.ephemeral_1h_input_tokens ?? 0) +
          (item.cache_creation?.ephemeral_5m_input_tokens ?? 0);

        modelMap.set(modelName, {
          model: modelName,
          inputTokens: existing.inputTokens + (item.uncached_input_tokens ?? 0),
          outputTokens: existing.outputTokens + (item.output_tokens ?? 0),
          cacheCreationTokens: existing.cacheCreationTokens + cacheCreation,
          cacheReadTokens: existing.cacheReadTokens + (item.cache_read_input_tokens ?? 0),
        });
      }
    }

    const models = Array.from(modelMap.values());

    return {
      period: { start: startDate, end: endDate },
      models,
      totalInputTokens: sumField(models, 'inputTokens'),
      totalOutputTokens: sumField(models, 'outputTokens'),
      totalCacheCreationTokens: sumField(models, 'cacheCreationTokens'),
      totalCacheReadTokens: sumField(models, 'cacheReadTokens'),
    };
  }

  private parseCostBuckets(
    buckets: RawBucket<RawCostResult>[],
    startDate: string,
    endDate: string,
  ): CostReport {
    const workspaceMap = new Map<string, CostBreakdown>();

    for (const bucket of buckets) {
      for (const item of bucket.results ?? []) {
        // The API identifies a workspace by id and sends `null` for the org's
        // default one; there is no name on this endpoint.
        const workspace = item.workspace_id ?? 'default';
        const existing = workspaceMap.get(workspace) ?? {
          workspace,
          tokenCostUsd: 0,
          searchCostUsd: 0,
          codeExecutionCostUsd: 0,
          totalCostUsd: 0,
        };

        const usd = centsToUsd(item.amount);

        workspaceMap.set(workspace, {
          workspace,
          tokenCostUsd: existing.tokenCostUsd + (item.cost_type === 'tokens' ? usd : 0),
          searchCostUsd: existing.searchCostUsd + (item.cost_type === 'web_search' ? usd : 0),
          codeExecutionCostUsd:
            existing.codeExecutionCostUsd + (item.cost_type === 'code_execution' ? usd : 0),
          // `session_usage` has no column of its own, so the total is the sum
          // of every row rather than of the three named ones.
          totalCostUsd: existing.totalCostUsd + usd,
        });
      }
    }

    const breakdown = Array.from(workspaceMap.values());

    return {
      period: { start: startDate, end: endDate },
      totalCostUsd: breakdown.reduce((sum, b) => sum + b.totalCostUsd, 0),
      breakdown,
    };
  }

}

// ============================================
// PRIVATE UTILITIES
// ============================================

/** The UTC calendar date a bucket belongs to, falling back to the window start. */
function bucketDate(bucket: { starting_at?: string }, fallback: string): string {
  return bucket.starting_at?.split('T')[0] ?? fallback;
}

/** The day after a `YYYY-MM-DD` date, for the API's exclusive `ending_at`. */
function nextDay(date: string): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return toDateString(next);
}

/**
 * The API reports cost in the lowest currency unit as a decimal string.
 * A malformed or absent amount is worth zero, never `NaN` - one `NaN` row
 * would poison the whole total and every threshold compared against it.
 */
function centsToUsd(amount: string | undefined): number {
  const parsed = Number.parseFloat(amount ?? '');
  return Number.isFinite(parsed) ? parsed / 100 : 0;
}

function emptyUsageReport(date: string): UsageReport {
  return {
    period: { start: date, end: date },
    models: [],
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheCreationTokens: 0,
    totalCacheReadTokens: 0,
  };
}

function emptyCostReport(date: string): CostReport {
  return { period: { start: date, end: date }, totalCostUsd: 0, breakdown: [] };
}

/** Sum daily usage reports into one, re-aggregating per model. */
function mergeUsageReports(
  reports: UsageReport[],
  startDate: string,
  endDate: string,
): UsageReport {
  const modelMap = new Map<string, ModelUsage>();

  for (const report of reports) {
    for (const model of report.models) {
      const existing = modelMap.get(model.model);
      if (!existing) {
        modelMap.set(model.model, { ...model });
        continue;
      }
      existing.inputTokens += model.inputTokens;
      existing.outputTokens += model.outputTokens;
      existing.cacheCreationTokens += model.cacheCreationTokens;
      existing.cacheReadTokens += model.cacheReadTokens;
    }
  }

  const models = Array.from(modelMap.values());

  return {
    period: { start: startDate, end: endDate },
    models,
    totalInputTokens: sumField(models, 'inputTokens'),
    totalOutputTokens: sumField(models, 'outputTokens'),
    totalCacheCreationTokens: sumField(models, 'cacheCreationTokens'),
    totalCacheReadTokens: sumField(models, 'cacheReadTokens'),
  };
}

/** Sum daily cost reports into one, re-aggregating per workspace. */
function mergeCostReports(
  reports: CostReport[],
  startDate: string,
  endDate: string,
): CostReport {
  const workspaceMap = new Map<string, CostBreakdown>();

  for (const report of reports) {
    for (const entry of report.breakdown) {
      const existing = workspaceMap.get(entry.workspace);
      if (!existing) {
        workspaceMap.set(entry.workspace, { ...entry });
        continue;
      }
      existing.tokenCostUsd += entry.tokenCostUsd;
      existing.searchCostUsd += entry.searchCostUsd;
      existing.codeExecutionCostUsd += entry.codeExecutionCostUsd;
      existing.totalCostUsd += entry.totalCostUsd;
    }
  }

  const breakdown = Array.from(workspaceMap.values());

  return {
    period: { start: startDate, end: endDate },
    totalCostUsd: breakdown.reduce((sum, b) => sum + b.totalCostUsd, 0),
    breakdown,
  };
}

function toDateString(date: Date): string {
  return date.toISOString().split('T')[0] ?? '';
}

/** Every token class in one report; `null` (no data for the window) is zero. */
function totalTokens(usage: UsageReport | null): number {
  if (!usage) return 0;
  return (
    usage.totalInputTokens +
    usage.totalOutputTokens +
    usage.totalCacheCreationTokens +
    usage.totalCacheReadTokens
  );
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
