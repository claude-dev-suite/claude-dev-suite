// SPDX-License-Identifier: MIT
/**
 * GitHub Copilot Target Adapter
 *
 * Copilot reads the shared `.claude/agents` and `.claude/skills` substrate
 * directly (installed by the service) and `AGENTS.md` natively (written by the
 * service), so this adapter only writes what is Copilot-specific:
 *  - **MCP config on both surfaces** — `.vscode/mcp.json` (VS Code, `servers`
 *    key, `type: "stdio"`) and `.github/mcp.json` (CLI, `mcpServers`,
 *    `type: "local"`). The two disagree on key *and* type, so they are separate
 *    files; see docs/ASSISTANT-FORMAT-REFERENCE.md section 2.5.
 *  - **Path-scoped rules** — `.github/instructions/*.instructions.md`.
 *
 * Both MCP files are merged into any content the user already has, never
 * overwritten. Settings and hooks are not written (reported as skipped).
 */

import * as fs from 'fs';
import * as path from 'path';
import { getLogger } from '../../../utils/logger.js';
import type { InstallManifest } from '../../../types.js';
import type { TargetPaths } from '../target-paths.js';
import { validatePathWithinBase } from '../../installation/security-helpers.js';
import { copilotRuleTemplate } from '../writers/rule-template.writer.js';
import { writePathScopedRules } from '../../installation/path-scoped-rules.js';
import {
  writeMcpConfigFile,
  readExistingConfig,
} from '../../installation/mcp-config-file.js';
import {
  writeVsCodeMcpConfig,
  writeCopilotCliMcpConfig,
  McpConfigParseError,
} from '../writers/mcp-config.writer.js';
import { getTargetLayout, type TargetLayout } from '../target-layout.js';
import type {
  TargetAdapter,
  TargetWriteContext,
  TargetWriteResult,
  SkippedCapability,
} from '../target-adapter.js';

const logger = getLogger('CopilotAdapter');

/**
 * Copilot CLI's project-level MCP file. Not in the layout descriptor because
 * the descriptor names one MCP file per target and Copilot has two surfaces;
 * this one lives under `.github`, so the reinstall backup covers it via the
 * config-dir tree (unlike `.vscode/mcp.json`, which needs explicit handling).
 */
/**
 * Copilot's CLI MCP surface, read from the layout descriptor.
 *
 * This was a module-local literal; the same path was also hardcoded in
 * gitignore.ts, install-recovery.ts and uninstall.ts. It now lives in exactly
 * one place — `COPILOT.extraMcpConfigFiles` — so the coverage gate can see it.
 */
const COPILOT_CLI_MCP_FILE =
  getTargetLayout('copilot').extraMcpConfigFiles?.[0] ?? '.github/mcp.json';

export class CopilotAdapter implements TargetAdapter {
  readonly id = 'copilot' as const;
  readonly layout: TargetLayout = getTargetLayout('copilot');

  async write(ctx: TargetWriteContext): Promise<TargetWriteResult> {
    const { plan, paths, manifest } = ctx;
    const { projectPath } = plan;
    const skipped: SkippedCapability[] = [];

    // VS Code surface: .vscode/mcp.json (outside .github, so backup handles it
    // specially — see reinstall managedSurfaces).
    this.writeMcp(
      ctx,
      paths.relMcpConfigFile,
      existing => writeVsCodeMcpConfig(ctx.mcpServers, { existing, previouslyManaged: plan.mcpCatalog, file: paths.relMcpConfigFile }),
      skipped
    );

    // CLI surface: .github/mcp.json (different key and type value).
    this.writeMcp(
      ctx,
      COPILOT_CLI_MCP_FILE,
      existing => writeCopilotCliMcpConfig(ctx.mcpServers, { existing, previouslyManaged: plan.mcpCatalog, file: COPILOT_CLI_MCP_FILE }),
      skipped
    );

    const installedAgents = plan.agentCatalog.filter(a => manifest.agents.includes(a.id));
    const ruleResult = writePathScopedRules('copilot', installedAgents, projectPath, plan.previouslyManaged, {
      previousHashes: plan.previousFileHashes,
      sectionHashes: plan.previousSectionHashes,
      acknowledgedHashes: plan.acknowledgedFileHashes,
    });

    const templateFiles = await this.installRuleTemplates(plan.rules, paths, manifest, projectPath);

    skipped.push({
      capability: 'settings',
      kind: 'limitation',
      reason:
        'Copilot has no project-level settings file. Nothing is lost here: the settings dev-suite writes for Claude Code carry the validator hook and a skill-listing budget, and Copilot has neither mechanism',
    });
    // VS Code discovers agent definitions from the shared `.claude/agents`
    // substrate, but the Copilot CLI reads only `.github/agents/*.agent.md`,
    // which dev-suite does not generate — CLI users get routing via AGENTS.md.
    skipped.push({
      capability: 'agents',
      kind: 'delivered-differently',
      reason: 'agent definitions reach Copilot in VS Code (it reads .claude/agents); the Copilot CLI reads only .github/agents/*.agent.md, which is not generated — CLI routing comes from AGENTS.md',
    });

    return {
      ruleFiles: [...ruleResult.written, ...ruleResult.drifted, ...templateFiles],
      driftedRuleFiles: ruleResult.drifted,
      validatorHookConfigured: false,
      skipped,
    };
  }

  /**
   * Render and write one MCP file, merging with existing content. A file that
   * already exists but cannot be parsed is left untouched and reported, rather
   * than overwritten — silently discarding a user's config is never right.
   */
  private writeMcp(
    ctx: TargetWriteContext,
    relPath: string,
    render: (existing: string | null) => string,
    skipped: SkippedCapability[]
  ): void {
    const { projectPath } = ctx.plan;
    try {
      const content = render(readExistingConfig(projectPath, relPath));
      writeMcpConfigFile({
        projectPath,
        relPath,
        content,
        target: this.id,
        manifest: ctx.manifest,
        extendedManifest: ctx.extendedManifest,
      });
    } catch (error) {
      if (error instanceof McpConfigParseError) {
        logger.warn('Existing MCP config is unparseable — left untouched', {
          error,
          context: { relPath },
        });
        skipped.push({
          capability: 'mcp',
          kind: 'action-required',
          reason: `${relPath} exists but is not valid JSON; left untouched`,
        });
        return;
      }
      throw error;
    }
  }


  /**
   * Write the selected rule templates as always-applied
   * `.github/instructions/<id>.instructions.md`.
   *
   * `applyTo: "**"` is the always-on form — see the Copilot section of
   * docs/ASSISTANT-FORMAT-REFERENCE.md. Mirrors `ClaudeCodeAdapter.installRules`
   * including its bounds check: a rule id can arrive from the project's own
   * `.dev-suite.json` during a Sync, and the destination is interpolated.
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

      fs.writeFileSync(dest, copilotRuleTemplate(fs.readFileSync(src, 'utf-8'), ruleId), 'utf-8');

      // Returned in `ruleFiles`; installation.service.ts records it with this
      // adapter's target id, the same route writePathScopedRules output takes.
      written.push(path.relative(projectPath, dest).split(path.sep).join('/'));
      if (!manifest.rules.includes(ruleId)) manifest.rules.push(ruleId);
    }

    return written;
  }
}
