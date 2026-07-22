// SPDX-License-Identifier: MIT
/**
 * Gemini CLI subagent writer.
 *
 * Gemini reads neither `.claude/agents` nor the shared substrate, so it is the
 * one target that gets no delegatable subagents from an install — only the
 * routing in `AGENTS.md`. This turns each dev-suite agent into a native Gemini
 * subagent file (`.gemini/agents/<id>.md`), invocable with `@<id>`.
 *
 * The body is the agent's own role prose, carried over verbatim — the same body
 * Copilot and Cursor already read from `.claude/agents`, so Gemini is on equal
 * footing, not worse. It may still mention a Claude tool name here and there; a
 * neutralization pass over agent prose is a separate, deferred Phase 4 item
 * (doing it safely needs more than regex).
 *
 * Frontmatter is the minimal confirmed set (reference doc section 3.3):
 * `name`, `description`, `kind: local`. `tools`/`model` are deliberately omitted
 * so Gemini uses its own defaults rather than inheriting Claude tool/model
 * names that wouldn't map.
 */

/** Collapse to a single line and double-quote for a safe YAML scalar. */
function yamlDoubleQuoted(value: string): string {
  const oneLine = value.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  return JSON.stringify(oneLine); // JSON strings are valid YAML double-quoted scalars
}

/** Strip a leading `---`-delimited frontmatter block, returning the body. */
function stripFrontmatter(source: string): string {
  if (!source.startsWith('---')) return source.trim();
  const end = source.indexOf('\n---', 3);
  if (end === -1) return source.trim();
  const afterClose = source.indexOf('\n', end + 1);
  return afterClose === -1 ? '' : source.slice(afterClose + 1).trim();
}

export interface GeminiAgentInput {
  /** Agent id — becomes the subagent name and its `@`-handle. */
  id: string;
  /** One-line role description. */
  description: string;
  /** Raw source agent file (dev-suite frontmatter + body). */
  rawSource: string;
}

/** Render a dev-suite agent as a Gemini subagent markdown file. */
export function toGeminiAgentContent(input: GeminiAgentInput): string {
  const body = stripFrontmatter(input.rawSource);
  return `---
name: ${input.id}
description: ${yamlDoubleQuoted(input.description)}
kind: local
---

${body}
`;
}
