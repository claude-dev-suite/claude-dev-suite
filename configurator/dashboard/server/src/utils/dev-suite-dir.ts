// SPDX-License-Identifier: MIT
/**
 * Canonical getDevSuiteDir utility
 *
 * Single authoritative implementation that validates DEV_SUITE_DIR before trusting it.
 * Import this helper instead of duplicating the logic across services.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Return the dev-suite root directory.
 *
 * When DEV_SUITE_DIR is set (Electron packaged mode) the value is validated:
 *   - must resolve to an absolute path
 *   - must not contain traversal sequences after resolution
 *   - must point to an existing directory
 *
 * Falls back to navigating from the compiled output location when the env-var
 * is absent (development / test mode).
 */
export function getDevSuiteDir(): string {
  if (process.env.DEV_SUITE_DIR) {
    const raw = process.env.DEV_SUITE_DIR;

    // Reject traversal in the RAW value *before* resolving — path.resolve()
    // collapses '..' segments, so a post-resolve check is dead code. Split on
    // both separators so the check is platform-independent.
    if (raw.split(/[/\\]/).includes('..')) {
      throw new Error('DEV_SUITE_DIR must not contain path traversal sequences');
    }

    const resolved = path.resolve(raw);

    if (!path.isAbsolute(resolved)) {
      throw new Error('DEV_SUITE_DIR must be an absolute path');
    }
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      throw new Error(`DEV_SUITE_DIR does not point to an existing directory: ${resolved}`);
    }

    return resolved;
  }

  // Fallback: navigate from server/src/utils to dev-suite root (development / tests)
  return path.resolve(__dirname, '..', '..', '..', '..', '..');
}
