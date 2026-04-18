---
name: llamaindex
description: |
  LlamaIndex 0.12+ for RAG and agent applications. Covers Document/Node model,
  IngestionPipeline, NodeParser variants, VectorStoreIndex, query engines,
  sub-question decomposition, router engines, Property Graph Index, LlamaParse
  integration, and observability callbacks.

  USE WHEN: user mentions "LlamaIndex", "llama_index", "VectorStoreIndex",
  "IngestionPipeline", "PropertyGraphIndex", "LlamaParse", "SubQuestionQueryEngine"

  DO NOT USE FOR: LangChain specifics - use `langchain`;
  RAG architecture theory - use `rag-patterns`;
  DSPy compiler workflows - use `dspy`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# LlamaIndex

## Installation

```bash
pip install llama-index                          # meta package
pip install llama-index-llms-anthropic
pip install llama-index-embeddings-openai
pip install llama-index-vector-stores-chroma
pip install llama-parse
```

## Global Settings

```python
from llama_index.core import Settings
from llama_index.llms.anthropic import Anthropic
from llama_index.embeddings.openai import OpenAIEmbedding

Settings.llm = Anthropic(model="claude-sonnet-4-20250514")
Settings.embed_model = OpenAIEmbedding(model="text-embedding-3-small")
Settings.chunk_size = 1024
Settings.chunk_overlap = 200
```

## Documents and Nodes

```python
from llama_index.core import Document
from llama_index.core.schema import TextNode, NodeRelationship, RelatedNodeInfo

doc = Document(
    text="...",
    metadata={"source": "manual.pdf", "page": 3},
    excluded_embed_metadata_keys=["source"],    # keep out of embedding input
    excluded_llm_metadata_keys=[],
)

node = TextNode(
    text="chunk text",
    metadata={"page": 3},
    relationships={NodeRelationship.SOURCE: RelatedNodeInfo(node_id=doc.doc_id)},
)
```

## SimpleDirectoryReader

```python
from llama_index.core import SimpleDirectoryReader

docs = SimpleDirectoryReader(
    input_dir="./data",
    recursive=True,
    required_exts=[".pdf", ".md", ".txt"],
    filename_as_id=True,
).load_data()
```

## IngestionPipeline (with caching + dedup)

```python
from llama_index.core.ingestion import IngestionPipeline, IngestionCache
from llama_index.core.node_parser import SentenceSplitter
from llama_index.core.extractors import TitleExtractor, QuestionsAnsweredExtractor
from llama_index.vector_stores.chroma import ChromaVectorStore
from llama_index.core.storage.docstore import SimpleDocumentStore
import chromadb

chroma_client = chromadb.PersistentClient(path="./chroma")
vector_store = ChromaVectorStore(chroma_collection=chroma_client.get_or_create_collection("kb"))

pipeline = IngestionPipeline(
    transformations=[
        SentenceSplitter(chunk_size=1024, chunk_overlap=200),
        TitleExtractor(nodes=5),
        QuestionsAnsweredExtractor(questions=3),
        Settings.embed_model,
    ],
    vector_store=vector_store,
    docstore=SimpleDocumentStore(),             # enables upsert + dedup
    cache=IngestionCache(),
)

nodes = pipeline.run(documents=docs, show_progress=True)
pipeline.persist("./pipeline_storage")
```

## NodeParser Variants

```python
from llama_index.core.node_parser import (
    SentenceSplitter,
    SentenceWindowNodeParser,
    SemanticSplitterNodeParser,
    MarkdownNodeParser,
    HierarchicalNodeParser,
    CodeSplitter,
)

sentence = SentenceSplitter(chunk_size=512, chunk_overlap=50)
window = SentenceWindowNodeParser.from_defaults(window_size=3,
    window_metadata_key="window", original_text_metadata_key="original_text")
semantic = SemanticSplitterNodeParser(
    buffer_size=1, breakpoint_percentile_threshold=95, embed_model=Settings.embed_model)
md = MarkdownNodeParser()
hierarchical = HierarchicalNodeParser.from_defaults(chunk_sizes=[2048, 512, 128])
code = CodeSplitter(language="python", chunk_lines=40, chunk_lines_overlap=10, max_chars=1500)
```

## VectorStoreIndex and Query Engine

```python
from llama_index.core import VectorStoreIndex, StorageContext

storage_context = StorageContext.from_defaults(vector_store=vector_store)
index = VectorStoreIndex(nodes=nodes, storage_context=storage_context)

query_engine = index.as_query_engine(
    similarity_top_k=5,
    response_mode="compact",        # compact | refine | tree_summarize | simple_summarize
    streaming=True,
)

streaming_response = query_engine.query("How does authentication work?")
for token in streaming_response.response_gen:
    print(token, end="")
```

### Retriever + Response Synthesizer (explicit)

```python
from llama_index.core import get_response_synthesizer
from llama_index.core.query_engine import RetrieverQueryEngine
from llama_index.core.postprocessor import SimilarityPostprocessor
from llama_index.core.retrievers import VectorIndexRetriever

retriever = VectorIndexRetriever(index=index, similarity_top_k=10)
synth = get_response_synthesizer(response_mode="tree_summarize", streaming=True)
engine = RetrieverQueryEngine(
    retriever=retriever,
    response_synthesizer=synth,
    node_postprocessors=[SimilarityPostprocessor(similarity_cutoff=0.7)],
)
```

## Sub-Question Query Engine

```python
from llama_index.core.query_engine import SubQuestionQueryEngine
from llama_index.core.tools import QueryEngineTool, ToolMetadata

tools = [
    QueryEngineTool(
        query_engine=finance_index.as_query_engine(),
        metadata=ToolMetadata(name="finance", description="Financial reports 2022-2024"),
    ),
    QueryEngineTool(
        query_engine=product_index.as_query_engine(),
        metadata=ToolMetadata(name="product", description="Product documentation"),
    ),
]

sub_q = SubQuestionQueryEngine.from_defaults(
    query_engine_tools=tools,
    use_async=True,
    verbose=True,
)
answer = sub_q.query("Compare 2023 revenue with product launch timeline")
```

## Router Query Engine

```python
from llama_index.core.query_engine import RouterQueryEngine
from llama_index.core.selectors import LLMSingleSelector, PydanticMultiSelector

router = RouterQueryEngine(
    selector=LLMSingleSelector.from_defaults(),
    query_engine_tools=tools,
    verbose=True,
)
```

## Property Graph Index

```python
from llama_index.core import PropertyGraphIndex
from llama_index.core.indices.property_graph import (
    SimpleLLMPathExtractor,
    ImplicitPathExtractor,
    SchemaLLMPathExtractor,
)

schema_extractor = SchemaLLMPathExtractor(
    llm=Settings.llm,
    possible_entities=["PERSON", "ORG", "PRODUCT"],
    possible_relations=["WORKS_AT", "MAKES", "COMPETES_WITH"],
)

graph_index = PropertyGraphIndex.from_documents(
    docs,
    kg_extractors=[schema_extractor, ImplicitPathExtractor()],
    show_progress=True,
)
graph_index.storage_context.persist(persist_dir="./graph_store")

graph_engine = graph_index.as_query_engine(include_text=True, similarity_top_k=5)
```

## Agents with Tools (FunctionAgent / ReActAgent)

```python
from llama_index.core.agent.workflow import FunctionAgent, AgentWorkflow
from llama_index.core.tools import FunctionTool

def get_weather(city: str) -> str:
    """Return current weather for a city."""
    return f"Sunny in {city}"

weather_tool = FunctionTool.from_defaults(fn=get_weather)

agent = FunctionAgent(
    tools=[weather_tool],
    llm=Settings.llm,
    system_prompt="You are a helpful assistant.",
)

import asyncio
async def main():
    result = await agent.run("What is the weather in Rome?")
    print(result)

asyncio.run(main())
```

## LlamaParse Integration

```python
from llama_parse import LlamaParse
from llama_index.core import VectorStoreIndex
import os

parser = LlamaParse(
    api_key=os.environ["LLAMA_CLOUD_API_KEY"],
    result_type="markdown",
    premium_mode=True,
)
docs = parser.load_data("10k.pdf")
index = VectorStoreIndex.from_documents(docs)
```

## Observability (Callbacks)

```python
from llama_index.core.callbacks import CallbackManager, LlamaDebugHandler, TokenCountingHandler
import tiktoken

debug = LlamaDebugHandler(print_trace_on_end=True)
token_counter = TokenCountingHandler(
    tokenizer=tiktoken.encoding_for_model("gpt-4o").encode,
    verbose=True,
)
Settings.callback_manager = CallbackManager([debug, token_counter])

# After a query:
print("Embed tokens:", token_counter.total_embedding_token_count)
print("LLM prompt tokens:", token_counter.prompt_llm_token_count)
print("LLM completion tokens:", token_counter.completion_llm_token_count)
```

### Arize Phoenix / OpenTelemetry

```python
import llama_index.core
llama_index.core.set_global_handler("arize_phoenix")
# Launch Phoenix UI: import phoenix as px; px.launch_app()
```

## Persistence and Reload

```python
from llama_index.core import load_index_from_storage, StorageContext

index.storage_context.persist(persist_dir="./storage")

storage_context = StorageContext.from_defaults(persist_dir="./storage")
index = load_index_from_storage(storage_context)
```

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Reindexing on every run | Use IngestionPipeline with docstore + cache |
| Same `similarity_top_k` for all queries | Tune per-engine, use reranking postprocessor |
| No streaming for user chat | `streaming=True` on query engine |
| Mixing embedding models across runs | Pin via `Settings.embed_model` |
| Raw RouterQueryEngine without clear tool descriptions | Write crisp `ToolMetadata.description` strings |
| Ignoring `excluded_embed_metadata_keys` | Exclude noisy metadata from embedding input |

## Production Checklist

- [ ] `IngestionPipeline` with `docstore` for incremental upserts
- [ ] Embedding + LLM pinned in `Settings`
- [ ] Streaming enabled for user-facing queries
- [ ] Node postprocessors: similarity cutoff + reranker (Cohere, Jina)
- [ ] Observability: callback manager with token counter + tracing
- [ ] Persisted storage (`persist_dir`) with content hashing
- [ ] Eval with `RagasEvaluator` or `RelevancyEvaluator`
- [ ] Fallback on `SubQuestionQueryEngine` failures (retry + single-engine)
