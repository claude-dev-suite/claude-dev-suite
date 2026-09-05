/**
 * Reinstall Service Tests (erase-and-replace)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ReinstallService } from '../src/services/reinstall.service.js';
import { InstallationService } from '../src/services/installation.service.js';
import {
  createTempDir,
  cleanupTempDir,
  createMockDevSuiteDir,
  createMockProject,
  createMockSkillLoader,
} from './test-utils.js';
import * as fs from 'fs';
import * as path from 'path';
import { calculateFileHash } from '../src/services/installation/file-operations.js';
import { clearDriftCache, computeSectionHash } from '../src/services/installation/drift.service.js';

describe('ReinstallService', () => {
  let reinstallService: ReinstallService;
  let installationService: InstallationService;
  let devSuiteDir: string;
  let projectDir: string;

  beforeEach(() => {
    devSuiteDir = createTempDir('reinstall-devsuite-');
    projectDir = createTempDir('reinstall-project-');
    createMockDevSuiteDir(devSuiteDir);
    createMockProject(projectDir, { packageJson: { name: 'test-project' }, hasGit: true });

    reinstallService = new ReinstallService();
    installationService = new InstallationService();
    process.env.DEV_SUITE_DIR = devSuiteDir;
    // Temp dirs churn fast enough that a stale mtime+size hit is possible; the
    // cache is a performance device, never a source of truth.
    clearDriftCache();
  });

  afterEach(() => {
    cleanupTempDir(devSuiteDir);
    cleanupTempDir(projectDir);
    delete process.env.DEV_SUITE_DIR;
    vi.restoreAllMocks();
  });

  const installBase = (agents = ['typescript-expert']) =>
    installationService.install({ projectPath: projectDir, agents, mcpServers: [], envVars: {}, skillLoadingMode: 'eager' });

  /**
   * Backfill `sectionHash` on the marked instruction files.
   *
   * `InstallationService` still records them through its own private
   * `trackFile`, which does not compute a section hash — only the shared
   * `trackManifestFile` does. Until that call site delegates, a real install
   * leaves these entries with no section baseline, so they scan as
   * `unknown-baseline`. This puts the manifest in the state the wired-up
   * install produces, so the preview contract below is tested for real.
   */
  const backfillSectionHashes = () => {
    const manifestPath = path.join(projectDir, '.dev-suite-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    for (const file of manifest.files) {
      const abs = path.join(projectDir, ...String(file.path).split('/'));
      if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
      const section = computeSectionHash(fs.readFileSync(abs, 'utf-8'));
      if (section) file.sectionHash = section;
    }
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  };

  const readDevSuiteJson = () =>
    JSON.parse(fs.readFileSync(path.join(projectDir, '.dev-suite.json'), 'utf-8'));
  const writeDevSuiteJson = (cfg: unknown) =>
    fs.writeFileSync(path.join(projectDir, '.dev-suite.json'), JSON.stringify(cfg, null, 2));

  it('round-trips a multi-target install: reinstall keeps every assistant\'s files', async () => {
    // Install Copilot + Cursor (no Claude Code target), then reinstall and
    // confirm the substrate and both assistants' config survive the
    // erase-and-replace — exercising the target-aware backup path.
    await installationService.install({
      projectPath: projectDir,
      agents: ['typescript-expert'],
      mcpServers: [],
      envVars: {},
      skillLoadingMode: 'eager',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      targets: ['copilot', 'cursor'] as any,
    });

    expect(fs.existsSync(path.join(projectDir, '.vscode', 'mcp.json'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, '.cursor', 'mcp.json'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, '.claude', 'agents', 'typescript-expert.md'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, 'CLAUDE.md'))).toBe(false);

    const result = await reinstallService.executeReinstall({ projectPath: projectDir });
    expect(result.success).toBe(true);

    // The reinstall re-targets the same assistants recorded in the manifest.
    expect(fs.existsSync(path.join(projectDir, '.vscode', 'mcp.json'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, '.cursor', 'mcp.json'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, '.claude', 'agents', 'typescript-expert.md'))).toBe(true);
    // Still no Claude Code artifacts — reinstall didn't silently add the target.
    expect(fs.existsSync(path.join(projectDir, 'CLAUDE.md'))).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(projectDir, '.dev-suite-manifest.json'), 'utf-8')).targets)
      .toEqual(['copilot', 'cursor']);
  });

  it('preserves custom agents under .claude/agents/custom/', async () => {
    await installBase();
    const customPath = path.join(projectDir, '.claude', 'agents', 'custom', 'my-agent.md');
    fs.mkdirSync(path.dirname(customPath), { recursive: true });
    fs.writeFileSync(customPath, '# My custom agent\n');

    const result = await reinstallService.executeReinstall({ projectPath: projectDir });

    expect(result.success).toBe(true);
    expect(fs.existsSync(customPath)).toBe(true);
    expect(fs.readFileSync(customPath, 'utf-8')).toBe('# My custom agent\n');
    // canonical agent reinstalled
    expect(fs.existsSync(path.join(projectDir, '.claude', 'agents', 'typescript-expert.md'))).toBe(true);
  });

  it('preserves user content in CLAUDE.md outside the dev-suite markers', async () => {
    await installBase();
    const claudeMdPath = path.join(projectDir, 'CLAUDE.md');
    const original = fs.readFileSync(claudeMdPath, 'utf-8');
    const userText = '\n\n## My project notes\nDo not delete this.\n';
    fs.writeFileSync(claudeMdPath, original + userText);

    const result = await reinstallService.executeReinstall({ projectPath: projectDir });

    expect(result.success).toBe(true);
    const after = fs.readFileSync(claudeMdPath, 'utf-8');
    expect(after).toContain('## My project notes');
    expect(after).toContain('Do not delete this.');
    expect(after).toContain('DEV-SUITE-CONFIG-START');
  });

  // CONTRACT CHANGE: `keep` used to overwrite the manifest hash with the user's
  // content, which silenced the file forever and destroyed the only record of
  // what dev-suite had written. It now means "not this run": the file survives,
  // the manifest keeps the canonical hash, and the next scan reports it again.
  // Adopting an edit permanently is `promote`.
  it('opt-out keep preserves the edit for this run and keeps the canonical hash', async () => {
    await installBase();
    const rel = '.claude/agents/typescript-expert.md';
    const agentPath = path.join(projectDir, '.claude', 'agents', 'typescript-expert.md');
    const canonical = fs.readFileSync(agentPath, 'utf-8');
    const edited = canonical + '\n<!-- user tweak -->\n';
    fs.writeFileSync(agentPath, edited);

    // preview should flag it
    const preview = await reinstallService.previewReinstall(projectDir);
    expect(preview.modifiedManagedFiles.map(f => f.path)).toContain(rel);
    expect(preview.requiresIntervention).toBe(true);

    const result = await reinstallService.executeReinstall({
      projectPath: projectDir,
      resolutions: { [rel]: 'keep' },
    });

    expect(result.success).toBe(true);
    expect(result.keptFiles).toContain(rel);
    expect(result.promotedFiles ?? []).not.toContain(rel);
    expect(fs.readFileSync(agentPath, 'utf-8')).toBe(edited);

    const entry = result.newManifest?.files.find(f => f.path === rel);
    expect(entry?.acknowledgedHash).toBeUndefined();
    expect(entry?.hash).toBe(calculateFileHash(canonical));

    // Still reported, because nobody said the edit was intentional.
    clearDriftCache();
    const preview2 = await reinstallService.previewReinstall(projectDir);
    const again = preview2.modifiedManagedFiles.find(f => f.path === rel);
    expect(again).toBeDefined();
    expect(again?.acknowledged).toBe(false);
  });

  it('promote adopts the edit: acknowledgedHash is recorded and hash stays canonical', async () => {
    await installBase();
    const rel = '.claude/agents/typescript-expert.md';
    const agentPath = path.join(projectDir, '.claude', 'agents', 'typescript-expert.md');
    const canonical = fs.readFileSync(agentPath, 'utf-8');
    const edited = canonical + '\n<!-- deliberate, adopted -->\n';
    fs.writeFileSync(agentPath, edited);

    const result = await reinstallService.executeReinstall({
      projectPath: projectDir,
      resolutions: { [rel]: 'promote' },
    });

    expect(result.success).toBe(true);
    expect(result.promotedFiles).toContain(rel);
    expect(fs.readFileSync(agentPath, 'utf-8')).toBe(edited);

    const entry = result.newManifest?.files.find(f => f.path === rel);
    // The two questions stay separately answerable: `hash` is still what
    // dev-suite wrote, `acknowledgedHash` is what a human adopted.
    expect(entry?.hash).toBe(calculateFileHash(canonical));
    expect(entry?.acknowledgedHash).toBe(calculateFileHash(edited));
    expect(entry?.acknowledgedAt).toBeTruthy();

    // Reported for visibility, but settled — no decision needed.
    clearDriftCache();
    const preview = await reinstallService.previewReinstall(projectDir);
    const listed = preview.modifiedManagedFiles.find(f => f.path === rel);
    expect(listed?.acknowledged).toBe(true);
    expect(preview.requiresIntervention).toBe(false);
  });

  // CONTRACT CHANGE: instruction files are tracked as `generated`, which
  // classify() maps to 'skip', so preview never looked at their hash. An agent
  // rewriting the routing section of AGENTS.md produced no signal at all.
  it('reports drift inside the AGENTS.md markers, scoped to the managed section', async () => {
    await installBase();
    backfillSectionHashes();
    const agentsMd = path.join(projectDir, 'AGENTS.md');
    const content = fs.readFileSync(agentsMd, 'utf-8');
    expect(content.indexOf('<!-- DEV-SUITE-CONFIG-START -->')).toBeGreaterThanOrEqual(0);
    fs.writeFileSync(
      agentsMd,
      content.replace(
        '<!-- DEV-SUITE-CONFIG-START -->',
        '<!-- DEV-SUITE-CONFIG-START -->\nAn agent injected this line.'
      )
    );
    clearDriftCache();

    const preview = await reinstallService.previewReinstall(projectDir);
    const entry = preview.modifiedManagedFiles.find(f => f.path === 'AGENTS.md');
    expect(entry).toBeDefined();
    expect(entry?.scope).toBe('managed-section');
    expect(entry?.acknowledged).toBe(false);
    expect(preview.requiresIntervention).toBe(true);

    // Drift is NOT an erase category: AGENTS.md must never enter the erase set.
    expect(preview.filesToReplace).not.toContain('AGENTS.md');
  });

  it('does not report prose the user added outside the AGENTS.md markers', async () => {
    await installBase();
    backfillSectionHashes();
    const agentsMd = path.join(projectDir, 'AGENTS.md');
    fs.appendFileSync(agentsMd, '\n## My notes\nRun the tests before pushing.\n');
    clearDriftCache();

    const preview = await reinstallService.previewReinstall(projectDir);
    expect(preview.modifiedManagedFiles.map(f => f.path)).not.toContain('AGENTS.md');
    expect(preview.drift?.counts.driftedOutsideSection).toBeGreaterThan(0);
  });

  it('overwrites a locally modified managed agent by default (no opt-out)', async () => {
    await installBase();
    const agentPath = path.join(projectDir, '.claude', 'agents', 'typescript-expert.md');
    fs.writeFileSync(agentPath, '# clobbered by user\n');

    const result = await reinstallService.executeReinstall({ projectPath: projectDir });

    expect(result.success).toBe(true);
    const after = fs.readFileSync(agentPath, 'utf-8');
    expect(after).not.toBe('# clobbered by user\n');
    expect(after).toContain('typescript-expert');
  });

  it('removes orphaned agents no longer in the selection', async () => {
    await installBase(['typescript-expert', 'vitest-expert']);
    const orphanPath = path.join(projectDir, '.claude', 'agents', 'vitest-expert.md');
    expect(fs.existsSync(orphanPath)).toBe(true);

    // Deselect vitest-expert
    const cfg = readDevSuiteJson();
    cfg.agents.enabled = ['typescript-expert'];
    writeDevSuiteJson(cfg);

    const result = await reinstallService.executeReinstall({ projectPath: projectDir });

    expect(result.success).toBe(true);
    expect(result.orphansRemoved).toContain('.claude/agents/vitest-expert.md');
    expect(fs.existsSync(orphanPath)).toBe(false);
    expect(fs.existsSync(path.join(projectDir, '.claude', 'agents', 'typescript-expert.md'))).toBe(true);
  });

  it('rolls back to the original state when install fails mid-way', async () => {
    await installBase();
    const agentPath = path.join(projectDir, '.claude', 'agents', 'typescript-expert.md');
    const manifestPath = path.join(projectDir, '.dev-suite-manifest.json');
    const agentBefore = fs.readFileSync(agentPath, 'utf-8');
    const manifestBefore = fs.readFileSync(manifestPath, 'utf-8');

    const spy = vi
      .spyOn(InstallationService.prototype, 'install')
      .mockRejectedValueOnce(new Error('boom'));

    const result = await reinstallService.executeReinstall({ projectPath: projectDir });

    expect(spy).toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.rolledBack).toBe(true);
    // originals restored
    expect(fs.existsSync(agentPath)).toBe(true);
    expect(fs.readFileSync(agentPath, 'utf-8')).toBe(agentBefore);
    expect(fs.readFileSync(manifestPath, 'utf-8')).toBe(manifestBefore);
  });

  it('preserves user keys in .claude/settings.json', async () => {
    await installBase();
    const settingsPath = path.join(projectDir, '.claude', 'settings.json');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    settings.myCustomKey = 'keep-me';
    settings.hooks = { Stop: [{ matcher: '*', hooks: [] }] };
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    const result = await reinstallService.executeReinstall({ projectPath: projectDir });

    expect(result.success).toBe(true);
    const after = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    expect(after.myCustomKey).toBe('keep-me');
    expect(after.hooks).toBeDefined();
    expect(after.skillListingBudgetFraction).toBeDefined();
  });

  it('produces .mcp.json with portable server paths after reinstall (lazy mode)', async () => {
    createMockSkillLoader(devSuiteDir);
    // lazy mode: skill-loader auto-included
    await installationService.install({ projectPath: projectDir, agents: ['typescript-expert'], mcpServers: [], envVars: { DEV_SUITE_ROOT: devSuiteDir } });

    // create a custom skill that must survive
    const customSkill = path.join(projectDir, '.claude', 'skills', 'custom', 'SKILL.md');
    fs.mkdirSync(path.dirname(customSkill), { recursive: true });
    fs.writeFileSync(customSkill, '# custom skill\n');

    const result = await reinstallService.executeReinstall({ projectPath: projectDir });

    expect(result.success).toBe(true);
    expect(fs.existsSync(customSkill)).toBe(true);

    const raw = fs.readFileSync(path.join(projectDir, '.mcp.json'), 'utf-8');
    const mcp = JSON.parse(raw);
    for (const entry of Object.values(mcp.mcpServers ?? {}) as Array<{ args?: string[] }>) {
      const scriptArg = entry.args?.find(a => a.endsWith('.js'));
      if (!scriptArg) continue;
      // A reinstall must not re-introduce a machine-specific path: this file is
      // committed, and an absolute one is wrong on every other checkout.
      expect(path.isAbsolute(scriptArg)).toBe(false);
      expect(scriptArg).toBe('${CLAUDE_PROJECT_DIR:-.}/.mcp-servers/skill-loader/dist/index.js');
    }
    expect(raw).not.toContain(projectDir);
    expect(result.verifyWarnings).toEqual([]);
  });

  it('previewReinstall counts managed skill dirs on disk (not from manifest)', async () => {
    await installBase();
    // Skill directories ARE recorded now — they carry no hash, which used to
    // make the tracker drop them silently, leaving the mirror with no removal
    // path. The count still comes from disk, because that is what gets rebuilt.
    const m = JSON.parse(
      fs.readFileSync(path.join(projectDir, '.dev-suite-manifest.json'), 'utf-8')
    ) as { files: Array<{ type: string }> };
    expect(m.files.some(f => f.type === 'skill')).toBe(true);

    // Add a user custom skill that must NOT be counted.
    const customSkill = path.join(projectDir, '.claude', 'skills', 'custom', 'SKILL.md');
    fs.mkdirSync(path.dirname(customSkill), { recursive: true });
    fs.writeFileSync(customSkill, '# custom\n');

    const preview = await reinstallService.previewReinstall(projectDir);
    // typescript-expert ships at least one skill dir in the mock dev-suite.
    expect(preview.skillDirsToRebuild).toBeGreaterThan(0);

    // Cross-check: equals the number of non-custom top-level skill dirs on disk.
    const skillsDir = path.join(projectDir, '.claude', 'skills');
    const onDisk = fs
      .readdirSync(skillsDir, { withFileTypes: true })
      .filter(e => e.isDirectory() && e.name !== 'custom').length;
    expect(preview.skillDirsToRebuild).toBe(onDisk);
  });

  it('previewReinstall reports invalid when no manifest exists', async () => {
    const preview = await reinstallService.previewReinstall(projectDir);
    expect(preview.hasValidManifest).toBe(false);
    expect(preview.reason).toBeTruthy();
  });

  // Multi-target defect fixes (slice 2.3). These use a synthetic manifest with
  // Copilot-tagged files, which can't yet be produced by a real install, to
  // prove reinstall classifies and matches them by their own target's layout —
  // not Claude Code's — before a Copilot adapter can create one for real.
  describe('per-target file classification', () => {
    const writeManifest = (obj: unknown) =>
      fs.writeFileSync(path.join(projectDir, '.dev-suite-manifest.json'), JSON.stringify(obj, null, 2));

    const multiTargetManifest = () => ({
      version: '1.0.0',
      installedAt: '2026-01-01T00:00:00.000Z',
      projectPath: projectDir,
      agents: ['react-expert'],
      mcpServers: [],
      features: {},
      upgradeHistory: [],
      targets: ['claude-code', 'copilot'],
      files: [
        { path: '.claude/agents/react-expert.md', hash: 'h1', type: 'agent', target: 'claude-code' },
        { path: '.github/agents/react-expert.agent.md', hash: 'h2', type: 'agent', target: 'copilot' },
        { path: '.github/instructions/frontend.instructions.md', hash: 'h3', type: 'config', target: 'copilot' },
        { path: '.mcp.json', hash: 'h4', type: 'config', target: 'claude-code' },
      ],
    });

    beforeEach(() => {
      writeManifest(multiTargetManifest());
      writeDevSuiteJson({ agents: { enabled: ['react-expert'] }, mcpServers: { enabled: [] }, rules: { enabled: [] } });
    });

    it("treats a Copilot rule file as managed via Copilot's rules directory", async () => {
      const preview = await reinstallService.previewReinstall(projectDir);
      // classify() must resolve `.github/instructions` from the file's own
      // target. With Claude Code's `.claude/rules` it would fall through to
      // 'shared' and never be replaced.
      expect(preview.filesToReplace).toContain('.github/instructions/frontend.instructions.md');
    });

    it('does not flag a Copilot agent as orphan when its id is selected', async () => {
      const preview = await reinstallService.previewReinstall(projectDir);
      // componentName() must strip `.agent.md`, yielding `react-expert`. A
      // hardcoded `.md` would yield `react-expert.agent`, which isn't in the
      // selection, so the agent would be wrongly flagged for removal.
      expect(preview.orphansToRemove).not.toContain('.github/agents/react-expert.agent.md');
      expect(preview.orphansToRemove).toHaveLength(0);
    });

    it('flags a Copilot agent as orphan once its id is deselected', async () => {
      // Sanity check the negative: componentName must match against the id so
      // that a genuine orphan is still caught.
      writeDevSuiteJson({ agents: { enabled: [] }, mcpServers: { enabled: [] }, rules: { enabled: [] } });
      const preview = await reinstallService.previewReinstall(projectDir);
      expect(preview.orphansToRemove).toContain('.github/agents/react-expert.agent.md');
    });
  });
});
