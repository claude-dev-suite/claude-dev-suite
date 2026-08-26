// SPDX-License-Identifier: MIT
/**
 * Safe removal of dev-suite's footprint from a project.
 *
 * The install path is careful and the removal path was not: `uninstall()` used
 * to `unlink` every entry in `manifest.files`, and multi-assistant support newly
 * put the user's *merged* files into that list — `AGENTS.md`, `CLAUDE.md`,
 * `.codex/config.toml`, `.gemini/settings.json`, `.cursor/mcp.json`. Uninstalling
 * therefore deleted hand-written prose, a user's own MCP servers, their Codex
 * model and `[tui]` block, with `errors: []` and no backup.
 *
 * The rule this module enforces: **a file dev-suite merged into is never
 * deleted, only un-merged.** Dev-suite's own entries are removed and everything
 * else is written back; the file is deleted only when nothing of the user's is
 * left in it. Files dev-suite created outright are removed as before, but every
 * path is now bounds-checked and `custom/` is never touched.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getLogger } from '../../utils/logger.js';
import {
  AGENTS_SKILLS_DIR,
  getSharedFiles,
  isCustomUserPath,
  getTargetLayout,
  mcpConfigFilesFor,
  DEFAULT_TARGET,
  type TargetId,
} from '../targets/target-layout.js';
import { writeCodexTomlMcp } from '../targets/writers/codex-toml.writer.js';
import { isOwnedSkillDirOrTracked, trackedSkillPathsFrom } from './skill-ownership.js';

const logger = getLogger('Uninstall');

/** How a tracked path must be treated when removing dev-suite. */
export type PathDisposition = 'owned' | 'shared' | 'custom';

/**
 * A file dev-suite merges into, and how to strip its own entries back out.
 *
 * `serverKey` is the top-level object holding the MCP server map, which differs
 * per assistant (`servers` for VS Code, `mcpServers` everywhere else). `toml`
 * marks Codex, whose file is not JSON at all.
 */
interface SharedConfigSpec {
  rel: string;
  serverKey?: string;
  toml?: boolean;
  /** Top-level keys dev-suite sets that are not the server map. */
  ownKeys?: string[];
  /** Entries dev-suite appends to `context.fileName` (Gemini only). */
  contextFiles?: string[];
}

/**
 * Every file an implemented target merges into, keyed by target.
 *
 * `sharedConfigCoverage()` asserts this table stays in step with the layouts —
 * including Copilot's second MCP surface, which is now declared in the
 * descriptor (`extraMcpConfigFiles`) rather than hardcoded per module.
 */
const SHARED_CONFIGS: Partial<Record<TargetId, SharedConfigSpec[]>> = {
  'claude-code': [
    { rel: '.mcp.json', serverKey: 'mcpServers' },
    { rel: '.claude/settings.json', ownKeys: ['skillListingBudgetFraction'] },
  ],
  copilot: [
    { rel: '.vscode/mcp.json', serverKey: 'servers' },
    { rel: '.github/mcp.json', serverKey: 'mcpServers' },
  ],
  cursor: [{ rel: '.cursor/mcp.json', serverKey: 'mcpServers' }],
  gemini: [
    { rel: '.gemini/settings.json', serverKey: 'mcpServers', contextFiles: ['AGENTS.md'] },
  ],
  codex: [{ rel: '.codex/config.toml', toml: true }],
  'kimi-code': [{ rel: '.kimi-code/mcp.json', serverKey: 'mcpServers' }],
  cline: [],
};

/** The shared-config specs that apply to a set of installed targets. */
export function sharedConfigsFor(targets: readonly TargetId[]): SharedConfigSpec[] {
  const seen = new Map<string, SharedConfigSpec>();
  for (const target of targets) {
    for (const spec of SHARED_CONFIGS[target] ?? []) {
      if (!seen.has(spec.rel)) seen.set(spec.rel, spec);
    }
  }
  return [...seen.values()];
}

/**
 * Which target layouts declare a project MCP config or settings file that this
 * module has no un-merge spec for. Used by the test that keeps the table honest
 * when a new assistant is added.
 */
export function sharedConfigCoverage(targets: readonly TargetId[]): string[] {
  const missing: string[] = [];
  for (const target of targets) {
    const layout = getTargetLayout(target);
    const specs = SHARED_CONFIGS[target];
    if (!specs) {
      missing.push(`${target}: no entry in SHARED_CONFIGS`);
      continue;
    }
    const covered = new Set(specs.map((s) => s.rel));
    // Every MCP surface the descriptor declares, not just the primary one.
    // Deriving from `layout.mcpConfigFile` alone meant Copilot's second file
    // was structurally invisible to the very check meant to catch it.
    for (const file of mcpConfigFilesFor(target)) {
      if (!covered.has(file)) missing.push(`${target}: ${file}`);
    }
    if (layout.settingsFile && !covered.has(layout.settingsFile) && layout.settingsFile !== layout.mcpConfigFile) {
      // A settings file dev-suite never writes into needs no spec; only flag it
      // when the adapter merges (Claude Code's is the only one today).
      if (target === 'claude-code') missing.push(`${target}: ${layout.settingsFile}`);
    }
  }
  return missing;
}

/** Instructions files are un-merged by marker stripping, not by entry removal. */
export function instructionsFilesFor(targets: readonly TargetId[]): string[] {
  const files = new Set<string>();
  for (const target of targets) {
    files.add(getTargetLayout(target).instructionsFile);
    for (const shared of getSharedFiles(target)) {
      if (shared.endsWith('.md')) files.add(shared);
    }
  }
  return [...files];
}

/**
 * Decide how a tracked path must be removed.
 *
 * `custom/` wins over everything: a user-authored agent or skill under a
 * reserved custom area is never removed, even if something tracked it.
 */
export function classifyPath(
  relPath: string,
  targets: readonly TargetId[]
): PathDisposition {
  if (isCustomUserPath(relPath)) return 'custom';
  const normalized = relPath.split(path.sep).join('/');
  if (instructionsFilesFor(targets).includes(normalized)) return 'shared';
  if (sharedConfigsFor(targets).some((s) => s.rel === normalized)) return 'shared';
  return 'owned';
}

/**
 * Resolve a manifest-supplied relative path against the project, refusing
 * anything that escapes it.
 *
 * A manifest is data read off disk: a hostile or corrupt one listing
 * `../../.ssh/authorized_keys` must not turn an uninstall into arbitrary file
 * deletion. Returns null when the path escapes.
 */
export function resolveInsideProject(projectPath: string, relPath: string): string | null {
  if (path.isAbsolute(relPath)) return null;
  const base = path.resolve(projectPath);
  const full = path.resolve(base, relPath);
  const withSep = base.endsWith(path.sep) ? base : base + path.sep;
  return full === base || full.startsWith(withSep) ? full : null;
}

function readJson(file: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Result of un-merging one shared config file. */
export type UnmergeOutcome = 'absent' | 'rewritten' | 'deleted' | 'left-alone';

/**
 * Remove dev-suite's entries from one shared config file, deleting the file
 * only when nothing but dev-suite's own content was in it.
 *
 * An unparseable file is left completely alone: it may be the user's, and we
 * cannot tell which parts are ours.
 */
export function unmergeSharedConfig(
  projectPath: string,
  spec: SharedConfigSpec,
  managedServers: readonly string[]
): UnmergeOutcome {
  const full = resolveInsideProject(projectPath, spec.rel);
  if (!full || !fs.existsSync(full)) return 'absent';

  if (spec.toml) {
    const existing = fs.readFileSync(full, 'utf-8');
    let stripped: string;
    try {
      stripped = writeCodexTomlMcp({}, { existing, previouslyManaged: managedServers });
    } catch (error: unknown) {
      logger.warn('Left shared TOML config untouched — could not un-merge', {
        error,
        context: { file: spec.rel },
      });
      return 'left-alone';
    }
    if (stripped.trim().length === 0) {
      fs.unlinkSync(full);
      return 'deleted';
    }
    fs.writeFileSync(full, stripped);
    return 'rewritten';
  }

  const root = readJson(full);
  if (!root) {
    logger.warn('Left shared JSON config untouched — not a parseable object', {
      context: { file: spec.rel },
    });
    return 'left-alone';
  }

  if (spec.serverKey) {
    const map = root[spec.serverKey];
    if (map && typeof map === 'object' && !Array.isArray(map)) {
      const servers = map as Record<string, unknown>;
      for (const name of managedServers) delete servers[name];
      if (Object.keys(servers).length === 0) delete root[spec.serverKey];
    }
  }

  for (const key of spec.ownKeys ?? []) delete root[key];

  if (spec.contextFiles?.length) {
    const context = root.context;
    if (context && typeof context === 'object' && !Array.isArray(context)) {
      const ctx = context as Record<string, unknown>;
      if (Array.isArray(ctx.fileName)) {
        const kept = (ctx.fileName as unknown[]).filter(
          (f) => typeof f !== 'string' || !spec.contextFiles?.includes(f)
        );
        if (kept.length === 0) delete ctx.fileName;
        else ctx.fileName = kept;
      } else if (typeof ctx.fileName === 'string' && spec.contextFiles.includes(ctx.fileName)) {
        delete ctx.fileName;
      }
      if (Object.keys(ctx).length === 0) delete root.context;
    }
  }

  if (Object.keys(root).length === 0) {
    fs.unlinkSync(full);
    return 'deleted';
  }

  fs.writeFileSync(full, JSON.stringify(root, null, 2) + '\n');
  return 'rewritten';
}

/**
 * Delete an instructions file whose dev-suite section has already been stripped,
 * but only when nothing else is left in it.
 *
 * Call AFTER `cleanInstructionsSections` — stripping first and testing the
 * remainder is what tells user prose apart from a file dev-suite created.
 */
export function deleteInstructionsFileIfEmpty(projectPath: string, relPath: string): boolean {
  const full = resolveInsideProject(projectPath, relPath);
  if (!full || !fs.existsSync(full)) return false;
  const remainder = fs.readFileSync(full, 'utf-8').trim();
  if (remainder.length > 0) return false;
  fs.unlinkSync(full);
  return true;
}

/** How `removeOwnedTree` decides what it may delete. */
export interface OwnedTreeOptions {
  /** Never touched, whatever else says. Receives POSIX-relative paths. */
  isPreserved?: (relPath: string) => boolean;
  /**
   * Whether a *top-level* child of the tree belongs to dev-suite. Defaults to
   * "everything does", which is right for directories dev-suite owns outright
   * (`.mcp-servers/`, `.kb-cache/`) and wrong for shared ones.
   */
  isOwnedChild?: (relPath: string, absPath: string) => boolean;
}

/**
 * Remove a directory tree dev-suite owns, keeping anything that is not its own.
 *
 * Replaces `fs.rmSync({recursive:true})`, which took the user's `custom/` area,
 * their own skills and any file they had added with it — unrecoverably, since
 * uninstall takes no backup. Directories are pruned bottom-up and only when
 * empty, so one surviving file keeps its parents alive.
 */
export function removeOwnedTree(
  projectPath: string,
  relDir: string,
  options: OwnedTreeOptions = {}
): { removed: string[]; preserved: string[] } {
  const { isPreserved = () => false, isOwnedChild = () => true } = options;
  const removed: string[] = [];
  const preserved: string[] = [];
  const root = resolveInsideProject(projectPath, relDir);
  if (!root || !fs.existsSync(root)) return { removed, preserved };

  /** Delete everything under `abs`; returns true when the directory is now empty. */
  const purge = (abs: string, rel: string): boolean => {
    let empty = true;
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      const childAbs = path.join(abs, entry.name);
      const childRel = `${rel}/${entry.name}`;
      if (isPreserved(childRel)) {
        preserved.push(childRel);
        empty = false;
        continue;
      }
      if (entry.isDirectory()) {
        if (purge(childAbs, childRel)) {
          try {
            fs.rmdirSync(childAbs);
          } catch {
            empty = false;
          }
        } else {
          empty = false;
        }
      } else {
        try {
          fs.unlinkSync(childAbs);
          removed.push(childRel);
        } catch (error: unknown) {
          logger.warn('Failed to remove file during uninstall', {
            error,
            context: { file: childRel },
          });
          empty = false;
        }
      }
    }
    return empty;
  };

  let allGone = true;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const childAbs = path.join(root, entry.name);
    const childRel = `${relDir}/${entry.name}`;
    if (isPreserved(childRel) || !isOwnedChild(childRel, childAbs)) {
      preserved.push(childRel);
      allGone = false;
      continue;
    }
    if (entry.isDirectory()) {
      if (purge(childAbs, childRel)) {
        try {
          fs.rmdirSync(childAbs);
          removed.push(childRel);
        } catch {
          allGone = false;
        }
      } else {
        allGone = false;
      }
    } else {
      try {
        fs.unlinkSync(childAbs);
        removed.push(childRel);
      } catch (error: unknown) {
        logger.warn('Failed to remove file during uninstall', {
          error,
          context: { file: childRel },
        });
        allGone = false;
      }
    }
  }

  if (allGone) {
    try {
      fs.rmdirSync(root);
      removed.push(relDir);
    } catch {
      /* left behind: not empty after all */
    }
  }
  return { removed, preserved };
}

/**
 * Remove a skills tree, keeping every folder dev-suite did not materialise.
 *
 * Used for both `.claude/skills` and the cross-tool `.agents/skills` mirror
 * (reference doc section 2.2 makes the latter shared ground — Copilot, Cursor,
 * Codex, Gemini, Kimi and Devin all read it, and other tooling writes there).
 */
export function removeOwnedSkillTree(
  projectPath: string,
  relSkillsDir: string,
  manifest: unknown
): { removed: string[]; preserved: string[] } {
  const tracked = trackedSkillPathsFrom(manifest);
  return removeOwnedTree(projectPath, relSkillsDir, {
    isPreserved: (rel) => isCustomUserPath(rel),
    isOwnedChild: (rel, abs) =>
      fs.statSync(abs).isDirectory()
        ? isOwnedSkillDirOrTracked(abs, rel, tracked)
        : // Top-level files such as the generated `_README.md` index are ours
          // only when the manifest says so.
          tracked.has(rel) || path.basename(rel) === '_README.md',
  });
}

/**
 * Remove the cross-tool `.agents/skills` mirror and prune its `.agents` parent.
 *
 * The mirror was previously not removed at all, so an uninstall left the whole
 * tree behind.
 */
export function removeOwnedSkillMirror(
  projectPath: string,
  manifest: unknown
): { removed: string[]; preserved: string[] } {
  const result = removeOwnedSkillTree(projectPath, AGENTS_SKILLS_DIR, manifest);
  const root = resolveInsideProject(projectPath, AGENTS_SKILLS_DIR);
  if (root && !fs.existsSync(root)) {
    const parent = path.dirname(root);
    try {
      if (fs.existsSync(parent) && fs.readdirSync(parent).length === 0) fs.rmdirSync(parent);
    } catch {
      /* something else lives there */
    }
  }
  return result;
}

/**
 * Delete directories dev-suite created that are now empty.
 *
 * Files are removed individually so user content survives, which leaves hollow
 * directories (`.claude/rules`, `.claude/commands`, `.gemini/agents`) behind.
 */
export function pruneEmptyDirs(projectPath: string, relDirs: readonly string[]): string[] {
  const removed: string[] = [];
  // Deepest first, so a parent can go once its children have.
  const ordered = [...relDirs].sort((a, b) => b.split('/').length - a.split('/').length);
  for (const rel of ordered) {
    const abs = resolveInsideProject(projectPath, rel);
    if (!abs || !fs.existsSync(abs)) continue;
    try {
      if (fs.statSync(abs).isDirectory() && fs.readdirSync(abs).length === 0) {
        fs.rmdirSync(abs);
        removed.push(rel);
      }
    } catch {
      /* not empty, or not removable */
    }
  }
  return removed;
}

/**
 * The assistants this project was installed for.
 *
 * Order of authority: the manifest, then `.dev-suite.json` (which now records
 * the same selection), then Claude Code for pre-multi-assistant installs.
 *
 * Falling straight from a missing manifest to `[DEFAULT_TARGET]` is what made a
 * lost or hand-deleted manifest silently rewrite a Cursor-only project as a
 * Claude Code one. `.dev-suite.json` is the user's stated selection and is
 * consulted before that assumption.
 */
export function resolveProjectTargets(
  projectPath: string,
  manifest: { targets?: unknown } | null
): TargetId[] {
  const fromManifest = manifest?.targets;
  if (Array.isArray(fromManifest) && fromManifest.length > 0) {
    const valid = fromManifest.filter((t): t is TargetId => typeof t === 'string');
    if (valid.length > 0) return valid;
  }

  try {
    const configPath = path.join(projectPath, '.dev-suite.json');
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as { targets?: unknown };
      if (Array.isArray(parsed.targets)) {
        const valid = parsed.targets.filter((t): t is TargetId => typeof t === 'string');
        if (valid.length > 0) return valid;
      }
    }
  } catch {
    // Unreadable or malformed — fall through to the historical default.
  }

  return [DEFAULT_TARGET];
}

/** Targets recorded in a manifest, defaulting to Claude Code for old manifests. */
export function manifestTargets(manifest: { targets?: unknown } | null): TargetId[] {
  const raw = manifest?.targets;
  if (!Array.isArray(raw) || raw.length === 0) return [DEFAULT_TARGET];
  const valid = raw.filter((t): t is TargetId => typeof t === 'string');
  return valid.length > 0 ? valid : [DEFAULT_TARGET];
}

