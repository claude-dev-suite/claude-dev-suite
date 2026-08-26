// SPDX-License-Identifier: MIT
/**
 * Shared types for documentation index
 */

export interface DocEntry {
  local: string;
  /**
   * Canonical upstream page, used as the live fallback when the KB copy is
   * unavailable.
   *
   * Optional because a few KB articles genuinely have no upstream: they
   * document undocumented proprietary formats (ABB Freelance .dmf/.prt) or
   * in-house workflows and cross-vendor comparisons that no vendor publishes.
   * Pointing those at a loosely-related product page would assert an authority
   * that does not exist, so they omit `url` and are served from the KB only.
   */
  url?: string;
}

export type DocsRecord = Record<string, Record<string, DocEntry>>;
