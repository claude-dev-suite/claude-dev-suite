// SPDX-License-Identifier: MIT
/**
 * Claude Code Target Adapter
 *
 * Writes the Claude Code layout: `.claude/agents`, `.claude/skills`,
 * `.claude/rules`, `.claude/settings.json` and `.mcp.json`.
 *
 * Most of this file moved verbatim out of `installation.service.ts` when the
 * adapter seam was introduced. It lives here because every behaviour in it is
 * Claude-Code-specific, not general:
 *  - **Flat skill directories.** Claude Code resolves skills by a single-segment
 *    name under `.claude/skills/<name>/SKILL.md`, so nested source paths are
 *    flattened (with collision suffixes).
 *  - **`toInstalledAgentContent`.** dev-suite source agents use `allowed-tools:`
 *    and path-style `skills:`; Claude Code's subagent loader reads `tools:` and
 *    flat skill names. Without the transform, tool restrictions are silently
 *    ignored and skill preload never fires.
 *  - **`skillListingBudgetFraction`.** A Claude Code setting with no analogue
 *    elsewhere.
 *
 * Adapters for assistants that read `.claude/` directly (Copilot, Cursor) do not
 * repeat any of this — see docs/ASSISTANT-FORMAT-REFERENCE.md sections 2.2/2.3.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { getLogger } from '../../../utils/logger.js';
import type { InstallManifest } from '../../../types.js';
import type { ExtendedManifest } from '../../../types/index.js';
import { HooksService } from '../../hooks.service.js';
import {
  validatePathWithinBase,
  validateEntryName,
  validateAgentId,
  validateSkillPath,
  copyDirSync,
  findAgentFile,
  parseAgentSkills,
  parseAgentSkillsStructured,
  flattenSkillName,
  toInstalledAgentContent,
  generatePathScopedRules,
} from '../../installation/index.js';
import { trackManifestFile } from '../../installation/manifest-tracking.js';
import { getTargetLayout, type TargetLayout } from '../target-layout.js';
import { targetPaths, type TargetPaths } from '../target-paths.js';
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

  /**
   * Write the full Claude Code layout.
   *
   * Order matters: skills are cleaned before agents are installed (so a
   * re-install starts from a clean slate), and the MCP config file is written
   * after the server bundles it references are already on disk.
   */
  async write(ctx: TargetWriteContext): Promise<TargetWriteResult> {
    const { plan, paths, manifest, extendedManifest } = ctx;
    const { projectPath, devSuiteDir, agents, rules, skillLoadingMode, detectedStack } = plan;

    fs.mkdirSync(paths.agentsDir, { recursive: true });
    fs.mkdirSync(paths.skillsDir, { recursive: true });

    // Clean stale skill folders left over from previous installs (eager mode
    // nested folders, lazy mode flat names from a previous agent set). Without
    // this, re-installing accumulates skill descriptions and re-triggers the
    // `skillListingBudgetFraction` warning.
    this.cleanStaleSkills(paths.skillsDir);

    // dev-suite installs enough core skills to exceed Claude Code's default
    // description budget, which would fire a "N descriptions dropped" warning.
    this.ensureSkillBudget(paths, manifest, extendedManifest, projectPath);

    // In lazy mode skills split in two buckets: agent-scoped skills are
    // installed natively so Claude Code loads their description at boot, and
    // the rest stay reachable on demand through the `skill-loader` MCP server.
    const lazySkillPaths = new Map<string, string>();
    const preloadedSkillPaths = new Set<string>();
    const usedFlatNames = new Map<string, string>();
    const skillPathToFlat = new Map<string, string>();

    for (const agentId of agents) {
      const installed = skillLoadingMode === 'lazy'
        ? this.installAgentLazy(
            agentId, projectPath, devSuiteDir, manifest, extendedManifest,
            lazySkillPaths, preloadedSkillPaths, usedFlatNames, skillPathToFlat
          )
        : this.installAgent(
            agentId, projectPath, devSuiteDir, manifest, extendedManifest,
            usedFlatNames, preloadedSkillPaths, skillPathToFlat
          );
      if (installed) {
        manifest.agents.push(agentId);
        extendedManifest.agents.push(agentId);
      }
    }

    // `_README.md` rather than `index.md` so Claude Code's skill auto-discovery
    // doesn't try to interpret it as a skill folder.
    if (skillLoadingMode === 'lazy') {
      this.writeSkillIndex(
        lazySkillPaths, preloadedSkillPaths, paths.skillsDir, devSuiteDir,
        projectPath, manifest, extendedManifest
      );
    }

    await this.installRules(rules, paths, manifest);

    fs.writeFileSync(paths.mcpConfigFile, JSON.stringify({ mcpServers: ctx.mcpServers }, null, 2));
    manifest.files.push({ path: paths.relMcpConfigFile, type: 'config', source: 'generated' });
    trackManifestFile(extendedManifest, projectPath, paths.relMcpConfigFile, 'config');

    const validatorHookConfigured = this.configureValidatorHook(
      projectPath, paths, manifest, extendedManifest, detectedStack
    );

    const installedAgents = plan.agentCatalog.filter(a => manifest.agents.includes(a.id));
    const ruleFiles = generatePathScopedRules(installedAgents, projectPath);

    return { installedAgents, ruleFiles, validatorHookConfigured, skipped: [] };
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
   * value that fits the dev-suite's typical core-skill count (30-60 across
   * selected agents). Default Claude Code budget is 1% (~20 descriptions),
   * which causes the *"N descriptions dropped"* warning on heavy installs.
   *
   * Behaviour:
   * - File missing → create with `{ skillListingBudgetFraction: 0.05 }`
   * - File present, key missing → merge in `0.05` while preserving everything
   *   else (hooks, env, permissions)
   * - File present, key already set → leave alone (respect user override —
   *   even when it's lower than 0.05, the user knows their context budget
   *   better than we do)
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

  /**
   * Remove dev-suite-managed skill folders from `.claude/skills/` so a
   * re-install starts from a clean slate. Any direct child of `skillsDir`
   * that contains a `SKILL.md` anywhere in its tree is considered managed.
   *
   * Files at the top level (e.g. `_README.md`) are preserved. Unrelated
   * folders that don't contain a `SKILL.md` (rare, but possible if the user
   * keeps custom artifacts here) are also preserved.
   */
  private cleanStaleSkills(skillsDir: string): void {
    if (!fs.existsSync(skillsDir)) return;

    const containsSkillMd = (dir: string): boolean => {
      try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.isFile() && entry.name === 'SKILL.md') return true;
          if (entry.isDirectory() && containsSkillMd(path.join(dir, entry.name))) return true;
        }
      } catch {
        // unreadable — treat as no match
      }
      return false;
    };

    let removed = 0;
    for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      // Never touch the reserved `custom/` folder — it holds user-authored
      // skills (custom-agents.service), even though they contain SKILL.md.
      if (entry.name === 'custom' || !validateEntryName(entry.name)) continue;
      // SECURITY: validatePathWithinBase returns a path verified to stay inside
      // skillsDir (rejects traversal/symlink escape) — use the returned value.
      const fullPath = validatePathWithinBase(path.join(skillsDir, entry.name), skillsDir, false);
      if (containsSkillMd(fullPath)) {
        try {
          fs.rmSync(fullPath, { recursive: true, force: true });
          removed++;
        } catch (error: unknown) {
          logger.warn('Failed to remove stale skill folder', {
            error,
            context: { folder: fullPath },
          });
        }
      }
    }

    if (removed > 0) {
      logger.info('Cleaned stale skill folders before re-install', {
        context: { skillsDir, removed },
      });
    }
  }

  /**
   * Install one skill as a FLAT top-level dir under `.claude/skills/<flat>/`
   * (the only shape Claude Code resolves by name), with cross-agent collision
   * handling. Returns the final flat dir name (so the agent's `skills:` list can
   * reference it), or null if the skill is invalid/missing. Idempotent: a skill
   * already installed by another agent returns its recorded flat name.
   */
  private installSkillFlat(
    skillPath: string,
    devSuiteDir: string,
    projectPath: string,
    manifest: InstallManifest,
    extendedManifest: ExtendedManifest | undefined,
    usedFlatNames: Map<string, string>,
    preloadedSkillPaths: Set<string>,
    skillPathToFlat: Map<string, string>
  ): string | null {
    const already = skillPathToFlat.get(skillPath);
    if (already) return already;

    if (!validateSkillPath(skillPath)) {
      logger.warn('Invalid skill path - potential path traversal', { context: { skillPath } });
      return null;
    }
    const skillsSource = path.join(devSuiteDir, 'skills');
    // validatePathWithinBase returns the validated path — use the returned value
    // as the sanitized path into every fs sink (recognized path-injection barrier).
    let safeSrc: string;
    try {
      safeSrc = validatePathWithinBase(path.join(skillsSource, skillPath), skillsSource, false);
    } catch {
      logger.warn('Skill path validation failed', { context: { skillPath } });
      return null;
    }
    if (!fs.existsSync(safeSrc)) return null;

    let flatName = flattenSkillName(skillPath);
    if (!flatName) {
      logger.warn('Skill flatten produced empty name', { context: { skillPath } });
      return null;
    }
    // Collision: a different skillPath already claimed this flat name.
    const claimedBy = usedFlatNames.get(flatName);
    if (claimedBy && claimedBy !== skillPath) {
      const suffix = crypto.createHash('sha1').update(skillPath).digest('hex').slice(0, 6);
      const max = 64 - suffix.length - 1;
      flatName = `${flatName.slice(0, max).replace(/-+$/, '')}-${suffix}`;
      logger.warn('Flat skill name collision — applied hash suffix', {
        context: { skillPath, claimedBy, flatName },
      });
    }

    const paths = targetPaths(projectPath);
    const skillsDestRoot = paths.skillsDir;
    let safeDest: string;
    try {
      safeDest = validatePathWithinBase(path.join(skillsDestRoot, flatName), skillsDestRoot, false);
    } catch {
      logger.warn('Flattened skill path failed validation', { context: { skillPath, flatName } });
      return null;
    }

    if (!fs.existsSync(safeDest)) {
      copyDirSync(safeSrc, safeDest);
      manifest.files.push({ path: paths.relSkillDir(flatName), type: 'skill', source: safeSrc });
      if (extendedManifest) {
        trackManifestFile(extendedManifest, projectPath, paths.relSkillDir(flatName), 'skill', safeSrc);
      }
    }
    usedFlatNames.set(flatName, skillPath);
    preloadedSkillPaths.add(skillPath);
    skillPathToFlat.set(skillPath, flatName);
    return flatName;
  }

  private installAgent(
    agentId: string,
    projectPath: string,
    devSuiteDir: string,
    manifest: InstallManifest,
    extendedManifest: ExtendedManifest | undefined,
    usedFlatNames: Map<string, string>,
    preloadedSkillPaths: Set<string>,
    skillPathToFlat: Map<string, string>
  ): boolean {
    // SECURITY: Validate agentId
    if (!validateAgentId(agentId)) {
      logger.warn('Invalid agent ID - potential path traversal', { context: { agentId } });
      return false;
    }
    // SECURITY: Path traversal check for projectPath
    if (projectPath.includes('..')) {
      logger.warn('Invalid projectPath - path traversal detected', { context: { projectPath } });
      return false;
    }

    const agentFile = findAgentFile(path.join(devSuiteDir, 'agents'), agentId + '.md');
    if (!agentFile) return false;

    try {
      // SECURITY: Validate paths. validatePathWithinBase returns the validated
      // path — use the returned value as the sanitized destination for the agent
      // file write (recognized path-injection barrier).
      validatePathWithinBase(agentFile, path.join(devSuiteDir, 'agents'), false);
      const paths = targetPaths(projectPath);
      const destPath = validatePathWithinBase(
        paths.agentFile(agentId),
        projectPath,
        false
      );

      // Eager mode: copy ALL of the agent's skills as FLAT top-level dirs
      // (bundle-expanded by the shared parser), then write the agent file with
      // Claude-Code-native frontmatter so tool restrictions + skill preload
      // actually take effect (see toInstalledAgentContent / Option R).
      const agentContent = fs.readFileSync(agentFile, 'utf-8');
      const skills = parseAgentSkills(agentContent, agentId);
      const installedFlat: string[] = [];
      for (const skillPath of skills) {
        const flat = this.installSkillFlat(
          skillPath, devSuiteDir, projectPath, manifest, extendedManifest,
          usedFlatNames, preloadedSkillPaths, skillPathToFlat
        );
        if (flat && !installedFlat.includes(flat)) installedFlat.push(flat);
      }

      const installedContent = toInstalledAgentContent(agentContent, {
        installedSkillFlatNames: installedFlat,
        grantSkillTool: true,
      });
      fs.writeFileSync(destPath, installedContent, 'utf-8');
      manifest.files.push({ path: paths.relAgentFile(agentId), type: 'agent', source: agentFile });
      // Track with hash for upgrade system (hash reflects the installed file)
      if (extendedManifest) {
        trackManifestFile(extendedManifest, projectPath, paths.relAgentFile(agentId), 'agent', agentFile);
      }

      return true;
    } catch (error: unknown) {
      logger.warn('Failed to install agent', {
        error,
        context: { agentId, projectPath }
      });
      return false;
    }
  }

  /**
   * Lazy variant of installAgent.
   *
   * Copies the agent .md file AND preloads ONLY the agent's `core_skills:`
   * (or, for unmigrated agents that still use legacy `skills:`, the full
   * list — same as before) under `.claude/skills/<flat-name>/SKILL.md`.
   * Claude Code's native progressive disclosure loads their description at
   * boot (Level 1) and the body on demand (Level 2).
   *
   * `extended_skills:` are NOT preloaded — they are reachable via the
   * `skill-loader` MCP server (`list_skills`, `load_skill`), which reads
   * DEV_SUITE_ROOT directly at runtime. This keeps the Level 1 budget
   * (~1% of context, `skillListingBudgetFraction`) under control even
   * when many agents are installed.
   */
  private installAgentLazy(
    agentId: string,
    projectPath: string,
    devSuiteDir: string,
    manifest: InstallManifest,
    extendedManifest: ExtendedManifest | undefined,
    lazySkillPaths: Map<string, string>,
    preloadedSkillPaths: Set<string>,
    usedFlatNames: Map<string, string>,
    skillPathToFlat: Map<string, string>
  ): boolean {
    // SECURITY: Validate agentId
    if (!validateAgentId(agentId)) {
      logger.warn('Invalid agent ID - potential path traversal', { context: { agentId } });
      return false;
    }
    if (projectPath.includes('..')) {
      logger.warn('Invalid projectPath - path traversal detected', { context: { projectPath } });
      return false;
    }

    const agentFile = findAgentFile(path.join(devSuiteDir, 'agents'), agentId + '.md');
    if (!agentFile) return false;

    try {
      // SECURITY: Validate paths. validatePathWithinBase returns the validated
      // path — use the returned value as the sanitized destination for the agent
      // file write (recognized path-injection barrier).
      validatePathWithinBase(agentFile, path.join(devSuiteDir, 'agents'), false);
      const paths = targetPaths(projectPath);
      const destPath = validatePathWithinBase(
        paths.agentFile(agentId),
        projectPath,
        false
      );

      // Lazy mode: preload only the agent's `core_skills` (or, for unmigrated
      // agents that still use legacy `skills:`, the cap-limited core) as FLAT
      // dirs. `extended_skills:` are NOT copied — they stay reachable via the
      // `skill-loader` MCP at runtime. Then write the agent file with
      // Claude-Code-native frontmatter (tools/mcpServers/skills + skill-loader +
      // Skill) so tool restrictions and skill preload actually take effect.
      const agentContent = fs.readFileSync(agentFile, 'utf-8');
      const { core: coreSkills } = parseAgentSkillsStructured(agentContent, agentId);
      const installedFlat: string[] = [];
      for (const skillPath of coreSkills) {
        const flat = this.installSkillFlat(
          skillPath, devSuiteDir, projectPath, manifest, extendedManifest,
          usedFlatNames, preloadedSkillPaths, skillPathToFlat
        );
        if (flat) {
          if (!installedFlat.includes(flat)) installedFlat.push(flat);
          // Now preloaded natively — drop from the MCP-side index if present.
          lazySkillPaths.delete(skillPath);
        }
      }

      const installedContent = toInstalledAgentContent(agentContent, {
        installedSkillFlatNames: installedFlat,
        extraMcpServers: ['skill-loader'],
        grantSkillTool: true,
      });
      fs.writeFileSync(destPath, installedContent, 'utf-8');
      manifest.files.push({ path: paths.relAgentFile(agentId), type: 'agent', source: agentFile });
      // Track with hash for upgrade system (hash reflects the installed file).
      if (extendedManifest) {
        trackManifestFile(extendedManifest, projectPath, paths.relAgentFile(agentId), 'agent', agentFile);
      }

      return true;
    } catch (error: unknown) {
      logger.warn('Failed to install agent (lazy)', {
        error,
        context: { agentId, projectPath }
      });
      return false;
    }
  }

  /**
   * Write `.claude/skills/_README.md` — a short note describing the dual
   * discovery model in lazy mode:
   *
   *   1. The skills referenced by selected agents are installed natively as
   *      `.claude/skills/<flat-name>/SKILL.md` (Claude Code auto-loads their
   *      description at boot, body on demand).
   *   2. All other skills are reachable on demand via the `skill-loader` MCP
   *      server tools `list_skills` and `load_skill`.
   *
   * The filename starts with `_` to keep Claude Code's auto-discovery from
   * mistaking it for a skill folder.
   */
  private writeSkillIndex(
    _lazySkillPaths: Map<string, string>,
    preloadedSkillPaths: Set<string>,
    skillsDir: string,
    devSuiteDir: string,
    projectPath: string,
    manifest: InstallManifest,
    extendedManifest: ExtendedManifest | undefined
  ): void {
    const paths = targetPaths(projectPath);
    const lines: string[] = [
      '# Skills (lazy mode)',
      '',
      'This project uses dev-suite **tiered skill loading** to keep Claude',
      'Code\'s skill description budget (`skillListingBudgetFraction`,',
      '~1% of context) under control even with many agents installed.',
      '',
      '- **Core skills** — declared as `core_skills:` in each agent\'s',
      '  frontmatter (or `skills:` for unmigrated agents). Installed as',
      `  native Claude Code skills under \`${paths.relSkillsDir}/<name>/SKILL.md\`.`,
      '  Claude Code auto-discovers them at boot: only the YAML description',
      '  is loaded; the body is fetched on demand when the skill is invoked.',
      '- **Extended skills** — declared as `extended_skills:` in each',
      '  agent\'s frontmatter, plus the rest of the dev-suite catalog. NOT',
      '  preloaded. Reachable on demand via the `skill-loader` MCP server:',
      '  - `mcp__skill-loader__list_skills` to discover available skills',
      '    (pass `groupByCategory: true` for a compact summary)',
      '  - `mcp__skill-loader__load_skill({ skill_path: "<path>" })` to',
      '    fetch a full SKILL.md body when needed',
      '',
      `## Natively preloaded core skills (${preloadedSkillPaths.size})`,
      '',
    ];

    const sortedPreloaded = [...preloadedSkillPaths].sort();
    for (const skillPath of sortedPreloaded) {
      lines.push(`- \`${skillPath}\``);
    }
    lines.push('');

    lines.push(
      '> **Runtime requirement**: the `skill-loader` MCP server reads',
      `> \`DEV_SUITE_ROOT\` (set to \`${devSuiteDir}\` in \`${paths.relMcpConfigFile}\`) to`,
      '> resolve non-preloaded skill bodies on demand.'
    );
    lines.push('');

    const readmePath = path.join(skillsDir, '_README.md');
    fs.writeFileSync(readmePath, lines.join('\n'));

    const relReadme = paths.relSkillDir('_README.md');
    manifest.files.push({ path: relReadme, type: 'skill', source: 'generated' });
    if (extendedManifest) {
      trackManifestFile(extendedManifest, projectPath, relReadme, 'skill');
    }

    logger.info('Lazy skills README written', {
      context: { preloadedCount: preloadedSkillPaths.size, readmePath },
    });
  }
}
