---
name: embedding-models
description: |
  Embedding model selection across providers (OpenAI, Voyage, Cohere, BGE, E5,
  Jina, Nomic, mixedbread). Covers MTEB benchmarks, dimensions, cost, latency,
  multilingual support, instruction-tuning, and query-vs-document modes.

  USE WHEN: user mentions "which embedding model", "text-embedding-3", "voyage-3",
  "cohere embed", "BGE", "E5", "nomic-embed", "mxbai", "MTEB", "embedding benchmark",
  "embedding dimensions", "embedding cost"

  DO NOT USE FOR: multilingual-specific tradeoffs - use `multilingual-embeddings`;
  fine-tuning models - use `embedding-fine-tuning`; MRL truncation - use
  `matryoshka-embeddings`; vector database choice - use `vector-stores/*`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Embedding Models

## Decision Framework

```
Is text English-only and budget sensitive?
  YES → text-embedding-3-small (1536) or nomic-embed-text-v1.5
  NO  → ↓

Multilingual required?
  YES → BGE-M3, multilingual-e5-large, or cohere embed-multilingual-v3
  NO  → ↓

Retrieval quality top priority (leaderboard chasing)?
  YES → voyage-3-large, cohere embed-v3, or BGE-reranker + BGE-base
  NO  → text-embedding-3-large (3072, truncatable via MRL)

Self-hosting required (data residency)?
  YES → BGE-M3, E5-large-v2, nomic-embed-text-v1.5, mxbai-embed-large-v1
```

## Model Catalog (2025)

| Model | Provider | Dims | Max Tokens | $ / 1M tokens | MTEB Avg | Notes |
|---|---|---|---|---|---|---|
| text-embedding-3-small | OpenAI | 1536 (MRL) | 8191 | $0.02 | 62.3 | Default cheap choice |
| text-embedding-3-large | OpenAI | 3072 (MRL) | 8191 | $0.13 | 64.6 | MRL-truncatable |
| voyage-3 | Voyage AI | 1024 | 32000 | $0.06 | 67.0+ | Long context |
| voyage-3-large | Voyage AI | 2048 | 32000 | $0.18 | 68.0+ | Top retrieval |
| voyage-code-3 | Voyage AI | 1024 | 32000 | $0.18 | — | Code-specialized |
| embed-english-v3.0 | Cohere | 1024 | 512 | $0.10 | 64.5 | Query/doc modes |
| embed-multilingual-v3.0 | Cohere | 1024 | 512 | $0.10 | — | 100+ languages |
| BGE-M3 | BAAI (OSS) | 1024 | 8192 | self-host | 66.0 | Dense+sparse+colbert |
| bge-large-en-v1.5 | BAAI (OSS) | 1024 | 512 | self-host | 64.2 | English baseline |
| e5-mistral-7b-instruct | intfloat (OSS) | 4096 | 32768 | self-host | 66.6 | Instruction-tuned |
| multilingual-e5-large | intfloat (OSS) | 1024 | 512 | self-host | — | 94 languages |
| jina-embeddings-v3 | Jina AI | 1024 (MRL) | 8192 | $0.05 | 65.5 | Task-specific LoRA |
| nomic-embed-text-v1.5 | Nomic (OSS) | 768 (MRL) | 8192 | self-host | 62.4 | Open weights |
| mxbai-embed-large-v1 | mixedbread (OSS) | 1024 | 512 | self-host | 64.7 | Strong OSS |

MTEB numbers drift — verify at https://huggingface.co/spaces/mteb/leaderboard before committing to a model.

## OpenAI

```python
from openai import OpenAI

client = OpenAI()

def embed_openai(texts: list[str], model: str = "text-embedding-3-small",
                 dimensions: int | None = None) -> list[list[float]]:
    kwargs = {"model": model, "input": texts}
    if dimensions is not None:  # MRL truncation, only for -3 family
        kwargs["dimensions"] = dimensions
    resp = client.embeddings.create(**kwargs)
    return [d.embedding for d in resp.data]

# Cheap path: 3-small at default 1536
doc_vecs = embed_openai(docs)

# Storage-optimised: 3-large truncated to 512
compact = embed_openai(docs, model="text-embedding-3-large", dimensions=512)
```

## Voyage AI

```python
import voyageai

vo = voyageai.Client()

# Note the input_type — Voyage optimises query vs document embeddings separately
doc_vecs = vo.embed(docs, model="voyage-3", input_type="document").embeddings
qry_vec  = vo.embed([query], model="voyage-3", input_type="query").embeddings[0]

# Code embeddings
code_vecs = vo.embed(snippets, model="voyage-code-3", input_type="document").embeddings
```

## Cohere

```python
import cohere

co = cohere.ClientV2()

doc_resp = co.embed(
    texts=docs,
    model="embed-english-v3.0",
    input_type="search_document",
    embedding_types=["float"],
)
qry_resp = co.embed(
    texts=[query],
    model="embed-english-v3.0",
    input_type="search_query",
    embedding_types=["float"],
)
doc_vecs = doc_resp.embeddings.float
qry_vec  = qry_resp.embeddings.float[0]

# Binary embeddings for 32x storage reduction (see vector-quantization skill)
bin_resp = co.embed(
    texts=docs, model="embed-english-v3.0",
    input_type="search_document", embedding_types=["binary"],
)
```

## BGE-M3 (self-hosted, OSS)

```python
from FlagEmbedding import BGEM3FlagModel

model = BGEM3FlagModel("BAAI/bge-m3", use_fp16=True)

out = model.encode(
    docs,
    batch_size=12,
    max_length=8192,
    return_dense=True,
    return_sparse=True,       # lexical weights
    return_colbert_vecs=True, # multi-vector
)
dense   = out["dense_vecs"]         # (N, 1024)
sparse  = out["lexical_weights"]    # token-id -> weight
colbert = out["colbert_vecs"]       # per-token contextual vectors
```

## E5 family (instruction-tuned)

E5 models require task prefixes — forget them and quality drops hard.

```python
from sentence_transformers import SentenceTransformer

model = SentenceTransformer("intfloat/multilingual-e5-large")

# E5 REQUIRES these prefixes
doc_vecs = model.encode([f"passage: {d}" for d in docs], normalize_embeddings=True)
qry_vec  = model.encode([f"query: {query}"], normalize_embeddings=True)[0]
```

## Jina v3 (task-specific LoRA)

```python
from transformers import AutoModel

model = AutoModel.from_pretrained("jinaai/jina-embeddings-v3", trust_remote_code=True)

doc_vecs = model.encode(docs, task="retrieval.passage")
qry_vec  = model.encode([query], task="retrieval.query")[0]
# Other tasks: separation, classification, text-matching
```

## Nomic (open weights, fully reproducible)

```python
from sentence_transformers import SentenceTransformer

model = SentenceTransformer("nomic-ai/nomic-embed-text-v1.5", trust_remote_code=True)
doc_vecs = model.encode([f"search_document: {d}" for d in docs])
qry_vec  = model.encode([f"search_query: {query}"])[0]
```

## mixedbread mxbai

```python
from sentence_transformers import SentenceTransformer

model = SentenceTransformer("mixedbread-ai/mxbai-embed-large-v1")
doc_vecs = model.encode(docs, normalize_embeddings=True)
# Query prompt recommended
qry_vec = model.encode(
    [query],
    prompt="Represent this sentence for searching relevant passages: ",
    normalize_embeddings=True,
)[0]
```

## Query vs Document Modes

Asymmetric models (Cohere, Voyage, E5, Nomic, BGE-M3 with prompts) encode
queries and documents differently. Using the wrong mode costs 5-15% recall.

| Model | Query prefix / param | Document prefix / param |
|---|---|---|
| OpenAI 3-* | none | none |
| Voyage | `input_type="query"` | `input_type="document"` |
| Cohere v3 | `input_type="search_query"` | `input_type="search_document"` |
| E5 | `"query: "` | `"passage: "` |
| Nomic | `"search_query: "` | `"search_document: "` |
| BGE-M3 | none (symmetric) | none |

## Cost Modelling

```python
def monthly_cost(docs: int, avg_tokens: int, qps: int,
                 doc_rate_per_1m: float, qry_rate_per_1m: float) -> float:
    doc_tokens_once = docs * avg_tokens                     # one-time index
    qry_tokens_monthly = qps * 60 * 60 * 24 * 30 * 20       # ~20 tok/query
    return (doc_tokens_once * doc_rate_per_1m
            + qry_tokens_monthly * qry_rate_per_1m) / 1_000_000

# 1M docs x 500 tokens, 10 QPS on OpenAI 3-small ($0.02/1M)
print(monthly_cost(1_000_000, 500, 10, 0.02, 0.02))  # ~$10.4
```

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Picking a model by name recognition instead of MTEB retrieval subtasks | Filter MTEB by your task category (Retrieval/STS/Classification) |
| Ignoring query/document asymmetry | Use provider-specific input_type / prefixes |
| Locking in a 3072-dim model with no MRL plan | Prefer MRL-capable models (OpenAI 3-*, Jina v3, Nomic) |
| Mixing models between index and query | Same model + same version for both; re-index on change |
| Benchmarking once and never re-testing | Keep a private eval set; re-run when swapping models |
| Using 512-token model on 2k-token chunks | Check `max_tokens` before chunking; truncation silently hurts |
| Assuming "larger dims = better" | 3-small (1536) often beats 3-large truncated to 256; measure |

## Production Checklist

- [ ] Model + version pinned in config and stored in vector DB metadata
- [ ] Query/document mode set correctly for asymmetric models
- [ ] Max token budget matches chunk size
- [ ] Private eval set scored before swapping models
- [ ] Cost model calculated for index + query volume
- [ ] Rate limits and batch sizes tuned (100-2048 per call)
- [ ] Re-index plan documented for model upgrades
- [ ] Fallback to secondary provider on API outage
