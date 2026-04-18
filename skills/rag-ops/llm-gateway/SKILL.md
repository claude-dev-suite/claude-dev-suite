---
name: llm-gateway
description: |
  LLM gateways in front of RAG stacks. Covers Portkey (caching, fallbacks,
  retries, observability), OpenRouter (300+ model routing), LiteLLM Proxy,
  Kong AI Gateway, semantic caching at gateway layer, cost-based routing
  (cheap model for easy queries), rate-limit handling, and unified API
  across providers. Config examples.

  USE WHEN: user mentions "LLM gateway", "Portkey", "OpenRouter", "LiteLLM",
  "Kong AI Gateway", "AI gateway", "semantic cache gateway", "provider fallback",
  "unified LLM API"

  DO NOT USE FOR: in-app caching - use `rag-caching`;
  multi-region routing - use `multi-region`;
  cost tracking/dashboarding - use `cost-allocation`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# LLM Gateway

An LLM gateway sits between your RAG app and the provider APIs. It gives you: provider-agnostic API, retries + fallbacks, rate-limit smoothing, semantic + exact cache, cost-based routing, observability. For any RAG stack running in production, a gateway eliminates a class of 3 AM pages and shaves 20–60% off provider spend.

## When to Use a Gateway

- You call more than one provider (Anthropic + OpenAI + Bedrock + Voyage).
- You want zero-downtime during provider outages (Claude is down → fall back to GPT-4o).
- You want one place to rotate keys, enforce spend limits, collect traces.
- You're cache-starved: identical or semantically similar queries hit live APIs.
- You serve many tenants with different model entitlements.

## Gateway Options

| Gateway | Strengths | Notes |
|---|---|---|
| **Portkey** | Prod-grade: cache, fallbacks, retries, load balancing, guardrails, virtual keys, analytics, OSS core + cloud | Most feature-complete; OpenAI-compatible |
| **OpenRouter** | 300+ models, pay-as-you-go across many providers, cheap routing | Hosted only; simple REST |
| **LiteLLM Proxy** | Self-hosted, OpenAI-compatible, routing, budgets, teams, LangSmith integration | Python; easy to deploy |
| **Kong AI Gateway** | Plugs into Kong; AI-specific plugins for rate-limit, transform, cache | Best if you already run Kong |
| **Helicone** | Observability-first, one-line integration, caching | Less heavyweight than Portkey |
| **Cloudflare AI Gateway** | Global edge, caching, rate-limit, analytics | Cloudflare ecosystem |

## Portkey (Config + Client)

```python
from portkey_ai import Portkey

pk = Portkey(
    api_key=PORTKEY_API_KEY,
    config="pc-rag-prod-abc123",   # Portkey Config ID
    virtual_key="anthropic-prod-key",
    metadata={"tenant_id": tenant_id, "feature": "qa_chat"},
)

resp = pk.chat.completions.create(
    model="claude-sonnet-4-5",
    messages=[...],
)
```

### Portkey Config Example (fallback + retries + cache)

```json
{
  "strategy": { "mode": "fallback" },
  "targets": [
    {
      "provider": "anthropic",
      "virtual_key": "anthropic-prod",
      "override_params": {"model": "claude-sonnet-4-5"},
      "retry": {"attempts": 2, "on_status_codes": [429, 500, 502, 503, 504]}
    },
    {
      "provider": "openai",
      "virtual_key": "openai-prod",
      "override_params": {"model": "gpt-4o"}
    }
  ],
  "cache": { "mode": "semantic", "max_age": 3600 },
  "request_timeout": 30000
}
```

### Portkey Load Balancing (cost-based)

```json
{
  "strategy": { "mode": "loadbalance" },
  "targets": [
    {"weight": 0.7, "provider": "anthropic", "override_params": {"model": "claude-haiku-4-5"}},
    {"weight": 0.3, "provider": "openai",   "override_params": {"model": "gpt-4o-mini"}}
  ]
}
```

Use `conditional` strategy to route by query complexity (simple → cheap, complex → Sonnet/Opus).

## OpenRouter

```python
from openai import OpenAI
client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=OPENROUTER_KEY)

resp = client.chat.completions.create(
    model="anthropic/claude-sonnet-4-5",
    messages=[{"role": "user", "content": "..."}],
    extra_headers={"HTTP-Referer": "https://myapp.com", "X-Title": "RAG QA"},
)
```

Auto-routing by free-form target:

```python
resp = client.chat.completions.create(
    model="openrouter/auto",           # OR picks the best-priced working model
    messages=[...],
)
```

Transforms: `:floor` (cheapest that meets context), `:nitro` (fastest provider for the model), `:free` (route to free providers first with fallback).

## LiteLLM Proxy (self-hosted)

```yaml
# config.yaml
model_list:
  - model_name: claude-sonnet
    litellm_params:
      model: anthropic/claude-sonnet-4-5
      api_key: os.environ/ANTHROPIC_API_KEY
  - model_name: claude-sonnet
    litellm_params:
      model: bedrock/anthropic.claude-sonnet-4-5-20250514-v1:0
      aws_region_name: us-east-1
  - model_name: gpt-4o
    litellm_params:
      model: openai/gpt-4o
      api_key: os.environ/OPENAI_API_KEY

router_settings:
  routing_strategy: simple-shuffle   # or least-busy, usage-based
  num_retries: 3
  timeout: 30
  fallbacks:
    - {"claude-sonnet": ["gpt-4o"]}
  cooldown_time: 60

general_settings:
  master_key: sk-...
  database_url: "postgresql://..."
  enable_cache: true
  cache_params:
    type: redis
    host: redis
```

Launch:

```bash
litellm --config config.yaml --port 4000
```

App sees LiteLLM as an OpenAI endpoint:

```python
client = OpenAI(base_url="http://litellm:4000", api_key="sk-team-...")
client.chat.completions.create(model="claude-sonnet", messages=[...])
```

Per-team virtual keys + budgets are core LiteLLM features — create keys via admin API, each with `max_budget` and `model_list`.

## Kong AI Gateway

Add AI plugins to a Kong route:

```yaml
plugins:
  - name: ai-proxy
    config:
      provider: anthropic
      model:
        name: claude-sonnet-4-5
        provider: anthropic
      auth:
        header_name: x-api-key
        header_value: ${ANTHROPIC_KEY}
  - name: ai-semantic-cache
    config:
      embeddings:
        provider: openai
        model: text-embedding-3-small
      vectordb:
        provider: redis
        dimensions: 1536
      threshold: 0.95
      exact_caching: true
  - name: ai-rate-limiting-advanced
    config:
      limit: [100]
      window_size: [60]
      identifier: header
      header_name: x-tenant-id
```

Deployable on existing Kong clusters — no new infra if Kong is already in the path.

## Semantic Cache at Gateway

Two levels:

1. **Exact cache**: hash of request → cached response. 100% safe; typical hit rate 5–15%.
2. **Semantic cache**: embed the query, look up nearest neighbor over recent queries, serve if cosine > τ.

```
Hit-rate / risk knobs:
  threshold 0.97 -> ~15% hit, ~1% wrong answer on ambiguous queries
  threshold 0.93 -> ~30% hit, higher risk; restrict to low-stakes features
```

Only enable semantic cache on idempotent, time-insensitive features (FAQ bots, docs search). Keep it off for anything operating on fresh data or where answers must be personalized to context.

Invalidation: bump the semantic cache version when re-indexing or swapping embedding models; old cached responses reference stale ground truth.

## Cost-Based Routing

Route by estimated complexity; Portkey and LiteLLM both support conditional routing.

```python
def route(messages):
    n = sum(len(m["content"]) for m in messages)
    if n < 2000 and all(m["role"] != "tool" for m in messages):
        return "haiku"     # cheap path
    return "sonnet"        # default
```

Or use a classifier (distilled model or BERT) to predict hard queries and route to Opus/GPT-4o for those.

## Rate-Limit Handling

Provider-side 429s should rarely reach your app — the gateway handles:

- **Retry with backoff** (respect `Retry-After`).
- **Fallback** to alternate provider.
- **Queue** under bursts (Portkey, LiteLLM Pro).
- **Per-tenant token bucket** at the gateway — one noisy tenant cannot starve others.

Tenant bucket pattern (LiteLLM):

```yaml
general_settings:
  max_parallel_requests: 100
  max_tokens_per_minute: 1_000_000
  tpm_limit: {"team-acme": 100_000, "team-beta": 500_000}
```

## Unified API Across Providers

Gateways expose the OpenAI chat/embeddings schema regardless of upstream. Benefits:

- One SDK everywhere (`openai` client or httpx).
- Swap providers without touching app code.
- Lang-agnostic — any OpenAI-compatible client works.

Caveat: advanced provider features (Anthropic tool-use shape, OpenAI function-calling nuances, `thinking` mode) may require gateway-specific passthrough. Check the gateway's feature matrix.

## Observability

Gateways emit one span per request with: tenant, model, tokens in/out, cost, cache hit/miss, retries, final provider. Export to LangSmith, Langfuse, Datadog, or OTel collectors. This is cheaper than instrumenting each call site.

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| App calling providers directly | Route through a single gateway for cache + fallback + observability |
| Cache enabled on personalized answers | Key cache on `tenant_id` + `user_id` or disable for that route |
| Semantic cache threshold too loose (<0.9) | Raise threshold; off-limits for high-stakes features |
| Same API key per tenant inside provider | Virtual keys with per-tenant budget + scope |
| Fallback to a structurally different model with no prompt adaptation | Add a prompt router per target model |
| Retrying 4xx (bad request) | Retry only 429/5xx |
| Unbounded gateway timeout | Enforce `request_timeout`; fail fast |

## Production Checklist

- [ ] One gateway in front of all LLM/embedding/rerank calls
- [ ] Exact cache on, semantic cache scoped to safe features
- [ ] Per-tenant virtual keys with budget and model scope
- [ ] Fallback chain tested by killing primary provider in staging
- [ ] Retry policy: only 429 / 5xx / timeout, with jitter + cap
- [ ] Rate-limit buckets per tenant at the gateway
- [ ] Per-model request timeout aligned with SLO
- [ ] Traces exported to LangSmith/Langfuse/OTel
- [ ] Runbook: rotating keys, adding new models, bumping cache version
