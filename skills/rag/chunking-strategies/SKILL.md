---
name: chunking-strategies
description: |
  Document chunking techniques for RAG. Fixed-size, recursive, semantic, token-based,
  document-aware, proposition, parent-child, sliding window, and Anthropic contextual
  retrieval. Tradeoff tables, LangChain and LlamaIndex code.

  USE WHEN: user mentions "chunking", "text splitter", "split documents", "semantic
  chunking", "contextual retrieval", "parent-child chunks", "proposition chunking"

  DO NOT USE FOR: retrieval after chunking - use `advanced-retrieval`;
  query-side transforms - use `query-transformations`; overall design - use `rag-architecture`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Chunking Strategies

## Strategy Tradeoff Matrix

| Strategy | Preserves Semantics | Cost | Best For | Chunk Unit |
|---|---|---|---|---|
| Fixed-size | No | Free | Homogeneous prose | Chars |
| Recursive character | Partial | Free | General text | Chars with hierarchy |
| Token-based | No | Free | Exact token budgeting | Tokens |
| Document-aware (Markdown/HTML) | Yes | Free | Technical docs, wikis | Headers/sections |
| Code-aware | Yes | Free | Source code | Functions/classes |
| Semantic (embedding breakpoints) | Yes | $$ | Long narrative, research papers | Meaning shifts |
| Proposition-based | Yes | $$$ | High-precision Q&A, legal | Atomic facts |
| Parent-child | Yes | Free | Need small match + big context | Hierarchy |
| Sliding window | Partial | Free | Dialogues, timelines | Overlap + stride |
| Contextual retrieval (Anthropic) | Yes | $$ | Production RAG > 5k chunks | Chunk + LLM context |

## Fixed-Size

```python
def fixed_chunks(text: str, size: int = 800, overlap: int = 200) -> list[str]:
    return [text[i:i + size] for i in range(0, len(text), size - overlap)]
```

Use only as a baseline. Breaks mid-sentence and mid-token.

## Recursive Character (default for most projects)

```python
from langchain_text_splitters import RecursiveCharacterTextSplitter

splitter = RecursiveCharacterTextSplitter(
    chunk_size=800,
    chunk_overlap=200,
    separators=["\n\n", "\n", ". ", "? ", "! ", " ", ""],
    length_function=len,
    is_separator_regex=False,
)
chunks = splitter.split_documents(docs)
```

Tries separators in order so paragraph boundaries are preferred over arbitrary cuts.

## Token-Based (exact LLM budgeting)

```python
from langchain_text_splitters import TokenTextSplitter

splitter = TokenTextSplitter(
    encoding_name="cl100k_base",  # GPT-4, text-embedding-3
    chunk_size=512,
    chunk_overlap=64,
)
chunks = splitter.split_text(text)
```

For Claude, use `anthropic.Anthropic().messages.count_tokens` to measure; approximate ratio is ~3.5 chars per token for English.

## Document-Aware: Markdown

```python
from langchain_text_splitters import MarkdownHeaderTextSplitter, RecursiveCharacterTextSplitter

headers = [("#", "h1"), ("##", "h2"), ("###", "h3")]
md_splitter = MarkdownHeaderTextSplitter(headers_to_split_on=headers, strip_headers=False)
header_chunks = md_splitter.split_text(markdown_text)

# Secondary splitter for oversized sections
char_splitter = RecursiveCharacterTextSplitter(chunk_size=800, chunk_overlap=150)
chunks = char_splitter.split_documents(header_chunks)  # metadata carries h1/h2/h3
```

Header metadata enables section-level filtering at query time.

## Document-Aware: Code

```python
from langchain_text_splitters import RecursiveCharacterTextSplitter, Language

py_splitter = RecursiveCharacterTextSplitter.from_language(
    language=Language.PYTHON, chunk_size=1500, chunk_overlap=200
)
ts_splitter = RecursiveCharacterTextSplitter.from_language(
    language=Language.TS, chunk_size=1500, chunk_overlap=200
)
```

Splits on `class`, `def`, `function` boundaries. Larger chunks because code lines are shorter than prose.

## Semantic Chunking (embedding breakpoints)

Splits where adjacent sentences diverge in meaning. Expensive (embeds every sentence) but yields coherent chunks on long-form content.

```python
from langchain_experimental.text_splitter import SemanticChunker
from langchain_openai import OpenAIEmbeddings

splitter = SemanticChunker(
    OpenAIEmbeddings(model="text-embedding-3-small"),
    breakpoint_threshold_type="percentile",   # or "standard_deviation", "interquartile"
    breakpoint_threshold_amount=95,
    buffer_size=1,
)
chunks = splitter.create_documents([long_text])
```

Manual variant for fine control (break where cosine distance between adjacent sentence embeddings exceeds the 95th percentile):

```python
import numpy as np
from sentence_transformers import SentenceTransformer

def semantic_chunks(text: str, pct: float = 95) -> list[str]:
    sents = [s.strip() for s in text.split(". ") if s.strip()]
    embs = SentenceTransformer("all-MiniLM-L6-v2").encode(sents)
    sims = [np.dot(embs[i], embs[i+1]) / (np.linalg.norm(embs[i]) * np.linalg.norm(embs[i+1]))
            for i in range(len(sents) - 1)]
    dists = 1 - np.array(sims)
    breaks = [i + 1 for i, d in enumerate(dists) if d > np.percentile(dists, pct)]
    out, start = [], 0
    for b in breaks + [len(sents)]:
        out.append(". ".join(sents[start:b])); start = b
    return out
```

## Proposition-Based Chunking

Decompose text into atomic factual propositions using an LLM. Each proposition becomes one chunk.

```python
from anthropic import Anthropic
import json

client = Anthropic()

PROMPT = """Decompose the passage into atomic propositions. Each proposition:
- Expresses exactly one fact
- Is self-contained (no pronouns without antecedents)
- Resolves coreferences inline

Return JSON array of strings. Passage:
{passage}"""

def propositionize(passage: str) -> list[str]:
    msg = client.messages.create(
        model="claude-sonnet-4-5-20250929",
        max_tokens=2048,
        messages=[{"role": "user", "content": PROMPT.format(passage=passage)}],
    )
    return json.loads(msg.content[0].text)
```

Highest retrieval precision; highest ingestion cost. Use for legal, medical, compliance.

## Parent-Child Chunking

Index small chunks (for precise retrieval) but return parent chunks (for context).

```python
from langchain.retrievers import ParentDocumentRetriever
from langchain.storage import InMemoryStore
from langchain_chroma import Chroma
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_openai import OpenAIEmbeddings

parent_splitter = RecursiveCharacterTextSplitter(chunk_size=2000)
child_splitter = RecursiveCharacterTextSplitter(chunk_size=400)
vectorstore = Chroma(collection_name="children", embedding_function=OpenAIEmbeddings())
docstore = InMemoryStore()

retriever = ParentDocumentRetriever(
    vectorstore=vectorstore,
    docstore=docstore,
    child_splitter=child_splitter,
    parent_splitter=parent_splitter,
)
retriever.add_documents(docs)
```

See also `advanced-retrieval` for multi-vector and sentence-window patterns that generalize this idea.

## Sliding Window with Stride

```python
def sliding_window(tokens: list[str], window: int = 512, stride: int = 256) -> list[list[str]]:
    return [tokens[i:i + window] for i in range(0, len(tokens), stride) if i + window <= len(tokens)]
```

Use for dialogue, legal contracts, timelines where context before and after each point matters.

## Anthropic Contextual Retrieval

Prepend LLM-generated context to each chunk before embedding. Reduces retrieval failure rate by ~35% on Anthropic's benchmark.

```python
from anthropic import Anthropic

client = Anthropic()

CONTEXT_PROMPT = """<document>
{whole_document}
</document>

Here is the chunk we want to situate within the whole document:
<chunk>
{chunk}
</chunk>

Give a short (1-2 sentence) context to situate this chunk within the overall
document for the purposes of improving search retrieval of the chunk.
Answer only with the succinct context and nothing else."""

def contextualize(whole_doc: str, chunk: str) -> str:
    msg = client.messages.create(
        model="claude-haiku-4-5-20250929",
        max_tokens=200,
        messages=[{"role": "user", "content": CONTEXT_PROMPT.format(
            whole_document=whole_doc, chunk=chunk)}],
        extra_headers={"anthropic-beta": "prompt-caching-2024-07-31"},
    )
    return msg.content[0].text

def contextual_chunks(doc: str, base_chunks: list[str]) -> list[str]:
    return [f"{contextualize(doc, c)}\n\n{c}" for c in base_chunks]
```

Use prompt caching on `whole_document` to drop cost by ~10x. Combine with BM25 + dense for best results.

## LlamaIndex Equivalents

```python
from llama_index.core.node_parser import (
    SentenceSplitter, SemanticSplitterNodeParser, MarkdownNodeParser,
    HierarchicalNodeParser,
)
from llama_index.embeddings.openai import OpenAIEmbedding

sentence = SentenceSplitter(chunk_size=512, chunk_overlap=64)
semantic = SemanticSplitterNodeParser(
    buffer_size=1, breakpoint_percentile_threshold=95, embed_model=OpenAIEmbedding()
)
markdown = MarkdownNodeParser()
hierarchical = HierarchicalNodeParser.from_defaults(chunk_sizes=[2048, 512, 128])
```

## Sizing Heuristics by Content Type

| Content | Chunk Size | Overlap | Splitter |
|---|---|---|---|
| Blog posts / articles | 800 chars | 150 | Recursive character |
| Technical docs (markdown) | 1000 chars | 200 | Markdown headers |
| Source code | 1500 chars | 200 | Language-aware |
| Legal / contracts | 400 chars | 100 | Proposition or sliding |
| Research papers | Variable | N/A | Semantic |
| Customer support tickets | 300 chars | 50 | Per-turn |
| Book / long narrative | 1500 chars | 300 | Semantic + parent-child |

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| One chunk size for all content types | Split pipeline per content type |
| Overlap = 0 | Always overlap 10-25% to preserve boundary context |
| Splitting code by character count | Use `Language.*` language-aware splitters |
| Stripping headers before chunking | Keep or re-prepend headers for retrieval signal |
| Chunks larger than embedding model context | Measure: `text-embedding-3-*` max 8191 tokens |
| No metadata on chunks | Attach `source`, `section`, `chunk_index`, `parent_id` |
| Re-embedding whole corpus on tweak | Incremental pipeline keyed by content hash |
| Semantic chunking on short docs | Not worth the cost below ~10 pages |

## Production Checklist

- [ ] Content-type detection routes to the right splitter
- [ ] Chunk size tuned with a retrieval eval set (`rag-evaluation`)
- [ ] Metadata stamped on every chunk (source, section, position, hash)
- [ ] Chunk hash stored for idempotent re-ingestion
- [ ] Token counts measured against embedding model limit
- [ ] Overlap configured (default 20%)
- [ ] Parent-child or multi-vector used when context window matters
- [ ] Contextual retrieval considered for corpora > 5k chunks
- [ ] Ingestion pipeline monitored (chunks/sec, embedding cost/doc)
- [ ] Re-chunking pathway documented (rolling re-index)
