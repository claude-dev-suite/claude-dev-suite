// SPDX-License-Identifier: MIT
/**
 * Upgrade Utilities
 *
 * Common utility functions for the upgrade system.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { readJsonSync } from '../../utils/fs-utils.js';
import { resolveProjectPath, PathValidationError } from '../../utils/utilities.js';
import { getLogger } from '../../utils/logger.js';
import type { FeatureRegistry, ExtendedManifest, TrackedFile } from '../../types/index.js';
import { DEFAULT_TARGET } from '../targets/target-layout.js';

// Import and re-export canonical getDevSuiteDir so that:
// 1. It is available locally in this module.
// 2. Existing callers that import { getDevSuiteDir } from upgrade-utils keep working.
import { getDevSuiteDir as _getDevSuiteDir } from '../../utils/dev-suite-dir.js';
export { getDevSuiteDir } from '../../utils/dev-suite-dir.js';
const getDevSuiteDir = _getDevSuiteDir;

const logger = getLogger('UpgradeUtils');

// Constants
export const DEV_SUITE_VERSION = '1.0.0';
export const MANIFEST_FILENAME = '.dev-suite-manifest.json';
export const FEATURES_REGISTRY_PATH = 'registry/features.json';
export const BACKUP_DIR_PREFIX = '.dev-suite-backup-';

/**
 * Calculate SHA256 hash of file content
 */
export function calculateFileHash(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Calculate hash from file path
 */
export function calculateFileHashFromPath(filePath: string): string | null {
  if (filePath.includes('..')) throw new PathValidationError('Path traversal not allowed');
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return calculateFileHash(content);
    }
  } catch (err) {
    logger.warn('calculateFileHashFromPath: failed to read file', { context: { filePath }, error: err instanceof Error ? err.message : String(err) });
  }
  return null;
}

/**
 * Load project manifest
 */
export function loadManifest(projectPath: string): ExtendedManifest | null {
  if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
  projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
  const manifestPath = path.join(projectPath, MANIFEST_FILENAME);
  const manifest = readJsonSync<ExtendedManifest>(manifestPath);
  return manifest ? migrateManifestTargets(manifest) : manifest;
}

/**
 * Bring a manifest written before multi-assistant support up to date, in memory.
 *
 * Everything installed by an older dev-suite targeted Claude Code, so untagged
 * files and manifests are attributed to it. Applied on read so existing projects
 * keep working without an explicit migration step; the tags are persisted the
 * next time the manifest is written.
 */
export function migrateManifestTargets(manifest: ExtendedManifest): ExtendedManifest {
  if (!manifest.targets || manifest.targets.length === 0) {
    manifest.targets = [DEFAULT_TARGET];
  }
  for (const file of manifest.files ?? []) {
    file.target ??= DEFAULT_TARGET;
  }
  return manifest;
}

/**
 * Save project manifest
 */
export function saveManifest(projectPath: string, manifest: ExtendedManifest): boolean {
  if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
  projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
  const manifestPath = path.join(projectPath, MANIFEST_FILENAME);
  try {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    return true;
  } catch (err) {
    logger.warn('saveManifest: failed to write manifest', { context: { manifestPath }, error: err instanceof Error ? err.message : String(err) });
    throw new Error(`Failed to save manifest at ${manifestPath}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Check if a file has been modified by the user
 */
export function isFileModified(projectPath: string, trackedFile: TrackedFile): boolean {
  if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
  projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
  const filePath = path.join(projectPath, trackedFile.path);
  const currentHash = calculateFileHashFromPath(filePath);

  if (!currentHash) {
    // File was deleted
    return true;
  }

  return currentHash !== trackedFile.hash;
}

/**
 * Create backup of files
 */
export function createBackup(projectPath: string, files: string[]): string | null {
  if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
  projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
  if (files.length === 0) return null;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(projectPath, `${BACKUP_DIR_PREFIX}${timestamp}`);

  try {
    fs.mkdirSync(backupDir, { recursive: true });

    for (const file of files) {
      const sourcePath = path.join(projectPath, file);
      if (fs.existsSync(sourcePath)) {
        const destPath = path.join(backupDir, file);
        const destDir = path.dirname(destPath);
        fs.mkdirSync(destDir, { recursive: true });
        fs.copyFileSync(sourcePath, destPath);
      }
    }

    return backupDir;
  } catch {
    return null;
  }
}

/**
 * Create tracked file entry with hash
 */
export function createTrackedFile(
  projectPath: string,
  relativePath: string,
  type: TrackedFile['type'],
  source?: string
): TrackedFile | null {
  if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
  projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
  const fullPath = path.join(projectPath, relativePath);
  const hash = calculateFileHashFromPath(fullPath);

  if (!hash) {
    return null;
  }

  return {
    path: relativePath,
    hash,
    type,
    source,
  };
}

/**
 * Initialize or migrate manifest to extended format
 */
export function initializeExtendedManifest(
  projectPath: string,
  agents: string[],
  mcpServers: string[],
  detectedStack?: ExtendedManifest['detectedStack'],
  existingFiles?: Array<{ path: string; type: TrackedFile['type']; source?: string }>
): ExtendedManifest {
  if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
  projectPath = resolveProjectPath(projectPath);
    if (!path.isAbsolute(projectPath)) throw new PathValidationError('Path must be rooted');
  const trackedFiles: TrackedFile[] = [];

  // Track provided files
  if (existingFiles) {
    for (const file of existingFiles) {
      const tracked = createTrackedFile(
        projectPath,
        file.path,
        file.type,
        file.source
      );
      if (tracked) {
        trackedFiles.push(tracked);
      }
    }
  }

  return {
    version: DEV_SUITE_VERSION,
    installedAt: new Date().toISOString(),
    projectPath,
    detectedStack,
    agents,
    mcpServers,
    features: {},
    files: trackedFiles,
    upgradeHistory: [],
  };
}

/**
 * Feature registry cache
 */
let featuresCache: FeatureRegistry | null = null;
let featuresCacheTime = 0;
const CACHE_TTL = 60000; // 1 minute

/**
 * Load feature registry from disk (with caching)
 */
export function loadFeatureRegistry(): FeatureRegistry | null {
  const now = Date.now();
  if (featuresCache && now - featuresCacheTime < CACHE_TTL) {
    return featuresCache;
  }

  const devSuiteDir = getDevSuiteDir();
  const registryPath = path.join(devSuiteDir, FEATURES_REGISTRY_PATH);

  const registry = readJsonSync<FeatureRegistry>(registryPath);
  if (registry) {
    featuresCache = registry;
    featuresCacheTime = now;
  }

  return registry;
}
