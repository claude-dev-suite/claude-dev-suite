---
name: drift-detection
description: |
  Detecting distributional drift in production embeddings. Metrics (KL, PSI,
  MMD, cosine-to-centroid), alerting thresholds, query-vs-corpus divergence,
  root-cause analysis, and embedding observability tooling (Arize, Fiddler).

  USE WHEN: user mentions "embedding drift", "distribution shift", "PSI",
  "KL divergence", "MMD", "embedding monitoring", "embedding observability",
  "model staleness", "production embedding quality"

  DO NOT USE FOR: evaluation of answer quality - use `rag-evaluation`;
  retraining embeddings - use `embedding-fine-tuning`; general model drift
  on tabular features - use an ML monitoring skill
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Embedding Drift Detection

## What Drifts

| Source | Symptom | Impact |
|---|---|---|
| Query topic shift (user behavior change) | Query embedding distribution moves | Recall drops for old corpus |
| Corpus freshness (new docs indexed) | Corpus centroid shifts | Old gold set no longer representative |
| Upstream model update | Mean cosine between re-encoded docs < 0.99 | Silent index corruption |
| Tokenizer / preprocessing change | Mean token count changes | Chunks map to different embeddings |
| Language mix shift | Language-detection histogram drifts | Monolingual model hit by new languages |

Drift is not inherently bad — it is a trigger for evaluation, retraining, or
re-indexing.

## Reference Windows

Keep two rolling distributions:

- **Reference**: embeddings collected during a known-good period (e.g. last full
  month before deploy). Freeze this.
- **Current**: last 24h / 7d of production embeddings.

Compare current against reference at a fixed cadence.

## PSI (Population Stability Index)

Industry-standard drift metric — cheap and interpretable.

```python
import numpy as np

def psi(reference: np.ndarray, current: np.ndarray, bins: int = 10) -> float:
    """Compute PSI on a single scalar signal (e.g., one embedding dim or a projection)."""
    eps = 1e-6
    qs = np.quantile(reference, np.linspace(0, 1, bins + 1))
    qs[0], qs[-1] = -np.inf, np.inf
    ref_hist, _ = np.histogram(reference, bins=qs)
    cur_hist, _ = np.histogram(current, bins=qs)
    ref_pct = ref_hist / (ref_hist.sum() + eps) + eps
    cur_pct = cur_hist / (cur_hist.sum() + eps) + eps
    return float(np.sum((cur_pct - ref_pct) * np.log(cur_pct / ref_pct)))

# Thresholds (conventional):
# PSI < 0.1  -> stable
# 0.1 - 0.25 -> moderate drift, investigate
# > 0.25     -> significant drift, act

def embedding_psi(ref: np.ndarray, cur: np.ndarray) -> float:
    """Average PSI across dims — crude but robust."""
    dims = ref.shape[1]
    return float(np.mean([psi(ref[:, d], cur[:, d]) for d in range(dims)]))
```

Don't run PSI on raw 1536-dim vectors in alerting — it's noisy. Project to 8-16
dims via PCA fit on the reference set, then compute PSI on each projection.

## KL Divergence via Binning

```python
from scipy.stats import entropy

def kl_div(reference: np.ndarray, current: np.ndarray, bins: int = 20) -> float:
    qs = np.quantile(reference, np.linspace(0, 1, bins + 1))
    qs[0], qs[-1] = -np.inf, np.inf
    p, _ = np.histogram(reference, bins=qs, density=True)
    q, _ = np.histogram(current,   bins=qs, density=True)
    return float(entropy(p + 1e-9, q + 1e-9))
```

## Maximum Mean Discrepancy (MMD)

Kernel-based two-sample test; detects multivariate drift without binning.

```python
import torch

def mmd_rbf(X: torch.Tensor, Y: torch.Tensor, sigma: float = 1.0) -> float:
    XX = torch.cdist(X, X).pow(2)
    YY = torch.cdist(Y, Y).pow(2)
    XY = torch.cdist(X, Y).pow(2)
    k_xx = torch.exp(-XX / (2 * sigma ** 2)).mean()
    k_yy = torch.exp(-YY / (2 * sigma ** 2)).mean()
    k_xy = torch.exp(-XY / (2 * sigma ** 2)).mean()
    return float(k_xx + k_yy - 2 * k_xy)

# Use on a random sample of 1-5k reference vs current embeddings; anything
# above permutation-test p=0.01 threshold is significant.
```

## Cosine-to-Centroid Drift (Cheapest Signal)

```python
def centroid_drift(ref: np.ndarray, cur: np.ndarray) -> float:
    ref_c = ref.mean(0); ref_c /= np.linalg.norm(ref_c)
    cur_c = cur.mean(0); cur_c /= np.linalg.norm(cur_c)
    return float(1 - np.dot(ref_c, cur_c))

# Works well for fast dashboards; misses shape changes with stable mean.
```

## Query vs Corpus Gap

```python
def query_corpus_gap(query_embs: np.ndarray, corpus_embs: np.ndarray, k: int = 10):
    """Average cosine of nearest corpus neighbor per query."""
    q = query_embs / np.linalg.norm(query_embs, axis=1, keepdims=True)
    c = corpus_embs / np.linalg.norm(corpus_embs, axis=1, keepdims=True)
    sims = q @ c.T
    top  = np.partition(sims, -k, axis=1)[:, -k:]
    return float(top.mean())

# Track this daily — a falling value indicates queries are drifting away from corpus.
```

## Streaming Drift with River / scikit-multiflow

```python
from river.drift import ADWIN

detector = ADWIN(delta=0.002)
warned = []

for i, vec in enumerate(production_embeddings_stream):
    proj = float(pca.transform(vec.reshape(1, -1))[0, 0])   # 1st principal component
    detector.update(proj)
    if detector.drift_detected:
        warned.append(i)
        print(f"drift at index {i}")
```

## Alert Thresholds

| Metric | Warn | Alert |
|---|---|---|
| PSI (projected) | 0.10 | 0.25 |
| KL (binned, per projection) | 0.10 | 0.25 |
| MMD permutation p-value | 0.05 | 0.01 |
| Centroid cosine gap | 0.02 | 0.05 |
| Query-corpus top-k cosine drop | 2% relative | 5% relative |

Calibrate on historical data before paging on-call.

## Root-Cause Playbook

When drift fires, check in order:

1. **Deployment diff** — did embedding model, tokenizer, or preprocessing change?
   Re-encode a fixed canary set daily; mean cosine should be > 0.999.
2. **Corpus changes** — was there a bulk ingest? Compare new-doc-only embeddings
   to corpus reference.
3. **Query mix** — group by user segment / route / language; drift often
   localizes to one segment.
4. **Seasonality** — weekend / holiday / product-launch effects. Keep a 90-day
   baseline, not 7-day.
5. **Upstream data** — check feature pipeline for nulls, encoding issues, new
   languages.

## Observability Tools

| Tool | Fit |
|---|---|
| Arize AI | Full embedding monitoring with UMAP visualizations, drift alerts, root-cause |
| Fiddler | Enterprise embedding monitoring + fairness |
| WhyLabs (whylogs) | OSS profiling; custom embedding drift via distance metrics |
| Langfuse / LangSmith | Request-level tracing; drift requires custom code |
| OpenTelemetry + Prometheus | DIY — emit PSI / centroid as gauges |

## Instrumentation Example (OTel + Prometheus)

```python
from opentelemetry import metrics
import numpy as np

meter = metrics.get_meter("embeddings.drift")
psi_gauge = meter.create_gauge("embedding.psi", description="rolling PSI vs ref")
centroid_gauge = meter.create_gauge("embedding.centroid_gap")

def emit_drift(ref_batch, cur_batch, route: str):
    psi_gauge.set(embedding_psi(ref_batch, cur_batch), {"route": route})
    centroid_gauge.set(centroid_drift(ref_batch, cur_batch), {"route": route})
```

## Canary Re-Encoding

```python
# Fixed set of 500 canary docs, encoded at deploy time -> canary_ref.npy
canary_texts = open("canary.txt").read().splitlines()
canary_ref = np.load("canary_ref.npy")

def canary_check(current_model) -> float:
    cur = current_model.encode(canary_texts, normalize_embeddings=True)
    sims = (cur * canary_ref).sum(axis=1)
    return float(sims.mean())

# Any value below 0.999 means the model or preprocessing changed silently.
```

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| PSI on raw 1536-dim vectors (noisy) | Reduce with PCA to 8-16 dims first |
| Comparing current to rolling 24h only | Keep an immutable reference window |
| Paging on first drift signal | Require persistence (3 consecutive windows) |
| No canary re-encoding | Run daily; mean cosine > 0.999 or raise |
| Alerting without root-cause fields | Tag metrics with route / language / segment |
| Treating drift = regression | Drift triggers eval; regression proven by gold-set delta |
| Storing only mean vector | Keep histogram or sample of vectors for post-hoc analysis |

## Production Checklist

- [ ] Reference embedding window frozen and versioned
- [ ] PCA projection fit on reference, persisted, loaded at check time
- [ ] PSI, centroid gap, and query-corpus gap emitted as metrics
- [ ] Canary set re-encoded daily; alert on mean cosine < 0.999
- [ ] Alert rules with hysteresis (N consecutive windows)
- [ ] Root-cause tags (route, segment, language) on all metrics
- [ ] Runbook linking drift alert to evaluation rerun + rollback steps
- [ ] Quarterly review of thresholds against historical data
