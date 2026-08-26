/**
 * Tests for the target path resolver.
 *
 * These lock the two invariants every caller depends on:
 * - `rel*` values are POSIX and manifest-comparable across platforms
 * - the absolute form of a `rel*` value always resolves under the project root
 *
 * The Claude Code expectations double as regression tests for the layout
 * sweep: they assert the resolver produces exactly the paths dev-suite wrote
 * before services stopped hardcoding them.
 */

import { describe, it, expect } from 'vitest';
import * as path from 'path';
import { targetPaths, TargetPaths } from '../../src/services/targets/target-paths.js';
import { SHARED_INSTRUCTIONS_FILE } from '../../src/services/targets/target-layout.js';

const ROOT = path.resolve('/tmp/project');

describe('TargetPaths — Claude Code (default target)', () => {
  const p = targetPaths(ROOT);

  it('defaults to claude-code', () => {
    expect(p.target).toBe('claude-code');
  });

  it.each([
    ['relConfigDir', '.claude'],
    ['relAgentsDir', '.claude/agents'],
    ['relSkillsDir', '.claude/skills'],
    ['relCommandsDir', '.claude/commands'],
    ['relRulesDir', '.claude/rules'],
    ['relMcpServersDir', '.mcp-servers'],
    ['relInstructionsFile', 'CLAUDE.md'],
    ['relMcpConfigFile', '.mcp.json'],
    ['relSettingsFile', '.claude/settings.json'],
    ['relCustomAgentsDir', '.claude/agents/custom'],
    ['relCustomSkillsDir', '.claude/skills/custom'],
  ] as const)('%s → %s', (key, expected) => {
    expect(p[key]).toBe(expected);
  });

  it('resolves the shared instructions file independently of the target', () => {
    expect(p.relSharedInstructionsFile).toBe(SHARED_INSTRUCTIONS_FILE);
    expect(p.sharedInstructionsFile).toBe(path.join(ROOT, SHARED_INSTRUCTIONS_FILE));
  });

  it('builds per-entity paths with the target file extensions', () => {
    expect(p.relAgentFile('react-expert')).toBe('.claude/agents/react-expert.md');
    expect(p.relRuleFile('frontend')).toBe('.claude/rules/frontend.md');
    expect(p.relSkillDir('frontend-react')).toBe('.claude/skills/frontend-react');
    expect(p.relMcpServerDir('documentation')).toBe('.mcp-servers/documentation');
  });

  it('points MCP server entries at the bundled dist/index.js', () => {
    expect(p.mcpServerEntry('documentation')).toBe(
      path.join(ROOT, '.mcp-servers', 'documentation', 'dist', 'index.js')
    );
  });
});

describe('TargetPaths — absolute/relative consistency', () => {
  const p = targetPaths(ROOT);

  it.each([
    'relConfigDir',
    'relAgentsDir',
    'relSkillsDir',
    'relCommandsDir',
    'relRulesDir',
    'relMcpServersDir',
    'relInstructionsFile',
    'relMcpConfigFile',
    'relSettingsFile',
  ] as const)('%s has an absolute counterpart under the project root', relKey => {
    const absKey = (relKey.charAt(3).toLowerCase() + relKey.slice(4)) as keyof TargetPaths;
    const abs = p[absKey] as string;
    expect(abs).toBe(path.join(ROOT, ...(p[relKey] as string).split('/')));
    expect(abs.startsWith(ROOT)).toBe(true);
  });

  it('keeps relative paths POSIX so manifests compare across platforms', () => {
    for (const rel of [p.relAgentsDir, p.relSettingsFile, p.relAgentFile('a'), p.relSkillDir('s')]) {
      expect(rel).not.toContain('\\');
    }
  });
});

describe('TargetPaths — other targets', () => {
  it('uses the Copilot layout, including its distinct MCP file and extensions', () => {
    const p = targetPaths(ROOT, 'copilot');
    expect(p.relAgentsDir).toBe('.github/agents');
    // Copilot agent files carry a compound extension
    expect(p.relAgentFile('react-expert')).toBe('.github/agents/react-expert.agent.md');
    expect(p.relRuleFile('frontend')).toBe('.github/instructions/frontend.instructions.md');
    expect(p.relMcpConfigFile).toBe('.vscode/mcp.json');
    // Copilot reads AGENTS.md directly rather than a tool-specific file
    expect(p.relInstructionsFile).toBe(SHARED_INSTRUCTIONS_FILE);
  });

  it('uses the Cursor layout with .mdc rules', () => {
    const p = targetPaths(ROOT, 'cursor');
    expect(p.relRuleFile('frontend')).toBe('.cursor/rules/frontend.mdc');
    expect(p.relMcpConfigFile).toBe('.cursor/mcp.json');
  });

  it('uses the Kimi Code layout: brand agents dir, shared skills mirror', () => {
    const p = targetPaths(ROOT, 'kimi-code');
    expect(p.relAgentsDir).toBe('.kimi-code/agents');
    expect(p.relAgentFile('react-expert')).toBe('.kimi-code/agents/react-expert.md');
    expect(p.relSkillsDir).toBe('.agents/skills');
    expect(p.relMcpConfigFile).toBe('.kimi-code/mcp.json');
    expect(p.relInstructionsFile).toBe(SHARED_INSTRUCTIONS_FILE);
    // No glob rules and no settings file — asking for them must fail loudly.
    expect(() => p.relRulesDir).toThrow(/no rules directory/);
    expect(() => p.relSettingsFile).toThrow(/no settings directory/);
  });

  it('falls back to <agentsDir>/custom when a layout declares no custom dir', () => {
    const p = targetPaths(ROOT, 'copilot');
    expect(p.relCustomAgentsDir).toBe('.github/agents/custom');
    expect(p.relCustomSkillsDir).toBe('.github/skills/custom');
  });

  it('throws for a target with no descriptor yet', () => {
    expect(() => targetPaths(ROOT, 'windsurf')).toThrow(/not-yet-supported|Unknown/);
  });
});

describe('TargetPaths — missing locations', () => {
  it('throws a named error instead of silently resolving to the project root', () => {
    const p = targetPaths(ROOT);
    // Simulate a target whose layout omits an optional directory.
    const stripped = Object.create(TargetPaths.prototype) as TargetPaths;
    Object.assign(stripped, p, { layout: { ...p.layout, rulesDir: undefined } });

    expect(() => stripped.relRulesDir).toThrow(/no rules directory/);
  });
});
