// SPDX-License-Identifier: MIT
/**
 * Handler for aggregate_stats tool
 */

import { AggregateStatsSchema, jsonResponse, type Handler, type HandlerResult } from "./types.js";
import { aggregateStats } from "../analyzers/stats.js";
import { validateLogPath } from "../utils.js";

export const handleAggregateStats: Handler = async (args): Promise<HandlerResult> => {
  const input = AggregateStatsSchema.parse(args);
  validateLogPath(input.filePath);
  const result = await aggregateStats(input);
  return jsonResponse(result);
};
