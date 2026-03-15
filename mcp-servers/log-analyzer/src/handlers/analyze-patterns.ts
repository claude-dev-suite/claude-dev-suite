// SPDX-License-Identifier: MIT
/**
 * Handler for analyze_patterns tool
 */

import { AnalyzePatternsSchema, jsonResponse, type Handler, type HandlerResult } from "./types.js";
import { analyzePatterns } from "../analyzers/patterns.js";
import { validateLogPath } from "../utils.js";

export const handleAnalyzePatterns: Handler = async (args): Promise<HandlerResult> => {
  const input = AnalyzePatternsSchema.parse(args);
  validateLogPath(input.filePath);
  const result = await analyzePatterns(input);
  return jsonResponse(result);
};
