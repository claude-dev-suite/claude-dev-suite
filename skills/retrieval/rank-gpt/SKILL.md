---
name: rank-gpt
description: |
  LLM-as-reranker patterns. RankGPT listwise / pairwise / pointwise prompting, sliding
  window for long candidate lists, cost-latency vs Cohere Rerank, calibration tricks,
  structured output for rank lists. Code uses the Anthropic SDK.

  USE WHEN: user mentions "LLM reranker", "RankGPT", "listwise reranking", "pairwise
  reranking", "pointwise reranking", "GPT reranker", "Claude reranker"

  DO NOT USE FOR: standard cross-encoder reranking - use `rag/reranking`; fine-tuning
  cross-encoders - use `retrieval/cross-encoder-training`; ColBERT - use
  `retrieval/colbert-retrieval`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# RankGPT: LLM-as-Reranker

## Why and When

LLM rerankers win when:

- The query contains instructions ("prefer recent docs", "exclude deprecated APIs").
- The corpus is too niche for pretrained rerankers (internal jargon, proprietary ontology).
- The system needs explanations alongside rankings.
- You have very few labeled examples — an LLM needs zero.

They lose on:

- Latency: 300-2000 ms vs 50-300 ms for cross-encoders.
- Cost: $3-30 per 1k queries vs <$2 for Cohere Rerank.
- Throughput: rate limits cap QPS without batching.

## Three Prompting Styles

| Style | Prompt shape | Cost | Quality |
|---|---|---|---|
| Pointwise | Score each doc independently (0-10) | O(n) calls, cheapest | Mid |
| Pairwise | Ask which of two docs is better | O(n log n) calls, priciest | High but slow |
| Listwise | Rank the whole batch in one call | One call per window | Best quality-to-cost |

Listwise is the RankGPT default.

## Listwise Reranking with Claude

```python
# pip install anthropic
from anthropic import Anthropic
import json, re

client = Anthropic()
MODEL = "claude-haiku-4-5-20250929"  # cheap, fast; upgrade to sonnet for hard queries

LISTWISE_PROMPT = """You rank passages by relevance to a user query.

Query: {query}

Passages (each starts with its index in brackets):
{passages}

Return a JSON object with a single field "ranking": an array of passage indexes
ordered from most to least relevant. Include every index exactly once.
No other text, no explanations."""

def format_passages(docs: list[str]) -> str:
    return "\n\n".join(f"[{i}] {d}" for i, d in enumerate(docs))

def listwise_rank(query: str, docs: list[str]) -> list[int]:
    msg = client.messages.create(
        model=MODEL,
        max_tokens=1024,
        messages=[{
            "role": "user",
            "content": LISTWISE_PROMPT.format(query=query, passages=format_passages(docs)),
        }],
    )
    text = msg.content[0].text
    match = re.search(r"\{[\s\S]*\}", text)
    data = json.loads(match.group(0))
    ranking = data["ranking"]
    # Safety: fill missing indexes at the end
    seen = set(ranking)
    missing = [i for i in range(len(docs)) if i not in seen]
    return ranking + missing
```

## Sliding Window for Long Candidate Lists

Claude handles > 100 passages in one prompt but prompt length grows quickly. The RankGPT paper uses a sliding window:

```
[0..19] rank -> keep top 10
[10..29] rank (seeded with previous top 10) -> keep top 10
[20..39] ...
```

```python
def sliding_rerank(query: str, docs: list[str], window: int = 20,
                   step: int = 10, keep: int = 10) -> list[int]:
    n = len(docs)
    if n <= window:
        return listwise_rank(query, docs)[:keep]

    # Start from the end so the best candidates bubble to position 0
    order = list(range(n))
    start = n - window
    while start >= 0:
        end = start + window
        slice_docs = [docs[i] for i in order[start:end]]
        local = listwise_rank(query, slice_docs)
        order[start:end] = [order[start + idx] for idx in local]
        start -= step
    return order[:keep]
```

End-to-start scan is the trick: the strongest document reaches the front of the list as windows slide back.

## Pairwise (Highest Quality, Most Expensive)

Pairwise calls scale as O(n log n) with merge-sort style comparisons:

```python
PAIRWISE_PROMPT = """Given the query, which passage is more relevant? Answer with "A" or "B" only.

Query: {query}

Passage A:
{a}

Passage B:
{b}

Answer:"""

def pairwise_compare(query: str, a: str, b: str) -> int:
    msg = client.messages.create(
        model=MODEL,
        max_tokens=5,
        messages=[{"role": "user",
                   "content": PAIRWISE_PROMPT.format(query=query, a=a, b=b)}],
    )
    return -1 if msg.content[0].text.strip().upper().startswith("A") else 1

import functools
def merge_sort_rerank(query: str, docs: list[str]) -> list[int]:
    idx = list(range(len(docs)))
    def cmp(i, j):
        return pairwise_compare(query, docs[i], docs[j])
    return sorted(idx, key=functools.cmp_to_key(cmp))
```

Avoid naive bubble-sort (O(n^2) calls). Use merge-sort or tournament bracket.

## Pointwise (Cheapest, Most Parallel)

```python
import asyncio
from anthropic import AsyncAnthropic
aclient = AsyncAnthropic()

POINTWISE_PROMPT = """Rate the relevance of the passage to the query from 0 to 10.
Return a JSON object: {{"score": <number>}}

Query: {query}

Passage: {passage}"""

async def point_score(query: str, passage: str) -> float:
    msg = await aclient.messages.create(
        model=MODEL, max_tokens=40,
        messages=[{"role": "user",
                   "content": POINTWISE_PROMPT.format(query=query, passage=passage)}],
    )
    try:
        return float(json.loads(re.search(r"\{[^}]*\}", msg.content[0].text).group(0))["score"])
    except Exception:
        return 0.0

async def pointwise_rerank(query: str, docs: list[str], top_n: int = 5) -> list[int]:
    scores = await asyncio.gather(*(point_score(query, d) for d in docs))
    return sorted(range(len(docs)), key=lambda i: scores[i], reverse=True)[:top_n]
```

Run calls concurrently with a semaphore to respect rate limits.

## Structured Output for Robustness

Anthropic tool-use forces a JSON shape — no regex needed:

```python
tools = [{
    "name": "submit_ranking",
    "description": "Submit the ranking of passage indexes from most to least relevant.",
    "input_schema": {
        "type": "object",
        "properties": {
            "ranking": {
                "type": "array",
                "items": {"type": "integer"},
                "description": "Passage indexes in descending relevance order",
            },
        },
        "required": ["ranking"],
    },
}]

def listwise_structured(query: str, docs: list[str]) -> list[int]:
    msg = client.messages.create(
        model=MODEL, max_tokens=1024, tools=tools, tool_choice={"type": "tool", "name": "submit_ranking"},
        messages=[{"role": "user",
                   "content": LISTWISE_PROMPT.format(query=query, passages=format_passages(docs))}],
    )
    for block in msg.content:
        if block.type == "tool_use" and block.name == "submit_ranking":
            return block.input["ranking"]
    raise ValueError("No ranking returned")
```

Always prefer tool-use over regex JSON extraction in production.

## Calibration: Force Consistency

LLMs are sensitive to passage order inside the prompt. Two tricks:

1. Shuffle input order each call; rerank yields a *relative* order, not absolute.
2. Run two passes with different initial orders; fuse with RRF.

```python
import random

def robust_listwise(query: str, docs: list[str], passes: int = 3) -> list[int]:
    from collections import defaultdict
    scores = defaultdict(float)
    for _ in range(passes):
        perm = list(range(len(docs)))
        random.shuffle(perm)
        shuffled = [docs[i] for i in perm]
        ranking = listwise_structured(query, shuffled)
        for rank, local_idx in enumerate(ranking):
            real_idx = perm[local_idx]
            scores[real_idx] += 1.0 / (60 + rank + 1)  # RRF
    return sorted(scores, key=scores.get, reverse=True)
```

## Cost and Latency vs Cohere Rerank

| Reranker | Candidates | Latency | Cost / 1k queries |
|---|---|---|---|
| Cohere Rerank v3.5 | 50 | 100-300 ms | ~$2.00 |
| Claude Haiku listwise | 20 | 300-700 ms | ~$3-5 |
| Claude Haiku listwise sliding (50) | 50 | 600-1500 ms | ~$8-15 |
| Claude Sonnet listwise | 20 | 500-1200 ms | ~$15-25 |
| Claude Haiku pointwise async | 50 | 200-600 ms | ~$5-8 |
| Claude Haiku pairwise merge-sort | 20 | 800-2000 ms | ~$10-20 |

Pick Haiku listwise with sliding window as the default LLM-reranker. Upgrade to Sonnet only for hard queries.

## Prompt Caching for Cost Control

The query + passages prompt has a large fixed header (instructions, passages rarely change across a user session). Cache it via Anthropic's prompt caching:

```python
msg = client.messages.create(
    model=MODEL, max_tokens=1024,
    system=[
        {"type": "text", "text": "You rank passages by relevance...",
         "cache_control": {"type": "ephemeral"}},
    ],
    messages=[{"role": "user", "content": LISTWISE_PROMPT.format(...)}],
)
```

Cache hits cut cost ~90% and latency ~30-50% for repeat calls within 5 minutes.

## When to Fall Back

Always wrap LLM reranking with a timeout and fallback:

```python
import asyncio

async def rerank_with_fallback(query, docs, top_n=5, timeout_s=2.0):
    try:
        return await asyncio.wait_for(
            pointwise_rerank(query, docs, top_n), timeout=timeout_s
        )
    except (asyncio.TimeoutError, Exception):
        return list(range(top_n))  # retrieval order
```

LLM rate limits or transient errors must not break the user-facing query path.

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Using Sonnet or Opus for reranking | Haiku is 90% as good at 10% the cost |
| Listwise with 100 docs in one prompt | Use sliding window; attention degrades |
| Parsing JSON with regex alone | Use Anthropic tool-use for structured output |
| No timeout on reranker call | Hard timeout (1-2 s) with retrieval-order fallback |
| Shuffling order but not aggregating multiple passes | Run 3 passes and RRF — single shuffled pass is still biased |
| LLM rerank on every query in a high-QPS path | Cache by (query, candidate-set-hash); or rerank only low-confidence retrievals |
| Ignoring rate limits | Respect Tier 1-4 caps; batch async calls under a semaphore |
| Missing passage indexes in the output | Always fill missing indexes at the tail before consuming |

## Production Checklist

- [ ] Listwise + sliding window default; pairwise only for high-stakes queries
- [ ] Claude Haiku as default; Sonnet as opt-in for hard queries
- [ ] Tool-use for structured ranking output (no regex fallback)
- [ ] Prompt caching enabled on system prompt
- [ ] Hard timeout with retrieval-order fallback
- [ ] Rate-limit-aware semaphore around async calls
- [ ] Rerank quality A/B tested against Cohere Rerank monthly
- [ ] Cost per query dashboard (input + cached + output tokens)
- [ ] Multi-pass shuffle + RRF for stability on sensitive queries
- [ ] Defensive missing-index handling in the parser
