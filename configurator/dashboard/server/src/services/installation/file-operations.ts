// SPDX-License-Identifier: MIT
/**
 * File Operations for Installation Service
 *
 * Secure file copying and directory operations.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { getLogger } from '../../utils/logger.js';
import { validatePathWithinBase, validateEntryName } from './security-helpers.js';
import { expandBundleEntry } from '../agent-bundles.js';
import { getDevSuiteDir } from '../../utils/dev-suite-dir.js';

const logger = getLogger('InstallationFileOps');

// Re-export the canonical validated implementation so existing importers of
// this module keep working while there is a single source of truth (M6).
export { getDevSuiteDir };

/**
 * Calculate SHA256 hash of file content
 */
export function calculateFileHash(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Calculate hash from file path
 */
export function calculateFileHashFromPath(filePath: string): string | null {
  if (filePath.includes('..')) throw new Error('Path traversal not allowed');
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return calculateFileHash(content);
    }
  } catch (err) {
    logger.warn('calculateFileHashFromPath: failed to read file', { context: { filePath }, error: err instanceof Error ? err.message : String(err) });
  }
  return null;
}

/**
 * Recursively copy a directory with security validation
 */
export function copyDirSync(src: string, dest: string, baseDestDir?: string): void {
  if (src.includes('..') || dest.includes('..')) throw new Error('Path traversal not allowed');
  // SECURITY: Track the original destination base for validation
  const destBase = baseDestDir ?? dest;

  // SECURITY: Validate source and destination paths
  const resolvedSrc = path.resolve(src);
  const resolvedDest = path.resolve(dest);
  if (resolvedSrc.includes('..') || resolvedDest.includes('..')) throw new Error('Path traversal not allowed');

  // Validate dest stays within base destination
  validatePathWithinBase(resolvedDest, destBase, true);

  if (!fs.existsSync(resolvedDest)) {
    fs.mkdirSync(resolvedDest, { recursive: true });
  }

  const entries = fs.readdirSync(resolvedSrc, { withFileTypes: true });
  for (const entry of entries) {
    // SECURITY: Validate entry name doesn't contain path separators
    if (!validateEntryName(entry.name)) {
      logger.warn('Skipping suspicious entry name', { context: { entryName: entry.name, src } });
      continue;
    }

    const srcPath = path.join(resolvedSrc, entry.name);
    const destPath = path.join(resolvedDest, entry.name);

    // SECURITY: Validate the destination path stays within the base directory
    try {
      validatePathWithinBase(destPath, destBase, false);
    } catch (error: unknown) {
      logger.warn('Skipping path that escapes destination base', {
        error,
        context: { srcPath, destPath, destBase }
      });
      continue;
    }

    if (entry.isDirectory()) {
      if (!['node_modules', '.git'].includes(entry.name)) {
        copyDirSync(srcPath, destPath, destBase);
      }
    } else {
      // SECURITY: Check if source is a symlink pointing outside
      if (entry.isSymbolicLink()) {
        try {
          const realSrcPath = fs.realpathSync(srcPath);
          // Only copy if symlink resolves within source tree
          if (!realSrcPath.startsWith(path.dirname(resolvedSrc))) {
            logger.warn('Skipping symlink that points outside source tree', {
              context: { srcPath, realSrcPath }
            });
            continue;
          }
        } catch {
          logger.warn('Skipping broken symlink', { context: { srcPath } });
          continue;
        }
      }
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Find an agent file by name in a directory tree
 */
export function findAgentFile(dir: string, filename: string): string | null {
  if (dir.includes('..')) throw new Error('Path traversal not allowed');
  if (!fs.existsSync(dir)) return null;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const result = findAgentFile(fullPath, filename);
      if (result) return result;
    } else if (entry.name === filename) {
      return fullPath;
    }
  }
  return null;
}

/**
 * Flatten a skill source path (e.g. `frontend-frameworks/react`) into a
 * single-segment directory name suitable for `.claude/skills/<name>/`.
 *
 * Claude Code's native Skills auto-discovery requires a flat structure
 * (`.claude/skills/<name>/SKILL.md`) with names limited to lowercase letters,
 * digits, and hyphens, max 64 chars.
 */
export function flattenSkillName(skillPath: string): string {
  const flat = skillPath
    .toLowerCase()
    .replace(/[\\/]+/g, '-')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (flat.length <= 64) return flat;

  // Truncate while preserving uniqueness via short hash suffix
  const hash = crypto.createHash('sha1').update(skillPath).digest('hex').slice(0, 8);
  const head = flat.slice(0, 64 - hash.length - 1).replace(/-+$/, '');
  return `${head}-${hash}`;
}

export interface ParsedAgentSkills {
  /** Union of core + extended (deduplicated, bundle-expanded). */
  all: string[];
  /** Skills always preloaded under `.claude/skills/`. */
  core: string[];
  /** Skills accessible only via `skill-loader` MCP (not preloaded). */
  extended: string[];
}

/**
 * Defensive cap for agents that still declare a single legacy `skills:` list —
 * user-authored custom agents, now that the shipped catalog is fully migrated.
 * When `core_skills:` is missing, the first `LEGACY_SKILLS_CORE_CAP` entries
 * become core, the rest fall through to extended (reachable via `skill-loader`).
 *
 * The cap is 1, and the reason is not the description budget this comment used
 * to cite. `skills:` in an installed agent's frontmatter preloads the **full
 * body** of each listed skill into that subagent's context at startup — not the
 * description. At a mean SKILL.md body of roughly 1.8k tokens, three preloaded
 * skills cost about 6k tokens in *every* subagent spawned from that agent, and
 * a parallel fan-out multiplies that by the number of agents. One core skill is
 * the one the agent cannot do its job without on the first turn; everything else
 * is one `Skill` tool call away, which costs a round trip instead of a tax on
 * every spawn.
 *
 * (`skillListingBudgetFraction`, by contrast, is a main-session ceiling on skill
 * *descriptions*. It is not paid per subagent and lowering it saves nothing.)
 *
 * Agents that explicitly declare `core_skills:` bypass this cap — the cap is
 * a safety net for legacy frontmatters, not a global ceiling.
 */
export const LEGACY_SKILLS_CORE_CAP = 1;

/**
 * Parse a YAML list block like `skills:` / `core_skills:` / `extended_skills:`
 * line-by-line, tolerating comment lines and blank lines.
 */
function parseYamlSkillList(content: string, key: string, agentId: string): string[] {
  const raw: string[] = [];
  const lines = content.split('\n');
  const keyRe = new RegExp(`^${key}:\\s*$`);
  let inBlock = false;
  for (const line of lines) {
    if (keyRe.test(line)) {
      inBlock = true;
      continue;
    }
    if (inBlock) {
      // A non-indented, non-empty line signals a new top-level YAML key
      if (line.length > 0 && !/^\s/.test(line)) {
        inBlock = false;
        continue;
      }
      const itemMatch = line.match(/^\s+-\s+(.+)$/);
      if (itemMatch?.[1]) {
        const entry = itemMatch[1].replace(/#.*$/, '').trim();
        if (entry) raw.push(entry);
      }
    }
  }

  const seen = new Set<string>();
  const expanded: string[] = [];
  for (const entry of raw) {
    for (const skill of expandBundleEntry(entry, agentId)) {
      if (!seen.has(skill)) {
        seen.add(skill);
        expanded.push(skill);
      }
    }
  }
  return expanded;
}

/**
 * Parse the YAML frontmatter of an agent file and return its skills tiered
 * into `core` (always preloaded) and `extended` (on-demand via `skill-loader`).
 *
 * Schema rules:
 * - If `core_skills:` is present, it populates `core`. `extended_skills:`
 *   populates `extended`. Legacy `skills:` is ignored to avoid ambiguity.
 * - If only legacy `skills:` is present (no `core_skills:`), the full list
 *   populates `core` (zero-regression backward compat for unmigrated agents).
 * - Bundle references (`bundle:<id>`) are expanded via `expandBundleEntry`.
 *
 * @param content Full agent file content (markdown with frontmatter)
 * @param agentId Used only for warning messages on unknown bundles
 */
export function parseAgentSkillsStructured(content: string, agentId = 'unknown'): ParsedAgentSkills {
  const frontmatterEnd = content.startsWith('---')
    ? content.indexOf('---', 3)
    : -1;
  const frontmatter = frontmatterEnd > 0 ? content.substring(3, frontmatterEnd) : content;

  const hasCoreKey = /^core_skills:\s*$/m.test(frontmatter);
  let core: string[];
  let extended: string[];

  if (hasCoreKey) {
    core = parseYamlSkillList(frontmatter, 'core_skills', agentId);
    extended = parseYamlSkillList(frontmatter, 'extended_skills', agentId);
  } else {
    // Backward compat for legacy `skills:`. We cap how many become core
    // because every core skill is preloaded whole into each subagent spawned
    // from this agent — see LEGACY_SKILLS_CORE_CAP. The remainder still ships
    // with the agent but is reachable on demand via `skill-loader` MCP.
    const legacy = parseYamlSkillList(frontmatter, 'skills', agentId);
    core = legacy.slice(0, LEGACY_SKILLS_CORE_CAP);
    extended = legacy.slice(LEGACY_SKILLS_CORE_CAP);
  }

  // Deduplicate union (a skill in both core and extended → core wins).
  const coreSet = new Set(core);
  const all = [...core];
  for (const s of extended) {
    if (!coreSet.has(s)) all.push(s);
  }

  return { all, core, extended };
}

/**
 * Backward-compatible accessor returning the full skill list (core + extended,
 * deduplicated, bundle-expanded). Use `parseAgentSkillsStructured` when you
 * need to distinguish the two tiers (e.g. lazy install pipeline).
 */
export function parseAgentSkills(content: string, agentId = 'unknown'): string[] {
  return parseAgentSkillsStructured(content, agentId).all;
}

export interface InstalledAgentOptions {
  /** Flat dir names of skills installed locally for this agent (preloaded). */
  installedSkillFlatNames: string[];
  /** Extra MCP servers to connect (e.g. 'skill-loader' in lazy mode). */
  extraMcpServers?: string[];
  /** Grant the native `Skill` tool (for runtime skill discovery/loading). */
  grantSkillTool?: boolean;
}

/**
 * Rewrite a dev-suite agent's frontmatter into the shape Claude Code's native
 * subagent loader expects, applied when writing `.claude/agents/<id>.md`.
 *
 * dev-suite source agents use `allowed-tools:` (Claude Code ignores it — its
 * field is `tools:`, so subagents silently inherit ALL tools) and path-style
 * `skills:` (don't match the flattened skill dirs we install, so preload is
 * skipped with a warning). This transform fixes both at the install boundary;
 * the source files keep dev-suite conventions (still read by agents.service,
 * validators, etc.). Verified against Claude Code 2.1.158:
 *  - native `tools:` actually restricts the subagent;
 *  - a subagent gets MCP access via the `mcpServers:` field (NOT a
 *    `mcp__x__*` wildcard in `tools:`);
 *  - skills resolve by their top-level `.claude/skills/<dir>` name.
 *
 * Transforms:
 *  - `allowed-tools: <csv>` → `tools: <csv>` (non-MCP tools + any `mcp__x__*`
 *    entries kept in the allowlist; `Skill` appended when grantSkillTool).
 *  - emits `mcpServers:` from the `mcp__<server>__*` tool entries AND the
 *    legacy `mcp_servers:` list, plus extraMcpServers.
 *  - replaces `skills:`/`core_skills:`/`extended_skills:` with a single
 *    `skills:` list of installedSkillFlatNames (omitted when empty).
 *
 * Agents that omit `allowed-tools` keep inheriting all tools (no `tools:`
 * emitted) — intentional, matches today's effective behavior.
 */
export function toInstalledAgentContent(content: string, opts: InstalledAgentOptions): string {
  const { installedSkillFlatNames, extraMcpServers = [], grantSkillTool = false } = opts;

  if (!content.startsWith('---')) return content;
  const fmEnd = content.indexOf('\n---', 3);
  if (fmEnd < 0) return content;
  const fmBlock = content.slice(3, fmEnd).replace(/^\r?\n/, '');
  const body = content.slice(fmEnd + 4).replace(/^\r?\n/, '\n');

  const mcpServers: string[] = [];
  let toolsCsv: string | null = null;

  // Pass 1 — collect inputs and emit kept lines (dropping keys we regenerate).
  const kept: string[] = [];
  const lines = fmBlock.split('\n');
  let skipKind: 'mcp' | 'other' | null = null;
  for (const line of lines) {
    const keyMatch = line.match(/^([A-Za-z0-9_-]+):(.*)$/);
    if (keyMatch && !/^\s/.test(line)) {
      const key = keyMatch[1];
      skipKind = null;
      if (key === 'allowed-tools' || key === 'tools') {
        toolsCsv = (keyMatch[2] ?? '').trim();
        continue; // regenerated below
      }
      if (key === 'mcp_servers' || key === 'mcpServers') {
        skipKind = 'mcp'; // collect its list items, regenerate below
        continue;
      }
      if (key === 'skills' || key === 'core_skills' || key === 'extended_skills') {
        skipKind = 'other'; // discard list items, regenerate `skills:` below
        continue;
      }
      kept.push(line);
      continue;
    }
    // indented / list / comment / blank line
    if (skipKind === 'mcp') {
      const item = line.match(/^\s+-\s+(.+?)\s*$/);
      if (item?.[1]) {
        const v = item[1].replace(/#.*$/, '').trim();
        if (v && !mcpServers.includes(v)) mcpServers.push(v);
      }
      continue;
    }
    if (skipKind === 'other') continue; // drop old skills list items
    kept.push(line);
  }

  // Derive tools list + MCP servers from the (allowed-)tools CSV.
  const toolEntries: string[] = [];
  if (toolsCsv) {
    for (const raw of toolsCsv.split(',')) {
      const t = raw.trim();
      if (!t) continue;
      toolEntries.push(t);
      const mcp = t.match(/^mcp__(.+?)__/);
      if (mcp?.[1] && !mcpServers.includes(mcp[1])) mcpServers.push(mcp[1]);
    }
  }
  for (const s of extraMcpServers) if (s && !mcpServers.includes(s)) mcpServers.push(s);
  if (grantSkillTool && !toolEntries.some((t) => t === 'Skill')) toolEntries.push('Skill');

  // Reassemble frontmatter: kept lines, then regenerated blocks.
  const out: string[] = [];
  for (const l of kept) if (l.trim() !== '') out.push(l);
  if (toolEntries.length > 0) out.push(`tools: ${toolEntries.join(', ')}`);
  if (mcpServers.length > 0) {
    out.push('mcpServers:');
    for (const s of mcpServers) out.push(`  - ${s}`);
  }
  if (installedSkillFlatNames.length > 0) {
    out.push('skills:');
    for (const s of installedSkillFlatNames) out.push(`  - ${s}`);
  }

  return `---\n${out.join('\n')}\n---\n${body.replace(/^\n/, '')}`;
}

/**
 * Read MCP server metadata to get required environment variables
 */
export function getServerEnvVars(
  serverName: string,
  allEnvVars: Record<string, string>,
  devSuiteDir: string
): Record<string, string> {
  const metadataPath = path.join(devSuiteDir, 'mcp-servers', serverName, 'metadata.json');
  const result: Record<string, string> = {};

  if (fs.existsSync(metadataPath)) {
    try {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8')) as {
        envVars?: Array<{ name: string }>;
      };
      if (metadata.envVars && Array.isArray(metadata.envVars)) {
        for (const envVar of metadata.envVars) {
          const varName = envVar.name;
          const varValue = allEnvVars[varName];
          if (varName && varValue) {
            result[varName] = varValue;
          }
        }
      }
    } catch (error: unknown) {
      logger.warn('Failed to read MCP server metadata for env detection', {
        error,
        context: { serverName, metadataPath }
      });
    }
  }

  return result;
}

/**
 * Entries of an MCP server package that are needed to *run* it.
 *
 * `copyDirSync` already skips `node_modules`, but it still copied `src/`,
 * `tests/`, `scripts/`, `tsconfig.json` and `vitest.config.ts` into every
 * project. That was tolerable while `.mcp-servers/` was gitignored build
 * output; once the directory is committed so a teammate gets a working install
 * from a clone, those files become someone else's repository contents.
 *
 * `dist/` is the self-contained esbuild bundle, `metadata.json` is read back by
 * install-recovery and materialize-local, `package.json` carries the version
 * the manifest is compared against, and `skills/` is skill-loader's payload —
 * bundled at build time and the whole point of lazy skill loading.
 */
const MCP_BUNDLE_ENTRIES = ['dist', 'metadata.json', 'package.json', 'skills'] as const;

/**
 * Copy only the runtime half of an MCP server package into a project.
 *
 * Same security posture as {@link copyDirSync} — it delegates per entry, so
 * path validation, traversal checks and the `node_modules` skip all still
 * apply. Returns the entries actually copied, for logging.
 */
export function copyMcpServerBundle(src: string, dest: string): string[] {
  if (src.includes('..') || dest.includes('..')) throw new Error('Path traversal not allowed');
  const resolvedSrc = path.resolve(src);
  const resolvedDest = path.resolve(dest);

  if (!fs.existsSync(resolvedDest)) fs.mkdirSync(resolvedDest, { recursive: true });

  const copied: string[] = [];
  for (const entry of MCP_BUNDLE_ENTRIES) {
    // Defence in depth: the list is a literal, but it flows into path.join.
    if (!validateEntryName(entry)) continue;
    const from = path.join(resolvedSrc, entry);
    if (!fs.existsSync(from)) continue;

    const to = path.join(resolvedDest, entry);
    try {
      validatePathWithinBase(to, resolvedDest, false);
    } catch (error: unknown) {
      logger.warn('Skipping bundle entry that escapes destination', {
        error,
        context: { entry, dest: resolvedDest },
      });
      continue;
    }

    if (fs.statSync(from).isDirectory()) {
      copyDirSync(from, to, resolvedDest);
    } else {
      fs.copyFileSync(from, to);
    }
    copied.push(entry);
  }

  return copied;
}

/** An MCP server's env values, split by whether the catalog calls them secret. */
export interface ServerEnvSpec {
  /** Every value the wizard collected for this server. */
  values: Record<string, string>;
  /** The subset whose names are declared `secret: true` in `metadata.json`. */
  secretNames: string[];
}

/**
 * Like {@link getServerEnvVars}, but keeps the `secret` declaration attached.
 *
 * Writers need the distinction, not just the values: a config file that is
 * meant to be committed can carry `KB_REPO_BRANCH` verbatim, and must never
 * carry `DATABASE_URL`. Reading the flag here keeps `metadata.json` the single
 * source of truth — the same one `scripts/validate-env-secrets.mjs` gates.
 */
export function getServerEnvSpec(
  serverName: string,
  allEnvVars: Record<string, string>,
  devSuiteDir: string
): ServerEnvSpec {
  const metadataPath = path.join(devSuiteDir, 'mcp-servers', serverName, 'metadata.json');
  const values: Record<string, string> = {};
  const secretNames: string[] = [];

  if (fs.existsSync(metadataPath)) {
    try {
      const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8')) as {
        envVars?: Array<{ name: string; secret?: boolean }>;
      };
      for (const envVar of metadata.envVars ?? []) {
        const varName = envVar.name;
        const varValue = allEnvVars[varName];
        if (!varName || !varValue) continue;
        values[varName] = varValue;
        if (envVar.secret === true) secretNames.push(varName);
      }
    } catch (error: unknown) {
      logger.warn('Failed to read MCP server metadata for env detection', {
        error,
        context: { serverName, metadataPath },
      });
    }
  }

  return { values, secretNames };
}
