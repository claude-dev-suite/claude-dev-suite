// SPDX-License-Identifier: MIT
/**
 * Handler for list_topics tool
 */

import { ListTopicsSchema, jsonResponse, type Handler, type HandlerResult } from "./types.js";
import { docsIndex } from "../docs-index.js";

export const handleListTopics: Handler = async (args, ctx): Promise<HandlerResult> => {
  const { technology } = ListTopicsSchema.parse(args);

  // Git mode - fetch from cached KB
  if (ctx.kbMode === "git" && ctx.kbFetcher) {
    try {
      const files = await ctx.kbFetcher.fetch(technology);
      const versions = ctx.versionResolver
        ? await ctx.versionResolver.listVersions(technology)
        : null;

      return jsonResponse({
        technology,
        files,
        count: files.length,
        mode: "git",
        versions: versions?.supported,
        latest_version: versions?.latest,
      });
    } catch (error) {
      console.error(`[KB] Failed to list topics:`, error);
      // Fall through to live mode
    }
  }

  // Live mode fallback - show available topics from docsIndex
  const topics = Object.keys(docsIndex[technology] || {});

  return jsonResponse({
    technology,
    topics,
    count: topics.length,
    mode: "live_only",
    hint: "Full topic list available in Git mode",
  });
};
