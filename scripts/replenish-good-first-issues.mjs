#!/usr/bin/env node
// SPDX-License-Identifier: MIT
/**
 * Keep the `good first issue` queue from running dry.
 *
 * The README links a label. A contributor who follows that link to an empty
 * list does not come back, and the list empties on its own the moment the
 * project is working — every claimed issue is one fewer entry point. This opens
 * a new quick-ref issue when the count drops below a floor, choosing a skill
 * that has a SKILL.md and no quick-ref/ directory.
 *
 * Selection is from the filesystem rather than a hardcoded list (a list would
 * go stale the first time someone adds a skill), restricted to categories where
 * a newcomer is likely to know the technology, and filtered against every issue
 * ever opened so the same skill is never proposed twice.
 *
 * Usage:
 *   GITHUB_TOKEN=<token> node scripts/replenish-good-first-issues.mjs [--dry-run]
 *
 * Options:
 *   --dry-run     print what would be opened, create nothing
 *   --floor N     open issues until this many are available (default 5)
 *   --max N       never open more than this many in one run (default 2)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = process.env.GITHUB_REPOSITORY || 'claude-dev-suite/claude-dev-suite';
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : Number(process.argv[i + 1]);
};
const DRY_RUN = process.argv.includes('--dry-run');
const FLOOR = arg('floor', 5);
const MAX_PER_RUN = arg('max', 2);
const LABEL = 'good first issue';

/** Categories a contributor is likely to have first-hand experience with. */
const PREFERRED_CATEGORIES = [
  'frontend-frameworks',
  'backend-frameworks',
  'databases',
  'testing',
  'languages',
  'orm-odm',
  'state-management',
  'meta-frameworks',
  'mobile',
  'api-design',
  'infrastructure',
  'ci-cd',
  'styling',
];

const api = async (endpoint, init = {}) => {
  const url = endpoint.startsWith('https://')
    ? endpoint
    : `https://api.github.com/repos/${REPO}/${endpoint}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'dev-suite-issue-replenisher',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!res.ok) {
    throw new Error(`${init.method ?? 'GET'} ${endpoint} -> ${res.status} ${await res.text()}`);
  }
  return res.json();
};

/** Every skill directory that has a SKILL.md and no quick-ref/ beside it. */
const skillsWithoutQuickRef = () => {
  const out = [];
  const skillsRoot = path.join(ROOT, 'skills');
  for (const category of fs.readdirSync(skillsRoot)) {
    if (!PREFERRED_CATEGORIES.includes(category)) continue;
    const categoryDir = path.join(skillsRoot, category);
    if (!fs.statSync(categoryDir).isDirectory()) continue;
    for (const tech of fs.readdirSync(categoryDir)) {
      const dir = path.join(categoryDir, tech);
      if (!fs.existsSync(path.join(dir, 'SKILL.md'))) continue;
      if (fs.existsSync(path.join(dir, 'quick-ref'))) continue;
      out.push(`${category}/${tech}`);
    }
  }
  return out;
};

const issueBody = (skillPath) => `\`skills/${skillPath}/SKILL.md\` exists but has no \`quick-ref/\` directory, so an agent working on this technology gets the overview and nothing task-shaped.

**What to add** — one or more focused guides under \`skills/${skillPath}/quick-ref/\`:

- \`patterns.md\` — the handful of patterns you actually reach for, as working code
- \`testing.md\` — how to test this layer
- \`troubleshooting.md\` — the errors people hit and what they mean

**Acceptance criteria**

- [ ] At least one guide added, code-first, under ~200 lines
- [ ] Content matches the version the SKILL.md targets (say so in the PR if it doesn't)
- [ ] No marketing prose, no restating the official docs intro
- [ ] \`node scripts/validate-catalog.mjs\` passes

---

**How to validate** — these need only Node, no \`npm install\` and no build:

\`\`\`bash
node scripts/validate-frontmatter.mjs
node scripts/validate-catalog.mjs
\`\`\`

New to the repo? [CONTRIBUTING.md → Your First Contribution](https://github.com/${REPO}/blob/main/CONTRIBUTING.md#your-first-contribution) walks through this track end to end. Comment \`/claim\` to take it so two people don't write the same thing.

<sub>Opened automatically to keep the good-first-issue queue from running dry.</sub>`;

const main = async () => {
  if (!TOKEN) throw new Error('no GH_TOKEN or GITHUB_TOKEN in the environment');

  const open = await api(`issues?state=open&labels=${encodeURIComponent(LABEL)}&per_page=100`);
  const openCount = open.filter((i) => !i.pull_request).length;

  if (openCount >= FLOOR) {
    console.log(`replenish: ${openCount} open "${LABEL}" issues, floor is ${FLOOR} — nothing to do.`);
    return;
  }

  // Every issue ever opened, so a skill proposed once is never proposed again.
  const seen = new Set();
  for (let page = 1; page <= 10; page++) {
    const batch = await api(`issues?state=all&per_page=100&page=${page}`);
    for (const issue of batch) seen.add(`${issue.title}\n${issue.body ?? ''}`);
    if (batch.length < 100) break;
  }
  const alreadyProposed = (skillPath) => [...seen].some((text) => text.includes(skillPath));

  const candidates = skillsWithoutQuickRef().filter((s) => !alreadyProposed(s));
  if (candidates.length === 0) {
    console.log('replenish: every eligible skill already has an issue or a quick-ref. Nothing to open.');
    return;
  }

  const wanted = Math.min(FLOOR - openCount, MAX_PER_RUN, candidates.length);
  // Deterministic within a run, varied across runs: rotate by day of year.
  const offset = Math.floor(Date.now() / 86_400_000) % candidates.length;
  const picks = Array.from({ length: wanted }, (_, i) => candidates[(offset + i) % candidates.length]);

  for (const skillPath of picks) {
    const title = `skill: add quick-ref guides to the ${skillPath.split('/')[1]} skill`;
    if (DRY_RUN) {
      console.log(`replenish (dry run): would open "${title}"`);
      continue;
    }
    const created = await api('issues', {
      method: 'POST',
      body: JSON.stringify({
        title,
        body: issueBody(skillPath),
        labels: ['skill', LABEL, 'help wanted'],
      }),
    });
    console.log(`replenish: opened #${created.number} — ${title}`);
  }

  console.log(
    `replenish: ${openCount} open before this run, floor ${FLOOR}, ${candidates.length} candidate skill(s) remaining.`
  );
};

main().catch((error) => {
  console.error(`replenish: ${error.message}`);
  process.exit(1);
});
