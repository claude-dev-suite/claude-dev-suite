// SPDX-License-Identifier: MIT
/**
 * Claude Code Target Adapter
 *
 * Writes only what is *specific* to Claude Code as a target — the shared
 * `.claude/agents` + `.claude/skills` substrate is installed once by the service
 * (see installation/substrate.ts), because Copilot and Cursor read it too.
 *
 * What stays here, because it has no analogue elsewhere:
 *  - **`skillListingBudgetFraction`** in `.claude/settings.json` — a Claude Code
 *    setting sized for dev-suite's core-skill count.
 *  - **`.mcp.json`** — Claude Code's MCP config, a file it owns outright.
 *  - **`.claude/rules/*.md`** — path-scoped routing (`paths:` frontmatter) plus
 *    any selected rule templates.
 *  - the integration-validator hook, which lives in `.claude/settings.json`.
 */

import * as fs from 'fs';
import * as path from 'path';
import { getLogger } from '../../../utils/logger.js';
import type { InstallManifest } from '../../../types.js';
import type { ExtendedManifest } from '../../../types/index.js';
import { HooksService } from '../../hooks.service.js';
import { trackManifestFile } from '../../installation/manifest-tracking.js';
import { writePathScopedRules } from '../../installation/path-scoped-rules.js';
import { getTargetLayout, type TargetLayout } from '../target-layout.js';
import type { TargetPaths } from '../target-paths.js';
import { writeClaudeCodeMcpConfig } from '../writers/mcp-config.writer.js';
import type {
  TargetAdapter,
  TargetWriteContext,
  TargetWriteResult,
} from '../target-adapter.js';

const logger = getLogger('ClaudeCodeAdapter');

export class ClaudeCodeAdapter implements TargetAdapter {
  readonly id = 'claude-code' as const;
  readonly layout: TargetLayout = getTargetLayout('claude-code');

  private hooksService = new HooksService();

  async write(ctx: TargetWriteContext): Promise<TargetWriteResult> {
    const { plan, paths, manifest, extendedManifest } = ctx;
    const { projectPath, rules, detectedStack } = plan;

    // Raise the skill listing budget: dev-suite installs enough core skills to
    // exceed Claude Code's default, which would fire a "N descriptions dropped"
    // warning. No analogue on other assistants.
    this.ensureSkillBudget(paths, manifest, extendedManifest, projectPath);

    // Rule templates the user selected (e.g. security.md) → `.claude/rules/`.
    await this.installRules(rules, paths, manifest);

    // `.mcp.json` — owned outright by dev-suite for Claude Code, so overwritten
    // wholesale rather than merged.
    fs.writeFileSync(paths.mcpConfigFile, writeClaudeCodeMcpConfig(ctx.mcpServers));
    manifest.files.push({ path: paths.relMcpConfigFile, type: 'config', source: 'generated' });
    trackManifestFile(extendedManifest, projectPath, paths.relMcpConfigFile, 'config');

    const validatorHookConfigured = this.configureValidatorHook(
      projectPath, paths, manifest, extendedManifest, detectedStack
    );

    const installedAgents = plan.agentCatalog.filter(a => manifest.agents.includes(a.id));
    const ruleFiles = writePathScopedRules('claude-code', installedAgents, projectPath);

    return { ruleFiles, validatorHookConfigured, skipped: [] };
  }

  /** Copy selected rule templates into the target's rules directory. */
  private async installRules(
    rules: string[],
    paths: TargetPaths,
    manifest: InstallManifest
  ): Promise<void> {
    if (rules.length === 0) return;

    fs.mkdirSync(paths.rulesDir, { recursive: true });
    const { RulesService } = await import('../../rules.service.js');
    const rulesService = new RulesService();
    for (const ruleId of rules) {
      const src = rulesService.findRuleFile(ruleId);
      if (src) {
        fs.copyFileSync(src, paths.ruleFile(ruleId));
        manifest.rules.push(ruleId);
        manifest.files.push({ path: paths.relRuleFile(ruleId), type: 'config', source: src });
      }
    }
  }

  /** Configure the integration-validator hook when a stack was detected. */
  private configureValidatorHook(
    projectPath: string,
    paths: TargetPaths,
    manifest: InstallManifest,
    extendedManifest: ExtendedManifest,
    detectedStack: TargetWriteContext['plan']['detectedStack']
  ): boolean {
    if (!detectedStack) return false;

    const hookResult = this.hooksService.configureIntegrationValidatorHook(projectPath, detectedStack);
    if (!hookResult.configured) return false;

    manifest.files.push({ path: paths.relSettingsFile, type: 'config', source: 'generated' });
    trackManifestFile(extendedManifest, projectPath, paths.relSettingsFile, 'config');
    extendedManifest.features['integration-validator-hook'] = {
      version: '1.0.0',
      appliedAt: new Date().toISOString(),
    };
    logger.info('Integration validator hook configured', { context: { projectPath } });
    return true;
  }

  /**
   * Ensure `.claude/settings.json` raises `skillListingBudgetFraction` to a
   * value that fits dev-suite's typical core-skill count (30-60 across selected
   * agents). Default Claude Code budget is 1% (~20 descriptions), which causes
   * the *"N descriptions dropped"* warning on heavy installs.
   *
   * - File missing → create with `{ skillListingBudgetFraction: 0.05 }`
   * - File present, key missing → merge in `0.05`, preserving everything else
   * - File present, key already set → leave alone (respect the user's override,
   *   even a lower one — they know their context budget better than we do)
   */
  private ensureSkillBudget(
    paths: TargetPaths,
    manifest: InstallManifest,
    extendedManifest: ExtendedManifest | undefined,
    projectPath: string,
  ): void {
    const TARGET_BUDGET = 0.05;
    const settingsPath = paths.settingsFile;
    let settings: Record<string, unknown> = {};
    let alreadySet = false;

    if (fs.existsSync(settingsPath)) {
      try {
        const raw = fs.readFileSync(settingsPath, 'utf-8');
        settings = JSON.parse(raw);
        if (Object.prototype.hasOwnProperty.call(settings, 'skillListingBudgetFraction')) {
          alreadySet = true;
        }
      } catch (error: unknown) {
        logger.warn('Failed to parse existing .claude/settings.json — overwriting with safe defaults', {
          error,
          context: { settingsPath },
        });
        settings = {};
      }
    }

    if (alreadySet) {
      logger.info('Preserving user-set skillListingBudgetFraction', {
        context: { value: settings.skillListingBudgetFraction },
      });
      return;
    }

    settings.skillListingBudgetFraction = TARGET_BUDGET;
    try {
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      manifest.files.push({ path: paths.relSettingsFile, type: 'config', source: 'generated' });
      if (extendedManifest) {
        trackManifestFile(extendedManifest, projectPath, paths.relSettingsFile, 'config');
      }
      logger.info('Set skillListingBudgetFraction in .claude/settings.json', {
        context: { settingsPath, value: TARGET_BUDGET },
      });
    } catch (error: unknown) {
      logger.warn('Failed to write .claude/settings.json — skill budget not raised', {
        error,
        context: { settingsPath },
      });
    }
  }
}
