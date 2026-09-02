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
import { fileURLToPath } from "url";
import {
  checkSkillInvocable,
  resolveQuickRefPath,
  resolveSkillPath as resolveSkillPathLib,
  resolveSkillsDir,
} from "./lib.js";
import { SkillIndex, DEFAULT_INDEX_TTL_MS } from "./skill-index.js";
import { TtlCache } from "./ttl-cache.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// Self-resolve the skills directory. Two paths:
//   1. `DEV_SUITE_ROOT` env var (dev mode / explicit override)
//   2. Bundled fallback: <packageDir>/skills/ — populated at build time
//      by scripts/copy-skills.mjs from dev-suite/skills/. This is the
//      production path: works inside Electron resources AND inside per-
//      project .mcp-servers/skill-loader/ copies, with zero env var.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// dist/index.js → ../ = package root (where skills/ lives after prebuild)
const PACKAGE_DIR = path.resolve(__dirname, "..");

let SKILLS_DIR: string;
let SKILLS_SOURCE: "env" | "bundled";
try {
  const resolved = resolveSkillsDir(process.env, PACKAGE_DIR);
  SKILLS_DIR = resolved.skillsDir;
  SKILLS_SOURCE = resolved.source;
} catch (err) {
  console.error(`[skill-loader] Fatal: ${(err as Error).message}`);
  process.exit(1);
}

console.error(
  `[skill-loader] Skills directory: ${SKILLS_DIR} (source: ${SKILLS_SOURCE})`,
);

// ---------------------------------------------------------------------------
// Skill index
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = DEFAULT_INDEX_TTL_MS; // 5 minutes

/**
 * Built once before the transport is connected, then refreshed in the
 * background. Walking the skills tree is synchronous and takes hundreds of
 * milliseconds, so doing it on a request path stalls every other request the
 * SDK has already dispatched into this process.
 */
const skillIndex = new SkillIndex(SKILLS_DIR, { ttlMs: CACHE_TTL_MS });

function buildIndex() {
  return skillIndex.get();
}

/**
 * Module-bound wrapper using the configured SKILLS_DIR. Pure logic lives
 * in lib.resolveSkillPath.
 */
function resolveSkillPath(skillPath: string): string {
  return resolveSkillPathLib(skillPath, SKILLS_DIR);
}

// ---------------------------------------------------------------------------
// File read with cache
// ---------------------------------------------------------------------------

/**
 * Bounded: a long session that touched hundreds of skill bodies used to hold
 * every one of them for the life of the process, in the server whose whole
 * point is not keeping skills resident.
 */
const MAX_CACHED_FILES = 128;
const fileCache = new TtlCache<string>(CACHE_TTL_MS, MAX_CACHED_FILES);

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
                "Filter by category: the top-level skills directory, e.g. 'languages' or 'mobile'. Strongly recommended.",
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
                "Return a compact per-category summary {category, skillCount, samplePaths} instead of a flat list.",
            },
          },
          additionalProperties: false,
        },
      },
      {
        name: "load_skill",
        description:
          "Load a skill's full SKILL.md by relative path (e.g. 'languages/kotlin'), frontmatter included.",
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
          "Load one quick-ref file from a skill, e.g. skill_path='languages/kotlin', ref='basics'.",
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

      const trimmedPath = skillPath.trim();
      const resolvedDir = resolveSkillPath(trimmedPath);
      const skillFile = path.join(resolvedDir, "SKILL.md");

      if (!fs.existsSync(skillFile)) {
        throw new Error(
          `Skill not found: '${skillPath}'. ` +
            `Use list_skills to discover available skill paths.`,
        );
      }

      // Read via cache for hot paths, then enforce disable-model-invocation
      // (the cache stores raw content; the gate is checked on every call).
      const content = readCached(skillFile);
      checkSkillInvocable(content, trimmedPath);

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
          "skill_path is required and must be a non-empty string",
        );
      }
      if (typeof ref !== "string" || ref.trim() === "") {
        throw new Error("ref is required and must be a non-empty string");
      }

      // Validation and path resolution stay in lib; the read goes through the
      // same cache as load_skill, which this handler used to bypass entirely.
      const refFile = resolveQuickRefPath(skillPath.trim(), ref, SKILLS_DIR);
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

// Build the catalog before accepting requests, so the walk is never charged
// to an agent's first tool call.
const indexStart = Date.now();
skillIndex.ensureBuilt();
console.error(
  `[skill-loader] Indexed ${buildIndex().length} skills in ${Date.now() - indexStart}ms`,
);

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[skill-loader] Server started — ready for requests");
