// SPDX-License-Identifier: MIT
/**
 * Gemini CLI Target Adapter
 *
 * Gemini reads skills from the shared `.agents/skills` directory (written by the
 * substrate), so this adapter writes only `.gemini/settings.json` — dev-suite's
 * MCP servers plus a `context.fileName` that makes Gemini read `AGENTS.md`
 * (which it does not read by default).
 *
 * Gemini has no glob-scoped rules, and dev-suite does not yet generate native
 * Gemini subagents, so routing rides in `AGENTS.md`; both are reported as
 * skipped capabilities.
 */

import { getLogger } from '../../../utils/logger.js';
import {
  writeMcpConfigFile,
  readExistingConfig,
} from '../../installation/mcp-config-file.js';
import { writeGeminiSettings } from '../writers/gemini-settings.writer.js';
import { McpConfigParseError } from '../writers/mcp-config.writer.js';
import { getTargetLayout, type TargetLayout } from '../target-layout.js';
import type {
  TargetAdapter,
  TargetWriteContext,
  TargetWriteResult,
  SkippedCapability,
} from '../target-adapter.js';

const logger = getLogger('GeminiAdapter');

export class GeminiAdapter implements TargetAdapter {
  readonly id = 'gemini' as const;
  readonly layout: TargetLayout = getTargetLayout('gemini');

  async write(ctx: TargetWriteContext): Promise<TargetWriteResult> {
    const { plan, paths, manifest, extendedManifest } = ctx;
    const { projectPath } = plan;
    const skipped: SkippedCapability[] = [];

    const relSettings = paths.relMcpConfigFile; // .gemini/settings.json
    try {
      const content = writeGeminiSettings(ctx.mcpServers, {
        existing: readExistingConfig(projectPath, relSettings),
        previouslyManaged: plan.mcpCatalog,
        file: relSettings,
      });
      writeMcpConfigFile({ projectPath, relPath: relSettings, content, target: this.id, manifest, extendedManifest });
    } catch (error) {
      if (error instanceof McpConfigParseError) {
        logger.warn('Existing .gemini/settings.json is unparseable — left untouched', { error });
        skipped.push({ capability: 'mcp', reason: `${relSettings} exists but is not valid JSON; left untouched` });
      } else {
        throw error;
      }
    }

    if (plan.rules.length > 0) {
      skipped.push({
        capability: 'rule-templates',
        reason: 'Gemini has no glob-scoped rules; routing is carried in AGENTS.md instead',
      });
    }
    skipped.push({
      capability: 'agents',
      reason: 'native Gemini subagents are not generated yet; agent routing is in AGENTS.md',
    });

    return { ruleFiles: [], validatorHookConfigured: false, skipped };
  }
}
