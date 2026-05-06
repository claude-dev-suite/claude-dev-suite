# Agent Pair Templates

Pre-built **researcher + implementer** agent pairs that exploit Claude model
heterogeneity for token cost optimization.

## The pattern

A "researcher" agent (powered by Haiku 4.5) explores the codebase, gathers
context, and produces a structured handoff. The "implementer" agent (powered
by Sonnet 4.6) consumes the handoff and writes/edits code.

Why this works:
- Exploration is read-heavy and pattern-matchable — Haiku handles it well at
  ~40% the cost of Sonnet.
- Implementation requires multi-step reasoning and write quality — Sonnet's
  sweet spot.
- The researcher's output stays in its own context window and only the
  distilled handoff returns to the parent — context window stays lean.

## When to use

- Long-running tasks where exploration cost dominates
- Refactors across many files
- Migration projects (Researcher: catalogue current state; Implementer: write the migration)
- Bug investigations (Researcher: reproduce + isolate; Implementer: fix)
- Feature additions in unfamiliar areas of the codebase

## When NOT to use

- One-off small edits — single agent is fine
- Tasks where the exploration itself requires Sonnet-level reasoning
  (e.g. security audits, complex architectural analysis)
- When the handoff format would lose critical context

## Available pairs

| Pair | Researcher (Haiku) | Implementer (Sonnet) | Use case |
|---|---|---|---|
| **react** | `react-researcher.md` | `react-implementer.md` | React component / hook work in mature codebases |
| **db** | `db-explorer.md` | `db-migrator.md` | Schema migrations and complex query refactoring |
| **codebase** | `codebase-mapper.md` | `codebase-refactorer.md` | Generic large-scale refactoring across any stack |

## How to use

1. Copy the desired pair files into your project's `.claude/agents/` directory.
2. Adapt them to your stack (the `skills:` array and any framework-specific notes).
3. Invoke via:
   ```
   @react-researcher: explore the auth flow in src/auth/
   ```
   The researcher writes its findings to a temp file or returns them.
   Then:
   ```
   @react-implementer: based on this handoff <paste>, refactor to use TanStack Query
   ```

Or chain them in a single user message and let the orchestrator (Plan agent
or default Claude) coordinate.

## Cost-quality trade-off

Per typical refactor task:

| Approach | Total tokens | Cost (relative) | Quality |
|---|---|---|---|
| Single Sonnet agent | ~50K | 1.0× | High |
| Single Opus agent | ~50K | 2.5× | Highest (often marginal gain) |
| **Researcher (Haiku) + Implementer (Sonnet)** | ~30K + ~20K = 50K | **0.6×** | High (Haiku exploration + Sonnet write) |
| Single Haiku | ~50K | 0.4× | Medium-low (often misses edge cases) |

The pair pattern preserves Sonnet-class output quality while shifting the
exploration burden to Haiku.

## Notes

- These templates are starting points, not enforced contracts. Adapt freely.
- For wallet / security / financial code: stick to single-agent Sonnet or
  Opus — the cost saving from the researcher pair is not worth the risk of a
  Haiku exploration missing a security-relevant detail.
