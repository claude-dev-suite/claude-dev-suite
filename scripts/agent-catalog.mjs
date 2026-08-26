// SPDX-License-Identifier: MIT
/**
 * Shared agent-catalog reader for the documentation generators.
 *
 * Parses every `agents/<category>/<name>.md` frontmatter into one record, with
 * `bundle:` skill references expanded against the bundle table in
 * `services/agent-bundles.ts`. Both README's Agents Reference and
 * docs/AGENT-CAPABILITY-MATRIX.md are rendered from this, so neither can drift
 * from the frontmatter again.
 *
 * Deliberately dependency-free (no gray-matter): these run in CI before any
 * workspace install.
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AGENTS_DIR = path.join(REPO_ROOT, 'agents');
const SKILLS_DIR = path.join(REPO_ROOT, 'skills');
const BUNDLES_FILE = path.join(
  REPO_ROOT,
  'configurator/dashboard/server/src/services/agent-bundles.ts'
);

/** Human-facing section titles, in the order the docs present them. */
export const CATEGORY_TITLES = {
  core: 'Core',
  frontend: 'Frontend',
  backend: 'Backend',
  database: 'Database',
  testing: 'Testing',
  devops: 'DevOps',
  cloud: 'Cloud',
  infrastructure: 'Infrastructure',
  mobile: 'Mobile',
  data: 'Data & AI',
  ai: 'Data & AI',
  security: 'Security',
  integration: 'Integration',
  quality: 'Quality',
  gamedev: 'Game Development',
  industrial: 'Industrial Automation',
  bitcoin: 'Bitcoin / Lightning',
  messaging: 'Messaging',
  business: 'Business',
};

/**
 * Extract `BUNDLES` from the TypeScript source.
 *
 * A regex rather than an import because that file is `.ts` and would need
 * compiling; the shape (`'id': [ 'skill', ... ]`) is stable and asserted by the
 * server's own tests.
 */
export async function readBundles() {
  const src = await fs.readFile(BUNDLES_FILE, 'utf8');
  const body = src.slice(src.indexOf('export const BUNDLES'));
  const bundles = {};
  const entry = /'([\w-]+\/[\w-]+)':\s*\[([^\]]*)\]/g;
  let m;
  while ((m = entry.exec(body)) !== null) {
    bundles[m[1]] = [...m[2].matchAll(/'([^']+)'/g)].map((s) => s[1]);
  }
  return bundles;
}

/** Minimal YAML frontmatter reader for the fields agents actually use. */
function parseFrontmatter(content) {
  if (!content.startsWith('---')) return null;
  const end = content.indexOf('\n---', 3);
  if (end < 0) return null;
  const lines = content.slice(4, end).split('\n');

  const out = { lists: {}, scalars: {} };
  let currentList = null;
  let blockScalarKey = null;
  const blockLines = [];

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (blockScalarKey) {
      if (/^\s+\S/.test(line) || line === '') {
        blockLines.push(line.trim());
        continue;
      }
      out.scalars[blockScalarKey] = blockLines.filter(Boolean).join(' ');
      blockScalarKey = null;
    }
    const item = line.match(/^\s*-\s+(.*)$/);
    if (item && currentList) {
      const value = item[1].replace(/\s*#.*$/, '').trim();
      if (value) out.lists[currentList].push(value);
      continue;
    }
    const kv = line.match(/^([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    const rest = kv[2];
    currentList = null;
    if (rest === '|' || rest === '>') {
      blockScalarKey = key;
      blockLines.length = 0;
    } else if (rest === '') {
      currentList = key;
      out.lists[key] = [];
    } else {
      out.scalars[key] = rest.replace(/^['"]|['"]$/g, '');
    }
  }
  if (blockScalarKey) out.scalars[blockScalarKey] = blockLines.filter(Boolean).join(' ');
  return out;
}

/** Expand `bundle:<id>` entries and dedupe, preserving declaration order. */
function expandSkills(entries, bundles, unknownBundles) {
  const out = [];
  for (const entry of entries) {
    if (entry.startsWith('bundle:')) {
      const id = entry.slice('bundle:'.length);
      const resolved = bundles[id];
      if (!resolved) {
        unknownBundles.add(id);
        continue;
      }
      out.push(...resolved);
    } else {
      out.push(entry);
    }
  }
  return [...new Set(out)];
}

/**
 * Read every agent. Each record carries the skills that exist on disk and the
 * ones that do not, so a generator renders the truth and CI can fail on a
 * dangling reference.
 */
export async function readAgentCatalog() {
  const bundles = await readBundles();
  const categories = (await fs.readdir(AGENTS_DIR, { withFileTypes: true }))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const agents = [];
  for (const category of categories) {
    const dir = path.join(AGENTS_DIR, category);
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.md')).sort();
    for (const file of files) {
      const content = await fs.readFile(path.join(dir, file), 'utf8');
      const fm = parseFrontmatter(content);
      if (!fm) continue;

      const unknownBundles = new Set();
      const core = expandSkills(fm.lists.core_skills ?? [], bundles, unknownBundles);
      const extended = expandSkills(fm.lists.extended_skills ?? [], bundles, unknownBundles);
      const flat = expandSkills(fm.lists.skills ?? [], bundles, unknownBundles);
      const allSkills = [...new Set([...core, ...extended, ...flat])];

      const missing = [];
      for (const skill of allSkills) {
        try {
          await fs.access(path.join(SKILLS_DIR, skill, 'SKILL.md'));
        } catch {
          missing.push(skill);
        }
      }

      // MCP access is declared two ways and both count: the explicit
      // `mcp_servers:` list, and `mcp__<server>__*` patterns in `allowed-tools`
      // (which is what actually gates the tools at runtime). Most agents use
      // only the second, which is why a docs table built from `mcp_servers:`
      // alone reads as "no MCP servers" for 50 of the 63 agents.
      const declared = fm.lists.mcp_servers ?? [];
      const fromTools = [
        ...new Set(
          [...(fm.scalars['allowed-tools'] ?? '').matchAll(/mcp__([a-z0-9-]+)__/g)].map((x) => x[1])
        ),
      ];
      const mcpServers = [...new Set([...declared, ...fromTools])].sort();

      agents.push({
        id: fm.scalars.name ?? path.basename(file, '.md'),
        category,
        categoryTitle: CATEGORY_TITLES[category] ?? category,
        file: path.posix.join('agents', category, file),
        description: (fm.scalars.description ?? '').trim(),
        model: fm.scalars.model ?? null,
        allowedTools: fm.scalars['allowed-tools'] ?? null,
        coreSkills: core,
        extendedSkills: extended,
        flatSkills: flat,
        allSkills,
        missingSkills: missing,
        mcpServers,
        mcpDeclared: declared,
        mcpFromTools: fromTools,
        unknownBundles: [...unknownBundles],
      });
    }
  }
  return agents;
}

/** MCP server directories that actually exist, for reverse-index validation. */
export async function readMcpServers() {
  const dir = path.join(REPO_ROOT, 'mcp-servers');
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name === 'node_modules' || e.name === 'shared' || e.name === 'scripts') continue;
    try {
      await fs.access(path.join(dir, e.name, 'package.json'));
      out.push(e.name);
    } catch {
      /* not a server package */
    }
  }
  return out.sort();
}

/** Group agents by display category, preserving CATEGORY_TITLES order. */
export function groupByTitle(agents) {
  const order = [];
  const groups = new Map();
  for (const title of Object.values(CATEGORY_TITLES)) {
    if (!groups.has(title)) {
      groups.set(title, []);
      order.push(title);
    }
  }
  for (const agent of agents) {
    if (!groups.has(agent.categoryTitle)) {
      groups.set(agent.categoryTitle, []);
      order.push(agent.categoryTitle);
    }
    groups.get(agent.categoryTitle).push(agent);
  }
  return order.filter((t) => groups.get(t).length > 0).map((t) => [t, groups.get(t)]);
}
