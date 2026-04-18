---
name: feedback-loops
description: |
  User feedback signals for RAG improvement: thumbs up/down, click-through, dwell
  time, explicit ratings. Implicit vs explicit signals, logging schema, feedback
  -> retraining pipelines (embedding fine-tuning with hard negatives, reranker
  fine-tuning from CTR), A/B testing RAG variants, Langfuse/LangSmith feedback
  APIs, feature stores for online learning.

  USE WHEN: user mentions "user feedback", "thumbs up down", "CTR", "dwell time",
  "RAG evaluation feedback", "hard negatives", "reranker fine-tune", "A/B test RAG"

  DO NOT USE FOR: offline eval metrics - use `rag-evaluation`;
  retriever algorithms - use `advanced-retrieval`;
  observability as such - use `rag-observability`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Feedback Loops for RAG

## Signals

### Explicit

| Signal | Latency | Density | Reliability |
|---|---|---|---|
| Thumbs up/down | Immediate | Low (< 5% response rate) | Medium — noisy |
| Star rating (1-5) | Immediate | Very low | Higher, but biased toward extremes |
| Free-text feedback | Delayed | Lowest | Highest — but hard to parse |
| Per-citation accept/reject | Immediate | Low | High — directly actionable |

### Implicit

| Signal | Captures | Caveat |
|---|---|---|
| Click-through on citation | Perceived relevance | Confirms source seen, not correctness |
| Dwell time on cited doc | Actual engagement | Needs session tracking |
| Copy text | High intent | Only partial |
| Regenerate click | Answer failure | Ambiguous — could be style not content |
| Next-turn "no, I meant..." | Answer failure | Parse NLU |
| Session abandonment | Frustration | Noisy — could be scheduled meeting |
| Scroll depth on answer | Read-through | Weak signal |

Always log both. Implicit is dense; explicit is reliable. Combine.

## Logging Schema

```python
from pydantic import BaseModel
from datetime import datetime
from typing import Literal
from uuid import UUID

class RagEvent(BaseModel):
    event_id: UUID
    session_id: UUID
    user_id: str | None
    ts: datetime
    # Query context
    query: str
    rewritten_query: str | None
    classifier_path: str
    # Retrieval
    retriever_variant: str            # for A/B
    retrieved_ids: list[str]          # chunk IDs with rank
    retrieval_scores: list[float]
    # Generation
    answer_id: UUID
    model: str
    tokens_in: int
    tokens_out: int
    latency_ms: int
    # Citations emitted by answer
    cited_ids: list[str]

class FeedbackEvent(BaseModel):
    event_id: UUID
    answer_id: UUID                    # FK to RagEvent
    kind: Literal["thumbs", "rating", "citation_click", "citation_accept",
                  "citation_reject", "regenerate", "copy", "dwell", "free_text"]
    value: float | str | None          # 1/-1 for thumbs, 1-5 for rating, seconds for dwell
    chunk_id: str | None               # for citation-level feedback
    ts: datetime
```

Store in an append-only table (Postgres, BigQuery, Clickhouse). Join on `answer_id` downstream. Do not mutate rows — feedback events are facts.

## Integration: Langfuse

```python
from langfuse import Langfuse
from langfuse.decorators import observe, langfuse_context

langfuse = Langfuse()

@observe()
def answer(q: str, session_id: str):
    langfuse_context.update_current_trace(session_id=session_id, input=q)
    docs = retriever.invoke(q)
    langfuse_context.update_current_observation(
        metadata={"retrieved": [d.metadata["id"] for d in docs]}
    )
    ans = llm.invoke(build_prompt(q, docs))
    langfuse_context.update_current_trace(output=ans.content)
    return ans.content, langfuse_context.get_current_trace_id()

# Later, from the UI:
def record_thumbs(trace_id: str, value: int):
    langfuse.score(trace_id=trace_id, name="thumbs", value=value, data_type="BOOLEAN")
```

## Integration: LangSmith

```python
from langsmith import Client

client = Client()

def record_feedback(run_id: str, kind: str, value):
    client.create_feedback(run_id, key=kind, score=value if kind == "thumbs" else None,
                           value=str(value))
```

## From Signal to Hard Negatives

Low-rated answers plus the chunks that were retrieved but not helpful are hard-negative training material for the embedding model.

```python
import polars as pl

def build_hard_negatives(days: int = 30):
    df = pl.read_database("SELECT * FROM rag_events WHERE ts > now() - INTERVAL '30 days'")
    fb = pl.read_database("SELECT * FROM feedback_events WHERE kind='thumbs'")

    joined = df.join(fb, on="answer_id").filter(pl.col("value") == -1)
    # Explicit negative signal: query + retrieved chunks that did not lead to a useful answer.
    pairs = []
    for row in joined.iter_rows(named=True):
        for cid in row["retrieved_ids"][:5]:
            pairs.append({"query": row["query"], "negative_id": cid})
    return pairs
```

Pair hard negatives with user-accepted positive citations (citation_accept events) to build triples:

```python
def triples():
    # (query, positive_chunk, negative_chunk)
    ...
```

## Embedding Fine-Tuning (Sentence-Transformers)

```python
from sentence_transformers import SentenceTransformer, InputExample, losses
from torch.utils.data import DataLoader

model = SentenceTransformer("BAAI/bge-base-en-v1.5")

examples = [
    InputExample(texts=[row["query"], row["positive_text"], row["negative_text"]])
    for row in triples_df.iter_rows(named=True)
]
loader = DataLoader(examples, shuffle=True, batch_size=16)
loss = losses.TripletLoss(model=model, triplet_margin=0.3)

model.fit([(loader, loss)], epochs=3, warmup_steps=100)
model.save("models/bge-ft-v2")
```

Re-embed the corpus with the fine-tuned model (blue-green index swap). Measure retrieval P@5 and MRR on a held-out eval set before promoting.

## Reranker Fine-Tuning from CTR

The reranker ranks top-50. User clicks on citations at ranks 1-5 are a cheap pairwise preference signal.

```python
# Pairwise: if user clicked chunk at rank 3 and not chunks at ranks 1-2,
# then (q, chunk_3) > (q, chunk_1) and > (q, chunk_2).

from sentence_transformers import CrossEncoder

clicks_pairs = build_pairwise_from_clicks(days=30, min_per_query=2)

ce = CrossEncoder("BAAI/bge-reranker-base", num_labels=1)
train = [InputExample(texts=[q, doc], label=float(label)) for q, doc, label in clicks_pairs]
ce.fit(train_dataloader=DataLoader(train, shuffle=True, batch_size=16),
       epochs=2, warmup_steps=200)
ce.save("models/reranker-ft-v2")
```

## Online Learning via Feature Store

For low-latency reranking blends (boost chunks user interacted with in prior sessions), use a feature store.

```python
# Feast example
from feast import FeatureStore

fs = FeatureStore(repo_path="feast_repo")

def enrich_with_user_features(user_id: str, candidate_ids: list[str]):
    feats = fs.get_online_features(
        features=["chunk:click_rate_7d", "user_chunk:last_seen_days"],
        entity_rows=[{"user_id": user_id, "chunk_id": cid} for cid in candidate_ids],
    ).to_dict()
    return feats
```

Blend online features into the reranker score (linear combination or LTR model).

## A/B Testing RAG Variants

```python
import hashlib

def assign_variant(session_id: str) -> str:
    h = int(hashlib.md5(session_id.encode()).hexdigest(), 16)
    return "B" if h % 100 < 50 else "A"

def retrieve(q: str, session_id: str):
    variant = assign_variant(session_id)
    if variant == "A":
        return retriever_v1.invoke(q)
    return retriever_v2.invoke(q)
```

Primary metric: thumbs-up rate per answer. Secondary: CTR on first citation, regenerate rate, dwell time. Guardrail: latency P95, cost per answer.

Sample size: for a thumbs-up rate of ~30% with detection of a 2 percentage point lift at 80% power, you need ~7k answers per variant. Run the experiment until both conditions hit the floor.

## Counterfactual / Off-Policy Evaluation

Most feedback is collected only on the variant actually shown. To evaluate a new ranker offline without a live experiment:

```python
# Inverse propensity scoring over logged clicks
# P(action | variant) used as the propensity weight.
def ips_estimator(logs, new_ranker):
    total = 0
    for row in logs:
        new_rank = new_ranker.rank(row.query, row.chunk_id)
        if new_rank == row.shown_rank:
            total += row.reward / row.propensity
    return total / len(logs)
```

Useful when a live A/B is too expensive. Validate with a small live test before full rollout.

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Only thumbs up/down | Add implicit signals; explicit is too sparse |
| Conflating "regenerate" with negative feedback | Regenerate can mean "want different style"; look at next interaction |
| Fine-tuning on tiny data | Need >= 1-5k triples before fine-tuning helps |
| No eval set for fine-tuned model | Validate on a held-out labeled set; blue-green deploy |
| Click = correctness | Click confirms attention, not answer quality |
| Unweighted feedback | Power-user feedback should weight more (session length, role) |
| Ignoring latency/cost guardrails in A/B | A "better" variant that takes 2x latency loses users |
| Mutating logged rows | Feedback is append-only; immutable events |
| Using the same feedback events for training and eval | Split strictly by timestamp |
| No user identification | Per-user baseline drift kills signal |

## Production Checklist

- [ ] Every answer has a stable `answer_id` exposed to the client
- [ ] Append-only `rag_events` and `feedback_events` tables
- [ ] Thumbs, rating, citation-click, citation-accept, regenerate, dwell all logged
- [ ] Langfuse or LangSmith trace IDs joined to feedback
- [ ] Nightly job builds hard-negative triples
- [ ] Embedding fine-tuning scheduled (weekly/monthly) with blue-green index swap
- [ ] Reranker fine-tuning scheduled from click logs
- [ ] Feature store (Feast/Tecton) for online personalization signals
- [ ] A/B harness with hash-based assignment and guardrails
- [ ] Sample-size calculator applied before starting experiments
- [ ] Primary metric (thumbs-up) + secondary (CTR, regenerate, dwell) + guardrails (latency, cost)
- [ ] Eval set strictly time-separated from training set
- [ ] Privacy review: feedback logs are PII; apply retention policy
