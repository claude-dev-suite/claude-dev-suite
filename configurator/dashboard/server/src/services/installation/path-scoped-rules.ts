// SPDX-License-Identifier: MIT
/**
 * Per-target path-scoped rule writing.
 *
 * Category-scoped agent routing ("for files matching these globs, prefer these
 * agents") is written in each assistant's own rule format and directory. The
 * *content* differs per target (see targets/writers/path-scoped-rules.writer.ts);
 * the *selection* — which categories, which globs, which agents — is identical,
 * and computed once here.
 *
 * Targets with no glob mechanism (Codex, Gemini, Kimi Code — reference doc
 * section 2.4) get no writer and are skipped: their adapters degrade rather than
 * emit something.
 */

import * as fs from 'fs';
import type { Agent } from '../../types.js';
import { getCategoryPaths, isAlwaysOnCategory } from './category-paths.js';
import { targetPaths } from '../targets/target-paths.js';
import { writeManagedFile } from './managed-file.js';
import { getTargetLayout, type TargetId } from '../targets/target-layout.js';
import {
  claudeCodeRule,
  copilotInstructionsRule,
  cursorMdcRule,
  clineRule,
  type PathScopedRuleSpec,
} from '../targets/writers/path-scoped-rules.writer.js';

/** Serializer for each target that supports glob-scoped rules. */
const RULE_WRITERS: Partial<Record<TargetId, (spec: PathScopedRuleSpec) => string>> = {
  'claude-code': claudeCodeRule,
  copilot: copilotInstructionsRule,
  cursor: cursorMdcRule,
  cline: clineRule,
};

/**
 * True when this target has a path-scoped rule format dev-suite can write.
 *
 * Derived from the layout capability, which is the single declaration of this
 * fact. It used to be `target in RULE_WRITERS`, so the same capability was
 * encoded twice — in the descriptor and in this map — and the two agreed only
 * by discipline. `writePathScopedRules` still looks the writer up in
 * RULE_WRITERS, and the consistency of the two is now asserted by a test rather
 * than assumed.
 */
export function supportsPathScopedRules(target: TargetId): boolean {
  try {
    return getTargetLayout(target).capabilities.pathScopedRules;
  } catch {
    return false;
  }
}

/** Exposed so a test can assert RULE_WRITERS and the capability never diverge. */
export function targetsWithRuleWriters(): TargetId[] {
  return Object.keys(RULE_WRITERS) as TargetId[];
}

/**
 * Group installed agents into the path-scoped rule specs to write. Always-on
 * categories (security, core, …) are excluded — they belong in the shared
 * instructions section, not a glob-scoped rule. Categories without a configured
 * glob set are skipped.
 */
export function computePathScopedRuleSpecs(installedAgents: Agent[]): PathScopedRuleSpec[] {
  const byCategory = new Map<string, Agent[]>();
  for (const agent of installedAgents) {
    const cat = agent.category as string;
    if (isAlwaysOnCategory(cat)) continue;
    const bucket = byCategory.get(cat) ?? [];
    bucket.push(agent);
    byCategory.set(cat, bucket);
  }

  const specs: PathScopedRuleSpec[] = [];
  for (const [category, agents] of byCategory) {
    const globs = getCategoryPaths(category);
    if (!globs || globs.length === 0) continue;
    specs.push({
      category,
      globs,
      agents: agents.map(a => ({ id: a.id, description: a.description })),
    });
  }
  return specs;
}

/**
 * Write path-scoped rule files for one target.
 *
 * `written` are the files this run produced; `drifted` are files that changed
 * since dev-suite wrote them and were therefore left alone (backed up first).
 *
 * The distinction matters beyond reporting: the caller prunes any previously
 * recorded rule file that is not in `installedRuleFiles`, so dropping a drifted
 * file from the result made the very run that refused to overwrite it delete it
 * instead. Both lists belong in the manifest; only `written` may be recorded at
 * its current content.
 */
export function writePathScopedRules(
  target: TargetId,
  installedAgents: Agent[],
  projectPath: string,
  previouslyManaged: ReadonlySet<string> = new Set(),
  drift?: {
    previousHashes?: ReadonlyMap<string, string>;
    sectionHashes?: ReadonlyMap<string, string>;
    acknowledgedHashes?: ReadonlyMap<string, string>;
  }
): { written: string[]; drifted: string[] } {
  const writer = RULE_WRITERS[target];
  if (!writer) return { written: [], drifted: [] };

  const paths = targetPaths(projectPath, target);
  fs.mkdirSync(paths.rulesDir, { recursive: true });

  const written: string[] = [];
  const drifted: string[] = [];
  for (const spec of computePathScopedRuleSpecs(installedAgents)) {
    const relPath = paths.relRuleFile(spec.category);
    // A rule file the user wrote in the same directory is not ours to replace;
    // only a file the previous install recorded gets regenerated.
    const outcome = writeManagedFile({
      absPath: paths.abs(relPath),
      relPath,
      content: writer(spec),
      previouslyManaged,
      previousHashes: drift?.previousHashes,
      sectionHashes: drift?.sectionHashes,
      acknowledgedHashes: drift?.acknowledgedHashes,
      projectPath,
    });
    // 'drifted': the file changed since we wrote it and was left in place, with
    // a copy in .dev-suite-backup/drift/. It is still ours and still installed,
    // so it must survive the stale-file prune — but it is not recorded at this
    // content, or the next scan would call the edit clean.
    if (outcome === 'drifted') {
      drifted.push(relPath);
      continue;
    }
    // 'preserved': never ours to begin with. Not written, not tracked, not pruned.
    if (outcome === 'preserved') continue;
    written.push(relPath);
  }
  return { written, drifted };
}
