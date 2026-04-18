---
name: rag-caching
description: |
  Caching strategies across the RAG stack. Semantic caching with GPTCache and
  LangChain, Redis-based embedding-similarity cache, cache key design,
  TTL/invalidation, partial caching (cache retrieval only), provider-native
  prompt caching (Anthropic, OpenAI), and hierarchical L1/L2 caches.

  USE WHEN: user mentions "semantic cache", "GPTCache", "LLM cache",
  "prompt caching", "Redis vector cache", "cache invalidation for RAG",
  "reduce LLM cost", "latency reduction LLM"

  DO NOT USE FOR: retrieval accuracy - use `rag-patterns`;
  groundedness checks - use `rag-guardrails`;
  incremental indexing - use `rag-production`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# RAG Caching

## What to Cache Where

| Layer | Key | Value | TTL |
|---|---|---|---|
| Embedding cache | `sha256(text) + model` | vector | infinite (deterministic) |
| Retrieval cache | `sha256(query) + filters + k` | list[chunk_id] | minutes to hours |
| Semantic query cache | normalized query embedding | final answer | minutes |
| Rerank cache | `hash(query, candidate_ids)` | reordered ids | short |
| Prompt cache (provider) | prefix tokens | decoder KV | provider-managed |
| Web/upstream cache | URL | bytes | per Cache-Control |

Rule: cache **deterministic steps with stable inputs** (embedding, exact retrieval) eagerly; cache **probabilistic outputs** (generation) only with semantic matching and a short TTL.

## Hierarchical L1/L2 Cache

```
L1 exact hash  (Redis GET on sha256(prompt))  -> ~1ms
L2 semantic    (vector similarity in Redis)    -> ~10ms
L3 origin LLM                                  -> 500-3000ms
```

```python
import hashlib, json, redis
from openai import OpenAI

r = redis.Redis()
oai = OpenAI()

def l1_get(prompt: str):
    return r.get(f"l1:{hashlib.sha256(prompt.encode()).hexdigest()}")

def l1_set(prompt: str, answer: str, ttl: int = 3600):
    r.setex(f"l1:{hashlib.sha256(prompt.encode()).hexdigest()}", ttl, answer)

def serve(prompt: str, semantic_lookup, origin_call):
    if hit := l1_get(prompt):
        return hit.decode(), "L1"
    if hit := semantic_lookup(prompt):   # defined below
        l1_set(prompt, hit)
        return hit, "L2"
    answer = origin_call(prompt)
    l1_set(prompt, answer)
    semantic_index(prompt, answer)
    return answer, "ORIGIN"
```

## Redis-Based Semantic Cache

Requires Redis 7.2+ with the RediSearch module (Redis Stack).

```python
import redis, numpy as np
from redis.commands.search.field import TextField, VectorField
from redis.commands.search.indexDefinition import IndexDefinition, IndexType
from redis.commands.search.query import Query

r = redis.Redis(decode_responses=False)
DIM = 1536

try:
    r.ft("semcache").create_index(
        fields=[
            TextField("prompt"),
            TextField("answer"),
            VectorField("vec", "HNSW",
                {"TYPE": "FLOAT32", "DIM": DIM, "DISTANCE_METRIC": "COSINE"}),
        ],
        definition=IndexDefinition(prefix=["semcache:"], index_type=IndexType.HASH),
    )
except redis.ResponseError:
    pass  # already exists

def embed(text: str) -> np.ndarray:
    v = oai.embeddings.create(model="text-embedding-3-small", input=text).data[0].embedding
    return np.array(v, dtype=np.float32)

def semantic_get(prompt: str, threshold: float = 0.92):
    v = embed(prompt).tobytes()
    q = (Query("*=>[KNN 1 @vec $vec AS score]")
         .sort_by("score").return_fields("answer", "score").dialect(2))
    res = r.ft("semcache").search(q, query_params={"vec": v})
    if res.docs and (1 - float(res.docs[0].score)) >= threshold:
        return res.docs[0].answer.decode() if isinstance(res.docs[0].answer, bytes) \
               else res.docs[0].answer
    return None

def semantic_put(prompt: str, answer: str, ttl: int = 900):
    key = f"semcache:{hashlib.sha256(prompt.encode()).hexdigest()}"
    r.hset(key, mapping={"prompt": prompt, "answer": answer,
                          "vec": embed(prompt).tobytes()})
    r.expire(key, ttl)
```

Tune `threshold`: 0.95+ for factual QA, 0.88-0.92 for chat; log false-positive rate and adjust.

## GPTCache

```python
# pip install gptcache
from gptcache import cache
from gptcache.adapter import openai as gpt_openai
from gptcache.embedding import OpenAI as OpenAIEmbed
from gptcache.manager import CacheBase, VectorBase, get_data_manager
from gptcache.similarity_evaluation.distance import SearchDistanceEvaluation

embedding = OpenAIEmbed()
data_manager = get_data_manager(
    CacheBase("sqlite"),
    VectorBase("faiss", dimension=embedding.dimension),
)
cache.init(
    embedding_func=embedding.to_embeddings,
    data_manager=data_manager,
    similarity_evaluation=SearchDistanceEvaluation(),
)
cache.set_openai_key()

# Drop-in replacement for openai.ChatCompletion
resp = gpt_openai.ChatCompletion.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": user_q}],
    cache_obj=cache,
)
```

## LangChain Cache

```python
from langchain.globals import set_llm_cache
from langchain_community.cache import RedisSemanticCache
from langchain_openai import OpenAIEmbeddings

set_llm_cache(RedisSemanticCache(
    redis_url="redis://localhost:6379",
    embedding=OpenAIEmbeddings(model="text-embedding-3-small"),
    score_threshold=0.1,  # distance (1 - cosine_sim)
))
# All LangChain LLM calls now check cache transparently
```

## Partial Caching (Cache Retrieval, Not Generation)

For chat apps where answers are personalized but the knowledge base is shared, cache retrieval so every user pays only once for the embedding + vector search.

```python
def retrieve_cached(query: str, filters: dict, k: int = 8):
    key = "rtr:" + hashlib.sha256(
        json.dumps({"q": query, "f": filters, "k": k}, sort_keys=True).encode()
    ).hexdigest()
    if cached := r.get(key):
        ids = json.loads(cached)
        return load_chunks_by_id(ids)
    hits = vectorstore.similarity_search_with_score(query, k=k, filter=filters)
    r.setex(key, 600, json.dumps([h[0].metadata["id"] for h in hits]))
    return [h[0] for h in hits]
```

## Anthropic Prompt Caching

Claude supports ephemeral cache breakpoints on **system** prompts, **tools**, and any message content block. Cached prefix reads cost ~10% of base input tokens. Minimum prefix: ~1024 tokens (Sonnet/Opus) or ~2048 (Haiku). Default TTL 5 minutes; `ttl: "1h"` available.

```python
import anthropic
claude = anthropic.Anthropic()

resp = claude.messages.create(
    model="claude-opus-4-5",
    max_tokens=1024,
    system=[
        {"type": "text", "text": "You are a support assistant. Follow policy."},
        {
            "type": "text",
            "text": LARGE_POLICY_DOCUMENT,  # 10k+ tokens, reused across requests
            "cache_control": {"type": "ephemeral", "ttl": "1h"},
        },
    ],
    messages=[
        {
            "role": "user",
            "content": [
                {"type": "text", "text": RETRIEVED_CONTEXT,
                 "cache_control": {"type": "ephemeral"}},  # per-conversation cache
                {"type": "text", "text": user_question},
            ],
        }
    ],
)

# Inspect hits vs misses
print(resp.usage.cache_read_input_tokens, resp.usage.cache_creation_input_tokens)
```

Ordering matters: put the **most stable** content first (system instructions), then slower-changing (retrieved context), then the volatile user turn. You can stack up to 4 breakpoints.

## OpenAI Prompt Caching

Automatic for prompts >= 1024 tokens on supported models (`gpt-4o`, `gpt-4o-mini`, `o1`, `o3`, `gpt-4.1`). No explicit breakpoints; cache key is the **exact prefix**. Keep static content (system, tools, few-shots) at the front, user input last.

```python
# Inspect cached_tokens in usage
r = oai.chat.completions.create(model="gpt-4o-mini", messages=[...])
print(r.usage.prompt_tokens_details.cached_tokens)
```

## Cache Invalidation

Two strategies; pick one explicitly.

```python
# Strategy A: version prefix — bump on any index change, old keys expire naturally
INDEX_VERSION = "v42"
def key(q): return f"semcache:{INDEX_VERSION}:{sha(q)}"

# Strategy B: tag-based invalidation on doc updates
# When doc_id X changes, delete all cache entries whose retrieval included X
def invalidate_doc(doc_id: str):
    for key in r.sscan_iter(f"cache_by_doc:{doc_id}"):
        r.delete(key)
    r.delete(f"cache_by_doc:{doc_id}")
```

Tag-based is more precise but requires tracking which cache entries depend on which doc.

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Caching raw user prompts containing PII | Hash, don't log plaintext; redact before embedding |
| Single global TTL | Tier TTLs: embeddings forever, retrieval minutes, generation short |
| Semantic cache with threshold too low | Measure false-positive rate; start at 0.95 and lower cautiously |
| Ignoring prompt cache ordering (LLM providers) | Static prefix first, volatile last |
| No cache hit/miss metrics | Emit `cache_layer` label on every request |
| Caching personalized answers globally | Namespace by `user_id` or skip generation cache |
| Never invalidating | Version prefix or tag-based invalidation on doc updates |

## Production Checklist

- [ ] L1 exact-match cache (Redis hash) enabled
- [ ] L2 semantic cache with tuned threshold and per-query-type metrics
- [ ] Embedding cache keyed by `sha256 + model`
- [ ] Retrieval cache keyed by `query + filter + k`
- [ ] Provider prompt caching configured (static-first ordering)
- [ ] Invalidation strategy chosen (version prefix OR tag-based)
- [ ] Hit/miss/layer metrics dashboarded
- [ ] PII redaction before caching user inputs
- [ ] Cache size budget + eviction policy (LRU/LFU) set
