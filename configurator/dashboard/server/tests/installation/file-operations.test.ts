// SPDX-License-Identifier: MIT
import { describe, it, expect } from 'vitest';
import {
  flattenSkillName,
  parseAgentSkills,
  parseAgentSkillsStructured,
  toInstalledAgentContent,
} from '../../src/services/installation/file-operations.js';

describe('flattenSkillName', () => {
  it('passes through a simple lowercase name unchanged', () => {
    expect(flattenSkillName('typescript')).toBe('typescript');
  });

  it('flattens a nested path by replacing slashes with hyphens', () => {
    expect(flattenSkillName('frontend-frameworks/react')).toBe('frontend-frameworks-react');
  });

  it('handles deeply nested paths', () => {
    expect(flattenSkillName('best-practices/testing/integration')).toBe(
      'best-practices-testing-integration',
    );
  });

  it('lowercases uppercase characters', () => {
    expect(flattenSkillName('Frontend/React')).toBe('frontend-react');
  });

  it('replaces invalid characters with hyphens', () => {
    expect(flattenSkillName('foo_bar/baz.qux')).toBe('foo-bar-baz-qux');
  });

  it('collapses runs of hyphens', () => {
    expect(flattenSkillName('a//b///c')).toBe('a-b-c');
  });

  it('strips leading and trailing hyphens', () => {
    expect(flattenSkillName('/foo/')).toBe('foo');
  });

  it('truncates names longer than 64 characters and appends a hash suffix', () => {
    const longInput = 'a'.repeat(40) + '/' + 'b'.repeat(40); // 81 chars after replacement
    const result = flattenSkillName(longInput);
    expect(result.length).toBeLessThanOrEqual(64);
    // Suffix is 8 hex chars after a hyphen — guarantees uniqueness across long inputs
    expect(result).toMatch(/-[0-9a-f]{8}$/);
  });

  it('produces distinct flat names for distinct long inputs sharing a prefix', () => {
    const longA = 'a'.repeat(70) + '/x';
    const longB = 'a'.repeat(70) + '/y';
    expect(flattenSkillName(longA)).not.toBe(flattenSkillName(longB));
  });

  it('only emits characters allowed by Claude Code skill naming rules', () => {
    const result = flattenSkillName('Frontend/React_Hooks.v2');
    expect(result).toMatch(/^[a-z0-9-]+$/);
  });
});

describe('parseAgentSkillsStructured', () => {
  it('legacy `skills:` — only the first entry is preloaded', () => {
    // The cap is 1 because each core skill is injected whole into every
    // subagent spawned from the agent. See LEGACY_SKILLS_CORE_CAP.
    const content = `---
name: legacy-agent
description: Test
skills:
  - frontend-frameworks/react
  - languages/typescript
---
# body`;
    const result = parseAgentSkillsStructured(content, 'legacy-agent');
    expect(result.core).toEqual(['frontend-frameworks/react']);
    expect(result.extended).toEqual(['languages/typescript']);
    expect(result.all).toEqual(['frontend-frameworks/react', 'languages/typescript']);
  });

  it('legacy `skills:` (> cap) — the rest fall through to extended', () => {
    const content = `---
name: heavy-legacy
description: Test
skills:
  - one
  - two
  - three
  - four
  - five
  - six
---
# body`;
    const result = parseAgentSkillsStructured(content, 'heavy-legacy');
    expect(result.core).toEqual(['one']);
    expect(result.extended).toEqual(['two', 'three', 'four', 'five', 'six']);
    // .all remains the full union, in the original order
    expect(result.all).toEqual(['one', 'two', 'three', 'four', 'five', 'six']);
  });

  it('explicit `core_skills:` bypasses the legacy cap', () => {
    const content = `---
name: tiered-with-many
description: Test
core_skills:
  - one
  - two
  - three
  - four
  - five
extended_skills:
  - six
---
# body`;
    const result = parseAgentSkillsStructured(content, 'tiered-with-many');
    // All 5 explicitly-declared core_skills are preserved — the cap only
    // applies to the legacy fallback path.
    expect(result.core).toEqual(['one', 'two', 'three', 'four', 'five']);
    expect(result.extended).toEqual(['six']);
  });

  it('new schema `core_skills:` + `extended_skills:` — both populated', () => {
    const content = `---
name: tiered-agent
description: Test
core_skills:
  - frontend-frameworks/react
  - languages/typescript
extended_skills:
  - frontend-frameworks/react-suspense
  - state-management/zustand
---
# body`;
    const result = parseAgentSkillsStructured(content, 'tiered-agent');
    expect(result.core).toEqual(['frontend-frameworks/react', 'languages/typescript']);
    expect(result.extended).toEqual(['frontend-frameworks/react-suspense', 'state-management/zustand']);
    expect(result.all).toEqual([
      'frontend-frameworks/react',
      'languages/typescript',
      'frontend-frameworks/react-suspense',
      'state-management/zustand',
    ]);
  });

  it('new schema present — legacy `skills:` is ignored to avoid ambiguity', () => {
    const content = `---
name: mixed-agent
description: Test
skills:
  - legacy/skill-that-should-be-ignored
core_skills:
  - frontend-frameworks/react
extended_skills:
  - state-management/zustand
---
# body`;
    const result = parseAgentSkillsStructured(content, 'mixed-agent');
    expect(result.core).toEqual(['frontend-frameworks/react']);
    expect(result.extended).toEqual(['state-management/zustand']);
    expect(result.all).not.toContain('legacy/skill-that-should-be-ignored');
  });

  it('skill in both core and extended — core wins, no duplicate in `all`', () => {
    const content = `---
name: dup-agent
description: Test
core_skills:
  - frontend-frameworks/react
extended_skills:
  - frontend-frameworks/react
  - state-management/zustand
---
# body`;
    const result = parseAgentSkillsStructured(content, 'dup-agent');
    expect(result.core).toEqual(['frontend-frameworks/react']);
    expect(result.extended).toEqual(['frontend-frameworks/react', 'state-management/zustand']);
    const reactCount = result.all.filter((s) => s === 'frontend-frameworks/react').length;
    expect(reactCount).toBe(1);
    expect(result.all).toEqual(['frontend-frameworks/react', 'state-management/zustand']);
  });

  it('expands `bundle:<id>` references in `core_skills:`', () => {
    const content = `---
name: bundled-agent
description: Test
core_skills:
  - bundle:rag/foundation
  - languages/python
---
# body`;
    const result = parseAgentSkillsStructured(content, 'bundled-agent');
    expect(result.core).toContain('languages/python');
    expect(result.core).toContain('rag/rag-architecture'); // from rag/foundation bundle
    expect(result.core.length).toBeGreaterThan(2);
  });

  it('expands `bundle:<id>` references in `extended_skills:`', () => {
    const content = `---
name: bundled-extended-agent
description: Test
core_skills:
  - languages/python
extended_skills:
  - bundle:rag/foundation
---
# body`;
    const result = parseAgentSkillsStructured(content, 'bundled-extended-agent');
    expect(result.core).toEqual(['languages/python']);
    expect(result.extended).toContain('rag/rag-architecture');
    expect(result.extended.length).toBeGreaterThan(1);
  });

  it('tolerates inline YAML comments and blank lines', () => {
    const content = `---
name: commented-agent
description: Test
core_skills:
  # Top of the list
  - frontend-frameworks/react

  - languages/typescript # core type system
---
# body`;
    const result = parseAgentSkillsStructured(content, 'commented-agent');
    expect(result.core).toEqual(['frontend-frameworks/react', 'languages/typescript']);
  });

  it('agent without any frontmatter returns empty lists', () => {
    const content = '# just a body, no frontmatter\n';
    const result = parseAgentSkillsStructured(content, 'no-fm-agent');
    expect(result.core).toEqual([]);
    expect(result.extended).toEqual([]);
    expect(result.all).toEqual([]);
  });
});

describe('parseAgentSkills (backward-compat wrapper)', () => {
  it('returns the union of core + extended', () => {
    const content = `---
name: any
description: x
core_skills:
  - a/x
extended_skills:
  - b/y
---`;
    expect(parseAgentSkills(content, 'any')).toEqual(['a/x', 'b/y']);
  });

  it('returns legacy skills list for unmigrated agents', () => {
    const content = `---
name: legacy
description: x
skills:
  - a/x
  - b/y
---`;
    expect(parseAgentSkills(content, 'legacy')).toEqual(['a/x', 'b/y']);
  });

  it('expands bundles (regression: previously bundles were dropped)', () => {
    const content = `---
name: bundled
description: x
skills:
  - bundle:rag/foundation
  - languages/python
---`;
    const result = parseAgentSkills(content, 'bundled');
    expect(result).toContain('languages/python');
    expect(result).toContain('rag/rag-architecture');
  });
});

describe('toInstalledAgentContent', () => {
  const AGENT = `---
name: architect
description: |
  Software architect.
model: sonnet
allowed-tools: Read, Grep, Glob, WebSearch, mcp__documentation__*, mcp__api-explorer__*
skills:
  - best-practices/clean-code
  - backend-frameworks/spring-cloud-gateway
---

# Body
Hello.
`;

  it('renames allowed-tools to the native tools field', () => {
    const out = toInstalledAgentContent(AGENT, { installedSkillFlatNames: [] });
    const fm = out.slice(0, out.indexOf('\n---', 3));
    expect(fm).not.toMatch(/^allowed-tools:/m);
    expect(fm).toMatch(/^tools:.*\bRead\b/m);
    expect(fm).toMatch(/^tools:.*\bWebSearch\b/m);
  });

  it('derives mcpServers from mcp__<server>__* tool entries', () => {
    const out = toInstalledAgentContent(AGENT, { installedSkillFlatNames: [] });
    expect(out).toMatch(/^\s+-\s+documentation$/m);
    expect(out).toMatch(/^\s+-\s+api-explorer$/m);
  });

  it('adds extra MCP servers and the Skill tool when requested', () => {
    const out = toInstalledAgentContent(AGENT, {
      installedSkillFlatNames: [],
      extraMcpServers: ['skill-loader'],
      grantSkillTool: true,
    });
    expect(out).toMatch(/^\s+-\s+skill-loader$/m);
    expect(out).toMatch(/^tools:.*\bSkill\b/m);
  });

  it('replaces path-style skills with the installed flat dir names', () => {
    const out = toInstalledAgentContent(AGENT, {
      installedSkillFlatNames: ['best-practices-clean-code', 'backend-frameworks-spring-cloud-gateway'],
    });
    const skillsBlock = out.slice(out.indexOf('skills:'));
    expect(skillsBlock).toMatch(/^\s+-\s+best-practices-clean-code$/m);
    expect(skillsBlock).toMatch(/^\s+-\s+backend-frameworks-spring-cloud-gateway$/m);
    // no path-style (slash) skill entries remain
    expect(out).not.toMatch(/^\s+-\s+\S+\/\S+$/m);
  });

  it('does not leak skills list items into mcpServers', () => {
    const out = toInstalledAgentContent(AGENT, {
      installedSkillFlatNames: ['best-practices-clean-code'],
      extraMcpServers: ['skill-loader'],
    });
    const mcpBlock = out.slice(out.indexOf('mcpServers:'), out.indexOf('skills:'));
    expect(mcpBlock).not.toMatch(/clean-code/);
    expect(mcpBlock).not.toMatch(/spring-cloud-gateway/);
  });

  it('preserves body and other frontmatter keys', () => {
    const out = toInstalledAgentContent(AGENT, { installedSkillFlatNames: [] });
    expect(out).toMatch(/^name: architect$/m);
    expect(out).toMatch(/^model: sonnet$/m);
    expect(out).toContain('# Body');
    expect(out).toContain('Hello.');
  });

  it('omits the skills block when no skills are installed', () => {
    const out = toInstalledAgentContent(AGENT, { installedSkillFlatNames: [] });
    const fm = out.slice(0, out.indexOf('\n---', 3));
    expect(fm).not.toMatch(/^skills:/m);
  });

  it('leaves content without frontmatter untouched', () => {
    const plain = '# No frontmatter\njust text';
    expect(toInstalledAgentContent(plain, { installedSkillFlatNames: [] })).toBe(plain);
  });

  it('emits no tools field when the source has no allowed-tools (inherit all)', () => {
    const noTools = `---
name: x
description: y
---
body`;
    const out = toInstalledAgentContent(noTools, { installedSkillFlatNames: [] });
    expect(out).not.toMatch(/^tools:/m);
    expect(out).toMatch(/^name: x$/m);
  });
});
