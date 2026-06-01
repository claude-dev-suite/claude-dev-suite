---
name: model-gateway-routing
description: |
  Model gateway / LLM router architecture: a control point in front of multiple
  models/providers for routing (cost/quality/latency), fallback, rate limiting,
  caching, observability, and governance. Architect-level, multi-provider.

  USE WHEN: designing an LLM gateway/router, "model router", "LLM gateway",
  "multi-provider", "fallback", "cost routing", "LiteLLM", "Envoy AI Gateway",
  semantic cache, central key/quota/observability for LLM calls.

  DO NOT USE FOR: single-engine serving (use `inference-serving-topology`);
  edge/cascade (use `hybrid-edge-cloud`); agent orchestration (use `agentic-architecture`).
allowed-tools: Read, Grep, Glob
---
# Model Gateway / Routing

A gateway is a single control point between apps and many models/providers.
It turns "which model?" and cross-cutting concerns into infrastructure.

## What it centralizes (the reasons to build/buy one)
- **Routing**: pick a model per request by **cost / quality / latency / context
  length / capability**, or A/B and canary new models.
- **Fallback & resilience**: retry/failover across providers on error or rate
  limit; circuit-break a failing provider.
- **Cost control**: per-team/app budgets, quotas, and **cost attribution**;
  route cheap queries to cheap models.
- **Caching**: exact + **semantic cache** to skip duplicate/near-duplicate calls.
- **Security/governance**: central API-key custody, PII redaction, audit logs,
  policy (which teams may call which models).
- **Observability**: latency/tokens/cost/error metrics in one place.

Implementations: **LiteLLM**, **Envoy AI Gateway**, cloud AI gateways, or custom.

## Design decisions
- **Routing policy**: static (rules) vs learned/heuristic (route by predicted
  difficulty). Keep it explainable; mind added hop latency.
- **Sync vs streaming**: must pass through token streaming with low overhead.
- **Statelessness**: keep the gateway stateless + horizontally scalable; push
  state (cache, budgets) to fast stores.
- **Failure semantics**: define what happens when all providers fail.

## When to recommend
- Multiple models/providers, multiple teams, real cost/governance needs → yes.
- Single model, single team, prototype → a gateway is premature; call the model
  directly and add the gateway when the second model/provider/team appears.
