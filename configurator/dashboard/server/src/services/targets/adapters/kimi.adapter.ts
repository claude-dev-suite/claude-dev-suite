// SPDX-License-Identifier: MIT
/**
 * Kimi Code Target Adapter
 *
 * Kimi Code reads the root `AGENTS.md` natively and skills from the shared
 * `.agents/skills` mirror (written by the substrate), so instructions and skills
 * already reach it. Two surfaces are Kimi-specific and land here:
 * `.kimi-code/mcp.json` (merged, so the user's own servers survive) and native
 * subagents under `.kimi-code/agents/`.
 *
 * Kimi has no glob-scoped rules, so selected rule templates are reported as a
 * skipped capability. Its hooks and permissions live in the user's global
 * `~/.kimi-code/config.toml`, which an install never touches; there is no
 * project-level surface to skip, so nothing is reported for them.
 *
 * See docs/ASSISTANT-FORMAT-REFERENCE.md section 3.8, which is normative.
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
import { writeManagedFile, pruneOrphanedAgentFiles } from '../../installation/managed-file.js';
import {
  toKimiAgentContent,
  isReservedKimiAgentName,
  containsTemplatePlaceholder,
} from '../writers/kimi-agent.writer.js';
import { writeKimiMcpConfig, McpConfigParseError } from '../writers/mcp-config.writer.js';
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

const logger = getLogger('KimiAdapter');

export class KimiAdapter implements TargetAdapter {
  readonly id = 'kimi-code' as const;
  readonly layout: TargetLayout = getTargetLayout('kimi-code');

  async write(ctx: TargetWriteContext): Promise<TargetWriteResult> {
    const { plan, paths, manifest, extendedManifest } = ctx;
    const { projectPath } = plan;
    const skipped: SkippedCapability[] = [];

    const relConfig = paths.relMcpConfigFile; // .kimi-code/mcp.json
    try {
      const content = writeKimiMcpConfig(ctx.mcpServers, {
        existing: readExistingConfig(projectPath, relConfig),
        previouslyManaged: plan.mcpCatalog,
        file: relConfig,
      });
      writeMcpConfigFile({ projectPath, relPath: relConfig, content, target: this.id, manifest, extendedManifest });
      logger.info('Wrote Kimi MCP config', {
        context: { relConfig, servers: Object.keys(ctx.mcpServers).length },
      });
    } catch (error) {
      if (error instanceof McpConfigParseError) {
        logger.warn('Existing .kimi-code/mcp.json is unparseable — left untouched', { error });
        skipped.push({
          capability: 'mcp',
          reason: `${relConfig} exists but is not valid JSON; left untouched`,
        });
      } else {
        throw error;
      }
    }

    skipped.push(...this.writeAgents(ctx, paths));

    if (plan.rules.length > 0) {
      skipped.push({
        capability: 'rule-templates',
        reason: 'Kimi Code has no project-level rule mechanism, so the selected rule templates were not written. (Agent routing is unaffected — it rides in AGENTS.md, which Kimi reads.)',
      });
    }

    return { ruleFiles: [], validatorHookConfigured: false, skipped };
  }

  /**
   * Write one `.kimi-code/agents/<id>.md` per installed agent, and report what
   * could not be written safely. Kimi reads neither `.claude/agents` nor the
   * substrate, so these files are the only route to delegatable subagents.
   */
  private writeAgents(ctx: TargetWriteContext, paths: TargetPaths): SkippedCapability[] {
    const { plan, manifest, extendedManifest } = ctx;
    const installed = new Set(manifest.agents);
    const agents: Agent[] = plan.agentCatalog.filter(a => installed.has(a.id));
    if (agents.length === 0) return [];

    const skipped: SkippedCapability[] = [];
    const templated: string[] = [];
    const preserved: string[] = [];
    const writtenNow = new Set<string>();
    fs.mkdirSync(paths.agentsDir, { recursive: true });

    for (const agent of agents) {
      if (!validateAgentId(agent.id)) continue;

      // A project file named after a built-in agent is how a repository takes
      // over Kimi's main agent. Never write one, even by accident.
      if (isReservedKimiAgentName(agent.id)) {
        logger.warn('Skipping Kimi subagent whose id shadows a built-in agent', {
          context: { agentId: agent.id },
        });
        skipped.push({
          capability: 'agents',
          reason: `"${agent.id}" collides with a built-in Kimi agent and was not written; it stays routable through AGENTS.md`,
        });
        continue;
      }

      let rawSource: string;
      try {
        rawSource = fs.readFileSync(agent.filePath, 'utf-8');
      } catch (error) {
        logger.warn('Could not read agent source for Kimi subagent — skipping', {
          error,
          context: { agentId: agent.id, filePath: agent.filePath },
        });
        continue;
      }

      const content = toKimiAgentContent({
        id: agent.id,
        description: agent.description,
        rawSource,
      });
      if (containsTemplatePlaceholder(content)) templated.push(agent.id);

      const relPath = paths.relAgentFile(agent.id);
      const abs = validatePathWithinBase(paths.abs(relPath), plan.projectPath, false);
      // A hand-written subagent prompt is not ours to overwrite. Kimi is
      // pre-selected because `.kimi-code/` already exists, so this is a likely
      // case rather than a corner one.
      const outcome = writeManagedFile({
        absPath: abs,
        relPath,
        content,
        previouslyManaged: plan.previouslyManaged,
      });
      if (outcome === 'preserved') {
        preserved.push(agent.id);
        continue;
      }
      this.track(manifest, extendedManifest, plan.projectPath, relPath, agent.filePath);
      writtenNow.add(relPath);
    }

    // An agent that is no longer selected must stop being invocable as `@<id>`.
    pruneOrphanedAgentFiles({
      projectPath: plan.projectPath,
      previousForTarget: plan.previousAgentFiles.get(this.id) ?? [],
      writtenNow,
    });

    if (preserved.length > 0) {
      skipped.push({
        capability: 'agents',
        reason: `${preserved.length} agent file(s) already existed in ${paths.relAgentsDir} and were not written over: ${preserved.join(', ')}`,
      });
    }

    // Kimi renders an agent body as a template on every prompt build, so `${…}`
    // inside a code example enters substitution. Rewriting the example would be
    // worse than saying so — the prose is what makes the agent useful.
    if (templated.length > 0) {
      skipped.push({
        capability: 'agent-template-vars',
        reason: `Kimi substitutes \${...} in agent bodies; ${templated.length} agent(s) contain such sequences in code examples (${templated.slice(0, 3).join(', ')}${templated.length > 3 ? ', …' : ''})`,
      });
    }

    return skipped;
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
