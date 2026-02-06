// SPDX-License-Identifier: MIT
/**
 * Feature Applier Service
 *
 * Applies features to projects (hook merges, agent replacements).
 */

import * as fs from 'fs';
import * as path from 'path';
import { getLogger } from '../../utils/logger.js';
import { readJsonSync } from '../../utils/fs-utils.js';
import { getDevSuiteDir, calculateFileHashFromPath } from './upgrade-utils.js';
import { detectConflicts } from './conflict-detector.service.js';
import { HooksService } from '../hooks.service.js';
import type {
  Feature,
  FeatureRegistry,
  ExtendedManifest,
  FeatureUpgradeResult,
  ConflictResolutions,
  HookMergeConfig,
  AgentReplaceConfig,
} from '../../types/index.js';

const logger = getLogger('FeatureApplier');

/**
 * Apply a hook-merge feature
 */
export function applyHookMerge(
  projectPath: string,
  feature: Feature,
  manifest: ExtendedManifest,
  registry: FeatureRegistry,
  hooksService: HooksService
): FeatureUpgradeResult {
  const config = feature.apply as HookMergeConfig;

  try {
    // For integration-validator, use the HooksService
    if (feature.id === 'integration-validator-hook' && manifest.detectedStack) {
      const result = hooksService.configureIntegrationValidatorHook(
        projectPath,
        {
          frontend: manifest.detectedStack.frontend ? {
            framework: manifest.detectedStack.frontend.framework,
            metaFramework: manifest.detectedStack.frontend.meta_framework,
          } : undefined,
          backend: manifest.detectedStack.backend ? {
            framework: manifest.detectedStack.backend.framework,
            runtime: manifest.detectedStack.backend.runtime,
          } : undefined,
        }
      );

      if (!result.success) {
        return {
          featureId: feature.id,
          success: false,
          error: result.error,
        };
      }

      if (!result.configured) {
        return {
          featureId: feature.id,
          success: true,
          error: result.error, // Contains reason why not configured
        };
      }

      // Update file tracking
      const settingsPath = config.target;
      const fullPath = path.join(projectPath, settingsPath);
      const hash = calculateFileHashFromPath(fullPath);

      if (hash) {
        const existingIdx = manifest.files.findIndex(f => f.path === settingsPath);
        if (existingIdx >= 0) {
          const existingFile = manifest.files[existingIdx];
          if (existingFile) {
            manifest.files[existingIdx] = {
              path: existingFile.path,
              type: existingFile.type,
              source: existingFile.source,
              hash,
            };
          }
        } else {
          manifest.files.push({
            path: settingsPath,
            hash,
            type: 'config',
          });
        }
      }

      return {
        featureId: feature.id,
        success: true,
      };
    }

    // Generic hook merge for other features
    const settingsPath = path.join(projectPath, config.target);
    const settings = readJsonSync<{ hooks?: Record<string, unknown[]> }>(settingsPath) || {};

    if (!settings.hooks) {
      settings.hooks = {};
    }

    if (!settings.hooks[config.event]) {
      settings.hooks[config.event] = [];
    }

    // Build the hook entry
    const hookEntry: Record<string, unknown> = {};

    if (config.config.matcher) {
      hookEntry.matcher = config.config.matcher;
    }

    if (config.config.hooks) {
      hookEntry.hooks = config.config.hooks;
    } else if (config.config.promptTemplate && registry.promptTemplates) {
      hookEntry.hooks = [{
        type: 'prompt',
        prompt: registry.promptTemplates[config.config.promptTemplate] || config.config.promptTemplate,
        timeout: config.config.timeout || 30,
      }];
    }

    const eventHooks = settings.hooks[config.event];
    if (eventHooks) {
      eventHooks.push(hookEntry);
    }

    // Write settings
    const claudeDir = path.dirname(settingsPath);
    if (!fs.existsSync(claudeDir)) {
      fs.mkdirSync(claudeDir, { recursive: true });
    }
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    // Update file tracking
    const hash = calculateFileHashFromPath(settingsPath);
    if (hash) {
      const existingIdx = manifest.files.findIndex(f => f.path === config.target);
      if (existingIdx >= 0) {
        const existingFile = manifest.files[existingIdx];
        if (existingFile) {
          manifest.files[existingIdx] = {
            path: existingFile.path,
            type: existingFile.type,
            source: existingFile.source,
            hash,
          };
        }
      } else {
        manifest.files.push({
          path: config.target,
          hash,
          type: 'config',
        });
      }
    }

    return {
      featureId: feature.id,
      success: true,
    };
  } catch (error) {
    logger.error('Failed to apply hook merge', { error, context: { featureId: feature.id } });
    return {
      featureId: feature.id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Apply an agent-replace feature
 */
export function applyAgentReplace(
  projectPath: string,
  feature: Feature,
  manifest: ExtendedManifest
): FeatureUpgradeResult {
  const config = feature.apply as AgentReplaceConfig;
  const devSuiteDir = getDevSuiteDir();

  try {
    const sourcePath = path.join(devSuiteDir, config.source);
    const targetPath = path.join(projectPath, config.target);

    if (!fs.existsSync(sourcePath)) {
      return {
        featureId: feature.id,
        success: false,
        error: `Source file not found: ${config.source}`,
      };
    }

    // Create target directory if needed
    const targetDir = path.dirname(targetPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // Copy file
    fs.copyFileSync(sourcePath, targetPath);

    // Update file tracking
    const hash = calculateFileHashFromPath(targetPath);
    if (hash) {
      const existingIdx = manifest.files.findIndex(f => f.path === config.target);
      if (existingIdx >= 0) {
        manifest.files[existingIdx] = {
          path: config.target,
          hash,
          type: 'agent',
          source: config.source,
        };
      } else {
        manifest.files.push({
          path: config.target,
          hash,
          type: 'agent',
          source: config.source,
        });
      }
    }

    return {
      featureId: feature.id,
      success: true,
    };
  } catch (error) {
    logger.error('Failed to apply agent replace', { error, context: { featureId: feature.id } });
    return {
      featureId: feature.id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Apply a single feature
 */
export function applyFeature(
  projectPath: string,
  feature: Feature,
  manifest: ExtendedManifest,
  registry: FeatureRegistry,
  hooksService: HooksService,
  resolutions?: ConflictResolutions
): FeatureUpgradeResult {
  const featureResolutions = resolutions?.[feature.id];

  // Check for conflicts that need resolution
  const conflicts = detectConflicts(projectPath, feature, manifest);
  const blockingConflicts = conflicts.filter(c => {
    if (c.suggestedResolution === 'skip') return true;
    if (c.suggestedResolution === 'prompt-user' && !featureResolutions?.[c.target]) return true;
    return false;
  });

  if (blockingConflicts.length > 0 && !featureResolutions) {
    return {
      featureId: feature.id,
      success: false,
      error: 'Unresolved conflicts',
      conflicts: blockingConflicts,
      conflictsResolved: false,
    };
  }

  // Apply based on type
  let result: FeatureUpgradeResult;

  switch (feature.apply.type) {
    case 'hook-merge':
      result = applyHookMerge(projectPath, feature, manifest, registry, hooksService);
      break;
    case 'agent-replace':
      result = applyAgentReplace(projectPath, feature, manifest);
      break;
    default:
      result = {
        featureId: feature.id,
        success: false,
        error: `Unsupported apply type: ${(feature.apply as { type: string }).type}`,
      };
  }

  // Update manifest if successful
  if (result.success) {
    manifest.features[feature.id] = {
      version: feature.version,
      appliedAt: new Date().toISOString(),
    };
  }

  return result;
}
