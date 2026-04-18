---
name: rag-observability
description: |
  Tracing, evaluation, and alerting for RAG systems. LangSmith, Langfuse,
  Arize Phoenix, Comet Opik, OpenTelemetry GenAI conventions. What to log
  (query, chunks+scores, rerank scores, answer, citations), retrieval
  debugging workflows, alerts for empty/low-score retrieval.

  USE WHEN: user mentions "LangSmith", "Langfuse", "Phoenix", "Opik",
  "OpenTelemetry LLM", "LLM tracing", "retrieval debugging", "RAG metrics",
  "RAG dashboard", "RAG alerting"

  DO NOT USE FOR: hallucination validators - use `rag-guardrails`;
  caching layer metrics - use `rag-caching`;
  security audit logs - use `rag-security`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# RAG Observability

## Minimum Log Schema per Request

```json
{
  "trace_id": "uuid",
  "tenant_id": "t_123",
  "user_id_hash": "sha256(...)",
  "query": "...",
  "rewritten_queries": ["..."],
  "retrieval": [
    {"chunk_id": "c1", "score": 0.82, "source": "doc1.pdf#p3",
     "retriever": "hybrid", "rank": 1}
  ],
  "rerank": [{"chunk_id": "c3", "score": 0.91, "rank": 1}],
  "prompt_tokens": 1820,
  "completion_tokens": 310,
  "latency_ms": {"retrieve": 42, "rerank": 180, "generate": 1200, "total": 1520},
  "answer": "...",
  "citations": ["c3", "c5"],
  "groundedness_score": 0.88,
  "cache_layer": "L2",
  "model": "claude-opus-4-5",
  "index_version": "v42",
  "embedding_model": "text-embedding-3-small"
}
```

**Never** log raw user PII. Hash user IDs, and redact the query if your policy requires it (see `rag-security`).

## LangSmith

```python
# pip install langsmith
import os
os.environ["LANGCHAIN_TRACING_V2"] = "true"
os.environ["LANGCHAIN_API_KEY"] = "..."
os.environ["LANGCHAIN_PROJECT"] = "rag-prod"

from langsmith import traceable, Client

@traceable(run_type="retriever", name="hybrid_retrieve")
def retrieve(query: str, k: int = 8):
    hits = vectorstore.similarity_search_with_score(query, k=k)
    return [{"page_content": d.page_content, "metadata": d.metadata,
             "score": float(s)} for d, s in hits]

@traceable(run_type="chain", name="rag_answer")
def rag_answer(query: str):
    docs = retrieve(query)
    return generate(query, docs)

# Custom evaluators
from langsmith.evaluation import evaluate, LangChainStringEvaluator

evaluate(
    rag_answer,
    data="rag-golden-set",
    evaluators=[
        LangChainStringEvaluator("qa"),                 # reference answer
        LangChainStringEvaluator("labeled_criteria",    # LLM judge
             config={"criteria": "groundedness"}),
    ],
    experiment_prefix="opus-vs-sonnet",
)
```

The retriever run type surfaces chunk scores in the UI. Attach feedback with `Client().create_feedback(run_id, key="thumbs", score=1)` from your app.

## Langfuse (Self-Hostable)

```python
# pip install langfuse
from langfuse import Langfuse
from langfuse.decorators import observe, langfuse_context

lf = Langfuse(host="https://langfuse.your-domain.com")

@observe()
def rag_answer(query: str):
    langfuse_context.update_current_trace(
        user_id=hashed_user, session_id=session_id,
        tags=["prod", "tenant:"+tenant_id],
    )
    docs = retrieve(query)
    langfuse_context.update_current_observation(
        metadata={"top_score": docs[0].score, "n_retrieved": len(docs)})
    answer = generate(query, docs)
    return answer

# Score programmatically (groundedness, latency SLA, etc.)
lf.score(trace_id=langfuse_context.get_current_trace_id(),
         name="groundedness", value=groundedness_score)
```

Langfuse's strengths: self-hosted, prompt versioning, dataset + experiment runner, RBAC.

## Arize Phoenix (Local, OTel-native)

```python
# pip install arize-phoenix openinference-instrumentation-langchain
import phoenix as px
from phoenix.otel import register
from openinference.instrumentation.langchain import LangChainInstrumentor

px.launch_app()                           # local UI on :6006
tracer_provider = register(project_name="rag-dev")
LangChainInstrumentor().instrument(tracer_provider=tracer_provider)

# Works the same for OpenAI / Anthropic / LlamaIndex via
# openinference-instrumentation-{openai,anthropic,llama_index}
```

Phoenix exports OpenTelemetry spans natively; point it at any OTLP backend (Jaeger, Tempo, Honeycomb) in production.

## Comet Opik

```python
# pip install opik
import opik
from opik import track

opik.configure(use_local=True)  # or Comet cloud

@track(name="rag_answer", type="general")
def rag_answer(query: str):
    docs = retrieve(query)
    return generate(query, docs)

from opik.evaluation.metrics import Hallucination, AnswerRelevance
metrics = [Hallucination(), AnswerRelevance()]
```

Opik includes built-in LLM-judge metrics and integrates with CI for regression gates.

## OpenTelemetry GenAI Semantic Conventions

Vendor-neutral spans using the stable GenAI conventions:

```python
# pip install opentelemetry-api opentelemetry-sdk opentelemetry-exporter-otlp
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter

provider = TracerProvider()
provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
trace.set_tracer_provider(provider)
tracer = trace.get_tracer("rag")

def rag(query: str):
    with tracer.start_as_current_span("gen_ai.chat") as span:
        span.set_attribute("gen_ai.system", "anthropic")
        span.set_attribute("gen_ai.request.model", "claude-opus-4-5")
        span.set_attribute("gen_ai.operation.name", "chat")

        with tracer.start_as_current_span("retrieval") as rs:
            docs = retrieve(query)
            rs.set_attribute("retrieval.top_k", len(docs))
            rs.set_attribute("retrieval.top_score", docs[0].score if docs else 0)

        ans = generate(query, docs)
        span.set_attribute("gen_ai.usage.input_tokens", ans.usage.input)
        span.set_attribute("gen_ai.usage.output_tokens", ans.usage.output)
        return ans
```

Key attributes from the GenAI conventions: `gen_ai.system`, `gen_ai.request.model`, `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`, `gen_ai.response.finish_reasons`. Custom RAG attributes: `retrieval.top_k`, `retrieval.top_score`, `retrieval.source_ids`.

## Retrieval Debugging Workflow

When a user reports a bad answer:

1. Look up `trace_id` from the response footer or logs.
2. Inspect retrieval span: what chunks were returned? Scores?
3. Check if the expected chunk is in the index: `index.fetch(expected_chunk_id)`.
4. If present but not retrieved: query embedding is wrong (rewording? language?). Compare embeddings cosine similarity manually.
5. If retrieved but not top-K: tune K, add rerank, adjust weights.
6. If top-K but answer still bad: inspect prompt tokens (truncation?), check groundedness score.
7. Add the failing query to the eval set with the expected answer and expected chunks.

## Alert Conditions

| Alert | Signal | Threshold | Action |
|---|---|---|---|
| Empty retrieval | `retrieval.top_k == 0` | > 1% of requests over 5m | Check index health, embedding API |
| Low-score retrieval | `top_score < floor` | > 5% over 15m | Tune floor, investigate drift |
| High refusal rate | `answer == "INSUFFICIENT_CONTEXT"` | > 10% over 15m | Eval + index audit |
| Groundedness drop | median `groundedness_score` | drop > 0.1 vs 7d baseline | Rollback model/prompt |
| Latency SLA breach | p95 `latency_ms.total` | > SLA for 10m | Scale up, shed load |
| Token spend spike | `prompt_tokens` p95 | > 2x baseline | Prompt regression, context bloat |
| Cache hit rate drop | `cache_layer == "ORIGIN"` ratio | +20% over 1h | Cache invalidation storm |
| DLQ growth (ingest) | dlq depth | > 100 or rising | Malformed docs, schema drift |

Emit as Prometheus metrics or CloudWatch custom metrics; alert via PagerDuty/OpsGenie.

## Golden Set + Nightly Eval

```python
# LangSmith nightly evaluator
from langsmith.evaluation import aevaluate
await aevaluate(
    rag_answer,
    data="rag-golden-set",
    evaluators=[faithfulness_judge, recall_at_5, answer_relevancy_judge],
    experiment_prefix=f"nightly-{date.today()}",
    max_concurrency=8,
)
# Compare experiments; fail the CI job if median faithfulness dropped > 0.05
```

## Shadow Traffic for Index/Model Changes

Run the candidate index/model in parallel on 5-10% of live traffic; compute agreement rate, per-metric deltas, and cost delta before promoting.

```python
async def serve(query: str):
    primary = asyncio.create_task(rag_v42(query))
    if random.random() < 0.1:
        asyncio.create_task(log_shadow(rag_v43(query), query))
    return await primary
```

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Logging only the final answer | Log retrieval + rerank scores per span |
| Logging raw PII in traces | Hash/redact before send; pick vendor with PII filters |
| One trace per whole app request | Use nested spans per stage (retrieve, rerank, generate) |
| No golden set | Build 100+ Q/A/expected-chunk examples; grow weekly |
| Alerting only on 5xx | Alert on quality metrics (groundedness, recall, refusal) |
| Changing model and index simultaneously | Change one at a time with shadow + eval gate |
| Eval only offline | Run online scoring (LLM judge) on sampled live traffic |

## Production Checklist

- [ ] Single `trace_id` propagated from request to every downstream call
- [ ] Retrieval scores, rerank scores, citations in each trace
- [ ] Token usage + cost per request
- [ ] OpenTelemetry GenAI attributes set
- [ ] Alerts for empty retrieval, low-score, refusal, groundedness drop
- [ ] Golden eval set in version control; nightly CI run
- [ ] Online LLM-judge sampling on 1-5% of prod traffic
- [ ] Shadow-traffic mechanism for new index/model candidates
- [ ] Dashboard: latency p50/p95/p99, cost, quality, cache hit rate
- [ ] PII redaction at trace emission, not at storage
