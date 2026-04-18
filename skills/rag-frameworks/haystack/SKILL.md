---
name: haystack
description: |
  Haystack 2.x pipeline architecture for RAG and LLM apps. Covers Components,
  Pipeline as DAG, document stores (InMemory, Elasticsearch, Weaviate, Pinecone,
  Qdrant), Embedders, Retrievers (BM25, embedding, hybrid), Generators, PromptBuilder,
  conditional routing, and evaluation components.

  USE WHEN: user mentions "Haystack", "deepset", "Haystack pipeline", "Component
  DAG", "DocumentStore", "BM25Retriever", "ConditionalRouter"

  DO NOT USE FOR: LlamaIndex specifics - use `llamaindex`;
  LangChain - use `langchain`;
  DSPy - use `dspy`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Haystack 2.x

## Installation

```bash
pip install haystack-ai
pip install anthropic-haystack
pip install elasticsearch-haystack qdrant-haystack pinecone-haystack
```

## Core Concepts

- **Component**: single-purpose unit with typed `run()` (uses `@component` decorator)
- **Pipeline**: DAG of components with named connections
- **DocumentStore**: backend for indexed documents (separate from the pipeline)
- Components declare inputs/outputs as typed sockets; Pipeline wires them

## Indexing Pipeline

```python
from haystack import Pipeline
from haystack.components.converters import PyPDFToDocument, TextFileToDocument
from haystack.components.preprocessors import DocumentCleaner, DocumentSplitter
from haystack.components.embedders import SentenceTransformersDocumentEmbedder
from haystack.components.writers import DocumentWriter
from haystack.document_stores.in_memory import InMemoryDocumentStore
from haystack.document_stores.types import DuplicatePolicy

store = InMemoryDocumentStore(embedding_similarity_function="cosine")

index_pipe = Pipeline()
index_pipe.add_component("pdf", PyPDFToDocument())
index_pipe.add_component("cleaner", DocumentCleaner(
    remove_empty_lines=True, remove_extra_whitespaces=True, remove_repeated_substrings=False,
))
index_pipe.add_component("splitter", DocumentSplitter(
    split_by="word", split_length=200, split_overlap=50,
))
index_pipe.add_component("embedder", SentenceTransformersDocumentEmbedder(
    model="sentence-transformers/all-MiniLM-L6-v2",
))
index_pipe.add_component("writer", DocumentWriter(
    document_store=store, policy=DuplicatePolicy.OVERWRITE,
))

index_pipe.connect("pdf.documents", "cleaner.documents")
index_pipe.connect("cleaner.documents", "splitter.documents")
index_pipe.connect("splitter.documents", "embedder.documents")
index_pipe.connect("embedder.documents", "writer.documents")

index_pipe.run({"pdf": {"sources": ["manual.pdf", "guide.pdf"]}})
```

## RAG Query Pipeline

```python
from haystack.components.embedders import SentenceTransformersTextEmbedder
from haystack.components.retrievers.in_memory import InMemoryEmbeddingRetriever
from haystack.components.builders import PromptBuilder
from haystack_integrations.components.generators.anthropic import AnthropicGenerator
from haystack.utils import Secret
import os

template = """Answer the question using only the provided context.
If the answer is not in the context, say "I do not know."

Context:
{% for doc in documents %}
[Source: {{ doc.meta.file_path }}]
{{ doc.content }}
{% endfor %}

Question: {{ question }}
Answer:"""

rag = Pipeline()
rag.add_component("text_embedder", SentenceTransformersTextEmbedder(
    model="sentence-transformers/all-MiniLM-L6-v2",
))
rag.add_component("retriever", InMemoryEmbeddingRetriever(document_store=store, top_k=5))
rag.add_component("prompt", PromptBuilder(template=template))
rag.add_component("llm", AnthropicGenerator(
    api_key=Secret.from_env_var("ANTHROPIC_API_KEY"),
    model="claude-sonnet-4-20250514",
))

rag.connect("text_embedder.embedding", "retriever.query_embedding")
rag.connect("retriever.documents", "prompt.documents")
rag.connect("prompt.prompt", "llm.prompt")

result = rag.run({
    "text_embedder": {"text": "How do I reset my password?"},
    "prompt": {"question": "How do I reset my password?"},
})
print(result["llm"]["replies"][0])
```

## Hybrid Retrieval (BM25 + Embedding)

```python
from haystack.components.retrievers.in_memory import (
    InMemoryBM25Retriever, InMemoryEmbeddingRetriever,
)
from haystack.components.joiners import DocumentJoiner
from haystack.components.rankers import TransformersSimilarityRanker

hybrid = Pipeline()
hybrid.add_component("text_embedder", SentenceTransformersTextEmbedder(
    model="sentence-transformers/all-MiniLM-L6-v2"))
hybrid.add_component("bm25", InMemoryBM25Retriever(document_store=store, top_k=10))
hybrid.add_component("emb", InMemoryEmbeddingRetriever(document_store=store, top_k=10))
hybrid.add_component("joiner", DocumentJoiner(join_mode="reciprocal_rank_fusion", top_k=10))
hybrid.add_component("ranker", TransformersSimilarityRanker(
    model="BAAI/bge-reranker-base", top_k=5,
))

hybrid.connect("text_embedder.embedding", "emb.query_embedding")
hybrid.connect("bm25.documents", "joiner.documents")
hybrid.connect("emb.documents", "joiner.documents")
hybrid.connect("joiner.documents", "ranker.documents")

hybrid.run({
    "text_embedder": {"text": "2FA setup"},
    "bm25": {"query": "2FA setup"},
    "ranker": {"query": "2FA setup"},
})
```

## Document Store Integrations

### Elasticsearch

```python
from haystack_integrations.document_stores.elasticsearch import ElasticsearchDocumentStore
from haystack_integrations.components.retrievers.elasticsearch import (
    ElasticsearchBM25Retriever, ElasticsearchEmbeddingRetriever,
)

es_store = ElasticsearchDocumentStore(hosts="http://localhost:9200", index="docs")
bm25 = ElasticsearchBM25Retriever(document_store=es_store, top_k=10)
emb = ElasticsearchEmbeddingRetriever(document_store=es_store, top_k=10)
```

### Weaviate

```python
from haystack_integrations.document_stores.weaviate import WeaviateDocumentStore
from haystack_integrations.components.retrievers.weaviate import WeaviateEmbeddingRetriever

wv_store = WeaviateDocumentStore(url="http://localhost:8080")
wv_retriever = WeaviateEmbeddingRetriever(document_store=wv_store, top_k=5)
```

### Pinecone

```python
from haystack_integrations.document_stores.pinecone import PineconeDocumentStore
from haystack_integrations.components.retrievers.pinecone import PineconeEmbeddingRetriever

pc_store = PineconeDocumentStore(
    api_key=Secret.from_env_var("PINECONE_API_KEY"),
    index="rag-index",
    namespace="prod",
    dimension=384,
)
```

### Qdrant

```python
from haystack_integrations.document_stores.qdrant import QdrantDocumentStore
from haystack_integrations.components.retrievers.qdrant import QdrantEmbeddingRetriever

qd_store = QdrantDocumentStore(url="http://localhost:6333", index="docs",
                               embedding_dim=384, recreate_index=False)
```

## Conditional Routing

```python
from haystack.components.routers import ConditionalRouter

routes = [
    {
        "condition": "{{ documents|length > 0 }}",
        "output": "{{ documents }}",
        "output_name": "has_context",
        "output_type": list,
    },
    {
        "condition": "{{ documents|length == 0 }}",
        "output": "{{ query }}",
        "output_name": "no_context",
        "output_type": str,
    },
]
router = ConditionalRouter(routes=routes)
```

## Custom Component

```python
from haystack import component

@component
class MetadataFilter:
    @component.output_types(documents=list)
    def run(self, documents: list, min_score: float = 0.7):
        kept = [d for d in documents if (d.score or 0) >= min_score]
        return {"documents": kept}
```

## Generators

```python
from haystack.components.generators import OpenAIGenerator
from haystack_integrations.components.generators.anthropic import AnthropicGenerator
from haystack_integrations.components.generators.huggingface_api import HuggingFaceAPIGenerator

openai_gen = OpenAIGenerator(model="gpt-4o", api_key=Secret.from_env_var("OPENAI_API_KEY"))
anthropic_gen = AnthropicGenerator(model="claude-sonnet-4-20250514",
                                   api_key=Secret.from_env_var("ANTHROPIC_API_KEY"))
hf_gen = HuggingFaceAPIGenerator(
    api_type="serverless_inference_api",
    api_params={"model": "mistralai/Mistral-7B-Instruct-v0.3"},
    token=Secret.from_env_var("HF_TOKEN"),
)
```

## Evaluation

```python
from haystack.components.evaluators import (
    DocumentMAPEvaluator,
    DocumentRecallEvaluator,
    FaithfulnessEvaluator,
    ContextRelevanceEvaluator,
    SASEvaluator,
)

eval_pipe = Pipeline()
eval_pipe.add_component("recall", DocumentRecallEvaluator())
eval_pipe.add_component("faithfulness", FaithfulnessEvaluator())
eval_pipe.add_component("relevance", ContextRelevanceEvaluator())

scores = eval_pipe.run({
    "recall": {"ground_truth_documents": gt_docs, "retrieved_documents": retrieved},
    "faithfulness": {"questions": qs, "contexts": ctxs, "predicted_answers": preds},
    "relevance": {"questions": qs, "contexts": ctxs},
})
```

## Serialization

```python
# Serialize pipeline to YAML
yaml_str = rag.dumps()
with open("rag.yaml", "w") as f:
    f.write(yaml_str)

# Reload
from haystack import Pipeline
rag = Pipeline.loads(open("rag.yaml").read())
```

## Streaming

```python
def on_token(chunk):
    print(chunk.content, end="", flush=True)

streaming_llm = AnthropicGenerator(
    model="claude-sonnet-4-20250514",
    streaming_callback=on_token,
)
```

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Putting DocumentStore inside Pipeline graph | Stores are external - reference via component args |
| Forgetting `DuplicatePolicy.OVERWRITE` on re-index | Set explicit policy to control dedup |
| Ignoring socket types on `connect()` | Match output/input names precisely |
| One giant pipeline for index + query | Split into separate index and query pipelines |
| No ranker after hybrid retrieval | Add `TransformersSimilarityRanker` to sort results |
| Hardcoded API keys | Use `Secret.from_env_var` |

## Production Checklist

- [ ] Separate indexing and querying pipelines
- [ ] External DocumentStore (Elasticsearch, Qdrant, Weaviate, Pinecone)
- [ ] Hybrid retrieval (BM25 + embedding) with joiner + ranker
- [ ] Secrets via `Secret.from_env_var`, never in code
- [ ] Streaming callbacks for user-facing responses
- [ ] Pipeline serialized as YAML for reproducibility
- [ ] Evaluation components in CI against a golden set
- [ ] Telemetry enabled or disabled explicitly (`HAYSTACK_TELEMETRY_ENABLED`)
