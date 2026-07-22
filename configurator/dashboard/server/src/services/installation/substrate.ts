// SPDX-License-Identifier: MIT
/**
 * `.claude/` Substrate Installer
 *
 * Writes the shared agent and skill substrate that every Tier 1 assistant reads
 * directly: `.claude/agents/<id>.md` and `.claude/skills/<flat>/SKILL.md`.
 * Copilot and Cursor discover both directories as-is (see
 * docs/ASSISTANT-FORMAT-REFERENCE.md sections 2.2/2.3), so this is not "the
 * Claude Code target" — it is shared infrastructure, on the same footing as the
 * `.mcp-servers/` bundles, written once per install regardless of which
 * assistants were selected.
 *
 * The format is Claude-native: flat skill directories (Claude Code resolves
 * skills by a single-segment name) and `toInstalledAgentContent`-transformed
 * agent frontmatter (`tools:`/`skills:` rather than the source `allowed-tools:`).
 * Copilot and Cursor ignore the frontmatter fields they do not recognise; the
 * files still load. Recovering that lost fidelity with native per-target agent
 * files is a documented, optional future improvement.
 *
 * Claude-Code-*specific* concerns — `skillListingBudgetFraction`, `.mcp.json`,
 * `.claude/rules` — stay in the Claude Code adapter and only run when that
 * target is selected.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { getLogger } from '../../utils/logger.js';
import type { InstallManifest } from '../../types.js';
import type { ExtendedManifest } from '../../types/index.js';
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
} from './index.js';
import { trackManifestFile } from './manifest-tracking.js';
import { targetPaths } from '../targets/target-paths.js';
import { AGENTS_SKILLS_DIR, readsAgentsSkills } from '../targets/target-layout.js';
import type { InstallPlan } from '../targets/target-adapter.js';

const logger = getLogger('SubstrateInstaller');

export class SubstrateInstaller {
  /**
   * Install the `.claude/` agent + skill substrate for one plan. Mutates the
   * manifests: pushes installed agent ids and tracks every written file.
   *
   * Idempotent-ish: stale dev-suite skill folders from a previous install are
   * cleaned first so re-installs start from a clean slate.
   */
  install(
    plan: InstallPlan,
    manifest: InstallManifest,
    extendedManifest: ExtendedManifest
  ): void {
    const { projectPath, devSuiteDir, agents, skillLoadingMode } = plan;
    const paths = targetPaths(projectPath, 'claude-code');

    fs.mkdirSync(paths.agentsDir, { recursive: true });
    fs.mkdirSync(paths.skillsDir, { recursive: true });

    this.cleanStaleSkills(paths.skillsDir);

    // In lazy mode skills split in two buckets: agent-scoped skills are
    // installed natively so the assistant loads their description at boot, and
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

    // `_README.md` rather than `index.md` so skill auto-discovery doesn't try to
    // interpret it as a skill folder.
    if (skillLoadingMode === 'lazy') {
      this.writeSkillIndex(
        lazySkillPaths, preloadedSkillPaths, paths.skillsDir, devSuiteDir,
        projectPath, manifest, extendedManifest
      );
    }

    // Dual-write the skills to `.agents/skills` when a selected target reads the
    // cross-tool location rather than `.claude/skills` (Codex, Gemini).
    if (readsAgentsSkills(plan.targets)) {
      this.mirrorSkillsToAgentsDir(paths.skillsDir, projectPath, manifest, extendedManifest);
    }
  }

  /**
   * Copy the installed `.claude/skills` tree into `.agents/skills` so Codex and
   * Gemini (which don't read `.claude/`) discover the same skills. The two stay
   * byte-identical — `.agents/skills` is a mirror, never a separate source.
   */
  private mirrorSkillsToAgentsDir(
    claudeSkillsDir: string,
    projectPath: string,
    manifest: InstallManifest,
    extendedManifest: ExtendedManifest
  ): void {
    if (!fs.existsSync(claudeSkillsDir)) return;
    const destRoot = path.join(projectPath, ...AGENTS_SKILLS_DIR.split('/'));

    // Clean our previously-mirrored skill folders so a re-install with a
    // different agent set doesn't accumulate stale skills here either. Mirrors
    // cleanStaleSkills' safety: only folders containing a SKILL.md, never custom/.
    this.cleanStaleSkills(destRoot);
    fs.mkdirSync(destRoot, { recursive: true });

    let mirrored = 0;
    for (const entry of fs.readdirSync(claudeSkillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'custom' || !validateEntryName(entry.name)) continue;
      const src = validatePathWithinBase(path.join(claudeSkillsDir, entry.name), claudeSkillsDir, false);
      const dest = validatePathWithinBase(path.join(destRoot, entry.name), destRoot, false);
      if (!fs.existsSync(dest)) {
        copyDirSync(src, dest);
        const rel = `${AGENTS_SKILLS_DIR}/${entry.name}`;
        manifest.files.push({ path: rel, type: 'skill', source: src });
        trackManifestFile(extendedManifest, projectPath, rel, 'skill', src);
        mirrored++;
      }
    }
    if (mirrored > 0) {
      logger.info('Mirrored skills to .agents/skills for cross-tool discovery', {
        context: { destRoot, mirrored },
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
