/**
 * Degradation reporting and native-agent pruning.
 *
 * The capability contract exists so that nothing a user asked for is dropped
 * silently. In practice it was: every adapter's `skipped` list ended in one
 * `logger.info` and reached neither the API response, the manifest, nor the UI.
 * Codex did not even build a list — it ignored `plan.rules` entirely — and
 * Gemini/Kimi gave a wrong cause ("no glob-scoped rules") plus a false
 * reassurance for a different thing that was not dropped.
 *
 * Separately, native subagent files were written per id and never pruned, so a
 * deselected agent stayed invocable as `@<id>` with no removal path.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { InstallationService } from '../../src/services/installation.service.js';
import {
  createTempDir,
  cleanupTempDir,
  createMockDevSuiteDir,
  createMockProject,
} from '../test-utils.js';

describe('skipped capabilities reach the caller and the manifest', () => {
  let svc: InstallationService;
  let devSuiteDir: string;
  let projectDir: string;

  const read = (rel: string) => fs.readFileSync(path.join(projectDir, rel), 'utf-8');
  const exists = (rel: string) => fs.existsSync(path.join(projectDir, rel));

  beforeEach(() => {
    devSuiteDir = createTempDir('cap-ds-');
    projectDir = createTempDir('cap-proj-');
    createMockDevSuiteDir(devSuiteDir);
    createMockProject(projectDir, { packageJson: { name: 'test-project' }, hasGit: true });
    fs.mkdirSync(path.join(devSuiteDir, 'rules', 'git'), { recursive: true });
    fs.writeFileSync(path.join(devSuiteDir, 'rules', 'git', 'semver.md'), '# semver\n');
    svc = new InstallationService();
    process.env.DEV_SUITE_DIR = devSuiteDir;
  });

  afterEach(() => {
    cleanupTempDir(devSuiteDir);
    cleanupTempDir(projectDir);
    delete process.env.DEV_SUITE_DIR;
  });

  const install = (targets: string[], agents = ['typescript-expert'], rules: string[] = []) =>
    svc.install({
      projectPath: projectDir,
      agents,
      mcpServers: [],
      envVars: {},
      rules,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      targets: targets as any,
    });

  it('returns the degradations on the manifest instead of only logging them', async () => {
    const manifest = await install(['cline'], ['typescript-expert'], ['semver']);

    expect(manifest.skipped).toBeDefined();
    const capabilities = manifest.skipped!.map(s => s.capability);
    expect(capabilities).toContain('mcp');
    expect(capabilities).toContain('rule-templates');
    for (const entry of manifest.skipped!) {
      expect(entry.target).toBe('cline');
      expect(entry.reason.length).toBeGreaterThan(20);
    }
  });

  it('persists them to the on-disk manifest so they survive the run', async () => {
    await install(['cline'], ['typescript-expert'], ['semver']);

    const onDisk = JSON.parse(read('.dev-suite-manifest.json'));
    expect(onDisk.skipped.some((s: { capability: string }) => s.capability === 'rule-templates')).toBe(true);
  });

  it('omits the field entirely when nothing was degraded', async () => {
    const manifest = await install(['claude-code']);
    expect(manifest.skipped).toBeUndefined();
  });

  it('Codex reports dropped rule templates instead of ignoring plan.rules', async () => {
    const manifest = await install(['codex'], ['typescript-expert'], ['semver']);

    const ruleSkip = manifest.skipped?.find(
      s => s.target === 'codex' && s.capability === 'rule-templates'
    );
    expect(ruleSkip).toBeDefined();
    expect(ruleSkip!.reason).toContain('AGENTS.md');
  });

  it('names the real cause for a glob-less target, not "no glob-scoped rules"', async () => {
    const manifest = await install(['gemini'], ['typescript-expert'], ['semver']);

    const ruleSkip = manifest.skipped?.find(s => s.capability === 'rule-templates');
    expect(ruleSkip).toBeDefined();
    // The dropped thing is the rule *templates*; routing is unaffected, and the
    // old wording blamed the glob mechanism, which is a different feature.
    expect(ruleSkip!.reason).toContain('rule templates');
    expect(ruleSkip!.reason).toContain('routing is unaffected');
  });

  it('tags each degradation with the assistant it belongs to', async () => {
    const manifest = await install(['cline', 'codex'], ['typescript-expert'], ['semver']);

    const targets = new Set(manifest.skipped!.map(s => s.target));
    expect(targets.has('cline')).toBe(true);
    expect(targets.has('codex')).toBe(true);
  });
});

describe('native subagent files are pruned when an agent is deselected', () => {
  let svc: InstallationService;
  let devSuiteDir: string;
  let projectDir: string;

  const exists = (rel: string) => fs.existsSync(path.join(projectDir, rel));

  beforeEach(() => {
    devSuiteDir = createTempDir('prune-ds-');
    projectDir = createTempDir('prune-proj-');
    createMockDevSuiteDir(devSuiteDir);
    createMockProject(projectDir, { packageJson: { name: 'test-project' }, hasGit: true });
    svc = new InstallationService();
    process.env.DEV_SUITE_DIR = devSuiteDir;
  });

  afterEach(() => {
    cleanupTempDir(devSuiteDir);
    cleanupTempDir(projectDir);
    delete process.env.DEV_SUITE_DIR;
  });

  const install = (targets: string[], agents: string[]) =>
    svc.install({
      projectPath: projectDir,
      agents,
      mcpServers: [],
      envVars: {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      targets: targets as any,
    });

  it('removes the Gemini subagent of an agent no longer installed', async () => {
    await install(['gemini'], ['typescript-expert', 'vitest-expert']);
    expect(exists('.gemini/agents/vitest-expert.md')).toBe(true);

    await install(['gemini'], ['typescript-expert']);

    // Left behind, `@vitest-expert` stayed live in Gemini forever: the manifest
    // is rebuilt from scratch, so no removal path could see it.
    expect(exists('.gemini/agents/vitest-expert.md')).toBe(false);
    expect(exists('.gemini/agents/typescript-expert.md')).toBe(true);
  });

  it('removes the Kimi subagent of an agent no longer installed', async () => {
    await install(['kimi-code'], ['typescript-expert', 'vitest-expert']);
    expect(exists('.kimi-code/agents/vitest-expert.md')).toBe(true);

    await install(['kimi-code'], ['typescript-expert']);

    expect(exists('.kimi-code/agents/vitest-expert.md')).toBe(false);
  });

  it('leaves a file the user put in the same directory alone', async () => {
    await install(['gemini'], ['typescript-expert', 'vitest-expert']);

    const mine = path.join(projectDir, '.gemini/agents/my-own.md');
    fs.writeFileSync(mine, 'hand-written');

    await install(['gemini'], ['typescript-expert']);

    // Pruning is scoped to what the previous manifest recorded, never a wipe of
    // the directory.
    expect(fs.readFileSync(mine, 'utf-8')).toBe('hand-written');
  });
});
