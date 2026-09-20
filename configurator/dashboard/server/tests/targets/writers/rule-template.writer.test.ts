/**
 * Golden-file tests for the rule-template writers.
 *
 * Exact output, not "contains" fragments, for the same reason as the
 * path-scoped rule writers: every failure here is silent. A rule with the wrong
 * frontmatter key, or the right key with the wrong value shape, parses cleanly
 * and simply never activates, and nothing at runtime says so.
 *
 * Format claims come from docs/ASSISTANT-FORMAT-REFERENCE.md §3.2 (Copilot
 * `applyTo`) and §3.3 (Cursor: frontmatter is exactly
 * `description`/`globs`/`alwaysApply`, there is no `type` key, and the rule type
 * is derived — `alwaysApply: true` is "Always"). §3.3 asks in terms for a
 * golden-file test on the Cursor `.mdc` shape.
 */

import { describe, it, expect } from 'vitest';
import {
  cursorRuleTemplate,
  copilotRuleTemplate,
  parseRuleTemplate,
} from '../../../src/services/targets/writers/rule-template.writer.js';
import { RULE_FILE_MARKER } from '../../../src/services/targets/writers/path-scoped-rules.writer.js';

/** A real rule template, shaped like the files under `rules/`. */
const SOURCE = `---
id: changelog
name: Changelog Maintenance
description: Every meaningful change gets a [Unreleased] entry in CHANGELOG.md before it is considered done
category: docs
recommended: true
---

# Changelog Maintenance

**Rules:**
- Every feature, bug fix, or breaking change must have an entry
`;

describe('parseRuleTemplate', () => {
  it('reads name and description and strips the frontmatter', () => {
    const { meta, body } = parseRuleTemplate(SOURCE, 'changelog');
    expect(meta.name).toBe('Changelog Maintenance');
    expect(meta.description).toBe(
      'Every meaningful change gets a [Unreleased] entry in CHANGELOG.md before it is considered done'
    );
    expect(body.startsWith('# Changelog Maintenance')).toBe(true);
    expect(body).not.toContain('recommended:');
  });

  it('survives a template with no frontmatter, because the body is the point', () => {
    const { meta, body } = parseRuleTemplate('# Just prose\n\nDo the thing.\n', 'bare');
    expect(meta).toEqual({ id: 'bare' });
    expect(body).toBe('# Just prose\n\nDo the thing.');
  });

  it('handles CRLF, which is what a Windows checkout produces', () => {
    const { meta, body } = parseRuleTemplate(SOURCE.replace(/\n/g, '\r\n'), 'changelog');
    expect(meta.name).toBe('Changelog Maintenance');
    expect(body.startsWith('# Changelog Maintenance')).toBe(true);
  });
});

describe('cursorRuleTemplate', () => {
  it('emits an Always rule: alwaysApply true and no globs', () => {
    expect(cursorRuleTemplate(SOURCE, 'changelog')).toBe(`---
description: Every meaningful change gets a [Unreleased] entry in CHANGELOG.md before it is considered done
alwaysApply: true
---
${RULE_FILE_MARKER}

# Changelog Maintenance

**Rules:**
- Every feature, bug fix, or breaking change must have an entry
`);
  });

  it('never emits a globs key — that would derive the wrong rule type', () => {
    // `alwaysApply: true` + `globs` is not "Always"; the type is derived from
    // which keys are present, so an accidental globs line changes behaviour
    // silently.
    expect(cursorRuleTemplate(SOURCE, 'changelog')).not.toContain('globs:');
  });

  it('never emits a type key — Cursor has none', () => {
    expect(cursorRuleTemplate(SOURCE, 'changelog')).not.toContain('type:');
  });

  it('falls back to the name, then the id, when description is absent', () => {
    expect(cursorRuleTemplate('---\nname: Only A Name\n---\nbody\n', 'x')).toContain(
      'description: Only A Name'
    );
    expect(cursorRuleTemplate('---\ncategory: docs\n---\nbody\n', 'fallback-id')).toContain(
      'description: fallback-id'
    );
  });
});

describe('copilotRuleTemplate', () => {
  it('emits applyTo "**" — the always-on form', () => {
    expect(copilotRuleTemplate(SOURCE, 'changelog')).toBe(`---
description: Every meaningful change gets a [Unreleased] entry in CHANGELOG.md before it is considered done
applyTo: "**"
---
${RULE_FILE_MARKER}

# Changelog Maintenance

**Rules:**
- Every feature, bug fix, or breaking change must have an entry
`);
  });

  it('quotes applyTo', () => {
    // An unquoted scalar opening with `*` is a YAML alias indicator, and this
    // value is always `**`.
    expect(copilotRuleTemplate(SOURCE, 'changelog')).toContain('applyTo: "**"');
    expect(copilotRuleTemplate(SOURCE, 'changelog')).not.toContain('applyTo: **');
  });
});

describe('both writers', () => {
  it('carry the managed marker, so removal only touches our own files', () => {
    expect(cursorRuleTemplate(SOURCE, 'changelog')).toContain(RULE_FILE_MARKER);
    expect(copilotRuleTemplate(SOURCE, 'changelog')).toContain(RULE_FILE_MARKER);
  });

  it('keep the body verbatim — the guidance is the whole payload', () => {
    for (const out of [cursorRuleTemplate(SOURCE, 'changelog'), copilotRuleTemplate(SOURCE, 'changelog')]) {
      expect(out).toContain('- Every feature, bug fix, or breaking change must have an entry');
    }
  });
});
