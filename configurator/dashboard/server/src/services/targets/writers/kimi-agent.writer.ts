// SPDX-License-Identifier: MIT
/**
 * Kimi Code subagent writer.
 *
 * Kimi Code reads neither `.claude/agents` nor `.claude/skills`, so without a
 * native file its only knowledge of dev-suite's agents is the routing table in
 * `AGENTS.md`. This turns each installed agent into `.kimi-code/agents/<id>.md`,
 * which Kimi discovers recursively at project scope.
 *
 * Frontmatter is the minimal safe set (reference doc section 3.8): `name` and
 * `description`, the only field whose absence breaks parsing.
 *
 * Three fields are deliberately **never** emitted:
 *  - `override` — `override: true` replaces a *built-in* agent's entire system
 *    prompt. Kimi's own docs tell users to audit project agent files in
 *    unfamiliar repos for exactly this reason. A generator that emits it turns
 *    every dev-suite install into that threat.
 *  - `tools` / `disallowedTools` — dev-suite's tool names are Claude-native and
 *    do not map onto Kimi's tool set; an unmatched allowlist would restrict the
 *    agent to nothing rather than degrade to "all tools".
 *  - `model_preference` — model routing is a dev-suite concern expressed against
 *    Claude model tiers; `primary`/`secondary` mean something else here.
 *
 * `.kimi-code/agents/` is chosen over the generic `.agents/agents/` because the
 * precedence between the two is undocumented (both are "Project" scope) and no
 * other vendor reads `.agents/agents/` today — see the unconfirmed register.
 */

import { yamlDoubleQuoted, stripFrontmatter } from './agent-frontmatter.js';

/**
 * Agent names Kimi ships built in. A project file with one of these names is
 * how a repository hijacks the default agent, so dev-suite refuses to write
 * them even though its own ids (`react-expert`, …) never collide today.
 *
 * `agent` is included because `agent.md` + `override: true` is the documented
 * way to replace the *main* agent's system prompt.
 */
const KIMI_BUILTIN_AGENT_NAMES: ReadonlySet<string> = new Set(['agent', 'coder', 'explore', 'plan']);

/** True when this id would shadow one of Kimi's built-in agents. */
export function isReservedKimiAgentName(id: string): boolean {
  return KIMI_BUILTIN_AGENT_NAMES.has(id.trim().toLowerCase());
}

/**
 * True when a body contains `${…}`, which Kimi substitutes as a template
 * variable on every prompt build.
 *
 * Agent prose legitimately carries these inside code examples (shell vars, JS
 * template literals, `${{ secrets.X }}` in CI snippets). What Kimi does with an
 * *unknown* placeholder is undocumented, and rewriting a user-facing code
 * example to dodge it would be worse than reporting it — so callers surface
 * this rather than mutate the prose.
 */
export function containsTemplatePlaceholder(body: string): boolean {
  return /\$\{/.test(body);
}

export interface KimiAgentInput {
  /** Agent id — becomes the subagent name and its file stem. */
  id: string;
  /** One-line role description. Required by Kimi; parsing fails without it. */
  description: string;
  /** Raw source agent file (dev-suite frontmatter + body). */
  rawSource: string;
}

/** Render a dev-suite agent as a Kimi Code subagent markdown file. */
export function toKimiAgentContent(input: KimiAgentInput): string {
  const body = stripFrontmatter(input.rawSource);

  return `---
name: ${input.id}
description: ${yamlDoubleQuoted(input.description)}
---

${body}
`;
}
