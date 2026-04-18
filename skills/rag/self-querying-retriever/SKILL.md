---
name: self-querying-retriever
description: |
  LangChain SelfQueryRetriever pattern. LLM infers structured metadata filters
  from natural language ("books by Asimov after 2000" -> filter author=Asimov AND
  year>2000). Metadata schema declaration, comparators and operators, LlamaIndex
  AutoRetriever equivalent, combining with hybrid search, evaluation of filter
  correctness.

  USE WHEN: user mentions "self-querying retriever", "SelfQueryRetriever",
  "auto retriever", "metadata filter from query", "NL to filter", "AutoRetriever"

  DO NOT USE FOR: text-to-SQL on tables - use `tabular-rag`;
  plain query rewriting - use `query-transformations`;
  hybrid search - use `hybrid-search`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Self-Querying Retriever

## The Pattern

User types natural language. The LLM produces a structured `(search_string, filter)` tuple that the retriever executes against a vector store with metadata filtering.

```
"books by Asimov after 2000"
    |
    v
{ query: "books", filter: AND(eq(author, "Asimov"), gt(year, 2000)) }
```

Separating semantic query from symbolic filter is the key. Semantic similarity cannot express `year > 2000`; metadata filters cannot express "books about first contact". Together they work.

## Core Flow

```
[NL query] -> [Structured query LLM] -> {query, filter} -> [vector store + metadata filter] -> docs
                    ^
                    |
         metadata schema description
```

## LangChain 0.3+ SelfQueryRetriever

```python
from langchain.chains.query_constructor.schema import AttributeInfo
from langchain.retrievers.self_query.base import SelfQueryRetriever
from langchain_chroma import Chroma
from langchain_openai import OpenAIEmbeddings
from langchain_anthropic import ChatAnthropic
from langchain_core.documents import Document

docs = [
    Document(page_content="Foundation is a 1951 novel about...",
             metadata={"title": "Foundation", "author": "Isaac Asimov",
                       "year": 1951, "genre": "science fiction", "rating": 4.4}),
    Document(page_content="The Gods Themselves explores...",
             metadata={"title": "The Gods Themselves", "author": "Isaac Asimov",
                       "year": 1972, "genre": "science fiction", "rating": 4.1}),
    Document(page_content="Prelude to Foundation is set before...",
             metadata={"title": "Prelude to Foundation", "author": "Isaac Asimov",
                       "year": 1988, "genre": "science fiction", "rating": 4.0}),
    Document(page_content="Forward the Foundation...",
             metadata={"title": "Forward the Foundation", "author": "Isaac Asimov",
                       "year": 1993, "genre": "science fiction", "rating": 4.2}),
]

vstore = Chroma.from_documents(docs, OpenAIEmbeddings(model="text-embedding-3-small"))

metadata_field_info = [
    AttributeInfo(name="title", description="Book title", type="string"),
    AttributeInfo(name="author", description="Author full name", type="string"),
    AttributeInfo(name="year", description="Publication year", type="integer"),
    AttributeInfo(name="genre",
                  description="Genre: 'science fiction', 'fantasy', 'mystery', 'non-fiction'",
                  type="string"),
    AttributeInfo(name="rating",
                  description="Average reader rating 1.0-5.0", type="float"),
]

document_content_description = "Summary of a novel"

llm = ChatAnthropic(model="claude-sonnet-4-5-20250929", temperature=0)

retriever = SelfQueryRetriever.from_llm(
    llm=llm,
    vectorstore=vstore,
    document_contents=document_content_description,
    metadata_field_info=metadata_field_info,
    enable_limit=True,              # "top 3 books..." populates `k`
    use_original_query=False,       # pass the rewritten semantic query
    verbose=True,
)

docs = retriever.invoke("Asimov novels after 1970 rated above 4")
```

The LLM emits a structured query that the translator converts to Chroma's filter syntax:

```python
{
    "query": "novels",
    "filter": {
        "$and": [
            {"author": {"$eq": "Isaac Asimov"}},
            {"year": {"$gt": 1970}},
            {"rating": {"$gt": 4}},
        ]
    },
    "limit": 4
}
```

## Supported Comparators and Operators

Built-in (availability varies per backend):

| Comparator | Semantics | Ex |
|---|---|---|
| `eq` | equal | `author == "Asimov"` |
| `ne` | not equal | `genre != "fantasy"` |
| `gt` `gte` | greater than (or equal) | `year > 2000` |
| `lt` `lte` | less than (or equal) | `rating <= 3` |
| `contain` | substring match | `title contains "Foundation"` |
| `in` `nin` | (not) in set | `genre in ["sci-fi","fantasy"]` |
| `like` | regex/wildcard (backend) | `title like "Forward*"` |

Operators: `and`, `or`, `not`.

Pinecone, Weaviate, Qdrant, pgvector, Elasticsearch, Milvus, Chroma, and MongoDB each have a translator class in `langchain.retrievers.self_query.*`.

## Qdrant Example (production vector DB)

```python
from langchain_qdrant import QdrantVectorStore

vstore = QdrantVectorStore.from_documents(
    docs, OpenAIEmbeddings(), url="http://localhost:6333", collection_name="books"
)

retriever = SelfQueryRetriever.from_llm(
    llm=llm,
    vectorstore=vstore,
    document_contents=document_content_description,
    metadata_field_info=metadata_field_info,
)
```

The Qdrant translator maps to native `must`/`should`/`must_not` clauses with `range`, `match`, `match_any`.

## Custom Prompt for Better Filter Inference

The default prompt is good but domain-specific hints pay off on narrow schemas.

```python
from langchain.chains.query_constructor.base import (
    StructuredQueryOutputParser, get_query_constructor_prompt,
)
from langchain.retrievers.self_query.chroma import ChromaTranslator

examples = [
    (
        "top 5 highly rated sci-fi from the 80s",
        {
            "query": "science fiction novels",
            "filter": 'and(eq("genre","science fiction"),gte("year",1980),lte("year",1989),gte("rating",4))',
            "limit": 5,
        },
    ),
    (
        "anything by Asimov except Foundation",
        {
            "query": "novels",
            "filter": 'and(eq("author","Isaac Asimov"),ne("title","Foundation"))',
        },
    ),
]

prompt = get_query_constructor_prompt(
    document_contents=document_content_description,
    attribute_info=metadata_field_info,
    examples=examples,
)
output_parser = StructuredQueryOutputParser.from_components()
query_constructor = prompt | llm | output_parser

retriever = SelfQueryRetriever(
    query_constructor=query_constructor,
    vectorstore=vstore,
    structured_query_translator=ChromaTranslator(),
)
```

Include 3-5 domain-specific examples. Test-time accuracy improves 10-30% vs the default prompt on non-trivial schemas.

## LlamaIndex AutoRetriever

```python
from llama_index.core.retrievers import VectorIndexAutoRetriever
from llama_index.core.vector_stores.types import MetadataInfo, VectorStoreInfo
from llama_index.llms.anthropic import Anthropic

vector_store_info = VectorStoreInfo(
    content_info="summary of a novel",
    metadata_info=[
        MetadataInfo(name="author", type="str", description="Author full name"),
        MetadataInfo(name="year", type="int", description="Publication year"),
        MetadataInfo(name="genre", type="str",
                     description="One of science fiction, fantasy, mystery, non-fiction"),
        MetadataInfo(name="rating", type="float", description="Rating 1.0-5.0"),
    ],
)

retriever = VectorIndexAutoRetriever(
    index,
    vector_store_info=vector_store_info,
    llm=Anthropic(model="claude-sonnet-4-5-20250929"),
    similarity_top_k=10,
    empty_query_top_k=10,      # if the LLM produces empty semantic query
    verbose=True,
)
nodes = retriever.retrieve("Asimov novels after 1970 rated above 4")
```

## Combining with Hybrid Search

Self-query produces `(query, filter)`. Pass the filter to both the dense retriever and the BM25 retriever; BM25 handles filter via post-filtering since most implementations have no native metadata filter.

```python
from langchain_community.retrievers import BM25Retriever
from langchain.retrievers import EnsembleRetriever

def self_query_hybrid(nl_query: str):
    structured = query_constructor.invoke({"query": nl_query})
    filter_fn = make_python_filter(structured.filter)

    filtered_docs = [d for d in all_docs if filter_fn(d.metadata)]
    if not filtered_docs:
        return []

    bm25 = BM25Retriever.from_documents(filtered_docs); bm25.k = 20
    dense = vstore.as_retriever(search_kwargs={"k": 20, "filter": structured.filter})

    hybrid = EnsembleRetriever(retrievers=[bm25, dense], weights=[0.4, 0.6])
    return hybrid.invoke(structured.query)
```

## Evaluating Filter Correctness

Build a labeled set `(nl_query, expected_filter, expected_query)`. Score with exact filter equality and semantic match for the query.

```python
from dataclasses import dataclass
from typing import Any

@dataclass
class FilterTest:
    nl: str
    expected_filter: dict[str, Any]
    expected_query: str

tests = [
    FilterTest("Asimov post-2000", {"$and": [{"author":"Isaac Asimov"},{"year":{"$gt":2000}}]}, "novels"),
    FilterTest("5-star fantasy", {"$and": [{"genre":"fantasy"},{"rating":{"$gte":5.0}}]}, "fantasy novels"),
]

def filter_accuracy(constructor, tests):
    correct = 0
    for t in tests:
        out = constructor.invoke({"query": t.nl})
        if normalize(out.filter) == normalize(t.expected_filter):
            correct += 1
    return correct / len(tests)
```

Track filter accuracy separately from retrieval accuracy. A wrong filter can produce zero results; a wrong semantic query produces low precision.

## Pitfalls on Sparse/High-Cardinality Fields

`genre in {sci-fi, fantasy, mystery}` — the LLM must pick the canonical spelling. Describe the enum in `AttributeInfo.description`, or pre-validate:

```python
VALID_GENRES = {"science fiction", "fantasy", "mystery", "non-fiction"}

def validate(filter_dict):
    # pseudo: walk the filter tree; reject unknown genres
    ...
```

For high-cardinality fields (author: 10k names), provide a lookup or ask the LLM to normalize with a second pass.

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Too-broad metadata schema (50 fields) | Keep schema tight; LLM gets confused above ~15 fields |
| Vague attribute descriptions | Describe enums, units, formats explicitly |
| No temperature=0 on the constructor LLM | Non-determinism destroys reproducibility |
| Using Haiku for complex filter logic | Sonnet needed for 3+ operator combinations |
| Ignoring the semantic query half | "books by Asimov after 2000" semantic = "books" — still needed for ranking |
| Hardcoding filter syntax per backend | Use provided translators |
| No eval set | Cannot tell if filter rewrites regress across prompt changes |
| Silent filter failures | Log the generated filter per query |
| Dense-only when filter is highly restrictive | Post-filter empty -> raise user-friendly message, loosen filter |
| Treating `or` as default | Default to `and`; OR blows up precision |

## Production Checklist

- [ ] Metadata schema documented with types, enums, and units
- [ ] Examples embedded in the constructor prompt (3-5 domain cases)
- [ ] Temperature 0 on the constructor LLM
- [ ] Filter accuracy eval set (>= 50 labeled queries)
- [ ] Structured output validation (Pydantic) on the constructor step
- [ ] Translator matched to the active vector backend
- [ ] Hybrid search runs with the same filter applied to BM25 and dense
- [ ] Empty-result handler loosens filter or asks user to clarify
- [ ] Generated filter logged per query for tracing
- [ ] Fallback to plain similarity when the constructor fails
- [ ] High-cardinality fields normalized (LLM second pass or lookup)
- [ ] Cost tracked — constructor is one extra LLM call per query
