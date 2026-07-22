/**
 * Tests for the target layout descriptors and the manifest target migration.
 *
 * These lock the invariants that later per-target adapters rely on:
 * - every descriptor is internally consistent with its capability flags
 * - Claude Code's layout still matches what dev-suite writes today
 * - manifests written before multi-assistant support migrate to `claude-code`
 */

import { describe, it, expect } from 'vitest';
import {
  TARGET_LAYOUTS,
  DEFAULT_TARGET,
  SHARED_INSTRUCTIONS_FILE,
  getTargetLayout,
  getManagedDirs,
  getSharedFiles,
  isImplemented,
  listImplementedTargets,
  isCustomUserPath,
  type TargetLayout,
} from '../../src/services/targets/target-layout.js';
import { migrateManifestTargets } from '../../src/services/upgrade/upgrade-utils.js';
import type { ExtendedManifest } from '../../src/types/index.js';

const definedLayouts = Object.values(TARGET_LAYOUTS).filter(Boolean) as TargetLayout[];

describe('target layout descriptors', () => {
  it('defines at least the Tier 1 targets', () => {
    expect(Object.keys(TARGET_LAYOUTS).sort()).toEqual(['claude-code', 'codex', 'copilot', 'cursor', 'gemini']);
  });

  it.each(definedLayouts.map(l => [l.id, l] as const))(
    '%s declares directories consistent with its capabilities',
    (_id, layout) => {
      if (layout.capabilities.agents) expect(layout.agentsDir).toBeTruthy();
      if (layout.capabilities.skills) expect(layout.skillsDir).toBeTruthy();
      if (layout.capabilities.commands) expect(layout.commandsDir).toBeTruthy();
      if (layout.capabilities.pathScopedRules) expect(layout.rulesDir).toBeTruthy();
      if (layout.capabilities.mcp !== 'none') expect(layout.mcpConfigFile).toBeTruthy();
      if (layout.capabilities.settings) expect(layout.settingsFile).toBeTruthy();
      expect(layout.instructionsFile).toBeTruthy();
    }
  );

  it.each(definedLayouts.map(l => [l.id, l] as const))(
    '%s uses relative, non-escaping paths',
    (_id, layout) => {
      const paths = [
        layout.configDir,
        layout.agentsDir,
        layout.skillsDir,
        layout.commandsDir,
        layout.rulesDir,
        layout.instructionsFile,
        layout.mcpConfigFile,
        layout.settingsFile,
        layout.hooksFile,
      ].filter((p): p is string => Boolean(p));

      for (const p of paths) {
        expect(p.startsWith('/')).toBe(false);
        expect(p.includes('..')).toBe(false);
        expect(p.includes('\\')).toBe(false);
      }
    }
  );

  it('keeps the Claude Code layout matching what dev-suite writes today', () => {
    const claude = getTargetLayout('claude-code');
    expect(claude.agentsDir).toBe('.claude/agents');
    expect(claude.skillsDir).toBe('.claude/skills');
    expect(claude.rulesDir).toBe('.claude/rules');
    expect(claude.instructionsFile).toBe('CLAUDE.md');
    expect(claude.mcpConfigFile).toBe('.mcp.json');
    expect(claude.settingsFile).toBe('.claude/settings.json');
  });

  it('points Copilot and Cursor at the shared instructions file', () => {
    expect(getTargetLayout('copilot').instructionsFile).toBe(SHARED_INSTRUCTIONS_FILE);
    expect(getTargetLayout('cursor').instructionsFile).toBe(SHARED_INSTRUCTIONS_FILE);
  });

  it('records that Copilot MCP config uses a different top-level key file than Claude', () => {
    // Guards against the easy mistake of reusing .mcp.json for VS Code/Copilot
    expect(getTargetLayout('copilot').mcpConfigFile).not.toBe('.mcp.json');
  });

  it('defaults to claude-code and reports the Tier 1 targets as implemented', () => {
    expect(DEFAULT_TARGET).toBe('claude-code');
    expect(isImplemented('claude-code')).toBe(true);
    expect(isImplemented('copilot')).toBe(true);
    expect(isImplemented('cursor')).toBe(true);
    // Tier 2/3 have no adapter yet.
    expect(isImplemented('codex')).toBe(false);
    expect(isImplemented('gemini')).toBe(true);
    expect(listImplementedTargets().map(l => l.id).sort()).toEqual(['claude-code', 'copilot', 'cursor', 'gemini']);
  });

  it('throws for targets without a descriptor yet', () => {
    // Tier 3 (windsurf/cline) have no descriptor yet.
    expect(() => getTargetLayout('windsurf')).toThrow(/not-yet-supported|Unknown/);
  });

  it('lists managed dirs without shared files, and vice versa', () => {
    const managed = getManagedDirs('claude-code');
    expect(managed).toContain('.claude/agents');
    expect(managed).toContain('.claude/skills');
    expect(managed).not.toContain('.claude/settings.json');

    const shared = getSharedFiles('claude-code');
    expect(shared).toContain('CLAUDE.md');
    expect(shared).toContain(SHARED_INSTRUCTIONS_FILE);
    expect(shared).toContain('.claude/settings.json');
    // No duplicates
    expect(new Set(shared).size).toBe(shared.length);
  });
});

describe('isCustomUserPath', () => {
  it.each([
    ['.claude/agents/custom/my-agent.md', true],
    ['.claude/skills/custom/my-skill/SKILL.md', true],
    ['.cursor/agents/custom/x.md', true],
    ['custom/x.md', true],
    ['.claude/agents/react-expert.md', false],
    ['.claude/skills/customer-support/SKILL.md', false],
    ['.claude/agents/mycustom/x.md', false],
  ])('%s → %s', (input, expected) => {
    expect(isCustomUserPath(input)).toBe(expected);
  });

  it('matches Windows-style separators too', () => {
    expect(isCustomUserPath('.claude\\agents\\custom\\my-agent.md')).toBe(true);
  });
});

describe('migrateManifestTargets', () => {
  function manifest(overrides: Partial<ExtendedManifest> = {}): ExtendedManifest {
    return {
      version: '1.0.0',
      installedAt: '2026-01-01T00:00:00.000Z',
      projectPath: '/tmp/project',
      agents: [],
      mcpServers: [],
      features: {},
      files: [],
      upgradeHistory: [],
      ...overrides,
    };
  }

  it('attributes a legacy manifest and its files to claude-code', () => {
    const legacy = manifest({
      files: [
        { path: '.claude/agents/react-expert.md', hash: 'a', type: 'agent' },
        { path: '.mcp.json', hash: 'b', type: 'config' },
      ],
    });

    const migrated = migrateManifestTargets(legacy);

    expect(migrated.targets).toEqual(['claude-code']);
    expect(migrated.files.every(f => f.target === 'claude-code')).toBe(true);
  });

  it('leaves an already-tagged multi-target manifest untouched', () => {
    const tagged = manifest({
      targets: ['claude-code', 'cursor'],
      files: [
        { path: '.claude/agents/a.md', hash: 'a', type: 'agent', target: 'claude-code' },
        { path: '.cursor/agents/a.md', hash: 'b', type: 'agent', target: 'cursor' },
      ],
    });

    const migrated = migrateManifestTargets(tagged);

    expect(migrated.targets).toEqual(['claude-code', 'cursor']);
    expect(migrated.files.map(f => f.target)).toEqual(['claude-code', 'cursor']);
  });

  it('fills only the untagged files in a partially tagged manifest', () => {
    const partial = manifest({
      targets: ['cursor'],
      files: [
        { path: '.cursor/agents/a.md', hash: 'a', type: 'agent', target: 'cursor' },
        { path: '.claude/agents/a.md', hash: 'b', type: 'agent' },
      ],
    });

    const migrated = migrateManifestTargets(partial);

    expect(migrated.targets).toEqual(['cursor']);
    expect(migrated.files.map(f => f.target)).toEqual(['cursor', 'claude-code']);
  });

  it('handles a manifest with no files array', () => {
    const noFiles = manifest();
    delete (noFiles as Partial<ExtendedManifest>).files;

    expect(() => migrateManifestTargets(noFiles)).not.toThrow();
    expect(noFiles.targets).toEqual(['claude-code']);
  });

  it('treats an empty targets array as legacy', () => {
    const migrated = migrateManifestTargets(manifest({ targets: [] }));
    expect(migrated.targets).toEqual(['claude-code']);
  });
});
