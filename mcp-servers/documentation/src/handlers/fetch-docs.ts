// SPDX-License-Identifier: MIT
/**
 * Handler for fetch_docs tool
 */

import { FetchDocsSchema, jsonResponse, type Handler, type HandlerContext, type HandlerResult } from "./types.js";
import { processContent } from "./utils.js";
import { docsIndex } from "../docs-index.js";
import { resolveKbCoords } from "../kb-path.js";
import { fetchLiveDocs } from "../sources/live-fetcher.js";

export const handleFetchDocs: Handler = async (args, ctx): Promise<HandlerResult> => {
  const { technology, topic, version, refresh, format, maxTokens, sections } = FetchDocsSchema.parse(args);

  const entry = docsIndex[technology]?.[topic];

  // On-demand KB mode with versioning support
  if (ctx.kbMode === "git" && ctx.kbFetcher && ctx.versionResolver) {
    try {
      // Resolve the real KB location from the index `local` path (the record
      // keys often differ from the on-disk layout, e.g. technology
      // "bitcoin-consensus" → "bitcoin/protocol/consensus/overview.md"). Falls
      // back to the key-derived path when `local` is missing.
      const { dir, topicStem } = resolveKbCoords(entry?.local, technology, topic);

      // Fetch/cache the KB directory first
      await ctx.kbFetcher.fetch(dir, refresh);

      // Use version resolver for versioned requests
      const result = await ctx.versionResolver.fetchVersioned({
        technology: dir,
        topic: topicStem,
        version,
      });

      const { content: processedContent, truncated, originalLength } = processContent(result.content, {
        format,
        sections,
        maxTokens,
      });

      return jsonResponse({
        content: processedContent,
        source: "git_cache",
        technology,
        topic,
        version: result.version,
        is_latest: result.is_latest,
        latest_version: result.latest_version,
        supported_versions: result.supported_versions,
        delta_applied: result.delta_applied,
        upgrade_available: result.upgrade_available,
        format: format || "full",
        sections_extracted: sections,
        truncated,
        original_length: originalLength,
        tokens_estimate: Math.ceil(processedContent.length / 4),
      });
    } catch (error) {
      console.error(`[KB] Git fetch failed, falling back to live:`, error);
      // Fall through to live mode
    }
  }

  // Live mode fallback (fetch from official docs URLs)
  if (!entry) {
    const availableTopics = Object.keys(docsIndex[technology] || {});
    return jsonResponse({
      error: `Topic "${topic}" not found for ${technology}`,
      available_topics: availableTopics,
      hint: "Try using Git mode with KB_REPO_URL for full documentation",
    });
  }

  // Fetch from live URL
  const rawContent = await fetchLiveDocs(entry.url);
  const { content: processedContent, truncated, originalLength } = processContent(rawContent, {
    format,
    sections,
    maxTokens,
  });

  return jsonResponse({
    content: processedContent,
    source: "live",
    technology,
    topic,
    format: format || "full",
    sections_extracted: sections,
    truncated,
    original_length: originalLength,
    tokens_estimate: Math.ceil(processedContent.length / 4),
  });
};
