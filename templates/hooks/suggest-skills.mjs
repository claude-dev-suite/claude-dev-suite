#!/usr/bin/env node
// SPDX-License-Identifier: MIT
/**
 * Suggest catalog skills to a subagent, before it starts.
 *
 * In lazy skill loading only each agent's core tier is on disk; the rest of the
 * catalog is reachable through the `skill-loader` MCP server. Whether an agent
 * ever goes and gets it is a judgement the model has to make unprompted — it
 * has to notice it lacks knowledge, then invent a search term against hundreds
 * of skills. Both steps fail quietly, and a wrong answer looks exactly like a
 * right one.
 *
 * This is the one place code sees the task text before the model acts on it.
 * It runs the match itself and hands the result over, so the agent is choosing
 * whether to load a named skill rather than deciding whether to go looking.
 *
 * Contract (Claude Code `PreToolUse`, matcher `Task`):
 *   stdin  — { tool_name, tool_input, cwd }
 *   stdout — JSON only, and only ever additive:
 *              hookSpecificOutput.additionalContext — confirmed model-visible
 *              updatedInput                         — the subagent's own prompt,
 *                                                     appended to, never replaced
 *
 * `updatedInput` on the `Task` tool is UNCONFIRMED (see Part 5 of
 * docs/ASSISTANT-FORMAT-REFERENCE.md): it is documented for `PreToolUse` in
 * general, not for this tool. So it is emitted only when the input has the exact
 * shape we expect, it only ever appends, and `additionalContext` carries the
 * same information on its own. If `updatedInput` is ignored, nothing is lost.
 *
 * Fail-open, always. Any error, any surprise in the payload, and the hook prints
 * `{}` and exits 0. A hook that suggests nothing costs a delegation nothing; a
 * hook that throws costs the user their turn.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

/** Marker so a re-entrant call cannot append twice. */
const MARKER = '[dev-suite] Skills matching this task';

/** Words that match everything and therefore discriminate nothing. */
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
  'would', 'write', 'you', 'your',
]);

const MAX_SUGGESTIONS = 3;
/** One token in common is noise at this catalog size; two is a signal. */
const MIN_SCORE = 2;

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf-8');
  } catch {
    return '';
  }
}

/** Every string in the tool input, whatever shape it turns out to have. */
function collectText(value, depth = 0) {
  if (depth > 4) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(v => collectText(v, depth + 1)).join(' ');
  if (value && typeof value === 'object') {
    return Object.values(value).map(v => collectText(v, depth + 1)).join(' ');
  }
  return '';
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

/** `name` and `description` out of a SKILL.md, without a YAML parser. */
function readSkillHeader(file) {
  let head;
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const buf = Buffer.alloc(4096);
      const read = fs.readSync(fd, buf, 0, buf.length, 0);
      head = buf.toString('utf-8', 0, read);
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }

  if (!head.startsWith('---')) return null;
  const end = head.indexOf('\n---', 3);
  const front = end < 0 ? head.slice(3) : head.slice(3, end);

  const name = /^name\s*:\s*(.+)$/m.exec(front)?.[1]?.trim() ?? '';
  // `description:` is often a `|` block; take the indented lines under it.
  let description = '';
  const inline = /^description\s*:\s*(.*)$/m.exec(front);
  if (inline) {
    const scalar = inline[1].trim();
    if (scalar && scalar !== '|' && scalar !== '>' && scalar !== '|-') {
      description = scalar;
    } else {
      const after = front.slice(inline.index + inline[0].length);
      const block = [];
      for (const line of after.split('\n')) {
        if (line.trim() === '') continue;
        if (!/^\s/.test(line)) break;
        block.push(line.trim());
      }
      description = block.join(' ');
    }
  }
  return { name, description };
}

/**
 * Every skill the bundled `skill-loader` can serve.
 *
 * Read from the server's own bundled catalog inside the project, which is the
 * same set `load_skill` resolves against — so a suggestion can never name a
 * path the agent then fails to load.
 */
function loadCatalog(projectDir) {
  const root = path.join(projectDir, '.mcp-servers', 'skill-loader', 'skills');
  const entries = [];

  // Walk, do not assume two levels. A quarter of the catalog is nested deeper
  // than `<category>/<skill>` — every bitcoin skill lives under
  // `bitcoin/<area>/<skill>` — and the server's own index walks the whole tree,
  // so a two-level scan quietly suggests from 74% of what `load_skill` can
  // actually serve.
  const walk = (dir, rel, depth) => {
    if (depth > 4) return;
    let children;
    try {
      children = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    const header = children.some(c => c.isFile() && c.name === 'SKILL.md')
      ? readSkillHeader(path.join(dir, 'SKILL.md'))
      : null;

    if (header && rel) {
      entries.push({
        path: rel,
        haystack: `${rel.split('/').join(' ')} ${header.name} ${header.description}`.toLowerCase(),
      });
      // A skill directory is a leaf; anything below it is quick-ref material.
      return;
    }

    for (const child of children) {
      if (!child.isDirectory()) continue;
      walk(path.join(dir, child.name), rel ? `${rel}/${child.name}` : child.name, depth + 1);
    }
  };

  walk(root, '', 0);
  return entries;
}

/** Flattened names of the skills already on disk — suggesting those is noise. */
function preloadedFlatNames(projectDir) {
  const names = new Set();
  for (const dir of ['.claude/skills', '.agents/skills']) {
    try {
      for (const entry of fs.readdirSync(path.join(projectDir, ...dir.split('/')), { withFileTypes: true })) {
        if (entry.isDirectory()) names.add(entry.name.toLowerCase());
      }
    } catch {
      /* not installed for this target */
    }
  }
  return names;
}

function rank(catalog, tokens, preloaded) {
  const scored = [];
  for (const entry of catalog) {
    if (preloaded.has(entry.path.split('/').join('-'))) continue;
    let score = 0;
    for (const token of tokens) {
      if (entry.haystack.includes(token)) score++;
    }
    if (score >= MIN_SCORE) scored.push({ path: entry.path, score });
  }
  scored.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  return scored.slice(0, MAX_SUGGESTIONS);
}

function emit(payload) {
  process.stdout.write(JSON.stringify(payload));
  process.exit(0);
}

function main() {
  const raw = readStdin();
  if (!raw.trim()) emit({});

  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    emit({});
  }

  if (event?.tool_name !== 'Task') emit({});

  const projectDir = process.env.CLAUDE_PROJECT_DIR || event.cwd || process.cwd();
  const toolInput = event.tool_input;
  const text = collectText(toolInput);
  if (!text.trim()) emit({});
  if (text.includes(MARKER)) emit({});

  const tokens = tokenize(text);
  if (tokens.length === 0) emit({});

  const matches = rank(loadCatalog(projectDir), tokens, preloadedFlatNames(projectDir));
  if (matches.length === 0) emit({});

  const list = matches.map(m => `\`${m.path}\``).join(', ');
  const note =
    `${MARKER}, not preloaded: ${list}. ` +
    'Load one with `mcp__skill-loader__load_skill({ skill_path: "<path>" })` ' +
    'before working from general knowledge. They were matched by keyword, so ' +
    'ignore any that do not fit.';

  const output = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: note,
    },
  };

  // Append to the subagent's own prompt when the input has a prompt field to
  // append to — never replace, never invent one. If the field is absent or not
  // a string, `additionalContext` alone carries the suggestion.
  if (toolInput && typeof toolInput === 'object' && !Array.isArray(toolInput)) {
    const field = ['prompt', 'description'].find(k => typeof toolInput[k] === 'string');
    if (field) {
      output.updatedInput = { ...toolInput, [field]: `${toolInput[field]}\n\n${note}` };
    }
  }

  emit(output);
}

try {
  main();
} catch {
  // Fail open: a delegation must never fail because a suggestion could not be made.
  process.stdout.write('{}');
  process.exit(0);
}
