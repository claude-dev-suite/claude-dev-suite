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
import { comparisonHashOf, matchesAnyLineEnding } from './drift.service.js';

const logger = getLogger('ManagedFile');

const MANIFEST_FILE = '.dev-suite-manifest.json';

/** Where a drifted file is copied before it is replaced. */
export const DRIFT_BACKUP_DIR = '.dev-suite-backup/drift';

/**
 * Outcome of a guarded write.
 *
 * `drifted` is the case ownership-by-path alone could not see: the file IS
 * ours, but its content changed since we wrote it and no human ratified the
 * change. Overwriting it silently is how a concurrent agent's work disappears,
 * so the write is refused, the content is backed up, and the caller reports it.
 */
export type ManagedWriteOutcome = 'written' | 'replaced' | 'preserved' | 'drifted';

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
 * Hashes the previous install recorded, so a write can tell "our file,
 * untouched" from "our file, edited since".
 *
 * Ownership by path alone cannot: a `.claude/agents/*.md` an agent rewrote is
 * still in the manifest, so it stayed "ours" and was replaced with no backup
 * and no entry in `skipped`. Reading the recorded hash is what turns that into
 * a visible event.
 */
export function readPreviousFileHashes(projectPath: string): {
  hashes: Map<string, string>;
  sectionHashes: Map<string, string>;
  acknowledged: Map<string, string>;
} {
  const hashes = new Map<string, string>();
  const sectionHashes = new Map<string, string>();
  const acknowledged = new Map<string, string>();
  const manifestPath = path.join(projectPath, MANIFEST_FILE);
  if (!fs.existsSync(manifestPath)) return { hashes, sectionHashes, acknowledged };
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as { files?: unknown };
    if (!Array.isArray(parsed.files)) return { hashes, sectionHashes, acknowledged };
    for (const file of parsed.files) {
      if (!file || typeof file !== 'object') continue;
      const entry = file as {
        path?: unknown;
        hash?: unknown;
        sectionHash?: unknown;
        acknowledgedHash?: unknown;
      };
      if (typeof entry.path !== 'string') continue;
      const rel = entry.path.split(path.sep).join('/');
      if (typeof entry.hash === 'string' && entry.hash) hashes.set(rel, entry.hash);
      // Recorded for files carrying the dev-suite markers: the only baseline the
      // section comparison below can legitimately be measured against.
      if (typeof entry.sectionHash === 'string' && entry.sectionHash) {
        sectionHashes.set(rel, entry.sectionHash);
      }
      if (typeof entry.acknowledgedHash === 'string' && entry.acknowledgedHash) {
        acknowledged.set(rel, entry.acknowledgedHash);
      }
    }
  } catch {
    // Unreadable manifest: no baselines, so no file can be judged drifted and
    // the pre-existing behaviour applies unchanged.
  }
  return { hashes, sectionHashes, acknowledged };
}

/**
 * Copy a drifted file aside before anything else can touch it.
 *
 * Lives under the project's own backup directory rather than beside the file:
 * a `.bak` dropped into `.claude/agents/` would itself be read as an agent.
 */
function backupDriftedFile(projectPath: string, relPath: string, absPath: string): string | null {
  try {
    const dest = path.join(projectPath, ...DRIFT_BACKUP_DIR.split('/'), ...relPath.split('/'));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(absPath, dest);
    return `${DRIFT_BACKUP_DIR}/${relPath}`;
  } catch (error: unknown) {
    logger.error('Could not back up a drifted managed file', { error, context: { path: relPath } });
    return null;
  }
}

/**
 * Write `content` to `absPath` unless the file already exists and dev-suite did
 * not write it — or wrote it, but somebody has edited it since.
 *
 * Returns what happened so the caller can report a preserved or drifted file as
 * a skipped capability rather than letting it pass silently.
 *
 * Drift detection is opt-in through `previousHashes`: with no baselines the
 * function behaves exactly as before (our file is replaced), so callers that
 * have not been wired up keep their existing semantics.
 */
export function writeManagedFile(args: {
  absPath: string;
  relPath: string;
  content: string;
  previouslyManaged: ReadonlySet<string>;
  /**
   * `relPath` → hash recorded by the previous install. Supply it (via
   * `readPreviousFileHashes`) to enable the `drifted` outcome.
   */
  previousHashes?: ReadonlyMap<string, string>;
  /** `relPath` → hash of the marked span only, for files that carry the markers. */
  sectionHashes?: ReadonlyMap<string, string>;
  /** `relPath` → hash a human ratified with `promote`; such content is replaceable. */
  acknowledgedHashes?: ReadonlyMap<string, string>;
  /** Project root, required to place the drift backup. */
  projectPath?: string;
}): ManagedWriteOutcome {
  const {
    absPath,
    relPath,
    content,
    previouslyManaged,
    previousHashes,
    sectionHashes,
    acknowledgedHashes,
    projectPath,
  } = args;
  const normalized = relPath.split(path.sep).join('/');

  if (fs.existsSync(absPath)) {
    if (!previouslyManaged.has(normalized)) {
      logger.warn('Preserved a file dev-suite does not own', { context: { path: normalized } });
      return 'preserved';
    }

    if (isDrifted(absPath, normalized, previousHashes, acknowledgedHashes, sectionHashes)) {
      const root = projectPath ?? deriveProjectRoot(absPath, relPath);
      const backup = root ? backupDriftedFile(root, normalized, absPath) : null;
      logger.warn('Refused to overwrite a managed file that changed since we wrote it', {
        context: { path: normalized, backup: backup ?? '(backup failed)' },
      });
      return 'drifted';
    }

    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, content, 'utf-8');
    return 'replaced';
  }

  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, content, 'utf-8');
  return 'written';
}

/** True when the on-disk content differs from the recorded baseline and nobody ratified it. */
function isDrifted(
  absPath: string,
  normalized: string,
  previousHashes: ReadonlyMap<string, string> | undefined,
  acknowledgedHashes: ReadonlyMap<string, string> | undefined,
  sectionHashes?: ReadonlyMap<string, string>
): boolean {
  const baseline = previousHashes?.get(normalized);
  // No baseline means no judgement: never invent drift from missing data.
  if (!baseline) return false;

  let current: string;
  try {
    current = fs.readFileSync(absPath, 'utf-8');
  } catch {
    return false;
  }

  if (matchesAnyLineEnding(current, baseline)) return false;

  const ratified = acknowledgedHashes?.get(normalized);
  if (ratified && matchesAnyLineEnding(current, ratified)) return false;

  // A marked file's whole-file hash moves with the user's own prose, so fall
  // back to comparing only the span we own — against the section baseline, not
  // the whole-file one. Comparing it against `baseline` could never match, so
  // this branch used to be unreachable.
  const { hash, scope } = comparisonHashOf(current);
  if (scope === 'managed-section') {
    const sectionBaseline = sectionHashes?.get(normalized);
    if (sectionBaseline && hash === sectionBaseline) return false;
    if (ratified && hash === ratified) return false;
  }

  return true;
}

/** Best-effort project root from an absolute path and the relative path under it. */
function deriveProjectRoot(absPath: string, relPath: string): string | null {
  const suffix = relPath.split('/').join(path.sep);
  return absPath.endsWith(suffix) ? absPath.slice(0, absPath.length - suffix.length) || null : null;
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
