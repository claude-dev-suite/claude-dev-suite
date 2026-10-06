// SPDX-License-Identifier: MIT
/**
 * Bundle the `dev-suite` command into one self-contained file.
 *
 * The command's code lives with the services it drives, in the dashboard
 * server (`server/src/cli/dev-suite.ts`); this package only ships it. Every
 * third-party dependency is inlined, so `npx @claude-dev-suite/cli` installs
 * nothing beyond this package — the same contract as the MCP server bundles
 * (`mcp-servers/scripts/bundle.mjs`), and the same self-containment check.
 *
 * Needs `npm ci` in configurator/dashboard/server first: esbuild resolves the
 * server's dependencies from its own node_modules.
 */

import { build } from 'esbuild';
import { readFileSync } from 'fs';
import { builtinModules } from 'module';
import * as path from 'path';
import { fileURLToPath } from 'url';

const pkgDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(pkgDir, '..');
const entry = path.join(repoRoot, 'configurator', 'dashboard', 'server', 'src', 'cli', 'dev-suite.ts');
const outfile = path.join(pkgDir, 'dist', 'cli.js');
const { version } = JSON.parse(readFileSync(path.join(pkgDir, 'package.json'), 'utf-8'));

const BUILTINS = new Set([...builtinModules, ...builtinModules.map(m => `node:${m}`)]);
const isBuiltin = spec => spec.startsWith('node:') || BUILTINS.has(spec) || BUILTINS.has(spec.split('/')[0]);
// Optional native add-ons that their libraries require inside try/catch.
const ALLOWED_OPTIONAL_NATIVE = ['bufferutil', 'utf-8-validate'];

const result = await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  banner: {
    js: [
      '#!/usr/bin/env node',
      "import { createRequire as __devSuiteCreateRequire } from 'module';",
      'const require = __devSuiteCreateRequire(import.meta.url);',
    ].join('\n'),
  },
  define: { __DEV_SUITE_CLI_VERSION__: JSON.stringify(version), __DEV_SUITE_CLI_BUNDLE__: 'true' },
  external: ALLOWED_OPTIONAL_NATIVE,
  minify: false,
  sourcemap: false,
  logLevel: 'warning',
  metafile: true,
});

const outKey = Object.keys(result.metafile.outputs).find(k => k.endsWith('cli.js'));
const leftExternal = outKey
  ? result.metafile.outputs[outKey].imports
      .filter(i => i.external && !isBuiltin(i.path) && !ALLOWED_OPTIONAL_NATIVE.includes(i.path))
      .map(i => i.path)
  : [];
if (leftExternal.length > 0) {
  console.error(`[cli] bundle is not self-contained, left external: ${[...new Set(leftExternal)].join(', ')}`);
  process.exit(1);
}

const bytes = result.metafile.outputs[outKey].bytes;
console.log(`[cli] wrote ${path.relative(pkgDir, outfile)} — ${(bytes / 1024).toFixed(0)} KB, v${version}`);
