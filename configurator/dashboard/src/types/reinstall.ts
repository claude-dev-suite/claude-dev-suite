// SPDX-License-Identifier: MIT
// KEPT IN SYNC with configurator/dashboard/{src,server/src}/types/reinstall.ts — verified by scripts/check-type-sync.mjs
/**
 * Reinstall (erase-and-replace) Types
 *
 * Types for the transactional reinstall/sync system that erases dev-suite-owned
 * (managed) files and re-installs them from the current source, while preserving
 * user-owned content (custom agents, user hooks in settings.json, user CLAUDE.md
 * sections) and offering per-file opt-out for locally modified managed files.
 */

import type { ExtendedManifest, TrackedFile } from './upgrade';
import type { DriftReport, DriftScope } from './drift';

/**
 * Per-file resolution for a locally modified managed file.
 * - `overwrite` (default): replace with the canonical source version
 * - `keep`: preserve the user's modified version for THIS run only — it is
 *   restored after the replace, and reported as drift again next time
 * - `promote`: keep the file AND ratify its content, recording the current hash
 *   as `acknowledgedHash` so it stops being reported. This is the only way to
 *   say "the edit is intentional, adopt it" — `keep` deliberately does not,
 *   because a decision that silently sticks forever is one nobody remembers
 *   making.
 */
export type ReinstallFileResolution = 'overwrite' | 'keep' | 'promote';

/**
 * A managed file whose on-disk content differs from the baseline recorded in
 * the manifest at install time. Candidate for opt-out.
 */
export interface ReinstallModifiedFile {
  /** Relative path from project root */
  path: string;
  /** Tracked file type */
  type: TrackedFile['type'];
  /** Baseline hash recorded in the manifest at install time */
  manifestHash: string;
  /** Current on-disk hash (`(deleted)` when the file is gone) */
  currentHash: string;
  /**
   * Which span the comparison covers: the whole `file`, or only the
   * `managed-section` between the dev-suite markers. Instruction files
   * (`AGENTS.md`, `CLAUDE.md`) are compared section-only, so the user's own
   * prose around it never reads as drift.
   */
  scope: DriftScope;
  /**
   * True when a human already ratified this exact content via `promote`. Such
   * files are listed for visibility but need no decision.
   */
  acknowledged: boolean;
}

/**
 * Read-only preview of a reinstall. Safe to call repeatedly.
 */
export interface ReinstallPreviewResult {
  /** Whether a valid manifest was found (precondition for reinstall) */
  hasValidManifest: boolean;
  /** Reason when the project cannot be reinstalled */
  reason?: string;
  /** The selection that would be reinstalled (from .dev-suite.json or manifest) */
  selection: {
    agents: string[];
    mcpServers: string[];
    rules: string[];
  };
  /** Managed files modified by the user — candidates for opt-out */
  modifiedManagedFiles: ReinstallModifiedFile[];
  /** Tracked files whose component is no longer selected (will be removed) */
  orphansToRemove: string[];
  /** Managed files that will be replaced */
  filesToReplace: string[];
  /** Number of skill directories that will be rebuilt (always-replace) */
  skillDirsToRebuild: number;
  /**
   * True when at least one modified managed file still needs a decision.
   * Files already ratified via `promote` do not count.
   */
  requiresIntervention: boolean;
  /**
   * Full drift scan behind `modifiedManagedFiles` — including the entries a
   * reinstall would not act on (ratified content, edits outside the markers,
   * entries with no baseline). Absent on a project with no manifest.
   */
  drift?: DriftReport;
}

/**
 * Request to execute a reinstall.
 */
export interface ReinstallExecuteRequest {
  projectPath: string;
  /** Per-file decisions for modified managed files (relPath -> resolution). Default: overwrite */
  resolutions?: Record<string, ReinstallFileResolution>;
  /** Create a backup before erasing (default true) */
  createBackup?: boolean;
}

/**
 * Result of executing a reinstall.
 */
export interface ReinstallExecuteResult {
  success: boolean;
  error?: string;
  /** True if an error occurred and the project was restored from backup */
  rolledBack?: boolean;
  /** Backup directory created before the operation */
  backupDir?: string;
  /** Agent ids reinstalled */
  agentsReinstalled: string[];
  /** MCP server names reinstalled */
  mcpReinstalled: string[];
  /** Relative paths removed as orphans (no longer selected) */
  orphansRemoved: string[];
  /** Relative paths preserved per user opt-out (`keep` and `promote`) */
  keptFiles: string[];
  /** Relative paths whose current content was ratified (`promote`) */
  promotedFiles?: string[];
  /** Non-fatal verification warnings (e.g. agent->skill reference mismatches) */
  verifyWarnings: string[];
  /** The manifest after reinstall */
  newManifest?: ExtendedManifest;
}

/**
 * History entry recorded in the manifest after a successful reinstall.
 */
export interface ReinstallHistoryEntry {
  timestamp: string;
  devSuiteVersion: string;
  agentsReinstalled: string[];
  mcpReinstalled: string[];
  orphansRemoved: string[];
  keptFiles: string[];
  /** Relative paths ratified in this run (`promote`) */
  promotedFiles?: string[];
  backupDir?: string;
}
