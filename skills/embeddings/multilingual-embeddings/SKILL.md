---
name: multilingual-embeddings
description: |
  Multilingual and cross-lingual text embeddings. Covers multilingual-e5,
  LaBSE, BGE-M3, Cohere embed-multilingual-v3, OpenAI cross-lingual behavior,
  code-mixed text, tokenizer pitfalls, and language-specific retrieval quality.

  USE WHEN: user mentions "multilingual embeddings", "cross-lingual search",
  "non-English RAG", "Chinese/Japanese/Arabic retrieval", "LaBSE", "multilingual-e5",
  "code-mixed", "translated query"

  DO NOT USE FOR: English-only embedding choice - use `embedding-models`;
  fine-tuning on domain text - use `embedding-fine-tuning`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Multilingual Embeddings

## Model Landscape

| Model | Languages | Dims | Strengths | Weaknesses |
|---|---|---|---|---|
| multilingual-e5-large | 94 | 1024 | Strong retrieval, OSS, 512 tokens | Old tokenizer, short context |
| multilingual-e5-large-instruct | 94 | 1024 | Instruction-tuned, better zero-shot | Same 512 token cap |
| LaBSE | 109 | 768 | Sentence alignment, translation mining | Weak at short-query retrieval |
| BGE-M3 | 100+ | 1024 | Dense+sparse+colbert, 8192 tokens | Large, slower |
| cohere embed-multilingual-v3.0 | 100+ | 1024 | Managed API, query/doc modes | 512 tokens, closed |
| OpenAI text-embedding-3-large | de facto multilingual | 3072 | Strong on high-resource langs | Uneven on low-resource |
| jina-embeddings-v3 | 89 | 1024 MRL | Task LoRAs, 8192 tokens | Smaller community |

## Cross-Lingual Retrieval (query ≠ document language)

Scenario: Spanish query retrieves English documents.

```python
from sentence_transformers import SentenceTransformer

model = SentenceTransformer("intfloat/multilingual-e5-large")

docs_en = [
    "passage: The European Central Bank raised interest rates by 25 basis points.",
    "passage: Quantum computing uses qubits instead of classical bits.",
]
query_es = "query: ¿Cuánto subió las tasas de interés el BCE?"

doc_vecs = model.encode(docs_en, normalize_embeddings=True)
qry_vec  = model.encode([query_es], normalize_embeddings=True)[0]

import numpy as np
scores = doc_vecs @ qry_vec
print(scores.argmax())  # should be 0
```

## BGE-M3 multilingual + multi-functionality

BGE-M3 is currently the strongest open multilingual embedding when you want
dense + sparse + colbert from a single forward pass.

```python
from FlagEmbedding import BGEM3FlagModel

model = BGEM3FlagModel("BAAI/bge-m3", use_fp16=True)

queries = ["什么是量子计算？", "What is quantum computing?", "¿Qué es la computación cuántica?"]
docs = ["Quantum computing exploits superposition and entanglement to process information."]

q_out = model.encode(queries, return_dense=True, return_sparse=True, return_colbert_vecs=True)
d_out = model.encode(docs,    return_dense=True, return_sparse=True, return_colbert_vecs=True)

# Dense score
dense_scores = q_out["dense_vecs"] @ d_out["dense_vecs"].T

# Sparse (lexical) score
sparse_scores = model.compute_lexical_matching_score(
    q_out["lexical_weights"], d_out["lexical_weights"]
)

# ColBERT score
colbert_scores = [
    model.colbert_score(q_out["colbert_vecs"][i], d_out["colbert_vecs"][0])
    for i in range(len(queries))
]

# Weighted fusion (tune per corpus)
final = 0.4 * dense_scores + 0.2 * sparse_scores + 0.4 * colbert_scores
```

## Cohere embed-multilingual-v3

```python
import cohere

co = cohere.ClientV2()

docs_mixed = [
    "The Louvre is located in Paris.",
    "La Tour Eiffel a été construite en 1889.",
    "東京スカイツリーは634メートルです。",
]
doc_resp = co.embed(
    texts=docs_mixed,
    model="embed-multilingual-v3.0",
    input_type="search_document",
    embedding_types=["float"],
)
qry = co.embed(
    texts=["how tall is the Tokyo Skytree"],
    model="embed-multilingual-v3.0",
    input_type="search_query",
    embedding_types=["float"],
).embeddings.float[0]
```

## LaBSE (translation-mining, sentence alignment)

Use LaBSE when the task is parallel corpus mining or near-duplicate cross-lingual
sentence matching — not for QA retrieval where E5 / BGE-M3 outperform it.

```python
from sentence_transformers import SentenceTransformer

labse = SentenceTransformer("sentence-transformers/LaBSE")

en = labse.encode(["The cat sat on the mat."], normalize_embeddings=True)
fr = labse.encode(["Le chat était assis sur le tapis."], normalize_embeddings=True)
print((en @ fr.T).item())  # ~0.95 — high alignment
```

## Language-Specific Considerations

### Chinese / Japanese / Korean

- No whitespace tokenization → your chunker must NOT assume `split()` by space.
- Use character-based or native segmenters (jieba for Chinese, fugashi for Japanese, kiwipiepy for Korean).

```python
# Japanese chunking with fugashi
from fugashi import Tagger
tagger = Tagger()
tokens = [w.surface for w in tagger("東京は日本の首都です。")]
```

### Arabic / Hebrew

- Right-to-left. Normalize diacritics and alef variants.
- Use `unicodedata.normalize("NFKC", text)` before embedding.

```python
import unicodedata, re

def normalize_arabic(text: str) -> str:
    text = unicodedata.normalize("NFKC", text)
    text = re.sub(r"[\u064B-\u065F\u0670]", "", text)  # strip diacritics
    text = text.replace("أ", "ا").replace("إ", "ا").replace("آ", "ا")
    text = text.replace("ى", "ي").replace("ة", "ه")
    return text
```

### Low-resource languages

OpenAI and Cohere degrade noticeably on Swahili, Yoruba, Bengali, Tamil, etc.
BGE-M3 and multilingual-e5 generally win. Always run a small eval set in the
target language before committing.

## Code-Mixed Text (Hinglish, Spanglish, Singlish)

Code-mixed queries break most tokenizers. Strategies:

1. Keep text as-is; prefer BGE-M3 or multilingual-e5 (trained on web data with
   code-mixing).
2. Use a language-detection + per-language indexing pipeline if recall is critical.

```python
from lingua import LanguageDetectorBuilder, Language

detector = (
    LanguageDetectorBuilder
    .from_languages(Language.ENGLISH, Language.HINDI, Language.SPANISH)
    .build()
)
text = "Mujhe ek coffee chahiye"
lang = detector.detect_language_of(text)
# Route to language-specific index if desired
```

## Tokenizer Pitfalls

| Symptom | Cause | Fix |
|---|---|---|
| Recall drops only for non-English docs | BPE tokenizer explodes non-Latin scripts into many tokens | Check `len(tokenizer.encode(text))` — may exceed `max_tokens` silently |
| OpenAI embedding feels weak on Chinese | Single Chinese char = 2-3 BPE tokens; 512-token chunk = ~170 chars | Use shorter chunks for CJK |
| Arabic queries return wrong order | Diacritic mismatch between index and query | Normalize both sides identically |
| Emojis / URLs dominate similarity | Tokenizer treats them as high-weight tokens | Strip or normalize before encoding |

## Evaluation

Never trust MTEB averages for your specific language. Build a small labelled set
of (query, relevant-doc) pairs and measure MRR@10 / nDCG@10 per language.

```python
from sklearn.metrics import ndcg_score
import numpy as np

def evaluate_per_language(model, eval_pairs_by_lang):
    for lang, pairs in eval_pairs_by_lang.items():
        queries = [p["query"] for p in pairs]
        all_docs = list({d for p in pairs for d in p["candidates"]})
        q_vecs = model.encode([f"query: {q}" for q in queries], normalize_embeddings=True)
        d_vecs = model.encode([f"passage: {d}" for d in all_docs], normalize_embeddings=True)
        scores = q_vecs @ d_vecs.T
        true_rel = np.zeros_like(scores)
        for i, p in enumerate(pairs):
            for d in p["relevant"]:
                true_rel[i, all_docs.index(d)] = 1
        print(f"{lang}: nDCG@10 = {ndcg_score(true_rel, scores, k=10):.3f}")
```

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Using English-only model for multilingual corpus | Use BGE-M3, multilingual-e5, or Cohere embed-multilingual-v3 |
| Assuming OpenAI 3-large is "good enough" for all languages | Eval on low-resource languages; expect degradation |
| Same tokenizer for CJK and Latin chunks | Language-aware chunking; shorter chunks for CJK |
| Not normalizing Arabic/Hebrew before encoding | Apply NFKC + diacritic stripping consistently |
| Mixing LaBSE (alignment) with retrieval use case | Use E5 or BGE-M3 for QA retrieval |
| Single eval score across all languages | Report per-language MRR/nDCG |

## Production Checklist

- [ ] Per-language eval set (at least 50 queries each)
- [ ] Tokenizer token-count checked on representative non-English docs
- [ ] Script-specific normalization (Arabic diacritics, CJK width, etc.)
- [ ] Language detection for routing if mixed-corpus
- [ ] Chunk size adjusted for CJK (shorter) vs Latin
- [ ] Fallback translation pipeline if low-resource quality too low
- [ ] Monitor per-language recall in production logs
