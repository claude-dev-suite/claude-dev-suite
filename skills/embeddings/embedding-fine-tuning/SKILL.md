---
name: embedding-fine-tuning
description: |
  Fine-tuning sentence embedding models with sentence-transformers. Contrastive
  objectives (MultipleNegativesRankingLoss, TripletLoss, CoSENT), domain
  adaptation, synthetic query generation (GPL), hard negative mining, and
  downstream retrieval evaluation.

  USE WHEN: user mentions "fine-tune embeddings", "domain adaptation",
  "sentence-transformers training", "contrastive loss", "hard negatives",
  "GPL", "synthetic queries", "MNR loss", "triplet loss"

  DO NOT USE FOR: picking a pretrained model - use `embedding-models`;
  MRL truncation - use `matryoshka-embeddings`; reranker training - out of scope
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Embedding Fine-Tuning

## When to Fine-Tune

| Signal | Action |
|---|---|
| Domain vocabulary very different from web (legal, medical, code) | Fine-tune |
| Generic model recall@10 above 0.85 on eval | Do not fine-tune; tune retrieval |
| No labelled (query, doc) pairs available | Start with GPL synthetic queries |
| Fewer than 500 real pairs | Use synthetic + in-batch negatives |
| 10k+ labelled pairs with hard negatives | Expect 5-15% nDCG lift |

## Contrastive Loss Choices

| Loss | Inputs | When to use |
|---|---|---|
| MultipleNegativesRankingLoss (MNR) | (anchor, positive) | Default — uses in-batch negatives, no labels needed |
| MultipleNegativesSymmetricRankingLoss | (anchor, positive) | Symmetric tasks (STS-like) |
| TripletLoss | (anchor, positive, negative) | When hard negatives are curated |
| CachedMultipleNegativesRankingLoss | (anchor, positive) | Large batch sizes on small GPUs |
| CoSENT / AnglE | labelled similarity scores | STS regression tasks |
| Matryoshka2dLoss wrapper | any base loss | Train MRL-truncatable model |

## Minimal Training Loop (sentence-transformers v3+)

```python
from sentence_transformers import (
    SentenceTransformer, SentenceTransformerTrainer,
    SentenceTransformerTrainingArguments,
)
from sentence_transformers.losses import MultipleNegativesRankingLoss
from sentence_transformers.training_args import BatchSamplers
from sentence_transformers.evaluation import InformationRetrievalEvaluator
from datasets import Dataset

model = SentenceTransformer("BAAI/bge-base-en-v1.5")

# Dataset: two columns named exactly "anchor" and "positive"
train_ds = Dataset.from_dict({
    "anchor":   ["how do I reset my password?", "what is OAuth 2.0?"],
    "positive": ["Go to Settings > Security > Reset Password.",
                 "OAuth 2.0 is an authorization framework for delegated access."],
})

loss = MultipleNegativesRankingLoss(model)

args = SentenceTransformerTrainingArguments(
    output_dir="models/my-domain-embedder",
    num_train_epochs=3,
    per_device_train_batch_size=64,
    learning_rate=2e-5,
    warmup_ratio=0.1,
    fp16=True,
    batch_sampler=BatchSamplers.NO_DUPLICATES,  # critical for MNR
    eval_strategy="steps",
    eval_steps=200,
    save_strategy="steps",
    save_steps=200,
    logging_steps=50,
    run_name="bge-domain-v1",
)

trainer = SentenceTransformerTrainer(
    model=model,
    args=args,
    train_dataset=train_ds,
    loss=loss,
)
trainer.train()
model.save_pretrained("models/my-domain-embedder/final")
```

## Triplet Loss with Hard Negatives

```python
from sentence_transformers.losses import TripletLoss, TripletDistanceMetric
from datasets import Dataset

triplet_ds = Dataset.from_dict({
    "anchor":   ["revoke OAuth token"],
    "positive": ["Call POST /oauth/revoke with the token parameter."],
    "negative": ["Register a new OAuth client in the developer console."],  # topically similar but wrong
})

loss = TripletLoss(
    model=model,
    distance_metric=TripletDistanceMetric.COSINE,
    triplet_margin=0.3,
)
```

## Hard Negative Mining

Random negatives are too easy; mine negatives that a pretrained model ranks highly
but are NOT the ground-truth positive.

```python
from sentence_transformers import SentenceTransformer, util

miner = SentenceTransformer("BAAI/bge-base-en-v1.5")
corpus = [...]                          # all candidate docs
corpus_emb = miner.encode(corpus, convert_to_tensor=True, normalize_embeddings=True)

def mine_hard_negatives(query: str, positive_idx: int, k: int = 3, top_n: int = 50):
    q_emb = miner.encode(query, convert_to_tensor=True, normalize_embeddings=True)
    hits = util.semantic_search(q_emb, corpus_emb, top_k=top_n)[0]
    # Skip true positive; take next ranked items
    negatives = [corpus[h["corpus_id"]] for h in hits if h["corpus_id"] != positive_idx][:k]
    return negatives

# Filter out false negatives with a cross-encoder or teacher model before using.
```

False-negative filtering is critical — if a mined "negative" is actually relevant,
you teach the model the opposite of what you want. Use a strong cross-encoder
(`BAAI/bge-reranker-large`) to filter out candidates with rerank score above a
threshold.

## Synthetic Query Generation (GPL-style)

When you have documents but no queries:

```python
# Step 1: Generate queries per document using an LLM
from openai import OpenAI
client = OpenAI()

PROMPT = """Generate exactly 3 distinct search queries a user would type to find
this passage. Return one query per line, no numbering.

Passage:
{doc}"""

def generate_queries(doc: str) -> list[str]:
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role": "user", "content": PROMPT.format(doc=doc)}],
        temperature=0.7,
    )
    return [q.strip() for q in resp.choices[0].message.content.splitlines() if q.strip()]

# Step 2: Mine hard negatives with a pretrained embedder
# Step 3: Score (query, pos, neg) triplets with a cross-encoder teacher to get
#         soft margins (GPL uses margin-MSE loss on these scores).

from sentence_transformers.losses import MarginMSELoss
from sentence_transformers import CrossEncoder

teacher = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")

def margin(query, pos, neg):
    s_pos = teacher.predict([(query, pos)])[0]
    s_neg = teacher.predict([(query, neg)])[0]
    return float(s_pos - s_neg)

# Build dataset of (query, pos, neg, margin) rows and train with MarginMSELoss.
```

## Matryoshka Training (MRL)

Train once, deploy at multiple dimensions. See also the `matryoshka-embeddings`
skill.

```python
from sentence_transformers.losses import MatryoshkaLoss, MultipleNegativesRankingLoss

base_loss = MultipleNegativesRankingLoss(model)
loss = MatryoshkaLoss(model, base_loss, matryoshka_dims=[768, 512, 256, 128, 64])
```

## Evaluation on Downstream Retrieval

Do not evaluate on loss curves. Score retrieval metrics on a held-out eval set.

```python
from sentence_transformers.evaluation import InformationRetrievalEvaluator

# queries: dict[qid, query]; corpus: dict[cid, doc]; relevant_docs: dict[qid, set[cid]]
ir_evaluator = InformationRetrievalEvaluator(
    queries=queries,
    corpus=corpus,
    relevant_docs=relevant_docs,
    name="domain-eval",
    accuracy_at_k=[1, 5, 10],
    precision_recall_at_k=[1, 5, 10],
    mrr_at_k=[10],
    ndcg_at_k=[10],
    map_at_k=[10],
    show_progress_bar=True,
)

metrics = ir_evaluator(model)
print(metrics)
# Pass ir_evaluator=... to SentenceTransformerTrainer to track during training.
```

## Domain Adaptation Pipeline (End-to-End)

```
1. Dump domain corpus (chunks of 200-400 tokens).
2. Generate 2-3 synthetic queries per chunk with an LLM (filter garbage).
3. Mine 3-5 hard negatives per (query, chunk) with a pretrained embedder.
4. Filter false negatives with a cross-encoder teacher.
5. Train with MNR or MarginMSE for 1-3 epochs.
6. Evaluate IR metrics on held-out real queries.
7. A/B test in production against pretrained baseline.
```

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Training with random negatives only | Mine hard negatives + filter false negatives |
| BatchSampler keeps duplicates | Use `BatchSamplers.NO_DUPLICATES` with MNR |
| Evaluating only on training loss | Use `InformationRetrievalEvaluator` on held-out set |
| Too-high learning rate (1e-4+) on strong base | Use 1e-5 to 5e-5 for BGE/E5 base models |
| Tiny batch sizes with MNR | MNR benefits from batch 64-256; use `CachedMNRLoss` on small GPUs |
| Forgetting task prefixes on E5 / Nomic | Apply the same prefixes used at inference during training |
| Fine-tuning on <500 pairs with no synthetic data | Use GPL synthetic pipeline first |

## Production Checklist

- [ ] Held-out eval set with real user queries
- [ ] Baseline (pretrained) metrics recorded before training
- [ ] Hard negatives mined and filtered for false negatives
- [ ] Task prefixes applied consistently during training and inference
- [ ] MRL / Matryoshka loss used if truncatable deployment planned
- [ ] Trained model versioned; vector DB tagged with model version
- [ ] A/B test plan vs baseline before full rollout
- [ ] Re-training schedule documented (monthly / quarterly)
