// SPDX-License-Identifier: MIT
/**
 * Reinstall (erase-and-replace) Types
 *
 * Types for the transactional reinstall/sync system that erases dev-suite-owned
 * (managed) files and re-installs them from the current source, while preserving
 * user-owned content (custom agents, user hooks in settings.json, user CLAUDE.md
 * sections) and offering per-file opt-out for locally modified managed files.
 */

import type { ExtendedManifest, TrackedFile } from './upgrade.js';

/**
 * Per-file resolution for a locally modified managed file.
 * - `overwrite` (default): replace with the canonical source version
 * - `keep`: preserve the user's modified version (restored after replace)
 */
export type ReinstallFileResolution = 'overwrite' | 'keep';

/**
 * A managed file whose on-disk content differs from the hash recorded in the
 * manifest at install time (i.e. the user edited it). Candidate for opt-out.
 */
export interface ReinstallModifiedFile {
  /** Relative path from project root */
  path: string;
  /** Tracked file type */
  type: TrackedFile['type'];
  /** Hash recorded in the manifest at install time */
  manifestHash: string;
  /** Current on-disk hash */
  currentHash: string;
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
  /** True when there is at least one modified managed file needing a decision */
  requiresIntervention: boolean;
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
  /** Relative paths preserved per user opt-out */
  keptFiles: string[];
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
  backupDir?: string;
}
