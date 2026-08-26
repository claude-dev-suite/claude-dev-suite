// SPDX-License-Identifier: MIT
/**
 * Gemini CLI Target Adapter
 *
 * Gemini reads skills from the shared `.agents/skills` directory (written by the
 * substrate), so two surfaces are left to this adapter: `.gemini/settings.json`
 * — dev-suite's MCP servers plus a `context.fileName` that makes Gemini read
 * `AGENTS.md` (which it does not read by default) — and native subagents under
 * `.gemini/agents/`, since Gemini reads neither `.claude/agents` nor the
 * substrate.
 *
 * Gemini has no glob-scoped rules, so selected rule templates are reported as a
 * skipped capability and agent routing rides in `AGENTS.md`.
 */

import * as fs from 'fs';
import { getLogger } from '../../../utils/logger.js';
import type { Agent } from '../../../types.js';
import type { ExtendedManifest } from '../../../types/index.js';
import { writeMergedMcpConfig } from '../../installation/mcp-config-file.js';
import { trackManifestFile } from '../../installation/manifest-tracking.js';
import { writeManagedFile, pruneOrphanedAgentFiles } from '../../installation/managed-file.js';
import { writeGeminiSettings } from '../writers/gemini-settings.writer.js';
import { toGeminiAgentContent } from '../writers/gemini-agent.writer.js';
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
    skipped.push(...writeMergedMcpConfig({
      projectPath,
      relPath: relSettings,
      target: this.id,
      manifest,
      extendedManifest,
      render: existing => writeGeminiSettings(ctx.mcpServers, {
        existing,
        previouslyManaged: plan.mcpCatalog,
        file: relSettings,
      }),
    }));

    // Native Gemini subagents (`.gemini/agents/<id>.md`) — Gemini reads neither
    // `.claude/agents` nor the substrate, so this is the only path to `@`-agents.
    skipped.push(...this.writeAgents(ctx, paths));

    if (plan.rules.length > 0) {
      skipped.push({
        capability: 'rule-templates',
        reason: 'Gemini has no project-level rule mechanism, so the selected rule templates were not written. (Agent routing is unaffected — it rides in AGENTS.md, which Gemini reads.)',
      });
    }

    return { ruleFiles: [], validatorHookConfigured: false, skipped };
  }

  /**
   * Write one `.gemini/agents/<id>.md` per installed agent. Reads each agent's
   * source file for its role prose; skips (with a warning) any that can't be
   * read or has an unsafe id, rather than failing the whole install.
   *
   * A file the user wrote themselves is preserved and reported, never
   * overwritten — Gemini is pre-selected precisely because `.gemini/` already
   * exists, so a hand-written subagent prompt is a likely case, not a corner one.
   */
  private writeAgents(ctx: TargetWriteContext, paths: TargetPaths): SkippedCapability[] {
    const { plan, manifest, extendedManifest } = ctx;
    const preserved: string[] = [];
    const writtenNow = new Set<string>();
    const installed = new Set(manifest.agents);
    const agents: Agent[] = plan.agentCatalog.filter(a => installed.has(a.id));
    if (agents.length === 0) return [];

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

    if (preserved.length === 0) return [];
    return [{
      capability: 'agents',
      reason: `${preserved.length} agent file(s) already existed in ${paths.relAgentsDir} and were not written over: ${preserved.join(', ')}`,
    }];
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
