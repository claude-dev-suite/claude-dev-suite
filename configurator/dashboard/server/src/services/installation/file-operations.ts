// SPDX-License-Identifier: MIT
/**
 * File Operations for Installation Service
 *
 * Secure file copying and directory operations.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { fileURLToPath } from 'url';
import { getLogger } from '../../utils/logger.js';
import { validatePathWithinBase, validateEntryName } from './security-helpers.js';
import { expandBundleEntry } from '../agent-bundles.js';

const logger = getLogger('InstallationFileOps');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Get dev-suite root directory
 */
export function getDevSuiteDir(): string {
  // Use DEV_SUITE_DIR env var if set (Electron packaged mode)
  if (process.env.DEV_SUITE_DIR) {
    const raw = process.env.DEV_SUITE_DIR;
    // SECURITY: validate the env var value before trusting it
    const resolved = path.resolve(raw);
    // Must be an absolute path after resolution
    if (!path.isAbsolute(resolved)) {
      throw new Error('DEV_SUITE_DIR must be an absolute path');
    }
    // Must resolve without any remaining traversal segments
    if (resolved.includes('..')) {
      throw new Error('DEV_SUITE_DIR must not contain path traversal sequences');
    }
    // Must point to an existing directory
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      throw new Error(`DEV_SUITE_DIR does not point to an existing directory: ${resolved}`);
    }
    return resolved;
  }
  // Fallback: Navigate from server/src/services/installation to dev-suite root (development)
  return path.resolve(__dirname, '..', '..', '..', '..', '..', '..');
}

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
  } catch {
    // Ignore errors
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
 * Defensive cap for unmigrated agents that still declare a single legacy
 * `skills:` list. When `core_skills:` is missing, the first
 * `LEGACY_SKILLS_CORE_CAP` entries become core (preloaded for Claude Code's
 * Level 1 description budget), the rest fall through to extended (reachable
 * via `skill-loader`). Without this cap, an unmigrated agent with 25+ skills
 * (e.g. spring-boot-expert) would single-handedly consume the entire ~1%
 * `skillListingBudgetFraction` budget and cause the *"N descriptions
 * dropped"* warning.
 *
 * Agents that explicitly declare `core_skills:` bypass this cap — the cap is
 * a safety net for legacy frontmatters, not a global ceiling.
 */
export const LEGACY_SKILLS_CORE_CAP = 3;

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
    // Backward compat for legacy `skills:`. We cap how many become core to
    // protect Claude Code's Level 1 description budget — see
    // LEGACY_SKILLS_CORE_CAP. The remainder still ships with the agent but
    // is reachable on demand via `skill-loader` MCP rather than preloaded.
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
