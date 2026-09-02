// SPDX-License-Identifier: MIT
import * as cheerio from "cheerio";

// Cache for live fetched docs
const liveCache = new Map<string, { content: string; timestamp: number }>();
const LIVE_CACHE_TTL = 15 * 60 * 1000; // 15 minutes

/**
 * Hard ceiling on a single documentation fetch.
 *
 * `fetch` has no default timeout. A docs host that accepts the connection and
 * then stalls left the handler pending forever, and the tool call with it —
 * one hung agent per stalled URL, none of them ever failing over to the
 * cached copy. A bounded failure is strictly better than an unbounded wait.
 */
const LIVE_FETCH_TIMEOUT_MS = 15_000;

/**
 * Fetch documentation from live URL and extract main content
 */
export async function fetchLiveDocs(url: string): Promise<string> {
  // Check cache
  const cached = liveCache.get(url);
  if (cached && Date.now() - cached.timestamp < LIVE_CACHE_TTL) {
    return cached.content;
  }

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Dev-Suite-Documentation-Bot/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(LIVE_FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const html = await response.text();
    const content = extractMainContent(html, url);

    // Update cache
    liveCache.set(url, { content, timestamp: Date.now() });

    return content;
  } catch (error) {
    throw new Error(
      `Failed to fetch ${url}: ${error instanceof Error ? error.message : "Unknown error"}`
    );
  }
}

/**
 * Extract main content from HTML using site-specific selectors
 */
function extractMainContent(html: string, url: string): string {
  const $ = cheerio.load(html);

  // Remove script, style, nav, footer elements
  $("script, style, nav, footer, header, aside, .sidebar, .toc").remove();

  // Site-specific selectors
  let mainContent: string;
  const hostname = new URL(url).hostname;

  if (hostname === "nextjs.org" || hostname.endsWith(".nextjs.org")) {
    mainContent = $("article, .docs-content, main").first().text();
  } else if (hostname === "react.dev" || hostname.endsWith(".react.dev")) {
    mainContent = $("article, main").first().text();
  } else if (hostname === "prisma.io" || hostname.endsWith(".prisma.io")) {
    mainContent = $(".article-content, article, main").first().text();
  } else if (hostname === "docs.nestjs.com" || hostname.endsWith(".nestjs.com")) {
    mainContent = $(".content, article, main").first().text();
  } else if (hostname === "tailwindcss.com" || hostname.endsWith(".tailwindcss.com")) {
    mainContent = $("#content-wrapper, article, main").first().text();
  } else if (hostname === "vitest.dev" || hostname.endsWith(".vitest.dev")) {
    mainContent = $(".VPDoc, article, main").first().text();
  } else if (hostname === "playwright.dev" || hostname.endsWith(".playwright.dev")) {
    mainContent = $("article, main").first().text();
  } else if (hostname === "typescriptlang.org" || hostname.endsWith(".typescriptlang.org")) {
    mainContent = $("#handbook-content, article, main").first().text();
  } else {
    // Generic fallback
    mainContent = $("article, main, .content, .documentation").first().text();
    if (!mainContent) {
      mainContent = $("body").text();
    }
  }

  // Clean up whitespace
  return cleanText(mainContent);
}

/**
 * Clean up extracted text
 */
function cleanText(text: string): string {
  return (
    text
      // Remove excessive whitespace
      .replace(/\s+/g, " ")
      // Remove multiple newlines
      .replace(/\n{3,}/g, "\n\n")
      // Trim
      .trim()
      // Limit length to ~10000 chars to save tokens
      .slice(0, 10000)
  );
}
