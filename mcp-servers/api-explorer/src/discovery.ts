// SPDX-License-Identifier: MIT
/**
 * Repository walk shared by spec-file discovery and framework detection.
 *
 * Unreadable directories are reported in `skipped` rather than swallowed, and
 * a walk that hits its entry budget says so with `truncated: true`.
 */

import { open, readdir } from "fs/promises";
import { basename, extname, join } from "path";
import { relativeToRoot } from "./location.js";

export const SKIP_DIRS = new Set([
  "node_modules", ".git", ".hg", ".svn", "dist", "build", "target", "out", "vendor", "__pycache__",
  "venv", ".venv", "env", ".tox", "bin", "obj", "coverage", ".next", ".nuxt", ".gradle", ".idea",
  ".vscode", ".mvn", ".terraform", ".dart_tool", "Pods", ".cache", ".turbo", ".pytest_cache",
]);

export interface WalkResult {
  dirs: Array<{ path: string; depth: number; entries: string[] }>;
  files: string[];
  skipped: Array<{ path: string; reason: string }>;
  truncated: boolean;
}

export async function walkProject(root: string, maxDepth: number, maxEntries = 50_000): Promise<WalkResult> {
  const result: WalkResult = { dirs: [], files: [], skipped: [], truncated: false };
  let budget = maxEntries;
  const queue: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];
  while (queue.length > 0) {
    const { dir, depth } = queue.shift()!;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      result.skipped.push({ path: relativeToRoot(dir), reason: (error as NodeJS.ErrnoException).code ?? String(error) });
      continue;
    }
    budget -= entries.length;
    if (budget < 0) {
      result.truncated = true;
      break;
    }
    result.dirs.push({ path: dir, depth, entries: entries.map((e) => e.name) });
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (depth < maxDepth && !SKIP_DIRS.has(e.name) && !e.name.startsWith(".")) queue.push({ dir: full, depth: depth + 1 });
      } else if (e.isFile()) {
        result.files.push(full);
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Spec files
// ---------------------------------------------------------------------------

const STRUCTURED_EXT = new Set([".json", ".yaml", ".yml"]);
const NAME_HINT = /(openapi|swagger|api-docs|apidocs|asyncapi|api[-_.]?spec|oas3?)/i;

export interface SpecFile {
  path: string;
  kind: "openapi" | "asyncapi" | "graphql" | "proto";
  version?: string;
  format: string;
}

async function head(file: string, bytes = 64 * 1024): Promise<string> {
  const fh = await open(file, "r");
  try {
    const buf = Buffer.alloc(bytes);
    const { bytesRead } = await fh.read(buf, 0, bytes, 0);
    return buf.subarray(0, bytesRead).toString("utf-8");
  } finally {
    await fh.close();
  }
}

const VERSION_RE = /^\s*["']?(openapi|swagger|asyncapi)["']?\s*:\s*["']?([0-9][0-9.]*)/m;

export async function classifySpecFile(file: string): Promise<SpecFile | null> {
  const ext = extname(file).toLowerCase();
  const rel = relativeToRoot(file);
  if (ext === ".proto") return { path: rel, kind: "proto", format: "proto" };
  if (ext === ".graphql" || ext === ".gql" || ext === ".graphqls") return { path: rel, kind: "graphql", format: "graphql-sdl" };
  if (!STRUCTURED_EXT.has(ext)) return null;
  const name = basename(file);
  // Only sniff files whose name suggests a spec, or small files under an api/docs folder.
  if (!NAME_HINT.test(name) && !/[\\/](api|api-docs|docs?|spec|specs|schemas?|contracts?|openapi|swagger)[\\/]/i.test(file)) return null;
  let text: string;
  try {
    text = await head(file);
  } catch {
    return null;
  }
  const m = VERSION_RE.exec(text);
  if (m) {
    const key = m[1].toLowerCase();
    return { path: rel, kind: key === "asyncapi" ? "asyncapi" : "openapi", version: `${key === "swagger" ? "swagger " : key === "asyncapi" ? "asyncapi " : "openapi "}${m[2]}`, format: ext === ".json" ? "json" : "yaml" };
  }
  if (ext === ".json" && /"__schema"\s*:/.test(text)) return { path: rel, kind: "graphql", format: "graphql-introspection" };
  return null;
}

export async function discoverSpecFiles(walk: WalkResult, limit: number): Promise<{ specFiles: SpecFile[]; truncated: boolean }> {
  const out: SpecFile[] = [];
  let truncated = walk.truncated;
  for (const f of walk.files) {
    const s = await classifySpecFile(f);
    if (!s) continue;
    if (out.length >= limit) {
      truncated = true;
      break;
    }
    out.push(s);
  }
  return { specFiles: out, truncated };
}
