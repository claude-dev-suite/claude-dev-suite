// SPDX-License-Identifier: MIT
/**
 * Utility functions for documentation handlers
 */

import fs from "fs/promises";
import Fuse from "fuse.js";
import type { KBCache } from "../kb-cache.js";

/**
 * Search in Git cache for matching content
 */
export async function searchInCache(
  cache: KBCache,
  query: string,
  technologies?: string[],
  maxResults = 5
): Promise<Array<{ technology: string; topic: string; excerpt: string; score: number }>> {
  const results: Array<{ technology: string; topic: string; content: string }> = [];

  // Get cached technologies
  const cachedTechs = await cache.listCachedTechnologies();
  const techsToSearch = technologies?.length
    ? cachedTechs.filter((t) => technologies.includes(t))
    : cachedTechs;

  // Load content from each cached technology
  for (const tech of techsToSearch) {
    const files = await cache.listFiles(tech);
    for (const file of files) {
      try {
        const filePath = cache.getCachePath(tech, file);
        const content = await fs.readFile(filePath, "utf-8");
        results.push({ technology: tech, topic: file.replace(".md", ""), content });
      } catch {
        // Skip if file can't be read
      }
    }
  }

  if (results.length === 0) {
    return [];
  }

  // Use Fuse.js for fuzzy search
  const fuse = new Fuse(results, {
    keys: ["content", "topic", "technology"],
    threshold: 0.4,
    includeScore: true,
  });

  const searchResults = fuse.search(query);

  return searchResults.slice(0, maxResults).map((result) => ({
    technology: result.item.technology,
    topic: result.item.topic,
    excerpt: extractExcerpt(result.item.content, query),
    score: result.score || 0,
  }));
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
