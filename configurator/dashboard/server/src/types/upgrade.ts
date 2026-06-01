// SPDX-License-Identifier: MIT
/**
 * Upgrade System Types
 *
 * Types for the feature upgrade system that propagates new dev-suite
 * features to existing project installations.
 */

import type { StackInfo } from './core.js';
import type { ReinstallHistoryEntry } from './reinstall.js';

// ============================================
// FEATURE REGISTRY TYPES
// ============================================

/**
 * Feature type classification
 */
export type FeatureType = 'hook' | 'agent-update' | 'skill-update' | 'config' | 'mcp-server';

/**
 * Stack requirements for a feature
 */
export interface StackRequirements {
  /** Feature requires at least one of these */
  requiresAny?: {
    frontend?: string[];
    backend?: string[];
    database?: string[];
  };
  /** Feature requires all of these */
  requiresAll?: {
    frontend?: string[];
    backend?: string[];
    database?: string[];
  };
  /** Feature requires at least one of these npm packages */
  requiresPackage?: string[];
}

/**
 * Hook merge configuration for hook-type features
 */
export interface HookMergeConfig {
  type: 'hook-merge';
  target: string;
  event: string;
  config: {
    matcher?: string;
    matcherBuilder?: string;
    promptTemplate?: string;
    hooks?: string[];
    timeout?: number;
  };
}

/**
 * Agent replace configuration for agent-update features
 */
export interface AgentReplaceConfig {
  type: 'agent-replace';
  source: string;
  target: string;
}

/**
 * Skill update configuration
 */
export interface SkillUpdateConfig {
  type: 'skill-update';
  source: string;
  target: string;
}

/**
 * Config merge configuration
 */
export interface ConfigMergeConfig {
  type: 'config-merge';
  target: string;
  merge: Record<string, unknown>;
}

/**
 * Union of all apply configurations
 */
export type FeatureApplyConfig =
  | HookMergeConfig
  | AgentReplaceConfig
  | SkillUpdateConfig
  | ConfigMergeConfig;

/**
 * Feature definition from the registry
 */
export interface Feature {
  /** Unique feature identifier */
  id: string;
  /** Feature version (semver) */
  version: string;
  /** Feature type */
  type: FeatureType;
  /** Human-readable name */
  name: string;
  /** Description of what the feature does */
  description: string;
  /** Dev-suite version this feature was added in */
  addedInVersion: string;
  /** Stack requirements for this feature */
  stackRequirements?: StackRequirements;
  /** Dependencies on other features or components */
  dependencies?: {
    agents?: string[];
    mcpServers?: string[];
    features?: string[];
  };
  /** How to apply this feature */
  apply: FeatureApplyConfig;
}

/**
 * Feature registry schema
 */
export interface FeatureRegistry {
  /** Schema version */
  schemaVersion: string;
  /** List of features */
  features: Feature[];
  /** Prompt templates for hook features */
  promptTemplates?: Record<string, string>;
}

// ============================================
// MANIFEST TYPES (Extended)
// ============================================

/**
 * Applied feature tracking in manifest
 */
export interface AppliedFeature {
  /** Feature version when applied */
  version: string;
  /** Timestamp when applied */
  appliedAt: string;
}

/**
 * File tracking with hash for conflict detection
 */
export interface TrackedFile {
  /** Relative path from project root */
  path: string;
  /** SHA256 hash of file content at installation */
  hash: string;
  /** File type */
  type: 'agent' | 'skill' | 'mcp-server' | 'config' | 'generated';
  /** Source path in dev-suite (for agent/skill) */
  source?: string;
}

/**
 * Upgrade history entry
 */
export interface UpgradeHistoryEntry {
  /** Timestamp of upgrade */
  timestamp: string;
  /** Previous dev-suite version */
  fromVersion: string;
  /** New dev-suite version */
  toVersion: string;
  /** Features applied in this upgrade */
  featuresApplied: string[];
  /** Features skipped (conflicts or incompatible) */
  featuresSkipped: string[];
  /** Backup directory if any */
  backupDir?: string;
}

/**
 * Snapshot of all available components at install time (for new-component detection)
 */
export interface CatalogSnapshot {
  /** All agent IDs that existed at install time */
  agents: string[];
  /** All MCP server names that existed at install time */
  mcpServers: string[];
}

/**
 * Extended manifest with upgrade tracking
 */
export interface ExtendedManifest {
  /** Schema version */
  version: string;
  /** Installation timestamp */
  installedAt: string;
  /** Absolute project path */
  projectPath: string;
  /** Detected stack at installation time */
  detectedStack?: StackInfo;
  /** Installed agents */
  agents: string[];
  /** Installed MCP servers */
  mcpServers: string[];
  /** Applied features with versions */
  features: Record<string, AppliedFeature>;
  /** Tracked files with hashes */
  files: TrackedFile[];
  /** Upgrade history */
  upgradeHistory: UpgradeHistoryEntry[];
  /** Snapshot of all available components at install time (for new-component detection) */
  availableAtInstall?: CatalogSnapshot;
  /**
   * Relative paths of `.claude/rules/{category}.md` files written by dev-suite.
   * Used for clean uninstall. Missing field is treated as an empty array (backward compat).
   */
  installedRuleFiles?: string[];
  /**
   * History of erase-and-replace reinstalls (distinct from feature `upgradeHistory`).
   * Missing field is treated as an empty array (backward compat).
   */
  reinstallHistory?: ReinstallHistoryEntry[];
}

/**
 * New component discovered since project installation
 */
export interface NewComponent {
  id: string;
  name: string;
  description: string;
  category: string;
}

/**
 * Result of checking for new components
 */
export interface NewComponentsResult {
  newAgents: NewComponent[];
  newMcpServers: NewComponent[];
}

// ============================================
// UPGRADE OPERATION TYPES
// ============================================

/**
 * Conflict type enumeration
 */
export type ConflictType =
  | 'file-modified'
  | 'file-deleted'
  | 'hook-duplicate'
  | 'dependency-missing'
  | 'stack-incompatible';

/**
 * Conflict information
 */
export interface ConflictInfo {
  /** Type of conflict */
  type: ConflictType;
  /** Path or identifier of the conflicting item */
  target: string;
  /** Description of the conflict */
  description: string;
  /** Suggested resolution */
  suggestedResolution: 'skip' | 'backup-replace' | 'merge' | 'prompt-user';
  /** Original content (for diff display) */
  originalContent?: string;
  /** New content (for diff display) */
  newContent?: string;
}

/**
 * Feature upgrade availability check result
 */
export interface AvailableUpgrade {
  /** Feature definition */
  feature: Feature;
  /** Whether the feature is compatible with the project stack */
  isCompatible: boolean;
  /** Reason if not compatible */
  incompatibilityReason?: string;
  /** Whether the feature is already applied */
  isApplied: boolean;
  /** Current applied version (if any) */
  appliedVersion?: string;
  /** Whether an update is available (new version) */
  hasUpdate: boolean;
  /** Dependencies that are missing */
  missingDependencies: string[];
  /** Potential conflicts */
  conflicts: ConflictInfo[];
}

/**
 * Upgrade check result
 */
export interface UpgradeCheckResult {
  /** Whether the project has a valid manifest */
  hasValidManifest: boolean;
  /** Manifest if present */
  manifest?: ExtendedManifest;
  /** Current dev-suite version */
  currentDevSuiteVersion: string;
  /** Installed dev-suite version in project */
  installedVersion?: string;
  /** Available upgrades */
  availableUpgrades: AvailableUpgrade[];
  /** Total count of applicable upgrades */
  upgradeCount: number;
  /** Last upgrade timestamp */
  lastUpgrade?: string;
}

/**
 * Resolution choice for a conflict
 */
export type ConflictResolution = 'skip' | 'replace' | 'backup-replace' | 'merge';

/**
 * User's resolution choices for conflicts
 */
export interface ConflictResolutions {
  [featureId: string]: {
    [target: string]: ConflictResolution;
  };
}

/**
 * Upgrade execution request
 */
export interface UpgradeExecuteRequest {
  /** Project path */
  projectPath: string;
  /** Feature IDs to upgrade */
  featureIds: string[];
  /** Conflict resolutions */
  resolutions?: ConflictResolutions;
  /** Create backup before upgrading */
  createBackup?: boolean;
  /** Force upgrade even with conflicts (not recommended) */
  force?: boolean;
}

/**
 * Single feature upgrade result
 */
export interface FeatureUpgradeResult {
  /** Feature ID */
  featureId: string;
  /** Whether the upgrade succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Whether a backup was created */
  backupCreated?: boolean;
  /** Backup path if created */
  backupPath?: string;
  /** Conflicts encountered */
  conflicts?: ConflictInfo[];
  /** Whether conflicts were resolved */
  conflictsResolved?: boolean;
}

/**
 * Complete upgrade execution result
 */
export interface UpgradeExecuteResult {
  /** Overall success */
  success: boolean;
  /** Error message if overall failure */
  error?: string;
  /** Results per feature */
  results: FeatureUpgradeResult[];
  /** Features successfully upgraded */
  upgraded: string[];
  /** Features skipped */
  skipped: string[];
  /** Features that failed */
  failed: string[];
  /** Backup directory (if created) */
  backupDir?: string;
  /** New manifest after upgrade */
  newManifest?: ExtendedManifest;
}

/**
 * Upgrade preview (dry run) result
 */
export interface UpgradePreviewResult {
  /** Features that would be applied */
  wouldApply: string[];
  /** Features that would be skipped (incompatible, already applied) */
  wouldSkip: string[];
  /** All detected conflicts */
  conflicts: {
    featureId: string;
    conflicts: ConflictInfo[];
  }[];
  /** Files that would be modified */
  filesToModify: string[];
  /** Files that would be created */
  filesToCreate: string[];
  /** Files that would be backed up */
  filesToBackup: string[];
  /** Whether the upgrade requires user intervention (has conflicts) */
  requiresIntervention: boolean;
}

// ============================================
// TYPE GUARDS
// ============================================

/**
 * Type guard to check if a value is a valid FeatureType
 */
export function isFeatureType(value: unknown): value is FeatureType {
  return (
    typeof value === 'string' &&
    ['hook', 'agent-update', 'skill-update', 'config', 'mcp-server'].includes(value)
  );
}

/**
 * Type guard to check if a value is a valid Feature
 */
export function isFeature(value: unknown): value is Feature {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.version === 'string' &&
    isFeatureType(obj.type) &&
    typeof obj.name === 'string' &&
    typeof obj.description === 'string' &&
    typeof obj.addedInVersion === 'string' &&
    typeof obj.apply === 'object'
  );
}

/**
 * Type guard to check if a value is a valid FeatureRegistry
 */
export function isFeatureRegistry(value: unknown): value is FeatureRegistry {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.schemaVersion === 'string' &&
    Array.isArray(obj.features) &&
    obj.features.every(isFeature)
  );
}

/**
 * Type guard to check if a value is a valid ExtendedManifest
 */
export function isExtendedManifest(value: unknown): value is ExtendedManifest {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.version === 'string' &&
    typeof obj.installedAt === 'string' &&
    typeof obj.projectPath === 'string' &&
    Array.isArray(obj.agents) &&
    Array.isArray(obj.mcpServers) &&
    typeof obj.features === 'object' &&
    Array.isArray(obj.files) &&
    Array.isArray(obj.upgradeHistory)
  );
}

/**
 * Type guard to check if a value is a valid ConflictType
 */
export function isConflictType(value: unknown): value is ConflictType {
  return (
    typeof value === 'string' &&
    ['file-modified', 'file-deleted', 'hook-duplicate', 'dependency-missing', 'stack-incompatible'].includes(value)
  );
}
