---
name: entity-resolution
description: |
  Entity resolution (ER) for multi-source RAG and knowledge graphs.
  Dedup entities across documents ("Acme Corp" = "Acme, Inc." = "Acme
  Corporation"). Covers blocking, probabilistic linking (Splink), Dedupe.io,
  embedding-based matching, LLM-assisted resolution with rules, graph-based
  resolution (merged nodes), canonical IDs, and mapping tables.

  USE WHEN: user mentions "entity resolution", "record linkage", "dedup",
  "deduplication", "Splink", "Dedupe.io", "canonicalization", "entity matching",
  "coreference resolution" (corpus-level)

  DO NOT USE FOR: building a KG from scratch - use `knowledge-graph-construction`;
  retrieval tactics - use `graph-rag`;
  ontology-aware retrieval - use `ontology-guided-retrieval`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Entity Resolution for RAG

Unstructured ingestion creates the same entity many times: "Acme Corp", "Acme, Inc.", "ACME CORPORATION", "acme". Without resolution, your graph has disconnected islands and your retrieval scatters facts across near-duplicate nodes. ER merges these into a canonical entity with a stable ID and a set of aliases.

## Pipeline Overview

```
raw mentions → normalize → block → pair candidates → score → cluster → canonicalize → persist
```

- **Normalize**: lowercase, strip legal suffixes, punctuation, Unicode NFC.
- **Block**: reduce O(n²) comparisons to O(n·k) via blocks (e.g., first 3 chars, phonetic code, embedding cluster).
- **Score**: string similarity, embedding cosine, LLM judgement for hard cases.
- **Cluster**: connected components on "same-as" pairs.
- **Canonicalize**: pick a canonical form (longest, most frequent, schema-preferred).
- **Persist**: mapping table `(alias → canonical_id)` + merged graph node.

## Normalization

```python
import re, unicodedata

LEGAL_SUFFIXES = [
    "inc", "inc.", "llc", "l.l.c.", "corp", "corp.", "corporation",
    "ltd", "ltd.", "limited", "co", "co.", "gmbh", "sa", "ag", "plc", "bv",
]

def normalize_org(name: str) -> str:
    s = unicodedata.normalize("NFKC", name).lower().strip()
    s = re.sub(r"[^\w\s&]", " ", s)
    toks = [t for t in s.split() if t and t not in LEGAL_SUFFIXES]
    return " ".join(toks)

normalize_org("Acme, Inc.")            # -> "acme"
normalize_org("ACME Corporation")      # -> "acme"
normalize_org("Acme Holdings LLC")     # -> "acme holdings"
```

For people: strip titles ("Dr.", "Mr."), handle initials (`A. Smith` ↔ `Alice Smith`), normalize diacritics. For places: strip state/country trailing tokens when comparing cities.

## Blocking (reduce pairwise comparisons)

```python
from collections import defaultdict

def block_key(name: str) -> str:
    n = normalize_org(name)
    return n[:3] if n else ""

blocks = defaultdict(list)
for rec in records:
    blocks[block_key(rec["name"])].append(rec)

pairs = []
for group in blocks.values():
    for i in range(len(group)):
        for j in range(i + 1, len(group)):
            pairs.append((group[i], group[j]))
```

Embedding-based blocking (better recall): cluster normalized names with KMeans/HDBSCAN on sentence-embedding vectors; candidate pairs are within-cluster only.

## Probabilistic Linking with Splink

Splink (by Robin Linacre et al.) implements the Fellegi-Sunter model on top of DuckDB/Spark. It learns m-probabilities and u-probabilities per field and scores pairs.

```python
# pip install splink
import splink.duckdb.comparison_library as cl
from splink.duckdb.linker import DuckDBLinker

settings = {
    "link_type": "dedupe_only",
    "blocking_rules_to_generate_predictions": [
        "l.name_norm_3 = r.name_norm_3",
        "l.domain = r.domain",
    ],
    "comparisons": [
        cl.jaro_winkler_at_thresholds("name_norm", [0.9, 0.7]),
        cl.exact_match("country"),
        cl.levenshtein_at_thresholds("domain", [2, 5]),
    ],
    "retain_intermediate_calculation_columns": True,
}

linker = DuckDBLinker(df, settings)
linker.estimate_probability_two_random_records_match(
    ["l.name_norm = r.name_norm"], recall=0.8,
)
linker.estimate_u_using_random_sampling(max_pairs=1e7)
linker.estimate_parameters_using_expectation_maximisation("l.name_norm = r.name_norm")

predictions = linker.predict(threshold_match_probability=0.95)
clusters = linker.cluster_pairwise_predictions_at_threshold(predictions, threshold_match_probability=0.95)
```

Splink scales to 100M+ records on Spark. Use for structured-ish CRM/CDP data with consistent fields.

## Dedupe.io (Python library)

Good for tabular data without engineering a probabilistic model by hand:

```python
import dedupe

fields = [
    {"field": "name", "type": "String"},
    {"field": "address", "type": "String", "has missing": True},
    {"field": "city", "type": "String"},
]
deduper = dedupe.Dedupe(fields)
deduper.prepare_training(records)

# Interactively label ~15–20 pairs
dedupe.console_label(deduper)
deduper.train()

clusters = deduper.partition(records, threshold=0.5)
```

## Embedding-Based Matching

When names/text are noisy and you already have an embedder in your RAG stack:

```python
import numpy as np
from sklearn.cluster import AgglomerativeClustering

vectors = embed([r["name_norm"] for r in records])
clu = AgglomerativeClustering(
    n_clusters=None,
    distance_threshold=0.15,     # tune on labelled set; ~0.1–0.2 for BGE-large
    metric="cosine",
    linkage="average",
).fit(vectors)

for rec, cid in zip(records, clu.labels_):
    rec["cluster_id"] = int(cid)
```

Pros: handles typos, abbreviations, translations. Cons: can merge distinct entities with similar names ("Acme Medical" vs "Acme Media"). Always combine with string features.

## LLM-Assisted Resolution

Use an LLM for the hard 1–5% of pairs after string + embedding filters:

```python
import anthropic, json
client = anthropic.Anthropic()

RESOLVE_PROMPT = """Are these the same real-world entity? Reply JSON:
{{"same": true|false, "confidence": 0.0-1.0, "reason": "..."}}

A: {a}
B: {b}
Context A: {ctx_a}
Context B: {ctx_b}
"""

def llm_same(a, b, ctx_a, ctx_b) -> dict:
    msg = client.messages.create(
        model="claude-haiku-4-5",
        max_tokens=200,
        messages=[{"role": "user", "content": RESOLVE_PROMPT.format(
            a=a, b=b, ctx_a=ctx_a[:500], ctx_b=ctx_b[:500],
        )}],
    )
    return json.loads(msg.content[0].text)
```

- Restrict LLM to borderline pairs (score in `[0.7, 0.95]`); cheap classifier handles the rest.
- Cache by `sha256(a + b)` to avoid re-asking.
- Use batch API for nightly backfills.
- Human-in-the-loop queue when LLM confidence < 0.7.

## Rule-Based Guards

Rules that veto or force a decision regardless of scorer:

```python
def hard_veto(a, b) -> bool:
    if a.get("country") and b.get("country") and a["country"] != b["country"]:
        return True     # same-named orgs in different countries — keep separate
    if a.get("industry") and b.get("industry") and a["industry"] != b["industry"]:
        return True
    return False

def hard_match(a, b) -> bool:
    return bool(a.get("tax_id") and a["tax_id"] == b.get("tax_id"))
```

Apply vetoes first, then scorers. Hard match on stable unique identifiers (tax ID, DOI, ISBN, domain) always wins.

## Clustering

Once you have pairwise same-as edges with scores, cluster via connected components (or more carefully, correlation clustering):

```python
import networkx as nx

G = nx.Graph()
for a_id, b_id, score in pairs:
    if score >= 0.9:
        G.add_edge(a_id, b_id, weight=score)

clusters = list(nx.connected_components(G))
```

For noisy data, prefer Leiden or Louvain on weighted graphs — they avoid merging chains (`A~B`, `B~C`, `A≁C`) into one giant cluster.

## Canonicalization

```python
def canonical(cluster: list[dict]) -> dict:
    # Prefer record with most fields populated, then longest name, then earliest source
    best = sorted(cluster, key=lambda r: (
        -sum(1 for v in r.values() if v),
        -len(r.get("name", "")),
        r.get("first_seen", ""),
    ))[0]
    return {
        "canonical_id": f"ent_{hash(best['name_norm'])}",
        "canonical_name": best["name"],
        "aliases": sorted({r["name"] for r in cluster}),
        "source_ids": [r["id"] for r in cluster],
    }
```

## Graph-Based Resolution (post-KG)

If the KG already exists, same-as resolution collapses duplicate nodes:

```cypher
// Neo4j: merge two entity nodes and redirect all relationships
MATCH (keep:Entity {canonical_id: $keep}), (drop:Entity {canonical_id: $drop})
CALL apoc.refactor.mergeNodes([keep, drop], {properties: "combine", mergeRels: true})
YIELD node
RETURN node
```

Run merges inside a transaction per cluster so partial merges don't leave orphans.

## Canonical ID + Mapping Table

Maintain a stable mapping surviving re-runs:

```sql
CREATE TABLE entity_canonical (
    canonical_id  TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    type          TEXT NOT NULL,       -- Person | Org | Product | ...
    first_seen    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE entity_alias (
    alias_norm    TEXT NOT NULL,
    canonical_id  TEXT REFERENCES entity_canonical(canonical_id),
    source        TEXT,
    source_doc_id TEXT,
    score         REAL,
    PRIMARY KEY (alias_norm, source)
);
CREATE INDEX ON entity_alias (canonical_id);
```

New mention at ingest time: normalize, look up in `entity_alias`; on miss, run ER; insert the mapping so subsequent passes are O(1).

## Evaluation

Label a gold set of 500–2000 cluster decisions. Measure:

- Pairwise precision / recall.
- B-cubed F1 (cluster-level, avoids over-weighting big clusters).
- Cluster purity for coarse eyeballing.

Gate index re-cuts behind: B-cubed F1 ≥ previous − 1%.

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Exact-string match only | Normalize + fuzzy + embedding |
| Using global 1-to-1 LLM calls for every pair | Filter with cheap scorers; LLM only on borderline |
| Merging without `type` check | Always require matching entity type (never merge Person+Org) |
| Transitive over-merge chains | Use Leiden/Louvain instead of connected components |
| No stable canonical ID | Hash on normalized form + type; persist and reuse |
| Losing source provenance | Keep `source_doc_id` on every alias row |
| Re-running ER from scratch each ingest | Incremental: only resolve new aliases |

## Production Checklist

- [ ] Normalization rules versioned in config
- [ ] Blocking strategy chosen (prefix / phonetic / embedding cluster)
- [ ] Canonical ID + alias mapping table persisted and indexed
- [ ] Hard-veto (country/type) and hard-match (tax ID/DOI) rules wired
- [ ] LLM-assist only on borderline pairs, with batch API + cache
- [ ] HITL queue for low-confidence decisions
- [ ] Evaluation harness with B-cubed F1 + gate on regressions
- [ ] Merge operation safe (transactional, provenance preserved)
- [ ] Incremental ER on new ingests, not full recomputation
