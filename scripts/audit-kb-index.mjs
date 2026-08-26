#!/usr/bin/env node
// SPDX-License-Identifier: MIT
/**
 * Cross-checks `mcp-servers/documentation/src/docs-index/*` against the real
 * contents of the knowledge_base repository.
 *
 * Three ways the index and the KB can disagree, only two of which matter:
 *
 *   1. **Real mismatch** — an entry's `local` names a file that does not exist,
 *      *and* the KB has that technology's directory. Almost always the KB
 *      reorganised the content (into `deep-docs/` or `quick-ref/`) and the index
 *      was not updated. In git mode the fetch throws and the request silently
 *      degrades to live: a wasted sparse checkout and an error log on every
 *      call, and an outright failure for a KB-only topic.
 *   2. **Orphan** — a KB `.md` that no `local` points at, so `fetch_docs` can
 *      never reach it. Files under `_versions/` are excluded: the version
 *      resolver addresses those through the `version` parameter.
 *   3. **Live-only `local`** — an entry names a file in a directory the KB does
 *      not have at all. Reported for information only. These technologies are
 *      served from their upstream `url`; the `local` is aspirational.
 *
 * Also flags **ghost technologies**: listed in `SUPPORTED_TECHNOLOGIES` with no
 * index entries. Both tools gate `technology` on that enum, so a ghost is
 * advertised and then errors on every request.
 *
 * Requires network access to the KB repo. Never clones it — the tree is read
 * through the GitHub API, per the repo rule that no KB copy lives in here.
 *
 * Usage:
 *   node scripts/audit-kb-index.mjs            # report
 *   node scripts/audit-kb-index.mjs --check    # exit 1 on a real mismatch/orphan
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');
const KB_REPO = process.env.KB_REPO || 'claude-dev-suite/knowledge_base';

/**
 * The index is TypeScript; bundle it to a temp ESM file so it can be imported.
 *
 * esbuild is resolved through `mcp-servers/` (where it is installed) and driven
 * via its JS API rather than the `npx` shim — spawning a `.cmd` needs a shell on
 * Windows, and this avoids one entirely.
 */
async function loadIndex() {
  const requireFromMcp = createRequire(path.join(ROOT, 'mcp-servers', 'package.json'));
  const esbuildPath = requireFromMcp.resolve('esbuild').split(path.sep).join('/');
  const esbuild = await import(`file://${esbuildPath}`);
  const build = esbuild.build ?? esbuild.default?.build;

  const entry = path.join(ROOT, 'mcp-servers/documentation/src/docs-index.ts');
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kb-audit-')), 'index.mjs');
  await build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: out,
    logLevel: 'error',
  });
  return out;
}

/** Every `knowledge/**` blob in the KB, as paths relative to `knowledge/`. */
function loadKbFiles() {
  const json = execFileSync(
    'gh',
    ['api', `repos/${KB_REPO}/git/trees/main?recursive=1`, '--jq', '[.tree[] | select(.type=="blob") | .path]'],
    { encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024 }
  );
  return JSON.parse(json)
    .filter((p) => p.startsWith('knowledge/'))
    .map((p) => p.slice('knowledge/'.length));
}

const kbFiles = loadKbFiles();
const kb = new Set(kbFiles);
const kbDirs = new Set(kbFiles.map((f) => f.split('/')[0]));

const bundled = (await loadIndex()).split(path.sep).join('/');
const { docsIndex, SUPPORTED_TECHNOLOGIES } = await import(`file://${bundled}`);

const locals = [];
const techsWithEntries = new Set();
for (const [technology, topics] of Object.entries(docsIndex)) {
  if (Object.keys(topics ?? {}).length > 0) techsWithEntries.add(technology);
  for (const [topic, entry] of Object.entries(topics ?? {})) {
    if (entry?.local) locals.push({ technology, topic, local: entry.local, url: entry.url });
  }
}

const referenced = new Set(locals.map((l) => l.local));
const dangling = locals.filter((l) => !kb.has(l.local));
const realMismatch = dangling.filter((l) => kbDirs.has(l.local.split('/')[0]));
const liveOnly = dangling.length - realMismatch.length;
const orphans = kbFiles.filter(
  (f) => f.endsWith('.md') && !f.includes('/_versions/') && !referenced.has(f)
);
const ghosts = SUPPORTED_TECHNOLOGIES.filter((t) => !techsWithEntries.has(t));
// A dangling `local` on an entry with no `url` has nowhere to fall back to.
const unreachable = dangling.filter((l) => !l.url);

console.log(`KB files              : ${kbFiles.length}`);
console.log(`index entries w/ local: ${locals.length}`);
console.log(`supported technologies: ${SUPPORTED_TECHNOLOGIES.length}`);
console.log('');
console.log(`REAL MISMATCH         : ${realMismatch.length}`);
console.log(`ORPHANS (non-version) : ${orphans.length}`);
console.log(`GHOST TECHNOLOGIES    : ${ghosts.length}`);
console.log(`UNREACHABLE (no url)  : ${unreachable.length}`);
console.log(`live-only local (info): ${liveOnly}`);

const show = (label, items) => {
  if (!items.length) return;
  console.log(`\n--- ${label} ---`);
  for (const i of items) console.log(`  ${typeof i === 'string' ? i : `${i.technology}/${i.topic} → ${i.local}`}`);
};
show('real mismatch', realMismatch);
show('orphans', orphans);
show('ghost technologies', ghosts);
show('unreachable (dangling local, no url)', unreachable);

const failures = realMismatch.length + orphans.length + ghosts.length + unreachable.length;
if (CHECK && failures > 0) {
  console.error(`\nKB index audit failed: ${failures} problem(s).`);
  process.exit(1);
}
console.log(failures === 0 ? '\nKB index OK.' : '');
