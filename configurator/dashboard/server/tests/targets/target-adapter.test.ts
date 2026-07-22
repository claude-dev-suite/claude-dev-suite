/**
 * Tests for the target adapter seam.
 *
 * The end-to-end behaviour of the Claude Code adapter is already covered by
 * installation.service.test.ts, which drives it through a real install. What
 * these tests lock is the seam itself:
 *  - the registry cannot drift from the UI gate (`isImplemented`)
 *  - an adapter is usable standalone, without the service that normally drives
 *    it — which is the whole point of extracting it
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getAdapter, listAdapterTargets, ClaudeCodeAdapter } from '../../src/services/targets/adapters/index.js';
import { isImplemented, listImplementedTargets, TARGET_LAYOUTS } from '../../src/services/targets/target-layout.js';
import { targetPaths } from '../../src/services/targets/target-paths.js';
import type { InstallPlan } from '../../src/services/targets/target-adapter.js';
import type { InstallManifest } from '../../src/types.js';
import type { ExtendedManifest } from '../../src/types/index.js';

describe('adapter registry', () => {
  it('exposes an adapter for exactly the targets reported as implemented', () => {
    // If these drift, the UI offers a target nothing can write (or hides one
    // that works). Keeping them equal is cheaper than debugging either.
    expect(listAdapterTargets().sort()).toEqual(listImplementedTargets().map(l => l.id).sort());
  });

  it('every registered adapter has a layout descriptor', () => {
    for (const target of listAdapterTargets()) {
      expect(TARGET_LAYOUTS[target]).toBeDefined();
      expect(getAdapter(target).layout.id).toBe(target);
    }
  });

  it('throws a named error for a target with a descriptor but no adapter', () => {
    // Codex has a descriptor (Phase 3 foundations) but its TOML adapter hasn't
    // landed, so it is not yet implemented.
    expect(isImplemented('codex')).toBe(false);
    expect(() => getAdapter('codex')).toThrow(/No adapter implemented/);
  });

  it('reports the Tier 1 targets and Gemini as implemented', () => {
    expect(isImplemented('copilot')).toBe(true);
    expect(isImplemented('cursor')).toBe(true);
    expect(isImplemented('gemini')).toBe(true);
  });
});

describe('ClaudeCodeAdapter.write', () => {
  let projectPath: string;

  beforeEach(() => {
    projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-adapter-'));
  });

  afterEach(() => {
    fs.rmSync(projectPath, { recursive: true, force: true });
  });

  function emptyPlan(overrides: Partial<InstallPlan> = {}): InstallPlan {
    return {
      projectPath,
      devSuiteDir: projectPath, // unused when no agents/rules are installed
      agents: [],
      mcpServers: [],
      rules: [],
      envVars: {},
      skillLoadingMode: 'eager',
      agentCatalog: [],
      mcpCatalog: [],
      targets: ['claude-code'],
      ...overrides,
    };
  }

  function manifests(): { manifest: InstallManifest; extendedManifest: ExtendedManifest } {
    return {
      manifest: {
        version: '1.0.0',
        installedAt: '2026-01-01T00:00:00.000Z',
        projectPath,
        agents: [],
        mcpServers: [],
        rules: [],
        files: [],
      },
      extendedManifest: {
        version: '1.0.0',
        installedAt: '2026-01-01T00:00:00.000Z',
        projectPath,
        agents: [],
        mcpServers: [],
        features: {},
        files: [],
        upgradeHistory: [],
        targets: ['claude-code'],
      },
    };
  }

  it('runs standalone, without the installation service', async () => {
    const adapter = new ClaudeCodeAdapter();
    const { manifest, extendedManifest } = manifests();

    const result = await adapter.write({
      plan: emptyPlan(),
      paths: targetPaths(projectPath),
      mcpServers: {},
      manifest,
      extendedManifest,
    });

    expect(result.ruleFiles).toEqual([]);
    expect(result.validatorHookConfigured).toBe(false);
    expect(result.skipped).toEqual([]);

    // The Claude Code adapter writes its own config (agents/skills are the
    // shared substrate, written by the service, not the adapter).
    expect(fs.existsSync(path.join(projectPath, '.mcp.json'))).toBe(true);
    expect(fs.existsSync(path.join(projectPath, '.claude', 'settings.json'))).toBe(true);
  });

  it('serializes MCP servers under the mcpServers key Claude Code expects', async () => {
    const adapter = new ClaudeCodeAdapter();
    const { manifest, extendedManifest } = manifests();

    await adapter.write({
      plan: emptyPlan(),
      paths: targetPaths(projectPath),
      mcpServers: {
        documentation: { command: 'node', args: ['/abs/dist/index.js'], env: { KB: '1' } },
      },
      manifest,
      extendedManifest,
    });

    const written = JSON.parse(fs.readFileSync(path.join(projectPath, '.mcp.json'), 'utf-8'));
    // Guards the divergence documented in ASSISTANT-FORMAT-REFERENCE 2.5:
    // Copilot's VS Code surface uses `servers`, Claude Code uses `mcpServers`.
    expect(Object.keys(written)).toEqual(['mcpServers']);
    expect(written.mcpServers.documentation).toEqual({
      command: 'node',
      args: ['/abs/dist/index.js'],
      env: { KB: '1' },
    });
    expect(manifest.files.some(f => f.path === '.mcp.json')).toBe(true);
  });

  it('raises the skill listing budget, preserving an existing user value', async () => {
    const adapter = new ClaudeCodeAdapter();
    const claudeDir = path.join(projectPath, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeDir, 'settings.json'),
      JSON.stringify({ skillListingBudgetFraction: 0.01, env: { KEEP: 'me' } })
    );

    const { manifest, extendedManifest } = manifests();
    await adapter.write({
      plan: emptyPlan(),
      paths: targetPaths(projectPath),
      mcpServers: {},
      manifest,
      extendedManifest,
    });

    const settings = JSON.parse(fs.readFileSync(path.join(claudeDir, 'settings.json'), 'utf-8'));
    // The user knows their context budget better than we do.
    expect(settings.skillListingBudgetFraction).toBe(0.01);
    expect(settings.env).toEqual({ KEEP: 'me' });
  });

  it('sets the budget when the settings file has no opinion yet', async () => {
    const adapter = new ClaudeCodeAdapter();
    const { manifest, extendedManifest } = manifests();

    await adapter.write({
      plan: emptyPlan(),
      paths: targetPaths(projectPath),
      mcpServers: {},
      manifest,
      extendedManifest,
    });

    const settings = JSON.parse(
      fs.readFileSync(path.join(projectPath, '.claude', 'settings.json'), 'utf-8')
    );
    expect(settings.skillListingBudgetFraction).toBe(0.05);
  });

  it('tags every file it records with its own target', async () => {
    const adapter = new ClaudeCodeAdapter();
    const { manifest, extendedManifest } = manifests();

    await adapter.write({
      plan: emptyPlan(),
      paths: targetPaths(projectPath),
      mcpServers: {},
      manifest,
      extendedManifest,
    });

    expect(extendedManifest.files.length).toBeGreaterThan(0);
    expect(extendedManifest.files.every(f => f.target === 'claude-code')).toBe(true);
  });
});
