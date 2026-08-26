/**
 * Rule-id path safety.
 *
 * `rules` is `z.array(z.string())` with no pattern, and the id was interpolated
 * straight into both the source lookup (`rules/<category>/<id>.md`) and the
 * destination (`.claude/rules/<id>.md`). `rules: ['../../README']` therefore
 * overwrote a project's own README.md with dev-suite's, with no backup and no
 * error.
 *
 * The guard cannot live in the request schema alone: `reinstall.service.ts`
 * reads the id list back out of the project's own `.dev-suite.json` during a
 * Sync, which never passes through validation — so a hostile or corrupt project
 * file reaches the same sink without any crafted HTTP request.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { InstallationService } from '../../src/services/installation.service.js';
import { RulesService, isValidRuleId } from '../../src/services/rules.service.js';
import {
  createTempDir,
  cleanupTempDir,
  createMockDevSuiteDir,
  createMockProject,
} from '../test-utils.js';

describe('isValidRuleId', () => {
  it('accepts every rule template dev-suite ships', () => {
    for (const id of ['changelog', 'readme-accuracy', 'branch-protection', 'conventional-commits', 'semver']) {
      expect(isValidRuleId(id)).toBe(true);
    }
  });

  it('rejects traversal, separators and absolute paths', () => {
    for (const id of [
      '../../README',
      '..',
      'a/b',
      'a\\b',
      '/etc/passwd',
      'C:/Windows/system32',
      './changelog',
      'changelog/../../../x',
    ]) {
      expect(isValidRuleId(id)).toBe(false);
    }
  });

  it('rejects shapes that are not bare lowercase stems', () => {
    for (const id of ['', ' ', 'Changelog', 'change log', 'change_log', '-leading', 'x'.repeat(65), null, 5, undefined]) {
      expect(isValidRuleId(id)).toBe(false);
    }
  });
});

describe('RulesService.findRuleFile', () => {
  let devSuiteDir: string;

  beforeEach(() => {
    devSuiteDir = createTempDir('ruleid-devsuite-');
    createMockDevSuiteDir(devSuiteDir);
    fs.mkdirSync(path.join(devSuiteDir, 'rules', 'git'), { recursive: true });
    fs.writeFileSync(path.join(devSuiteDir, 'rules', 'git', 'semver.md'), '# semver\n');
    fs.writeFileSync(path.join(devSuiteDir, 'README.md'), '# dev-suite readme\n');
    process.env.DEV_SUITE_DIR = devSuiteDir;
  });

  afterEach(() => {
    cleanupTempDir(devSuiteDir);
    delete process.env.DEV_SUITE_DIR;
  });

  it('resolves a real rule', () => {
    expect(new RulesService().findRuleFile('semver')).toContain('semver.md');
  });

  it('returns null for a traversing id even when the target file exists', () => {
    // `<devSuiteDir>/rules/git/../../README.md` exists — the guard, not the
    // filesystem, is what stops this.
    expect(new RulesService().findRuleFile('../../README')).toBeNull();
  });
});

describe('rule installation refuses to write outside the rules directory', () => {
  let svc: InstallationService;
  let devSuiteDir: string;
  let projectDir: string;

  beforeEach(() => {
    devSuiteDir = createTempDir('ruleid-ds-');
    projectDir = createTempDir('ruleid-proj-');
    createMockDevSuiteDir(devSuiteDir);
    createMockProject(projectDir, { packageJson: { name: 'victim' }, hasGit: false });
    fs.mkdirSync(path.join(devSuiteDir, 'rules', 'git'), { recursive: true });
    fs.writeFileSync(path.join(devSuiteDir, 'rules', 'git', 'semver.md'), '# semver rule\n');
    fs.writeFileSync(path.join(devSuiteDir, 'README.md'), '# dev-suite readme, 30+ bytes long\n');
    svc = new InstallationService();
    process.env.DEV_SUITE_DIR = devSuiteDir;
  });

  afterEach(() => {
    cleanupTempDir(devSuiteDir);
    cleanupTempDir(projectDir);
    delete process.env.DEV_SUITE_DIR;
  });

  const install = (rules: string[]) =>
    svc.install({
      projectPath: projectDir,
      agents: [],
      mcpServers: [],
      envVars: {},
      rules,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      targets: ['claude-code'] as any,
    });

  it('leaves a project file untouched when the rule id traverses out', async () => {
    const readme = path.join(projectDir, 'README.md');
    const original = '# my precious readme\n';
    fs.writeFileSync(readme, original);

    const manifest = await install(['../../README']);

    expect(fs.readFileSync(readme, 'utf-8')).toBe(original);
    expect(manifest.rules).not.toContain('../../README');
  });

  it('still installs a legitimate rule alongside a rejected one', async () => {
    const manifest = await install(['semver', '../../README']);

    expect(manifest.rules).toEqual(['semver']);
    expect(fs.existsSync(path.join(projectDir, '.claude/rules/semver.md'))).toBe(true);
  });

  it('does not create a stray file for a rejected id', async () => {
    await install(['../../../escape']);
    const rulesDir = path.join(projectDir, '.claude/rules');
    const entries = fs.existsSync(rulesDir) ? fs.readdirSync(rulesDir) : [];
    expect(entries).toEqual([]);
  });
});
