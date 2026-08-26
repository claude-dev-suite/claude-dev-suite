/**
 * Install backup and rollback.
 *
 * `install()` wrote straight into the project with no snapshot, and it writes
 * the manifest last. A throw part-way through the adapter loop therefore left
 * every already-written file on disk with no record of it — the user's
 * `.mcp.json` overwritten, `.claude/` and `.mcp-servers/` populated — while
 * `getStatus()` reported "not installed", so the dashboard offered the wizard
 * again over a half-installed project.
 *
 * `.cursor/mcp.json` existing as a *directory* is the trigger used here: it is
 * a real thing that happens (a stray mkdir, a bad merge) and it makes the
 * Cursor adapter throw after the Claude Code adapter has already written.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { InstallationService } from '../../src/services/installation.service.js';
import {
  snapshotBeforeInstall,
  rollbackInstall,
  discardSnapshot,
} from '../../src/services/installation/write-guard.js';
import {
  createTempDir,
  cleanupTempDir,
  createMockDevSuiteDir,
  createMockProject,
} from '../test-utils.js';

describe('snapshotBeforeInstall / rollbackInstall', () => {
  let projectDir: string;
  const write = (rel: string, body: string) => {
    const full = path.join(projectDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  };
  const read = (rel: string) => fs.readFileSync(path.join(projectDir, rel), 'utf-8');
  const exists = (rel: string) => fs.existsSync(path.join(projectDir, rel));

  beforeEach(() => { projectDir = createTempDir('guard-'); });
  afterEach(() => { cleanupTempDir(projectDir); });

  it('captures files that exist and records the ones that do not', () => {
    write('.mcp.json', '{"mcpServers":{"mine":{}}}');

    const snap = snapshotBeforeInstall(projectDir, ['claude-code'], 'fixed');

    expect(snap.backupDir).toContain('.dev-suite-backup-fixed');
    expect(snap.captured).toContain('.mcp.json');
    expect(snap.absent).toContain('.claude');
    expect(fs.existsSync(path.join(snap.backupDir, '.mcp.json'))).toBe(true);
  });

  it('restores a mutated file to its exact previous bytes', () => {
    const original = '{\n  "mcpServers": { "mine": { "command": "node" } }\n}\n';
    write('.mcp.json', original);

    const snap = snapshotBeforeInstall(projectDir, ['claude-code'], 'fixed');
    write('.mcp.json', '{"mcpServers":{}}');
    rollbackInstall(projectDir, snap);

    expect(read('.mcp.json')).toBe(original);
  });

  it('deletes a surface that did not exist before the attempt', () => {
    const snap = snapshotBeforeInstall(projectDir, ['claude-code'], 'fixed');
    write('.claude/agents/react-expert.md', 'half-written');
    write('.mcp-servers/documentation/index.js', 'half-written');

    rollbackInstall(projectDir, snap);

    expect(exists('.claude')).toBe(false);
    expect(exists('.mcp-servers')).toBe(false);
  });

  it('restores a directory tree, dropping files the attempt added to it', () => {
    write('.claude/settings.json', '{"permissions":{"allow":["Bash(npm test)"]}}');

    const snap = snapshotBeforeInstall(projectDir, ['claude-code'], 'fixed');
    write('.claude/agents/react-expert.md', 'added by the failed attempt');
    write('.claude/settings.json', '{"skillListingBudgetFraction":0.05}');

    rollbackInstall(projectDir, snap);

    expect(JSON.parse(read('.claude/settings.json')).permissions.allow).toEqual(['Bash(npm test)']);
    expect(exists('.claude/agents/react-expert.md')).toBe(false);
  });

  it('discardSnapshot removes the backup directory', () => {
    const snap = snapshotBeforeInstall(projectDir, ['claude-code'], 'fixed');
    expect(fs.existsSync(snap.backupDir)).toBe(true);
    discardSnapshot(snap);
    expect(fs.existsSync(snap.backupDir)).toBe(false);
  });
});

describe('install() rolls back a failed attempt', () => {
  let svc: InstallationService;
  let devSuiteDir: string;
  let projectDir: string;

  const write = (rel: string, body: string) => {
    const full = path.join(projectDir, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  };
  const read = (rel: string) => fs.readFileSync(path.join(projectDir, rel), 'utf-8');
  const exists = (rel: string) => fs.existsSync(path.join(projectDir, rel));

  beforeEach(() => {
    devSuiteDir = createTempDir('guard-devsuite-');
    projectDir = createTempDir('guard-project-');
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

  const install = (targets: string[]) =>
    svc.install({
      projectPath: projectDir,
      agents: ['typescript-expert'],
      mcpServers: ['documentation'],
      envVars: {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      targets: targets as any,
    });

  it('leaves the project exactly as it was when an adapter throws', async () => {
    const userMcp = '{\n  "mcpServers": {\n    "mine": { "command": "node", "args": ["m.js"] }\n  }\n}\n';
    const userAgents = '# House rules\n\nNever use `any`.\n';
    write('.mcp.json', userMcp);
    write('AGENTS.md', userAgents);

    // A directory where the Cursor adapter expects to write a file.
    fs.mkdirSync(path.join(projectDir, '.cursor', 'mcp.json'), { recursive: true });

    await expect(install(['claude-code', 'cursor'])).rejects.toThrow();

    // The user's own files are byte-identical again...
    expect(read('.mcp.json')).toBe(userMcp);
    expect(read('AGENTS.md')).toBe(userAgents);

    // ...and nothing half-written survives.
    expect(exists('.claude')).toBe(false);
    expect(exists('.mcp-servers')).toBe(false);
    expect(exists('.dev-suite-manifest.json')).toBe(false);
    expect(exists('.dev-suite.json')).toBe(false);
  });

  it('reports the project as not installed after a rollback, consistently with disk', async () => {
    fs.mkdirSync(path.join(projectDir, '.cursor', 'mcp.json'), { recursive: true });

    await expect(install(['claude-code', 'cursor'])).rejects.toThrow();

    const status = await svc.getStatus(projectDir);
    expect(status.installed).toBe(false);
    // The old failure mode: getStatus() said this while `.claude/` was populated.
    expect(exists('.claude/agents')).toBe(false);
  });

  it('leaves no backup directory behind on success', async () => {
    await install(['claude-code']);

    const leftovers = fs.readdirSync(projectDir).filter(e => e.startsWith('.dev-suite-backup-'));
    expect(leftovers).toEqual([]);
    expect(exists('.dev-suite-manifest.json')).toBe(true);
  });

  it('honours createBackup:false, the flag the reinstall flow uses', async () => {
    // Reinstall snapshots the same surfaces itself; a second backup would be
    // wasted work and would leave two backup directories behind.
    await svc.install({
      projectPath: projectDir,
      agents: ['typescript-expert'],
      mcpServers: [],
      envVars: {},
      createBackup: false,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      targets: ['claude-code'] as any,
    });

    expect(exists('.dev-suite-manifest.json')).toBe(true);
  });
});
