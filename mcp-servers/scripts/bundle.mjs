// SPDX-License-Identifier: MIT
/**
 * Shared MCP-server bundler.
 *
 * Bundles a single server's `src/index.ts` into a SELF-CONTAINED
 * `dist/index.js` with esbuild. Every third-party runtime dependency
 * (@modelcontextprotocol/sdk, zod, cheerio, pg, ws, …) is inlined into the
 * output file. Only Node.js built-ins stay external.
 *
 * Why bundle instead of `tsc`:
 *   `tsc` emits bare imports (`import ... from '@modelcontextprotocol/sdk'`)
 *   that are resolved at RUNTIME from `node_modules`. When dev-suite copies a
 *   server into a target project, `node_modules` is intentionally NOT copied
 *   (workspace-hoisted in source; skipped by copyDirSync). The old design
 *   then ran `npm install` in the target dir — a network/npm/PATH dependency
 *   that fails silently inside the packaged Electron app, leaving a server
 *   whose `.mcp.json` entry crashes with ERR_MODULE_NOT_FOUND.
 *
 *   Bundling removes that runtime dependency entirely: the copied
 *   `dist/index.js` needs nothing but Node. New/updated components that pull
 *   in new dependencies have those deps inlined at dev-suite BUILD time, so
 *   install / reinstall / upgrade on the user's machine never touch npm.
 *
 * Invoked per-workspace by each server's `build` script with the workspace
 * directory as cwd (npm runs workspace scripts in the workspace dir).
 */

import { build } from 'esbuild';
import { existsSync } from 'fs';
import { builtinModules } from 'module';
import * as path from 'path';

const cwd = process.cwd();

// A bundle is "self-contained" iff every import esbuild left external is a
// Node.js built-in. Anything else (a third-party package, a missing dep)
// would need `node_modules` at runtime — exactly the failure mode this
// bundling removes. We assert it here so a regression fails the build in CI
// instead of silently shipping a server that crashes on the user's machine.
const BUILTINS = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);
function isNodeBuiltin(spec) {
  if (spec.startsWith('node:')) return true;
  if (BUILTINS.has(spec)) return true;
  // Subpath builtins, e.g. `fs/promises`, `stream/web`.
  const head = spec.split('/')[0];
  return BUILTINS.has(head);
}

// Optional NATIVE add-ons that pure-JS libraries `require()` inside try/catch
// and gracefully fall back from when absent (ws → bufferutil/utf-8-validate
// for faster framing; pg → pg-native for the libpq client). They are `.node`
// binaries that cannot be inlined into a JS bundle, so we keep them external
// on purpose. At runtime the bundled `require()` throws MODULE_NOT_FOUND, the
// library catches it, and the JS path is used — no node_modules needed. These
// are the ONLY non-builtin externals allowed by the self-containment check.
const ALLOWED_OPTIONAL_NATIVE = ['bufferutil', 'utf-8-validate', 'pg-native'];
const ALLOWED_OPTIONAL_NATIVE_SET = new Set(ALLOWED_OPTIONAL_NATIVE);
const entry = path.join(cwd, 'src', 'index.ts');
const outfile = path.join(cwd, 'dist', 'index.js');

if (!existsSync(entry)) {
  console.error(`[bundle] no entry point at ${entry}`);
  process.exit(1);
}

// ESM output needs a `require` shim because some bundled CJS dependencies call
// `require()` for their own optional/lazy sub-modules. `import.meta.url` is
// preserved by esbuild in ESM output, so __dirname-style resolution (e.g.
// skill-loader locating its bundled `skills/` dir) keeps working.
const banner = {
  js: [
    "import { createRequire as __devSuiteCreateRequire } from 'module';",
    'const require = __devSuiteCreateRequire(import.meta.url);',
  ].join('\n'),
};

try {
  const result = await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    // Electron 40 ships Node 22; the bundled `node-<arch>` runtime and CI
    // runners are >= Node 20. Target 18 for a safe floor.
    target: 'node18',
    banner,
    // Keep output readable for debugging and to avoid minifier edge cases in
    // large transitive trees. Size is not a concern (single file per server).
    minify: false,
    sourcemap: false,
    logLevel: 'info',
    metafile: true,
    // Node built-ins stay external automatically with platform:'node'. The
    // only third-party externals we permit are the optional native add-ons
    // above — everything else is inlined, which is the point of bundling.
    external: ALLOWED_OPTIONAL_NATIVE,
  });

  // Fail-loud self-containment check: the only externals left in the output
  // must be Node built-ins. A non-builtin external means a dependency was
  // NOT inlined and the server would need node_modules at runtime.
  const outKey = Object.keys(result.metafile.outputs).find((k) => k.endsWith('index.js'));
  const externals = outKey
    ? (result.metafile.outputs[outKey].imports || [])
        .filter((imp) => imp.external)
        .map((imp) => imp.path)
        .filter((spec) => !isNodeBuiltin(spec) && !ALLOWED_OPTIONAL_NATIVE_SET.has(spec))
    : [];
  if (externals.length > 0) {
    console.error(
      `[bundle] ${path.basename(cwd)} is NOT self-contained — these deps were left external ` +
        `and would require node_modules at runtime: ${[...new Set(externals)].join(', ')}`
    );
    process.exit(1);
  }

  console.log(`[bundle] wrote ${path.relative(cwd, outfile)} (self-contained)`);
} catch (err) {
  console.error(`[bundle] failed for ${path.basename(cwd)}:`, err);
  process.exit(1);
}
