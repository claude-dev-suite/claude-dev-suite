/**
 * Tests for the Gemini subagent writer.
 *
 * Gemini gets native `@`-agents only through these files, so the frontmatter
 * shape (name/description/kind) and clean frontmatter-stripping of the source
 * body are what matter.
 */

import { describe, it, expect } from 'vitest';
import { toGeminiAgentContent } from '../../../src/services/targets/writers/gemini-agent.writer.js';

const SOURCE = `---
name: react-expert
description: |
  React specialist for components,
  hooks and state.
model: sonnet
allowed-tools: Read, Write, Edit
core_skills:
  - frontend-frameworks/react
---

# React Expert Agent

You are an expert React developer.

## Behavior
Execute changes directly.
`;

describe('toGeminiAgentContent', () => {
  const out = toGeminiAgentContent({
    id: 'react-expert',
    description: 'React specialist for components, hooks and state.',
    rawSource: SOURCE,
  });

  it('emits Gemini frontmatter with name, quoted description and kind: local', () => {
    expect(out.startsWith('---\nname: react-expert\n')).toBe(true);
    expect(out).toContain('description: "React specialist for components, hooks and state."');
    expect(out).toContain('kind: local');
  });

  it('carries the source body over and drops the dev-suite frontmatter', () => {
    expect(out).toContain('# React Expert Agent');
    expect(out).toContain('You are an expert React developer.');
    // The Claude-specific source frontmatter must not leak into the Gemini file.
    expect(out).not.toContain('allowed-tools');
    expect(out).not.toContain('core_skills');
    expect(out).not.toContain('model: sonnet');
  });

  it('does not inherit Claude tool or model frontmatter (Gemini uses its defaults)', () => {
    // We deliberately omit tools/model so nothing maps a Claude name onto Gemini.
    const fm = out.slice(0, out.indexOf('\n---\n', 4) + 5);
    expect(fm).not.toContain('tools:');
    expect(fm).not.toContain('model:');
  });

  it('collapses a multi-line description into a single YAML-safe line', () => {
    const multi = toGeminiAgentContent({
      id: 'x',
      description: 'Line one\nline two   with  spaces',
      rawSource: '# body',
    });
    expect(multi).toContain('description: "Line one line two with spaces"');
  });

  it('handles a source file with no frontmatter', () => {
    const out2 = toGeminiAgentContent({ id: 'x', description: 'd', rawSource: 'just a body' });
    expect(out2).toContain('just a body');
    expect(out2).toContain('name: x');
  });
});
