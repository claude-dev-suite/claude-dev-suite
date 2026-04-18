---
name: time-aware-retrieval
description: |
  Temporal awareness in RAG. Recency bias weighting, exponential decay scoring,
  time-range filtering, LLM-based date extraction ("last quarter", "yesterday"),
  temporal knowledge graphs, freshness vs authority tradeoff, event-based
  retrieval, timestamp metadata, differential reindexing of old vs fresh docs.

  USE WHEN: user mentions "time-aware RAG", "recency bias", "temporal retrieval",
  "freshness", "date filter", "temporal knowledge graph", "exponential decay"

  DO NOT USE FOR: static metadata filters generally - use `self-querying-retriever`;
  CDC for ingestion - use `cdc-streaming-ingestion`;
  evaluation of time-sensitive answers - use `rag-evaluation`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Time-Aware Retrieval

## Why It Matters

"What is our refund policy?" should return the current policy, not the 2019 version. Pure semantic similarity often prefers older verbose documents that match more query terms. Time awareness corrects this.

Two failure modes to prevent:
1. **Stale wins**: old doc ranks above newer authoritative doc because it's more verbose.
2. **Fresh-but-wrong**: auto-generated recent doc outranks the authoritative but older source of truth.

## Approaches

| Approach | Needs | Strength | Weakness |
|---|---|---|---|
| Hard time filter | Date in query | Exact scoping | Fails for vague time |
| Recency decay | Timestamp metadata | Smooth, always applies | Can bury important old docs |
| LLM date extraction | LLM call | Handles "last quarter" | Latency + cost |
| Temporal KG | Entities with time edges | Multi-step time reasoning | Complex to build |
| Authority + recency blend | Authority score | Balances fresh vs canonical | Authority signal is hard |

## Timestamp Metadata

Every chunk needs at least:
- `created_at` — original publication time.
- `updated_at` — last content-significant edit.
- `valid_from`, `valid_to` — if the fact has explicit validity.

```python
from pydantic import BaseModel
from datetime import datetime

class ChunkMetadata(BaseModel):
    chunk_id: str
    doc_id: str
    created_at: datetime
    updated_at: datetime
    valid_from: datetime | None = None
    valid_to: datetime | None = None
    source_authority: float = 0.5   # 0-1; 1.0 = official/canonical
```

## Exponential Decay Scoring

```python
import math
from datetime import datetime

HALF_LIFE_DAYS = 180

def recency_weight(updated_at: datetime, now: datetime | None = None) -> float:
    now = now or datetime.utcnow()
    age_days = (now - updated_at).total_seconds() / 86400
    return 0.5 ** (age_days / HALF_LIFE_DAYS)

def blended_score(semantic_score: float, meta: ChunkMetadata, alpha: float = 0.8) -> float:
    return alpha * semantic_score + (1 - alpha) * recency_weight(meta.updated_at)
```

Half-life by domain:
- News: 7-30 days
- Software docs: 180 days
- Legal / regulations: 5-10 years
- Medical guidelines: 3-5 years
- Internal wiki: 365 days

Tune with the eval set; do not guess.

## Authority-Weighted Recency

Pure recency punishes canonical sources (e.g., the constitution). Blend with authority.

```python
def time_authority_score(semantic: float, meta: ChunkMetadata,
                         w_sem: float = 0.6, w_rec: float = 0.2, w_auth: float = 0.2) -> float:
    return (w_sem * semantic
            + w_rec * recency_weight(meta.updated_at)
            + w_auth * meta.source_authority)
```

Chunks from `/legal/policies/` get `source_authority=1.0`; chunks from community posts get 0.3.

## LLM Date Extraction

```python
from pydantic import BaseModel, Field
from typing import Literal
from datetime import datetime, timedelta
from langchain_anthropic import ChatAnthropic

class DateRange(BaseModel):
    has_time_filter: bool
    start: datetime | None = Field(None, description="ISO 8601 start")
    end: datetime | None = Field(None, description="ISO 8601 end")
    relative_hint: Literal["strict", "soft"] | None = Field(
        "soft", description="strict = only these dates; soft = prefer these dates"
    )

llm = ChatAnthropic(model="claude-haiku-4-5-20250929", temperature=0).with_structured_output(DateRange)

def extract_time(query: str, today: datetime) -> DateRange:
    return llm.invoke(
        f"Today is {today.isoformat()}. Extract any time filter from the query. "
        f"Return has_time_filter=false if no time reference.\n\nQuery: {query}"
    )
```

Examples:
- "refund policy" -> `has_time_filter=False`
- "revenue last quarter" -> `has_time_filter=True`, start/end of Q3 2025
- "what changed since January" -> `has_time_filter=True`, start=2025-01-01, end=today, `soft`

Soft hints feed the recency decay; strict hints become hard filters.

## Query Pipeline

```python
def time_aware_retrieve(query: str, top_k: int = 10):
    now = datetime.utcnow()
    dr = extract_time(query, now)
    candidates = vstore.similarity_search(query, k=100,
        filter=build_filter(dr) if dr.has_time_filter and dr.relative_hint == "strict" else None)

    scored = []
    for d in candidates:
        meta = ChunkMetadata(**d.metadata)
        base_score = d.metadata["score"]
        score = time_authority_score(base_score, meta)
        if dr.has_time_filter and dr.relative_hint == "soft":
            in_range = (dr.start or datetime.min) <= meta.updated_at <= (dr.end or datetime.max)
            score *= 1.2 if in_range else 0.9
        scored.append((d, score))
    scored.sort(key=lambda x: -x[1])
    return [d for d, _ in scored[:top_k]]

def build_filter(dr: DateRange) -> dict:
    f = {}
    if dr.start: f["updated_at"] = {"$gte": dr.start.isoformat()}
    if dr.end:   f.setdefault("updated_at", {})["$lte"] = dr.end.isoformat()
    return f
```

## Valid-From / Valid-To (versioned facts)

When a fact has explicit validity (policy versions, tax rates, product specs), treat retrieval as time travel.

```python
def facts_valid_at(t: datetime, candidates):
    return [d for d in candidates
            if (d.metadata.get("valid_from") or datetime.min) <= t
            <= (d.metadata.get("valid_to") or datetime.max)]
```

"What was our refund policy on 2024-03-15?" -> `facts_valid_at(2024-03-15)` returns only the then-live version.

## Temporal Knowledge Graph

For facts that evolve (employment, funding, releases), a temporal KG allows reasoning over changes.

```cypher
// Neo4j temporal edge
MERGE (p:Person {name: $name})
MERGE (c:Company {name: $company})
CREATE (p)-[r:WORKED_AT {from: date($from), to: date($to)}]->(c)
```

Query: "Who worked at Acme in 2023?"

```cypher
MATCH (p:Person)-[r:WORKED_AT]->(c:Company {name: 'Acme'})
WHERE r.from <= date('2023-12-31') AND (r.to >= date('2023-01-01') OR r.to IS NULL)
RETURN p.name
```

Zep and Graphiti expose this pattern as a service; they bi-temporal track `valid_time` (when it was true) and `transaction_time` (when we knew it).

## Event-Based Retrieval

Some queries are naturally about events ("the 2024 data breach"). Index events with:
- `event_time` — when the event occurred.
- `event_type` — category.
- `entities_involved` — for filtering/joining.

```python
def event_retrieve(query: str, event_type: str | None = None, before: datetime | None = None):
    f = {}
    if event_type: f["event_type"] = event_type
    if before: f["event_time"] = {"$lte": before.isoformat()}
    return vstore.similarity_search(query, k=10, filter=f)
```

## Differential Reindexing

Old docs rarely change; fresh docs change often. Reindexing is expensive — prioritize.

```python
def should_reindex(meta: ChunkMetadata) -> bool:
    if (datetime.utcnow() - meta.updated_at).days < 7:
        return True  # fresh content changes often
    if (datetime.utcnow() - meta.updated_at).days < 90:
        return meta.source_authority >= 0.7  # canonical sources still matter
    return False  # cold docs; index only on content hash change
```

Combine with content hashes (see `ingestion-orchestration`): only re-embed when the content hash changed AND `should_reindex` is true.

## Freshness in Evaluation

Include time-sensitive questions in your eval set with ground truth valid at eval time.

```python
# eval_set.jsonl
{"q": "current refund window", "ground_truth_valid_at": "2025-04-15",
 "expected_answer": "30 days", "expected_chunks": ["policy_v7"]}
{"q": "refund window in 2020", "ground_truth_valid_at": "2020-06-01",
 "expected_answer": "14 days", "expected_chunks": ["policy_v3"]}
```

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| No timestamp metadata at all | Every chunk gets `created_at` and `updated_at` |
| Same half-life for all domains | Tune by content type |
| Pure recency without authority | Canonical docs get buried; blend |
| Strict filter with no fallback | Empty result when nothing in range; fall back to soft hint |
| "Refresh" means re-embed everything | Content-hash + differential reindex |
| No valid-from / valid-to for versioned facts | Policy v1 and v2 both retrieved; user gets wrong answer |
| Date extraction on every query | Skip when query has no time keywords (regex gate) |
| Timestamps stored as strings in free form | ISO 8601 only; parse and enforce on ingest |
| Authority signal hardcoded | Derive from source path or explicit review |
| Not testing time-travel queries | Add valid-at eval cases |

## Production Checklist

- [ ] Every chunk has `created_at`, `updated_at` timestamps
- [ ] `valid_from` / `valid_to` for facts with explicit validity
- [ ] `source_authority` score per chunk (0-1)
- [ ] Recency decay half-life tuned per domain
- [ ] LLM date extraction gated behind a cheap regex pre-check
- [ ] Strict filter + soft bias pipeline
- [ ] Valid-at time-travel queries supported
- [ ] Temporal KG for evolving entity relationships (if domain requires)
- [ ] Differential reindexing by freshness + authority + content hash
- [ ] Eval set includes time-sensitive and historical queries
- [ ] Timezone handling documented (UTC canonical everywhere)
- [ ] Alerting on stale indexes (latest `updated_at` vs source-of-truth latest)
