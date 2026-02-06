// SPDX-License-Identifier: MIT
/**
 * Handler for search_docs tool
 */

import { SearchDocsSchema, jsonResponse, type Handler, type HandlerResult } from "./types.js";
import { searchInCache } from "./utils.js";

export const handleSearchDocs: Handler = async (args, ctx): Promise<HandlerResult> => {
  const { query, technologies, maxResults } = SearchDocsSchema.parse(args);

  // Search only works in Git mode (needs cached files)
  if (ctx.kbMode !== "git" || !ctx.kbCache) {
    return jsonResponse({
      error: "Search requires Git mode with cached knowledge base",
      hint: "Ensure Git is available and KB_REPO_URL is configured",
      mode: ctx.kbMode,
    });
  }

  // Search in cached files
  const results = await searchInCache(ctx.kbCache, query, technologies, maxResults);

  return jsonResponse({
    results,
    total_found: results.length,
    query,
    mode: "git_cache",
  });
};
