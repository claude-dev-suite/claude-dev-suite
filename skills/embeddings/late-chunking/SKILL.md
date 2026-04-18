---
name: late-chunking
description: |
  Late chunking (Jina method): embed the full document with a long-context
  encoder, then mean-pool token embeddings per chunk. Preserves cross-chunk
  context lost by traditional chunk-then-embed pipelines.

  USE WHEN: user mentions "late chunking", "Jina late chunking", "long-context
  embeddings", "cross-chunk context", "mean pool token embeddings",
  "jina-embeddings-v3", "token-level pooling for retrieval"

  DO NOT USE FOR: choosing chunk sizes - use `chunking-strategies`; picking
  an embedder - use `embedding-models`; fine-tuning - use `embedding-fine-tuning`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Late Chunking

## The Problem with Naive Chunking

Traditional pipeline: split document into chunks first, embed each chunk independently.
Each chunk embedding sees only its own 200-400 tokens — pronouns, anaphora, and
shared terminology with earlier sections become invisible.

```
Document: "Acme Corp reported Q3 revenue of $42M...
          The company attributed growth to...
          Its subscription tier..."

Chunk 2: "The company attributed growth to..."
         ^^^ "the company" refers to Acme Corp — lost in isolation
```

A query like "Acme Corp revenue growth drivers" may match Chunk 1 but not Chunk 2,
even though Chunk 2 is the one answering the question.

## The Late Chunking Fix

1. Run the full document through a long-context encoder (8k, 32k, or 128k tokens)
   in a single forward pass so every token attends to every other token.
2. Record token-level embeddings and chunk token offsets.
3. Mean-pool the token embeddings inside each chunk span to produce chunk vectors.

Every chunk vector now encodes the entire document's context, not just its own span.

## Minimal Implementation with jina-embeddings-v3

`jina-embeddings-v3` supports 8192 tokens and exposes `encode_chunks` for this
workflow.

```python
from transformers import AutoModel, AutoTokenizer
import torch
import numpy as np

model_id = "jinaai/jina-embeddings-v3"
tok = AutoTokenizer.from_pretrained(model_id, trust_remote_code=True)
model = AutoModel.from_pretrained(model_id, trust_remote_code=True).eval()

def chunk_by_sentence(text: str, max_chars: int = 400):
    """Return (chunk_text, (start_char, end_char)) tuples."""
    import re
    sentences = re.split(r"(?<=[.!?])\s+", text)
    chunks, buf, start = [], "", 0
    pos = 0
    for s in sentences:
        if len(buf) + len(s) > max_chars and buf:
            chunks.append((buf.strip(), (start, pos)))
            buf, start = s + " ", pos
        else:
            buf += s + " "
        pos += len(s) + 1
    if buf.strip():
        chunks.append((buf.strip(), (start, pos)))
    return chunks

def char_to_token_spans(text: str, char_spans):
    enc = tok(text, return_offsets_mapping=True, add_special_tokens=True,
              truncation=True, max_length=8192)
    offsets = enc["offset_mapping"]
    token_spans = []
    for c_start, c_end in char_spans:
        t_start = next((i for i, (a, b) in enumerate(offsets) if a >= c_start and b > 0), None)
        t_end   = next((i for i, (a, b) in enumerate(offsets) if b >= c_end and b > 0), None)
        if t_start is not None and t_end is not None:
            token_spans.append((t_start, t_end + 1))
    return enc, token_spans

@torch.inference_mode()
def late_chunk_embed(text: str):
    chunks = chunk_by_sentence(text)
    chunk_texts = [c[0] for c in chunks]
    char_spans  = [c[1] for c in chunks]

    enc, token_spans = char_to_token_spans(text, char_spans)
    input_ids = torch.tensor([enc["input_ids"]])
    attn      = torch.tensor([enc["attention_mask"]])

    out = model(input_ids=input_ids, attention_mask=attn, task_id="retrieval.passage")
    token_embs = out.last_hidden_state[0]  # (T, D)

    vectors = []
    for (ts, te) in token_spans:
        pooled = token_embs[ts:te].mean(dim=0)
        pooled = torch.nn.functional.normalize(pooled, dim=-1)
        vectors.append(pooled.cpu().numpy())
    return chunk_texts, np.vstack(vectors)
```

## Comparison: Naive vs Late Chunking

```python
from sentence_transformers import SentenceTransformer

naive_model = SentenceTransformer("jinaai/jina-embeddings-v3", trust_remote_code=True)

def naive_chunk_embed(text: str):
    chunks = [c[0] for c in chunk_by_sentence(text)]
    vecs = naive_model.encode(chunks, normalize_embeddings=True,
                              prompt_name="retrieval.passage")
    return chunks, vecs

def cos(a, b):
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))

query_model = SentenceTransformer("jinaai/jina-embeddings-v3", trust_remote_code=True)
q = query_model.encode("Acme revenue growth drivers", prompt_name="retrieval.query",
                       normalize_embeddings=True)

doc = open("acme_10q.txt").read()
_, naive_vecs = naive_chunk_embed(doc)
_, late_vecs  = late_chunk_embed(doc)

print("naive top-1:", max(cos(q, v) for v in naive_vecs))
print("late  top-1:", max(cos(q, v) for v in late_vecs))
```

## Reported Benchmarks (Jina, 2024)

On BeIR subsets with ~8k-token documents, late chunking improves nDCG@10 by
3-8% over naive chunking using the same encoder. Biggest lift on:

- Scientific papers (SciFact, NFCorpus) — heavy cross-reference.
- Legal documents — anaphoric references to parties defined once.
- Customer support transcripts — pronoun-heavy dialogue.

No lift (or slight regression) on FAQ-like corpora where chunks are already
self-contained.

## Chunk Size Considerations

| Chunk size | Effect with late chunking |
|---|---|
| 64-128 tokens | Small chunks benefit MOST — naive loses most context |
| 256-512 tokens | Moderate lift; good default |
| 1024+ tokens | Late chunking still helps but gap narrows |
| Full document | No chunking needed; just embed once |

## When Late Chunking Won't Help

- Your encoder's max context is the same as your chunk size (nothing to gain).
- Documents are already semantically independent (FAQ, product catalog entries).
- You use a cross-encoder reranker on raw text (reranker sees full context anyway).

## Storage and Latency

Storage unchanged — you still store one vector per chunk.
Latency shifts from many small forwards to one large forward; on GPU this is
usually faster due to better hardware utilization. Downside: you cannot
parallelize across a cluster by sharding chunks.

## Combining with Other Techniques

- Works with hybrid search (BM25 + late-chunked dense).
- Compatible with reranking — use late-chunked vectors for recall stage.
- Can be combined with Matryoshka truncation for storage savings.
- Does NOT combine cleanly with ColBERT (ColBERT already late-interacts at
  token level).

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Using a 512-token encoder and calling it late chunking | Needs genuine long-context encoder (8k+) |
| Mean-pooling over special tokens ([CLS], [SEP]) | Strip them before pooling |
| Inconsistent chunk boundaries between index and query time | Fix chunker; store chunk spans alongside vectors |
| Expecting help on already-self-contained chunks | Measure first on domain eval set |
| Mixing late-chunked and naive-chunked vectors in one index | Recompute entire index when switching |

## Production Checklist

- [ ] Encoder max context >= longest expected document
- [ ] Document truncation policy defined for docs beyond context
- [ ] Chunk token offsets validated against tokenizer output (off-by-one-prone)
- [ ] nDCG@10 measured on domain eval set vs naive baseline
- [ ] Per-chunk vectors stored with document id + token span metadata
- [ ] GPU memory profile checked for longest documents
- [ ] Re-index path documented (model or chunker changes require full rebuild)
