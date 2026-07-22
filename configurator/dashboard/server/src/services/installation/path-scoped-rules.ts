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
 * Targets with no glob mechanism (Codex, Gemini — reference doc section 2.4) get
 * no writer and are skipped: their adapters degrade rather than emit something.
 */

import * as fs from 'fs';
import type { Agent } from '../../types.js';
import { getCategoryPaths, isAlwaysOnCategory } from './category-paths.js';
import { targetPaths } from '../targets/target-paths.js';
import type { TargetId } from '../targets/target-layout.js';
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

/** True when this target has a path-scoped rule format dev-suite can write. */
export function supportsPathScopedRules(target: TargetId): boolean {
  return target in RULE_WRITERS;
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
 * Write path-scoped rule files for one target and return their project-relative
 * paths (for the manifest's `installedRuleFiles`). A target without a rule
 * writer produces nothing.
 */
export function writePathScopedRules(
  target: TargetId,
  installedAgents: Agent[],
  projectPath: string
): string[] {
  const writer = RULE_WRITERS[target];
  if (!writer) return [];

  const paths = targetPaths(projectPath, target);
  fs.mkdirSync(paths.rulesDir, { recursive: true });

  const written: string[] = [];
  for (const spec of computePathScopedRuleSpecs(installedAgents)) {
    const relPath = paths.relRuleFile(spec.category);
    fs.writeFileSync(paths.abs(relPath), writer(spec), 'utf-8');
    written.push(relPath);
  }
  return written;
}
