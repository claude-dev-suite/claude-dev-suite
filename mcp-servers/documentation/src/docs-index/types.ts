// SPDX-License-Identifier: MIT
/**
 * Shared types for documentation index
 */

export interface DocEntry {
  /**
   * Where the article lives inside the knowledge base, relative to
   * `knowledge/` (e.g. "bitcoin/protocol/consensus/overview.md"). Git mode
   * derives its sparse-checkout coordinates from this rather than from the
   * record keys, which frequently differ from the on-disk layout.
   *
   * Optional because a topic can be genuinely live-only: the KB never wrote an
   * article for it and the upstream `url` is the whole answer. Naming a file
   * that does not exist used to be the way those were spelled, which cost a
   * failed sparse checkout and an error log on every request before the handler
   * fell through to `url`. Omitting `local` says the same thing and skips the
   * checkout. An entry must carry at least one of `local` and `url`.
   */
  local?: string;
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
