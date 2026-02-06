// SPDX-License-Identifier: MIT
/**
 * Conflict Detector Service
 *
 * Detects conflicts when applying features to a project.
 */

import * as fs from 'fs';
import * as path from 'path';
import { readJsonSync } from '../../utils/fs-utils.js';
import { isFileModified, getDevSuiteDir } from './upgrade-utils.js';
import type {
  Feature,
  ExtendedManifest,
  ConflictInfo,
  HookMergeConfig,
  AgentReplaceConfig,
} from '../../types/index.js';

/**
 * Check for conflicts when applying a feature
 */
export function detectConflicts(
  projectPath: string,
  feature: Feature,
  manifest: ExtendedManifest
): ConflictInfo[] {
  const conflicts: ConflictInfo[] = [];

  if (feature.apply.type === 'hook-merge') {
    const config = feature.apply as HookMergeConfig;
    const settingsPath = path.join(projectPath, config.target);

    if (fs.existsSync(settingsPath)) {
      // Check if the file was modified
      const trackedFile = manifest.files.find(f => f.path === config.target);
      if (trackedFile && isFileModified(projectPath, trackedFile)) {
        const currentContent = fs.readFileSync(settingsPath, 'utf-8');
        conflicts.push({
          type: 'file-modified',
          target: config.target,
          description: 'Settings file has been modified since installation',
          suggestedResolution: 'merge',
          originalContent: currentContent,
        });
      }

      // Check for duplicate hooks
      const settings = readJsonSync<{ hooks?: Record<string, unknown[]> }>(settingsPath);
      if (settings?.hooks?.[config.event]) {
        // Check if a similar hook already exists
        const existingHooks = settings.hooks[config.event] ?? [];
        const hasSimilar = existingHooks.some((h: unknown) => {
          if (typeof h === 'object' && h !== null) {
            const hook = h as { matcher?: string };
            return hook.matcher === config.config.matcher;
          }
          return false;
        });

        if (hasSimilar) {
          conflicts.push({
            type: 'hook-duplicate',
            target: `${config.event}:${config.config.matcher || 'default'}`,
            description: `A hook with matcher "${config.config.matcher || 'default'}" already exists for event ${config.event}`,
            suggestedResolution: 'skip',
          });
        }
      }
    }
  }

  if (feature.apply.type === 'agent-replace') {
    const config = feature.apply as AgentReplaceConfig;
    const agentPath = path.join(projectPath, config.target);

    if (fs.existsSync(agentPath)) {
      const trackedFile = manifest.files.find(f => f.path === config.target);
      if (trackedFile && isFileModified(projectPath, trackedFile)) {
        const currentContent = fs.readFileSync(agentPath, 'utf-8');
        const devSuiteDir = getDevSuiteDir();
        const newContent = fs.existsSync(path.join(devSuiteDir, config.source))
          ? fs.readFileSync(path.join(devSuiteDir, config.source), 'utf-8')
          : undefined;

        conflicts.push({
          type: 'file-modified',
          target: config.target,
          description: 'Agent file has local modifications',
          suggestedResolution: 'prompt-user',
          originalContent: currentContent,
          newContent,
        });
      }
    }
  }

  // Check for missing dependencies
  if (feature.dependencies?.agents) {
    const installedAgents = manifest.agents ?? [];
    const missingAgents = feature.dependencies.agents.filter(
      agentId => !installedAgents.includes(agentId)
    );

    if (missingAgents.length > 0) {
      conflicts.push({
        type: 'dependency-missing',
        target: missingAgents.join(', '),
        description: `Missing required agent(s): ${missingAgents.join(', ')}`,
        suggestedResolution: 'skip',
      });
    }
  }

  return conflicts;
}
