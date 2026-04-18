---
name: colbert-retrieval
description: |
  ColBERT / ColBERTv2 late interaction as a first-stage retriever — not just a reranker.
  MaxSim scoring, PLAID index, Ragatouille for deployment, storage cost of token-level
  embeddings, when to pick ColBERT over dense-plus-rerank, and fine-tuning for domain.

  USE WHEN: user mentions "ColBERT", "ColBERTv2", "late interaction", "MaxSim", "PLAID",
  "Ragatouille", "token-level embeddings", "multi-vector retrieval"

  DO NOT USE FOR: single-vector dense retrieval - use `vector-stores/qdrant-advanced`
  or similar; cross-encoder reranking - use `rag/reranking`; SPLADE sparse - use
  `retrieval/splade-deep`; cross-encoder fine-tuning - use `retrieval/cross-encoder-training`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# ColBERT Retrieval

## Late Interaction in One Picture

Bi-encoders compress a document into one vector. Cross-encoders score each (query, doc) pair from scratch. ColBERT sits in between: it stores one vector per token, and scores at query time with MaxSim.

```
score(q, d) = sum over q_tokens i  of   max over d_tokens j  of   q_i dot d_j
```

Each query token finds its best-matching document token. You keep bi-encoder speed at indexing time and cross-encoder-like quality at query time.

## When ColBERT Wins

| Scenario | Dense + rerank | ColBERT |
|---|---|---|
| Out-of-domain corpus (legal, medical, code) | Often needs rerank to recover recall | Strong out-of-box |
| Long documents (> 512 tokens) | Single vector loses detail | Token-level keeps detail |
| Low-latency single-stage retrieval | Needs two stages | One stage suffices |
| Huge corpus (> 50M docs) on commodity disk | Cheap | Storage becomes the bottleneck |
| Multilingual with one model | Works with multilingual encoders | Only if you use a multilingual base |

Pick ColBERT when document-level single vectors lose too much, and you cannot afford a reranker pass on every query.

## Storage Cost

A typical 1024-d dense vector is ~4 KB. ColBERTv2 stores ~128-d vectors per token, compressed via PLAID residual codecs. In practice:

| Index | Bytes/token | Bytes per 500-token doc |
|---|---|---|
| Single dense 1024-d | n/a | 4 KB |
| ColBERTv2 uncompressed 128-d fp16 | 256 | ~128 KB |
| ColBERTv2 PLAID 2-bit residual | ~36 | ~18 KB |

PLAID 2-bit brings ColBERT to ~4x single-vector index size — tolerable for many deployments.

## Ragatouille: Easiest Deployment

Ragatouille wraps ColBERTv2 with a sane high-level API. It uses PLAID under the hood.

```python
# pip install ragatouille
from ragatouille import RAGPretrainedModel

rag = RAGPretrainedModel.from_pretrained("colbert-ir/colbertv2.0")

documents = [
    "OAuth 2.0 uses refresh tokens to get a new access token without re-prompting the user.",
    "PKCE protects the authorization code flow for public clients.",
    "OpenID Connect adds an id_token on top of OAuth 2.0.",
]

rag.index(
    collection=documents,
    document_ids=[f"doc-{i}" for i in range(len(documents))],
    document_metadatas=[{"source": "auth-docs"} for _ in documents],
    index_name="auth-kb",
    max_document_length=256,
    split_documents=True,
)

results = rag.search(query="how do I refresh a token without asking the user again", k=5)
for r in results:
    print(r["score"], r["content"][:80], r["document_id"])
```

`split_documents=True` respects `max_document_length`. For long docs, ColBERT quality stays high because every chunk retains its token vectors.

## Index Rebuild / Add New Documents

```python
rag = RAGPretrainedModel.from_index(".ragatouille/colbert/indexes/auth-kb")

rag.add_to_index(
    new_collection=["Device Code Flow is for input-constrained devices."],
    new_document_ids=["doc-3"],
    new_document_metadatas=[{"source": "auth-docs"}],
)
```

PLAID indexes are compact but rebuilding is cheaper than you might fear — benchmark before optimizing incremental updates.

## Using ColBERT as a Reranker Over Any Retriever

```python
candidates = hybrid_retriever.invoke("token refresh 403")
passages = [d.page_content for d in candidates]

reranked = rag.rerank(query="token refresh 403", documents=passages, k=5)
top = [candidates[r["result_index"]] for r in reranked]
```

Use this when you already have a strong first-stage retriever and want a fast self-hosted reranker that competes with Cohere Rerank without a network hop.

## Native ColBERT in Qdrant (multi-vector)

If you already run Qdrant, skip Ragatouille's index and store ColBERT vectors as a multi-vector field.

```python
from qdrant_client import QdrantClient, models

client = QdrantClient(url="http://localhost:6333", prefer_grpc=True)
client.create_collection(
    "colbert-docs",
    vectors_config={
        "colbert": models.VectorParams(
            size=128,
            distance=models.Distance.COSINE,
            multivector_config=models.MultiVectorConfig(
                comparator=models.MultiVectorComparator.MAX_SIM,
            ),
        ),
    },
)

# doc_token_vectors: (num_tokens, 128) numpy array
client.upsert(
    "colbert-docs",
    points=[
        models.PointStruct(
            id=1,
            vector={"colbert": doc_token_vectors.tolist()},
            payload={"source": "auth-docs"},
        ),
    ],
)

client.query_points(
    "colbert-docs",
    query=query_token_vectors.tolist(),   # (q_tokens, 128)
    using="colbert",
    limit=10,
)
```

Qdrant evaluates MaxSim server-side. See `vector-stores/qdrant-advanced` for tuning.

## Two-Stage Dense -> ColBERT (Rescoring)

```python
# Cheap dense ANN shortlists 200, ColBERT rescores to 10
client.query_points(
    "hybrid-kb",
    prefetch=models.Prefetch(query=dense_q.tolist(), using="dense", limit=200),
    query=query_token_vectors.tolist(),
    using="colbert",
    limit=10,
)
```

## Fine-Tuning ColBERT on Your Data

ColBERTv2 usually needs little fine-tuning — the pretrained model is strong. Fine-tune when:

- Your terminology is far from Wikipedia/Common Crawl.
- You have > 5k query-passage relevance triples.
- A labeled gold set shows recall@10 plateauing.

```python
from ragatouille import RAGTrainer

trainer = RAGTrainer(
    model_name="colbert-domain",
    pretrained_model_name="colbert-ir/colbertv2.0",
    language_code="en",
)

# triples: (query, positive_doc, negative_doc)
trainer.prepare_training_data(
    raw_data=triples,
    data_out_path="./colbert-training-data",
    all_documents=all_docs,      # to mine hard negatives
    num_new_negatives=10,
    mine_hard_negatives=True,
)

trainer.train(
    batch_size=32,
    nbits=4,
    maxsteps=10_000,
    learning_rate=1e-5,
    use_ib_negatives=True,
)
```

Evaluate with NDCG@10 on a held-out slice. Ship the new checkpoint by pointing Ragatouille at the saved directory.

## Serving at Scale

- Keep GPU warm for query encoding (encoding is the only hot path).
- Cache query token embeddings for repeated queries (hash-based LRU).
- Shard by document ID across multiple ColBERT processes; gather-merge at the router.
- Monitor index size against disk growth — PLAID stays compact but not free.

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Treating ColBERT like a bi-encoder (one vector per doc) | Keep all token vectors; that is the whole point |
| Shipping uncompressed fp16 ColBERT index | Use PLAID 2-bit (Ragatouille default) |
| Running ColBERT query encoding on CPU in prod | Pin a small GPU pool; encoding dominates latency |
| Using ColBERT on < 10k docs | A dense-plus-rerank pipeline is simpler and cheaper |
| Re-encoding the whole corpus to add one doc | Use `add_to_index` or rebuild off-peak |
| max_document_length set to 8192 | ColBERTv2 base is 512; split long docs |
| Ignoring tokenizer mismatch between query and doc encoders | Use the same checkpoint for both |

## Production Checklist

- [ ] Index built with PLAID compression (nbits <= 4)
- [ ] `max_document_length` matches the base model's context
- [ ] Query encoder pinned on GPU with warm pool
- [ ] Monitoring: p95 query latency, index size on disk
- [ ] Incremental add-to-index path tested on the largest collection
- [ ] Evaluation harness logs NDCG@10 and recall@10 weekly
- [ ] Disaster recovery: index snapshot stored off-host
- [ ] Fallback to dense-plus-rerank if ColBERT service is unhealthy
- [ ] Hard-negative mining documented if you fine-tune
