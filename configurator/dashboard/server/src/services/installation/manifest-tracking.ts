// SPDX-License-Identifier: MIT
/**
 * Manifest file tracking.
 *
 * Extracted from InstallationService so target adapters can record the files
 * they write without depending on the service that drives them.
 */

import * as path from 'path';
import type { ExtendedManifest, TrackedFile } from '../../types/index.js';
import { DEFAULT_TARGET, type TargetId } from '../targets/target-layout.js';
import { calculateFileHashFromPath } from './file-operations.js';

/**
 * Record a written file, with its hash, in the extended manifest.
 *
 * `target` records which assistant the file belongs to so erase and reinstall
 * stay scoped when several assistants share one project.
 *
 * Files that cannot be hashed (directories, or paths that no longer exist) are
 * silently skipped — this mirrors the pre-existing behaviour that skill
 * directories are not individually tracked.
 */
export function trackManifestFile(
  extendedManifest: ExtendedManifest,
  projectPath: string,
  relativePath: string,
  type: TrackedFile['type'],
  source?: string,
  target: TargetId = DEFAULT_TARGET
): void {
  const fullPath = path.join(projectPath, relativePath);
  const hash = calculateFileHashFromPath(fullPath);

  if (hash) {
    extendedManifest.files.push({
      path: relativePath,
      hash,
      type,
      source,
      target,
    });
  }
}
