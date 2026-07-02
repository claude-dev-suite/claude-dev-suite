// SPDX-License-Identifier: MIT
/**
 * Upgrade System Types for Frontend
 *
 * Types for the feature upgrade UI components.
 */

import type { StackInfo } from './core';

// ============================================
// FEATURE TYPES
// ============================================

/**
 * Feature type classification
 */
export type FeatureType = 'hook' | 'agent-update' | 'skill-update' | 'config' | 'mcp-server';

/**
 * Feature definition from the registry
 */
export interface Feature {
  id: string;
  version: string;
  type: FeatureType;
  name: string;
  description: string;
  addedInVersion: string;
  stackRequirements?: {
    requiresAny?: {
      frontend?: string[];
      backend?: string[];
      database?: string[];
    };
    requiresAll?: {
      frontend?: string[];
      backend?: string[];
      database?: string[];
    };
    requiresPackage?: string[];
  };
  dependencies?: {
    agents?: string[];
    mcpServers?: string[];
    features?: string[];
  };
}

/**
 * Feature registry response
 */
export interface FeatureRegistry {
  schemaVersion: string;
  features: Feature[];
  promptTemplates?: Record<string, string>;
}

// ============================================
// CONFLICT TYPES
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
  type: ConflictType;
  target: string;
  description: string;
  suggestedResolution: 'skip' | 'backup-replace' | 'merge' | 'prompt-user';
  originalContent?: string;
  newContent?: string;
}

/**
 * Resolution choice for a conflict
 */
export type ConflictResolution = 'skip' | 'replace' | 'backup-replace' | 'merge';

// ============================================
// UPGRADE OPERATION TYPES
// ============================================

/**
 * Applied feature tracking
 */
export interface AppliedFeature {
  version: string;
  appliedAt: string;
}

/**
 * Upgrade history entry
 */
export interface UpgradeHistoryEntry {
  timestamp: string;
  fromVersion: string;
  toVersion: string;
  featuresApplied: string[];
  featuresSkipped: string[];
  backupDir?: string;
}

/**
 * A file tracked in the installation manifest.
 * Shared with the reinstall contract (reinstall.ts) — matches the server's
 * TrackedFile in server/src/types/upgrade.ts.
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
 * Extended manifest (simplified for frontend)
 */
export interface ExtendedManifest {
  version: string;
  installedAt: string;
  projectPath: string;
  detectedStack?: StackInfo;
  agents: string[];
  mcpServers: string[];
  features: Record<string, AppliedFeature>;
  upgradeHistory: UpgradeHistoryEntry[];
}

/**
 * Available upgrade info
 */
export interface AvailableUpgrade {
  feature: Feature;
  isCompatible: boolean;
  incompatibilityReason?: string;
  isApplied: boolean;
  appliedVersion?: string;
  hasUpdate: boolean;
  missingDependencies: string[];
  conflicts: ConflictInfo[];
}

/**
 * Upgrade check result from API
 */
export interface UpgradeCheckResult {
  hasValidManifest: boolean;
  manifest?: ExtendedManifest;
  currentDevSuiteVersion: string;
  installedVersion?: string;
  availableUpgrades: AvailableUpgrade[];
  upgradeCount: number;
  lastUpgrade?: string;
}

/**
 * Upgrade preview result from API
 */
export interface UpgradePreviewResult {
  wouldApply: string[];
  wouldSkip: string[];
  conflicts: {
    featureId: string;
    conflicts: ConflictInfo[];
  }[];
  filesToModify: string[];
  filesToCreate: string[];
  filesToBackup: string[];
  requiresIntervention: boolean;
}

/**
 * Single feature upgrade result
 */
export interface FeatureUpgradeResult {
  featureId: string;
  success: boolean;
  error?: string;
  backupCreated?: boolean;
  backupPath?: string;
  conflicts?: ConflictInfo[];
  conflictsResolved?: boolean;
}

/**
 * Upgrade execution result from API
 */
export interface UpgradeExecuteResult {
  success: boolean;
  error?: string;
  results: FeatureUpgradeResult[];
  upgraded: string[];
  skipped: string[];
  failed: string[];
  backupDir?: string;
  newManifest?: ExtendedManifest;
}

/**
 * Upgrade execute request
 */
export interface UpgradeExecuteRequest {
  projectPath: string;
  featureIds: string[];
  resolutions?: Record<string, Record<string, ConflictResolution>>;
  createBackup?: boolean;
  force?: boolean;
}

// ============================================
// PREREQUISITE INSTALLATION TYPES
// ============================================

/**
 * Package installation request
 */
export interface InstallPackageRequest {
  projectPath: string;
  packages: string[];
  dev?: boolean;
}

/**
 * Package installation result
 */
export interface InstallPackageResult {
  success: boolean;
  installed: string[];
  error?: string;
}

/**
 * Agent installation request
 */
export interface InstallAgentRequest {
  projectPath: string;
  agentId: string;
}

/**
 * Agent installation result
 */
export interface InstallAgentResult {
  success: boolean;
  agentPath?: string;
  error?: string;
}

// ============================================
// UI STATE TYPES
// ============================================

/**
 * Upgrade UI state
 */
export interface UpgradeState {
  /** Whether upgrade check is in progress */
  isChecking: boolean;
  /** Whether upgrade is being applied */
  isApplying: boolean;
  /** Last check result */
  checkResult: UpgradeCheckResult | null;
  /** Preview result */
  previewResult: UpgradePreviewResult | null;
  /** Selected features to upgrade */
  selectedFeatures: string[];
  /** User conflict resolutions */
  resolutions: Record<string, Record<string, ConflictResolution>>;
  /** Error message */
  error: string | null;
  /** Last check timestamp */
  lastCheckTime: number | null;
}

/**
 * Feature card display info
 */
export interface FeatureCardInfo {
  feature: Feature;
  status: 'available' | 'applied' | 'update-available' | 'incompatible';
  statusLabel: string;
  statusColor: 'green' | 'blue' | 'yellow' | 'gray';
  canApply: boolean;
  hasConflicts: boolean;
  conflictCount: number;
}

// ============================================
// TYPE GUARDS
// ============================================

export function isFeatureType(value: unknown): value is FeatureType {
  return (
    typeof value === 'string' &&
    ['hook', 'agent-update', 'skill-update', 'config', 'mcp-server'].includes(value)
  );
}

export function isConflictType(value: unknown): value is ConflictType {
  return (
    typeof value === 'string' &&
    ['file-modified', 'file-deleted', 'hook-duplicate', 'dependency-missing', 'stack-incompatible'].includes(value)
  );
}

export function isUpgradeCheckResult(value: unknown): value is UpgradeCheckResult {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.hasValidManifest === 'boolean' &&
    typeof obj.currentDevSuiteVersion === 'string' &&
    Array.isArray(obj.availableUpgrades) &&
    typeof obj.upgradeCount === 'number'
  );
}
