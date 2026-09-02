// SPDX-License-Identifier: MIT
/**
 * Cline Target Adapter (VS Code extension)
 *
 * Cline reads `AGENTS.md` and the `.claude/skills` substrate directly, so
 * instructions and skills already reach it. This adapter writes the one thing
 * left: path-scoped rules to `.clinerules/*.md` (`paths:` YAML frontmatter, a
 * tool-neutral body — Cline has no Task-tool delegation).
 *
 * Selected rule templates have no Cline equivalent and are reported as skipped
 * when the user picked any. Two further capabilities are reported as skipped,
 * and are *permanent* gaps rather than unfinished work:
 *  - **MCP** — Cline's MCP config is user-global only; there is nothing
 *    committable to a project (reference doc section 3.7).
 *  - **agents** — file-based agents apply only to Cline's SDK/CLI, not the VS
 *    Code extension; routing rides in AGENTS.md.
 */

import { writePathScopedRules } from '../../installation/path-scoped-rules.js';
import { getTargetLayout, type TargetLayout } from '../target-layout.js';
import type {
  TargetAdapter,
  TargetWriteContext,
  TargetWriteResult,
  SkippedCapability,
} from '../target-adapter.js';

export class ClineAdapter implements TargetAdapter {
  readonly id = 'cline' as const;
  readonly layout: TargetLayout = getTargetLayout('cline');

  async write(ctx: TargetWriteContext): Promise<TargetWriteResult> {
    const { plan, manifest } = ctx;

    const installedAgents = plan.agentCatalog.filter(a => manifest.agents.includes(a.id));
    const ruleResult = writePathScopedRules('cline', installedAgents, plan.projectPath, plan.previouslyManaged, {
      previousHashes: plan.previousFileHashes,
      sectionHashes: plan.previousSectionHashes,
      acknowledgedHashes: plan.acknowledgedFileHashes,
    });

    const skipped: SkippedCapability[] = [
      {
        capability: 'mcp',
        reason: 'Cline MCP config is user-global only; there is no committable project-level MCP file',
      },
      {
        capability: 'agents',
        reason: 'file-based agents apply to Cline\'s SDK/CLI, not the VS Code extension; routing is in AGENTS.md',
      },
    ];

    if (plan.rules.length > 0) {
      skipped.push({
        capability: 'rule-templates',
        reason: 'Cline has no equivalent to Claude Code rule templates, so the selected rule templates were not written. (Agent routing is unaffected — path-scoped rules are still written to .clinerules/.)',
      });
    }

    return { ruleFiles: [...ruleResult.written, ...ruleResult.drifted], driftedRuleFiles: ruleResult.drifted, validatorHookConfigured: false, skipped };
  }
}
