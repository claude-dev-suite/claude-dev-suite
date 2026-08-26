#!/usr/bin/env node
// SPDX-License-Identifier: MIT
/**
 * Fail CI when prose in README.md / CLAUDE.md contradicts a machine-readable
 * source of truth.
 *
 * Three of the worst documentation defects found in the 2026-08 coherence audit
 * were exactly this shape: the README said the wizard had 5 steps when
 * `steps.ts` listed 7, it named 3 target assistants when `IMPLEMENTED_TARGETS`
 * held 7, and the Windows MCP setup script built 4 of 11 workspaces. Each was a
 * literal in prose next to a list in code, with nothing tying them together.
 *
 * The check is deliberately narrow: it asserts a handful of specific,
 * high-traffic claims rather than trying to parse the docs in general.
 *
 * Usage: node scripts/check-docs-sync.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const err = (msg) => errors.push(msg);

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf-8');

// ---------------------------------------------------------------------------
// 1. Wizard step count
// ---------------------------------------------------------------------------

const stepsSrc = read('configurator/dashboard/src/components/wizard/steps.ts');
const stepCount = [...stepsSrc.matchAll(/\{\s*id:\s*\d+,\s*label:/g)].length;

if (stepCount === 0) {
  err('could not read the wizard step list from components/wizard/steps.ts');
} else {
  // Only the install wizard. The Code Generator has its own, unrelated 5-step
  // wizard, so a claim is checked only when its line is not about specs or
  // code generation.
  const WIZARD_CLAIM = /(\d+)[- ]step wizard/gi;
  for (const doc of ['README.md', 'CLAUDE.md']) {
    const lines = read(doc).split('\n');
    lines.forEach((text, i) => {
      if (/spec|generat|codegen/i.test(text)) return;
      for (const m of text.matchAll(WIZARD_CLAIM)) {
        if (Number(m[1]) !== stepCount) {
          err(
            `${doc}:${i + 1}: says "${m[0]}" but steps.ts defines ${stepCount} install-wizard steps`
          );
        }
      }
    });
  }
}

// ---------------------------------------------------------------------------
// 2. Implemented target assistants
// ---------------------------------------------------------------------------

const layoutSrc = read('configurator/dashboard/server/src/services/targets/target-layout.ts');
const implementedMatch = layoutSrc.match(/IMPLEMENTED_TARGETS[^=]*=\s*Object\.freeze\(\[([^\]]*)\]/);
const implemented = implementedMatch
  ? [...implementedMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
  : [];

if (implemented.length === 0) {
  err('could not read IMPLEMENTED_TARGETS from target-layout.ts');
} else {
  const registrySrc = read(
    'configurator/dashboard/server/src/services/targets/adapters/index.ts'
  );
  // Keys are quoted only when they are not valid identifiers (`'claude-code'`
  // vs bare `copilot`), so accept either form.
  for (const target of implemented) {
    const quoted = `'${target}':`;
    const bare = new RegExp(`(^|[\\s{,])${target}\\s*:`, 'm');
    if (!registrySrc.includes(quoted) && !bare.test(registrySrc)) {
      err(`adapters/index.ts has no entry for implemented target "${target}"`);
    }
  }

  // Human-readable names, in the order the docs list them.
  const NAMES = {
    'claude-code': 'Claude Code',
    copilot: 'GitHub Copilot',
    cursor: 'Cursor',
    gemini: 'Gemini CLI',
    codex: 'Codex CLI',
    cline: 'Cline',
    'kimi-code': 'Kimi Code',
  };
  const readme = read('README.md');
  for (const target of implemented) {
    const name = NAMES[target];
    if (!name) {
      err(`check-docs-sync.mjs has no display name for target "${target}" — add one`);
      continue;
    }
    if (!readme.includes(name)) {
      err(`README.md never mentions "${name}", but it is an implemented target`);
    }
  }
}

// ---------------------------------------------------------------------------
// 3. MCP workspaces vs the Windows setup script
// ---------------------------------------------------------------------------

const workspaces = JSON.parse(read('mcp-servers/package.json')).workspaces ?? [];
const setupPs1 = read('scripts/setup-mcp-servers.ps1');

if (/\$Servers\s*=\s*@\(\s*"/.test(setupPs1)) {
  err(
    'scripts/setup-mcp-servers.ps1 hardcodes its server list; derive it from the ' +
      'npm workspaces the way setup-mcp-servers.sh does'
  );
}

// Every workspace must be a real directory with a build.
for (const ws of workspaces) {
  if (!fs.existsSync(path.join(ROOT, 'mcp-servers', ws, 'package.json'))) {
    err(`mcp-servers/package.json lists workspace "${ws}" but it has no package.json`);
  }
}

// ---------------------------------------------------------------------------
// 4. Launcher entry points must reference a file the build actually produces
// ---------------------------------------------------------------------------

const serverMain = JSON.parse(read('configurator/dashboard/server/package.json')).main;
for (const launcher of ['init-project.sh', 'init-project.ps1']) {
  const src = read(launcher);
  if (src.includes('server.cjs')) {
    err(`${launcher} still launches server.cjs, which no build produces`);
  }
  const expected = path.basename(serverMain ?? 'index.js');
  if (!src.includes(expected)) {
    err(`${launcher} does not reference the server entry point (${serverMain})`);
  }
}

// ---------------------------------------------------------------------------

if (errors.length > 0) {
  for (const e of errors) console.error(`ERROR ${e}`);
  console.error(`\nDocs/code sync check failed with ${errors.length} error(s).`);
  process.exit(1);
}

console.log(
  `Docs in sync: ${stepCount} wizard steps, ${implemented.length} target assistants, ` +
    `${workspaces.length} MCP workspaces.`
);
