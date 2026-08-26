#!/usr/bin/env node
// SPDX-License-Identifier: MIT
/**
 * Regenerate docs/AGENT-CAPABILITY-MATRIX.md from agent frontmatter.
 *
 * The matrix used to be maintained by hand and had drifted in every column —
 * skill names that never existed, agents missing entirely, a reverse index that
 * disagreed with the forward one. It is derived output now.
 *
 * Usage:
 *   node scripts/gen-capability-matrix.mjs          # write the file
 *   node scripts/gen-capability-matrix.mjs --check  # CI: fail if out of date
 */

import { promises as fs } from 'fs';
import path from 'path';
import { readAgentCatalog, readMcpServers, groupByTitle, REPO_ROOT } from './agent-catalog.mjs';

const OUT = path.join(REPO_ROOT, 'docs/AGENT-CAPABILITY-MATRIX.md');
const CHECK = process.argv.includes('--check');

const code = (s) => '`' + s + '`';
const skillList = (skills) => (skills.length ? skills.map(code).join(', ') : '_none_');

function render(agents, mcpServers) {
  const out = [];
  out.push('# Agent Capability Matrix');
  out.push('');
  out.push('Which MCP servers and skills each agent declares.');
  out.push('');
  out.push(
    '> **Generated file — do not edit by hand.** Rendered from the `core_skills`,'
  );
  out.push(
    '> `extended_skills` and `mcp_servers` frontmatter of every `agents/**/*.md` by'
  );
  out.push('> `scripts/gen-capability-matrix.mjs`. Change an agent, then re-run it.');
  out.push('');
  out.push(
    'Skills load in two tiers: **core** skills are installed with the agent, **extended**'
  );
  out.push(
    'skills stay reachable on demand through the `skill-loader` MCP server. Every skill'
  );
  out.push('path below resolves to a real `skills/<path>/SKILL.md` — the generator fails otherwise.');
  out.push('');

  const groups = groupByTitle(agents);
  out.push(`Agents: **${agents.length}** across **${groups.length}** categories.`);
  out.push('');

  out.push('## Agents by category');
  out.push('');
  for (const [title, list] of groups) {
    out.push(`### ${title}`);
    out.push('');
    out.push('| Agent | Model | MCP servers | Core skills | Extended |');
    out.push('|-------|-------|-------------|-------------|----------|');
    for (const a of list) {
      const mcp = a.mcpServers.length ? a.mcpServers.map(code).join(', ') : '_none_';
      const core = a.coreSkills.length ? a.coreSkills : a.flatSkills;
      const extended = a.extendedSkills.length ? `${a.extendedSkills.length} on demand` : '—';
      out.push(
        `| **${a.id}** | ${a.model ?? '_default_'} | ${mcp} | ${skillList(core)} | ${extended} |`
      );
    }
    out.push('');
  }

  const withExtended = agents.filter((a) => a.extendedSkills.length > 0);
  if (withExtended.length) {
    out.push('## Extended skills per agent');
    out.push('');
    out.push('Loaded on demand, not installed with the agent.');
    out.push('');
    for (const a of withExtended) {
      out.push(`- **${a.id}** (${a.extendedSkills.length}) — ${a.extendedSkills.map(code).join(', ')}`);
    }
    out.push('');
  }

  out.push('## MCP server to agents (reverse index)');
  out.push('');
  out.push('| MCP server | Agents that declare it |');
  out.push('|------------|------------------------|');
  for (const server of mcpServers) {
    const users = agents.filter((a) => a.mcpServers.includes(server)).map((a) => a.id);
    const cell = users.length ? users.map(code).join(', ') : '_no agent declares this server_';
    out.push(`| **${server}** | ${cell} |`);
  }
  out.push('');
  out.push(
    'MCP servers are never required: an agent that declares one still works without it,'
  );
  out.push('losing only the tools that server provides.');
  out.push('');

  return out.join('\n');
}

async function main() {
  const agents = await readAgentCatalog();
  const mcpServers = await readMcpServers();

  const dangling = agents.filter((a) => a.missingSkills.length > 0);
  if (dangling.length) {
    console.error('Agents referencing skills that do not exist under skills/:');
    for (const a of dangling) console.error(`  ${a.file}: ${a.missingSkills.join(', ')}`);
    return 1;
  }
  const unknownBundles = agents.flatMap((a) => a.unknownBundles);
  if (unknownBundles.length) {
    console.error(`Unknown skill bundles referenced: ${[...new Set(unknownBundles)].join(', ')}`);
    return 1;
  }
  const realServers = new Set(mcpServers);
  const badRefs = agents.flatMap((a) =>
    a.mcpServers.filter((s) => !realServers.has(s)).map((s) => `${a.id} -> ${s}`)
  );
  if (badRefs.length) {
    console.error(`Agents referencing MCP servers that do not exist: ${badRefs.join(', ')}`);
    return 1;
  }

  const rendered = render(agents, mcpServers);
  const current = await fs.readFile(OUT, 'utf8').catch(() => null);

  if (CHECK) {
    if (current === rendered) {
      console.log('AGENT-CAPABILITY-MATRIX.md is up to date.');
      return 0;
    }
    console.error(
      'AGENT-CAPABILITY-MATRIX.md is out of date. Run: node scripts/gen-capability-matrix.mjs'
    );
    return 1;
  }

  await fs.writeFile(OUT, rendered, 'utf8');
  console.log(
    `Wrote ${path.relative(REPO_ROOT, OUT)} (${agents.length} agents, ${mcpServers.length} MCP servers).`
  );
  return 0;
}

main()
  .then((c) => process.exit(c))
  .catch((e) => {
    console.error(e);
    process.exit(2);
  });
