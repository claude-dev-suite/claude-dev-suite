---
name: query-transformations
description: |
  Pre-retrieval query rewriting techniques. HyDE, multi-query, step-back, RAG-fusion
  with RRF, sub-query decomposition, query routing, and expansion. Full Python code
  per technique with LangChain and native Anthropic SDK.

  USE WHEN: user mentions "HyDE", "hypothetical document", "multi-query", "step-back
  prompting", "RAG-fusion", "query rewriting", "query decomposition", "query routing"

  DO NOT USE FOR: post-retrieval reranking - use `reranking`; sparse+dense fusion
  on retrieved docs - use `hybrid-search`; agent loops - use `agentic-rag`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Query Transformations

## When to Apply

| Technique | Recall Gain | Latency Cost | Best For |
|---|---|---|---|
| Multi-query | +10-20% | 1 LLM call | Ambiguous or short queries |
| HyDE | +5-15% | 1 LLM call | Specialized domains, terminology mismatch |
| Step-back | +5-10% | 1 LLM call | Detail-heavy questions |
| RAG-fusion | +15-25% | 1 LLM + N searches | General-purpose quality boost |
| Sub-query decomposition | +20-30% on multi-hop | 1 LLM + N retrievals | Multi-part questions |
| Query routing | Varies | 1 classifier call | Heterogeneous indexes |
| Expansion (synonyms) | +5% | Free-ish | Keyword-heavy domains |

## Multi-Query Generation

Generate paraphrases; union the retrieved docs.

```python
from langchain_anthropic import ChatAnthropic
from langchain.retrievers.multi_query import MultiQueryRetriever

llm = ChatAnthropic(model="claude-sonnet-4-5-20250929", temperature=0)
retriever = MultiQueryRetriever.from_llm(
    retriever=vectorstore.as_retriever(search_kwargs={"k": 5}),
    llm=llm,
    include_original=True,
)
docs = retriever.invoke("How do I configure SSO?")
```

Manual implementation:

```python
from anthropic import Anthropic
client = Anthropic()

def multi_query(q: str, n: int = 3) -> list[str]:
    prompt = f"""Generate {n} different paraphrases of this question for semantic search.
One per line. No numbering or explanation.

Question: {q}"""
    msg = client.messages.create(
        model="claude-sonnet-4-5-20250929", max_tokens=300,
        messages=[{"role": "user", "content": prompt}],
    )
    return [q] + [l.strip() for l in msg.content[0].text.splitlines() if l.strip()]
```

## HyDE (Hypothetical Document Embeddings)

Have the LLM hallucinate a candidate answer, then embed that answer for retrieval. Closes the query-document style gap.

```python
from langchain_openai import OpenAIEmbeddings
from langchain_qdrant import QdrantVectorStore
from anthropic import Anthropic

client = Anthropic()
embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

HYDE_PROMPT = """Write a passage that answers this question. The passage should be
written as if from a technical document. Do not mention that it is hypothetical.

Question: {q}
Passage:"""

def hyde_search(vstore: QdrantVectorStore, q: str, k: int = 5):
    msg = client.messages.create(
        model="claude-sonnet-4-5-20250929", max_tokens=400,
        messages=[{"role": "user", "content": HYDE_PROMPT.format(q=q)}],
    )
    hypothetical = msg.content[0].text
    vec = embeddings.embed_query(hypothetical)
    return vstore.similarity_search_by_vector(vec, k=k)
```

Works best when queries are terse ("SSO config?") and docs are verbose.

## Step-Back Prompting

Rewrite a specific question into a more general one, retrieve against both.

```python
STEP_BACK_PROMPT = """Given a specific question, write a more general, higher-level
question whose answer would help answer the specific one.

Specific: {q}
General:"""

def step_back(q: str) -> str:
    msg = client.messages.create(
        model="claude-sonnet-4-5-20250929", max_tokens=100,
        messages=[{"role": "user", "content": STEP_BACK_PROMPT.format(q=q)}],
    )
    return msg.content[0].text.strip()

def step_back_retrieve(retriever, q: str, k: int = 5):
    general = step_back(q)
    specific_docs = retriever.invoke(q)
    general_docs = retriever.invoke(general)
    seen, out = set(), []
    for d in specific_docs + general_docs:
        if d.page_content not in seen:
            out.append(d); seen.add(d.page_content)
    return out[:k]
```

Use when questions assume background knowledge the corpus discusses separately.

## RAG-Fusion (RRF over multi-query)

Multi-query retrieval with Reciprocal Rank Fusion instead of set union.

```python
from collections import defaultdict

def rrf(rank_lists: list[list[str]], k_constant: int = 60) -> list[tuple[str, float]]:
    scores = defaultdict(float)
    for ranks in rank_lists:
        for rank, doc_id in enumerate(ranks):
            scores[doc_id] += 1 / (k_constant + rank + 1)
    return sorted(scores.items(), key=lambda x: x[1], reverse=True)

def rag_fusion(retriever, query: str, n_queries: int = 4, top_k: int = 5):
    queries = multi_query(query, n=n_queries)
    rank_lists = []
    id_to_doc = {}
    for q in queries:
        docs = retriever.invoke(q)
        ids = []
        for d in docs:
            key = d.metadata.get("id") or hash(d.page_content)
            id_to_doc[key] = d
            ids.append(key)
        rank_lists.append(ids)
    fused = rrf(rank_lists)[:top_k]
    return [id_to_doc[doc_id] for doc_id, _ in fused]
```

RRF is scale-free — no score normalization needed. `k_constant=60` is the published default.

## Sub-Query Decomposition

Split multi-part questions into atomic retrieval sub-queries.

```python
import json

DECOMPOSE_PROMPT = """Break this question into atomic sub-questions that each require
a single fact retrieval. Return a JSON array of strings. If the question is already
atomic, return it as a single-element array.

Question: {q}"""

def decompose(q: str) -> list[str]:
    msg = client.messages.create(
        model="claude-sonnet-4-5-20250929", max_tokens=500,
        messages=[{"role": "user", "content": DECOMPOSE_PROMPT.format(q=q)}],
    )
    return json.loads(msg.content[0].text)

def sub_query_retrieve(retriever, q: str, k_each: int = 3):
    sub_qs = decompose(q)
    results = {}
    for sq in sub_qs:
        results[sq] = retriever.invoke(sq)[:k_each]
    return results  # dict of sub-question -> docs, for composed answers
```

Synthesis prompt then cites per sub-question. See `agentic-rag` for iterative variants.

## Query Routing

Classify intent and route to the right index, retriever, or tool.

```python
from pydantic import BaseModel, Field
from typing import Literal
from langchain_anthropic import ChatAnthropic

class Route(BaseModel):
    destination: Literal["docs", "code", "tickets", "web"] = Field(
        description="Which index to query."
    )
    reason: str = Field(description="Short justification.")

llm = ChatAnthropic(model="claude-haiku-4-5-20250929", temperature=0)
router = llm.with_structured_output(Route)

def route_and_retrieve(q: str, retrievers: dict):
    route = router.invoke(
        f"""Classify this query into one of: docs (product documentation),
code (source code), tickets (support history), web (current events / open web).
Query: {q}"""
    )
    return retrievers[route.destination].invoke(q), route
```

Log route decisions; router is the single biggest lever in heterogeneous corpora.

## Query Expansion (Synonyms / Acronyms)

```python
EXPAND_PROMPT = """List common synonyms, abbreviations, and alternate spellings for
key terms in this query, as a JSON object mapping original term -> list of variants.

Query: {q}"""

def expand_query(q: str) -> str:
    msg = client.messages.create(
        model="claude-haiku-4-5-20250929", max_tokens=300,
        messages=[{"role": "user", "content": EXPAND_PROMPT.format(q=q)}],
    )
    variants = json.loads(msg.content[0].text)
    terms = [q]
    for _, vs in variants.items():
        terms.extend(vs)
    return " OR ".join(terms)  # BM25-friendly
```

Feeds `hybrid-search` BM25 side. Do not expand the dense side; it hurts.

## Combining Transforms (Production Pattern)

```python
def advanced_query(retriever, q: str, top_k: int = 5):
    # 1. Route
    docs_target, route = route_and_retrieve(q, retrievers)
    # 2. Decompose if compound
    sub_qs = decompose(q) if is_compound(q) else [q]
    # 3. For each sub-query, do RAG-fusion
    per_sub = [rag_fusion(retriever, sq, n_queries=3, top_k=top_k) for sq in sub_qs]
    # 4. Merge
    seen, out = set(), []
    for docs in per_sub:
        for d in docs:
            key = d.metadata.get("id") or hash(d.page_content)
            if key not in seen:
                seen.add(key); out.append(d)
    return out[:top_k]
```

Route first, decompose second, expand/fuse third. Adding all three without measurement buries latency.

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Always applying HyDE | Skip for well-formed questions; costs a round trip |
| Multi-query with high temperature | Keep temperature 0 for deterministic paraphrases |
| Decomposing every query | Use a cheap classifier to detect compound queries |
| Union instead of RRF | Use RRF — set union loses rank signal |
| Expanding dense vectors with synonyms | Concatenating synonyms hurts dense; apply to BM25 only |
| Routing without fallback | If classifier fails or confidence low, search all indexes |
| Running 6 transforms serially | Parallelize; abort on first timeout |
| No cache on rewrites | Cache rewrites keyed by query hash |

## Production Checklist

- [ ] Query classifier decides which transforms apply
- [ ] Rewrites cached by hash (hot queries skip LLM)
- [ ] Rewrite LLM is the small/cheap model (Haiku, GPT-4o-mini)
- [ ] Temperature 0 on rewrite calls
- [ ] RRF implementation tested against a gold set
- [ ] Timeouts per stage; fallback to naive retrieval
- [ ] Structured logging: original query, rewrites, chosen route, retrieved IDs
- [ ] A/B test framework compares rewrite vs. no rewrite
- [ ] Token budget per query tracked and alarmed
- [ ] Failed-decomposition fallback: treat as single query
