// SPDX-License-Identifier: MIT
/**
 * Regression tests for the Tier 2 findings of the 2026-08 audit — the
 * architectural incoherences that were generating new bugs.
 *
 *  14  add/removeMcpServer bypassed adapters, writers and the manifest
 *  15  every reinstall/resync zeroed features, upgradeHistory and detectedStack
 *  16  `.github/mcp.json` hardcoded in four modules, invisible to the gate
 *  17  the path-scoped-rules capability declared twice; anyTargetLoadsAgents
 *      answered on declared paths rather than on what dev-suite writes
 *  18  AGENTS.md promised slash commands to assistants that cannot run them
 *  19  non-Claude rule files tracked under the wrong target
 *  20  the client's InstallManifest described an object no service produces
 *  21  a lost manifest silently downgraded the project to Claude Code
 *  22  the upgrade engine wrote `.claude/...` regardless of targets
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

import {
  createTempDir,
  cleanupTempDir,
  createMockDevSuiteDir,
  createMockProject,
} from './test-utils.js';
import { InstallationService } from '../src/services/installation.service.js';
import { ManagementService } from '../src/services/management.service.js';
import { UpgradeService } from '../src/services/upgrade.service.js';
import {
  getTargetLayout,
  mcpConfigFilesFor,
  anyTargetLoadsAgents,
  agentsSkillsReaders,
  listImplementedTargets,
  type TargetId,
} from '../src/services/targets/target-layout.js';
import {
  supportsPathScopedRules,
  targetsWithRuleWriters,
} from '../src/services/installation/path-scoped-rules.js';
import {
  sharedConfigCoverage,
  resolveProjectTargets,
} from '../src/services/installation/uninstall.js';

/** Every target dev-suite can install for today. */
const ALL_TARGETS: TargetId[] = listImplementedTargets().map(l => l.id);

// ─── Fixture ─────────────────────────────────────────────────────────────────

describe('Tier 2 — install pipeline invariants', () => {
  let svc: InstallationService;
  let devSuiteDir: string;
  let projectDir: string;

  beforeEach(() => {
    devSuiteDir = createTempDir('t2-devsuite-');
    projectDir = createTempDir('t2-project-');
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

  const readManifest = () =>
    JSON.parse(
      fs.readFileSync(path.join(projectDir, '.dev-suite-manifest.json'), 'utf-8')
    ) as Record<string, unknown>;

  const install = (targets: string[], extra: Record<string, unknown> = {}) =>
    svc.install({
      projectPath: projectDir,
      agents: ['typescript-expert'],
      mcpServers: ['documentation'],
      envVars: {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      targets: targets as any,
      ...extra,
    });

  // ── 15: accumulated state survives a re-install ──

  it('carries features, upgradeHistory and detectedStack across a re-install', async () => {
    await install(['claude-code'], {
      detectedStack: {
        projectType: 'fullstack',
        frontend: { framework: 'react', metaFramework: 'nextjs' },
        database: { dbType: 'postgresql' },
        isMonorepo: false,
        confidence: 0.9,
      },
    });

    // Simulate an applied upgrade feature and its history entry.
    const first = readManifest();
    first.features = { 'some-feature': { version: '1.0.0', appliedAt: '2026-01-01T00:00:00Z' } };
    first.upgradeHistory = [{ featureId: 'some-feature', appliedAt: '2026-01-01T00:00:00Z' }];
    fs.writeFileSync(
      path.join(projectDir, '.dev-suite-manifest.json'),
      JSON.stringify(first, null, 2)
    );

    // A second install with NO detectedStack — exactly what the Manage tab's
    // resync passes.
    await install(['claude-code']);

    const second = readManifest();
    expect(second.features).toHaveProperty('some-feature');
    expect(second.upgradeHistory).toHaveLength(1);
    // "omitted" must mean "unchanged", not "erase".
    expect(second.detectedStack).toMatchObject({
      projectType: 'fullstack',
      frontend: { framework: 'react', meta_framework: 'nextjs' },
      database: { db_type: 'postgresql' },
    });
  });

  it('lets an explicit detectedStack replace the stored one', async () => {
    await install(['claude-code'], {
      detectedStack: { projectType: 'frontend', isMonorepo: false, confidence: 1 },
    });
    await install(['claude-code'], {
      detectedStack: { projectType: 'backend', isMonorepo: false, confidence: 1 },
    });

    expect(readManifest().detectedStack).toMatchObject({ projectType: 'backend' });
  });

  // ── 19: rule files carry the target that wrote them ──

  it('tracks each target\'s rule files under that target', async () => {
    await install(['claude-code', 'cursor', 'copilot']);

    const files = readManifest().files as Array<{ path: string; target?: string }>;
    const byPath = (p: string) => files.find(f => f.path === p);

    const cursorRule = files.find(f => f.path.startsWith('.cursor/rules/'));
    const copilotRule = files.find(f => f.path.startsWith('.github/instructions/'));
    const claudeRule = files.find(f => f.path.startsWith('.claude/rules/'));

    // Every rule file used to be recorded as `claude-code`, which excluded the
    // other assistants' from drift detection, opt-out and the scoped backup.
    if (cursorRule) expect(cursorRule.target).toBe('cursor');
    if (copilotRule) expect(copilotRule.target).toBe('copilot');
    if (claudeRule) expect(claudeRule.target).toBe('claude-code');

    expect(byPath('.mcp.json')?.target).toBe('claude-code');
  });

  it('records the .agents/skills mirror under a target that was actually selected', async () => {
    await install(['gemini']);

    const files = readManifest().files as Array<{ path: string; target?: string }>;
    const mirror = files.filter(f => f.path.startsWith('.agents/skills/'));

    expect(mirror.length).toBeGreaterThan(0);
    for (const entry of mirror) {
      // Was hardcoded to 'codex' — a target this project never selected.
      expect(entry.target).toBe('gemini');
    }
  });

  // ── 21: the user's target selection is recorded outside the manifest ──

  it('writes targets into .dev-suite.json', async () => {
    await install(['cursor']);

    const config = JSON.parse(
      fs.readFileSync(path.join(projectDir, '.dev-suite.json'), 'utf-8')
    ) as { targets?: string[] };
    expect(config.targets).toEqual(['cursor']);
  });

  it('recovers the targets from .dev-suite.json when the manifest is gone', async () => {
    await install(['cursor']);
    fs.rmSync(path.join(projectDir, '.dev-suite-manifest.json'));

    // Previously this fell straight to [claude-code], silently rewriting a
    // Cursor-only project as a Claude Code one.
    expect(resolveProjectTargets(projectDir, null)).toEqual(['cursor']);
  });

  it('still defaults to claude-code for a project with neither file', () => {
    const bare = createTempDir('t2-bare-');
    try {
      expect(resolveProjectTargets(bare, null)).toEqual(['claude-code']);
    } finally {
      cleanupTempDir(bare);
    }
  });

  // ── 18: the Commands section is Claude-Code-only and derived ──

  it('omits the Commands section for a non-Claude install', async () => {
    const commandsSrc = path.join(devSuiteDir, 'commands');
    fs.mkdirSync(commandsSrc, { recursive: true });
    fs.writeFileSync(path.join(commandsSrc, 'reconfigure.md'), '# Reconfigure');

    await install(['cursor']);

    const agentsMd = fs.readFileSync(path.join(projectDir, 'AGENTS.md'), 'utf-8');
    expect(agentsMd).not.toContain('## Commands');
  });

  it('lists the commands actually installed when Claude Code is a target', async () => {
    // The shared mock dev-suite has no `commands/` catalog; the section is
    // derived from it, so this test supplies one.
    const commandsSrc = path.join(devSuiteDir, 'commands');
    fs.mkdirSync(commandsSrc, { recursive: true });
    fs.writeFileSync(path.join(commandsSrc, 'reconfigure.md'), '# Reconfigure');
    fs.writeFileSync(path.join(commandsSrc, 'show-config.md'), '# Show config');

    await install(['claude-code']);

    const agentsMd = fs.readFileSync(path.join(projectDir, 'AGENTS.md'), 'utf-8');
    expect(agentsMd).toContain('## Commands');

    const commandsDir = path.join(projectDir, '.claude', 'commands');
    const installedNames = fs
      .readdirSync(commandsDir)
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace(/\.md$/, ''));

    expect(installedNames.length).toBeGreaterThan(0);
    for (const name of installedNames) {
      expect(agentsMd).toContain(`/${name}`);
    }
  });

  // ── 20: the client contract matches the real response ──

  it('returns a manifest matching the declared client contract', async () => {
    // `install()` resolves to the manifest itself; the route wraps it.
    const manifest = (await install(['claude-code'])) as unknown as Record<string, unknown>;

    expect(manifest).toBeDefined();
    // Fields the contract declares…
    for (const key of ['version', 'installedAt', 'projectPath', 'agents', 'mcpServers', 'rules', 'files']) {
      expect(manifest).toHaveProperty(key);
    }
    // …and the shape of `files`, which the old declaration got wrong.
    const files = manifest.files as unknown[];
    expect(Array.isArray(files)).toBe(true);
    expect(typeof files[0]).toBe('object');
    expect(files[0]).toHaveProperty('path');
    expect(files[0]).toHaveProperty('type');
    expect(files[0]).toHaveProperty('source');
    // Fields the old declaration invented and no service produces.
    expect(manifest).not.toHaveProperty('directories');
    expect(manifest).not.toHaveProperty('envVarsAdded');
    expect(manifest).not.toHaveProperty('devSuiteVersion');
  });
});

// ─── 14: MCP add/remove goes through the target layer ────────────────────────

describe('Tier 2 #14 — add/removeMcpServer respects the selected assistants', () => {
  let install: InstallationService;
  let mgmt: ManagementService;
  let devSuiteDir: string;
  let projectDir: string;

  beforeEach(() => {
    devSuiteDir = createTempDir('t2-mcp-devsuite-');
    projectDir = createTempDir('t2-mcp-project-');
    createMockDevSuiteDir(devSuiteDir);
    createMockProject(projectDir, { packageJson: { name: 'p' }, hasGit: true });
    install = new InstallationService();
    mgmt = new ManagementService();
    process.env.DEV_SUITE_DIR = devSuiteDir;
  });

  afterEach(() => {
    cleanupTempDir(devSuiteDir);
    cleanupTempDir(projectDir);
    delete process.env.DEV_SUITE_DIR;
  });

  const readJson = (rel: string) =>
    JSON.parse(fs.readFileSync(path.join(projectDir, rel), 'utf-8')) as Record<string, never>;

  it('writes the new server into the selected assistant\'s config, not .mcp.json', async () => {
    await install.install({
      projectPath: projectDir,
      agents: ['typescript-expert'],
      mcpServers: [],
      envVars: {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      targets: ['cursor'] as any,
    });

    await mgmt.addMcpServer(projectDir, 'documentation', {});

    // The Cursor config is the one this project reads.
    const cursor = readJson('.cursor/mcp.json') as { mcpServers?: Record<string, unknown> };
    expect(cursor.mcpServers).toHaveProperty('documentation');

    // `.mcp.json` belongs to a target this project never selected; the old code
    // wrote it unconditionally.
    expect(fs.existsSync(path.join(projectDir, '.mcp.json'))).toBe(false);
  });

  it('records the added server in the manifest', async () => {
    await install.install({
      projectPath: projectDir,
      agents: ['typescript-expert'],
      mcpServers: [],
      envVars: {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      targets: ['cursor'] as any,
    });

    await mgmt.addMcpServer(projectDir, 'documentation', {});

    const manifest = readJson('.dev-suite-manifest.json') as unknown as {
      mcpServers: string[];
      files: Array<{ path: string }>;
    };
    // Neither of these was updated before: uninstall could not remove the
    // server and reinstall could not see it.
    expect(manifest.mcpServers).toContain('documentation');
    expect(manifest.files.some(f => f.path === '.cursor/mcp.json')).toBe(true);
  });

  it('un-merges the server from every assistant config on removal', async () => {
    await install.install({
      projectPath: projectDir,
      agents: ['typescript-expert'],
      mcpServers: ['documentation'],
      envVars: {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      targets: ['cursor'] as any,
    });

    await mgmt.removeMcpServer(projectDir, 'documentation');

    const cursor = readJson('.cursor/mcp.json') as { mcpServers?: Record<string, unknown> };
    expect(cursor.mcpServers ?? {}).not.toHaveProperty('documentation');
    expect(fs.existsSync(path.join(projectDir, '.mcp-servers', 'documentation'))).toBe(false);
  });

  it('preserves a user\'s own entry in the config it merges into', async () => {
    await install.install({
      projectPath: projectDir,
      agents: ['typescript-expert'],
      mcpServers: [],
      envVars: {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      targets: ['cursor'] as any,
    });

    const cursorPath = path.join(projectDir, '.cursor', 'mcp.json');
    const existing = JSON.parse(fs.readFileSync(cursorPath, 'utf-8')) as {
      mcpServers: Record<string, unknown>;
    };
    existing.mcpServers['my-own'] = { command: 'node', args: ['x.js'] };
    fs.writeFileSync(cursorPath, JSON.stringify(existing, null, 2));

    await mgmt.addMcpServer(projectDir, 'documentation', {});

    const after = readJson('.cursor/mcp.json') as { mcpServers: Record<string, unknown> };
    expect(after.mcpServers['my-own']).toEqual({ command: 'node', args: ['x.js'] });
    expect(after.mcpServers).toHaveProperty('documentation');
  });
});

// ─── 16 / 17: capabilities have exactly one declaration ─────────────────────

describe('Tier 2 #16/#17 — one declaration per capability', () => {
  it('exposes every MCP surface a target reads, Copilot\'s second included', () => {
    expect(mcpConfigFilesFor('copilot')).toEqual(['.vscode/mcp.json', '.github/mcp.json']);
    expect(mcpConfigFilesFor('cursor')).toEqual(['.cursor/mcp.json']);
    expect(mcpConfigFilesFor('claude-code')).toEqual(['.mcp.json']);
    // Cline has no project MCP config at all.
    expect(mcpConfigFilesFor('cline')).toEqual([]);
  });

  it('leaves no MCP surface without an un-merge spec', () => {
    // This gate could not see `.github/mcp.json` before, because it derived
    // from `layout.mcpConfigFile` and that path lived in four literals instead.
    expect(sharedConfigCoverage(ALL_TARGETS)).toEqual([]);
  });

  it('derives supportsPathScopedRules from the capability, and the writers agree', () => {
    for (const target of ALL_TARGETS) {
      expect(supportsPathScopedRules(target)).toBe(
        getTargetLayout(target).capabilities.pathScopedRules
      );
    }

    // The map and the capability are two encodings of one fact; assert they
    // cannot drift instead of trusting discipline.
    const withWriters = new Set(targetsWithRuleWriters());
    for (const target of ALL_TARGETS) {
      expect(withWriters.has(target)).toBe(getTargetLayout(target).capabilities.pathScopedRules);
    }
  });

  it('answers anyTargetLoadsAgents on what dev-suite writes, not on declared paths', () => {
    // Codex declares `.codex/agents` but its format is TOML and dev-suite emits
    // none, so a Codex-only install has no loadable agent — AGENTS.md must not
    // tell it to delegate with `@id`.
    expect(anyTargetLoadsAgents(['codex'])).toBe(false);
    expect(anyTargetLoadsAgents(['cline'])).toBe(false);

    // Gemini and Kimi get native agent files; Copilot and Cursor read the
    // shared `.claude/agents` substrate (format reference, matrix 2.3).
    expect(anyTargetLoadsAgents(['gemini'])).toBe(true);
    expect(anyTargetLoadsAgents(['kimi-code'])).toBe(true);
    expect(anyTargetLoadsAgents(['cursor'])).toBe(true);
    expect(anyTargetLoadsAgents(['copilot'])).toBe(true);
    expect(anyTargetLoadsAgents(['claude-code'])).toBe(true);

    // Mixed: one capable target is enough.
    expect(anyTargetLoadsAgents(['codex', 'gemini'])).toBe(true);
  });

  it('names the mirror owner from the selected targets', () => {
    expect(agentsSkillsReaders(['gemini'])).toEqual(['gemini']);
    expect(agentsSkillsReaders(['kimi-code'])).toEqual(['kimi-code']);
    expect(agentsSkillsReaders(['claude-code', 'cursor'])).toEqual([]);
    // Order follows the selection, so the owner is deterministic.
    expect(agentsSkillsReaders(['codex', 'gemini'])[0]).toBe('codex');
  });

  it('declares agentsSource for every implemented target', () => {
    for (const target of ALL_TARGETS) {
      expect(['claude', 'native', 'none']).toContain(
        getTargetLayout(target).capabilities.agentsSource
      );
    }
  });
});

// ─── 22: the upgrade engine knows it is Claude-Code-only ────────────────────

describe('Tier 2 #22 — incremental upgrades refuse a non-Claude project', () => {
  let install: InstallationService;
  let devSuiteDir: string;
  let projectDir: string;

  beforeEach(() => {
    devSuiteDir = createTempDir('t2-upg-devsuite-');
    projectDir = createTempDir('t2-upg-project-');
    createMockDevSuiteDir(devSuiteDir);
    createMockProject(projectDir, { packageJson: { name: 'p' }, hasGit: true });
    install = new InstallationService();
    process.env.DEV_SUITE_DIR = devSuiteDir;
  });

  afterEach(() => {
    cleanupTempDir(devSuiteDir);
    cleanupTempDir(projectDir);
    delete process.env.DEV_SUITE_DIR;
  });

  it('refuses, and creates no .claude tree, for a Cursor-only project', async () => {
    await install.install({
      projectPath: projectDir,
      agents: ['typescript-expert'],
      mcpServers: [],
      envVars: {},
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      targets: ['cursor'] as any,
    });

    const result = await new UpgradeService().executeUpgrade({
      projectPath: projectDir,
      featureIds: ['anything'],
      resolutions: [],
      createBackup: false,
    });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Claude Code only/i);
    expect(result.error).toMatch(/cursor/);
    expect(fs.existsSync(path.join(projectDir, '.claude', 'rules'))).toBe(false);
  });
});
