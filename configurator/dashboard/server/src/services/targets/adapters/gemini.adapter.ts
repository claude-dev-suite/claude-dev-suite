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

import * as fs from 'fs';
import { getLogger } from '../../../utils/logger.js';
import type { Agent } from '../../../types.js';
import type { ExtendedManifest } from '../../../types/index.js';
import {
  writeMcpConfigFile,
  readExistingConfig,
} from '../../installation/mcp-config-file.js';
import { trackManifestFile } from '../../installation/manifest-tracking.js';
import { writeGeminiSettings } from '../writers/gemini-settings.writer.js';
import { toGeminiAgentContent } from '../writers/gemini-agent.writer.js';
import { McpConfigParseError } from '../writers/mcp-config.writer.js';
import { getTargetLayout, type TargetLayout } from '../target-layout.js';
import { validateAgentId, validatePathWithinBase } from '../../installation/index.js';
import type { TargetPaths } from '../target-paths.js';
import type { InstallManifest } from '../../../types.js';
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

    // Native Gemini subagents (`.gemini/agents/<id>.md`) — Gemini reads neither
    // `.claude/agents` nor the substrate, so this is the only path to `@`-agents.
    this.writeAgents(ctx, paths);

    if (plan.rules.length > 0) {
      skipped.push({
        capability: 'rule-templates',
        reason: 'Gemini has no glob-scoped rules; routing is carried in AGENTS.md instead',
      });
    }

    return { ruleFiles: [], validatorHookConfigured: false, skipped };
  }

  /**
   * Write one `.gemini/agents/<id>.md` per installed agent. Reads each agent's
   * source file for its role prose; skips (with a warning) any that can't be
   * read or has an unsafe id, rather than failing the whole install.
   */
  private writeAgents(ctx: TargetWriteContext, paths: TargetPaths): void {
    const { plan, manifest, extendedManifest } = ctx;
    const installed = new Set(manifest.agents);
    const agents: Agent[] = plan.agentCatalog.filter(a => installed.has(a.id));
    if (agents.length === 0) return;

    fs.mkdirSync(paths.agentsDir, { recursive: true });

    for (const agent of agents) {
      if (!validateAgentId(agent.id)) continue;
      let rawSource: string;
      try {
        rawSource = fs.readFileSync(agent.filePath, 'utf-8');
      } catch (error) {
        logger.warn('Could not read agent source for Gemini subagent — skipping', {
          error,
          context: { agentId: agent.id, filePath: agent.filePath },
        });
        continue;
      }

      const content = toGeminiAgentContent({ id: agent.id, description: agent.description, rawSource });
      const relPath = paths.relAgentFile(agent.id);
      const abs = validatePathWithinBase(paths.abs(relPath), plan.projectPath, false);
      fs.writeFileSync(abs, content, 'utf-8');
      this.track(manifest, extendedManifest, plan.projectPath, relPath, agent.filePath);
    }
  }

  private track(
    manifest: InstallManifest,
    extendedManifest: ExtendedManifest,
    projectPath: string,
    relPath: string,
    source: string
  ): void {
    manifest.files.push({ path: relPath, type: 'agent', source });
    trackManifestFile(extendedManifest, projectPath, relPath, 'agent', source, this.id);
  }
}
