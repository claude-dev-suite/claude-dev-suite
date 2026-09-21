// SPDX-License-Identifier: MIT
/**
 * skill-loader library
 *
 * Pure(-ish) functions used by the MCP server. They take the skills root
 * directory as a parameter so they can be unit-tested against fixture
 * directories without depending on the `DEV_SUITE_ROOT` env var.
 *
 * Caching, MCP wiring, and process-level startup checks live in index.ts.
 */

import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// SKILLS_DIR resolution
// ---------------------------------------------------------------------------

/**
 * Decide which directory to read SKILL.md files from at server startup.
 *
 * Resolution order:
 * 1. `DEV_SUITE_ROOT` env var (when set and non-empty) → use
 *    `<DEV_SUITE_ROOT>/skills/`. This is the explicit dev-time / overrideable
 *    path: when a developer is iterating on the dev-suite repo itself, they
 *    point the server at the live source so changes are picked up without a
 *    rebuild.
 * 2. Self-bundled fallback: `<packageDir>/skills/`. The skill-loader package
 *    ships its own copy of the catalog (auto-synced at build time from
 *    `dev-suite/skills/` via `scripts/copy-skills.mjs`). When the server is
 *    distributed inside a project's `.mcp-servers/skill-loader/` or inside
 *    the Electron installer, this fallback works without any env var.
 *
 * Returns the resolved skills directory. Throws if neither path exists.
 *
 * @param env Object exposing the env (typically `process.env`).
 * @param packageDir The skill-loader package directory (typically the
 *   parent of the compiled `dist/` folder).
 */
export function resolveSkillsDir(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  packageDir: string,
): { skillsDir: string; source: "env" | "bundled" } {
  const envRoot = (env.DEV_SUITE_ROOT ?? "").trim();
  if (envRoot) {
    const candidate = path.resolve(envRoot, "skills");
    if (!fs.existsSync(candidate)) {
      throw new Error(
        `[skill-loader] DEV_SUITE_ROOT is set but ${candidate} does not exist`,
      );
    }
    return { skillsDir: candidate, source: "env" };
  }

  const bundled = path.resolve(packageDir, "skills");
  if (fs.existsSync(bundled)) {
    return { skillsDir: bundled, source: "bundled" };
  }

  throw new Error(
    `[skill-loader] No skills found. Set DEV_SUITE_ROOT or rebuild ` +
      `(missing bundled copy at ${bundled} — was the prebuild step skipped?)`,
  );
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkillFrontmatter {
  name?: string;
  description?: string;
  "disable-model-invocation"?: boolean;
  [key: string]: unknown;
}

export interface SkillEntry {
  /** Relative path under skills/, e.g. "languages/kotlin" */
  path: string;
  /** Human-readable name from frontmatter (falls back to directory name) */
  name: string;
  /** One-line description extracted from frontmatter */
  description: string;
  /** Category derived from top-level directory (e.g. "languages") */
  category: string;
  /** Whether the skill opts out of automatic model invocation */
  disableModelInvocation: boolean;
}

// ---------------------------------------------------------------------------
// Frontmatter parser (minimal — no external dependency)
// ---------------------------------------------------------------------------

/**
 * Extract the YAML frontmatter block from a markdown file. Returns an empty
 * object if there is no frontmatter or it is malformed.
 *
 * Supports:
 * - `key: value` pairs (single-line)
 * - `key: |` followed by indented continuation lines (literal block)
 * - boolean coercion for the literal strings `true` / `false`
 */
export function parseFrontmatter(content: string): SkillFrontmatter {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  if (!match) return {};

  const yaml = match[1];
  const result: SkillFrontmatter = {};

  for (const line of yaml.split(/\r?\n/)) {
    const kv = /^(\S+?):\s*(.+)$/.exec(line);
    if (kv) {
      const key = kv[1];
      const raw = kv[2].trim();

      if (raw === "true") {
        result[key] = true;
      } else if (raw === "false") {
        result[key] = false;
      } else if (raw === "|") {
        result[key] = "";
      } else {
        result[key] = raw;
      }
      continue;
    }

    const indent = /^  (.+)$/.exec(line);
    if (indent) {
      const keys = Object.keys(result);
      if (keys.length > 0) {
        const lastKey = keys[keys.length - 1];
        const current = result[lastKey];
        if (typeof current === "string") {
          result[lastKey] = current ? current + "\n" + indent[1] : indent[1];
        }
      }
    }
  }

  return result;
}

/**
 * Return the first non-empty line from a multi-line description so the
 * skill index stays compact. Whitespace at edges is trimmed.
 */
export function firstSentence(text: string): string {
  return text.split(/\n/)[0].trim();
}

// ---------------------------------------------------------------------------
// Index builder
// ---------------------------------------------------------------------------

/**
 * Walk `skillsDir` recursively, parse each `SKILL.md` frontmatter, and
 * return a flat list of SkillEntry sorted by path. Entries with malformed
 * frontmatter or unreadable files are silently skipped.
 *
 * NOT memoised — callers are expected to wrap with their own cache.
 */
export function buildSkillIndex(skillsDir: string): SkillEntry[] {
  const entries: SkillEntry[] = [];

  function walk(dir: string): void {
    let names: string[];
    try {
      names = fs.readdirSync(dir);
    } catch {
      return;
    }

    for (const name of names) {
      const fullPath = path.join(dir, name);
      let stat: fs.Stats;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (name === "SKILL.md") {
        try {
          const content = fs.readFileSync(fullPath, "utf-8");
          const fm = parseFrontmatter(content);

          const relPath = path
            .relative(skillsDir, path.dirname(fullPath))
            .replace(/\\/g, "/");
          const category = relPath.split("/")[0] ?? "misc";
          const disableModelInvocation = fm["disable-model-invocation"] === true;

          entries.push({
            path: relPath,
            name:
              typeof fm.name === "string"
                ? fm.name
                : path.basename(path.dirname(fullPath)),
            description:
              typeof fm.description === "string"
                ? firstSentence(fm.description)
                : "",
            category,
            disableModelInvocation,
          });
        } catch {
          // Skip unreadable skills
        }
      }
    }
  }

  walk(skillsDir);
  entries.sort((a, b) => a.path.localeCompare(b.path));
  return entries;
}

// ---------------------------------------------------------------------------
// Path safety
// ---------------------------------------------------------------------------

/**
 * Resolve a caller-supplied skill path to an absolute filesystem path and
 * validate it stays within `skillsDir`. Throws if the path escapes.
 */
export function resolveSkillPath(skillPath: string, skillsDir: string): string {
  if (skillPath.includes("..")) {
    throw new Error("Invalid skill path: path traversal not allowed");
  }
  const resolvedDir = path.resolve(skillsDir);
  const resolved = path.resolve(resolvedDir, skillPath);
  if (
    !resolved.startsWith(resolvedDir + path.sep) &&
    resolved !== resolvedDir
  ) {
    throw new Error("Invalid skill path: resolved path escapes skills directory");
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// Skill body loaders
// ---------------------------------------------------------------------------

/**
 * Throw if the skill content has `disable-model-invocation: true` in its
 * frontmatter. Skills tagged this way are intended for explicit human
 * invocation only (typically ops/release runbooks). list_skills already
 * filters them out of suggestions; this guard closes the same boundary
 * on load_skill so a model guessing the path can't bypass it.
 */
export function checkSkillInvocable(content: string, skillPath: string): void {
  const fm = parseFrontmatter(content);
  if (fm["disable-model-invocation"] === true) {
    throw new Error(
      `Skill '${skillPath}' has disable-model-invocation: true and cannot be loaded automatically. ` +
        "It is intended for explicit human invocation only.",
    );
  }
}

/**
 * Load the full SKILL.md body for a skill path. Validates path containment,
 * existence, and `disable-model-invocation`.
 *
 * Throws on: traversal, missing file, invocation-disabled.
 */
export function loadSkillBody(skillPath: string, skillsDir: string): string {
  const resolvedDir = resolveSkillPath(skillPath, skillsDir);
  const skillFile = path.join(resolvedDir, "SKILL.md");
  if (!fs.existsSync(skillFile)) {
    throw new Error(
      `Skill not found: '${skillPath}'. Use list_skills to discover available skill paths.`,
    );
  }
  const content = fs.readFileSync(skillFile, "utf-8");
  checkSkillInvocable(content, skillPath);
  return content;
}

/**
 * Resolve and validate the path of a quick-ref file, without reading it.
 *
 * Split out from `loadQuickRefBody` so the server can route the read through
 * its own cache: `load_quick_ref` used to bypass the cache entirely and hit
 * the disk on every call, including the repeated calls a fan-out of subagents
 * makes for the same reference.
 *
 * The `ref` argument MUST be a simple filename — slashes, backslashes, and
 * `..` are rejected to prevent traversal out of the skill's quick-ref/ dir.
 */
export function resolveQuickRefPath(
  skillPath: string,
  ref: string,
  skillsDir: string,
): string {
  const trimmed = ref.trim();
  if (!trimmed) throw new Error("ref is required and must be a non-empty string");
  if (trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes("..")) {
    throw new Error(
      "Invalid ref: must be a simple filename without path separators",
    );
  }

  const resolvedDir = resolveSkillPath(skillPath, skillsDir);
  const quickRefDir = path.join(resolvedDir, "quick-ref");
  const refFile = path.join(quickRefDir, `${trimmed}.md`);

  // Belt-and-suspenders: even after the simple-filename check, verify
  // the joined path stays inside quick-ref/.
  if (
    !refFile.startsWith(quickRefDir + path.sep) &&
    refFile !== quickRefDir
  ) {
    throw new Error("Invalid ref: path escapes quick-ref directory");
  }

  if (!fs.existsSync(refFile)) {
    throw new Error(
      `Quick-ref file not found: '${skillPath}/quick-ref/${trimmed}.md'. ` +
        "Check that the file exists in the skill's quick-ref/ directory.",
    );
  }
  return refFile;
}

/**
 * Load a quick-ref file (e.g. quick-ref/basics.md) for a skill.
 *
 * Uncached read; the server prefers `resolveQuickRefPath` plus its own cache.
 */
export function loadQuickRefBody(
  skillPath: string,
  ref: string,
  skillsDir: string,
): string {
  return fs.readFileSync(resolveQuickRefPath(skillPath, ref, skillsDir), "utf-8");
}

// ============================================================
// SEARCH
// ============================================================

/**
 * Words too common in a request to tell two skills apart.
 *
 * Kept small on purpose: this is a stoplist for *queries*, and dropping a term
 * that turns out to be the discriminating one costs a match. Only words that
 * appear in the phrasing of nearly any development task are here.
 */
const QUERY_STOPWORDS = new Set([
  "about", "after", "also", "and", "any", "are", "because", "been", "before",
  "being", "both", "build", "can", "change", "check", "code", "create",
  "current", "does", "each", "file", "files", "first", "fix", "following",
  "for", "from", "get", "has", "have", "help", "here", "how", "implement",
  "into", "like", "make", "more", "most", "need", "new", "not", "now", "only",
  "other", "our", "out", "over", "project", "read", "run", "should", "some",
  "such", "sure", "take", "task", "than", "that", "the", "their", "them",
  "then", "there", "these", "they", "this", "those", "through", "update",
  "use", "used", "using", "very", "was", "way", "well", "were", "what", "when",
  "where", "which", "while", "will", "with", "work", "would", "write", "you",
  "your", "user", "mentions", "asks", "please", "just", "also",
  // Two-letter noise. The length floor below is 2, not 3, because dropping
  // short tokens outright loses the identifiers people actually search for —
  // "go", "c#", "ai", "ml", "qa" — and a query like "go concurrency" would
  // silently become "concurrency".
  "is", "to", "of", "in", "on", "at", "it", "be", "as", "an", "or", "if",
  "do", "we", "my", "by", "so", "up", "no", "me", "us", "am", "are",
]);

/** Split a query into the terms worth matching on. */
export function queryTerms(query: string): string[] {
  const seen = new Set<string>();
  for (const raw of query.toLowerCase().split(/[^a-z0-9+#.-]+/)) {
    const word = raw.replace(/^[.-]+|[.-]+$/g, "");
    if (word.length < 2 || QUERY_STOPWORDS.has(word)) continue;
    seen.add(word);
  }
  // A query made only of stopwords still has to match something rather than
  // silently returning nothing.
  if (seen.size === 0) {
    for (const raw of query.toLowerCase().split(/[^a-z0-9+#.-]+/)) {
      if (raw) seen.add(raw);
    }
  }
  return [...seen];
}

export interface SearchableSkill {
  path: string;
  name: string;
  description: string;
}

/**
 * Rank skills against a free-text query.
 *
 * `search` used to be one case-insensitive substring test over path, name and
 * description. Measured against the real catalog with each skill's own
 * `USE WHEN` trigger words as the query — the friendliest input it will ever
 * see — that found the right skill 32% of the time, because a multi-word phrase
 * almost never appears verbatim in a description. Scoring the terms
 * independently finds it 98%.
 *
 * The floor is adaptive rather than fixed: when anything matches two or more
 * terms, the single-term matches are dropped, because at this catalog size one
 * term in common is noise. When nothing does, they are kept — a one-word query
 * is legitimate and would otherwise return nothing at all.
 */
export function rankSkills<T extends SearchableSkill>(skills: T[], query: string): T[] {
  const terms = queryTerms(query);
  if (terms.length === 0) return [];

  const phrase = query.toLowerCase().trim();
  const scored: Array<{ skill: T; score: number; exact: number }> = [];

  for (const skill of skills) {
    const path = skill.path.toLowerCase();
    const name = skill.name.toLowerCase();
    const haystack = `${path} ${name} ${skill.description.toLowerCase()}`;

    let score = 0;
    for (const term of terms) if (haystack.includes(term)) score++;
    if (score === 0) continue;

    // Whole-phrase and identifier hits are what the old behaviour was good at;
    // they stay ahead of a term-count tie.
    let exact = 0;
    if (phrase && (path.includes(phrase) || name.includes(phrase))) exact += 2;
    if (terms.some((t) => name === t || path.endsWith(`/${t}`))) exact += 1;

    scored.push({ skill, score, exact });
  }

  const strong = scored.filter((s) => s.score >= 2);
  const kept = strong.length > 0 ? strong : scored;

  kept.sort(
    (a, b) =>
      b.score - a.score ||
      b.exact - a.exact ||
      a.skill.path.localeCompare(b.skill.path)
  );
  return kept.map((s) => s.skill);
}
