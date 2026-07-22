// SPDX-License-Identifier: MIT
/**
 * OpenAI Codex CLI Target Adapter
 *
 * Codex reads `AGENTS.md` natively and skills from the shared `.agents/skills`
 * mirror (written by the substrate), so instructions and skills already reach it
 * without this adapter. What's left is MCP config: `[mcp_servers.<name>]` tables
 * in `.codex/config.toml` (TOML, merged so the user's config and comments
 * survive — see codex-toml.writer.ts).
 *
 * Two caveats are surfaced as skipped/advisory entries: project-scoped `.codex/`
 * config (including MCP) only applies in a *trusted* project, and dev-suite does
 * not yet generate native Codex agent-role TOML (routing rides in AGENTS.md).
 */

import { getLogger } from '../../../utils/logger.js';
import {
  writeMcpConfigFile,
  readExistingConfig,
} from '../../installation/mcp-config-file.js';
import { writeCodexTomlMcp } from '../writers/codex-toml.writer.js';
import { getTargetLayout, type TargetLayout } from '../target-layout.js';
import type {
  TargetAdapter,
  TargetWriteContext,
  TargetWriteResult,
  SkippedCapability,
} from '../target-adapter.js';

const logger = getLogger('CodexAdapter');

export class CodexAdapter implements TargetAdapter {
  readonly id = 'codex' as const;
  readonly layout: TargetLayout = getTargetLayout('codex');

  async write(ctx: TargetWriteContext): Promise<TargetWriteResult> {
    const { plan, paths, manifest, extendedManifest } = ctx;
    const { projectPath } = plan;
    const skipped: SkippedCapability[] = [];

    const relConfig = paths.relMcpConfigFile; // .codex/config.toml
    const content = writeCodexTomlMcp(ctx.mcpServers, {
      existing: readExistingConfig(projectPath, relConfig),
      previouslyManaged: plan.mcpCatalog,
    });
    writeMcpConfigFile({ projectPath, relPath: relConfig, content, target: this.id, manifest, extendedManifest });
    logger.info('Wrote Codex MCP config', { context: { relConfig, servers: Object.keys(ctx.mcpServers).length } });

    // Advisory: Codex ignores project-scoped .codex/ config in an untrusted
    // project, so the MCP servers won't load until the folder is trusted.
    skipped.push({
      capability: 'mcp-trust',
      reason: 'Codex only loads project MCP config in a trusted project — run `codex` in this folder and trust it',
    });
    skipped.push({
      capability: 'agents',
      reason: 'native Codex agent-role TOML is not generated yet; agent routing is in AGENTS.md',
    });

    return { ruleFiles: [], validatorHookConfigured: false, skipped };
  }
}
