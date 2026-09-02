// SPDX-License-Identifier: MIT
/**
 * Drift detection for dev-suite-managed files.
 *
 * `project-lock.ts` serialises the dashboard's own writes, but nothing locks a
 * project against the outside world. A fan-out of concurrent agents editing the
 * same repository will happily rewrite `.claude/agents/*.md` or the generated
 * section of `AGENTS.md`, and the next `install()` replaced those edits in
 * silence: ownership was decided by *path membership* in the previous manifest,
 * never by content. This service is the missing read side — it answers "what
 * changed under us?" without writing anything.
 *
 * Two rules make the answer decidable rather than a guess:
 *
 *  1. **Compare the right span.** A file carrying the
 *     `DEV-SUITE-CONFIG-START/END` markers is only *partly* ours. Its whole-file
 *     hash changes whenever the user adds a paragraph of their own, so it can
 *     only produce noise. The marked span is hashed instead, after normalising
 *     CRLF and the trailing newline — Windows is a primary platform, and a
 *     checkout with `core.autocrlf=true` must not read as drift.
 *  2. **Ask a decidable question.** Nothing on disk records *who* wrote a file.
 *     But "did a human adopt this content?" is answerable: a `promote` decision
 *     stores the hash in `acknowledgedHash`, and a match means settled.
 *
 * Anything with no baseline (a manifest predating `sectionHash`, a directory
 * entry with no hash) is reported as `unknown-baseline` and NEVER as drift —
 * the first run after an upgrade must not raise a wall of false alarms.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getLogger } from '../../utils/logger.js';
import { getDevSuiteDir } from '../../utils/dev-suite-dir.js';
import { calculateFileHash } from './file-operations.js';
import { validatePathWithinBase } from './security-helpers.js';
import type { ExtendedManifest, TrackedFile } from '../../types/upgrade.js';
import type {
  DriftCounts,
  DriftDiff,
  DriftEntry,
  DriftFileType,
  DriftReport,
  DriftScope,
  DriftStatus,
} from '../../types/drift.js';

const logger = getLogger('DriftService');

/** Sentinel recorded as `currentHash` for a tracked file that is gone. */
export const DELETED_HASH = '(deleted)';

/**
 * Section markers, duplicated from `claude-md.service.ts` on purpose.
 *
 * `manifest-tracking.ts` imports this module, and `claude-md.service.ts`
 * transitively imports `manifest-tracking.ts` — importing the constants would
 * close an ESM cycle for two string literals. The values are part of every
 * installed `AGENTS.md` on disk, so they cannot change without a migration
 * anyway.
 */
const DEV_SUITE_START_MARKER = '<!-- DEV-SUITE-CONFIG-START -->';
const DEV_SUITE_END_MARKER = '<!-- DEV-SUITE-CONFIG-END -->';

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

/**
 * Normalise line endings and the trailing newline before hashing.
 *
 * Without this a Windows checkout (`core.autocrlf=true`), an editor that
 * rewrites line endings, or a writer that appends a final newline all read as
 * drift, which would make the whole report untrustworthy within a day.
 */
export function normalizeForHash(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\n+$/, '');
}

/**
 * Hash of the span between the dev-suite markers, or null when the file carries
 * no complete marked section.
 *
 * Returning null (rather than falling back to the whole file) is deliberate:
 * "this file has no managed section" and "the managed section is unchanged" are
 * different answers and the caller must not conflate them.
 */
export function computeSectionHash(content: string): string | null {
  const startIdx = content.indexOf(DEV_SUITE_START_MARKER);
  if (startIdx === -1) return null;
  const endIdx = content.indexOf(DEV_SUITE_END_MARKER, startIdx);
  if (endIdx === -1) return null;
  const section = content.substring(startIdx, endIdx + DEV_SUITE_END_MARKER.length);
  return calculateFileHash(normalizeForHash(section));
}

/**
 * Whole-file hashes for the same content under each line-ending convention.
 *
 * The manifest's `hash` is a *raw* SHA256 of the file as written, and it must
 * stay that way — the upgrade engine's conflict detector compares against it.
 * So instead of normalising the baseline (impossible, it is already recorded)
 * we widen the current side: a file whose only change is CRLF↔LF still matches
 * one of these three, and does not read as drift on a Windows checkout with
 * `core.autocrlf=true`.
 */
export function contentHashVariants(content: string): { raw: string; lf: string; crlf: string } {
  const lf = content.replace(/\r\n/g, '\n');
  return {
    raw: calculateFileHash(content),
    lf: calculateFileHash(lf),
    crlf: calculateFileHash(lf.replace(/\n/g, '\r\n')),
  };
}

/** True when `hash` is the whole-file hash of `content` under any line-ending convention. */
export function matchesAnyLineEnding(content: string, hash: string | undefined): boolean {
  if (!hash) return false;
  const v = contentHashVariants(content);
  return hash === v.raw || hash === v.lf || hash === v.crlf;
}

/**
 * The hash a drift verdict compares, plus the span it covers.
 *
 * A marked file is judged on its section (both sides normalised, so the
 * comparison is exact); everything else on the whole file.
 */
/**
 * Files dev-suite merges into rather than owns.
 *
 * Kept as a path list rather than derived from the target layout so this module
 * stays dependency-free — the same reason its marker constants are duplicated
 * here. `sharedConfigsFor()` in uninstall.ts is the other half of the same idea
 * and must list the same paths; the test asserts they agree.
 */
const MERGED_FILES = new Set([
  '.mcp.json',
  '.claude/settings.json',
  '.vscode/mcp.json',
  '.github/mcp.json',
  '.cursor/mcp.json',
  '.gemini/settings.json',
  '.kimi-code/mcp.json',
  '.codex/config.toml',
]);

/** True for a file dev-suite owns only some keys of. */
export function isMergedFile(relPath: string): boolean {
  return MERGED_FILES.has(toPosix(relPath));
}

export function comparisonHashOf(content: string): { hash: string; scope: DriftScope } {
  const section = computeSectionHash(content);
  if (section !== null) return { hash: section, scope: 'managed-section' };
  return { hash: calculateFileHash(content), scope: 'file' };
}

// ---------------------------------------------------------------------------
// stat cache
// ---------------------------------------------------------------------------

interface CacheEntry {
  mtimeMs: number;
  size: number;
  /** SHA256 of the bytes as written — directly comparable to `TrackedFile.hash`. */
  wholeHash: string;
  /** The same content hashed as LF-only and as CRLF, for line-ending tolerance. */
  wholeHashLf: string;
  wholeHashCrlf: string;
  /** Hash of the marked span (normalised), or null when the file has no markers. */
  sectionHash: string | null;
}

/**
 * mtime+size cache, because the dashboard may poll this on every refresh and a
 * full install tracks hundreds of files. A stat is orders of magnitude cheaper
 * than a read plus two SHA256 passes, and mtime+size is the same heuristic
 * every build tool uses for the same reason.
 */
const statCache = new Map<string, CacheEntry>();

/** Drop cached hashes (tests, and after a write that invalidates the project). */
export function clearDriftCache(): void {
  statCache.clear();
}

function hashesFor(absPath: string): CacheEntry | null {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(absPath);
  } catch {
    statCache.delete(absPath);
    return null;
  }
  if (!stat.isFile()) return null;

  const cached = statCache.get(absPath);
  if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) return cached;

  let content: string;
  try {
    content = fs.readFileSync(absPath, 'utf-8');
  } catch (error: unknown) {
    logger.warn('Could not read a tracked file while scanning for drift', {
      error,
      context: { path: absPath },
    });
    return null;
  }

  const variants = contentHashVariants(content);
  const entry: CacheEntry = {
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    wholeHash: variants.raw,
    wholeHashLf: variants.lf,
    wholeHashCrlf: variants.crlf,
    sectionHash: computeSectionHash(content),
  };
  statCache.set(absPath, entry);
  return entry;
}

// ---------------------------------------------------------------------------
// Scan
// ---------------------------------------------------------------------------

const EMPTY_COUNTS = (): DriftCounts => ({
  scanned: 0,
  drifted: 0,
  driftedOutsideSection: 0,
  acknowledged: 0,
  deleted: 0,
  unknownBaseline: 0,
  unmodified: 0,
});

function toPosix(rel: string): string {
  return rel.split(path.sep).join('/');
}

/**
 * Resolve a manifest-supplied relative path inside the project.
 *
 * The manifest is a file on disk that other tools (and agents) can edit, so its
 * paths are untrusted input: a `../` entry must not make this service read
 * outside the project.
 */
function safeJoin(projectPath: string, rel: string): string | null {
  try {
    return validatePathWithinBase(path.join(projectPath, rel), projectPath);
  } catch {
    logger.warn('Refused a manifest path that escapes the project', { context: { path: rel } });
    return null;
  }
}

/** Classify one tracked file. Returns null for entries that carry no baseline at all. */
function classifyFile(projectPath: string, file: TrackedFile): DriftEntry | null {
  const rel = toPosix(file.path);
  const abs = safeJoin(projectPath, rel);
  if (!abs) return null;

  // A merged file has no baseline that survives a legitimate user edit, so it is
  // reported for visibility and never raised as drift. Judging it would need the
  // merge re-run, not a hash.
  if (isMergedFile(rel)) {
    const merged = hashesFor(abs);
    return {
      path: rel,
      type: file.type as DriftFileType,
      target: file.target,
      source: file.source,
      status: fs.existsSync(abs) ? 'unknown-baseline' : 'deleted',
      scope: 'merged',
      baselineHash: '',
      currentHash: merged ? merged.wholeHash : DELETED_HASH,
      acknowledged: false,
    };
  }

  const base: Omit<DriftEntry, 'status' | 'scope' | 'baselineHash' | 'currentHash' | 'acknowledged'> = {
    path: rel,
    type: file.type as DriftFileType,
    target: file.target,
    source: file.source,
  };

  // Directory entries are tracked with an empty hash on purpose (a skill dir is
  // rebuilt wholesale, never merged) — there is nothing to compare.
  const isDirEntry = !file.hash && !file.sectionHash;

  if (!fs.existsSync(abs)) {
    // A deleted directory entry is still worth reporting: the install promised
    // it and it is gone.
    return {
      ...base,
      status: 'deleted',
      scope: file.sectionHash ? 'managed-section' : 'file',
      baselineHash: file.sectionHash ?? file.hash ?? '',
      currentHash: DELETED_HASH,
      acknowledged: false,
    };
  }

  const hashes = hashesFor(abs);
  if (!hashes) return null; // a directory, or unreadable — nothing to judge

  if (isDirEntry) {
    return {
      ...base,
      status: 'unknown-baseline',
      scope: 'file',
      baselineHash: '',
      currentHash: hashes.wholeHash,
      acknowledged: false,
    };
  }

  const marked = hashes.sectionHash !== null;
  const scope: DriftScope = marked ? 'managed-section' : 'file';
  const currentHash = marked ? (hashes.sectionHash as string) : hashes.wholeHash;
  const baselineHash = marked ? file.sectionHash : file.hash;

  /** Line-ending-tolerant match against a whole-file baseline. */
  const wholeFileMatches = (hash: string | undefined): boolean =>
    !!hash &&
    (hash === hashes.wholeHash || hash === hashes.wholeHashLf || hash === hashes.wholeHashCrlf);

  // No baseline for this span: a manifest written before `sectionHash` existed
  // has a whole-file `hash` that says nothing about our section. Report it,
  // never flag it — the field fills itself on the next write, so a project that
  // upgrades into this feature sees zero false alarms on its first scan.
  if (!baselineHash) {
    return {
      ...base,
      status: 'unknown-baseline',
      scope,
      baselineHash: '',
      currentHash,
      acknowledged: false,
    };
  }

  const managedMatches = marked ? currentHash === baselineHash : wholeFileMatches(baselineHash);

  if (managedMatches) {
    // Our span matches. For a marked file the rest of it may still have
    // changed — that is the user's own prose around our section, which is
    // exactly what the markers exist to protect, so it is reported and never
    // treated as actionable.
    const status: DriftStatus =
      marked && file.hash && !wholeFileMatches(file.hash) ? 'drift-outside-section' : 'unmodified';
    return { ...base, status, scope, baselineHash, currentHash, acknowledged: false };
  }

  const ratified = marked
    ? file.acknowledgedHash === currentHash
    : wholeFileMatches(file.acknowledgedHash);
  if (ratified) {
    return {
      ...base,
      status: 'acknowledged',
      scope,
      baselineHash,
      currentHash,
      acknowledged: true,
      acknowledgedAt: file.acknowledgedAt,
    };
  }

  return { ...base, status: 'drift-in-section', scope, baselineHash, currentHash, acknowledged: false };
}

/**
 * Scan every tracked file and classify it.
 *
 * Read-only and repeatable: safe to call on a poll, and safe to call while
 * another process is mid-write (a torn read produces a hash mismatch, i.e. a
 * drift report, never a mutation).
 */
export function scanDrift(projectPath: string, manifest: ExtendedManifest | null): DriftReport {
  const scannedAt = new Date().toISOString();
  const counts = EMPTY_COUNTS();

  if (!manifest) {
    return {
      projectPath,
      scannedAt,
      hasManifest: false,
      files: [],
      drifted: [],
      acknowledged: [],
      deleted: [],
      hasActionableDrift: false,
      counts,
    };
  }

  const files: DriftEntry[] = [];
  for (const file of manifest.files ?? []) {
    if (!file || typeof file.path !== 'string') continue;
    const entry = classifyFile(projectPath, file);
    if (!entry) continue;
    files.push(entry);
    counts.scanned++;
    switch (entry.status) {
      case 'drift-in-section':
        counts.drifted++;
        break;
      case 'drift-outside-section':
        counts.driftedOutsideSection++;
        break;
      case 'acknowledged':
        counts.acknowledged++;
        break;
      case 'deleted':
        counts.deleted++;
        break;
      case 'unknown-baseline':
        counts.unknownBaseline++;
        break;
      default:
        counts.unmodified++;
    }
  }

  const drifted = files.filter(f => f.status === 'drift-in-section');

  return {
    projectPath,
    scannedAt,
    hasManifest: true,
    files,
    drifted,
    acknowledged: files.filter(f => f.status === 'acknowledged'),
    deleted: files.filter(f => f.status === 'deleted'),
    hasActionableDrift: drifted.length > 0,
    counts,
  };
}

// ---------------------------------------------------------------------------
// Diff
// ---------------------------------------------------------------------------

/**
 * Read-only diff for one tracked file.
 *
 * The canonical side is read back from `TrackedFile.source` in the dev-suite
 * catalog rather than stored anywhere: putting file content in the manifest
 * would double every install's footprint and immediately go stale against the
 * catalog it claims to mirror. Files with no `source` (generated instructions,
 * merged config) have no canonical side, and say so.
 */
export function readDriftDiff(
  projectPath: string,
  manifest: ExtendedManifest | null,
  relPath: string
): DriftDiff {
  const rel = toPosix(relPath);
  const file = (manifest?.files ?? []).find(f => toPosix(f.path) === rel);

  if (!file) {
    // Nothing is read for a path we do not track: this endpoint compares our
    // own output against what is on disk, and a file outside the manifest is
    // not our output. Returning its contents made it a general-purpose reader
    // for anything inside the project.
    return {
      path: rel,
      current: null,
      canonical: null,
      canonicalUnavailableReason: 'This file is not tracked in the manifest.',
    };
  }

  const abs = safeJoin(projectPath, rel);
  let current: string | null = null;
  if (abs && fs.existsSync(abs)) {
    try {
      current = fs.readFileSync(abs, 'utf-8');
    } catch {
      current = null;
    }
  }

  const entry = classifyFile(projectPath, file) ?? undefined;
  if (!file.source) {
    return {
      path: rel,
      current,
      canonical: null,
      canonicalUnavailableReason:
        'No catalog source: this file is generated or merged, so there is no single canonical version to show.',
      entry,
    };
  }

  // `source` also comes from the manifest, so it is untrusted: keep it inside
  // the dev-suite catalog root.
  let canonical: string | null = null;
  let reason: string | undefined;
  try {
    const devSuiteDir = getDevSuiteDir();
    const sourceAbs = path.isAbsolute(file.source)
      ? validatePathWithinBase(file.source, devSuiteDir)
      : validatePathWithinBase(path.join(devSuiteDir, file.source), devSuiteDir);
    canonical = fs.existsSync(sourceAbs) ? fs.readFileSync(sourceAbs, 'utf-8') : null;
    if (canonical === null) reason = `Catalog source no longer exists: ${file.source}`;
  } catch (error: unknown) {
    reason = error instanceof Error ? error.message : String(error);
  }

  return {
    path: rel,
    current,
    canonical,
    canonicalSource: file.source,
    canonicalUnavailableReason: canonical === null ? reason : undefined,
    entry,
  };
}
