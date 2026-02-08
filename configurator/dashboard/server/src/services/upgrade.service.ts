// SPDX-License-Identifier: MIT
/**
 * Upgrade Service
 *
 * Handles feature upgrades for existing dev-suite installations.
 * Propagates new features without overwriting user customizations.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getLogger } from '../utils/logger.js';
import { resolveProjectPath } from '../utils/utilities.js';
import { HooksService } from './hooks.service.js';
import {
  PackageInstallerService,
  DEV_SUITE_VERSION,
  loadManifest,
  saveManifest,
  createBackup,
  createTrackedFile,
  initializeExtendedManifest,
  loadFeatureRegistry,
} from './upgrade/index.js';
import { checkStackCompatibility } from './upgrade/stack-compatibility.service.js';
import { detectConflicts } from './upgrade/conflict-detector.service.js';
import { applyFeature } from './upgrade/feature-applier.service.js';
import type {
  UpgradeHistoryEntry,
  AvailableUpgrade,
  UpgradeCheckResult,
  UpgradePreviewResult,
  UpgradeExecuteRequest,
  UpgradeExecuteResult,
  ConflictInfo,
  HookMergeConfig,
  AgentReplaceConfig,
} from '../types/index.js';

const logger = getLogger('UpgradeService');

export class UpgradeService {
  private hooksService = new HooksService();
  private packageInstaller = new PackageInstallerService();

  /**
   * Check for available upgrades
   */
  async checkUpgrades(projectPath: string): Promise<UpgradeCheckResult> {
    if (projectPath.includes('..')) throw new Error('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    const registry = loadFeatureRegistry();
    const manifest = loadManifest(projectPath);

    if (!registry) {
      logger.warn('Feature registry not found');
      return {
        hasValidManifest: !!manifest,
        manifest: manifest ?? undefined,
        currentDevSuiteVersion: DEV_SUITE_VERSION,
        installedVersion: manifest?.version,
        availableUpgrades: [],
        upgradeCount: 0,
      };
    }

    if (!manifest) {
      return {
        hasValidManifest: false,
        currentDevSuiteVersion: DEV_SUITE_VERSION,
        availableUpgrades: [],
        upgradeCount: 0,
      };
    }

    const availableUpgrades: AvailableUpgrade[] = [];
    const stack = manifest.detectedStack;

    // Ensure manifest fields exist (for older manifests)
    const manifestFeatures = manifest.features ?? {};
    const manifestAgents = manifest.agents ?? [];
    const manifestUpgradeHistory = manifest.upgradeHistory ?? [];

    for (const feature of registry.features) {
      const appliedFeature = manifestFeatures[feature.id];
      const isApplied = !!appliedFeature;
      const hasUpdate = isApplied && appliedFeature.version !== feature.version;

      // Check stack compatibility (pass installed agents for inference when stack is missing)
      const compatibility = checkStackCompatibility(stack, feature.stackRequirements, projectPath, manifestAgents);

      // Check for missing dependencies (agents and packages)
      const missingDeps: string[] = [];

      // Add missing agents
      if (feature.dependencies?.agents) {
        for (const agentId of feature.dependencies.agents) {
          if (!manifestAgents.includes(agentId)) {
            missingDeps.push(agentId);
          }
        }
      }

      // Add missing packages (from stack compatibility check)
      if (compatibility.missingPackages) {
        missingDeps.push(...compatibility.missingPackages);
      }

      // Detect conflicts
      const conflicts = isApplied && !hasUpdate
        ? []
        : detectConflicts(projectPath, feature, manifest);

      availableUpgrades.push({
        feature,
        isCompatible: compatibility.compatible,
        incompatibilityReason: compatibility.reason,
        isApplied,
        appliedVersion: appliedFeature?.version,
        hasUpdate,
        missingDependencies: missingDeps,
        conflicts,
      });
    }

    // Count applicable upgrades (compatible, not applied or has update)
    const upgradeCount = availableUpgrades.filter(
      u => u.isCompatible && (!u.isApplied || u.hasUpdate) && u.missingDependencies.length === 0
    ).length;

    const lastUpgrade = manifestUpgradeHistory.length > 0
      ? manifestUpgradeHistory[manifestUpgradeHistory.length - 1]?.timestamp
      : undefined;

    return {
      hasValidManifest: true,
      manifest,
      currentDevSuiteVersion: DEV_SUITE_VERSION,
      installedVersion: manifest.version,
      availableUpgrades,
      upgradeCount,
      lastUpgrade,
    };
  }

  /**
   * Preview an upgrade (dry run)
   */
  async previewUpgrade(projectPath: string, featureIds?: string[]): Promise<UpgradePreviewResult> {
    if (projectPath.includes('..')) throw new Error('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    const checkResult = await this.checkUpgrades(projectPath);

    if (!checkResult.hasValidManifest) {
      return {
        wouldApply: [],
        wouldSkip: [],
        conflicts: [],
        filesToModify: [],
        filesToCreate: [],
        filesToBackup: [],
        requiresIntervention: false,
      };
    }

    const targetUpgrades = featureIds
      ? checkResult.availableUpgrades.filter(u => featureIds.includes(u.feature.id))
      : checkResult.availableUpgrades;

    const wouldApply: string[] = [];
    const wouldSkip: string[] = [];
    const allConflicts: { featureId: string; conflicts: ConflictInfo[] }[] = [];
    const filesToModify = new Set<string>();
    const filesToCreate = new Set<string>();
    const filesToBackup = new Set<string>();

    for (const upgrade of targetUpgrades) {
      const { feature, isCompatible, isApplied, hasUpdate, missingDependencies, conflicts } = upgrade;

      // Skip if not compatible or missing dependencies
      if (!isCompatible || missingDependencies.length > 0) {
        wouldSkip.push(feature.id);
        continue;
      }

      // Skip if already applied and no update
      if (isApplied && !hasUpdate) {
        wouldSkip.push(feature.id);
        continue;
      }

      // Track conflicts
      if (conflicts.length > 0) {
        allConflicts.push({ featureId: feature.id, conflicts });

        // Files with conflicts need backup
        for (const conflict of conflicts) {
          if (conflict.type === 'file-modified') {
            filesToBackup.add(conflict.target);
          }
        }
      }

      // Track files that would be affected
      if (feature.apply.type === 'hook-merge') {
        const config = feature.apply as HookMergeConfig;
        if (fs.existsSync(path.join(projectPath, config.target))) {
          filesToModify.add(config.target);
        } else {
          filesToCreate.add(config.target);
        }
      } else if (feature.apply.type === 'agent-replace') {
        const config = feature.apply as AgentReplaceConfig;
        if (fs.existsSync(path.join(projectPath, config.target))) {
          filesToModify.add(config.target);
        } else {
          filesToCreate.add(config.target);
        }
      }

      wouldApply.push(feature.id);
    }

    return {
      wouldApply,
      wouldSkip,
      conflicts: allConflicts,
      filesToModify: [...filesToModify],
      filesToCreate: [...filesToCreate],
      filesToBackup: [...filesToBackup],
      requiresIntervention: allConflicts.some(c =>
        c.conflicts.some(conf => conf.suggestedResolution === 'prompt-user')
      ),
    };
  }

  /**
   * Execute upgrade for selected features
   */
  async executeUpgrade(request: UpgradeExecuteRequest): Promise<UpgradeExecuteResult> {
    const { projectPath, featureIds, resolutions, createBackup: shouldBackup = true } = request;

    const registry = loadFeatureRegistry();
    if (!registry) {
      return {
        success: false,
        error: 'Feature registry not found',
        results: [],
        upgraded: [],
        skipped: [],
        failed: [],
      };
    }

    const manifest = loadManifest(projectPath);
    if (!manifest) {
      return {
        success: false,
        error: 'Project manifest not found. Is dev-suite installed?',
        results: [],
        upgraded: [],
        skipped: [],
        failed: [],
      };
    }

    // Ensure manifest has required fields
    if (!manifest.features) {
      manifest.features = {};
    }
    if (!manifest.files) {
      manifest.files = [];
    }
    if (!manifest.upgradeHistory) {
      manifest.upgradeHistory = [];
    }

    // Get features to apply
    const featuresToApply = registry.features.filter(f => featureIds.includes(f.id));
    if (featuresToApply.length === 0) {
      return {
        success: false,
        error: 'No valid features to apply',
        results: [],
        upgraded: [],
        skipped: [],
        failed: [],
      };
    }

    // Create backup if requested
    let backupDir: string | undefined;
    if (shouldBackup) {
      const preview = await this.previewUpgrade(projectPath, featureIds);
      const filesToBackup = [...preview.filesToModify, ...preview.filesToBackup];
      if (filesToBackup.length > 0) {
        const backup = createBackup(projectPath, filesToBackup);
        if (backup) {
          backupDir = backup;
        }
      }
    }

    // Apply each feature
    const results: UpgradeExecuteResult['results'] = [];
    const upgraded: string[] = [];
    const skipped: string[] = [];
    const failed: string[] = [];

    for (const feature of featuresToApply) {
      // Check compatibility
      const compatibility = checkStackCompatibility(
        manifest.detectedStack,
        feature.stackRequirements,
        projectPath,
        manifest.agents ?? []
      );

      if (!compatibility.compatible) {
        skipped.push(feature.id);
        results.push({
          featureId: feature.id,
          success: false,
          error: compatibility.reason,
        });
        continue;
      }

      // Check if already applied with same version
      const appliedFeature = manifest.features[feature.id];
      if (appliedFeature && appliedFeature.version === feature.version) {
        skipped.push(feature.id);
        results.push({
          featureId: feature.id,
          success: true,
          error: 'Already applied with same version',
        });
        continue;
      }

      // Apply the feature
      const result = applyFeature(projectPath, feature, manifest, registry, this.hooksService, resolutions);
      results.push(result);

      if (result.success) {
        upgraded.push(feature.id);
      } else if (result.conflicts && result.conflicts.length > 0) {
        skipped.push(feature.id);
      } else {
        failed.push(feature.id);
      }
    }

    // Record upgrade history
    if (upgraded.length > 0) {
      const historyEntry: UpgradeHistoryEntry = {
        timestamp: new Date().toISOString(),
        fromVersion: manifest.version,
        toVersion: DEV_SUITE_VERSION,
        featuresApplied: upgraded,
        featuresSkipped: skipped,
        backupDir,
      };
      manifest.upgradeHistory.push(historyEntry);
      manifest.version = DEV_SUITE_VERSION;
    }

    // Save manifest
    const saved = saveManifest(projectPath, manifest);
    if (!saved) {
      logger.error('Failed to save manifest after upgrade');
    }

    return {
      success: failed.length === 0,
      results,
      upgraded,
      skipped,
      failed,
      backupDir,
      newManifest: manifest,
    };
  }

  /**
   * Get upgrade history for a project
   */
  async getUpgradeHistory(projectPath: string): Promise<UpgradeHistoryEntry[]> {
    if (projectPath.includes('..')) throw new Error('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    const manifest = loadManifest(projectPath);
    return manifest?.upgradeHistory || [];
  }

  // ============================================
  // STATIC UTILITIES (delegated to upgrade-utils)
  // ============================================

  /**
   * Create tracked file entry with hash
   */
  static createTrackedFile = createTrackedFile;

  /**
   * Initialize or migrate manifest to extended format
   */
  static initializeExtendedManifest = initializeExtendedManifest;

  // ============================================
  // PREREQUISITE INSTALLATION (delegated)
  // ============================================

  /**
   * Install npm packages as prerequisites
   */
  async installPackages(
    projectPath: string,
    packages: string[],
    dev: boolean = true
  ): Promise<{ success: boolean; installed: string[]; error?: string }> {
    if (projectPath.includes('..')) throw new Error('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    return this.packageInstaller.installPackages(projectPath, packages, dev);
  }

  /**
   * Install a missing agent
   */
  async installAgent(
    projectPath: string,
    agentId: string
  ): Promise<{ success: boolean; agentPath?: string; error?: string }> {
    if (projectPath.includes('..')) throw new Error('Path traversal not allowed');
    projectPath = resolveProjectPath(projectPath);
    return this.packageInstaller.installAgent(
      projectPath,
      agentId,
      (p) => loadManifest(p),
      (p, m) => saveManifest(p, m),
      createTrackedFile
    );
  }
}
