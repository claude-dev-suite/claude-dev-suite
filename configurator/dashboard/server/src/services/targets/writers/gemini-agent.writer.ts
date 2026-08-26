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
 * Frontmatter is the minimal confirmed set (reference doc section 3.5):
 * `name`, `description`, `kind: local`. `tools`/`model` are deliberately omitted
 * so Gemini uses its own defaults rather than inheriting Claude tool/model
 * names that wouldn't map.
 */

import { yamlDoubleQuoted, stripFrontmatter } from './agent-frontmatter.js';

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
