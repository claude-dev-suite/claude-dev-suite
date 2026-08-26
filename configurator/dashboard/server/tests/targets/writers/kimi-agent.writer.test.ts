/**
 * Tests for the Kimi Code subagent writer.
 *
 * Two things are load-bearing here and neither fails loudly in Kimi:
 * `description` is the one field whose absence breaks parsing, and `override`
 * plus a built-in name is how a project file hijacks Kimi's main agent — so the
 * writer must never produce either.
 */

import { describe, it, expect } from 'vitest';
import {
  toKimiAgentContent,
  isReservedKimiAgentName,
  containsTemplatePlaceholder,
} from '../../../src/services/targets/writers/kimi-agent.writer.js';

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
`;

describe('toKimiAgentContent', () => {
  const out = toKimiAgentContent({
    id: 'react-expert',
    description: 'React specialist for components, hooks and state.',
    rawSource: SOURCE,
  });

  it('emits name and a quoted description', () => {
    expect(out.startsWith('---\nname: react-expert\n')).toBe(true);
    expect(out).toContain('description: "React specialist for components, hooks and state."');
  });

  it('never emits override, tools or model_preference', () => {
    const fm = out.slice(0, out.indexOf('\n---\n', 4) + 5);
    // `override: true` on a built-in name replaces Kimi's whole system prompt.
    expect(fm).not.toContain('override');
    expect(fm).not.toContain('tools:');
    expect(fm).not.toContain('disallowedTools');
    expect(fm).not.toContain('model_preference');
  });

  it('carries the body over and drops the dev-suite frontmatter', () => {
    expect(out).toContain('# React Expert Agent');
    expect(out).toContain('You are an expert React developer.');
    expect(out).not.toContain('allowed-tools');
    expect(out).not.toContain('core_skills');
  });

  it('closes the frontmatter block before the body', () => {
    const simple = toKimiAgentContent({ id: 'x', description: 'd', rawSource: '# body' });
    expect(simple).toBe('---\nname: x\ndescription: "d"\n---\n\n# body\n');
  });

  it('collapses a multi-line description into a single YAML-safe line', () => {
    const multi = toKimiAgentContent({
      id: 'x',
      description: 'Line one\nline two   with  spaces',
      rawSource: '# body',
    });
    expect(multi).toContain('description: "Line one line two with spaces"');
  });

  it('handles a source file with no frontmatter', () => {
    const out2 = toKimiAgentContent({ id: 'x', description: 'd', rawSource: 'just a body' });
    expect(out2).toContain('just a body');
    expect(out2).toContain('name: x');
  });
});

describe('isReservedKimiAgentName', () => {
  it.each(['agent', 'coder', 'explore', 'plan', 'Coder', ' plan '])(
    'rejects the built-in name %s',
    name => {
      expect(isReservedKimiAgentName(name)).toBe(true);
    }
  );

  it.each(['react-expert', 'planning-expert', 'code-reviewer'])('allows %s', name => {
    expect(isReservedKimiAgentName(name)).toBe(false);
  });
});

describe('containsTemplatePlaceholder', () => {
  it('flags bodies whose prose would enter Kimi template substitution', () => {
    expect(containsTemplatePlaceholder('Use ${CLAUDE_PLUGIN_ROOT} for paths')).toBe(true);
    expect(containsTemplatePlaceholder('password: ${{ secrets.TOKEN }}')).toBe(true);
    expect(containsTemplatePlaceholder('const a = `${x}`')).toBe(true);
  });

  it('leaves ordinary prose and lone $ alone', () => {
    expect(containsTemplatePlaceholder('Costs $5 and uses $HOME')).toBe(false);
    expect(containsTemplatePlaceholder('# React Expert')).toBe(false);
  });
});
