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
