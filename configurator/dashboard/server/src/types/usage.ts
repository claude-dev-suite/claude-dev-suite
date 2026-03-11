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
}

export interface UsageSummary {
  usage: UsageReport | null;
  cost: CostReport | null;
  alerts: UsageAlert[];
  deepLinks: DeepLink[];
  /** ISO timestamp of the last successful fetch, or null if never fetched */
  lastFetched: string | null;
  /** Human-readable error message if data could not be fetched */
  error: string | null;
}
