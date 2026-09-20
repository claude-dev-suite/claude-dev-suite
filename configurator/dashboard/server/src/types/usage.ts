// SPDX-License-Identifier: MIT
/**
 * Usage Monitor Types
 *
 * Types for Anthropic Admin API token usage/cost monitoring,
 * threshold alerts, and deep links to the Anthropic Console.
 */

// ============================================
// CONFIGURATION
// ============================================

export interface UsageConfig {
  /** Anthropic Admin API key (sk-ant-admin-...) */
  adminApiKey?: string;
  alertThresholds: AlertThreshold[];
  /** Polling interval in milliseconds. Default: 300000 (5 min) */
  pollingIntervalMs: number;
}

export interface AlertThreshold {
  id: string;
  name: string;
  metric: 'daily_cost' | 'monthly_cost' | 'daily_tokens' | 'monthly_tokens';
  operator: 'gt' | 'gte';
  value: number;
  severity: 'info' | 'warning' | 'critical';
  enabled: boolean;
}

// ============================================
// USAGE & COST REPORTS
// ============================================

export interface UsageReport {
  period: { start: string; end: string };
  models: ModelUsage[];
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCacheCreationTokens: number;
  totalCacheReadTokens: number;
}

export interface ModelUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
}

export interface CostReport {
  period: { start: string; end: string };
  totalCostUsd: number;
  breakdown: CostBreakdown[];
}

export interface CostBreakdown {
  workspace: string;
  tokenCostUsd: number;
  searchCostUsd: number;
  codeExecutionCostUsd: number;
  totalCostUsd: number;
}

// ============================================
// ALERTS
// ============================================

export interface UsageAlert {
  id: string;
  timestamp: string;
  threshold: AlertThreshold;
  currentValue: number;
  message: string;
}

// ============================================
// SUMMARY & DEEP LINKS
// ============================================

export interface DeepLink {
  label: string;
  url: string;
  description: string;
  /**
   * Which glyph the panel draws beside the link.
   *
   * The dashboard switches on this name and draws nothing for anything else.
   * The server sent no icon at all, and because its links replace the client's
   * own defaults as soon as a key is configured, every link in the live panel
   * lost its icon the moment the panel started working.
   */
  icon: 'credits' | 'dashboard' | 'plan' | 'settings' | 'external';
}

/**
 * A report for each window the panel shows.
 *
 * The summary used to carry one flat month-to-date report while the dashboard
 * read `summary.cost.today.totalCostUsd` — a shape the server never produced —
 * so every tile rendered `?? 0` and the panel affirmed "All thresholds clear"
 * from data it had not read. The daily figure was also faked internally: a
 * `getDailyTotal` helper returned the monthly total "as an approximation",
 * which meant a `daily_cost` alert compared today against the whole month.
 * Both windows are now fetched for real.
 */
export interface UsageWindow<T> {
  /** Today only (start === end === today). */
  today: T | null;
  /** Month to date. */
  monthly: T | null;
}

export interface UsageSummary {
  usage: UsageWindow<UsageReport>;
  cost: UsageWindow<CostReport>;
  alerts: UsageAlert[];
  deepLinks: DeepLink[];
  /** ISO timestamp of the last successful fetch, or null if never fetched */
  lastFetched: string | null;
  /** Human-readable error message if data could not be fetched */
  error: string | null;
}
