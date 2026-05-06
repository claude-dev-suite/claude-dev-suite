/**
 * Tests for the path-scoped rules generation in claude-md.service.ts
 *
 * Covers:
 * - generatePathScopedRules writes correct rule files per category
 * - Always-on categories (security, core, quality) produce no rule file
 * - generateDevSuiteSection splits agents correctly between inline and cross-ref
 * - removePathScopedRules removes only dev-suite-managed files
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  generatePathScopedRules,
  generateDevSuiteSection,
  removePathScopedRules,
  DEV_SUITE_START_MARKER,
  DEV_SUITE_END_MARKER,
} from '../../src/services/installation/claude-md.service.js';
import type { Agent } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tmpDir(prefix: string): string {
  const dir = path.join(os.tmpdir(), `${prefix}${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function makeAgent(
  id: string,
  category: string,
  description = `${id} description`
): Agent {
  return {
    id,
    name: id,
    description,
    category: category as Agent['category'],
    skills: [],
    mcpServers: [],
    filePath: `/fake/agents/${category}/${id}.md`,
  };
}

// ---------------------------------------------------------------------------
// generatePathScopedRules
// ---------------------------------------------------------------------------

describe('generatePathScopedRules', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = tmpDir('claude-md-rules-');
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it('creates a rule file for frontend agents with correct paths frontmatter', () => {
    const agents: Agent[] = [makeAgent('react-expert', 'frontend')];
    generatePathScopedRules(agents, projectDir);

    const ruleFile = path.join(projectDir, '.claude', 'rules', 'frontend.md');
    expect(fs.existsSync(ruleFile)).toBe(true);

    const content = fs.readFileSync(ruleFile, 'utf-8');
    expect(content).toContain('paths:');
    expect(content).toContain('"**/*.tsx"');
    expect(content).toContain('"**/*.jsx"');
    expect(content).toContain('@react-expert');
  });

  it('creates a rule file for mobile agents', () => {
    const agents: Agent[] = [makeAgent('swift-expert', 'mobile')];
    generatePathScopedRules(agents, projectDir);

    const ruleFile = path.join(projectDir, '.claude', 'rules', 'mobile.md');
    expect(fs.existsSync(ruleFile)).toBe(true);

    const content = fs.readFileSync(ruleFile, 'utf-8');
    expect(content).toContain('"**/*.swift"');
    expect(content).toContain('@swift-expert');
  });

  it('creates a rule file for testing agents', () => {
    const agents: Agent[] = [makeAgent('vitest-expert', 'testing')];
    generatePathScopedRules(agents, projectDir);

    const ruleFile = path.join(projectDir, '.claude', 'rules', 'testing.md');
    expect(fs.existsSync(ruleFile)).toBe(true);

    const content = fs.readFileSync(ruleFile, 'utf-8');
    expect(content).toContain('"**/*.test.*"');
    expect(content).toContain('"**/*.spec.*"');
    expect(content).toContain('@vitest-expert');
  });

  it('creates separate rule files for multiple categories', () => {
    const agents: Agent[] = [
      makeAgent('react-expert', 'frontend'),
      makeAgent('spring-expert', 'backend'),
      makeAgent('vitest-expert', 'testing'),
    ];
    const written = generatePathScopedRules(agents, projectDir);

    expect(written).toContain('.claude/rules/frontend.md');
    expect(written).toContain('.claude/rules/backend.md');
    expect(written).toContain('.claude/rules/testing.md');
    expect(written).toHaveLength(3);

    const frontendFile = path.join(projectDir, '.claude', 'rules', 'frontend.md');
    const backendFile = path.join(projectDir, '.claude', 'rules', 'backend.md');
    const testingFile = path.join(projectDir, '.claude', 'rules', 'testing.md');

    expect(fs.existsSync(frontendFile)).toBe(true);
    expect(fs.existsSync(backendFile)).toBe(true);
    expect(fs.existsSync(testingFile)).toBe(true);
  });

  it('does NOT create a rule file for security agents (always-on)', () => {
    const agents: Agent[] = [makeAgent('security-expert', 'security')];
    const written = generatePathScopedRules(agents, projectDir);

    expect(written).toHaveLength(0);

    const ruleFile = path.join(projectDir, '.claude', 'rules', 'security.md');
    expect(fs.existsSync(ruleFile)).toBe(false);
  });

  it('does NOT create a rule file for core agents (always-on)', () => {
    const agents: Agent[] = [makeAgent('architect-expert', 'core')];
    const written = generatePathScopedRules(agents, projectDir);

    expect(written).toHaveLength(0);

    const ruleFile = path.join(projectDir, '.claude', 'rules', 'core.md');
    expect(fs.existsSync(ruleFile)).toBe(false);
  });

  it('does NOT create a rule file for quality agents (always-on)', () => {
    const agents: Agent[] = [makeAgent('code-reviewer', 'quality')];
    const written = generatePathScopedRules(agents, projectDir);

    expect(written).toHaveLength(0);
  });

  it('mixes always-on and scoped agents correctly', () => {
    const agents: Agent[] = [
      makeAgent('react-expert', 'frontend'),
      makeAgent('security-expert', 'security'),
      makeAgent('vitest-expert', 'testing'),
      makeAgent('architect', 'core'),
    ];
    const written = generatePathScopedRules(agents, projectDir);

    // Only frontend and testing should produce rule files
    expect(written).toHaveLength(2);
    expect(written).toContain('.claude/rules/frontend.md');
    expect(written).toContain('.claude/rules/testing.md');
    expect(written).not.toContain('.claude/rules/security.md');
    expect(written).not.toContain('.claude/rules/core.md');
  });

  it('returns empty array when no agents are installed', () => {
    const written = generatePathScopedRules([], projectDir);
    expect(written).toHaveLength(0);
  });

  it('includes the dev-suite-managed sentinel in every generated file', () => {
    const agents: Agent[] = [makeAgent('react-expert', 'frontend')];
    generatePathScopedRules(agents, projectDir);

    const content = fs.readFileSync(
      path.join(projectDir, '.claude', 'rules', 'frontend.md'),
      'utf-8'
    );
    expect(content).toContain('<!-- dev-suite-managed -->');
  });

  it('creates .claude/rules/ directory automatically', () => {
    const agents: Agent[] = [makeAgent('react-expert', 'frontend')];
    generatePathScopedRules(agents, projectDir);

    expect(fs.existsSync(path.join(projectDir, '.claude', 'rules'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// generateDevSuiteSection
// ---------------------------------------------------------------------------

describe('generateDevSuiteSection', () => {
  it('wraps output with correct markers', () => {
    const result = generateDevSuiteSection([]);
    expect(result).toContain(DEV_SUITE_START_MARKER);
    expect(result).toContain(DEV_SUITE_END_MARKER);
  });

  it('shows always-on routing inline for security agents', () => {
    const agents: Agent[] = [makeAgent('security-expert', 'security', 'Handles security audits')];
    const result = generateDevSuiteSection(agents);

    expect(result).toContain('Agent Routing (Always Active)');
    expect(result).toContain('@security-expert');
    expect(result).toContain('Handles security audits');
  });

  it('shows always-on routing inline for core agents', () => {
    const agents: Agent[] = [makeAgent('architect', 'core', 'System architecture')];
    const result = generateDevSuiteSection(agents);

    expect(result).toContain('Agent Routing (Always Active)');
    expect(result).toContain('@architect');
  });

  it('shows path-scoped section for frontend agents, not inline routing', () => {
    const agents: Agent[] = [makeAgent('react-expert', 'frontend', 'React specialist')];
    const result = generateDevSuiteSection(agents);

    // Should appear in the cross-reference section
    expect(result).toContain('Path-Scoped Agent Rules');
    expect(result).toContain('`@react-expert`');
    expect(result).toContain('.claude/rules/frontend.md');

    // Should NOT appear in an inline "Always Active" routing block
    expect(result).not.toContain('Agent Routing (Always Active)');
  });

  it('separates always-on and scoped agents correctly', () => {
    const agents: Agent[] = [
      makeAgent('security-expert', 'security', 'Security audits'),
      makeAgent('react-expert', 'frontend', 'React specialist'),
    ];
    const result = generateDevSuiteSection(agents);

    expect(result).toContain('Agent Routing (Always Active)');
    expect(result).toContain('Path-Scoped Agent Rules');

    // Security inline, frontend cross-ref
    expect(result).toContain('Use `@security-expert` for: Security audits');
    expect(result).toContain('.claude/rules/frontend.md');
  });

  it('handles empty agent list without crashing', () => {
    const result = generateDevSuiteSection([]);
    expect(result).toContain('No agents installed');
    expect(result).toContain(DEV_SUITE_START_MARKER);
  });

  it('lists all agents in the Installed Agents index regardless of category', () => {
    const agents: Agent[] = [
      makeAgent('security-expert', 'security'),
      makeAgent('react-expert', 'frontend'),
    ];
    const result = generateDevSuiteSection(agents);

    // Both should appear in the installed agents list
    const installedSection = result.match(/## Installed Agents[\s\S]*?(?=##|$)/)?.[0] ?? '';
    expect(installedSection).toContain('@security-expert');
    expect(installedSection).toContain('@react-expert');
  });

  it('security-only install has no Path-Scoped section', () => {
    const agents: Agent[] = [makeAgent('security-expert', 'security')];
    const result = generateDevSuiteSection(agents);

    expect(result).not.toContain('Path-Scoped Agent Rules');
  });
});

// ---------------------------------------------------------------------------
// removePathScopedRules
// ---------------------------------------------------------------------------

describe('removePathScopedRules', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = tmpDir('claude-md-remove-');
    fs.mkdirSync(path.join(projectDir, '.claude', 'rules'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it('removes a dev-suite-managed rule file', () => {
    const rulePath = path.join(projectDir, '.claude', 'rules', 'frontend.md');
    fs.writeFileSync(
      rulePath,
      '<!-- dev-suite-managed -->\n# Frontend Agents\n'
    );

    const result = removePathScopedRules(projectDir, ['.claude/rules/frontend.md']);
    expect(result.removed).toContain('.claude/rules/frontend.md');
    expect(result.errors).toHaveLength(0);
    expect(fs.existsSync(rulePath)).toBe(false);
  });

  it('does NOT remove a user-created rule file (no sentinel)', () => {
    const rulePath = path.join(projectDir, '.claude', 'rules', 'myteam.md');
    fs.writeFileSync(rulePath, '# My Team Rules\n\nCustom rules here.\n');

    const result = removePathScopedRules(projectDir, ['.claude/rules/myteam.md']);
    expect(result.removed).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('non-managed');
    expect(fs.existsSync(rulePath)).toBe(true);
  });

  it('silently skips missing files', () => {
    const result = removePathScopedRules(projectDir, ['.claude/rules/nonexistent.md']);
    expect(result.removed).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects paths outside .claude/rules/', () => {
    const result = removePathScopedRules(projectDir, ['CLAUDE.md']);
    expect(result.removed).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('unexpected path');
  });

  it('handles empty tracked list gracefully', () => {
    const result = removePathScopedRules(projectDir, []);
    expect(result.removed).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it('removes multiple rule files in one call', () => {
    const categories = ['frontend', 'backend', 'testing'];
    for (const cat of categories) {
      fs.writeFileSync(
        path.join(projectDir, '.claude', 'rules', `${cat}.md`),
        `<!-- dev-suite-managed -->\n# ${cat}\n`
      );
    }

    const tracked = categories.map(c => `.claude/rules/${c}.md`);
    const result = removePathScopedRules(projectDir, tracked);

    expect(result.removed).toHaveLength(3);
    expect(result.errors).toHaveLength(0);
    for (const cat of categories) {
      expect(fs.existsSync(path.join(projectDir, '.claude', 'rules', `${cat}.md`))).toBe(false);
    }
  });
});
