/**
 * Slash-command installation.
 *
 * The installer never wrote `.claude/commands` while uninstall listed that
 * directory in its recursive `dirsToRemove` — so three docs promised commands a
 * wizard install never produced, and uninstall deleted a directory dev-suite had
 * not created, taking any user-authored command with it. These tests pin both
 * halves of the fix.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { InstallationService } from '../../src/services/installation.service.js';
import { projectCommandFiles } from '../../src/services/installation/commands.js';
import {
  createTempDir,
  cleanupTempDir,
  createMockDevSuiteDir,
  createMockProject,
} from '../test-utils.js';

describe('slash-command installation', () => {
  let svc: InstallationService;
  let devSuiteDir: string;
  let projectDir: string;

  const write = (rel: string, body: string) => {
    const full = path.join(devSuiteDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  };
  const exists = (rel: string) => fs.existsSync(path.join(projectDir, rel));
  const readJson = (rel: string) =>
    JSON.parse(fs.readFileSync(path.join(projectDir, rel), 'utf-8'));

  beforeEach(() => {
    devSuiteDir = createTempDir('cmd-devsuite-');
    projectDir = createTempDir('cmd-project-');
    createMockDevSuiteDir(devSuiteDir);
    createMockProject(projectDir, { packageJson: { name: 'test-project' }, hasGit: true });

    write('commands/docs.md', '---\nname: docs\n---\nFetch docs.\n');
    write('commands/show-config.md', '---\nname: show-config\n---\nShow config.\n');
    write('commands/README.md', '# Commands index\n');
    write('commands/release-promote.md', '---\nname: release-promote\n---\nMaintainer only.\n');

    svc = new InstallationService();
    process.env.DEV_SUITE_DIR = devSuiteDir;
  });

  afterEach(() => {
    cleanupTempDir(devSuiteDir);
    cleanupTempDir(projectDir);
    delete process.env.DEV_SUITE_DIR;
  });

  const install = (targets: string[]) =>
    svc.install({
      projectPath: projectDir,
      agents: ['typescript-expert'],
      mcpServers: ['documentation'],
      envVars: {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      targets: targets as any,
    });

  it('excludes the index and maintainer-only commands from the project set', () => {
    const files = projectCommandFiles(devSuiteDir);
    expect(files).toContain('docs.md');
    expect(files).toContain('show-config.md');
    expect(files).not.toContain('README.md');
    expect(files).not.toContain('release-promote.md');
  });

  it('installs the project-facing commands and tracks them in the manifest', async () => {
    await install(['claude-code']);

    expect(exists('.claude/commands/docs.md')).toBe(true);
    expect(exists('.claude/commands/show-config.md')).toBe(true);
    expect(exists('.claude/commands/README.md')).toBe(false);
    expect(exists('.claude/commands/release-promote.md')).toBe(false);

    const manifest = readJson('.dev-suite-manifest.json');
    const tracked = manifest.files.filter((f: { path: string }) =>
      f.path.startsWith('.claude/commands/')
    );
    expect(tracked.map((f: { path: string }) => f.path).sort()).toEqual([
      '.claude/commands/docs.md',
      '.claude/commands/show-config.md',
    ]);
    for (const f of tracked) {
      expect(f.target).toBe('claude-code');
      expect(f.hash).toBeTruthy();
    }
  });

  it('writes no commands when Claude Code is not a target', async () => {
    await install(['copilot']);

    expect(exists('.claude/agents/typescript-expert.md')).toBe(true);
    expect(exists('.claude/commands')).toBe(false);
  });

  it('uninstall removes its own commands but keeps user-authored ones', async () => {
    await install(['claude-code']);

    const userCommand = path.join(projectDir, '.claude/commands/my-own.md');
    fs.writeFileSync(userCommand, '---\nname: my-own\n---\nMine.\n');

    await svc.uninstall(projectDir);

    expect(exists('.claude/commands/docs.md')).toBe(false);
    expect(exists('.claude/commands/show-config.md')).toBe(false);
    expect(fs.existsSync(userCommand)).toBe(true);
  });
});
