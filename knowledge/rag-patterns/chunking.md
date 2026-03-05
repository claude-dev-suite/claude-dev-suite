# RAG Chunking Strategies

## Overview

Chunking is the process of splitting documents into smaller pieces for embedding and retrieval. It is the single most impactful decision in a RAG pipeline — poor chunking produces irrelevant retrievals regardless of how good your embedding model or vector database is. The goal is to create chunks that are semantically coherent, appropriately sized for the embedding model's context window, and retain enough metadata to be useful during generation.

This document covers the major chunking strategies, size optimization, overlap mechanics, metadata preservation, and implementations in LangChain and LlamaIndex.

---

## Strategy 1: Fixed-Size Chunking

Split text into chunks of a fixed number of characters or tokens. Simple but often produces chunks that break mid-sentence or mid-concept.

### Python (LangChain)

```python
from langchain.text_splitter import CharacterTextSplitter

splitter = CharacterTextSplitter(
    separator="\n\n",      # Split on paragraph boundaries first
    chunk_size=1000,        # Max characters per chunk
    chunk_overlap=200,      # Overlap between consecutive chunks
    length_function=len,
)

chunks = splitter.split_text(document_text)
```

### TypeScript (LangChain.js)

```typescript
import { CharacterTextSplitter } from 'langchain/text_splitter';

const splitter = new CharacterTextSplitter({
  separator: '\n\n',
  chunkSize: 1000,
  chunkOverlap: 200,
});

const chunks = await splitter.splitText(documentText);
```

**When to use:** Unstructured text where no better strategy applies, or as a baseline to compare against.

---

## Strategy 2: Recursive Character Splitting

Tries a hierarchy of separators (`\n\n`, `\n`, ` `, `""`) and falls back to smaller separators when chunks exceed the target size. This is the default recommendation for most use cases.

### Python

```python
from langchain.text_splitter import RecursiveCharacterTextSplitter

splitter = RecursiveCharacterTextSplitter(
    chunk_size=1000,
    chunk_overlap=200,
    separators=["\n\n", "\n", ". ", " ", ""],
    length_function=len,
)

# Split documents (preserves metadata)
from langchain.schema import Document
docs = [Document(page_content=text, metadata={"source": "api-docs.md"})]
chunks = splitter.split_documents(docs)
```

### TypeScript

```typescript
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 200,
  separators: ['\n\n', '\n', '. ', ' ', ''],
});

const chunks = await splitter.splitDocuments(documents);
```

**When to use:** General-purpose text, articles, documentation. This is the best default.

---

## Strategy 3: Semantic Chunking

Groups sentences into chunks based on embedding similarity. Adjacent sentences with similar embeddings are merged into the same chunk; a drop in similarity triggers a chunk boundary.

### Python

```python
from langchain_experimental.text_splitter import SemanticChunker
from langchain_openai import OpenAIEmbeddings

embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

splitter = SemanticChunker(
    embeddings=embeddings,
    breakpoint_threshold_type="percentile",  # or "standard_deviation", "interquartile"
    breakpoint_threshold_amount=95,           # percentile threshold for splitting
)

chunks = splitter.split_text(document_text)
```

### Custom Implementation (TypeScript)

```typescript
import { cosineSimilarity } from './utils';

interface SemanticChunk {
  text: string;
  sentences: string[];
}

async function semanticChunk(
  text: string,
  embedFn: (texts: string[]) => Promise<number[][]>,
  threshold: number = 0.75
): Promise<SemanticChunk[]> {
  // Split into sentences
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];

  // Embed all sentences
  const embeddings = await embedFn(sentences);

  // Group by similarity
  const chunks: SemanticChunk[] = [];
  let currentChunk: string[] = [sentences[0]];

  for (let i = 1; i < sentences.length; i++) {
    const similarity = cosineSimilarity(embeddings[i - 1], embeddings[i]);

    if (similarity >= threshold) {
      currentChunk.push(sentences[i]);
    } else {
      chunks.push({
        text: currentChunk.join(' '),
        sentences: [...currentChunk],
      });
      currentChunk = [sentences[i]];
    }
  }

  if (currentChunk.length > 0) {
    chunks.push({ text: currentChunk.join(' '), sentences: currentChunk });
  }

  return chunks;
}
```

**When to use:** Documents where topic shifts are frequent and not aligned with structural boundaries (e.g., transcripts, long-form essays).

**Trade-off:** Requires an embedding call during chunking (cost and latency), and chunk sizes vary unpredictably.

---

## Strategy 4: Document-Structure-Aware Chunking

Leverages document structure (headings, sections, code blocks) to create semantically meaningful boundaries.

### Markdown Splitting (LangChain)

```python
from langchain.text_splitter import MarkdownHeaderTextSplitter

headers_to_split_on = [
    ("#", "h1"),
    ("##", "h2"),
    ("###", "h3"),
]

splitter = MarkdownHeaderTextSplitter(headers_to_split_on=headers_to_split_on)
chunks = splitter.split_text(markdown_text)

# Each chunk has metadata like {"h1": "API Reference", "h2": "Authentication"}

# Chain with recursive splitting for long sections
from langchain.text_splitter import RecursiveCharacterTextSplitter
recursive_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
final_chunks = recursive_splitter.split_documents(chunks)
```

### Code Splitting

```python
from langchain.text_splitter import RecursiveCharacterTextSplitter, Language

python_splitter = RecursiveCharacterTextSplitter.from_language(
    language=Language.PYTHON,
    chunk_size=2000,
    chunk_overlap=200,
)

ts_splitter = RecursiveCharacterTextSplitter.from_language(
    language=Language.JS,  # Works for TypeScript too
    chunk_size=2000,
    chunk_overlap=200,
)

chunks = python_splitter.split_text(python_code)
```

### LlamaIndex Node Parsers

```python
from llama_index.core.node_parser import (
    SentenceSplitter,
    MarkdownNodeParser,
    CodeSplitter,
    HierarchicalNodeParser,
)

# Sentence-aware splitting (default recommendation)
parser = SentenceSplitter(
    chunk_size=1024,
    chunk_overlap=128,
    paragraph_separator="\n\n",
)
nodes = parser.get_nodes_from_documents(documents)

# Markdown-aware splitting
md_parser = MarkdownNodeParser()
nodes = md_parser.get_nodes_from_documents(documents)

# Hierarchical: creates parent-child node relationships
hierarchical_parser = HierarchicalNodeParser.from_defaults(
    chunk_sizes=[2048, 512, 128],  # Large -> medium -> small
)
nodes = hierarchical_parser.get_nodes_from_documents(documents)
```

---

## Chunk Size Optimization

### Guidelines by Use Case

| Use Case | Chunk Size | Overlap | Rationale |
|----------|-----------|---------|-----------|
| Q&A over documentation | 500-1000 chars | 100-200 | Focused answers need precise chunks |
| Summarization | 2000-4000 chars | 200-500 | Summaries need broader context |
| Code search | 1000-2000 chars | 200-300 | Function-level granularity |
| Legal/compliance | 500-800 chars | 150-200 | Precise clause-level retrieval |
| Chat with PDFs | 800-1200 chars | 150-250 | Balance between precision and context |

### Token-Based Sizing

```python
from langchain.text_splitter import RecursiveCharacterTextSplitter
import tiktoken

tokenizer = tiktoken.encoding_for_model("gpt-4")

def token_length(text: str) -> int:
    return len(tokenizer.encode(text))

splitter = RecursiveCharacterTextSplitter(
    chunk_size=512,          # In tokens, not characters
    chunk_overlap=50,
    length_function=token_length,
)
```

### Empirical Optimization

```python
from ragas.metrics import context_precision, context_recall
from ragas import evaluate

# Test multiple chunk sizes
for chunk_size in [256, 512, 1024, 2048]:
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_size // 5,
    )
    chunks = splitter.split_documents(docs)
    # Build index, run eval dataset
    result = evaluate(eval_dataset, metrics=[context_precision, context_recall])
    print(f"chunk_size={chunk_size}: precision={result['context_precision']:.3f} recall={result['context_recall']:.3f}")
```

---

## Overlap Strategies

Overlap prevents information loss at chunk boundaries. A query might match content that spans two chunks — overlap ensures the critical sentence appears in both.

### Rules of Thumb

- **10-20% of chunk size** is a good starting overlap
- **Sentence-aligned overlap:** end and start chunks at sentence boundaries within the overlap window
- **Zero overlap** for structured data (tables, JSON records) where items are self-contained

### Sentence-Boundary Overlap

```typescript
function chunkWithSentenceOverlap(
  text: string,
  maxChunkSize: number,
  overlapSentences: number = 2
): string[] {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let startIdx = 0;

  while (startIdx < sentences.length) {
    let chunk = '';
    let endIdx = startIdx;

    while (endIdx < sentences.length && (chunk + sentences[endIdx]).length <= maxChunkSize) {
      chunk += (chunk ? ' ' : '') + sentences[endIdx];
      endIdx++;
    }

    if (chunk) chunks.push(chunk);

    // Move start back by overlap amount
    startIdx = Math.max(startIdx + 1, endIdx - overlapSentences);
    if (startIdx >= endIdx) startIdx = endIdx; // Prevent infinite loop
  }

  return chunks;
}
```

---

## Metadata Preservation

Metadata attached to chunks dramatically improves retrieval quality and enables filtering.

### Essential Metadata Fields

```python
from langchain.schema import Document

chunk = Document(
    page_content="The authentication endpoint requires...",
    metadata={
        "source": "api-docs/auth.md",          # File path or URL
        "title": "Authentication API",          # Document title
        "section": "OAuth 2.0 Flow",            # Section heading
        "chunk_index": 3,                       # Position in document
        "total_chunks": 12,                     # Total chunks from this doc
        "doc_type": "api-reference",            # Document category
        "last_updated": "2025-11-15",           # Freshness signal
        "token_count": 487,                     # For context budget management
    }
)
```

### Hierarchical Metadata from Headings

```python
from langchain.text_splitter import MarkdownHeaderTextSplitter, RecursiveCharacterTextSplitter

md_splitter = MarkdownHeaderTextSplitter(
    headers_to_split_on=[("#", "h1"), ("##", "h2"), ("###", "h3")]
)
md_chunks = md_splitter.split_text(markdown_text)

# Each chunk now has heading hierarchy in metadata
# e.g., {"h1": "User Guide", "h2": "Authentication", "h3": "API Keys"}

# Then split large sections further
text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
final_chunks = text_splitter.split_documents(md_chunks)
# Metadata is preserved through the second split
```

---

## Anti-Patterns

1. **Using fixed-size chunking on structured documents.** Markdown, HTML, and code have natural boundaries; ignoring them creates chunks that mix unrelated content.
2. **Chunks that are too small (under 100 tokens).** Embeddings of very short text have less semantic signal, leading to noisier retrieval.
3. **Chunks that are too large (over 2000 tokens).** Large chunks dilute the embedding's focus, and consume too much of the generation model's context window.
4. **Zero overlap on narrative text.** Key information at chunk boundaries is lost, causing retrieval misses.
5. **Stripping metadata during chunking.** Source, section, and position metadata is essential for citation, filtering, and re-ranking.
6. **Not measuring chunking quality.** Use evaluation metrics (context precision, context recall) to compare strategies empirically.

---

## Production Checklist

- [ ] Chunking strategy matches document type (recursive for prose, structure-aware for markdown/code)
- [ ] Chunk size is tuned to the embedding model's optimal input length (typically 256-512 tokens)
- [ ] Overlap is 10-20% of chunk size, aligned to sentence boundaries
- [ ] Metadata includes source, section hierarchy, chunk position, and timestamps
- [ ] Token-based sizing is used instead of character-based when accuracy matters
- [ ] Chunking pipeline is tested with the evaluation dataset before deployment
- [ ] Large documents are pre-processed (table extraction, image OCR) before chunking
- [ ] Chunk deduplication removes near-identical chunks from overlapping source documents
- [ ] Re-chunking pipeline exists for when parameters need to change (requires full re-embedding)
- [ ] Monitoring tracks average chunk size, chunks per document, and retrieval hit rates
