// SPDX-License-Identifier: MIT
/**
 * Manifest file tracking.
 *
 * Extracted from InstallationService so target adapters can record the files
 * they write without depending on the service that drives them.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ExtendedManifest, TrackedFile } from '../../types/index.js';
import { DEFAULT_TARGET, type TargetId } from '../targets/target-layout.js';
import { calculateFileHashFromPath } from './file-operations.js';
import { computeSectionHash } from './drift.service.js';

/**
 * Record a written file, with its hash, in the extended manifest.
 *
 * `target` records which assistant the file belongs to so erase and reinstall
 * stay scoped when several assistants share one project.
 *
 * Files that cannot be hashed (directories, or paths that no longer exist) are
 * silently skipped — this mirrors the pre-existing behaviour that skill
 * directories are not individually tracked.
 */
export function trackManifestFile(
  extendedManifest: ExtendedManifest,
  projectPath: string,
  relativePath: string,
  type: TrackedFile['type'],
  source?: string,
  target: TargetId = DEFAULT_TARGET,
  /**
   * Hash to record instead of the file's current content.
   *
   * Used for a file that drifted: it is still ours and must stay in the
   * manifest, but recording what is on disk now would silently adopt the very
   * edit we refused to overwrite, and the next scan would call it clean.
   * Keeping the baseline keeps it flagged until a human decides.
   */
  hashOverride?: string
): void {
  const fullPath = path.join(projectPath, relativePath);
  const hash = hashOverride ?? calculateFileHashFromPath(fullPath);

  if (hash) {
    // Files delimited by the dev-suite markers (`AGENTS.md`, `CLAUDE.md`) need
    // a baseline for OUR span alone: their whole-file hash changes whenever the
    // user edits their own prose, so it can never distinguish a legitimate edit
    // from an agent rewriting the generated section.
    const sectionHash = hashOverride ? null : sectionHashOf(fullPath);
    extendedManifest.files.push({
      path: relativePath,
      hash,
      type,
      source,
      target,
      ...(sectionHash ? { sectionHash } : {}),
    });
  }
}

/** Hash of the marked span, when the file has one. Null for every other file. */
function sectionHashOf(fullPath: string): string | null {
  try {
    return computeSectionHash(fs.readFileSync(fullPath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Carry a previous manifest's ratifications into a freshly built one.
 *
 * `install()` rebuilds the manifest from scratch on every run, so without this
 * every `promote` decision would be forgotten by the next install and the same
 * adopted content would be reported as drift again — turning a one-time
 * decision into a recurring prompt, which is how a warning becomes noise people
 * learn to ignore.
 *
 * Only `acknowledgedHash`/`acknowledgedAt` are carried; `hash` and
 * `sectionHash` stay canonical (what dev-suite just wrote), so the two
 * questions — "is this our output?" and "did a human adopt this?" — remain
 * separately answerable.
 */
export function carryForwardAcknowledgements(
  previousFiles: readonly TrackedFile[] | undefined,
  extendedManifest: ExtendedManifest
): void {
  if (!previousFiles || previousFiles.length === 0) return;
  const previous = new Map<string, TrackedFile>();
  for (const file of previousFiles) {
    if (file?.acknowledgedHash) previous.set(normalizeRel(file.path), file);
  }
  if (previous.size === 0) return;

  for (const file of extendedManifest.files) {
    const prior = previous.get(normalizeRel(file.path));
    if (!prior) continue;
    file.acknowledgedHash = prior.acknowledgedHash;
    file.acknowledgedAt = prior.acknowledgedAt;
  }
}

function normalizeRel(rel: string): string {
  return rel.split(path.sep).join('/');
}

/**
 * Record a directory dev-suite installed.
 *
 * `trackManifestFile` hashes the path and skips anything it cannot read, so a
 * directory raised EISDIR and was silently dropped — the manifest recorded zero
 * skill directories even though every install writes dozens, which is why the
 * `.agents/skills` mirror had no removal path.
 *
 * Directories carry no hash: drift detection is per-file, and a skill directory
 * is rebuilt wholesale rather than merged.
 */
export function trackManifestDir(
  extendedManifest: ExtendedManifest,
  relativePath: string,
  type: TrackedFile['type'],
  source?: string,
  target: TargetId = DEFAULT_TARGET
): void {
  extendedManifest.files.push({
    path: relativePath,
    hash: '',
    type,
    source,
    target,
  });
}
