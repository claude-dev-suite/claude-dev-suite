---
name: cross-encoder-training
description: |
  Fine-tuning cross-encoders for domain-specific reranking. Training data (query-doc
  relevance labels, MS MARCO format), sentence-transformers CrossEncoder API, loss
  functions (BCE, margin), hard negative mining from BM25 and dense retrievers,
  distillation from strong teacher rerankers (BGE-reranker-v2, Cohere) into small models,
  NDCG@10 evaluation.

  USE WHEN: user mentions "fine-tune cross-encoder", "train reranker", "hard negative
  mining", "MS MARCO triples", "knowledge distillation reranker", "CrossEncoder",
  "cross-encoder training"

  DO NOT USE FOR: zero-shot reranking with existing APIs - use `rag/reranking`; LLM
  reranker - use `retrieval/rank-gpt`; ColBERT training - use `retrieval/colbert-retrieval`;
  SPLADE training - use `retrieval/splade-deep`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Cross-Encoder Training

## When to Fine-Tune

Off-the-shelf rerankers (Cohere Rerank v3.5, BGE-reranker-v2-m3, Voyage rerank-2) are strong. Fine-tune when:

- Labeled gold set shows NDCG@10 plateauing around the vendor baseline.
- Your domain vocabulary drifts from web text (legal contracts, clinical notes, code).
- You must self-host a small, fast reranker (100-300 MB) for edge deployment.
- You need to distill a proprietary vendor model into something you own.

Skip fine-tuning if you have fewer than 2k labeled triples. Spend effort on better retrieval instead.

## Training Data Shapes

### Pointwise

`(query, doc, label)` where label in {0, 1} or a graded relevance score.

### Pairwise

`(query, positive_doc, negative_doc)` — the model learns to score positive above negative.

### Listwise (groups)

`(query, [d1, d2, ..., dn], [relevance1, ..., relevance_n])`.

MS MARCO uses pairwise triples; most open cross-encoders start from MS MARCO plus domain data.

## Minimal CrossEncoder Training (pointwise)

```python
# pip install sentence-transformers==3.* torch
from sentence_transformers import CrossEncoder, InputExample
from sentence_transformers.cross_encoder.losses import BinaryCrossEntropyLoss
from torch.utils.data import DataLoader

train_examples = [
    InputExample(texts=[q, pos], label=1.0) for q, pos in positives
] + [
    InputExample(texts=[q, neg], label=0.0) for q, neg in negatives
]

model = CrossEncoder(
    "cross-encoder/ms-marco-MiniLM-L-6-v2",
    num_labels=1,
    max_length=512,
)

train_loader = DataLoader(train_examples, shuffle=True, batch_size=32)
model.fit(
    train_dataloader=train_loader,
    epochs=2,
    warmup_steps=500,
    output_path="./models/cross-encoder-domain",
    optimizer_params={"lr": 2e-5},
    use_amp=True,
)
```

MiniLM-L-6 is a 22 M-param backbone — fast at serving (~1-5 ms per pair on T4). For higher quality, start from `cross-encoder/ms-marco-MiniLM-L-12-v2` or `BAAI/bge-reranker-v2-m3`.

## Pairwise MarginRankingLoss

```python
from sentence_transformers.cross_encoder.losses import MarginMSELoss

# triples: (query, positive, negative) with teacher scores
triples = [
    InputExample(texts=[q, p, n], label=float(teacher_pos - teacher_neg))
    for q, p, n, teacher_pos, teacher_neg in data
]

model = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2", num_labels=1)
loss = MarginMSELoss(model)

loader = DataLoader(triples, batch_size=24, shuffle=True)
model.fit(train_dataloader=loader, loss_fct=loss, epochs=3, warmup_steps=1000)
```

MarginMSE works well for distillation: the student matches the teacher's score *differences*, not absolute values, which is robust across teacher model scales.

## Hard Negative Mining

Random negatives are too easy. Mine hard negatives from retrievers that make mistakes.

```python
# pip install rank_bm25 sentence-transformers
from rank_bm25 import BM25Okapi
from sentence_transformers import SentenceTransformer
import numpy as np

bm25 = BM25Okapi([d.lower().split() for d in all_docs])
dense = SentenceTransformer("BAAI/bge-base-en-v1.5")
doc_vecs = dense.encode(all_docs, batch_size=64, convert_to_numpy=True, normalize_embeddings=True)

def mine_hard_negs(query: str, positive_ids: set[int], k: int = 30, per_q: int = 5):
    bm_scores = bm25.get_scores(query.lower().split())
    bm_top = np.argsort(bm_scores)[::-1][:k]
    qv = dense.encode([query], normalize_embeddings=True)[0]
    dn_top = np.argsort(doc_vecs @ qv)[::-1][:k]
    candidates = [i for i in list(bm_top) + list(dn_top) if i not in positive_ids]
    # keep unique, take the first per_q
    seen, out = set(), []
    for i in candidates:
        if i not in seen:
            seen.add(i); out.append(int(i))
        if len(out) == per_q:
            break
    return out
```

Typical recipe: 1 positive + 4-7 hard negatives per query. Mix in a few random negatives (10-20%) to prevent collapse.

### False Negatives Are the Real Danger

Retrieved "negatives" may actually be relevant — just unlabeled. Filter with a strong teacher reranker before training:

```python
from FlagEmbedding import FlagReranker
teacher = FlagReranker("BAAI/bge-reranker-v2-m3", use_fp16=True)

def filter_false_negatives(query, negatives, threshold=0.5):
    scores = teacher.compute_score([[query, n] for n in negatives], normalize=True)
    return [n for n, s in zip(negatives, scores) if s < threshold]
```

## Distillation from a Strong Teacher

Large teacher (BGE-reranker-v2-m3 or Cohere Rerank) supervises a small student. Student is fast; teacher is only called once at training time.

```python
# Precompute teacher scores over triples
def score_with_teacher(triples):
    pairs = []
    for q, p, n in triples:
        pairs.extend([[q, p], [q, n]])
    flat = teacher.compute_score(pairs, normalize=True)
    out = []
    for (q, p, n), i in zip(triples, range(0, len(flat), 2)):
        out.append((q, p, n, flat[i], flat[i + 1]))
    return out

# Train student with MarginMSE on teacher deltas
scored = score_with_teacher(triples)
train_examples = [
    InputExample(texts=[q, p, n], label=float(sp - sn))
    for q, p, n, sp, sn in scored
]
student = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2", num_labels=1)
student.fit(DataLoader(train_examples, batch_size=32, shuffle=True),
            loss_fct=MarginMSELoss(student), epochs=4, warmup_steps=1000)
```

A 22 M-param MiniLM distilled from BGE-reranker-v2 typically recovers 90-95% of teacher NDCG@10 at 1/20th the latency.

## Distillation from Cohere Rerank (Vendor Teacher)

```python
import cohere
co = cohere.ClientV2()

def cohere_score_batch(query, docs):
    r = co.rerank(model="rerank-v3.5", query=query, documents=docs, top_n=len(docs))
    return {x.index: x.relevance_score for x in r.results}

# For each training query, pull scores for 50 candidates
training_rows = []
for q in queries:
    candidates = mine_hard_negs(q, positive_ids=gold[q], k=50, per_q=50)
    scores = cohere_score_batch(q, [all_docs[i] for i in candidates])
    for local_idx, cid in enumerate(candidates):
        training_rows.append(
            InputExample(texts=[q, all_docs[cid]], label=float(scores[local_idx]))
        )
```

Respect Cohere rate limits; cache aggressively, distillation is a one-time spend.

## Evaluation: NDCG@10 and MRR

```python
import numpy as np

def dcg_at_k(rels, k):
    rels = np.array(rels[:k], dtype=float)
    if rels.size == 0:
        return 0.0
    discounts = np.log2(np.arange(2, rels.size + 2))
    return float(np.sum(rels / discounts))

def ndcg_at_k(predicted_rels, ideal_rels, k=10):
    dcg = dcg_at_k(predicted_rels, k)
    idcg = dcg_at_k(sorted(ideal_rels, reverse=True), k)
    return dcg / idcg if idcg else 0.0

def evaluate(model, eval_set, k=10):
    scores = []
    for query, candidates, gold_rels in eval_set:
        pred = model.predict([[query, c] for c in candidates])
        order = np.argsort(pred)[::-1]
        pred_rels = [gold_rels[i] for i in order]
        scores.append(ndcg_at_k(pred_rels, gold_rels, k))
    return float(np.mean(scores))

print("NDCG@10:", evaluate(model, eval_set))
```

Compare to:

- Zero-shot MiniLM baseline
- BGE-reranker-v2-m3 (teacher)
- Cohere Rerank (vendor)
- BM25-only retrieval-order

Ship only when you beat the best zero-shot option by a margin beyond noise.

## Serving a Trained Cross-Encoder

```python
from sentence_transformers import CrossEncoder

model = CrossEncoder("./models/cross-encoder-domain", max_length=512)
model.model = model.model.half().to("cuda")  # fp16 on GPU

def rerank(query: str, docs: list[str], top_n: int = 5):
    pairs = [[query, d] for d in docs]
    scores = model.predict(pairs, batch_size=64)
    order = sorted(range(len(docs)), key=lambda i: scores[i], reverse=True)[:top_n]
    return [(i, float(scores[i])) for i in order]
```

For production, export to ONNX or TensorRT and serve via Triton. MiniLM-L-6 on T4 runs ~20 ms for 50 pairs.

## Data Mixing Recipe That Works

1. MS MARCO triples (baseline generalization): 50%
2. Domain triples, mined with BM25 + dense, filtered by teacher: 30-40%
3. Teacher-scored fine-tuning pairs (distillation): 10-20%

Undermixing MS MARCO collapses generalization; overmixing dilutes the domain signal.

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Training only on random negatives | Mine hard negatives from BM25 + dense |
| Ignoring false-negative risk in mined negatives | Filter with a strong teacher reranker before training |
| Student distilled with absolute teacher scores | Use MarginMSE on score *differences* |
| Training for 10+ epochs on 5k examples | Overfits quickly; 2-4 epochs max |
| max_length=128 on passage-level docs | Use 512; truncating loses relevant tokens |
| Evaluating only on MS MARCO dev | Always hold out in-domain test set |
| Shipping without beating zero-shot baseline | Beat BGE-reranker-v2 + Cohere by a margin |
| No ONNX/TensorRT export | Serving in plain PyTorch wastes latency |
| Mixing domains without MS MARCO baseline | Include 30-50% MS MARCO to keep generalization |

## Production Checklist

- [ ] Gold eval set stratified across query intents
- [ ] Hard negatives mined from BM25 + dense, filtered by teacher
- [ ] MarginMSE loss for distillation; BCE for pointwise labels
- [ ] MS MARCO data mixed in (30-50%) to preserve generalization
- [ ] NDCG@10 on held-out set beats the best zero-shot baseline
- [ ] Model exported to ONNX/TensorRT for serving
- [ ] fp16 / int8 quantization measured (usually <1% NDCG loss)
- [ ] Regression suite rerun on new training data / checkpoints
- [ ] Rollback plan to prior checkpoint
- [ ] Latency p95 at 50 pairs within SLO
- [ ] Data lineage documented (source queries, mining retrievers, teacher versions)
