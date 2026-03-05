# Advanced RAG Patterns

## Overview

Basic RAG — embed, retrieve, generate — works for simple question-answering but breaks down with complex queries, large documents, multi-modal data, or questions that require reasoning across multiple sources. This document covers advanced patterns that address these limitations: parent document retrieval, hypothetical document embeddings (HyDE), multi-modal RAG, graph-based RAG, recursive retrieval, query routing, and agentic RAG.

---

## Pattern 1: Parent Document Retrieval

**Problem:** Small chunks produce precise embeddings but lose context. Large chunks retain context but produce noisy embeddings.

**Solution:** Index small chunks for retrieval but return their parent (larger) document for generation.

### Python (LangChain)

```python
from langchain.retrievers import ParentDocumentRetriever
from langchain.storage import InMemoryStore
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.vectorstores import Chroma
from langchain_openai import OpenAIEmbeddings

# Small chunks for embedding (precise retrieval)
child_splitter = RecursiveCharacterTextSplitter(chunk_size=400, chunk_overlap=50)

# Larger chunks for context (passed to LLM)
parent_splitter = RecursiveCharacterTextSplitter(chunk_size=2000, chunk_overlap=200)

vectorstore = Chroma(
    collection_name="child_chunks",
    embedding_function=OpenAIEmbeddings(model="text-embedding-3-small"),
)

# Storage for parent documents
docstore = InMemoryStore()  # Use Redis or a database in production

retriever = ParentDocumentRetriever(
    vectorstore=vectorstore,
    docstore=docstore,
    child_splitter=child_splitter,
    parent_splitter=parent_splitter,
)

# Index documents
retriever.add_documents(documents)

# Retrieve: searches child chunks, returns parent documents
results = retriever.invoke("How do I configure RLS policies?")
# Results contain the full 2000-char parent chunks, not the 400-char child chunks
```

### LlamaIndex Implementation

```python
from llama_index.core.node_parser import HierarchicalNodeParser, get_leaf_nodes
from llama_index.core.retrievers import AutoMergingRetriever
from llama_index.core import VectorStoreIndex, StorageContext

# Create hierarchical nodes (large -> medium -> small)
node_parser = HierarchicalNodeParser.from_defaults(chunk_sizes=[2048, 512, 128])
nodes = node_parser.get_nodes_from_documents(documents)

# Index only leaf (smallest) nodes
leaf_nodes = get_leaf_nodes(nodes)

storage_context = StorageContext.from_defaults()
storage_context.docstore.add_documents(nodes)

index = VectorStoreIndex(leaf_nodes, storage_context=storage_context)

# AutoMergingRetriever promotes to parent when enough children match
retriever = AutoMergingRetriever(
    index.as_retriever(similarity_top_k=12),
    storage_context=storage_context,
    simple_ratio_thresh=0.3,  # Merge if 30%+ of children match
)
```

---

## Pattern 2: Hypothetical Document Embeddings (HyDE)

**Problem:** User queries are short and often poorly phrased, producing embeddings that are distant from relevant document embeddings.

**Solution:** Use an LLM to generate a hypothetical answer, embed that answer, and use its embedding for retrieval. The hypothetical answer's embedding is closer to relevant documents than the query's embedding.

### Python

```python
from langchain.chains import HypotheticalDocumentEmbedder
from langchain_openai import ChatOpenAI, OpenAIEmbeddings

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
base_embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

hyde_embeddings = HypotheticalDocumentEmbedder.from_llm(
    llm=llm,
    base_embeddings=base_embeddings,
    prompt_key="web_search",  # or custom prompt
)

# Now use hyde_embeddings as your embedding model for queries
vectorstore = Chroma(embedding_function=base_embeddings)  # Index with base embeddings
vectorstore.add_documents(documents)

# Query with HyDE: generates hypothetical doc, embeds it, searches
results = vectorstore.similarity_search_by_vector(
    hyde_embeddings.embed_query("How do I fix connection pool exhaustion?"),
    k=5,
)
```

### Custom HyDE Implementation (TypeScript)

```typescript
import { ChatOpenAI } from '@langchain/openai';
import { OpenAIEmbeddings } from '@langchain/openai';

async function hydeRetrieve(
  query: string,
  vectorstore: VectorStore,
  llm: ChatOpenAI,
  embeddings: OpenAIEmbeddings,
  k: number = 5
): Promise<Document[]> {
  // Step 1: Generate hypothetical document
  const hydeResponse = await llm.invoke([
    {
      role: 'system',
      content: 'Write a short technical document passage that would answer the given question. Do not say "I" or address the user. Just write the factual content.',
    },
    { role: 'user', content: query },
  ]);

  const hypotheticalDoc = hydeResponse.content as string;

  // Step 2: Embed the hypothetical document (not the query)
  const hydeEmbedding = await embeddings.embedQuery(hypotheticalDoc);

  // Step 3: Search with the hypothetical document's embedding
  return vectorstore.similaritySearchVectorWithScore(hydeEmbedding, k);
}
```

**Trade-off:** Adds one LLM call per query. Best for knowledge-heavy domains where query-document mismatch is a significant problem.

---

## Pattern 3: Multi-Modal RAG

**Problem:** Knowledge bases contain images, diagrams, tables, and charts that text-only RAG cannot process.

### Approach A: Describe and Embed Text Descriptions

```python
from langchain_openai import ChatOpenAI
import base64

llm = ChatOpenAI(model="gpt-4o", temperature=0)

def describe_image(image_path: str) -> str:
    """Generate a text description of an image for embedding."""
    with open(image_path, "rb") as f:
        image_data = base64.standard_b64encode(f.read()).decode()

    response = llm.invoke([
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "Describe this technical diagram in detail, including all labels, relationships, and data points. Be thorough."},
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{image_data}"}},
            ],
        }
    ])

    return response.content

# Create documents from images
image_docs = []
for image_path in Path("diagrams/").glob("*.png"):
    description = describe_image(str(image_path))
    image_docs.append(Document(
        page_content=description,
        metadata={"source": str(image_path), "type": "image", "original_image": str(image_path)},
    ))

# Index descriptions alongside text documents
vectorstore.add_documents(image_docs + text_docs)
```

### Approach B: Multi-Modal Embeddings (CLIP / ColPali)

```python
from llama_index.multi_modal_llms.openai import OpenAIMultiModal
from llama_index.core import SimpleDirectoryReader
from llama_index.core.indices.multi_modal import MultiModalVectorStoreIndex

# Load documents including images
documents = SimpleDirectoryReader(
    input_dir="./docs",
    required_exts=[".md", ".txt", ".png", ".jpg"],
).load_data()

# Create multi-modal index
index = MultiModalVectorStoreIndex.from_documents(
    documents,
    image_embed_model="clip",
)

# Query with text or image
retriever = index.as_retriever(similarity_top_k=5, image_similarity_top_k=3)
results = retriever.retrieve("Show me the architecture diagram for the auth flow")
```

### Table Extraction

```python
import pdfplumber

def extract_tables_from_pdf(pdf_path: str) -> list[Document]:
    """Extract tables from PDF and convert to markdown for embedding."""
    docs = []

    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages):
            tables = page.extract_tables()
            for j, table in enumerate(tables):
                # Convert to markdown table
                if not table or not table[0]:
                    continue

                headers = table[0]
                md = "| " + " | ".join(str(h) for h in headers) + " |\n"
                md += "| " + " | ".join("---" for _ in headers) + " |\n"
                for row in table[1:]:
                    md += "| " + " | ".join(str(c) for c in row) + " |\n"

                docs.append(Document(
                    page_content=md,
                    metadata={"source": pdf_path, "page": i + 1, "table_index": j, "type": "table"},
                ))

    return docs
```

---

## Pattern 4: Graph-Based RAG (GraphRAG)

**Problem:** Standard RAG retrieves isolated chunks and misses relationships between entities across documents.

**Solution:** Build a knowledge graph from documents and traverse it during retrieval.

### Building the Knowledge Graph

```python
from langchain_openai import ChatOpenAI
from langchain_community.graphs import Neo4jGraph
import json

llm = ChatOpenAI(model="gpt-4o", temperature=0)
graph = Neo4jGraph(url="bolt://localhost:7687", username="neo4j", password="password")

def extract_entities_and_relations(text: str) -> dict:
    """Use LLM to extract entities and relationships from text."""
    response = llm.invoke([{
        "role": "user",
        "content": f"""Extract entities and relationships from this text.
Return JSON: {{"entities": [{{"name": "...", "type": "..."}}], "relationships": [{{"source": "...", "target": "...", "relation": "..."}}]}}

Text: {text}"""
    }])

    return json.loads(response.content)


# Build graph from documents
for doc in documents:
    extracted = extract_entities_and_relations(doc.page_content)

    for entity in extracted["entities"]:
        graph.query(
            "MERGE (e:Entity {name: $name}) SET e.type = $type",
            {"name": entity["name"], "type": entity["type"]}
        )

    for rel in extracted["relationships"]:
        graph.query(
            """MATCH (a:Entity {name: $source}), (b:Entity {name: $target})
               MERGE (a)-[r:RELATED {type: $relation}]->(b)""",
            {"source": rel["source"], "target": rel["target"], "relation": rel["relation"]}
        )
```

### Graph-Enhanced Retrieval

```python
from langchain_community.chains import GraphCypherQAChain

chain = GraphCypherQAChain.from_llm(
    llm=ChatOpenAI(model="gpt-4o"),
    graph=graph,
    verbose=True,
)

# The LLM generates a Cypher query, executes it, and synthesizes an answer
response = chain.invoke({"query": "What technologies depend on PostgreSQL in our stack?"})
```

### Combining Graph + Vector Search

```python
async def graph_enhanced_retrieve(query: str, vectorstore, graph, k: int = 5):
    """Retrieve from both vector store and knowledge graph, merge results."""

    # Vector search for semantic matches
    vector_results = vectorstore.similarity_search(query, k=k)

    # Extract entities from query
    entities = extract_entities_from_query(query)

    # Graph traversal for related context
    graph_context = []
    for entity in entities:
        neighbors = graph.query(
            """MATCH (e:Entity {name: $name})-[r]->(related)
               RETURN related.name, r.type, related.type
               LIMIT 10""",
            {"name": entity}
        )
        graph_context.extend(neighbors)

    # Merge: vector results provide detailed passages, graph provides relationship context
    return {
        "passages": vector_results,
        "graph_context": graph_context,
    }
```

---

## Pattern 5: Recursive Retrieval

**Problem:** Some questions require information from multiple documents that reference each other, or require progressively deeper exploration.

### Implementation

```python
async def recursive_retrieve(
    query: str,
    vectorstore,
    llm,
    max_depth: int = 3,
    k: int = 5
) -> list[Document]:
    """Recursively retrieve documents, following references."""
    all_results = []
    visited_ids = set()
    current_query = query

    for depth in range(max_depth):
        results = vectorstore.similarity_search(current_query, k=k)

        new_results = [r for r in results if r.metadata.get("id") not in visited_ids]
        if not new_results:
            break

        all_results.extend(new_results)
        visited_ids.update(r.metadata.get("id") for r in new_results)

        # Ask LLM if more context is needed
        context = "\n".join(r.page_content for r in new_results)
        follow_up = await llm.ainvoke([{
            "role": "user",
            "content": f"""Based on this context, is there missing information needed to answer: "{query}"?
If yes, generate a follow-up search query. If no, respond with "SUFFICIENT".

Context: {context}""",
        }])

        if "SUFFICIENT" in follow_up.content:
            break

        current_query = follow_up.content.strip()

    return all_results
```

---

## Pattern 6: Query Routing

**Problem:** Different types of questions need different retrieval strategies or data sources.

### LangChain Router

```python
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

route_prompt = ChatPromptTemplate.from_template("""Classify this question into one of these categories:
- "api_reference" - specific API endpoints, parameters, response formats
- "conceptual" - architecture, design patterns, best practices
- "troubleshooting" - errors, debugging, performance issues
- "tutorial" - step-by-step guides, how-to instructions

Question: {question}

Category:""")

router = route_prompt | llm | StrOutputParser()

# Different retrieval strategies per route
retrievers = {
    "api_reference": vectorstore.as_retriever(
        search_type="similarity",
        search_kwargs={"k": 3, "filter": {"doc_type": "api-reference"}},
    ),
    "conceptual": vectorstore.as_retriever(
        search_type="mmr",
        search_kwargs={"k": 5, "fetch_k": 20, "lambda_mult": 0.5},
    ),
    "troubleshooting": ensemble_retriever,  # Hybrid search for error codes
    "tutorial": vectorstore.as_retriever(
        search_kwargs={"k": 5, "filter": {"doc_type": "tutorial"}},
    ),
}

async def routed_retrieve(question: str) -> list[Document]:
    route = await router.ainvoke({"question": question})
    route = route.strip().lower()
    retriever = retrievers.get(route, retrievers["conceptual"])
    return retriever.invoke(question)
```

### TypeScript Implementation

```typescript
type RouteType = 'api_reference' | 'conceptual' | 'troubleshooting' | 'tutorial';

async function routeQuery(query: string, llm: ChatOpenAI): Promise<RouteType> {
  const response = await llm.invoke([
    {
      role: 'system',
      content: 'Classify the question as: api_reference, conceptual, troubleshooting, or tutorial. Return only the category.',
    },
    { role: 'user', content: query },
  ]);

  const route = (response.content as string).trim().toLowerCase();
  const valid: RouteType[] = ['api_reference', 'conceptual', 'troubleshooting', 'tutorial'];
  return valid.includes(route as RouteType) ? (route as RouteType) : 'conceptual';
}

async function routedRetrieve(query: string): Promise<Document[]> {
  const route = await routeQuery(query, llm);

  switch (route) {
    case 'api_reference':
      return vectorstore.similaritySearch(query, 3, { doc_type: 'api-reference' });
    case 'troubleshooting':
      return hybridSearch(query, { keywordWeight: 0.6, vectorWeight: 0.4 });
    default:
      return vectorstore.maxMarginalRelevanceSearch(query, { k: 5, fetchK: 20 });
  }
}
```

---

## Pattern 7: Agentic RAG with Tool Use

**Problem:** Complex questions require multiple retrieval steps, calculations, or external API calls that a single retrieve-and-generate cycle cannot handle.

### LangChain Agent with RAG Tools

```python
from langchain.agents import AgentExecutor, create_openai_tools_agent
from langchain.tools.retriever import create_retriever_tool
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

# Create retrieval tools
docs_retriever_tool = create_retriever_tool(
    docs_retriever,
    name="search_documentation",
    description="Search the technical documentation for information about APIs, configuration, and architecture.",
)

code_retriever_tool = create_retriever_tool(
    code_retriever,
    name="search_codebase",
    description="Search the codebase for implementation details, function signatures, and usage examples.",
)

# Custom tool for structured data
from langchain.tools import tool

@tool
def query_database(sql_description: str) -> str:
    """Query the database for metrics or configuration data. Describe what data you need."""
    # LLM generates SQL from description, executes safely
    sql = generate_safe_sql(sql_description)
    return execute_readonly_query(sql)

# Build the agent
llm = ChatOpenAI(model="gpt-4o", temperature=0)

prompt = ChatPromptTemplate.from_messages([
    ("system", """You are a technical assistant with access to documentation, code search, and database tools.
Use the tools to find relevant information before answering. Always cite your sources.
If a single tool call is insufficient, make multiple calls to gather complete information."""),
    ("user", "{input}"),
    MessagesPlaceholder(variable_name="agent_scratchpad"),
])

agent = create_openai_tools_agent(
    llm=llm,
    tools=[docs_retriever_tool, code_retriever_tool, query_database],
    prompt=prompt,
)

executor = AgentExecutor(agent=agent, tools=[docs_retriever_tool, code_retriever_tool, query_database], verbose=True)

# The agent decides which tools to call and in what order
response = executor.invoke({
    "input": "What is the current RLS configuration for the orders table, and does it follow our documented best practices?"
})
# Agent: 1) Searches docs for RLS best practices
#         2) Searches codebase for current RLS policies
#         3) Compares and generates a gap analysis
```

### LlamaIndex Agent

```python
from llama_index.core.agent import ReActAgent
from llama_index.core.tools import QueryEngineTool

# Create query engine tools from different indexes
docs_tool = QueryEngineTool.from_defaults(
    query_engine=docs_index.as_query_engine(),
    name="documentation",
    description="Search technical documentation for architecture and configuration guidance.",
)

code_tool = QueryEngineTool.from_defaults(
    query_engine=code_index.as_query_engine(),
    name="codebase",
    description="Search the codebase for implementation details and examples.",
)

agent = ReActAgent.from_tools(
    tools=[docs_tool, code_tool],
    llm=llm,
    verbose=True,
    max_iterations=10,
)

response = agent.chat("Compare our auth implementation with the documented security requirements")
```

---

## Anti-Patterns

1. **Applying advanced patterns prematurely.** Start with basic RAG (recursive character splitting, similarity search, re-ranking). Only add complexity when you have measurable evidence that basic RAG is insufficient.
2. **HyDE without measuring improvement.** HyDE adds latency and cost. Benchmark it against direct query embedding on your eval set before deploying.
3. **Graph RAG without enough entity density.** If your documents are loosely related (e.g., independent FAQ entries), a knowledge graph adds overhead without benefit.
4. **Agentic RAG without guardrails.** Agents can loop, call wrong tools, or generate expensive multi-step chains. Set max iterations, tool call limits, and timeout budgets.
5. **Multi-modal RAG that drops image context.** If you describe images for embedding but do not pass the original image to the generation LLM, you lose visual detail.
6. **Recursive retrieval without termination conditions.** Always set a max depth and detect when additional retrieval yields no new information.

---

## Production Checklist

- [ ] Advanced patterns are justified by evaluation metrics showing basic RAG is insufficient
- [ ] Parent document retrieval uses a persistent docstore (Redis, PostgreSQL), not in-memory
- [ ] HyDE is benchmarked against baseline with A/B evaluation on the eval dataset
- [ ] Query routing classifications are logged and monitored for accuracy
- [ ] Agentic RAG has max iteration limits, timeout budgets, and cost caps per query
- [ ] Knowledge graph is updated when source documents change (incremental extraction)
- [ ] Multi-modal pipeline handles OCR errors and missing images gracefully
- [ ] Recursive retrieval has termination conditions (max depth, diminishing returns detection)
- [ ] All patterns have fallback to basic similarity search on failure
- [ ] Latency budgets are defined: simple queries under 2s, complex agentic queries under 15s
- [ ] Cost per query is tracked and alerted when agentic patterns exceed budget
