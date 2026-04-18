---
name: ragatouille
description: |
  RAGatouille — a high-level wrapper around ColBERTv2 for late-interaction
  retrieval. Covers RAGPretrainedModel, index creation with PLAID, training
  custom ColBERT checkpoints with hard negatives, serving as a retriever,
  integration with LangChain/LlamaIndex.

  USE WHEN: user mentions "RAGatouille", "ColBERT", "ColBERTv2", "PLAID",
  "late interaction", "token-level retrieval", "RAGPretrainedModel"

  DO NOT USE FOR: dense single-vector retrieval - use `rag-architecture`;
  sparse BM25/SPLADE - use `hybrid-search`;
  reranking with cross-encoders - use `reranking`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# RAGatouille (ColBERT made easy)

ColBERT represents each document and query as a *set* of contextual token vectors and scores with late interaction (MaxSim). Recall is typically higher than single-vector dense retrieval for long documents and entity-heavy queries. RAGatouille is the pragmatic wrapper: one function to index, one to search, one to train.

## Installation

```bash
pip install ragatouille
# PyTorch with CUDA strongly recommended; CPU works but is ~20x slower at query time
```

## Load a Pretrained Model

```python
from ragatouille import RAGPretrainedModel

RAG = RAGPretrainedModel.from_pretrained("colbert-ir/colbertv2.0")
```

Other checkpoints worth trying: `jinaai/jina-colbert-v2` (multilingual, 8192-token context), `answerdotai/answerai-colbert-small-v1` (smaller + fast), `lightonai/GTE-ModernColBERT-v1` (2024, strong baseline).

## Index a Corpus

```python
docs = [
    "ColBERT uses contextualized late interaction over BERT.",
    "PLAID is the compression scheme used in ColBERTv2 for fast retrieval.",
    # ... thousands more
]
metadatas = [{"source": f"doc_{i}.md"} for i in range(len(docs))]

index_path = RAG.index(
    collection=docs,
    document_metadatas=metadatas,
    index_name="kb_v1",
    max_document_length=512,
    split_documents=True,          # auto-chunk with sliding window
    use_faiss=False,               # use PLAID (default) for production
    bsize=32,                      # encoder batch size
)
```

Indexing a million chunks takes ~1–4 hours on an A10; disk footprint is 10–20 % of raw text after PLAID compression (quantization + centroid assignment).

## Query

```python
results = RAG.search(
    query="How does ColBERT compress embeddings?",
    k=10,
    index_name="kb_v1",
)
for r in results:
    print(r["score"], r["content"][:120], r["document_metadata"])
```

Batch queries:

```python
batched = RAG.search(
    query=["What is PLAID?", "Explain late interaction"],
    k=5,
)
```

## Reload an Existing Index

```python
RAG = RAGPretrainedModel.from_index("/absolute/path/.ragatouille/colbert/indexes/kb_v1")
```

## Add / Delete Documents (Incremental)

```python
RAG.add_to_index(
    new_collection=["New document text"],
    new_document_metadatas=[{"source": "new.md"}],
    index_name="kb_v1",
)

RAG.delete_from_index(document_ids=["abc-123"], index_name="kb_v1")
```

Deletes rewrite centroid assignments; a full reoptimize is cheap under ~1M docs and should be scheduled weekly for hot indexes.

## Training a Custom ColBERT (Hard Negatives)

Training data format: `(query, positive_passage, negative_passage_1, ..., negative_passage_n)`.

```python
from ragatouille import RAGTrainer

trainer = RAGTrainer(
    model_name="my-colbert",
    pretrained_model_name="colbert-ir/colbertv2.0",
    language_code="en",
)

# Mine hard negatives automatically with a base retriever
trainer.prepare_training_data(
    raw_data=[
        ("How does auth rotate keys?", "Keys rotate nightly via KMS..."),
        ("What is the SLA?", "Our standard SLA is 99.95%..."),
    ],
    data_out_path="./train_data",
    all_documents=docs,                 # full corpus for negative mining
    num_new_negatives=10,
    mine_hard_negatives=True,
)

trainer.train(
    batch_size=32,
    nbits=4,
    maxsteps=10_000,
    use_ib_negatives=True,              # in-batch negatives
    learning_rate=3e-6,
    dim=128,
)
```

After training, the checkpoint lives in `./colbert/none/<date>/checkpoints/colbert/`. Load with `RAGPretrainedModel.from_pretrained(<path>)`.

## LangChain Integration

```python
from ragatouille.integrations import RAGatouilleLangChainRetriever
retriever = RAG.as_langchain_retriever(index_name="kb_v1", k=8)

from langchain_core.runnables import RunnablePassthrough
from langchain_anthropic import ChatAnthropic

chain = {"context": retriever, "question": RunnablePassthrough()} | prompt | ChatAnthropic(model="claude-sonnet-4-5")
```

## LlamaIndex Integration

```python
from ragatouille.integrations import RAGatouilleLlamaIndexRetriever
li_retriever = RAG.as_llama_index_retriever(index_name="kb_v1", similarity_top_k=8)

from llama_index.core.query_engine import RetrieverQueryEngine
engine = RetrieverQueryEngine.from_args(li_retriever)
```

## Reranking with ColBERT

Even without full indexing, ColBERT makes a strong reranker.

```python
candidates = ["passage 1 ...", "passage 2 ...", "passage 3 ..."]
reranked = RAG.rerank(
    query="How do we shard users?",
    documents=candidates,
    k=3,
)
```

Use as a second-stage on BM25/dense top-100 → ColBERT rerank → top-10.

## Serving in Production

FastAPI wrapper:

```python
from fastapi import FastAPI
from ragatouille import RAGPretrainedModel

app = FastAPI()
RAG = RAGPretrainedModel.from_index("/data/indexes/kb_v1")

@app.post("/search")
def search(q: str, k: int = 10):
    return RAG.search(query=q, k=k, index_name="kb_v1")
```

Deployment tips:
- **GPU**: A10 / L4 is the sweet spot; T4 works for <50 QPS.
- **CPU inference**: possible with `use_onnx=True` but p95 >300 ms per query.
- **Cold start**: index memory-mapping takes 5–20 s for large indexes — preload at startup.
- **Horizontal scaling**: indexes are read-only after build; replicate the index directory across pods.
- **Hybrid**: pair with BM25 (Opensearch) for rare terms; union + ColBERT rerank.

## Comparison vs Alternatives

| Approach | Recall | Latency | Storage | Training cost |
|---|---|---|---|---|
| BM25 | medium | very low | tiny | none |
| Dense (bge-large) | high | low | 4 KB / chunk | none |
| ColBERTv2 (PLAID) | very high | low-medium | 1–2 KB / chunk | none (pretrained) |
| Custom ColBERT | highest (in-domain) | low-medium | same | hours on 1 GPU |
| Cross-encoder rerank | highest | high | none | moderate |

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Using ColBERT on CPU with >10 QPS | Move to GPU (L4/A10) or fall back to BGE+rerank |
| Building a 10M-doc index without sharding | Shard by tenant or hash; PLAID memory grows ~linearly |
| Treating ColBERT as a drop-in encoder (single vector) | It stores token-level; you cannot "avg-pool" it |
| Retraining every ingest | Retraining is for domain shift, not fresh data |
| Ignoring `max_document_length` | Over-long chunks silently truncate — split first |
| Forgetting to L2-normalize queries when reranking | RAGatouille handles it internally; don't re-normalize |

## Production Checklist

- [ ] Pinned ColBERT checkpoint hash in config
- [ ] GPU node pool with memory-mapped index on NVMe
- [ ] Incremental `add_to_index` wired to ingestion pipeline
- [ ] Weekly full reoptimize job to clean up deletes
- [ ] Hybrid: BM25 + ColBERT union for rare-term queries
- [ ] Fallback path when GPU unavailable (BGE + cross-encoder rerank)
- [ ] Warm-up query at pod start to prime CUDA + mmap
- [ ] Eval vs dense baseline on domain-specific golden set
