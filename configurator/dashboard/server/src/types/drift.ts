// SPDX-License-Identifier: MIT
// KEPT IN SYNC with configurator/dashboard/{src,server/src}/types/drift.ts
/**
 * Drift Detection Types
 *
 * "Drift" is a dev-suite-managed file whose on-disk content no longer matches
 * what dev-suite wrote. It matters because nothing locks a project while a
 * fan-out of concurrent agents edits it: an agent can rewrite `.claude/agents/*`
 * or the marked section of `AGENTS.md`, and the next `install()` would replace
 * it with no backup and no report.
 *
 * Two ideas make the report decidable:
 *
 *  - **Section scope.** For files delimited by the `DEV-SUITE-CONFIG-START/END`
 *    markers (`AGENTS.md`, `CLAUDE.md`) the whole-file hash is useless: the
 *    user's own prose lives in the same file and changes legitimately. Only the
 *    span between the markers is dev-suite's, so only that span is hashed.
 *  - **Ratification.** "Who wrote this?" is not answerable from the filesystem.
 *    "Has a human adopted this content?" is: a `promote` decision records the
 *    current hash as `acknowledgedHash`, and anything matching it is settled.
 *
 * Deliberately dependency-free so the frontend and backend copies stay
 * byte-identical.
 */

/** File classes recorded in the manifest (mirrors `TrackedFile['type']`). */
export type DriftFileType = 'agent' | 'skill' | 'mcp-server' | 'config' | 'generated';

/**
 * What part of the file is compared against the manifest baseline.
 *
 * - `file`: the whole file is dev-suite's output.
 * - `managed-section`: only the span between the dev-suite markers is.
 * - `merged`: dev-suite owns some *keys* of a file the user also owns — every
 *   assistant's MCP config, `.claude/settings.json`, `.codex/config.toml`. There
 *   is no span and no whole-file baseline that means anything: adding your own
 *   MCP server changes the file legitimately, and the writers are built to
 *   preserve exactly that. Comparing these by hash reported drift on clean
 *   projects, and offering to restore their pre-run bytes would have reverted
 *   the merge the same run had just produced.
 */
export type DriftScope = 'file' | 'managed-section' | 'merged';

/**
 * Outcome of comparing one tracked file against its manifest baseline.
 *
 * - `unmodified`: managed content is byte-identical to what dev-suite wrote.
 * - `drift-in-section`: the dev-suite-owned content changed. For a
 *   `managed-section` file this means *inside* the markers, which is by
 *   definition not an intentional user edit. This is the only actionable state.
 * - `drift-outside-section`: only the user's prose outside the markers changed.
 *   Expected and ignored.
 * - `acknowledged`: content differs from the baseline but matches a hash a human
 *   ratified via `promote`. Reported for visibility, never actionable.
 * - `deleted`: tracked but no longer on disk.
 * - `unknown-baseline`: no comparable baseline in the manifest (an entry written
 *   before `sectionHash` existed, or a directory entry with no hash). Reported
 *   as informational and never raised as drift — a manifest predating this
 *   feature must not produce a wall of false alarms on first run.
 */
export type DriftStatus =
  | 'unmodified'
  | 'drift-in-section'
  | 'drift-outside-section'
  | 'acknowledged'
  | 'deleted'
  | 'unknown-baseline';

/** One tracked file's drift verdict. */
export interface DriftEntry {
  /** Relative POSIX path from the project root. */
  path: string;
  /** Tracked file type from the manifest. */
  type: DriftFileType;
  /** Assistant the file belongs to (`claude-code` when the manifest predates targets). */
  target?: string;
  /** Verdict. */
  status: DriftStatus;
  /** Which span of the file the verdict is about. */
  scope: DriftScope;
  /** Baseline hash from the manifest (`sectionHash` for a `managed-section` file). */
  baselineHash: string;
  /** Current hash of the same span, or `(deleted)` when the file is gone. */
  currentHash: string;
  /** True when the current content matches a hash a human ratified. */
  acknowledged: boolean;
  /** When the current content was ratified, if it was. */
  acknowledgedAt?: string;
  /** Source path in the dev-suite catalog, when the file was copied from one. */
  source?: string;
}

/** Counts summarising a scan, for badges and CI output. */
export interface DriftCounts {
  scanned: number;
  drifted: number;
  driftedOutsideSection: number;
  acknowledged: number;
  deleted: number;
  unknownBaseline: number;
  unmodified: number;
}

/** Result of a full project scan. */
export interface DriftReport {
  /** Absolute project root that was scanned. */
  projectPath: string;
  /** ISO timestamp of the scan. */
  scannedAt: string;
  /** False when the project has no readable manifest — nothing can be judged. */
  hasManifest: boolean;
  /** Every tracked file with a verdict (excludes directory entries). */
  files: DriftEntry[];
  /** Entries with `status === 'drift-in-section'` — the ones needing a decision. */
  drifted: DriftEntry[];
  /** Entries whose current content a human already ratified. */
  acknowledged: DriftEntry[];
  /** Tracked files missing from disk. */
  deleted: DriftEntry[];
  /** True when at least one entry is `drift-in-section`. */
  hasActionableDrift: boolean;
  counts: DriftCounts;
}

/**
 * Read-only comparison between a drifted file and the version dev-suite would
 * write. The canonical side is regenerated from `TrackedFile.source`; the
 * manifest never stores file content.
 */
export interface DriftDiff {
  path: string;
  /** Current on-disk content, or null when the file was deleted. */
  current: string | null;
  /** Catalog source content, or null when the file has no regenerable source. */
  canonical: string | null;
  /** Catalog path the canonical side came from. */
  canonicalSource?: string;
  /** Why the canonical side is unavailable, when it is. */
  canonicalUnavailableReason?: string;
  /** The verdict for this file at the time of the diff. */
  entry?: DriftEntry;
}
