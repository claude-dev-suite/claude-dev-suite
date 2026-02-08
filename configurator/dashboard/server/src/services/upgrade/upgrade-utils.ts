// SPDX-License-Identifier: MIT
/**
 * Upgrade Utilities
 *
 * Common utility functions for the upgrade system.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { fileURLToPath } from 'url';
import { readJsonSync } from '../../utils/fs-utils.js';
import { resolveProjectPath, PathValidationError } from '../../utils/utilities.js';
import type { FeatureRegistry, ExtendedManifest, TrackedFile } from '../../types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Constants
export const DEV_SUITE_VERSION = '1.0.0';
export const MANIFEST_FILENAME = '.dev-suite-manifest.json';
export const FEATURES_REGISTRY_PATH = 'registry/features.json';
export const BACKUP_DIR_PREFIX = '.dev-suite-backup-';

/**
 * Get dev-suite root directory
 */
export function getDevSuiteDir(): string {
  if (process.env.DEV_SUITE_DIR) {
    return process.env.DEV_SUITE_DIR;
  }
  // Navigate from server/src/services/upgrade to dev-suite root
  return path.resolve(__dirname, '..', '..', '..', '..', '..', '..');
}

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
  } catch {
    // Ignore errors
  }
  return null;
}

/**
 * Load project manifest
 */
export function loadManifest(projectPath: string): ExtendedManifest | null {
  if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
  projectPath = resolveProjectPath(projectPath);
  const manifestPath = path.join(projectPath, MANIFEST_FILENAME);
  return readJsonSync<ExtendedManifest>(manifestPath);
}

/**
 * Save project manifest
 */
export function saveManifest(projectPath: string, manifest: ExtendedManifest): boolean {
  if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
  projectPath = resolveProjectPath(projectPath);
  const manifestPath = path.join(projectPath, MANIFEST_FILENAME);
  try {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a file has been modified by the user
 */
export function isFileModified(projectPath: string, trackedFile: TrackedFile): boolean {
  if (projectPath.includes('..')) throw new PathValidationError('Path traversal not allowed');
  projectPath = resolveProjectPath(projectPath);
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
