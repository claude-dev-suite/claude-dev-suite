// SPDX-License-Identifier: MIT
/**
 * Utility functions for documentation handlers
 */

import fs from "fs/promises";
import Fuse from "fuse.js";
import { SingleFlight } from "@dev-suite/shared";
import type { KBCache } from "../kb-cache.js";

interface SearchDoc {
  technology: string;
  topic: string;
  content: string;
}

/**
 * The Fuse index, memoized against the cache's fetch signature.
 *
 * Every `search_docs` call used to read EVERY markdown file of EVERY cached
 * technology off disk and build a fresh Fuse index — tens of megabytes of I/O
 * and a full tokenisation pass, repeated once per concurrent subagent. The
 * corpus only changes when a technology is re-fetched, which is exactly what
 * `KBCache.getSignature()` reports, so the index is rebuilt then and only then.
 */
let memoizedIndex: { signature: string; fuse: Fuse<SearchDoc> } | null = null;

/** Concurrent searches arriving on a cold index build it once, not N times. */
const indexBuilds = new SingleFlight<Fuse<SearchDoc>>();

/** Drop the memoized index. Exposed for tests. */
export function resetSearchIndex(): void {
  memoizedIndex = null;
}

async function loadDocs(cache: KBCache): Promise<SearchDoc[]> {
  const docs: SearchDoc[] = [];

  for (const tech of await cache.listCachedTechnologies()) {
    const files = await cache.listFiles(tech);
    for (const file of files) {
      try {
        const filePath = cache.getCachePath(tech, file);
        const content = await fs.readFile(filePath, "utf-8");
        docs.push({ technology: tech, topic: file.replace(/\.md$/, ""), content });
      } catch {
        // Skip if file can't be read
      }
    }
  }

  return docs;
}

async function getIndex(cache: KBCache): Promise<Fuse<SearchDoc>> {
  const signature = await cache.getSignature();
  if (memoizedIndex && memoizedIndex.signature === signature) {
    return memoizedIndex.fuse;
  }

  return indexBuilds.run(signature, async () => {
    // Re-check: a build for this signature may have completed while we waited.
    if (memoizedIndex && memoizedIndex.signature === signature) {
      return memoizedIndex.fuse;
    }

    const docs = await loadDocs(cache);
    const fuse = new Fuse(docs, {
      keys: ["content", "topic", "technology"],
      threshold: 0.4,
      includeScore: true,
    });
    memoizedIndex = { signature, fuse };
    return fuse;
  });
}

/**
 * Search in Git cache for matching content
 */
export async function searchInCache(
  cache: KBCache,
  query: string,
  technologies?: string[],
  maxResults = 5
): Promise<Array<{ technology: string; topic: string; excerpt: string; score: number }>> {
  const fuse = await getIndex(cache);

  // Filtering happens on the results rather than on the corpus, so one index
  // serves every combination of `technologies` a caller asks for. Fuse is
  // asked for more than `maxResults` because the filter runs after scoring.
  const filter = technologies?.length ? new Set(technologies) : null;
  const hits = fuse.search(query, filter ? undefined : { limit: maxResults });

  const out: Array<{ technology: string; topic: string; excerpt: string; score: number }> = [];
  for (const hit of hits) {
    if (filter && !filter.has(hit.item.technology)) continue;
    out.push({
      technology: hit.item.technology,
      topic: hit.item.topic,
      excerpt: extractExcerpt(hit.item.content, query),
      score: hit.score || 0,
    });
    if (out.length >= maxResults) break;
  }

  return out;
}

/**
 * Extract specific sections from markdown content
 */
export function extractSections(content: string, sections: string[]): string {
  if (!sections || sections.length === 0) {
    return content;
  }

  const lines = content.split("\n");
  const extractedLines: string[] = [];
  let capturing = false;

  for (const line of lines) {
    // Check if this is a header
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headerMatch) {
      const headerText = headerMatch[2].trim();
      const isRequestedSection = sections.some(
        (s) => headerText.toLowerCase().includes(s.toLowerCase())
      );

      if (isRequestedSection) {
        capturing = true;
        extractedLines.push(line);
      } else if (capturing) {
        // Stop capturing when we hit another header
        capturing = false;
      }
    } else if (capturing) {
      extractedLines.push(line);
    }
  }

  if (extractedLines.length === 0) {
    return `[No sections matching: ${sections.join(", ")}]\n\nAvailable sections:\n${extractSectionHeaders(content)}`;
  }

  return extractedLines.join("\n");
}

/**
 * Extract all section headers from markdown
 */
export function extractSectionHeaders(content: string): string {
  const headers = content.match(/^#{1,6}\s+.+$/gm) || [];
  return headers.slice(0, 20).join("\n");
}

/**
 * Format content based on requested format
 */
export function formatContent(content: string, format: "full" | "summary" | "excerpt"): string {
  switch (format) {
    case "excerpt":
      return content.slice(0, 200) + (content.length > 200 ? "..." : "");
    case "summary":
      return content.slice(0, 500) + (content.length > 500 ? "..." : "");
    case "full":
    default:
      return content;
  }
}

/**
 * Truncate content to max tokens
 */
export function truncateToTokens(content: string, maxTokens: number): { content: string; truncated: boolean } {
  const maxChars = maxTokens * 4; // ~4 chars per token
  if (content.length <= maxChars) {
    return { content, truncated: false };
  }
  return {
    content: content.slice(0, maxChars) + "\n\n[... truncated to fit maxTokens limit]",
    truncated: true,
  };
}

/**
 * Extract a relevant excerpt from content around the query match
 */
export function extractExcerpt(content: string, query: string): string {
  const lowerContent = content.toLowerCase();
  const lowerQuery = query.toLowerCase();

  const index = lowerContent.indexOf(lowerQuery);
  if (index === -1) {
    return content.slice(0, 200) + "...";
  }

  const start = Math.max(0, index - 100);
  const end = Math.min(content.length, index + query.length + 100);

  let excerpt = content.slice(start, end);
  if (start > 0) excerpt = "..." + excerpt;
  if (end < content.length) excerpt = excerpt + "...";

  return excerpt;
}

/**
 * Process content with format, sections, and maxTokens
 */
export function processContent(
  rawContent: string,
  options: {
    format?: "full" | "summary" | "excerpt";
    sections?: string[];
    maxTokens?: number;
  }
): { content: string; truncated: boolean; originalLength: number } {
  let processed = rawContent;
  const originalLength = rawContent.length;

  // Extract sections if requested
  if (options.sections && options.sections.length > 0) {
    processed = extractSections(processed, options.sections);
  }

  // Apply format
  processed = formatContent(processed, options.format || "full");

  // Apply maxTokens limit
  let truncated = false;
  if (options.maxTokens) {
    const result = truncateToTokens(processed, options.maxTokens);
    processed = result.content;
    truncated = result.truncated;
  }

  return { content: processed, truncated, originalLength };
}
