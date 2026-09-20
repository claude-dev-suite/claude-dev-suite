// SPDX-License-Identifier: MIT
/**
 * The running dev-suite version — one source of truth.
 *
 * There used to be two, and they disagreed. `release-check.service.ts` read the
 * server `package.json` (correct), while `services/upgrade/upgrade-utils.ts`
 * exported `DEV_SUITE_VERSION = '1.0.0'` as a frozen literal. The Updates panel
 * compares installed against available, and both sides came from that literal —
 * so it rendered "Installed v1.0.0 / Available v1.0.0 / Up to date" against a
 * 1.16.1 package, permanently, and could never surface an upgrade. The literal
 * was also written into every manifest as `version` and `toVersion`.
 *
 * Read once at module load: the file cannot change under a running process, and
 * the alternative is a `readFileSync` on every manifest write.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { getLogger } from './logger.js';

const logger = getLogger('DevSuiteVersion');

// `__dirname` is not defined in ESM; this package is `"type": "module"`.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Read the version from the server's own package.json.
 *
 * Both `dist/utils/…` and `src/utils/…` sit two levels below the server root,
 * so the same relative path works compiled or via tsx.
 */
function readVersion(): string {
  try {
    const pkgPath = path.resolve(__dirname, '..', '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version?: string };
    if (pkg.version) return pkg.version;
    logger.warn('Server package.json has no version field');
  } catch (error) {
    logger.warn('Could not read the server package.json version', { error });
  }
  return '0.0.0';
}

/** The running dev-suite version, e.g. `1.16.1`. */
export const DEV_SUITE_VERSION: string = readVersion();
