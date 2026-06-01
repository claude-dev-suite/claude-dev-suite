---
name: agentic-architecture
description: |
  Architecture of LLM agent systems: orchestration topologies (single agent,
  supervisor/sub-agents, pipelines, networks), memory/context strategy, the tool
  layer, and human-in-the-loop/control. Architect-level system design, not prompt
  wording.

  USE WHEN: designing agentic/LLM-agent systems, "agent orchestration",
  "multi-agent", "supervisor", "sub-agents", "tool use", "agent memory",
  "human-in-the-loop", workflow vs autonomous agent, agent topology/control.

  DO NOT USE FOR: single prompt/RAG retrieval design (use rag skills); model
  serving (use `inference-serving-topology`); provider routing (use
  `model-gateway-routing`).
allowed-tools: Read, Grep, Glob
---
# Agentic System Architecture

## First choice: workflow vs autonomous agent
- **Workflow** (fixed, code-orchestrated steps with LLM calls): predictable,
  cheap, debuggable. **Prefer this** when the steps are known.
- **Autonomous agent** (LLM decides the next action in a loop): flexible, handles
  open-ended tasks, but less predictable and costlier. Use only when the path
  genuinely can't be pre-defined.

## Orchestration topologies
| Topology | Shape | Fits |
|---|---|---|
| Single agent + tools | One loop, a toolbox | Most tasks; start here |
| Supervisor / sub-agents | Orchestrator delegates to specialists (own context) | Decomposable tasks, context isolation |
| Pipeline / chain | Staged hand-offs | Known multi-stage transforms |
| Network / peer agents | Agents message each other | Rarely needed; high complexity/cost |

Bias to the **simplest** topology that works; isolate context with sub-agents
when a subtask would flood the main context.

## Cross-cutting design concerns
- **Memory/context**: short-term (conversation), long-term (vector/store), and
  scratch. Compaction/summarization to fit the window; what persists across runs?
- **Tool layer**: typed tools with clear contracts; least-privilege; validate
  tool I/O; tools are the agent's blast radius — scope them.
- **Control & safety**: human-in-the-loop approval for irreversible/outward
  actions; step/turn budgets; loop/termination conditions; guardrails.
- **Determinism & cost**: cap iterations, cache, and prefer workflows for the
  deterministic parts. Observability: trace each step (tool calls, tokens, cost).
- **Failure handling**: retries, fallbacks, and a defined "give up / escalate"
  path; don't let agents loop forever.

## When to recommend what
- Known steps → workflow. Open-ended + decomposable → supervisor + sub-agents.
- One coherent task → single agent + tools. Reach for multi-agent networks only
  when simpler shapes demonstrably fail.
