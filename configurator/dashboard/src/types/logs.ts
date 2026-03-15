// SPDX-License-Identifier: MIT
/**
 * Log types for the dashboard
 */

export interface LogEntry {
  timestamp: string;
  level: string;
  component: string;
  message: string;
  data?: unknown;
  correlationId?: string;
}

export interface LogStats {
  total: number;
  byLevel: Record<string, number>;
  byComponent: Record<string, number>;
  recentErrorCount: number;
  recentErrors: LogEntry[];
}

export interface LogsResponse {
  success: boolean;
  data?: {
    logs: LogEntry[];
    total: number;
    limit: number;
  };
  error?: string;
}

export interface LogStatsResponse {
  success: boolean;
  data?: LogStats;
  error?: string;
}
