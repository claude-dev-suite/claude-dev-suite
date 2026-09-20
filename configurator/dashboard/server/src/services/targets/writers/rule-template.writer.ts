// SPDX-License-Identifier: MIT
/**
 * Rule templates, serialized per assistant.
 *
 * A rule template (`rules/{category}/{id}.md`) is project guidance — "every
 * change gets a CHANGELOG entry", "commits follow Conventional Commits". It is
 * plain prose with dev-suite frontmatter; nothing about it is Claude-specific.
 *
 * Claude Code takes the file verbatim into `.claude/rules/`. Cursor has an
 * equivalent mechanism and was simply never given one: a `.cursor/rules/*.mdc`
 * with `alwaysApply: true` is an "Always" rule, which is exactly what an
 * unconditional project guideline is. See docs/ASSISTANT-FORMAT-REFERENCE.md
 * §3.3 — frontmatter is exactly `description` / `globs` / `alwaysApply`, there
 * is no `type` key, and the type is *derived* from which keys are present.
 *
 * Until this existed the install reported "Cursor has no equivalent to Claude
 * Code rule templates", which was not true — it had no implementation.
 */

import { RULE_FILE_MARKER } from './path-scoped-rules.writer.js';

/** Frontmatter dev-suite puts at the top of every rule template. */
export interface RuleTemplateMeta {
  id: string;
  name?: string;
  description?: string;
}

/**
 * Split a rule template into its frontmatter values and its body.
 *
 * Deliberately tolerant: a template with no frontmatter still yields a usable
 * body, because the body is the part that carries the guidance. A missing
 * `description` falls back to the name, then to the id — Cursor shows that
 * string when it decides whether to surface the rule, so an empty one is worse
 * than an approximate one.
 */
export function parseRuleTemplate(source: string, id: string): { meta: RuleTemplateMeta; body: string } {
  const m = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return { meta: { id }, body: source.trim() };

  const scalar = (key: string): string | undefined => {
    const hit = m[1]?.match(new RegExp(`^${key}\\s*:\\s*(.+)$`, 'm'));
    return hit?.[1]?.trim().replace(/^["']|["']$/g, '');
  };

  return {
    meta: { id, name: scalar('name'), description: scalar('description') },
    body: source.slice(m[0].length).trim(),
  };
}

/**
 * Cursor: `.cursor/rules/<id>.mdc`, an "Always" rule.
 *
 * `alwaysApply: true` and no `globs` — a project guideline is unconditional, so
 * scoping it to paths would be wrong. Plain `.md` in that directory is ignored
 * by Cursor, which is why the layout sets `ruleFileExtension: '.mdc'`.
 */
export function cursorRuleTemplate(source: string, id: string): string {
  const { meta, body } = parseRuleTemplate(source, id);
  const description = meta.description ?? meta.name ?? id;

  return `---
description: ${description}
alwaysApply: true
---
${RULE_FILE_MARKER}

${body}
`;
}

/**
 * Copilot: `.github/instructions/<id>.instructions.md`, applied everywhere.
 *
 * `applyTo` is a glob relative to the workspace root, and a comma-separated
 * multi-glob is valid — see docs/ASSISTANT-FORMAT-REFERENCE.md §3.2. `**` is
 * therefore the always-on form, which is what an unconditional project
 * guideline needs.
 *
 * Quoted, unlike the path-scoped rules writer's value: an unquoted scalar
 * beginning with `*` is a YAML alias indicator, and here the value is *always*
 * `**`.
 */
export function copilotRuleTemplate(source: string, id: string): string {
  const { meta, body } = parseRuleTemplate(source, id);
  const description = meta.description ?? meta.name ?? id;

  return `---
description: ${description}
applyTo: "**"
---
${RULE_FILE_MARKER}

${body}
`;
}
