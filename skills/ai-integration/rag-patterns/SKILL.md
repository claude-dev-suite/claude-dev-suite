---
name: rag-patterns
description: |
  Retrieval-Augmented Generation architecture patterns. Chunking strategies,
  retrieval pipelines, re-ranking, hybrid search, evaluation, and production
  RAG system design.

  USE WHEN: user mentions "RAG", "retrieval augmented generation", "document Q&A",
  "knowledge base chatbot", "semantic search pipeline", "chunking strategy"

  DO NOT USE FOR: vector database specifics - use `vector-databases`;
  LangChain implementation - use `langchain`;
  direct LLM API calls - use Claude/OpenAI SDK skills
allowed-tools: Read, Grep, Glob, Write, Edit
---
# RAG Patterns

## Standard RAG Pipeline

```
Documents → Chunk → Embed → Store (vector DB)
Query → Embed → Retrieve → Augment prompt → Generate answer
```

## Chunking Strategies

```python
from langchain_text_splitters import RecursiveCharacterTextSplitter

# Recommended defaults
splitter = RecursiveCharacterTextSplitter(
    chunk_size=800,      # chars (not tokens)
    chunk_overlap=200,
    separators=["\n\n", "\n", ". ", " ", ""],
)
chunks = splitter.split_documents(docs)
```

| Strategy | Best For | Chunk Size |
|----------|----------|------------|
| Fixed-size with overlap | General text | 500-1000 chars |
| Recursive character | Structured docs | 500-1000 chars |
| Semantic (by meaning) | Long-form content | Variable |
| Document-aware (markdown headers) | Technical docs | Section-based |

### Metadata Enrichment

```python
for chunk in chunks:
    chunk.metadata.update({
        "source": doc.metadata["source"],
        "section": extract_section_title(chunk),
        "doc_id": doc.metadata["id"],
        "chunk_index": i,
    })
```

## Retrieval Strategies

### Hybrid Search (keyword + semantic)

```python
from langchain.retrievers import EnsembleRetriever
from langchain_community.retrievers import BM25Retriever

bm25 = BM25Retriever.from_documents(docs, k=5)
vector_retriever = vectorstore.as_retriever(search_kwargs={"k": 5})

hybrid = EnsembleRetriever(
    retrievers=[bm25, vector_retriever],
    weights=[0.3, 0.7],
)
```

### Re-ranking

```python
from cohere import Client

cohere = Client(api_key=COHERE_API_KEY)

def rerank(query: str, documents: list[str], top_n: int = 5):
    response = cohere.rerank(
        model="rerank-english-v3.0",
        query=query,
        documents=documents,
        top_n=top_n,
    )
    return [documents[r.index] for r in response.results]
```

### Multi-query Retrieval

```python
# Generate multiple query variations for better recall
prompt = """Generate 3 different versions of this question
to retrieve relevant documents: {question}"""

queries = llm.invoke(prompt).split("\n")
all_docs = set()
for q in queries:
    all_docs.update(retriever.invoke(q))
```

## Prompt Construction

```python
SYSTEM_PROMPT = """Answer based only on the provided context.
If the context doesn't contain the answer, say "I don't have enough information."
Cite sources using [Source: filename] format.

Context:
{context}"""

def format_context(docs, max_tokens=3000):
    context_parts = []
    for doc in docs:
        source = doc.metadata.get("source", "unknown")
        context_parts.append(f"[Source: {source}]\n{doc.page_content}")
    return "\n\n---\n\n".join(context_parts)
```

## Evaluation

| Metric | Measures | Tool |
|--------|----------|------|
| Context Relevance | Are retrieved docs relevant? | RAGAS, manual |
| Faithfulness | Does answer match context? | RAGAS |
| Answer Relevance | Does answer address question? | RAGAS |
| Retrieval Recall | Are correct docs retrieved? | Custom eval set |

```python
from ragas import evaluate
from ragas.metrics import faithfulness, answer_relevancy, context_precision

result = evaluate(dataset, metrics=[faithfulness, answer_relevancy, context_precision])
```

## Anti-Patterns

| Anti-Pattern | Fix |
|--------------|-----|
| Chunks too large (>1500 chars) | Use 500-1000 char chunks with 200 overlap |
| No metadata on chunks | Store source, section, page number |
| No retrieval evaluation | Build eval set, measure recall and precision |
| Stuffing all chunks in prompt | Limit to top-K (3-5), use re-ranking |
| Ignoring hybrid search | Combine BM25 + vector for better recall |
| No citation/source tracking | Pass metadata through pipeline |

## Production Checklist

- [ ] Chunking strategy tuned with eval set
- [ ] Hybrid search (BM25 + vector) enabled
- [ ] Re-ranking on retrieval results
- [ ] Source attribution in answers
- [ ] Guardrails for out-of-scope questions
- [ ] Monitoring: retrieval latency, answer quality scores
- [ ] Incremental indexing for new documents
