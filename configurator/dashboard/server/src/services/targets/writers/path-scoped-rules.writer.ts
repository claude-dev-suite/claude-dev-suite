// SPDX-License-Identifier: MIT
/**
 * Path-scoped rule writers.
 *
 * One concept, four frontmatter keys and three value shapes across the
 * ecosystem — see docs/ASSISTANT-FORMAT-REFERENCE.md section 2.4, which is
 * normative. Keeping all variants in one module is deliberate: the differences
 * are only visible, and only testable, side by side.
 *
 * | Target      | Key        | Value shape                       |
 * |-------------|------------|-----------------------------------|
 * | Claude Code | `paths:`   | YAML list                         |
 * | Copilot     | `applyTo:` | quoted comma-separated string     |
 * | Cursor      | `globs:`   | **unquoted** comma-separated      |
 *
 * Cursor's shape is the dangerous one: a YAML list parses fine and the rule
 * simply never activates. It is inferred from consistent documentation examples
 * rather than stated, so it is pinned by a golden-file test.
 *
 * Codex and Gemini have no glob mechanism at all — they are not represented
 * here, and their adapters must degrade rather than emit something.
 *
 * Every file carries {@link RULE_FILE_MARKER} so removal only ever touches
 * files dev-suite created.
 */

/** Sentinel embedded in generated rule files so we know we created them. */
export const RULE_FILE_MARKER = '<!-- dev-suite-managed -->';

/** One category's worth of routing, before it is serialized for a target. */
export interface PathScopedRuleSpec {
  /** Category id, e.g. `frontend`. Becomes the filename stem. */
  category: string;
  /** Glob patterns that activate this rule. */
  globs: string[];
  /** Agents to prefer for files matching the globs. */
  agents: Array<{ id: string; description: string }>;
}

function displayCategory(category: string): string {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

function agentLines(spec: PathScopedRuleSpec): string {
  return spec.agents.map(a => `- \`@${a.id}\` — ${a.description}`).join('\n');
}

/**
 * Claude Code: `.claude/rules/<category>.md`.
 *
 * `paths:` is a YAML list, and the body may reference the Task tool because
 * delegating to a subagent by `subagent_type` is Claude-Code-specific.
 */
export function claudeCodeRule(spec: PathScopedRuleSpec): string {
  const pathsYaml = spec.globs.map(g => `  - "${g}"`).join('\n');

  return `---
paths:
${pathsYaml}
---
${RULE_FILE_MARKER}

# ${displayCategory(spec.category)} Agents

When working on files matching the paths above, prefer these agents:

${agentLines(spec)}

Use the Task tool with the corresponding subagent_type to delegate work to these specialists.
`;
}

/**
 * GitHub Copilot: `.github/instructions/<category>.instructions.md`.
 *
 * `applyTo` takes a comma-separated glob string relative to the workspace root.
 * The body stays tool-neutral — Copilot has no Task tool, so instructing it to
 * use one would be noise at best.
 */
export function copilotInstructionsRule(spec: PathScopedRuleSpec): string {
  const applyTo = spec.globs.join(',');

  return `---
applyTo: "${applyTo}"
---
${RULE_FILE_MARKER}

# ${displayCategory(spec.category)} Agents

When working on files matching \`applyTo\` above, prefer these agents:

${agentLines(spec)}

Delegate to the matching agent when the task falls in its area.
`;
}

/**
 * Cursor: `.cursor/rules/<category>.mdc`.
 *
 * Frontmatter is exactly `description` / `globs` / `alwaysApply` — there is no
 * `type` key; the rule *type* is derived from which of the three are present.
 * `alwaysApply: false` plus `globs` yields "Auto Attached", which is what a
 * path-scoped rule is.
 *
 * `globs` must be an **unquoted comma-separated string**. A YAML list is valid
 * YAML and silently never matches.
 */
export function cursorMdcRule(spec: PathScopedRuleSpec): string {
  const globs = spec.globs.join(', ');
  const category = displayCategory(spec.category);

  return `---
description: ${category} agents for matching files
globs: ${globs}
alwaysApply: false
---
${RULE_FILE_MARKER}

# ${category} Agents

When working on files matching \`globs\` above, prefer these agents:

${agentLines(spec)}

Delegate to the matching agent when the task falls in its area.
`;
}
