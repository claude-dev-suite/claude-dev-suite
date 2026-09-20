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

import * as fs from 'fs';
import * as path from 'path';
import { getLogger } from '../../../utils/logger.js';
import type { InstallManifest } from '../../../types.js';
import { validatePathWithinBase } from '../../installation/security-helpers.js';
import { cursorRuleTemplate } from '../writers/rule-template.writer.js';
import type { TargetPaths } from '../target-paths.js';
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


const logger = getLogger('CursorAdapter');

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

    const templateFiles = await this.installRuleTemplates(plan.rules, paths, manifest, projectPath);

    skipped.push({
      capability: 'settings',
      kind: 'limitation',
      reason:
        'Cursor has no project-level settings file. Nothing is lost here: the settings dev-suite writes for Claude Code carry the validator hook and a skill-listing budget, and Cursor has neither mechanism',
    });

    return {
      ruleFiles: [...ruleResult.written, ...ruleResult.drifted, ...templateFiles],
      driftedRuleFiles: ruleResult.drifted,
      validatorHookConfigured: false,
      skipped,
    };
  }

  /**
   * Write the selected rule templates as always-applied `.cursor/rules/*.mdc`.
   *
   * Mirrors `ClaudeCodeAdapter.installRules`, including its two guards: an id is
   * validated by `findRuleFile` and the destination is bounds-checked anyway,
   * because the path is built by interpolation and a rule id can arrive from the
   * project's own `.dev-suite.json` during a Sync.
   */
  private async installRuleTemplates(
    rules: string[],
    paths: TargetPaths,
    manifest: InstallManifest,
    projectPath: string
  ): Promise<string[]> {
    if (rules.length === 0) return [];

    fs.mkdirSync(paths.rulesDir, { recursive: true });
    const { RulesService } = await import('../../rules.service.js');
    const rulesService = new RulesService();
    const written: string[] = [];

    for (const ruleId of rules) {
      const src = rulesService.findRuleFile(ruleId);
      if (!src) {
        logger.warn('Skipped unknown or unsafe rule id', { context: { ruleId, target: this.id } });
        continue;
      }
      let dest: string;
      try {
        dest = validatePathWithinBase(paths.ruleFile(ruleId), paths.rulesDir, false);
      } catch {
        logger.warn('Refused a rule whose destination escapes the rules directory', {
          context: { ruleId, target: this.id },
        });
        continue;
      }

      fs.writeFileSync(dest, cursorRuleTemplate(fs.readFileSync(src, 'utf-8'), ruleId), 'utf-8');

      const rel = path.relative(projectPath, dest).split(path.sep).join('/');
      // Returned in `ruleFiles`, which installation.service.ts records with this
      // adapter's target id — the same route `writePathScopedRules` output takes.
      // Tracking it here as well would double-record it.
      written.push(rel);
      if (!manifest.rules.includes(ruleId)) manifest.rules.push(ruleId);
    }

    return written;
  }
}
