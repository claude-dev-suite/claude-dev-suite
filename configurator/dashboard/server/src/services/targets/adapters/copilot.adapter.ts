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

import { getLogger } from '../../../utils/logger.js';
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
const COPILOT_CLI_MCP_FILE = '.github/mcp.json';

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
    const ruleFiles = writePathScopedRules('copilot', installedAgents, projectPath);

    if (plan.rules.length > 0) {
      skipped.push({
        capability: 'rule-templates',
        reason: 'Copilot has no equivalent to Claude Code rule templates; selected rules were not written for Copilot',
      });
    }
    skipped.push({ capability: 'settings', reason: 'no project-level settings file is written for Copilot' });
    // VS Code discovers agent definitions from the shared `.claude/agents`
    // substrate, but the Copilot CLI reads only `.github/agents/*.agent.md`,
    // which dev-suite does not generate — CLI users get routing via AGENTS.md.
    skipped.push({
      capability: 'agents',
      reason: 'agent definitions reach Copilot in VS Code (it reads .claude/agents); the Copilot CLI reads only .github/agents/*.agent.md, which is not generated — CLI routing comes from AGENTS.md',
    });

    return { ruleFiles, validatorHookConfigured: false, skipped };
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
          reason: `${relPath} exists but is not valid JSON; left untouched`,
        });
        return;
      }
      throw error;
    }
  }
}
