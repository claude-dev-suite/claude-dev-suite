---
name: bm25-tuning
description: |
  BM25 deep tuning. k1 and b parameters with defaults per collection, field boosts,
  stopwords, language-specific analyzers (Italian, French, German, non-English),
  stemming vs lemmatization, tokenization gotchas, Elasticsearch vs Lucene vs
  rank_bm25. When BM25 alone beats vectors.

  USE WHEN: user mentions "BM25", "BM25 tuning", "k1 b parameter", "Elasticsearch
  analyzer", "stemming", "lemmatization", "rank_bm25", "TF-IDF", "lexical search"

  DO NOT USE FOR: learned sparse - use `retrieval/splade-deep`; hybrid fusion - use
  `rag/hybrid-search`; dense retrieval - use `vector-stores/*`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# BM25 Tuning

## The Formula

```
score(q, d) = sum over q_terms t of
    IDF(t) * ( f(t, d) * (k1 + 1) ) / ( f(t, d) + k1 * (1 - b + b * |d| / avgdl) )
```

- `f(t, d)`: term frequency in document d
- `|d|`: document length in tokens
- `avgdl`: average document length across the corpus
- `k1`: term-frequency saturation (how fast extra occurrences stop helping)
- `b`: length normalization (how much longer documents are penalized)
- `IDF(t)`: inverse document frequency of t

## k1 and b Defaults

| Collection type | k1 | b | Why |
|---|---|---|---|
| Lucene default | 1.2 | 0.75 | Safe general-purpose |
| Short homogeneous docs (titles, tweets) | 1.0-1.2 | 0.3-0.5 | Length already similar; less penalization |
| Long heterogeneous docs (web, manuals) | 1.2-1.5 | 0.75-0.85 | Long docs over-reward frequent terms otherwise |
| Code / logs with rare tokens | 1.5-2.0 | 0.5-0.75 | k1 high so repeated identifiers still accumulate |
| Q&A short passages | 0.8-1.2 | 0.4-0.6 | Passages are near-uniform length |

Tune in a sweep: grid k1 in {0.8, 1.0, 1.2, 1.5, 2.0}, b in {0.3, 0.5, 0.75, 0.9}. Measure NDCG@10 or recall@20 on a gold set.

## Elasticsearch Similarity Config

```json
PUT /docs
{
  "settings": {
    "index": {
      "similarity": {
        "bm25_long": {
          "type": "BM25",
          "k1": 1.5,
          "b": 0.85
        }
      },
      "analysis": {
        "analyzer": {
          "en_custom": {
            "type": "custom",
            "tokenizer": "standard",
            "filter": ["lowercase", "asciifolding", "english_stop", "english_stemmer"]
          }
        },
        "filter": {
          "english_stop": {"type": "stop", "stopwords": "_english_"},
          "english_stemmer": {"type": "stemmer", "language": "light_english"}
        }
      }
    }
  },
  "mappings": {
    "properties": {
      "title": {"type": "text", "analyzer": "en_custom", "boost": 3.0,
                "similarity": "bm25_long"},
      "body":  {"type": "text", "analyzer": "en_custom",
                "similarity": "bm25_long"}
    }
  }
}
```

## Field Boosts

Boost title over body, headings over paragraphs:

```json
{
  "query": {
    "multi_match": {
      "query": "oauth token refresh 403",
      "type": "best_fields",
      "fields": ["title^3", "headings^2", "body^1"],
      "tie_breaker": 0.3
    }
  }
}
```

`best_fields` returns the highest single field score; `most_fields` sums. `tie_breaker` blends the two. For question-answer ranking, `cross_fields` with a shared analyzer usually beats `best_fields`.

## Language-Specific Analyzers

Non-English corpora fail silently with the default analyzer. Always pick a language-specific one.

### Italian

```json
"it_custom": {
  "type": "custom",
  "tokenizer": "standard",
  "filter": [
    "lowercase",
    "asciifolding",
    "italian_elision",
    "italian_stop",
    "italian_stemmer"
  ]
},
"filter": {
  "italian_elision": {
    "type": "elision",
    "articles_case": true,
    "articles": ["c", "l", "all", "dall", "dell", "nell", "sull", "coll", "pell",
                 "gl", "agl", "dagl", "degl", "negl", "sugl", "un", "m", "t", "s",
                 "v", "d"]
  },
  "italian_stop": {"type": "stop", "stopwords": "_italian_"},
  "italian_stemmer": {"type": "stemmer", "language": "light_italian"}
}
```

Italian needs elision handling (`l'amore` -> `amore`), otherwise queries for "amore" miss documents with the apostrophe form.

### French

```json
"fr_custom": {
  "type": "custom",
  "tokenizer": "standard",
  "filter": [
    "lowercase",
    "asciifolding",
    "french_elision",
    "french_stop",
    "french_stemmer"
  ]
},
"filter": {
  "french_elision": {
    "type": "elision",
    "articles_case": true,
    "articles": ["l", "m", "t", "qu", "n", "s", "j", "d", "c", "jusqu",
                 "quoiqu", "lorsqu", "puisqu"]
  },
  "french_stop": {"type": "stop", "stopwords": "_french_"},
  "french_stemmer": {"type": "stemmer", "language": "light_french"}
}
```

Use `light_french` over `french`; aggressive stemming conflates unrelated roots.

### German

```json
"de_custom": {
  "type": "custom",
  "tokenizer": "standard",
  "filter": [
    "lowercase",
    "german_normalization",
    "german_stop",
    "german_stemmer"
  ]
},
"filter": {
  "german_stop": {"type": "stop", "stopwords": "_german_"},
  "german_stemmer": {"type": "stemmer", "language": "light_german"}
}
```

German compounds (`Bundesausbildungsförderungsgesetz`) need `decompound_token_filter` via an external dictionary — plain stemmers do not split them. Consider `hyphenation_decompounder` with the OpenOffice hyphenation files.

## Stemming vs Lemmatization

| Aspect | Stemming | Lemmatization |
|---|---|---|
| Approach | Strip suffixes by rules | Reduce to dictionary lemma |
| Tool | Snowball / Porter / Lovins | spaCy, Stanza |
| Speed | Microseconds | Milliseconds |
| Accuracy | Crude (runner/running -> run, but also universe/university -> univers) | Correct (better -> good) |
| Storage | Same vocab | Same vocab |
| Production default | Elasticsearch `light_*` stemmers | Only when stem conflation hurts recall |

Most BM25 pipelines stick with stemmers. Lemmatize when you have strong morphology (Finnish, Turkish, Russian) and precision matters.

## Stopword Handling

Default stopword lists remove `the`, `a`, `of`, etc. Two gotchas:

1. Query like "to be or not to be" becomes empty after stopword removal. Use `stop` filter with `remove_trailing=false` or skip stopwords on short queries.
2. Domain-specific words may act as stopwords (`system`, `user` in a software manual). Measure IDF, remove terms with IDF below a threshold as a custom stop set.

```json
"custom_stop": {
  "type": "stop",
  "stopwords": ["system", "user", "module", "click"]
}
```

## Tokenization Gotchas

- `standard` tokenizer splits on Unicode word boundaries — it breaks `error_code_403` into `error`, `code`, `403`. Use `whitespace` tokenizer + `word_delimiter_graph` when identifiers matter.
- URLs / emails: use `uax_url_email` tokenizer if they are keys to your queries.
- Camel-case code tokens: add `word_delimiter_graph` with `generate_word_parts=true`.
- Numbers: BM25 treats `403` and `404` as equally distant from `Forbidden`. Keep them as tokens; rely on exact-term ranking via `constant_score` clauses for known IDs.

```json
"code_analyzer": {
  "type": "custom",
  "tokenizer": "whitespace",
  "filter": [
    "lowercase",
    {
      "type": "word_delimiter_graph",
      "preserve_original": true,
      "split_on_numerics": false,
      "catenate_words": true
    }
  ]
}
```

## Python: rank_bm25 for Prototyping

```python
# pip install rank_bm25 nltk
from rank_bm25 import BM25Okapi, BM25Plus, BM25L
import re

def tokenize(text: str) -> list[str]:
    return re.findall(r"\w+", text.lower())

docs = ["OAuth 2.0 uses refresh tokens.", "PKCE protects public clients.", ...]
tokenized = [tokenize(d) for d in docs]

bm = BM25Okapi(tokenized, k1=1.2, b=0.75)
scores = bm.get_scores(tokenize("token refresh"))
top = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)[:10]
```

`BM25Plus` (2014 variant) slightly helps on short documents; `BM25L` helps on long ones. All three accept `k1` and `b`.

## Lucene vs Elasticsearch vs rank_bm25

| Engine | Best for | Downsides |
|---|---|---|
| Elasticsearch / OpenSearch | Production, scale, rich analyzers | Cluster ops overhead |
| Tantivy (Rust) / Meilisearch | Single-node high-performance | Smaller analyzer ecosystem |
| Lucene direct (Java) | Embedded JVM apps | Write your own analyzer plumbing |
| rank_bm25 (Python) | Research, tests, single-host | No analyzer pipeline; bring your own |
| Whoosh | Pure Python, offline | Slow and unmaintained |
| Pyserini | BEIR reproduction, anserini-style | Heavy deps |

## When BM25 Alone Beats Vectors

- Legal, medical, financial — exact-term matching on codes / names dominates.
- Short queries with rare identifiers (error codes, SKUs, version numbers).
- Small corpora (< 5k documents) where training a domain embedding is impractical.
- Languages with weak pretrained embeddings (Welsh, Basque, Amharic).
- Freshness-critical content: BM25 indexes update in milliseconds; embeddings need recompute.

## Tuning Playbook

```python
from itertools import product

def grid_search_bm25(eval_set, tokenized_docs, k1_grid, b_grid, k=10):
    best = None
    for k1, b in product(k1_grid, b_grid):
        bm = BM25Okapi(tokenized_docs, k1=k1, b=b)
        recall = []
        for q, relevant in eval_set:
            scores = bm.get_scores(tokenize(q))
            top = {i for i in sorted(range(len(scores)),
                                     key=lambda i: scores[i], reverse=True)[:k]}
            recall.append(len(top & set(relevant)) / max(len(relevant), 1))
        score = sum(recall) / len(recall)
        if best is None or score > best[0]:
            best = (score, k1, b)
    return best

# usage
_, k1, b = grid_search_bm25(gold, tokenized, [0.8,1.0,1.2,1.5,2.0], [0.3,0.5,0.75,0.9])
```

Run the sweep after any major corpus change (doc length distribution shift).

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Default `standard` analyzer for non-English | Use language-specific analyzer and stemmer |
| Leaving k1=1.2, b=0.75 forever | Sweep on your gold set; expect 5-15% recall lift |
| Removing stopwords from short queries | Skip stop filter on queries with <= 3 tokens |
| `match` query on a non-analyzed `keyword` field | Use a `text` field or mix `text` + `keyword` multi-fields |
| Boosting title field only, ignoring headings | Index headings separately with their own analyzer |
| Recomputing IDF per request | Persist the index; IDF is precomputed |
| Ignoring document-length distribution | Long tail skew needs higher `b`; measure avgdl |
| Using English stemmer on Italian content | Stemmer must match language; detect if mixed-language corpus |

## Production Checklist

- [ ] Language-appropriate analyzer per field
- [ ] `k1` and `b` tuned on a held-out gold set
- [ ] Field boosts set per document structure
- [ ] Stopwords list reviewed (general + domain-specific)
- [ ] Tokenization verified on a sample of edge-case queries (codes, URLs, camelCase)
- [ ] Index refresh interval tuned for the freshness SLA
- [ ] Synonyms file maintained (domain terms, acronyms)
- [ ] Query latency p95 monitored
- [ ] Periodic recall@k measured against gold set
- [ ] Upgrade path documented for Lucene / Elasticsearch version bumps
