---
name: cost-allocation
disable-model-invocation: true
description: |
  Per-tenant, per-feature, per-query RAG cost tracking. Covers token counting
  (tiktoken, Anthropic count_tokens), structured metadata logging, aggregation
  in BigQuery/Snowflake/ClickHouse, dashboards (Grafana, Metabase), LangSmith
  and Langfuse native cost reports, and budget alerts. Schema + example queries.

  USE WHEN: user mentions "RAG cost", "cost per tenant", "cost per query",
  "token counting", "chargeback", "showback", "LangSmith cost", "Langfuse cost",
  "budget alerts"

  DO NOT USE FOR: reducing cost - use `rag-production`;
  batch-discount strategy - use `batch-inference`;
  routing for cheaper models - use `llm-gateway`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# RAG Cost Allocation

Finance, product, and SRE all ask the same question: *what does a RAG query cost, and who should pay?* The default provider dashboards only show account-level totals. You need per-tenant, per-feature, per-query attribution — which means instrumenting every call with structured metadata and aggregating it.

## Cost Components

| Component | Unit | Typical share |
|---|---|---|
| Embedding (ingest) | tokens → $ | 5–20% |
| Embedding (query) | tokens → $ | 1–5% |
| Vector DB | $/hour (managed) or compute | 10–30% |
| Rerank (hosted or self-hosted GPU) | pairs or $/h | 5–15% |
| LLM generation | tokens → $ | 50–80% |
| Storage (objects, snapshots) | $/GB/month | <5% |

LLM generation is almost always the top line item. Instrument it first.

## Token Counting

### OpenAI / general
```python
import tiktoken
enc = tiktoken.encoding_for_model("gpt-4o")
n_in  = len(enc.encode(prompt))
n_out = len(enc.encode(completion))
```

For OpenAI, prefer the `usage` block returned by the API — it is authoritative and includes cached/uncached breakdowns.

```python
resp = client.chat.completions.create(model="gpt-4o", messages=[...])
usage = resp.usage
prompt_tok = usage.prompt_tokens
cached_tok = usage.prompt_tokens_details.cached_tokens
out_tok    = usage.completion_tokens
```

### Anthropic
```python
import anthropic
client = anthropic.Anthropic()

# Pre-call estimate
est = client.messages.count_tokens(
    model="claude-sonnet-4-5",
    messages=[{"role": "user", "content": prompt}],
).input_tokens

# Authoritative from the response
resp = client.messages.create(model="claude-sonnet-4-5", messages=[...], max_tokens=512)
u = resp.usage
# u.input_tokens, u.output_tokens, u.cache_creation_input_tokens, u.cache_read_input_tokens
```

### Voyage / Cohere embedding
Their SDKs return `usage.total_tokens` (or the API responds with billed tokens). Always trust the API's count over local estimates.

## Pricing Table (Config, Not Code)

Keep prices out of source. Load from a versioned YAML / JSON in object storage so Finance can update without deploys.

```yaml
# pricing/2025-01.yaml
llm:
  anthropic/claude-sonnet-4-5:
    input_per_1m: 3.00
    output_per_1m: 15.00
    cache_write_per_1m: 3.75
    cache_read_per_1m: 0.30
  openai/gpt-4o:
    input_per_1m: 2.50
    output_per_1m: 10.00
embedding:
  openai/text-embedding-3-small:
    per_1m: 0.02
  voyage/voyage-3:
    per_1m: 0.06
rerank:
  cohere/rerank-v3.5:
    per_1k_searches: 2.00
```

```python
def cost_usd(provider_model: str, usage: dict, pricing: dict) -> float:
    p = pricing["llm"][provider_model]
    return (
        usage["input_tokens"]           * p["input_per_1m"]       / 1_000_000
      + usage["output_tokens"]          * p["output_per_1m"]      / 1_000_000
      + usage.get("cache_write", 0)     * p["cache_write_per_1m"] / 1_000_000
      + usage.get("cache_read", 0)      * p["cache_read_per_1m"]  / 1_000_000
    )
```

## Unified Log Schema

Emit one structured event per LLM / embedding / rerank call. Store in ClickHouse / BigQuery / Snowflake / a columnar Parquet lake — anything queryable.

```json
{
  "ts": "2025-04-14T18:22:01Z",
  "request_id": "req_01HX...",
  "trace_id": "trace_01HX...",
  "tenant_id": "acme-corp",
  "user_id": "u_42",
  "feature": "qa_chat",          // product surface
  "stage": "generation",         // embed | retrieve | rerank | generation
  "provider": "anthropic",
  "model": "claude-sonnet-4-5",
  "input_tokens": 3420,
  "output_tokens": 189,
  "cache_read_tokens": 3100,
  "cache_write_tokens": 0,
  "latency_ms": 1450,
  "cost_usd": 0.00412,
  "status": "ok"
}
```

Minimum viable set of keys: `tenant_id`, `feature`, `stage`, `model`, `*_tokens`, `cost_usd`, `ts`. Everything else is optional but helpful.

### Instrumenting with a wrapper

```python
def call_llm(messages, *, tenant_id, feature, model="claude-sonnet-4-5"):
    start = time.time()
    resp = anthropic_client.messages.create(model=model, messages=messages, max_tokens=1024)
    u = resp.usage
    usage = {
        "input_tokens": u.input_tokens,
        "output_tokens": u.output_tokens,
        "cache_read": u.cache_read_input_tokens or 0,
        "cache_write": u.cache_creation_input_tokens or 0,
    }
    log_event({
        "ts": iso_now(),
        "tenant_id": tenant_id,
        "feature": feature,
        "stage": "generation",
        "provider": "anthropic",
        "model": model,
        **usage,
        "cost_usd": cost_usd(f"anthropic/{model}", usage, pricing),
        "latency_ms": int((time.time() - start) * 1000),
    })
    return resp
```

## Warehouse Queries

### Monthly cost per tenant

```sql
SELECT tenant_id,
       SUM(cost_usd) AS cost,
       SUM(input_tokens + output_tokens) AS tokens,
       COUNT(*) AS calls
FROM llm_events
WHERE ts >= DATE_TRUNC('month', CURRENT_DATE)
GROUP BY 1
ORDER BY cost DESC;
```

### Cost per query (p50/p95)

```sql
SELECT feature,
       APPROX_PERCENTILE(cost_usd, 0.5)  AS p50,
       APPROX_PERCENTILE(cost_usd, 0.95) AS p95,
       APPROX_PERCENTILE(cost_usd, 0.99) AS p99
FROM (
  SELECT trace_id, feature, SUM(cost_usd) AS cost_usd
  FROM llm_events
  WHERE ts >= CURRENT_DATE - INTERVAL '7' DAY
  GROUP BY trace_id, feature
)
GROUP BY feature;
```

### Cache-hit savings (Anthropic)

```sql
SELECT model,
       SUM(cache_read_tokens)  AS cached_in,
       SUM(input_tokens)       AS billed_in,
       SAFE_DIVIDE(SUM(cache_read_tokens), SUM(cache_read_tokens + input_tokens)) AS hit_rate,
       SUM(cache_read_tokens)  * 0.30 / 1e6 AS saved_usd  -- at Sonnet cache-read rate
FROM llm_events
WHERE model LIKE 'claude-%'
GROUP BY 1;
```

## Dashboards

- **Grafana** on ClickHouse / Postgres: a `cost_events` table with hourly materialized views. Panels: total $ (24h), per-tenant top 20, cost per stage stacked bar, cache hit rate.
- **Metabase / Superset** on Snowflake or BigQuery: drag-and-drop for Finance.
- **LangSmith**: native cost + token panels if all traffic is instrumented with LangChain/LangGraph runs.
- **Langfuse**: `model_usage` + `trace.cost` with built-in pricing table; supports OTel; self-host free tier.
- **Helicone**: proxy-based, drops in with a `base_url` change; good for quick wins.

## Budget Alerts

```sql
-- Example alert query (Grafana)
SELECT tenant_id, SUM(cost_usd) AS cost_today
FROM llm_events
WHERE ts >= CURRENT_DATE
GROUP BY 1
HAVING SUM(cost_usd) > (SELECT daily_budget FROM tenants WHERE tenants.id = tenant_id)
```

Wire alerting channels:
- Slack webhook on >80% of budget (warn).
- PagerDuty on 100% (page).
- Automated throttle: insert `tenant_id` into a `throttled` table read by the gateway.

## Attribution Patterns

### Propagating `tenant_id` through pipelines

Put it on the request context and thread it into every downstream call:

```python
from contextvars import ContextVar
current_tenant: ContextVar[str] = ContextVar("tenant")

async def handle(req):
    current_tenant.set(req.headers["x-tenant"])
    return await rag_pipeline(req.query)

# Inside the pipeline:
call_llm(msgs, tenant_id=current_tenant.get(), feature="qa_chat")
```

With LangGraph / LlamaIndex, pass `tenant_id` via `RunnableConfig.configurable` or `callback_manager` metadata and extract in a shared handler.

### Shared vs dedicated indexes

- **Dedicated tenant index**: infra cost billed directly; generation still needs per-call attribution.
- **Shared index with namespace**: allocate infra cost by vector count or QPS share; generation via call logs.

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Using pre-call `count_tokens` as billed cost | Always use the API's `usage` — it is authoritative |
| Hardcoding prices in Python | Externalize to versioned YAML/JSON |
| Logging only at the top-level | Log each stage (embed, retrieve, rerank, generate) |
| Single dashboard for all tenants | Per-tenant drill-down + top-N board |
| No cache-read breakdown for Anthropic | Split `cache_read_tokens` from `input_tokens` |
| Alerts on day-of-month totals only | Also alert on hourly rate spikes |
| Forgetting vector DB and GPU serving costs | Include infra costs via infra cost export (AWS CUR, etc.) |

## Production Checklist

- [ ] One structured event per LLM/embedding/rerank call
- [ ] `tenant_id`, `feature`, `stage`, `model`, `*_tokens`, `cost_usd` on every event
- [ ] Pricing table externalized and version-tagged
- [ ] Warehouse ingestion (BQ/Snowflake/ClickHouse) with hourly rollup MVs
- [ ] Dashboards: per-tenant, per-feature, per-stage, cache-hit rate
- [ ] Budget alerts at 80% (Slack) and 100% (page + throttle)
- [ ] Reconciled monthly vs provider invoice (target < 2% variance)
- [ ] Infra costs (vector DB, GPU pools) joined via cost-and-usage reports
- [ ] Quarterly cost review by tenant + feature to target optimization
