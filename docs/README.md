# Dev-Suite Documentation

Reference documentation for the dev-suite project.

## Reference guides

| Document | Description |
|----------|-------------|
| [ASSISTANT-FORMAT-REFERENCE.md](./ASSISTANT-FORMAT-REFERENCE.md) | **Normative.** Config formats for every supported assistant (Claude Code, Copilot, Cursor, Codex, Gemini, Devin, Cline, Kimi Code). Read this before touching a target adapter — never research assistant formats independently |
| [AGENT-CAPABILITY-MATRIX.md](./AGENT-CAPABILITY-MATRIX.md) | Per-agent MCP servers and skills. **Generated** by `scripts/gen-capability-matrix.mjs` — do not edit by hand |
| [HOOKS-REFERENCE.md](./HOOKS-REFERENCE.md) | Git and Claude Code hooks, including the three output-filter hooks dev-suite ships |
| [TOKEN-ANALYTICS.md](./TOKEN-ANALYTICS.md) | The opt-in token-usage tracking API and dashboard panel |
| [MODEL-ROUTING-AUDIT.md](./MODEL-ROUTING-AUDIT.md) | Why each agent runs on the model it does — the per-agent benchmarks behind the haiku/sonnet/opus split |
| [MEMBRANE-EXPERT-TECH-DOC.md](./MEMBRANE-EXPERT-TECH-DOC.md) | Domain background for the `membrane-expert` agent (RO/EDI water treatment) |
| [kb-audit-2026-07.md](./kb-audit-2026-07.md) | Knowledge-base reachability audit and the dead-URL remediation it drove |

## Planning

| Document | Description |
|----------|-------------|
| [planning/multi-assistant.md](./planning/multi-assistant.md) | The multi-assistant initiative: slices, decisions, open questions |

## Growth

| Document | Description |
|----------|-------------|
| [MARKETING-PLAN.md](./MARKETING-PLAN.md) | Zero-cost growth strategy |
| [community-engagement-log.md](./community-engagement-log.md) | Log of community interactions |

## Archive

[archive/](./archive/) holds documents kept for their reasoning only — completed plans and
version-pinned campaign copy. Nothing there describes current behaviour.

## Main documentation

- [README.md](../README.md) — user-facing project documentation
- [CLAUDE.md](../CLAUDE.md) — development guidelines for this repository
- [CHANGELOG.md](../CHANGELOG.md) — version history
