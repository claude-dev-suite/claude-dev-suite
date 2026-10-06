// SPDX-License-Identifier: MIT
/**
 * `dev-suite` command entry point.
 *
 * Sets the process up for headless use *before* any service module loads —
 * which is why every import below that reaches a logger is dynamic — and then
 * dispatches the subcommand.
 *
 * Two layouts are supported:
 * - the published package (`cli/` at the repo root): this file is bundled to
 *   `dist/cli.js`, the catalog is copied to `catalog/` beside `dist/`, and the
 *   bundler defines `__DEV_SUITE_CLI_VERSION__`;
 * - a source checkout: DEV_SUITE_DIR falls back to the repo root as usual.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

declare const __DEV_SUITE_CLI_VERSION__: string | undefined;
/** Defined true by cli/scripts/build.mjs: the bundle exists only to be run. */
declare const __DEV_SUITE_CLI_BUNDLE__: boolean | undefined;

const USAGE = `Usage: dev-suite <command> [options]

Commands:
  init [path]   Detect the project's stack and install the matching setup

Run 'dev-suite init --help' for the options.
`;

/** Prepare the environment the services read. Exported for tests. */
export function prepareEnvironment(entryFile: string, env: NodeJS.ProcessEnv = process.env): void {
  env.DEV_SUITE_HEADLESS ??= '1';

  // Published package: <pkg>/dist/cli.js with the catalog at <pkg>/catalog.
  if (!env.DEV_SUITE_DIR) {
    const catalog = path.resolve(path.dirname(entryFile), '..', 'catalog');
    if (fs.existsSync(path.join(catalog, 'agents'))) env.DEV_SUITE_DIR = catalog;
  }

  if (!env.DEV_SUITE_VERSION && typeof __DEV_SUITE_CLI_VERSION__ === 'string') {
    env.DEV_SUITE_VERSION = __DEV_SUITE_CLI_VERSION__;
  }
}

export async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;
  switch (command) {
    case 'init': {
      const { runInit } = await import('./init.js');
      return runInit(rest);
    }
    case '--version':
    case '-v': {
      const { DEV_SUITE_VERSION } = await import('../utils/dev-suite-version.js');
      process.stdout.write(`${DEV_SUITE_VERSION}\n`);
      return 0;
    }
    case undefined:
    case '--help':
    case '-h':
      process.stdout.write(USAGE);
      return 0;
    default:
      process.stderr.write(`Unknown command: ${command}\n\n${USAGE}`);
      return 3;
  }
}

const entryFile = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1];
// From a checkout, run only when invoked directly (tests import this module).
// The published bundle always runs: npm reaches it through a symlink or, on
// Windows, a .cmd shim, and a path comparison there proved unreliable — the
// first npx run on Windows exited 0 having done nothing.
const isMain =
  (typeof __DEV_SUITE_CLI_BUNDLE__ === 'boolean' && __DEV_SUITE_CLI_BUNDLE__) ||
  (invokedPath != null &&
  (pathToFileURL(invokedPath).href === import.meta.url ||
    (() => {
      try {
        return fs.realpathSync(invokedPath) === fs.realpathSync(entryFile);
      } catch {
        return false;
      }
    })()));

if (isMain) {
  prepareEnvironment(entryFile);
  main(process.argv.slice(2))
    .then(code => process.exit(code))
    .catch(err => {
      process.stderr.write(`${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
      process.exit(1);
    });
}
