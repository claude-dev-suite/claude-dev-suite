// SPDX-License-Identifier: MIT
/**
 * Cursor Target Adapter
 *
 * Cursor reads the shared `.claude/agents` and `.claude/skills` substrate
 * directly and `AGENTS.md` natively, so this adapter only writes:
 *  - **MCP config** — `.cursor/mcp.json` (`mcpServers`, `type: "stdio"`),
 *    merged with any servers the user already configured.
 *  - **Path-scoped rules** — `.cursor/rules/*.mdc` (`globs` as an unquoted
 *    comma-separated string; see docs/ASSISTANT-FORMAT-REFERENCE.md section 2.4).
 *
 * Settings and hooks are not written (reported as skipped).
 */

import { writePathScopedRules } from '../../installation/path-scoped-rules.js';
import { writeMergedMcpConfig } from '../../installation/mcp-config-file.js';
import { writeCursorMcpConfig } from '../writers/mcp-config.writer.js';
import { getTargetLayout, type TargetLayout } from '../target-layout.js';
import type {
  TargetAdapter,
  TargetWriteContext,
  TargetWriteResult,
  SkippedCapability,
} from '../target-adapter.js';


export class CursorAdapter implements TargetAdapter {
  readonly id = 'cursor' as const;
  readonly layout: TargetLayout = getTargetLayout('cursor');

  async write(ctx: TargetWriteContext): Promise<TargetWriteResult> {
    const { plan, paths, manifest, extendedManifest } = ctx;
    const { projectPath } = plan;
    const skipped: SkippedCapability[] = [];

    const relMcp = paths.relMcpConfigFile; // .cursor/mcp.json
    skipped.push(...writeMergedMcpConfig({
      projectPath,
      relPath: relMcp,
      target: this.id,
      manifest,
      extendedManifest,
      render: existing => writeCursorMcpConfig(ctx.mcpServers, {
        existing,
        previouslyManaged: plan.mcpCatalog,
        file: relMcp,
      }),
    }));

    const installedAgents = plan.agentCatalog.filter(a => manifest.agents.includes(a.id));
    const ruleResult = writePathScopedRules('cursor', installedAgents, projectPath, plan.previouslyManaged, {
      previousHashes: plan.previousFileHashes,
      sectionHashes: plan.previousSectionHashes,
      acknowledgedHashes: plan.acknowledgedFileHashes,
    });

    if (plan.rules.length > 0) {
      skipped.push({
        capability: 'rule-templates',
        reason: 'Cursor has no equivalent to Claude Code rule templates; selected rules were not written for Cursor',
      });
    }
    skipped.push({ capability: 'settings', reason: 'no project-level settings file is written for Cursor' });

    return { ruleFiles: [...ruleResult.written, ...ruleResult.drifted], driftedRuleFiles: ruleResult.drifted, validatorHookConfigured: false, skipped };
  }
}
