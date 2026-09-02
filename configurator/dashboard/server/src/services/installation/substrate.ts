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
import { trackManifestFile, trackManifestDir } from './manifest-tracking.js';
import { renameSkillFrontmatter } from './skill-frontmatter.js';
import { writeManagedFile } from './managed-file.js';
import {
  markSkillDirOwned,
  isOwnedSkillDirOrTracked,
  trackedSkillPathsFrom,
} from './skill-ownership.js';
import { targetPaths } from '../targets/target-paths.js';
import { AGENTS_SKILLS_DIR, agentsSkillsReaders, type TargetId } from '../targets/target-layout.js';
import type { InstallPlan } from '../targets/target-adapter.js';

const logger = getLogger('SubstrateInstaller');

export class SubstrateInstaller {
  /** Paths the previous install owned; empty on a first install. */
  private previouslyManaged: ReadonlySet<string> = new Set();
  private previousFileHashes: ReadonlyMap<string, string> | undefined;
  private previousSectionHashes: ReadonlyMap<string, string> | undefined;
  private acknowledgedFileHashes: ReadonlyMap<string, string> | undefined;
  private projectRoot = '';
  /** Agent ids whose destination file belonged to the user and was left alone. */
  private preservedAgents: string[] = [];

  /** Agent files preserved by the last `install()` call, for the caller to report. */
  get preserved(): readonly string[] {
    return this.preservedAgents;
  }

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
    this.previouslyManaged = plan.previouslyManaged;
    this.previousFileHashes = plan.previousFileHashes;
    this.previousSectionHashes = plan.previousSectionHashes;
    this.acknowledgedFileHashes = plan.acknowledgedFileHashes;
    this.projectRoot = plan.projectPath;
    this.preservedAgents = [];

    // Route the mkdir sinks through the guard too: an unvalidated mkdir into a
    // symlinked `.claude` was how a junction redirected the whole substrate.
    fs.mkdirSync(validatePathWithinBase(paths.agentsDir, projectPath, false), { recursive: true });
    fs.mkdirSync(validatePathWithinBase(paths.skillsDir, projectPath, false), { recursive: true });

    // Skill directories written before ownership sentinels existed are
    // recognised through the previous manifest, so upgrading does not strand
    // a tree of stale skills.
    const previouslyTracked = this.readTrackedSkillPaths(projectPath);
    this.cleanStaleSkills(paths.skillsDir, paths.relSkillsDir, previouslyTracked);

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

    // The index describes lazy mode specifically, so a stale one left by a
    // previous lazy install would keep pointing at a `skill-loader` server that
    // an eager re-install does not install. `cleanStaleSkills` deliberately
    // preserves top-level files, so remove it explicitly.
    this.removeSkillIndex(paths.skillsDir, projectPath);

    // `_README.md` rather than `index.md` so skill auto-discovery doesn't try to
    // interpret it as a skill folder. Written after the mirror below, because it
    // goes into both trees and the mirror has to exist first.
    const writeIndex = () => {
      if (skillLoadingMode !== 'lazy') return;
      this.writeSkillIndex(
        lazySkillPaths, preloadedSkillPaths, paths.skillsDir, devSuiteDir,
        projectPath, manifest, extendedManifest
      );
    };

    // Dual-write the skills to `.agents/skills` when a selected target reads the
    // cross-tool location rather than `.claude/skills` (Codex, Gemini, Kimi).
    const mirrorOwner = agentsSkillsReaders(plan.targets)[0];
    if (mirrorOwner) {
      this.mirrorSkillsToAgentsDir(
        paths.skillsDir,
        projectPath,
        manifest,
        extendedManifest,
        mirrorOwner
      );
    } else {
      // Copilot, Cursor and Cline read `.agents/skills` too (reference doc
      // section 2.2), so a mirror left over from an install that included Codex
      // or Gemini keeps serving stale skills to a *selected* assistant. Reconcile
      // it even when no target reads it as its primary location — removing only
      // folders dev-suite marked, never another tool's.
      this.reconcileOrphanedMirror(projectPath, previouslyTracked);
    }

    writeIndex();
  }

  /**
   * Remove a `_README.md` left by a previous install, in both skill trees.
   *
   * It documents lazy mode, so an eager re-install must not leave one behind
   * telling the model to call a `skill-loader` server that is no longer there.
   */
  private removeSkillIndex(skillsDir: string, projectPath: string): void {
    const candidates = [
      path.join(skillsDir, '_README.md'),
      path.join(projectPath, ...AGENTS_SKILLS_DIR.split('/'), '_README.md'),
    ];
    for (const file of candidates) {
      try {
        if (fs.existsSync(file)) fs.unlinkSync(file);
      } catch (error: unknown) {
        logger.warn('Could not remove the previous skills index', { error, context: { file } });
      }
    }
  }

  /**
   * Drop dev-suite's own stale folders from `.agents/skills` when no selected
   * target reads it as its primary skills location.
   *
   * Never removes the directory itself or anything unmarked: other tools write
   * here, and Copilot, Cursor and Cline read it.
   */
  private reconcileOrphanedMirror(
    projectPath: string,
    previouslyTracked: ReadonlySet<string>
  ): void {
    const destRoot = path.join(projectPath, ...AGENTS_SKILLS_DIR.split('/'));
    if (!fs.existsSync(destRoot)) return;
    this.cleanStaleSkills(destRoot, AGENTS_SKILLS_DIR, previouslyTracked);
  }

  /**
   * Copy the installed `.claude/skills` tree into `.agents/skills` so Codex,
   * Gemini and Kimi Code (none of which read `.claude/`) discover the same
   * skills. The two stay
   * byte-identical — `.agents/skills` is a mirror, never a separate source.
   */
  private mirrorSkillsToAgentsDir(
    claudeSkillsDir: string,
    projectPath: string,
    manifest: InstallManifest,
    extendedManifest: ExtendedManifest,
    /** The selected target the mirror is recorded under — never a hardcoded one. */
    owner: TargetId
  ): void {
    if (!fs.existsSync(claudeSkillsDir)) return;
    const destRoot = path.join(projectPath, ...AGENTS_SKILLS_DIR.split('/'));

    // Clean our previously-mirrored skill folders so a re-install with a
    // different agent set doesn't accumulate stale skills here either. Mirrors
    // cleanStaleSkills' safety: only folders containing a SKILL.md, never custom/.
    this.cleanStaleSkills(destRoot, AGENTS_SKILLS_DIR, this.readTrackedSkillPaths(projectPath));
    fs.mkdirSync(destRoot, { recursive: true });

    let mirrored = 0;
    for (const entry of fs.readdirSync(claudeSkillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'custom' || !validateEntryName(entry.name)) continue;
      const src = validatePathWithinBase(path.join(claudeSkillsDir, entry.name), claudeSkillsDir, false);
      const dest = validatePathWithinBase(path.join(destRoot, entry.name), destRoot, false);
      if (!fs.existsSync(dest)) {
        copyDirSync(src, dest);
        markSkillDirOwned(dest);
        const rel = `${AGENTS_SKILLS_DIR}/${entry.name}`;
        manifest.files.push({ path: rel, type: 'skill', source: src });
        trackManifestDir(extendedManifest, rel, 'skill', src, owner);
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
   * Skill directories recorded in the project's current manifest, so folders
   * written before ownership sentinels existed are still recognised as ours.
   */
  private readTrackedSkillPaths(projectPath: string): Set<string> {
    const manifestPath = path.join(projectPath, '.dev-suite-manifest.json');
    if (!fs.existsSync(manifestPath)) return new Set();
    try {
      return trackedSkillPathsFrom(JSON.parse(fs.readFileSync(manifestPath, 'utf-8')));
    } catch {
      return new Set();
    }
  }

  /**
   * Remove the skill folders dev-suite installed, so a re-install starts from a
   * clean slate.
   *
   * Ownership comes from the sentinel file (or the previous manifest), never
   * from "this folder contains a SKILL.md" — that older rule deleted the user's
   * own skills, and ran over `.agents/skills`, the cross-tool directory other
   * assistants legitimately write into.
   *
   * Files at the top level (e.g. `_README.md`) are preserved, as is `custom/`.
   */
  private cleanStaleSkills(
    skillsDir: string,
    relSkillsDir: string,
    trackedSkillPaths: ReadonlySet<string>
  ): void {
    if (!fs.existsSync(skillsDir)) return;

    let removed = 0;
    let preserved = 0;
    for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      // Never touch the reserved `custom/` folder — it holds user-authored
      // skills (custom-agents.service).
      if (entry.name === 'custom' || !validateEntryName(entry.name)) continue;
      // SECURITY: validatePathWithinBase returns a path verified to stay inside
      // skillsDir (rejects traversal/symlink escape) — use the returned value.
      const fullPath = validatePathWithinBase(path.join(skillsDir, entry.name), skillsDir, false);
      const rel = `${relSkillsDir}/${entry.name}`;
      if (!isOwnedSkillDirOrTracked(fullPath, rel, trackedSkillPaths)) {
        preserved++;
        continue;
      }
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

    if (removed > 0 || preserved > 0) {
      logger.info('Cleaned dev-suite skill folders before re-install', {
        context: { skillsDir, removed, preservedUserFolders: preserved },
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

    if (fs.existsSync(safeDest) && !fs.existsSync(path.join(safeDest, 'SKILL.md'))) {
      // Something else already occupies this flattened name and it is not a
      // skill. Claiming the name anyway would put it in the agent's `skills:`
      // frontmatter while nothing resolves it, and cleanStaleSkills never
      // touches a directory without a SKILL.md, so it would never self-heal.
      logger.warn('Flattened skill name is occupied by a non-skill directory — skill omitted', {
        context: { skillPath, flatName },
      });
      return null;
    }

    if (!fs.existsSync(safeDest)) {
      copyDirSync(safeSrc, safeDest);
      markSkillDirOwned(safeDest);
      // Flattening renames the directory, and the Agent Skills spec makes
      // `name:` match the parent directory a MUST (reference doc section 1.2).
      // Copying byte-for-byte left every installed skill in violation.
      renameSkillFrontmatter(safeDest, flatName);
      manifest.files.push({ path: paths.relSkillDir(flatName), type: 'skill', source: safeSrc });
      if (extendedManifest) {
        // A directory has no hash, so the default tracker dropped these
        // silently (one EISDIR warning per skill) and the manifest recorded
        // zero skill directories.
        trackManifestDir(extendedManifest, paths.relSkillDir(flatName), 'skill', safeSrc);
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
      // `.claude/agents/<id>.md` may be the user's own — Copilot and Cursor read
      // this directory too, so people hand-write agents in it. Only replace a
      // file the previous install recorded as ours.
      const outcome = writeManagedFile({
          absPath: destPath,
          relPath: paths.relAgentFile(agentId),
          content: installedContent,
          previouslyManaged: this.previouslyManaged,
          previousHashes: this.previousFileHashes,
          sectionHashes: this.previousSectionHashes,
          acknowledgedHashes: this.acknowledgedFileHashes,
          projectPath: this.projectRoot,
        });
      // 'drifted': the file changed after we wrote it, so it was backed up and
      // left in place. Nothing was written, exactly as with 'preserved'.
      if (outcome === 'preserved' || outcome === 'drifted') {
        this.preservedAgents.push(agentId);
        if (outcome === 'drifted') {
          // Still ours, so it stays in the manifest — otherwise uninstall would
          // walk past it. Recorded at the baseline hash so the next scan still
          // reports the drift instead of adopting it.
          const rel = paths.relAgentFile(agentId);
          manifest.files.push({ path: rel, type: 'agent', source: agentFile });
          if (extendedManifest) {
            trackManifestFile(extendedManifest, projectPath, rel, 'agent', agentFile,
              undefined, this.previousFileHashes?.get(rel));
          }
        }
        return true;
      }
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
      // `.claude/agents/<id>.md` may be the user's own — Copilot and Cursor read
      // this directory too, so people hand-write agents in it. Only replace a
      // file the previous install recorded as ours.
      const outcome = writeManagedFile({
          absPath: destPath,
          relPath: paths.relAgentFile(agentId),
          content: installedContent,
          previouslyManaged: this.previouslyManaged,
          previousHashes: this.previousFileHashes,
          sectionHashes: this.previousSectionHashes,
          acknowledgedHashes: this.acknowledgedFileHashes,
          projectPath: this.projectRoot,
        });
      // 'drifted': the file changed after we wrote it, so it was backed up and
      // left in place. Nothing was written, exactly as with 'preserved'.
      if (outcome === 'preserved' || outcome === 'drifted') {
        this.preservedAgents.push(agentId);
        if (outcome === 'drifted') {
          // Still ours, so it stays in the manifest — otherwise uninstall would
          // walk past it. Recorded at the baseline hash so the next scan still
          // reports the drift instead of adopting it.
          const rel = paths.relAgentFile(agentId);
          manifest.files.push({ path: rel, type: 'agent', source: agentFile });
          if (extendedManifest) {
            trackManifestFile(extendedManifest, projectPath, rel, 'agent', agentFile,
              undefined, this.previousFileHashes?.get(rel));
          }
        }
        return true;
      }
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

    const body = lines.join('\n');
    const readmePath = path.join(skillsDir, '_README.md');
    fs.writeFileSync(readmePath, body);

    const relReadme = paths.relSkillDir('_README.md');
    manifest.files.push({ path: relReadme, type: 'skill', source: 'generated' });
    if (extendedManifest) {
      trackManifestFile(extendedManifest, projectPath, relReadme, 'skill');
    }

    // Codex, Gemini and Kimi read only the mirror, so an index that lives solely
    // in `.claude/skills` is invisible to them — the docstring claiming the two
    // trees stay byte-identical was false.
    const mirrorRoot = path.join(projectPath, ...AGENTS_SKILLS_DIR.split('/'));
    if (fs.existsSync(mirrorRoot)) {
      fs.writeFileSync(path.join(mirrorRoot, '_README.md'), body);
      const relMirrorReadme = `${AGENTS_SKILLS_DIR}/_README.md`;
      manifest.files.push({ path: relMirrorReadme, type: 'skill', source: 'generated' });
      if (extendedManifest) {
        trackManifestFile(extendedManifest, projectPath, relMirrorReadme, 'skill');
      }
    }

    logger.info('Lazy skills README written', {
      context: { preloadedCount: preloadedSkillPaths.size, readmePath },
    });
  }
}
