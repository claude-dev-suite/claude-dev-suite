#!/usr/bin/env node
// SPDX-License-Identifier: MIT
/**
 * How well does skill retrieval actually find the right skill?
 *
 * The extended tier rests on three steps, and each one can lose the answer:
 *
 *   (a) the agent decides it is missing something          — needs a model
 *   (b) it picks a query that could match                  — needs a model
 *   (c) the matcher returns the skill                      — pure code
 *
 * This measures (c), the only one that can be measured without spending a token,
 * and it measures it against the real catalog rather than a fixture. That matters
 * because the argument for leaving (c) alone — "the descriptions carry the words
 * a user would say, so a substring match is enough" — is an assumption nobody had
 * checked. If recall here is high, the remaining loss is (a) and (b) and no
 * amount of retrieval work will help. If it is low, this is the cheapest fix
 * available.
 *
 * The queries are built from each skill's own `USE WHEN:` line, which is the
 * strongest case the matcher will ever face: the exact words the author chose to
 * be found by. A recall number here is therefore an upper bound, not an average.
 * Anything it fails, a real prompt fails harder.
 *
 * Usage:
 *   node scripts/eval-skill-retrieval.mjs            # summary
 *   node scripts/eval-skill-retrieval.mjs --misses   # every skill that was missed
 *   node scripts/eval-skill-retrieval.mjs --json     # machine-readable
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILLS = path.join(ROOT, 'skills');

const args = new Set(process.argv.slice(2));
const SHOW_MISSES = args.has('--misses');
const AS_JSON = args.has('--json');

/** Same stoplist the suggestion hook uses; kept in step deliberately. */
const STOPWORDS = new Set([
  'about', 'after', 'again', 'also', 'and', 'any', 'are', 'because', 'been',
  'before', 'being', 'between', 'both', 'build', 'can', 'change', 'check',
  'code', 'create', 'current', 'does', 'each', 'file', 'files', 'first', 'fix',
  'following', 'for', 'from', 'get', 'has', 'have', 'help', 'here', 'how',
  'implement', 'into', 'like', 'make', 'more', 'most', 'need', 'new', 'not',
  'now', 'only', 'other', 'our', 'out', 'over', 'project', 'read', 'run',
  'should', 'some', 'such', 'sure', 'take', 'task', 'test', 'than', 'that',
  'the', 'their', 'them', 'then', 'there', 'these', 'they', 'this', 'those',
  'through', 'update', 'use', 'used', 'using', 'very', 'was', 'way', 'well',
  'were', 'what', 'when', 'where', 'which', 'while', 'will', 'with', 'work',
  'would', 'write', 'you', 'your', 'user', 'mentions', 'asks',
]);

function frontmatter(file) {
  let text;
  try {
    text = fs.readFileSync(file, 'utf-8');
  } catch {
    return null;
  }
  if (!text.startsWith('---')) return null;
  const end = text.indexOf('\n---', 3);
  if (end < 0) return null;
  return text.slice(3, end);
}

function describedBy(front) {
  const inline = /^description\s*:\s*(.*)$/m.exec(front);
  if (!inline) return '';
  const scalar = inline[1].trim();
  if (scalar && !['|', '>', '|-', '>-'].includes(scalar)) return scalar;
  const after = front.slice(inline.index + inline[0].length);
  const block = [];
  for (const line of after.split('\n')) {
    if (line.trim() === '') { block.push(''); continue; }
    if (!/^\s/.test(line)) break;
    block.push(line.trim());
  }
  return block.join(' ');
}

/** The catalog exactly as `list_skills` sees it. */
function loadCatalog() {
  const entries = [];
  // Walks the tree, like the server's own index: a quarter of the catalog is
  // nested deeper than `<category>/<skill>`.
  const walk = (dir, rel, depth) => {
    if (depth > 4) return;
    let children;
    try {
      children = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (children.some(c => c.isFile() && c.name === 'SKILL.md') && rel) {
      const front = frontmatter(path.join(dir, 'SKILL.md'));
      if (front !== null) {
        const description = describedBy(front);
        entries.push({
          path: rel,
          name: /^name\s*:\s*(.+)$/m.exec(front)?.[1]?.trim() ?? path.basename(dir),
          description,
          haystack: `${rel.split('/').join(' ')} ${description}`.toLowerCase(),
        });
      }
      return;
    }
    for (const child of children) {
      if (!child.isDirectory()) continue;
      walk(path.join(dir, child.name), rel ? `${rel}/${child.name}` : child.name, depth + 1);
    }
  };
  walk(SKILLS, '', 0);
  return entries;
}

/**
 * The phrase a user would type, taken from the skill's own trigger line.
 *
 * `USE WHEN: user mentions "React component", "useState", asks about "JSX"`
 * becomes `react component usestate jsx` — the quoted phrases, which is what
 * the convention exists to capture.
 */
function queryFor(entry) {
  const useWhen = /USE WHEN:\s*([\s\S]*?)(?:DO NOT USE|$)/i.exec(entry.description);
  const source = useWhen ? useWhen[1] : '';
  const quoted = [...source.matchAll(/"([^"]+)"/g)].map(m => m[1]);
  if (quoted.length > 0) return quoted.join(' ');
  return source.trim() || null;
}

function tokenize(text) {
  const seen = new Set();
  for (const raw of String(text).toLowerCase().split(/[^a-z0-9+#.-]+/)) {
    const word = raw.replace(/^[.-]+|[.-]+$/g, '');
    if (word.length < 3 || STOPWORDS.has(word)) continue;
    seen.add(word);
  }
  return [...seen];
}

/**
 * `list_skills({ search })` as it behaved BEFORE the ranked rewrite: one
 * case-insensitive substring test over the whole query. Kept so the number that
 * justified the change stays reproducible.
 */
function substringHits(catalog, query) {
  const needle = query.toLowerCase();
  return catalog.filter(e => e.haystack.includes(needle) || e.path.toLowerCase().includes(needle));
}

/** The suggestion hook's scorer: token overlap, two-token floor, top three. */
function hookHits(catalog, query, minScore = 2, limit = 3) {
  const tokens = tokenize(query);
  const scored = [];
  for (const entry of catalog) {
    let score = 0;
    for (const token of tokens) if (entry.haystack.includes(token)) score++;
    if (score >= minScore) scored.push({ entry, score });
  }
  scored.sort((a, b) => b.score - a.score || a.entry.path.localeCompare(b.entry.path));
  return scored.slice(0, limit).map(s => s.entry);
}

const catalog = loadCatalog();
const results = { total: catalog.length, evaluated: 0, noTrigger: [], search: { hit: 0, miss: [] }, hook: { hit: 0, miss: [], noise: 0 } };

for (const entry of catalog) {
  const query = queryFor(entry);
  if (!query) {
    results.noTrigger.push(entry.path);
    continue;
  }
  results.evaluated++;

  // (c1) The whole phrase as one substring — how `search` is actually called
  // when a model passes what the user said.
  const whole = substringHits(catalog, query);
  if (whole.some(e => e.path === entry.path)) results.search.hit++;
  else results.search.miss.push({ path: entry.path, query });

  // (c2) The hook's scorer, which tokenizes first.
  const ranked = hookHits(catalog, query);
  if (ranked.some(e => e.path === entry.path)) {
    results.hook.hit++;
    if (ranked[0].path !== entry.path) results.hook.noise++;
  } else {
    results.hook.miss.push({ path: entry.path, query, got: ranked.map(e => e.path) });
  }
}

const pct = (n) => `${((n / results.evaluated) * 100).toFixed(1)}%`;

if (AS_JSON) {
  console.log(JSON.stringify(results, null, 2));
  process.exit(0);
}

console.log(`\nSkill retrieval — step (c), the matcher\n`);
console.log(`  catalog                 ${results.total} skills`);
console.log(`  with a USE WHEN trigger ${results.evaluated}`);
console.log(`  without one             ${results.noTrigger.length}  (unreachable by keyword; findable only by category)`);
console.log('');
console.log(`  substring match         the old list_skills behaviour`);
console.log(`    found the skill       ${results.search.hit}/${results.evaluated}  ${pct(results.search.hit)}`);
console.log('');
console.log(`  ranked match            list_skills today, and the hook`);
console.log(`    found the skill       ${results.hook.hit}/${results.evaluated}  ${pct(results.hook.hit)}`);
console.log(`    not ranked first      ${results.hook.noise}  (found, but behind another skill)`);
console.log('');

if (SHOW_MISSES) {
  if (results.noTrigger.length) {
    console.log(`\n  No USE WHEN line (${results.noTrigger.length}):`);
    for (const p of results.noTrigger) console.log(`    ${p}`);
  }
  if (results.hook.miss.length) {
    console.log(`\n  Missed by the hook scorer (${results.hook.miss.length}):`);
    for (const m of results.hook.miss) {
      console.log(`    ${m.path}`);
      console.log(`      query: ${m.query.slice(0, 100)}`);
      console.log(`      got:   ${m.got.join(', ') || '(nothing)'}`);
    }
  }
}

console.log(
  `\n  Read this as an upper bound: the queries are the skills' own trigger words.\n` +
  `  A real prompt is further away, so (c) cannot do better than this in practice.\n`
);
