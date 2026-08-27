#!/usr/bin/env node
// SPDX-License-Identifier: MIT
/**
 * Regenerate README.md's "Agents Reference" section from agent frontmatter.
 *
 * The hand-written tables had drifted badly: whole categories missing, agents
 * with no row, and Skills/MCP columns that contradicted the frontmatter in both
 * directions. The section is bounded by HTML comment markers and replaced
 * wholesale.
 *
 * Usage:
 *   node scripts/gen-agents-reference.mjs          # rewrite the section
 *   node scripts/gen-agents-reference.mjs --check  # CI: fail if out of date
 */

import { promises as fs } from 'fs';
import path from 'path';
import { readAgentCatalog, groupByTitle, REPO_ROOT } from './agent-catalog.mjs';

const README = path.join(REPO_ROOT, 'README.md');
const BEGIN = '<!-- BEGIN GENERATED: agents-reference -->';
const END = '<!-- END GENERATED: agents-reference -->';
const CHECK = process.argv.includes('--check');

/**
 * Caveats that belong with a category and cannot be derived from frontmatter.
 * Keyed by the display title from CATEGORY_TITLES.
 */
const CATEGORY_NOTES = {
  'Bitcoin / Lightning':
    'Bitcoin agents are domain experts: language-specific work (Rust/TS/Python/Go/JVM/.NET/C) ' +
    'routes to the matching language expert through skill detection. The `bitcoin/libraries/*` ' +
    'skills attach to that language expert when the project uses rust-bitcoin, bdk, ldk, ' +
    'bitcoinjs-lib, python-bitcoinlib, btcd, bitcoinj, NBitcoin or libwally.',
};

/** First sentence of the description, tightened for a table cell. */
function focus(description) {
  const flat = description.replace(/\s+/g, ' ').trim();
  if (!flat) return '—';
  const stop = flat.search(/\.\s|\.$/);
  let sentence = stop > 0 ? flat.slice(0, stop) : flat;
  if (sentence.length > 130) sentence = sentence.slice(0, 127).replace(/\s+\S*$/, '') + '…';
  // Backslashes first: escaping `|` with a backslash while leaving existing
  // backslashes alone turns a description's `\|` into `\\|`, which markdown
  // renders as a literal backslash followed by a column break.
  return sentence.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
}

function render(agents) {
  const groups = groupByTitle(agents);
  const out = [BEGIN, ''];
  out.push(
    `Dev-suite ships **${agents.length} agents** across **${groups.length} categories**. Claude Code routes`
  );
  out.push('to them automatically from the generated `AGENTS.md`; you can also call one by name.');
  out.push('');
  out.push(
    'Skill assignments are omitted here because most agents carry dozens — see'
  );
  out.push(
    '[docs/AGENT-CAPABILITY-MATRIX.md](docs/AGENT-CAPABILITY-MATRIX.md) for the full'
  );
  out.push('per-agent skill and MCP breakdown. Both files are generated from agent frontmatter.');
  out.push('');

  for (const [title, list] of groups) {
    out.push(`### ${title}`);
    out.push('');
    out.push('| Agent | Model | Focus | MCP servers |');
    out.push('|-------|-------|-------|-------------|');
    for (const a of list) {
      const mcp = a.mcpServers.length ? a.mcpServers.map((s) => '`' + s + '`').join(', ') : '—';
      out.push(`| **${a.id}** | ${a.model ?? 'default'} | ${focus(a.description)} | ${mcp} |`);
    }
    out.push('');
    if (CATEGORY_NOTES[title]) {
      out.push(`> ${CATEGORY_NOTES[title]}`);
      out.push('');
    }
  }

  out.push(
    '> MCP servers are never required. An agent works without them, losing only the'
  );
  out.push('> tools that server provides.');
  out.push('');
  out.push(END);
  return out.join('\n');
}

async function main() {
  const agents = await readAgentCatalog();
  const rendered = render(agents);
  const current = await fs.readFile(README, 'utf8');

  let next;
  const b = current.indexOf(BEGIN);
  const e = current.indexOf(END);

  if (b >= 0 && e > b) {
    next = current.slice(0, b) + rendered + current.slice(e + END.length);
  } else {
    // First run: replace the hand-written section, from its heading up to the
    // horizontal rule that precedes "## Commands Reference".
    const heading = current.indexOf('## Agents Reference');
    if (heading < 0) {
      console.error('README.md has no "## Agents Reference" heading to replace.');
      return 1;
    }
    const commands = current.indexOf('## Commands Reference', heading);
    if (commands < 0) {
      console.error('README.md has no "## Commands Reference" heading to stop at.');
      return 1;
    }
    const tail = current.lastIndexOf('---', commands);
    const stop = tail > heading ? tail : commands;
    next =
      current.slice(0, heading) + '## Agents Reference\n\n' + rendered + '\n\n' + current.slice(stop);
  }

  if (CHECK) {
    if (next === current) {
      console.log('README Agents Reference is up to date.');
      return 0;
    }
    console.error(
      'README Agents Reference is out of date. Run: node scripts/gen-agents-reference.mjs'
    );
    return 1;
  }

  await fs.writeFile(README, next, 'utf8');
  console.log(`Wrote README.md Agents Reference (${agents.length} agents).`);
  return 0;
}

main()
  .then((c) => process.exit(c))
  .catch((e) => {
    console.error(e);
    process.exit(2);
  });
