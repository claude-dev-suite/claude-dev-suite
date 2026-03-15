// SPDX-License-Identifier: MIT
/**
 * Log Analyzer handlers registry
 */

export { handleParseLogs } from "./parse-logs.js";
export { handleFindErrors } from "./find-errors.js";
export { handleAnalyzePatterns } from "./analyze-patterns.js";
export { handleAggregateStats } from "./aggregate-stats.js";
export { handleCorrelateEvents } from "./correlate-events.js";
export { handleTailLogs } from "./tail-logs.js";
export { handleSearchLogs } from "./search-logs.js";
export { handleCompareLogs } from "./compare-logs.js";
export { handleExportReport } from "./export-report.js";
export { handleWatchLogs } from "./watch-logs.js";

export type { Handler, HandlerResult } from "./types.js";
export { jsonResponse, errorResponse } from "./types.js";

import type { Handler } from "./types.js";
import { handleParseLogs } from "./parse-logs.js";
import { handleFindErrors } from "./find-errors.js";
import { handleAnalyzePatterns } from "./analyze-patterns.js";
import { handleAggregateStats } from "./aggregate-stats.js";
import { handleCorrelateEvents } from "./correlate-events.js";
import { handleTailLogs } from "./tail-logs.js";
import { handleSearchLogs } from "./search-logs.js";
import { handleCompareLogs } from "./compare-logs.js";
import { handleExportReport } from "./export-report.js";
import { handleWatchLogs } from "./watch-logs.js";

/**
 * Handler registry - maps tool names to their handlers
 */
export const handlers: Record<string, Handler> = {
  parse_logs: handleParseLogs,
  find_errors: handleFindErrors,
  analyze_patterns: handleAnalyzePatterns,
  aggregate_stats: handleAggregateStats,
  correlate_events: handleCorrelateEvents,
  tail_logs: handleTailLogs,
  search_logs: handleSearchLogs,
  compare_logs: handleCompareLogs,
  export_report: handleExportReport,
  watch_logs: handleWatchLogs,
};
