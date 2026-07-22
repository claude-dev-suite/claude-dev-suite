/**
 * Golden-file tests for the path-scoped rule writers.
 *
 * These assert exact output rather than "contains" fragments, on purpose. Every
 * failure mode here is silent: a rule with the wrong frontmatter key, or the
 * right key with the wrong value shape, parses cleanly and simply never
 * activates. Nothing at runtime would tell us.
 *
 * Format claims are sourced from docs/ASSISTANT-FORMAT-REFERENCE.md section 2.4.
 */

import { describe, it, expect } from 'vitest';
import {
  claudeCodeRule,
  copilotInstructionsRule,
  cursorMdcRule,
  clineRule,
  RULE_FILE_MARKER,
  type PathScopedRuleSpec,
} from '../../../src/services/targets/writers/path-scoped-rules.writer.js';

const SPEC: PathScopedRuleSpec = {
  category: 'frontend',
  globs: ['src/components/**/*.tsx', 'src/pages/**/*.tsx'],
  agents: [
    { id: 'react-expert', description: 'React specialist' },
    { id: 'css-expert', description: 'Styling specialist' },
  ],
};

describe('claudeCodeRule', () => {
  it('emits paths as a YAML list', () => {
    expect(claudeCodeRule(SPEC)).toBe(`---
paths:
  - "src/components/**/*.tsx"
  - "src/pages/**/*.tsx"
---
${RULE_FILE_MARKER}

# Frontend Agents

When working on files matching the paths above, prefer these agents:

- \`@react-expert\` — React specialist
- \`@css-expert\` — Styling specialist

Use the Task tool with the corresponding subagent_type to delegate work to these specialists.
`);
  });
});

describe('copilotInstructionsRule', () => {
  it('emits applyTo as a quoted comma-separated string', () => {
    expect(copilotInstructionsRule(SPEC)).toBe(`---
applyTo: "src/components/**/*.tsx,src/pages/**/*.tsx"
---
${RULE_FILE_MARKER}

# Frontend Agents

When working on files matching \`applyTo\` above, prefer these agents:

- \`@react-expert\` — React specialist
- \`@css-expert\` — Styling specialist

Delegate to the matching agent when the task falls in its area.
`);
  });

  it('does not instruct Copilot to use the Task tool', () => {
    // Task/subagent_type is Claude Code's delegation mechanism; telling another
    // assistant to use it is noise that also misleads the model.
    const out = copilotInstructionsRule(SPEC);
    expect(out).not.toContain('Task tool');
    expect(out).not.toContain('subagent_type');
  });
});

describe('cursorMdcRule', () => {
  it('emits globs as an UNQUOTED comma-separated string', () => {
    expect(cursorMdcRule(SPEC)).toBe(`---
description: Frontend agents for matching files
globs: src/components/**/*.tsx, src/pages/**/*.tsx
alwaysApply: false
---
${RULE_FILE_MARKER}

# Frontend Agents

When working on files matching \`globs\` above, prefer these agents:

- \`@react-expert\` — React specialist
- \`@css-expert\` — Styling specialist

Delegate to the matching agent when the task falls in its area.
`);
  });

  it('never emits globs as a YAML list', () => {
    // The highest-ranked silent-breakage trap in the reference doc: a YAML list
    // is valid YAML, and the rule then never matches anything.
    const out = cursorMdcRule(SPEC);
    expect(out).not.toMatch(/globs:\s*\n\s*-/);
  });

  it('does not quote the globs value', () => {
    expect(out(cursorMdcRule(SPEC), 'globs:')).toBe('src/components/**/*.tsx, src/pages/**/*.tsx');
  });

  it('declares the Auto Attached rule type via alwaysApply + globs', () => {
    // Cursor has no `type` key — the rule type is derived from which fields are
    // present. alwaysApply:false plus globs is what makes it path-scoped.
    const rendered = cursorMdcRule(SPEC);
    expect(rendered).toContain('alwaysApply: false');
    expect(rendered).not.toContain('type:');
  });
});

describe('clineRule', () => {
  it('uses Claude\'s paths: frontmatter but a tool-neutral body', () => {
    const out = clineRule(SPEC);
    // Same glob key/shape as Claude...
    expect(out).toContain('---\npaths:\n  - "src/components/**/*.tsx"');
    // ...but no Claude-specific delegation mechanics (Cline has no Task tool).
    expect(out).not.toContain('Task tool');
    expect(out).not.toContain('subagent_type');
    expect(out).toContain('Delegate to the matching agent');
    expect(out).toContain(RULE_FILE_MARKER);
  });
});

describe('all writers', () => {
  const writers = [
    ['claude-code', claudeCodeRule],
    ['copilot', copilotInstructionsRule],
    ['cursor', cursorMdcRule],
    ['cline', clineRule],
  ] as const;

  it.each(writers)('%s carries the managed sentinel so removal stays ours', (_id, write) => {
    expect(write(SPEC)).toContain(RULE_FILE_MARKER);
  });

  it.each(writers)('%s handles a single glob without a stray separator', (_id, write) => {
    const rendered = write({ ...SPEC, globs: ['src/**/*.ts'] });
    expect(rendered).not.toContain(',,');
    expect(rendered).not.toMatch(/src\/\*\*\/\*\.ts\s*,/);
  });

  it.each(writers)('%s starts with frontmatter on the very first line', (_id, write) => {
    // Every target requires frontmatter to be the first content in the file.
    expect(write(SPEC).startsWith('---\n')).toBe(true);
  });
});

/** Read the value of a frontmatter key from rendered output. */
function out(rendered: string, key: string): string {
  const line = rendered.split('\n').find(l => l.startsWith(key));
  return (line ?? '').slice(key.length).trim();
}
