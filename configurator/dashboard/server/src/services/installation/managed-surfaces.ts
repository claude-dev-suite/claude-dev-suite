// SPDX-License-Identifier: MIT
/**
 * The set of project paths a dev-suite write touches, per target.
 *
 * Lives here rather than in a service because it is derived entirely from the
 * target layouts, and both `installation.service` (backup before install) and
 * `reinstall.service` (backup before erase) need it — importing it from either
 * service would make the two circular.
 */

import {
  AGENTS_SKILLS_DIR,
  DEFAULT_TARGET,
  SHARED_INSTRUCTIONS_FILE,
  getTargetLayout,
  readsAgentsSkills,
  type TargetId,
  type TargetLayout,
} from '../targets/target-layout.js';

/**
 * Everything a reinstall may mutate, across every target in a manifest, split
 * into config-directory trees (copied/removed wholesale) and standalone files.
 *
 * The standalone-file set is the subtle part. It includes any target's MCP,
 * settings or instructions file that lives *outside* its config directory —
 * most importantly Copilot's `.vscode/mcp.json`, which sits under neither
 * `.github` (its config dir) nor the project root. Backing up only the
 * config-dir trees would silently miss it, so a failed Copilot reinstall would
 * roll back without restoring its MCP config.
 *
 * Instructions files travel together for the same reason `AGENTS.md` and
 * `CLAUDE.md` always did: one holds the shared section, the other imports it,
 * so restoring one without the other leaves a dangling import.
 */
export function managedSurfaces(targets: readonly TargetId[]): { dirs: string[]; files: string[] } {
  const dirs = new Set<string>();
  const files = new Set<string>([
    '.dev-suite.json',
    '.dev-suite-manifest.json',
    SHARED_INSTRUCTIONS_FILE,
    // An install edits `.gitignore` (adding the marked block that keeps MCP
    // configs carrying wizard credentials out of version control). It was not
    // in this set, so a rollback left that edit behind while logging "the
    // project is unchanged". It is deliberately NOT in `manifest.files` — that
    // list is the uninstall delete-set and this is the user's file — but a
    // snapshot/restore surface is exactly what it needs to be.
    '.gitignore',
  ]);

  // The `.claude/` substrate (agents + skills) is always written, even for a
  // Copilot- or Cursor-only install, because those assistants read it directly.
  // So DEFAULT_TARGET's surfaces are always in play regardless of the request.
  // Its extra files (`.mcp.json`, `.claude/settings.json`) simply don't exist
  // when Claude Code wasn't targeted, and backup/rollback skip absent files.
  const effectiveTargets = new Set<TargetId>([DEFAULT_TARGET, ...targets]);

  for (const target of effectiveTargets) {
    let layout: TargetLayout;
    try {
      layout = getTargetLayout(target);
    } catch {
      continue; // unknown/future target in the manifest — skip defensively
    }
    if (layout.configDir) dirs.add(layout.configDir);
    if (layout.instructionsFile) files.add(layout.instructionsFile);
    if (layout.mcpConfigFile) files.add(layout.mcpConfigFile);
    if (layout.settingsFile) files.add(layout.settingsFile);
  }

  // The shared `.agents/skills` mirror lives outside every config dir, so it
  // needs backing up explicitly when a target that reads it is in play.
  if (readsAgentsSkills([...effectiveTargets])) dirs.add(AGENTS_SKILLS_DIR);

  const dirList = [...dirs];
  // A file already inside a backed-up directory tree is covered by that copy;
  // list only the ones that aren't (root files + nested config like .vscode/).
  const fileList = [...files].filter(
    f => !f.includes('..') && !dirList.some(d => f === d || f.startsWith(`${d}/`))
  );
  return { dirs: dirList, files: fileList };
}

