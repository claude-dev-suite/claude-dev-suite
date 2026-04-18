---
name: semantic-dedup
description: |
  Near-duplicate and semantic-duplicate detection in corpora before indexing.
  MinHash / LSH, SimHash, embedding-cosine clustering (DBSCAN), FAISS-based
  scalable dedup, threshold selection, paraphrase handling.

  USE WHEN: user mentions "deduplication", "near-duplicates", "MinHash",
  "SimHash", "LSH", "semantic dedup", "corpus cleaning", "FAISS dedup",
  "paraphrase detection"

  DO NOT USE FOR: exact-hash dedup at ingest (use SHA256); chunking decisions -
  use `chunking-strategies`; drift detection - use `drift-detection`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Semantic Deduplication

## Why Dedup Before Indexing

Web scrapes, email archives, and aggregated document sets routinely contain
5-30% near-duplicates. Symptoms when left unaddressed:

- Retrieval ranks N copies of the same document in the top-K, pushing out
  diverse results.
- Embedding fine-tuning over-weights redundant content.
- Storage and query cost scale with duplication factor.
- Evaluation metrics get inflated (one "correct" doc appears many times).

## Three Levels of Duplication

| Level | Method | Cost | Recall on paraphrases |
|---|---|---|---|
| Exact | SHA256 of normalized text | O(n) | 0% |
| Near-duplicate (edits, boilerplate variants) | MinHash+LSH, SimHash | O(n) with LSH | Low |
| Semantic (paraphrases, translations) | Embedding cosine + clustering | O(n log n) with ANN | High |

Run them in that order: cheap filters first.

## Stage 1: Exact Dedup

```python
import hashlib, re

def normalize(s: str) -> str:
    s = s.lower()
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"[^\w\s]", "", s)
    return s

def sha(s: str) -> str:
    return hashlib.sha256(normalize(s).encode()).hexdigest()

seen, keep = set(), []
for doc in corpus:
    h = sha(doc)
    if h not in seen:
        seen.add(h)
        keep.append(doc)
```

## Stage 2: Near-Duplicate Detection with MinHash + LSH

`datasketch` handles this efficiently.

```python
from datasketch import MinHash, MinHashLSH

def shingles(text: str, k: int = 5):
    tokens = text.lower().split()
    return {" ".join(tokens[i:i + k]) for i in range(len(tokens) - k + 1)}

def minhash_of(text: str, num_perm: int = 128) -> MinHash:
    m = MinHash(num_perm=num_perm)
    for sh in shingles(text):
        m.update(sh.encode())
    return m

lsh = MinHashLSH(threshold=0.8, num_perm=128)
mhs = {}
for i, doc in enumerate(corpus):
    m = minhash_of(doc)
    lsh.insert(str(i), m)
    mhs[str(i)] = m

duplicates = {}
for key, m in mhs.items():
    cand = [c for c in lsh.query(m) if c != key]
    if cand:
        duplicates[key] = cand
```

Threshold 0.8 maps roughly to "80%+ shingle overlap". Tune on labeled pairs.

## Stage 3: SimHash (Bit-Level, Very Fast)

Good for boilerplate detection in web scrapes; weaker than MinHash on short text.

```python
from simhash import Simhash, SimhashIndex

objs = [(str(i), Simhash(d)) for i, d in enumerate(corpus)]
index = SimhashIndex(objs, k=3)  # Hamming distance <= 3

dupes = {}
for i, (_, sh) in enumerate(objs):
    near = [x for x in index.get_near_dups(sh) if x != str(i)]
    if near:
        dupes[str(i)] = near
```

## Stage 4: Embedding-Based Semantic Dedup

Catches paraphrases, translations, and reformulations that MinHash misses.

```python
from sentence_transformers import SentenceTransformer
import numpy as np

model = SentenceTransformer("BAAI/bge-base-en-v1.5")
embs = model.encode(corpus, normalize_embeddings=True, batch_size=128,
                    show_progress_bar=True)
```

### DBSCAN on Cosine Distance

```python
from sklearn.cluster import DBSCAN

# 1 - cosine similarity = cosine distance; eps = 0.05 ~ cosine >= 0.95
db = DBSCAN(eps=0.05, min_samples=2, metric="cosine", n_jobs=-1).fit(embs)
labels = db.labels_

clusters = {}
for idx, label in enumerate(labels):
    if label == -1:
        continue
    clusters.setdefault(label, []).append(idx)

# Keep one representative per cluster (longest doc is usually best)
keep = set(range(len(corpus)))
for members in clusters.values():
    members.sort(key=lambda i: len(corpus[i]), reverse=True)
    for dup in members[1:]:
        keep.discard(dup)
deduped = [corpus[i] for i in sorted(keep)]
```

### Scalable FAISS Dedup

DBSCAN is O(n^2). For millions of docs use FAISS + a threshold query.

```python
import faiss, numpy as np

vecs = embs.astype("float32")
index = faiss.IndexFlatIP(vecs.shape[1])
index.add(vecs)

THRESH = 0.95
duplicates_of = {}
for i, v in enumerate(vecs):
    sims, ids = index.search(v[None, :], k=10)
    dups = [int(j) for s, j in zip(sims[0], ids[0]) if j != i and s >= THRESH]
    if dups:
        duplicates_of[i] = dups
```

For 10M+ docs, use `IndexHNSWFlat` or `IndexIVFPQ` — tune recall against speed.

### Union-Find to Resolve Clusters

```python
class UnionFind:
    def __init__(self, n):
        self.p = list(range(n))
    def find(self, x):
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x
    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb: self.p[ra] = rb

uf = UnionFind(len(corpus))
for i, dups in duplicates_of.items():
    for j in dups:
        uf.union(i, j)

from collections import defaultdict
cluster_of = defaultdict(list)
for i in range(len(corpus)):
    cluster_of[uf.find(i)].append(i)
```

## Threshold Selection via ROC

Given a labeled set of (doc_a, doc_b, is_duplicate), find the cosine threshold
maximizing F1.

```python
from sklearn.metrics import precision_recall_curve, f1_score
import numpy as np

pairs = [(a, b, lbl) for a, b, lbl in labeled_pairs]
sims  = [float(np.dot(embs[a], embs[b])) for a, b, _ in pairs]
lbls  = [lbl for _, _, lbl in pairs]

p, r, thr = precision_recall_curve(lbls, sims)
f1 = 2 * p * r / (p + r + 1e-9)
best = thr[np.argmax(f1[:-1])]
print(f"Best threshold: {best:.3f} (F1 {f1.max():.3f})")
```

Typical thresholds by task:

| Task | Cosine threshold |
|---|---|
| Identical content, different formatting | 0.98+ |
| Same content, rephrased | 0.92-0.95 |
| Same topic, different story | 0.80-0.88 (often too permissive) |
| Translation (multilingual model) | 0.88-0.93 |

## Picking a Cluster Representative

Heuristics, in priority order:

1. Longest document (usually has most context).
2. Most recent (latest timestamp).
3. Highest-authority source (domain allowlist ranking).
4. Best formatting (markdown > plain text > scraped HTML remnants).

```python
def pick_representative(members: list[int], docs, meta) -> int:
    return max(members, key=lambda i: (
        meta[i].get("authority", 0),
        meta[i].get("timestamp", 0),
        len(docs[i]),
    ))
```

## Handling Paraphrases vs Exact Duplicates Differently

Keep paraphrases as separate docs with a `cluster_id` metadata field. At
retrieval time, diversity-filter results to max one per cluster. This preserves
distinct phrasings (some users search in one wording) without returning 5
top-K slots for the same idea.

```python
def diverse_topk(results, cluster_of, k=5):
    seen, out = set(), []
    for r in results:
        c = cluster_of.get(r.doc_id)
        if c in seen: continue
        seen.add(c)
        out.append(r)
        if len(out) >= k: break
    return out
```

## Scaling Playbook (10M+ docs)

1. SHA256 exact dedup (in-memory dict, single pass).
2. MinHashLSH with `threshold=0.9` (Redis backend for persistence).
3. Embed survivors; build HNSW or IVFPQ FAISS index.
4. Query each vector for top-10; record edges above threshold.
5. Union-find to form clusters.
6. Keep one rep per cluster; store `cluster_id` on the rest.

Expect 30-50% size reduction on typical web scrapes.

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Only SHA256 dedup on raw text | Add normalized exact + MinHash + embedding stages |
| DBSCAN on 1M+ vectors | Use FAISS threshold search; DBSCAN is quadratic |
| Single global threshold for all doc types | Tune per-source (short titles vs long articles) |
| Dropping all duplicates | Keep one rep; retain `cluster_id` for diversity filtering |
| Dedup after indexing | Dedup before — re-indexing is expensive |
| No labeled pairs for threshold | Label 200-500 pairs; run ROC; pick F1 max |
| Cross-language dedup with monolingual embedder | Use multilingual (BGE-M3, multilingual-e5) |

## Production Checklist

- [ ] Three-stage pipeline (exact, MinHash, embedding) wired
- [ ] Threshold tuned on labeled pairs with F1 > 0.9
- [ ] FAISS index used for >1M doc corpora
- [ ] Cluster representatives chosen by documented heuristic
- [ ] `cluster_id` stored in metadata for diversity filtering at retrieval
- [ ] Multilingual embedder used if corpus is cross-lingual
- [ ] Dedup results logged (removed count, cluster size histogram)
- [ ] Reproducible: seed, model version, threshold, date recorded
