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
  });

  afterEach(() => {
    cleanupTempDir(devSuiteDir);
    cleanupTempDir(projectDir);
    delete process.env.DEV_SUITE_DIR;
    vi.restoreAllMocks();
  });

  const installBase = (agents = ['typescript-expert']) =>
    installationService.install({ projectPath: projectDir, agents, mcpServers: [], envVars: {}, skillLoadingMode: 'eager' });

  const readDevSuiteJson = () =>
    JSON.parse(fs.readFileSync(path.join(projectDir, '.dev-suite.json'), 'utf-8'));
  const writeDevSuiteJson = (cfg: unknown) =>
    fs.writeFileSync(path.join(projectDir, '.dev-suite.json'), JSON.stringify(cfg, null, 2));

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

  it('opt-out keep preserves a locally modified managed agent and re-tracks its hash', async () => {
    await installBase();
    const agentPath = path.join(projectDir, '.claude', 'agents', 'typescript-expert.md');
    const edited = fs.readFileSync(agentPath, 'utf-8') + '\n<!-- user tweak -->\n';
    fs.writeFileSync(agentPath, edited);

    // preview should flag it
    const preview = await reinstallService.previewReinstall(projectDir);
    expect(preview.modifiedManagedFiles.map(f => f.path)).toContain('.claude/agents/typescript-expert.md');

    const result = await reinstallService.executeReinstall({
      projectPath: projectDir,
      resolutions: { '.claude/agents/typescript-expert.md': 'keep' },
    });

    expect(result.success).toBe(true);
    expect(result.keptFiles).toContain('.claude/agents/typescript-expert.md');
    expect(fs.readFileSync(agentPath, 'utf-8')).toBe(edited);

    // a fresh preview should NOT flag it anymore (hash re-tracked)
    const preview2 = await reinstallService.previewReinstall(projectDir);
    expect(preview2.modifiedManagedFiles.map(f => f.path)).not.toContain('.claude/agents/typescript-expert.md');
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

  it('produces .mcp.json with absolute server paths after reinstall (lazy mode)', async () => {
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

    const mcp = JSON.parse(fs.readFileSync(path.join(projectDir, '.mcp.json'), 'utf-8'));
    for (const entry of Object.values(mcp.mcpServers ?? {}) as Array<{ args?: string[] }>) {
      const scriptArg = entry.args?.find(a => a.endsWith('.js'));
      if (scriptArg) expect(path.isAbsolute(scriptArg)).toBe(true);
    }
    expect(result.verifyWarnings).toEqual([]);
  });

  it('previewReinstall counts managed skill dirs on disk (not from manifest)', async () => {
    await installBase();
    // Skill dirs are not tracked in the manifest (a directory hashes to null),
    // so this count must come from scanning .claude/skills/ on disk.
    const m = JSON.parse(
      fs.readFileSync(path.join(projectDir, '.dev-suite-manifest.json'), 'utf-8')
    ) as { files: Array<{ type: string }> };
    expect(m.files.some(f => f.type === 'skill')).toBe(false);

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
});
