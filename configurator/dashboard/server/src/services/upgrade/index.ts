// SPDX-License-Identifier: MIT
/**
 * Upgrade Module
 *
 * Re-exports upgrade-related services and utilities.
 */

export { PackageInstallerService } from './package-installer.service.js';
export type {
  PackageManager,
  InstallPackagesResult,
  InstallAgentResult,
} from './package-installer.service.js';

export {
  DEV_SUITE_VERSION,
  MANIFEST_FILENAME,
  FEATURES_REGISTRY_PATH,
  BACKUP_DIR_PREFIX,
  getDevSuiteDir,
  calculateFileHash,
  calculateFileHashFromPath,
  loadManifest,
  saveManifest,
  isFileModified,
  createBackup,
  createTrackedFile,
  initializeExtendedManifest,
  loadFeatureRegistry,
} from './upgrade-utils.js';

export {
  checkStackCompatibility,
  type StackCompatibilityResult,
} from './stack-compatibility.service.js';

export { detectConflicts } from './conflict-detector.service.js';

export {
  applyHookMerge,
  applyAgentReplace,
  applyFeature,
} from './feature-applier.service.js';
