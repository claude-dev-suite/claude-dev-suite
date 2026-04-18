---
name: hard-negative-mining
description: |
  Deep hard-negative mining for dense retrievers: in-batch vs mined, BM25 /
  dense / cross-encoder mining, TAS-B, MarginMSE distillation, curriculum
  schedules, memory banks, false-negative filtering.

  USE WHEN: user mentions "hard negatives", "negative mining", "TAS-B",
  "MarginMSE", "distillation from cross-encoder", "curriculum negatives",
  "memory bank", "MoCo", "false negative filter"

  DO NOT USE FOR: basic fine-tuning setup - use `embedding-fine-tuning`;
  reranker training - out of scope; picking a pretrained model - use `embedding-models`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Hard Negative Mining (Deep Dive)

## Negative Type Taxonomy

| Type | Source | Difficulty | Risk |
|---|---|---|---|
| Random | Uniform sample from corpus | Trivial | Wasted capacity |
| In-batch | Other positives in the same batch | Easy-medium | Fine as baseline |
| BM25-mined | Lexical matches minus true positives | Medium | Misses semantic lookalikes |
| Dense-mined | Nearest neighbors under a weak embedder | Hard | High false-negative rate |
| Cross-encoder-scored | Top-k reranked by a teacher | Very hard | Needs teacher model |
| Self-mined (ANCE) | Nearest neighbors under the model being trained | Adaptive | Can collapse without filtering |

Most production recipes mix in-batch + cross-encoder-filtered dense-mined.

## In-Batch Negatives (Baseline)

MultipleNegativesRankingLoss (MNR) turns every other positive in the batch into
a negative. Free and strong when batch sizes are large (>= 64).

```python
from sentence_transformers import SentenceTransformer
from sentence_transformers.losses import MultipleNegativesRankingLoss
from sentence_transformers.training_args import BatchSamplers

model = SentenceTransformer("BAAI/bge-base-en-v1.5")
loss  = MultipleNegativesRankingLoss(model)

# BatchSamplers.NO_DUPLICATES ensures no leakage of positives across the batch.
```

To scale batch to 512+ on small GPUs use `CachedMultipleNegativesRankingLoss`,
which caches forward activations and recomputes gradients in mini-batches.

## BM25-Mined Negatives

Cheap, lexical, no GPU needed — good for bootstrapping.

```python
from rank_bm25 import BM25Okapi

tokenized = [d.lower().split() for d in corpus]
bm25 = BM25Okapi(tokenized)

def bm25_negatives(query: str, positive_idx: int, k: int = 5):
    scores = bm25.get_scores(query.lower().split())
    ranked = scores.argsort()[::-1]
    return [corpus[i] for i in ranked if i != positive_idx][:k]
```

## Dense-Mined Negatives with False-Negative Filtering

```python
from sentence_transformers import SentenceTransformer, CrossEncoder, util
import torch

miner   = SentenceTransformer("BAAI/bge-base-en-v1.5")
teacher = CrossEncoder("BAAI/bge-reranker-large")

corpus_emb = miner.encode(corpus, convert_to_tensor=True, normalize_embeddings=True,
                          show_progress_bar=True, batch_size=128)

def mine_filtered(query: str, positive_text: str, positive_idx: int,
                  n_candidates: int = 50, n_keep: int = 5,
                  ce_keep_max: float = 0.4):
    """Return hard negatives that the teacher scores BELOW ce_keep_max."""
    q = miner.encode(query, convert_to_tensor=True, normalize_embeddings=True)
    hits = util.semantic_search(q, corpus_emb, top_k=n_candidates)[0]
    candidates = [h for h in hits if h["corpus_id"] != positive_idx]

    cand_texts = [corpus[h["corpus_id"]] for h in candidates]
    ce_scores = teacher.predict([(query, t) for t in cand_texts])

    negatives = [t for t, s in zip(cand_texts, ce_scores) if s < ce_keep_max]
    return negatives[:n_keep]
```

Rule of thumb for BGE-reranker: scores above 0.7 are likely true positives
(do not use as negatives), 0.3-0.7 are ambiguous (skip or use with low weight),
below 0.3 are safe hard negatives.

## TAS-B: Topic-Aware Sampling

TAS-B clusters queries by topic, then samples a batch from one cluster so
in-batch negatives are topically related (harder). Paired with MarginMSE
distillation from a cross-encoder teacher.

```python
from sklearn.cluster import KMeans

query_emb = miner.encode(queries, normalize_embeddings=True, batch_size=128)
km = KMeans(n_clusters=2048, n_init="auto").fit(query_emb)
cluster_of = {q: c for q, c in zip(queries, km.labels_)}

def make_tas_batch(batch_size: int, cluster_id: int, qs_per_cluster):
    """Sample a batch from one cluster so in-batch negatives share a topic."""
    import random
    sample = random.sample(qs_per_cluster[cluster_id], batch_size)
    return sample
```

## MarginMSE Loss with Cross-Encoder Distillation

Distills a cross-encoder's ranking into a bi-encoder. State-of-the-art for
supervised dense retrieval.

```python
from sentence_transformers.losses import MarginMSELoss
from sentence_transformers import InputExample

def build_margin_examples(triplets, teacher: CrossEncoder):
    """triplets: list of (query, positive, negative) -> InputExample with label = score margin"""
    examples = []
    for q, pos, neg in triplets:
        s_pos, s_neg = teacher.predict([(q, pos), (q, neg)])
        margin = float(s_pos - s_neg)
        examples.append(InputExample(texts=[q, pos, neg], label=margin))
    return examples

loss = MarginMSELoss(model)
# Train with a DataLoader of InputExample rows as usual.
```

MarginMSE typically beats TripletLoss by 2-4% MRR@10 on MS MARCO-like tasks
because it transfers graded relevance, not a hard boundary.

## Curriculum Mining (Easy to Hard)

Start with random / BM25 negatives for 1 epoch, then switch to dense-mined
from the partially trained model. Prevents early collapse.

```python
schedule = [
    ("warmup",     0, 1, "bm25",            5),
    ("medium",     1, 2, "dense_ce_0.5",    5),
    ("hard",       2, 4, "dense_ce_0.3",    7),
]

for name, start_e, end_e, mode, n in schedule:
    train_ds = rebuild_dataset(queries, positives, mode=mode, n_neg=n)
    args.num_train_epochs = end_e - start_e
    trainer.train_dataset = train_ds
    trainer.train()
```

## Memory Bank (MoCo-style)

Maintains a queue of past document encodings so each batch sees thousands of
negatives without needing huge GPU memory. Rarely used in sentence-transformers
directly but worth knowing.

```python
import torch
from collections import deque

class MemoryBank:
    def __init__(self, size: int = 16384, dim: int = 768):
        self.buf = deque(maxlen=size)
        self.dim = dim

    def push(self, vecs: torch.Tensor):
        for v in vecs.detach().cpu():
            self.buf.append(v)

    def sample(self, n: int) -> torch.Tensor:
        import random
        return torch.stack(random.sample(list(self.buf), min(n, len(self.buf))))
```

Use bank samples as extra negatives concatenated with in-batch negatives.

## False-Negative Risks by Mining Method

| Method | False-negative rate | Mitigation |
|---|---|---|
| Random | < 0.1% | Ignore |
| BM25 | 1-3% | Usually ignorable |
| Dense top-50 | 5-15% | Cross-encoder filter, required |
| Self-mined (ANCE) | 10-25% | CE filter + schedule |
| Nearest-1 dense | 20%+ | Never use without filtering |

A 10% false-negative rate is enough to cap the retriever at ~85% recall@10 no
matter how long you train.

## Combining Mining Methods

```python
def combined_negatives(query, positive, positive_idx, k_total=7):
    bm25 = bm25_negatives(query, positive_idx, k=3)
    dense = mine_filtered(query, positive, positive_idx, n_keep=4)
    return bm25 + dense
```

Mixing lexical and semantic negatives produces more diverse gradients than
either alone.

## Evaluating Mining Quality

Before training, score your mined triplets with the teacher:

- `s_pos - s_neg` mean margin should be > 2.0.
- Fewer than 5% triplets with `s_neg > s_pos` (obvious false negatives).
- Plot margin distribution; suspicious if bimodal near zero.

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Mining negatives without false-negative filter | Always pass through a cross-encoder |
| Using single nearest neighbor as negative | Sample from top-20 to top-100 range |
| Same miner model used during training (no curriculum) | Warmup with easy negatives, then harden |
| Ignoring batch-sampler duplicates with MNR | Use `BatchSamplers.NO_DUPLICATES` |
| Distilling from a weak reranker | Teacher must be meaningfully stronger than the student |
| No per-query negative budget cap | Cap at 5-8 negatives per query; more overfits |
| Mining once and freezing | Re-mine every N epochs with current model for self-mining schedules |

## Production Checklist

- [ ] Teacher cross-encoder picked (BGE-reranker-large or stronger)
- [ ] False-negative filter threshold set and validated on 100 labeled pairs
- [ ] Mining mix (BM25 + dense) balanced; per-query cap enforced
- [ ] Curriculum schedule defined if training > 2 epochs
- [ ] Margin distribution plotted before training kicks off
- [ ] Batch size tuned; CachedMNR if GPU-constrained
- [ ] Held-out IR eval run after each mining regime change
- [ ] Mined triplets versioned alongside the resulting model
