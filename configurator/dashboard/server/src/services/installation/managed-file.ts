// SPDX-License-Identifier: MIT
/**
 * Write a file dev-suite manages, without destroying one it does not.
 *
 * Several writers did an unconditional `fs.writeFileSync` into a path the user
 * may already own: `.gemini/agents/<id>.md`, `.kimi-code/agents/<id>.md`,
 * `.claude/agents/<id>.md` and the path-scoped rule files. A hand-written
 * subagent prompt was overwritten with no backup and no report — and then
 * recorded in the manifest as dev-suite's, so a later uninstall deleted what had
 * originally been the user's file.
 *
 * Gemini and Kimi make this the likeliest case rather than a corner one:
 * assistant detection pre-selects them precisely *because* the user already has
 * those directories.
 *
 * Ownership comes from the previous manifest. On a first install an existing
 * file is the user's by definition and is preserved; on a re-install a file
 * dev-suite recorded is its own and is replaced.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getLogger } from '../../utils/logger.js';

const logger = getLogger('ManagedFile');

const MANIFEST_FILE = '.dev-suite-manifest.json';

/** Outcome of a guarded write. */
export type ManagedWriteOutcome = 'written' | 'replaced' | 'preserved';

/**
 * Paths recorded in the project's manifest as it stands on disk, i.e. what
 * dev-suite wrote on the *previous* install.
 *
 * Read once per install and passed down: the new manifest being built cannot
 * answer "was this already ours?".
 */
export function readPreviouslyManagedPaths(projectPath: string): Set<string> {
  const out = new Set<string>();
  const manifestPath = path.join(projectPath, MANIFEST_FILE);
  if (!fs.existsSync(manifestPath)) return out;
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as { files?: unknown };
    if (!Array.isArray(parsed.files)) return out;
    for (const file of parsed.files) {
      if (typeof file === 'string') {
        out.add(file.split(path.sep).join('/'));
        continue;
      }
      const rel = (file as { path?: unknown }).path;
      if (typeof rel === 'string') out.add(rel.split(path.sep).join('/'));
    }
  } catch {
    // An unreadable manifest means "assume nothing is ours", which errs toward
    // preserving the user's files.
  }
  return out;
}

/**
 * Write `content` to `absPath` unless the file already exists and dev-suite did
 * not write it.
 *
 * Returns what happened so the caller can report a preserved file as a skipped
 * capability rather than letting it pass silently.
 */
export function writeManagedFile(args: {
  absPath: string;
  relPath: string;
  content: string;
  previouslyManaged: ReadonlySet<string>;
}): ManagedWriteOutcome {
  const { absPath, relPath, content, previouslyManaged } = args;
  const normalized = relPath.split(path.sep).join('/');

  if (fs.existsSync(absPath)) {
    if (!previouslyManaged.has(normalized)) {
      logger.warn('Preserved a file dev-suite does not own', { context: { path: normalized } });
      return 'preserved';
    }
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, content, 'utf-8');
    return 'replaced';
  }

  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, content, 'utf-8');
  return 'written';
}

/**
 * Agent files the previous install wrote, grouped by the target that owns them.
 *
 * Native subagent files (`.gemini/agents/<id>.md`, `.kimi-code/agents/<id>.md`)
 * are per-id writes with no pruning, and the manifest is rebuilt from scratch
 * each run — so deselecting an agent left its file on disk, still invocable as
 * `@<id>`, reachable by no removal path: `reinstall.erase()` iterates the *new*
 * manifest and cannot see it.
 */
export function readPreviousAgentFilesByTarget(
  projectPath: string
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const manifestPath = path.join(projectPath, MANIFEST_FILE);
  if (!fs.existsSync(manifestPath)) return out;
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as { files?: unknown };
    if (!Array.isArray(parsed.files)) return out;
    for (const file of parsed.files) {
      if (typeof file === 'string') continue;
      const entry = file as { path?: unknown; type?: unknown; target?: unknown };
      if (entry.type !== 'agent' || typeof entry.path !== 'string') continue;
      const target = typeof entry.target === 'string' ? entry.target : 'claude-code';
      const list = out.get(target) ?? [];
      list.push(entry.path.split(path.sep).join('/'));
      out.set(target, list);
    }
  } catch {
    // Unreadable manifest: prune nothing rather than guess.
  }
  return out;
}

/**
 * Delete the agent files this target owned last time and no longer writes.
 *
 * Never wipes the directory: `.gemini/agents` may hold the user's own files, and
 * in `.claude/agents` a wipe would take `custom/` with it. Returns what went.
 */
export function pruneOrphanedAgentFiles(args: {
  projectPath: string;
  previousForTarget: readonly string[];
  writtenNow: ReadonlySet<string>;
}): string[] {
  const { projectPath, previousForTarget, writtenNow } = args;
  const removed: string[] = [];
  for (const rel of previousForTarget) {
    if (writtenNow.has(rel)) continue;
    const abs = path.join(projectPath, ...rel.split('/'));
    try {
      if (fs.existsSync(abs)) {
        fs.unlinkSync(abs);
        removed.push(rel);
      }
    } catch (error: unknown) {
      logger.warn('Could not remove an orphaned agent file', { error, context: { path: rel } });
    }
  }
  if (removed.length > 0) {
    logger.info('Removed agent files for agents no longer installed', {
      context: { count: removed.length },
    });
  }
  return removed;
}

/**
 * MCP server names the previous install wrote into this project.
 *
 * The merging adapters used to receive the full dev-suite catalog here, so the
 * "drop entries we no longer install" pass deleted a user's own server whenever
 * its name collided with one dev-suite ships — on a *first* install, before
 * dev-suite had written anything, and with no backup. Empty on a first install
 * is the correct answer: nothing was ours yet.
 */
export function readPreviouslyManagedMcpServers(projectPath: string): string[] {
  const manifestPath = path.join(projectPath, MANIFEST_FILE);
  if (!fs.existsSync(manifestPath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as { mcpServers?: unknown };
    return Array.isArray(parsed.mcpServers)
      ? parsed.mcpServers.filter((n): n is string => typeof n === 'string')
      : [];
  } catch {
    return [];
  }
}

/**
 * State the previous install accumulated, which a re-install must NOT reset.
 *
 * `install()` builds a brand-new ExtendedManifest every run, so `features`,
 * `upgradeHistory` and `detectedStack` were silently zeroed by every reinstall
 * and by every Manage-tab add/remove agent (which resyncs through `install()`
 * with `detectedStack: undefined`). The visible consequences: the
 * integration-validator hook stopped being configured, the "API Integration
 * Validation" section vanished from AGENTS.md, applied upgrade features were
 * forgotten and could be re-applied, and the upgrade engine could no longer
 * judge stack compatibility.
 *
 * Returns empty/undefined values on a first install, which is the correct
 * answer: there is nothing to carry forward.
 */
export function readCarriedForwardState(projectPath: string): {
  features: Record<string, unknown>;
  upgradeHistory: unknown[];
  detectedStack: unknown;
} {
  const manifestPath = path.join(projectPath, MANIFEST_FILE);
  const empty = { features: {}, upgradeHistory: [], detectedStack: undefined };
  if (!fs.existsSync(manifestPath)) return empty;
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as {
      features?: unknown;
      upgradeHistory?: unknown;
      detectedStack?: unknown;
    };
    return {
      features:
        parsed.features && typeof parsed.features === 'object' && !Array.isArray(parsed.features)
          ? (parsed.features as Record<string, unknown>)
          : {},
      upgradeHistory: Array.isArray(parsed.upgradeHistory) ? parsed.upgradeHistory : [],
      detectedStack: parsed.detectedStack,
    };
  } catch {
    return empty;
  }
}

/**
 * Path-scoped rule files the previous install wrote.
 *
 * `installedRuleFiles` is *assigned* on each install, never merged, so a rule
 * file this install no longer writes (a deselected agent's category, or a
 * dropped target) disappeared from the record while staying on disk — with no
 * removal path left, since uninstall reads only the current list.
 */
export function readPreviousRuleFiles(projectPath: string): string[] {
  const manifestPath = path.join(projectPath, MANIFEST_FILE);
  if (!fs.existsSync(manifestPath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as {
      installedRuleFiles?: unknown;
    };
    return Array.isArray(parsed.installedRuleFiles)
      ? parsed.installedRuleFiles.filter((p): p is string => typeof p === 'string')
      : [];
  } catch {
    return [];
  }
}
