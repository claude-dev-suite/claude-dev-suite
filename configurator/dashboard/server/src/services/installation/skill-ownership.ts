// SPDX-License-Identifier: MIT
/**
 * Ownership marking for installed skill directories.
 *
 * `cleanStaleSkills` used to infer ownership from "this directory contains a
 * SKILL.md somewhere", which is true of any skill — including one the user
 * wrote. Re-installing therefore deleted `.claude/skills/my-house-style/`, and
 * the same rule ran over `.agents/skills`, the cross-tool location that Codex,
 * Gemini, Kimi and Copilot all read and that other tools legitimately write to.
 *
 * Ownership is now explicit: dev-suite drops a sentinel file into every skill
 * directory it materialises, and only sentinel-bearing directories are ever
 * removed. A dot-file is invisible to skill discovery in every assistant whose
 * format we support.
 *
 * Installs that predate the sentinel are recognised through the manifest: a
 * directory whose relative path is recorded there is ours even without one, so
 * upgrading does not strand a tree of stale skills.
 */

import * as fs from 'fs';
import * as path from 'path';

/** Marker file written into every dev-suite-materialised skill directory. */
export const SKILL_OWNERSHIP_SENTINEL = '.dev-suite-owned';

const SENTINEL_BODY = [
  '# Written by dev-suite.',
  '#',
  '# This directory was materialised by a dev-suite install and will be removed',
  '# by a re-install or uninstall. Delete this marker to adopt the directory as',
  '# your own — dev-suite will then leave it alone.',
  '',
].join('\n');

/** Mark a freshly copied skill directory as dev-suite's. Best effort. */
export function markSkillDirOwned(skillDir: string): void {
  try {
    fs.writeFileSync(path.join(skillDir, SKILL_OWNERSHIP_SENTINEL), SENTINEL_BODY);
  } catch {
    // A skill whose marker cannot be written is simply treated as the user's on
    // the next pass — the safe direction to fail in.
  }
}

/** True when dev-suite materialised this directory and may remove it. */
export function isOwnedSkillDir(skillDir: string): boolean {
  return fs.existsSync(path.join(skillDir, SKILL_OWNERSHIP_SENTINEL));
}

/**
 * Ownership check that also accepts directories recorded in a manifest written
 * before sentinels existed.
 *
 * `trackedSkillPaths` holds POSIX-relative paths as the manifest stores them
 * (e.g. `.claude/skills/languages-typescript`).
 */
export function isOwnedSkillDirOrTracked(
  skillDir: string,
  relPath: string,
  trackedSkillPaths: ReadonlySet<string>
): boolean {
  return isOwnedSkillDir(skillDir) || trackedSkillPaths.has(relPath.split(path.sep).join('/'));
}

/**
 * Skill directory paths recorded in an on-disk manifest, for the migration case
 * above. Accepts either manifest shape; unparseable input yields an empty set.
 */
export function trackedSkillPathsFrom(manifest: unknown): Set<string> {
  const out = new Set<string>();
  const files = (manifest as { files?: unknown })?.files;
  if (!Array.isArray(files)) return out;
  for (const file of files) {
    if (typeof file === 'string') continue;
    const entry = file as { path?: unknown; type?: unknown };
    if (entry.type !== 'skill' || typeof entry.path !== 'string') continue;
    out.add(entry.path.split(path.sep).join('/'));
  }
  return out;
}
