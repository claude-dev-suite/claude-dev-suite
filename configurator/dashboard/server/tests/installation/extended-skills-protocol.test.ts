// SPDX-License-Identifier: MIT
/**
 * The instructions that make the extended skill tier reachable.
 *
 * In lazy mode — which is the default for practically every install, since
 * `skill-loader` carries `isDefault: true` and `installation.service.ts`
 * promotes the mode whenever it is in the set — only `core_skills` are copied
 * to disk. Everything else in the catalog sits behind the `skill-loader` MCP
 * server.
 *
 * Nothing told the agent that. The server was connected and its tools were
 * listed, but an agent rarely concludes on its own that it is missing
 * knowledge; and if it does, it has to invent a search term against ~700
 * skills, because the `extended_skills:` curated for it are discarded by this
 * very transform and never reach the installed file. Two agents had the
 * protocol written by hand (`core/architect`, `core/code-reviewer`) and were
 * the only two that could use the tier as designed.
 *
 * What the block deliberately does NOT contain is a list of the agent's own
 * extended skills. The tier exists so an agent can reach a skill nobody
 * configured for it; an inventory would read as the boundary of what it may
 * load.
 */

import { describe, it, expect } from 'vitest';
import { toInstalledAgentContent } from '../../src/services/installation/file-operations.js';

const AGENT = `---
name: react-expert
description: React specialist.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, mcp__documentation__*
core_skills:
  - frontend-frameworks/react
extended_skills:
  - state-management/zustand
  - styling/tailwindcss
---

# React Expert

Do React things.
`;

const lazy = (content = AGENT) =>
  toInstalledAgentContent(content, {
    installedSkillFlatNames: ['frontend-frameworks-react'],
    extraMcpServers: ['skill-loader'],
    grantSkillTool: true,
  });

const eager = (content = AGENT) =>
  toInstalledAgentContent(content, {
    installedSkillFlatNames: ['frontend-frameworks-react'],
    grantSkillTool: true,
  });

describe('lazy mode', () => {
  it('names the three calls, in the order they are meant to be made', () => {
    const out = lazy();
    const at = (needle: string) => out.indexOf(needle);

    expect(at('mcp__skill-loader__list_skills({ groupByCategory: true })')).toBeGreaterThan(-1);
    expect(at('mcp__skill-loader__load_skill')).toBeGreaterThan(-1);
    // The map first, then the narrowing, then the body: searching a ~700-entry
    // catalog blind is the step the overview exists to replace.
    expect(at('groupByCategory')).toBeLessThan(at('mcp__skill-loader__load_skill'));
  });

  it('says the catalog is open, and does not enumerate the agent\'s own skills', () => {
    const out = lazy();

    expect(out).toContain('including skills nobody configured for you');
    // The curated `extended_skills:` must not come back as a list here.
    expect(out).not.toContain('state-management/zustand');
    expect(out).not.toContain('styling/tailwindcss');
  });

  it('warns that the match is literal, which is what makes the term matter', () => {
    // `list_skills` filters with `String.includes` over name/path/description.
    // An agent that searches taxonomy terms rather than the user's words gets
    // nothing back and concludes the catalog has nothing.
    expect(lazy()).toContain('literal substring match');
  });

  it('leaves the agent\'s own body intact above it', () => {
    const out = lazy();
    const body = out.slice(out.indexOf('\n---', 3) + 4);

    expect(body).toContain('# React Expert');
    expect(body).toContain('Do React things.');
    expect(body.indexOf('# React Expert')).toBeLessThan(body.indexOf('## Extended skills'));
  });
});

describe('the allowlist the block depends on', () => {
  it('permits the tools it tells the agent to call', () => {
    const fm = lazy().slice(0, lazy().indexOf('\n---', 3));

    // `extraMcpServers` used to reach `mcpServers:` alone, so the server was
    // connected to an agent whose allowlist never named its tools. Instructions
    // to call them would have been inert.
    expect(fm).toMatch(/^tools:.*mcp__skill-loader__\*/m);
    expect(fm).toMatch(/^\s+-\s+skill-loader$/m);
  });

  it('does not invent an allowlist for an agent that declared none', () => {
    // No `allowed-tools`: the agent is deliberately unrestricted. Emitting a
    // `tools:` line here would restrict it to whatever we happened to add.
    const OPEN = ['---', 'name: open-agent', 'description: Anything.', '---', '', '# Body', ''].join('\n');
    const out = toInstalledAgentContent(OPEN, {
      installedSkillFlatNames: [],
      extraMcpServers: ['skill-loader'],
    });

    expect(out.slice(0, out.indexOf('\n---', 3))).not.toMatch(/^tools:/m);
  });
});

describe('an agent that restricted nothing', () => {
  const OPEN = ['---', 'name: open-agent', 'description: Anything.', '---', '', '# Body', ''].join(
    '\n'
  );

  it('is not restricted to the tools we wanted to add', () => {
    // No `allowed-tools` means every tool by omission. `grantSkillTool` pushed
    // `Skill` onto the empty list regardless, and the emitted `tools: Skill`
    // turned an unrestricted agent into one that could do nothing else. The
    // shipped catalog is safe — `validate-catalog.mjs` requires the field — but
    // a custom agent goes through this same transform.
    const out = toInstalledAgentContent(OPEN, {
      installedSkillFlatNames: [],
      extraMcpServers: ['skill-loader'],
      grantSkillTool: true,
    });
    const fm = out.slice(0, out.indexOf('\n---', 3));

    expect(fm).not.toMatch(/^tools:/m);
    // The server still reaches `mcpServers:`; only the allowlist is left alone.
    expect(fm).toMatch(/^\s+-\s+skill-loader$/m);
  });

  it('an empty allowed-tools is no allowlist either', () => {
    const EMPTY = ['---', 'name: open-agent', 'allowed-tools:', '---', '', '# Body', ''].join('\n');
    const out = toInstalledAgentContent(EMPTY, {
      installedSkillFlatNames: [],
      grantSkillTool: true,
    });

    expect(out.slice(0, out.indexOf('\n---', 3))).not.toMatch(/^tools:/m);
  });

  it('still gets the Skill tool when it does restrict itself', () => {
    const out = toInstalledAgentContent(AGENT, {
      installedSkillFlatNames: [],
      grantSkillTool: true,
    });

    expect(out.slice(0, out.indexOf('\n---', 3))).toMatch(/^tools:.*\bSkill\b/m);
  });
});

describe('eager mode', () => {
  it('says nothing about a server that is not installed', () => {
    const out = eager();

    // Eager copies every skill to disk and does not install `skill-loader`.
    // Instructions naming its tools would send the agent after tools that are
    // not there.
    expect(out).not.toContain('## Extended skills');
    expect(out).not.toContain('mcp__skill-loader__');
  });
});

describe('agents that already carry the protocol', () => {
  const HAND_WRITTEN = `---
name: architect
description: Software architect.
allowed-tools: Read, Grep, Glob
---

# Architect

Use \`mcp__skill-loader__list_skills({ search: "<domain keyword>" })\` to find
depth, then \`mcp__skill-loader__load_skill({ skill_path: "<path>" })\`.
`;

  it('is not given a second, competing copy', () => {
    const out = lazy(HAND_WRITTEN);

    expect(out).not.toContain('## Extended skills');
    expect(out).toContain('<domain keyword>');
  });
});

describe('re-running the transform', () => {
  it('does not stack the block', () => {
    // The transform always runs on the catalog source, so this cannot happen
    // today — but the marker is what keeps that true if an installed file is
    // ever fed back through.
    const once = lazy();
    const twice = toInstalledAgentContent(once, {
      installedSkillFlatNames: ['frontend-frameworks-react'],
      extraMcpServers: ['skill-loader'],
      grantSkillTool: true,
    });

    const occurrences = twice.split('## Extended skills').length - 1;
    expect(occurrences).toBe(1);
  });
});
