---
name: advanced-retrieval
description: |
  Retrieval strategies beyond top-K similarity. Parent-document, small-to-big,
  multi-vector, contextual compression, sentence-window, auto-merging, RAPTOR,
  and hierarchical indexing. LangChain + LlamaIndex code with tradeoffs.

  USE WHEN: user mentions "parent document retriever", "small-to-big", "multi-vector",
  "sentence window", "auto-merging", "RAPTOR", "hierarchical index", "contextual compression"

  DO NOT USE FOR: chunking the source docs - use `chunking-strategies`;
  query rewriting - use `query-transformations`; BM25+dense fusion - use `hybrid-search`;
  reranker models - use `reranking`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Advanced Retrieval

## Pattern Selection

| Strategy | Match Unit | Return Unit | Best For |
|---|---|---|---|
| Parent-document | Small child chunk | Parent chunk | Need precision + context |
| Small-to-big | Sentence | Window around match | Dense prose, legal |
| Multi-vector (summary) | LLM summary | Original chunk | Heterogeneous docs, dense tech |
| Multi-vector (hypothetical Q) | Generated Q | Original chunk | FAQ-style queries |
| Sentence-window | Sentence | ±N sentences | Narrative, conversations |
| Auto-merging | Leaf node | Merged parent if threshold met | Structured hierarchies |
| RAPTOR | Any level | Summary tree node | Book-length, research corpora |
| Contextual compression | Chunk | Compressed chunk | Long chunks, high cost LLM |
| Hierarchical | Summary -> chunk | Two-step drill-down | Very large corpora |

## Parent-Document Retriever

Match on small chunks (precise) but feed larger parents to the LLM (context).

```python
from langchain.retrievers import ParentDocumentRetriever
from langchain.storage import InMemoryStore
from langchain_chroma import Chroma
from langchain_openai import OpenAIEmbeddings
from langchain_text_splitters import RecursiveCharacterTextSplitter

parent_splitter = RecursiveCharacterTextSplitter(chunk_size=2000, chunk_overlap=200)
child_splitter = RecursiveCharacterTextSplitter(chunk_size=400, chunk_overlap=50)

vectorstore = Chroma(
    collection_name="children",
    embedding_function=OpenAIEmbeddings(model="text-embedding-3-small"),
)
docstore = InMemoryStore()  # use Redis/Postgres for production

retriever = ParentDocumentRetriever(
    vectorstore=vectorstore,
    docstore=docstore,
    child_splitter=child_splitter,
    parent_splitter=parent_splitter,
    search_kwargs={"k": 4},
)
retriever.add_documents(raw_docs)
context_docs = retriever.invoke("How does token refresh work?")
```

Use Redis/Postgres as the parent docstore in production; `InMemoryStore` is demo-only.

## Multi-Vector Retriever (Summary Embeddings)

Embed an LLM-generated summary per chunk; store the original as payload.

```python
import uuid
from langchain.retrievers.multi_vector import MultiVectorRetriever
from langchain_core.documents import Document
from langchain_anthropic import ChatAnthropic

llm = ChatAnthropic(model="claude-haiku-4-5-20250929", max_tokens=200)

def summarize(doc: Document) -> str:
    msg = llm.invoke(f"Summarize in 2 sentences for search indexing:\n\n{doc.page_content}")
    return msg.content

docs = [...]
ids = [str(uuid.uuid4()) for _ in docs]
summaries = [
    Document(page_content=summarize(d), metadata={"doc_id": ids[i]})
    for i, d in enumerate(docs)
]

vectorstore = Chroma(collection_name="summaries", embedding_function=OpenAIEmbeddings())
docstore = InMemoryStore()

retriever = MultiVectorRetriever(
    vectorstore=vectorstore, docstore=docstore, id_key="doc_id",
)
retriever.vectorstore.add_documents(summaries)
retriever.docstore.mset(list(zip(ids, docs)))
```

## Multi-Vector: Hypothetical Questions

Generate likely questions per chunk, embed the questions, return the chunk on match. Highly effective on FAQ and support corpora.

```python
def gen_questions(doc: Document) -> list[str]:
    msg = llm.invoke(f"Generate 3 questions that this passage answers, one per line:\n\n{doc.page_content}")
    return [q.strip() for q in msg.content.splitlines() if q.strip()]

q_docs = []
for i, d in enumerate(docs):
    for q in gen_questions(d):
        q_docs.append(Document(page_content=q, metadata={"doc_id": ids[i]}))

retriever.vectorstore.add_documents(q_docs)
```

## Sentence-Window Retriever (LlamaIndex)

Embed each sentence; return ±N surrounding sentences.

```python
from llama_index.core.node_parser import SentenceWindowNodeParser
from llama_index.core import VectorStoreIndex, StorageContext
from llama_index.core.postprocessor import MetadataReplacementPostProcessor
from llama_index.embeddings.openai import OpenAIEmbedding

parser = SentenceWindowNodeParser.from_defaults(
    window_size=3,
    window_metadata_key="window",
    original_text_metadata_key="original_sentence",
)
nodes = parser.get_nodes_from_documents(documents)
index = VectorStoreIndex(nodes, embed_model=OpenAIEmbedding())

query_engine = index.as_query_engine(
    similarity_top_k=5,
    node_postprocessors=[MetadataReplacementPostProcessor(target_metadata_key="window")],
)
response = query_engine.query("How does OAuth token refresh work?")
```

The postprocessor swaps the sentence for its window before generation.

## Auto-Merging Retriever (LlamaIndex)

Retrieve leaf nodes; if enough leaves of the same parent match, return the parent instead.

```python
from llama_index.core.node_parser import HierarchicalNodeParser, get_leaf_nodes
from llama_index.core.retrievers import AutoMergingRetriever
from llama_index.core.storage.docstore import SimpleDocumentStore

parser = HierarchicalNodeParser.from_defaults(chunk_sizes=[2048, 512, 128])
nodes = parser.get_nodes_from_documents(documents)
leaf_nodes = get_leaf_nodes(nodes)

docstore = SimpleDocumentStore()
docstore.add_documents(nodes)
storage_ctx = StorageContext.from_defaults(docstore=docstore)

index = VectorStoreIndex(leaf_nodes, storage_context=storage_ctx)
base_retriever = index.as_retriever(similarity_top_k=12)

retriever = AutoMergingRetriever(base_retriever, storage_ctx, verbose=True)
```

Threshold defaults to 0.5 of parent's children. Tunable via `AutoMergingRetriever`.

## Contextual Compression

Filter or compress retrieved docs to what actually answers the query — reduces LLM input and hallucination.

```python
from langchain.retrievers import ContextualCompressionRetriever
from langchain.retrievers.document_compressors import (
    LLMChainExtractor, LLMChainFilter, EmbeddingsFilter,
)
from langchain_openai import OpenAIEmbeddings

# Option A: LLM extracts only relevant sentences
compressor = LLMChainExtractor.from_llm(llm)

# Option B: LLM filters whole docs
# compressor = LLMChainFilter.from_llm(llm)

# Option C: cheap embedding similarity filter (no LLM)
# compressor = EmbeddingsFilter(embeddings=OpenAIEmbeddings(), similarity_threshold=0.75)

compressed = ContextualCompressionRetriever(
    base_compressor=compressor,
    base_retriever=base_retriever,
)
docs = compressed.invoke("token refresh flow")
```

Stack with a reranker: rerank first (cheap shortlist), compress second.

## RAPTOR (Recursive Abstractive Processing for Tree-Organized Retrieval)

Recursively cluster chunks and summarize each cluster into a parent node. Index all levels in one collection so queries retrieve both leaf chunks and cluster-level summaries.

```python
import umap, numpy as np
from sklearn.mixture import GaussianMixture

def cluster(embs: np.ndarray, max_k: int = 50) -> np.ndarray:
    reduced = umap.UMAP(n_neighbors=10, n_components=10, metric="cosine").fit_transform(embs)
    k = min(max_k, len(embs) // 10 or 1)
    return GaussianMixture(n_components=k, random_state=0).fit(reduced).predict(reduced)

def raptor_level(docs, embs):
    labels = cluster(embs)
    out = []
    for c in set(labels):
        text = "\n\n".join(d.page_content for i, d in enumerate(docs) if labels[i] == c)
        s = llm.invoke(f"Summarize this cluster in 3-5 sentences:\n\n{text}").content
        out.append(Document(page_content=s, metadata={"cluster": int(c)}))
    return out

def build_raptor(leaves, max_levels: int = 3):
    all_nodes, current = list(leaves), leaves
    for level in range(1, max_levels + 1):
        embs = np.array(OpenAIEmbeddings().embed_documents([d.page_content for d in current]))
        current = raptor_level(current, embs)
        for d in current: d.metadata["level"] = level
        all_nodes.extend(current)
        if len(current) <= 5: break
    return all_nodes
```

See Sarthi et al., 2024 for the full tree-traversal retrieval variant.

## Hierarchical Indexing (Two-Stage)

```python
# Stage 1: document-level index
doc_summaries = [Document(page_content=summarize(d), metadata={"doc_id": d.metadata["id"]})
                 for d in full_docs]
summary_index = Chroma.from_documents(doc_summaries, OpenAIEmbeddings(), collection_name="docs")

# Stage 2: chunk-level indexes per document
chunk_indexes = {}
for d in full_docs:
    chunks = child_splitter.split_documents([d])
    chunk_indexes[d.metadata["id"]] = Chroma.from_documents(
        chunks, OpenAIEmbeddings(), collection_name=f"chunks_{d.metadata['id']}"
    )

def hierarchical_retrieve(q: str, k_docs: int = 3, k_chunks: int = 5):
    top_docs = summary_index.similarity_search(q, k=k_docs)
    results = []
    for sd in top_docs:
        doc_id = sd.metadata["doc_id"]
        results.extend(chunk_indexes[doc_id].similarity_search(q, k=k_chunks))
    return results
```

Scales to millions of documents where a flat index would thrash.

## When to Use What

```
Need more context than the matched chunk?  -> Parent-document or Sentence-window
Docs are stylistically heterogeneous?       -> Multi-vector with summaries
Queries sound like questions?               -> Multi-vector with hypothetical Qs
Very long documents?                        -> Auto-merging or RAPTOR
Book-length or research-paper corpora?      -> RAPTOR
Millions of docs, partitionable?            -> Hierarchical
Prompt too large after retrieval?           -> Contextual compression
```

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Flat top-K on heterogeneous corpus | Multi-vector with summaries or hierarchical |
| Parent-document with InMemoryStore in prod | Back with Redis/Postgres docstore |
| Summary embedding without storing original | Always keep original doc in docstore, key by `doc_id` |
| LLMChainExtractor on small chunks | Use only on chunks > ~500 tokens |
| RAPTOR for small corpora | Overkill below ~1k docs |
| Auto-merging without threshold tuning | Verify merge ratio on eval set |
| Generating hypothetical Qs once per deploy | Regenerate on doc updates (hashed cache) |
| No metadata propagation through hierarchy | Attach `level`, `parent_id`, `child_ids` |

## Production Checklist

- [ ] Docstore persistent (Redis / Postgres), not in-memory
- [ ] Parent/child IDs linked bidirectionally
- [ ] Summary / question generation cached by content hash
- [ ] Retrieval level measured separately in eval (leaf recall, merged recall)
- [ ] Contextual compression only after reranking, not before
- [ ] RAPTOR re-run scheduled on corpus refresh
- [ ] Hierarchical first-stage has high recall (k_docs >= 5)
- [ ] Metadata preserved across hierarchy (level, parent, source)
- [ ] Tracing records which retriever path served each answer
- [ ] Fallback from advanced retriever to naive top-K on error
