---
name: canopy
description: |
  Pinecone's Canopy framework — a pre-packaged RAG stack on top of Pinecone.
  Covers Canopy CLI, REST server (OpenAI-compatible), chunking, embedding,
  retrieval, chat-history management, and customization hooks (custom
  chunkers/records).

  USE WHEN: user mentions "Canopy", "Pinecone Canopy", "canopy start",
  "canopy new", "Pinecone out-of-the-box RAG"

  DO NOT USE FOR: custom pipelines on non-Pinecone stores - use `rag-architecture`;
  Postgres-based stacks - use `r2r`;
  LangChain/LlamaIndex abstractions - use `langgraph-rag`/`llamaindex`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Canopy (Pinecone RAG framework)

Canopy is Pinecone's open-source framework that bundles chunking, embedding, retrieval, and chat-history management into a single OpenAI-compatible chat server. If Pinecone is already chosen and you want a working RAG chat endpoint in under an hour, Canopy is the fastest path.

## When to Use Canopy vs Custom

| Signal | Canopy | Custom (LangChain / LlamaIndex) |
|---|---|---|
| Vector store is Pinecone | Strong fit | Either works |
| Need an OpenAI-compatible chat endpoint today | Yes | Custom work |
| Mostly defaults work | Yes | Custom |
| Need graph RAG, advanced reranking, custom agents | No | Yes |
| Non-Pinecone vector DB | No | Yes |
| Want to version the whole RAG stack as one service | Yes | Manual |

Canopy is maintenance-mode as of late 2024 — suitable for stable workloads but don't expect rapid new features. For a Pinecone-native stack needing active innovation, combine Pinecone directly with LangGraph/LlamaIndex.

## Installation

```bash
pip install canopy-sdk

export PINECONE_API_KEY=...
export OPENAI_API_KEY=...
export ANTHROPIC_API_KEY=...   # optional, if using Anthropic LLM
export INDEX_NAME=my-knowledge-base
```

## Create an Index

```bash
canopy new        # creates a Pinecone serverless index sized for text-embedding-3-small
```

Programmatic:

```python
from canopy.knowledge_base import KnowledgeBase
from canopy.tokenizer import Tokenizer

Tokenizer.initialize()
kb = KnowledgeBase(index_name="my-knowledge-base")
kb.create_canopy_index()
```

## Ingest Documents

CLI (one-shot):

```bash
canopy upsert ./data         # walks a directory; supports .jsonl / .parquet / .txt / .md
```

JSONL input format (one document per line):

```json
{"id":"doc-1","text":"Canopy bundles chunking ...","source":"docs","metadata":{"team":"ml"}}
```

Programmatic upsert:

```python
from canopy.models.data_models import Document

docs = [
    Document(
        id="doc-1",
        text="Canopy is Pinecone's RAG framework...",
        source="https://docs.pinecone.io/canopy",
        metadata={"team": "ml", "version": "v1"},
    ),
]
kb.upsert(docs, batch_size=100)
```

Upserts are idempotent by `id`; reuse stable IDs so re-ingests don't duplicate.

## Query (Retrieval Only)

```python
from canopy.models.data_models import Query

results = kb.query([Query(text="How do I configure chunking?", top_k=5)])
for r in results[0].documents:
    print(r.score, r.text[:120])
```

## Chat (Retrieval + Generation)

```python
from canopy.context_engine import ContextEngine
from canopy.chat_engine import ChatEngine
from canopy.models.data_models import UserMessage

context_engine = ContextEngine(kb)
chat_engine = ChatEngine(context_engine=context_engine)

history = [UserMessage(content="How does Canopy chunk Markdown files?")]
resp = chat_engine.chat(messages=history, stream=False)
print(resp.choices[0].message.content)
```

Token budget: Canopy automatically sizes the retrieval budget based on the model context window and reserves space for chat history.

## Run the Server (OpenAI-compatible)

```bash
canopy start --port 8000
# OpenAI-compatible endpoints:
#   POST /v1/chat/completions
#   POST /context/query   (retrieval only)
#   POST /context/upsert
```

Point any OpenAI client at it:

```python
from openai import OpenAI
client = OpenAI(base_url="http://localhost:8000/v1", api_key="canopy")
resp = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "What is Canopy?"}],
)
```

Because it's OpenAI-compatible, tools like Continue, LlamaIndex `OpenAILike`, LangChain `ChatOpenAI`, and LibreChat all work unchanged — just swap `base_url`.

## Configuration (config.yaml)

```yaml
tokenizer:
  type: OpenAITokenizer
  params:
    model_name: gpt-4o

chat_engine:
  max_prompt_tokens: 4096
  max_generated_tokens: 1024
  llm:
    type: AnthropicLLM
    params:
      model_name: claude-sonnet-4-5

  context_engine:
    knowledge_base:
      params:
        default_top_k: 10
      chunker:
        type: MarkdownChunker
        params:
          chunk_size: 512
          chunk_overlap: 50
      record_encoder:
        type: OpenAIRecordEncoder
        params:
          model_name: text-embedding-3-small
```

Launch with config:

```bash
canopy start --config config.yaml
```

## Customization Hooks

### Custom Chunker

```python
from canopy.knowledge_base.chunker import Chunker
from canopy.models.data_models import Document, KBDocChunk

class HeaderAwareChunker(Chunker):
    def chunk_single_document(self, doc: Document) -> list[KBDocChunk]:
        # Split on H2 headers, emit one chunk per section
        chunks = []
        for i, section in enumerate(doc.text.split("\n## ")):
            chunks.append(KBDocChunk(
                id=f"{doc.id}_{i}",
                text=section,
                source=doc.source,
                document_id=doc.id,
                metadata=doc.metadata,
            ))
        return chunks
```

Register in `config.yaml` via `chunker.type: HeaderAwareChunker` (after importing the module).

### Custom Record Encoder (embedding model)

```python
from canopy.knowledge_base.record_encoder import DenseRecordEncoder
from sentence_transformers import SentenceTransformer

class BGERecordEncoder(DenseRecordEncoder):
    def __init__(self, model_name="BAAI/bge-large-en-v1.5", batch_size=32):
        super().__init__(dimension=1024, batch_size=batch_size)
        self._model = SentenceTransformer(model_name)
    def _encode_documents_batch(self, texts): return self._model.encode(texts).tolist()
    def _encode_queries_batch(self, texts):   return self._model.encode(texts).tolist()
```

### Custom Context Builder

Override `ContextEngine` to inject reranking or hybrid search before returning the prompt context.

## Chat History Management

Canopy trims older turns to fit the token budget automatically. For stable personas, pre-seed a system message; it is never trimmed.

```python
from canopy.models.data_models import SystemMessage
history = [
    SystemMessage(content="You are a concise platform engineer."),
    UserMessage(content="Explain our release process."),
]
```

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Hardcoding index name in client code | Read from `INDEX_NAME` env |
| Running `canopy start` without auth | Put behind reverse proxy with auth (OIDC/API key) |
| Using default chunker for code/tables | Swap in `MarkdownChunker` or custom `CodeChunker` |
| One Pinecone index for all tenants without namespaces | Use `namespace=tenant_id` on upsert/query |
| Ignoring the maintenance-mode status | Plan a migration path if the project stalls |
| Re-embedding with a different model in-place | Treat as a reindex — new index, dual-write, cutover |

## Production Checklist

- [ ] Pinecone serverless or pod index sized for expected vector count
- [ ] Stable document `id`s so upserts are idempotent
- [ ] Per-tenant namespaces for isolation
- [ ] Config-as-code (`config.yaml`) versioned in git
- [ ] Auth/reverse proxy in front of `canopy start`
- [ ] Embedding model pinned in `config.yaml` + manifest
- [ ] Monitoring on Pinecone query p95 and error rate
- [ ] Migration plan if the project stays in maintenance mode
