---
name: txtai
description: |
  txtai — lightweight, SQLite-backed embeddings + semantic search + pipeline
  framework. Covers Embeddings index, pipelines (summarization, translation,
  QA), workflows, graph support, agents, and edge/on-device deployment with
  small models.

  USE WHEN: user mentions "txtai", "SQLite embeddings", "lightweight RAG",
  "on-device RAG", "edge RAG", "txtai pipeline", "txtai workflow"

  DO NOT USE FOR: heavy Pinecone stacks - use `canopy`;
  full KG/agent platforms - use `r2r`;
  large LangChain/LlamaIndex apps - use `langgraph-rag`/`llamaindex`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# txtai

txtai is an all-in-one embeddings database designed to run well on a laptop, a small VM, or the edge. The core index stores vectors in Faiss/HNSW/NumPy backends and metadata in SQLite (or DuckDB, Postgres), so a complete RAG stack ships as a single Python process with no external services.

## When to Use txtai

- Prototyping where standing up Postgres + Pinecone + workers is overkill.
- Edge or on-device RAG (embedded Python, Raspberry Pi, laptops).
- Small/medium corpora (under ~10M vectors) with simple metadata.
- You want embeddings + pipelines + workflows + a graph in one library.

Not a fit when: you need multi-region, multi-tenant at SaaS scale (use `r2r` or Pinecone), or advanced retrieval features like hybrid fusion rerankers across microservices (use `langgraph-rag` + dedicated vector DB).

## Installation

```bash
pip install txtai                       # core
pip install txtai[pipeline]             # transformers, summarization, translation, QA
pip install txtai[graph]                # networkx-backed graph
pip install txtai[api]                  # FastAPI server
pip install txtai[all]                  # kitchen sink
```

## Embeddings Index

```python
from txtai import Embeddings

# Small, fast default; swap to intfloat/e5-large-v2 for quality
emb = Embeddings(path="sentence-transformers/all-MiniLM-L6-v2", content=True)

data = [
    {"id": "1", "text": "txtai stores embeddings in SQLite.", "source": "docs"},
    {"id": "2", "text": "Faiss is the default ANN backend.",  "source": "docs"},
    {"id": "3", "text": "Pipelines wrap HuggingFace models.", "source": "docs"},
]
emb.index(data)

for hit in emb.search("How are embeddings stored?", 3):
    print(hit)         # {'id': '1', 'text': '...', 'score': 0.87}
```

`content=True` stores the original text in the SQL side so you can retrieve it with the hit. Without it you get only `(id, score)`.

### Hybrid (Dense + Sparse BM25)

```python
emb = Embeddings(
    path="sentence-transformers/all-MiniLM-L6-v2",
    content=True,
    hybrid=True,                # vector + BM25 with weighted fusion
    keyword=True,
)
emb.index(data)
emb.search("SQLite embeddings", 3)
```

### Metadata Filters via SQL

```python
emb.search("embeddings", 5, filter="source = 'docs' AND score > 0.5")
# Arbitrary SQL in the filter clause — joins SQL metadata with ANN top-K
```

### Save / Load

```python
emb.save("./index")
emb2 = Embeddings()
emb2.load("./index")
```

The saved directory contains the Faiss index, the SQLite file, and the model config. Copy it verbatim to deploy.

## Pipelines (single-step tasks)

```python
from txtai.pipeline import Summary, Translation, Extractor, Labels

summary = Summary(path="sshleifer/distilbart-cnn-12-6")
summary("Long text ...", minlength=30, maxlength=80)

translate = Translation()
translate("Hello world", "es")

labels = Labels()
labels("This is great", ["positive", "negative"])

# RAG pipeline — retrieval-augmented QA using an Embeddings index + LLM
extractor = Extractor(emb, "google/flan-t5-base")
extractor([{"query": "How are embeddings stored?", "question": "Where is the data kept?"}])
```

For LLM-backed RAG with external providers:

```python
from txtai.pipeline import LLM, RAG
llm = LLM("anthropic/claude-sonnet-4-5")           # LiteLLM-backed
rag = RAG(emb, llm, template="Answer: {question}\nContext: {context}")
rag("How are embeddings stored?", maxlength=256)
```

## Workflows (multi-step pipelines)

```python
from txtai import Application

app = Application("""
writable: true
embeddings:
  path: sentence-transformers/all-MiniLM-L6-v2
  content: true
summary:
  path: sshleifer/distilbart-cnn-12-6
workflow:
  summarize_and_index:
    tasks:
      - action: summary
      - action: index
""")

app.workflow("summarize_and_index", ["Long document 1 ...", "Long document 2 ..."])
app.search("document")
```

Workflows can chain pipelines, call external APIs, run on streams, and execute on schedules.

## Graph Support

```python
emb = Embeddings(
    path="sentence-transformers/all-MiniLM-L6-v2",
    content=True,
    graph={"approximate": False, "topics": {}},     # auto-build a similarity graph + topics
)
emb.index(data)

# Semantic graph: similar nodes connected; topics (community detection) auto-clustered
for topic in emb.graph.topics:
    print(topic, emb.graph.topics[topic][:3])

# Traverse
path = emb.graph.showpath(1, 3)   # shortest path between node ids 1 and 3
```

The graph is a full-fledged `networkx` instance underneath, so any graph algorithm works. Useful for GraphRAG-lite: seed on semantic hits, expand to connected concepts.

## Agents

```python
from txtai import Agent

agent = Agent(
    tools=[
        {"name": "search", "description": "Search the KB", "target": emb.search},
    ],
    llm="anthropic/claude-sonnet-4-5",
)
agent("Find docs about SQLite and summarize them")
```

Agents support multi-step reasoning with tool calls; keep the tool surface small (3–5 tools) for reliability on smaller models.

## FastAPI Server

```bash
# config.yml with embeddings + workflow definitions
CONFIG=config.yml uvicorn "txtai.api:app" --host 0.0.0.0 --port 8000
```

Endpoints: `/search`, `/add`, `/index`, `/upsert`, `/delete`, `/workflow/{name}`.

## Edge / On-Device Deployment

- **Model choice**: `intfloat/multilingual-e5-small`, `all-MiniLM-L6-v2`, or INT8-quantized variants keep RAM < 1 GB.
- **Backend**: Faiss or NumPy; HNSW when index > 100k vectors.
- **Storage**: SQLite file is the whole DB — ship with the app bundle.
- **LLM**: Llama.cpp-served local model via `txtai.pipeline.LLM("llama.cpp/...")`, or on-device MLX on Apple Silicon.
- **Packaging**: PyInstaller / BeeWare; the index directory is the only runtime dependency.

## Comparison vs Heavy Frameworks

| Aspect | txtai | LangChain/LlamaIndex | R2R |
|---|---|---|---|
| Moving parts | 1 process + SQLite | Many packages + vector DB | API + Postgres + Hatchet |
| Time to first RAG query | Minutes | Hours | Hour (docker compose) |
| Multi-tenant at scale | Weak | Strong (w/ Pinecone etc.) | Strong |
| Agent / graph / workflow | Built-in, lightweight | Feature-rich via add-ons | Built-in, production |
| Footprint | <500 MB | 1–3 GB | 2–4 GB + Postgres |
| Edge deployable | Yes | Awkward | No |

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Using default MiniLM model for non-English corpora | Switch to `intfloat/multilingual-e5-*` |
| Storing 100M vectors on Faiss-Flat (CPU) | Switch backend to HNSW or move to a real vector DB |
| Writing to the SQLite index from multiple processes | SQLite single-writer — serialize ingest in one worker |
| Treating filter SQL as trusted | Parameterize (`filter=":src = source"`) to avoid injection |
| Shipping the HuggingFace cache inside the bundle | Use `TRANSFORMERS_CACHE` + layered Docker image |
| Running `Extractor` with a tiny model on complex QA | Upgrade to a 7B+ local model or hosted LLM via LiteLLM |

## Production Checklist

- [ ] Embedding model pinned and cached in a readable path
- [ ] Index saved/loaded from a persistent volume (not ephemeral FS)
- [ ] Single-writer ingestion; readers can fan out on replicas of the index dir
- [ ] Backups of the index directory (SQLite + Faiss files) as one unit
- [ ] HNSW backend for indexes above ~100k vectors
- [ ] Hybrid (dense + BM25) enabled for keyword-heavy queries
- [ ] Workflow definitions checked into git (`config.yml`)
- [ ] Metrics on search latency, hit count, p95 per workflow
