---
name: long-context-vs-rag
description: |
  Decision framework: when long-context (Gemini 2M, Claude 200k, GPT 128k) beats
  RAG, hybrid approaches (RAG narrows, long-context reads), cost-quality-latency
  tradeoffs, lost-in-the-middle / context rot research, needle vs synthesis tasks,
  prompt caching economics, concrete $ per query math.

  USE WHEN: user mentions "long context vs RAG", "Gemini 2M", "lost in the middle",
  "context rot", "when not to use RAG", "stuff the prompt", "prompt caching cost"

  DO NOT USE FOR: implementing RAG - use `rag-architecture`;
  evaluating RAG - use `rag-evaluation`;
  chunking decisions alone - use `chunking-strategies`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Long Context vs RAG

## The Decision Has Shifted

As of 2025:
- Claude Sonnet 4.5: 200k tokens native, 1M in extended context mode.
- Gemini 2.5 Pro: 2M tokens.
- GPT-4o family: 128k typical.
- Prompt caching makes re-reading large prefixes ~10x cheaper.

This invalidates old heuristics. RAG is no longer automatic; below certain corpus sizes, long-context is cheaper and better.

## Decision Tree

```
Total corpus tokens?
  < 50k  -> Stuff the prompt. No RAG. No caching needed.
  50k-200k
    Query volume high and prompt is stable? -> Long context + prompt caching.
    Low volume or rapidly changing?         -> Long context, no caching.
  200k-2M
    Single user, interactive? -> Long context (Gemini 2M, Claude 1M).
    High concurrency?         -> RAG.
  > 2M   -> RAG, no choice.
```

Additional overrides:
- Need auditability with citations? -> RAG (citations harder in long context).
- Content changes hourly? -> RAG (cache invalidates).
- Regulatory requirement to prove what was retrieved? -> RAG.

## Cost Math: The Real Numbers

Claude Sonnet 4.5 pricing (approximate 2025, subject to change):
- Input: $3 / M tokens
- Output: $15 / M tokens
- Cache write: 1.25x input
- Cache read: 0.1x input (10% of base)

### Example 1: 150k token corpus, 10 queries/min

**Stuff without caching**
- Per query: 150k in + 500 out = $0.4575
- 10/min * 60min = 600 queries/hour = $274/hour

**Stuff with caching**
- Cache write (once / 5min): 150k * 1.25 * 12 (per hour) = 2.25M = $6.75
- Cache read per query: 150k * 0.1 = 15k effective = $0.045
- Per query: $0.045 + (500 * 0.000015) = ~$0.053
- 600 queries: $6.75 + 600 * $0.053 = ~$38/hour
- **Savings: 86%**

**RAG (5k retrieved tokens per query)**
- Retrieval: ~$0.0003 (OpenAI text-embedding-3-small)
- LLM: 5k in + 500 out = $0.0225
- Per query: ~$0.023
- 600 queries: $14/hour
- **Cheapest — but infra cost (vector DB, reranker) is amortized**

At > 10 queries/min and corpus < 200k tokens, cached long-context is competitive with small-corpus RAG once you include RAG's infra cost (vector DB, reranker API, maintenance).

### Example 2: 1M token corpus, 1 query/min

**Stuff with caching**
- Cache write: 1M * 1.25 = 1.25M = $3.75 per 5-min window = $45/hour
- Read per query: 1M * 0.1 = 100k = $0.30
- 60 queries: $45 + 60 * $0.30 = $63/hour

**RAG**
- 60 queries * $0.023 = $1.38/hour
- **RAG wins 45x**

Rule: above ~300k tokens, RAG dominates on cost regardless of caching.

## Quality: The Lost-in-the-Middle / Context Rot Problem

Research (Liu et al. 2023, Anthropic 2024 needle-in-haystack, Databricks 2024):

- Accuracy drops when relevant info is in the middle of a long context.
- Claude, GPT-4, and Gemini all show degradation > 100k tokens on multi-fact synthesis tasks (even when needle retrieval is ~100%).
- Distractors hurt: 20 irrelevant chunks + 1 relevant is harder than 1 relevant alone.

| Task type | Long context strength | RAG strength |
|---|---|---|
| Needle retrieval (1 fact) | Strong ~100% up to context limit | Strong if retrieval works |
| Synthesis across many parts | Degrades above 50-100k | Works — the parts are selected |
| Comparison across sources | Good if all fit | Better — explicit top-K |
| Summarization of whole corpus | Unique strength of long context | Cannot — RAG sees only top-K |
| Reasoning over many entities | Degrades | RAG focuses on the relevant entities |

Choose long context when the query needs the whole document. Choose RAG when the query needs a small fraction.

## Hybrid: RAG Narrows, Long Context Reads

Use RAG to filter to the top-N relevant documents, then stuff those documents (not chunks) into long context. Best of both:
- RAG avoids paying for 90% irrelevant content.
- Long context keeps doc-level coherence (no chunking artifacts).

```python
from langchain_anthropic import ChatAnthropic
from anthropic import Anthropic

retriever_client = Anthropic()
llm = ChatAnthropic(model="claude-sonnet-4-5-20250929", max_tokens=2048)

def hybrid_long_rag(question: str, top_doc_ids_k: int = 5):
    # Step 1: RAG at document granularity (not chunk)
    doc_ids = doc_level_retriever.invoke(question)[:top_doc_ids_k]
    full_docs = [document_store.get(did) for did in doc_ids]

    # Step 2: stuff full docs into long context with caching
    total_tokens = sum(count_tokens(d.text) for d in full_docs)
    use_cache = total_tokens > 20_000  # cache breakeven threshold

    system_blocks = [
        {"type": "text", "text": f"[DOC {d.id}]\n{d.text}",
         "cache_control": {"type": "ephemeral"} if use_cache else None}
        for d in full_docs
    ]
    # Filter None cache_control fields
    system_blocks = [{k: v for k, v in b.items() if v is not None} for b in system_blocks]

    resp = retriever_client.messages.create(
        model="claude-sonnet-4-5-20250929",
        max_tokens=1024,
        system=system_blocks,
        messages=[{"role": "user", "content": question}],
    )
    return resp.content[0].text
```

Doc-level retrieval avoids chunking losses; caching makes re-reads cheap.

## Latency Comparison

| Setup | TTFT | Full response |
|---|---|---|
| RAG (hybrid, reranked) | 800-1500ms | 2-4s |
| Long context, first call (cold cache) | 3-10s | 5-20s |
| Long context, cached call | 800-1500ms | 2-5s |
| Hybrid RAG + long context | 1200-2000ms | 3-6s |

Cold long context is slow. Cached long context is competitive. RAG is consistently fast because retrieval + small-context generation has low variance.

## Prompt Caching: When It Helps

Caching helps when:
- Prefix is reused > ~3 times within the 5-min TTL.
- Prefix is > 1024 tokens (minimum cacheable size).
- Prefix is stable between calls.

Caching does not help when:
- Each query has a different large context.
- Prefix changes frequently (content updates hourly).
- Low query rate (< 1 per 5 min).

## What Each Excels At

| Use case | Choose |
|---|---|
| Q&A over 50k-token spec document (single user) | Long context + caching |
| Enterprise KB with 10k documents, 1000 daily users | RAG |
| Legal discovery across one case (2M pages) | Tiered: RAG to surface + long-context to read |
| Customer support chatbot | RAG (dynamic content, citations needed) |
| Code review over a single PR | Long context (whole PR + dependencies) |
| Code review over entire codebase | RAG + long context hybrid |
| Research agent needing 50 sources | RAG + agentic |
| Summarize this one book | Long context |
| News chatbot | RAG (freshness) |

## Needle-in-Haystack Is Not Enough

Vendors advertise near-100% recall on needle tests. This is a single-fact retrieval. Real tasks are:
- Multi-fact synthesis (20 needles, combined).
- Reasoning with distractors.
- Dense numerical extraction.

Benchmarks that capture this better: RULER, BABILong, LongBench, HELMET. Consult these, not the marketing chart.

## Migration: Starting Point

Starting a new project with a corpus under 300k tokens: begin with long context + caching. It's simpler, has fewer moving parts, no vector DB to run. Add RAG when:
- Corpus grows past 300k tokens.
- Per-query cost exceeds the RAG alternative.
- Quality degrades on synthesis tasks.

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| RAG on a 50k-token corpus | Long context + caching is cheaper and better |
| Long context on a 2M-token corpus | Cost + latency punishes you; use RAG |
| Trusting needle-in-haystack claims for synthesis tasks | Benchmark on your own tasks |
| Not enabling prompt caching when prefix repeats | 90% cost miss |
| Same context on every turn without cache | Break it into a stable system + variable suffix; cache the prefix |
| Ignoring long-context latency on first call | Warm the cache during app startup if possible |
| Long context + large chunking overhead | Remove chunking; pass whole docs |
| Hybrid with chunk-level RAG feeding long context | Retrieve at doc level; long context swallows the rest |
| Hardcoded 200k assumption | Model limits change; pull from SDK |
| Not measuring | Decide with your own eval set and cost dashboard |

## Production Checklist

- [ ] Corpus token count measured (not file size)
- [ ] Decision recorded in an ADR (RAG / long-context / hybrid)
- [ ] Prompt caching enabled on stable prefix (if long context)
- [ ] Eval suite covers synthesis + needle + reasoning tasks
- [ ] Cost per query dashboarded (input + output + cache write/read split)
- [ ] Latency P50/P95 dashboarded; TTFT especially
- [ ] Fallback path if long-context API limit hit (truncate + warn)
- [ ] Hybrid pattern in place if corpus > 300k tokens
- [ ] Doc-level (not chunk-level) retrieval if feeding long context
- [ ] Cache hit ratio monitored; investigate below 80%
- [ ] Periodic re-evaluation — model limits and prices shift quarterly
