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

import { getLogger } from '../../../utils/logger.js';
import { writePathScopedRules } from '../../installation/path-scoped-rules.js';
import {
  writeMcpConfigFile,
  readExistingConfig,
} from '../../installation/mcp-config-file.js';
import { writeCursorMcpConfig, McpConfigParseError } from '../writers/mcp-config.writer.js';
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
    try {
      const content = writeCursorMcpConfig(ctx.mcpServers, {
        existing: readExistingConfig(projectPath, relMcp),
        previouslyManaged: plan.mcpCatalog,
        file: relMcp,
      });
      writeMcpConfigFile({ projectPath, relPath: relMcp, content, target: this.id, manifest, extendedManifest });
    } catch (error) {
      if (error instanceof McpConfigParseError) {
        logger.warn('Existing .cursor/mcp.json is unparseable — left untouched', { error });
        skipped.push({ capability: 'mcp', reason: `${relMcp} exists but is not valid JSON; left untouched` });
      } else {
        throw error;
      }
    }

    const installedAgents = plan.agentCatalog.filter(a => manifest.agents.includes(a.id));
    const ruleFiles = writePathScopedRules('cursor', installedAgents, projectPath);

    if (plan.rules.length > 0) {
      skipped.push({
        capability: 'rule-templates',
        reason: 'Cursor has no equivalent to Claude Code rule templates; selected rules were not written for Cursor',
      });
    }
    skipped.push({ capability: 'settings', reason: 'no project-level settings file is written for Cursor' });

    return { ruleFiles, validatorHookConfigured: false, skipped };
  }
}
