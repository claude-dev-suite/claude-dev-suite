// SPDX-License-Identifier: MIT
/**
 * KB path resolution
 *
 * The docs-index `local` field records where a topic's markdown actually lives
 * inside the knowledge base (e.g. "bitcoin/protocol/consensus/overview.md"),
 * which frequently differs from the `{technology}/{topic}.md` shape implied by
 * the record keys (e.g. technology "bitcoin-consensus", topic "overview").
 *
 * Git mode must fetch/read using the real KB layout, so it derives its
 * coordinates from `local` rather than the keys. When `local` is absent or
 * unsafe we fall back to the key-derived path, preserving the previous
 * behaviour (which then degrades to the live URL fallback if the file is
 * missing).
 */

// A single path segment: letters, digits and a few punctuation marks. Notably
// excludes "/" and rejects "." / ".." traversal segments below.
const SAFE_SEGMENT = /^[A-Za-z0-9_.@-]+$/;

export interface KbCoords {
  /** KB directory to sparse-checkout — used as the KBFetcher/KBCache key. */
  dir: string;
  /** Topic path relative to `dir`, without the `.md` suffix. May be nested. */
  topicStem: string;
}

function isSafeSegment(seg: string): boolean {
  return seg !== "." && seg !== ".." && SAFE_SEGMENT.test(seg);
}

/**
 * Resolve the KB directory + topic stem for a (technology, topic) pair.
 *
 * @param local  The docs-index `local` path, or undefined.
 * @param technology  Record key — used as fallback dir.
 * @param topic  Record key — used as fallback topic stem.
 */
export function resolveKbCoords(
  local: string | undefined,
  technology: string,
  topic: string
): KbCoords {
  if (local) {
    const parts = local
      .replace(/\\/g, "/")
      .split("/")
      .filter((p) => p.length > 0);

    // Need at least a directory + a file, all segments safe (no traversal).
    if (parts.length >= 2 && parts.every(isSafeSegment)) {
      const dir = parts[0];
      const file = parts.slice(1).join("/");
      const topicStem = file.replace(/\.md$/i, "");
      if (topicStem.length > 0) {
        return { dir, topicStem };
      }
    }
  }

  // Fallback: the raw docs-index keys. These reach `path.join` downstream, and
  // `technology`/`topic` come straight off an unconstrained `z.string()` tool
  // argument — so a `topic` of `../../../../etc/passwd` used to escape the KB
  // root whenever the index lookup missed. `isSafeSegment` is applied to every
  // segment here too, not only on the `local` branch.
  const dir = isSafeSegment(technology) ? technology : "";
  const topicStem = isSafeSegment(topic) ? topic : "";
  if (!dir) {
    throw new Error(`Invalid technology name: ${JSON.stringify(technology)}`);
  }
  if (topic.length > 0 && !topicStem) {
    throw new Error(`Invalid topic name: ${JSON.stringify(topic)}`);
  }
  return { dir, topicStem };
}

/**
 * Resolve just the KB directory for a technology, given the `local` path of any
 * of its topics (they all share the same first segment). Falls back to the
 * technology key when `local` is missing/unsafe.
 */
export function resolveKbDir(local: string | undefined, technology: string): string {
  return resolveKbCoords(local, technology, "").dir;
}
