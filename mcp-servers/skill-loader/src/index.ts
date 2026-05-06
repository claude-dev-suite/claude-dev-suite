// SPDX-License-Identifier: MIT
/**
 * skill-loader MCP Server
 *
 * Lazy-loads dev-suite skill bodies on demand.  Instead of copying all
 * SKILL.md files eagerly into target projects, the dashboard can write a
 * lightweight `.claude/skills/index.md` catalog and let Claude Code fetch
 * individual skill bodies through this server at runtime.
 *
 * Required environment variable: DEV_SUITE_ROOT
 *   Absolute path to the dev-suite source repository.  The server reads
 *   skills from `$DEV_SUITE_ROOT/skills/`.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const DEV_SUITE_ROOT = process.env.DEV_SUITE_ROOT;

if (!DEV_SUITE_ROOT) {
  console.error(
    "[skill-loader] Fatal: DEV_SUITE_ROOT environment variable is not set."
  );
  process.exit(1);
}

const SKILLS_DIR = path.resolve(DEV_SUITE_ROOT, "skills");

if (!fs.existsSync(SKILLS_DIR)) {
  console.error(
    `[skill-loader] Fatal: skills directory not found at ${SKILLS_DIR}`
  );
  process.exit(1);
}

console.error(`[skill-loader] Skills directory: ${SKILLS_DIR}`);

// ---------------------------------------------------------------------------
// In-memory cache with TTL
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class TtlCache<T> {
  private store = new Map<string, CacheEntry<T>>();

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: T): void {
    this.store.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  }
}

// ---------------------------------------------------------------------------
// Skill index types
// ---------------------------------------------------------------------------

interface SkillEntry {
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
// YAML frontmatter parser (minimal — no external dependency)
// ---------------------------------------------------------------------------

interface SkillFrontmatter {
  name?: string;
  description?: string;
  "disable-model-invocation"?: boolean;
  [key: string]: unknown;
}

/**
 * Extract the YAML frontmatter block from a markdown file.
 * Returns an empty object if there is no frontmatter.
 */
function parseFrontmatter(content: string): SkillFrontmatter {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  if (!match) return {};

  const yaml = match[1];
  const result: SkillFrontmatter = {};

  for (const line of yaml.split(/\r?\n/)) {
    // Handle key: value pairs (single-line values only)
    const kv = /^(\S+?):\s*(.+)$/.exec(line);
    if (kv) {
      const key = kv[1];
      const raw = kv[2].trim();

      if (raw === "true") {
        result[key] = true;
      } else if (raw === "false") {
        result[key] = false;
      } else if (raw === "|") {
        // Multi-line literal block — will be accumulated below
        result[key] = "";
      } else {
        result[key] = raw;
      }
      continue;
    }

    // Continuation lines for multi-line values (indented)
    const indent = /^  (.+)$/.exec(line);
    if (indent) {
      // Find the last key whose value is a string so we can append
      const keys = Object.keys(result);
      if (keys.length > 0) {
        const lastKey = keys[keys.length - 1];
        const current = result[lastKey];
        if (typeof current === "string") {
          result[lastKey] = current
            ? current + "\n" + indent[1]
            : indent[1];
        }
      }
    }
  }

  return result;
}

/**
 * Return the first non-empty sentence (up to first newline) from a multi-line
 * description string so the index stays compact.
 */
function firstSentence(text: string): string {
  return text.split(/\n/)[0].trim();
}

// ---------------------------------------------------------------------------
// Index builder
// ---------------------------------------------------------------------------

const indexCache = new TtlCache<SkillEntry[]>();
const INDEX_CACHE_KEY = "__index__";

function buildIndex(): SkillEntry[] {
  const cached = indexCache.get(INDEX_CACHE_KEY);
  if (cached) return cached;

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

          // Relative path under SKILLS_DIR (normalised, forward slashes)
          const relPath = path
            .relative(SKILLS_DIR, path.dirname(fullPath))
            .replace(/\\/g, "/");

          // Category is the first path segment
          const category = relPath.split("/")[0] ?? "misc";

          const disableModelInvocation =
            fm["disable-model-invocation"] === true;

          entries.push({
            path: relPath,
            name: typeof fm.name === "string" ? fm.name : path.basename(path.dirname(fullPath)),
            description: typeof fm.description === "string"
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

  walk(SKILLS_DIR);
  entries.sort((a, b) => a.path.localeCompare(b.path));
  indexCache.set(INDEX_CACHE_KEY, entries);
  return entries;
}

// ---------------------------------------------------------------------------
// Path safety
// ---------------------------------------------------------------------------

/**
 * Resolve a caller-supplied skill path to an absolute filesystem path and
 * validate it stays within SKILLS_DIR.  Throws if the path escapes.
 */
function resolveSkillPath(skillPath: string): string {
  // Reject obvious traversal attempts before path.resolve normalises them
  if (skillPath.includes("..")) {
    throw new Error("Invalid skill path: path traversal not allowed");
  }

  // Normalise and check containment
  const resolved = path.resolve(SKILLS_DIR, skillPath);
  if (!resolved.startsWith(SKILLS_DIR + path.sep) && resolved !== SKILLS_DIR) {
    throw new Error(
      `Invalid skill path: resolved path escapes skills directory`
    );
  }

  return resolved;
}

// ---------------------------------------------------------------------------
// File read with cache
// ---------------------------------------------------------------------------

const fileCache = new TtlCache<string>();

function readCached(filePath: string): string {
  const cached = fileCache.get(filePath);
  if (cached !== undefined) return cached;

  const content = fs.readFileSync(filePath, "utf-8");
  fileCache.set(filePath, content);
  return content;
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

const server = new Server(
  {
    name: "skill-loader",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_skills",
        // audit-justification: must convey the ~700-skill scale, the filter strategy, and the pagination contract so the model uses it correctly
        description:
          "List dev-suite skills (~700 total). Returns paginated results with TRUNCATED descriptions by default to fit Claude Code's context. " +
          "ALWAYS pass `category` or `search` to narrow down — full unfiltered listing is paginated (default 50 per page). " +
          "Use `verbose=true` for full descriptions, `limit`/`offset` for pagination, or `groupByCategory=true` to get a category summary first.",
        inputSchema: {
          type: "object",
          properties: {
            category: {
              type: "string",
              description:
                "Filter by category (top-level skills directory, e.g. 'languages', 'frontend-frameworks', 'mobile'). Strongly recommended.",
            },
            search: {
              type: "string",
              description:
                "Case-insensitive substring search across skill name, path, and description.",
            },
            verbose: {
              type: "boolean",
              description:
                "If true, returns full descriptions. Default false (descriptions truncated to 100 chars).",
            },
            limit: {
              type: "number",
              description: "Max results to return (default 50, max 200).",
            },
            offset: {
              type: "number",
              description: "Pagination offset (default 0).",
            },
            groupByCategory: {
              type: "boolean",
              description:
                "If true, returns a compact summary grouped by category {category, skillCount, samplePaths[]} instead of a flat list. Use this first to discover what's available.",
            },
          },
          additionalProperties: false,
        },
      },
      {
        name: "load_skill",
        description:
          "Load the full SKILL.md body for a specific skill by its relative path " +
          "(e.g. 'languages/kotlin' or 'frontend/react'). " +
          "Returns the complete markdown content including frontmatter.",
        inputSchema: {
          type: "object",
          properties: {
            skill_path: {
              type: "string",
              description:
                "Relative path to the skill under the skills directory, " +
                "e.g. 'languages/kotlin' or 'mobile/jetpack-compose'.",
            },
          },
          required: ["skill_path"],
          additionalProperties: false,
        },
      },
      {
        name: "load_quick_ref",
        description:
          "Load a specific quick-reference file from a skill's quick-ref/ subdirectory " +
          "(e.g. skill_path='languages/kotlin', ref='basics' loads skills/languages/kotlin/quick-ref/basics.md).",
        inputSchema: {
          type: "object",
          properties: {
            skill_path: {
              type: "string",
              description: "Relative path to the skill, e.g. 'languages/kotlin'.",
            },
            ref: {
              type: "string",
              description:
                "Name of the quick-ref file (without .md extension), e.g. 'basics', 'patterns', 'advanced'.",
            },
          },
          required: ["skill_path", "ref"],
          additionalProperties: false,
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "list_skills") {
      const category =
        typeof args?.category === "string" ? args.category : undefined;
      const search =
        typeof args?.search === "string"
          ? args.search.toLowerCase()
          : undefined;
      const verbose = args?.verbose === true;
      const groupByCategory = args?.groupByCategory === true;
      const limit = Math.min(
        typeof args?.limit === "number" && args.limit > 0 ? args.limit : 50,
        200
      );
      const offset =
        typeof args?.offset === "number" && args.offset >= 0 ? args.offset : 0;

      let entries = buildIndex().filter((e) => !e.disableModelInvocation);

      if (category) {
        entries = entries.filter((e) => e.category === category);
      }

      if (search) {
        entries = entries.filter(
          (e) =>
            e.path.toLowerCase().includes(search) ||
            e.name.toLowerCase().includes(search) ||
            e.description.toLowerCase().includes(search)
        );
      }

      const total = entries.length;

      // Mode 1 — category summary (compact overview, ~50-100 lines for the
      // whole catalog vs ~700 per-skill rows)
      if (groupByCategory) {
        const byCategory = new Map<
          string,
          { skillCount: number; samplePaths: string[] }
        >();
        for (const e of entries) {
          const c = e.category ?? "uncategorized";
          const bucket = byCategory.get(c) ?? { skillCount: 0, samplePaths: [] };
          bucket.skillCount++;
          if (bucket.samplePaths.length < 3) bucket.samplePaths.push(e.path);
          byCategory.set(c, bucket);
        }
        const summary = Array.from(byCategory.entries())
          .map(([cat, info]) => ({ category: cat, ...info }))
          .sort((a, b) => b.skillCount - a.skillCount);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  totalSkills: total,
                  categories: summary,
                  hint: "Call list_skills again with category='<name>' to see entries in a specific category.",
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // Mode 2 — paginated flat list with truncated descriptions by default
      const TRUNC = 100;
      const paged = entries.slice(offset, offset + limit);
      const items = paged.map(({ path: p, name: n, description: d, category: c }) => ({
        path: p,
        name: n,
        category: c,
        description: verbose
          ? d
          : d.length > TRUNC
            ? d.slice(0, TRUNC).trimEnd() + "…"
            : d,
      }));

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                total,
                returned: items.length,
                offset,
                limit,
                hasMore: offset + items.length < total,
                ...(total > items.length && !category && !search
                  ? {
                      hint: "Result truncated. Pass category='<name>' or search='<term>' to narrow, or call with groupByCategory=true for an overview.",
                    }
                  : {}),
                items,
              },
              null,
              2
            ),
          },
        ],
      };
    }

    if (name === "load_skill") {
      const skillPath = args?.skill_path;
      if (typeof skillPath !== "string" || skillPath.trim() === "") {
        throw new Error("skill_path is required and must be a non-empty string");
      }

      const resolvedDir = resolveSkillPath(skillPath.trim());
      const skillFile = path.join(resolvedDir, "SKILL.md");

      if (!fs.existsSync(skillFile)) {
        throw new Error(
          `Skill not found: '${skillPath}'. ` +
          `Use list_skills to discover available skill paths.`
        );
      }

      const content = readCached(skillFile);

      return {
        content: [
          {
            type: "text",
            text: content,
          },
        ],
      };
    }

    if (name === "load_quick_ref") {
      const skillPath = args?.skill_path;
      const ref = args?.ref;

      if (typeof skillPath !== "string" || skillPath.trim() === "") {
        throw new Error(
          "skill_path is required and must be a non-empty string"
        );
      }
      if (typeof ref !== "string" || ref.trim() === "") {
        throw new Error("ref is required and must be a non-empty string");
      }

      // Validate ref doesn't escape (no path separators or traversal)
      const sanitizedRef = ref.trim();
      if (
        sanitizedRef.includes("/") ||
        sanitizedRef.includes("\\") ||
        sanitizedRef.includes("..")
      ) {
        throw new Error(
          "Invalid ref: must be a simple filename without path separators"
        );
      }

      const resolvedDir = resolveSkillPath(skillPath.trim());
      const refFile = path.join(resolvedDir, "quick-ref", `${sanitizedRef}.md`);

      // Extra safety check after joining
      const quickRefDir = path.join(resolvedDir, "quick-ref");
      if (!refFile.startsWith(quickRefDir + path.sep) && refFile !== quickRefDir) {
        throw new Error("Invalid ref: path escapes quick-ref directory");
      }

      if (!fs.existsSync(refFile)) {
        throw new Error(
          `Quick-ref file not found: '${skillPath}/quick-ref/${sanitizedRef}.md'. ` +
          `Check that the file exists in the skill's quick-ref/ directory.`
        );
      }

      const content = readCached(refFile);

      return {
        content: [
          {
            type: "text",
            text: content,
          },
        ],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[skill-loader] Server started — ready for requests");
