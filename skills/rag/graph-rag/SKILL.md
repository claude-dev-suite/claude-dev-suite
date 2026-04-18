---
name: graph-rag
description: |
  Knowledge-graph-augmented retrieval. Entity and triple extraction, graph
  construction (Neo4j, LlamaIndex PropertyGraphIndex), hierarchical community
  summarization (Microsoft GraphRAG), personalized PageRank (HippoRAG),
  multi-hop traversal retrieval, and hybrid graph + vector pipelines.

  USE WHEN: user mentions "GraphRAG", "HippoRAG", "knowledge graph RAG",
  "entity extraction", "multi-hop reasoning", "Neo4j RAG", "LlamaIndex property graph",
  "LangChain graph retriever", "triple extraction", "community summarization"

  DO NOT USE FOR: vanilla vector RAG - use `rag-patterns`;
  multimodal inputs - use `multimodal-rag`;
  production indexing ops - use `rag-production`;
  hallucination checks - use `rag-guardrails`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Graph RAG

## When to Use Graph RAG vs Vector RAG

| Signal | Graph RAG | Vector RAG |
|---|---|---|
| Multi-hop questions ("who reports to X's manager?") | Yes | No |
| Entity-centric queries with fan-out | Yes | Partial |
| Global/thematic questions over a corpus | GraphRAG community summaries | No |
| Local "find me similar text" lookup | Overkill | Yes |
| Structured relations already exist (SQL, CRM) | Strong fit | Weak |
| Low-latency, high-QPS chat | Hybrid (graph for reasoning, vector for context) | Yes |

Rule of thumb: use graph RAG when the answer requires **connecting** pieces of information across documents; use vector RAG when the answer lives inside a single chunk.

## Entity and Triple Extraction

```python
# Using Claude to extract (subject, predicate, object) triples
import anthropic, json, re

client = anthropic.Anthropic()

EXTRACT_PROMPT = """Extract all factual triples from the text as JSON.
Schema: [{"s": "...", "p": "...", "o": "...", "s_type": "Person|Org|Product|Concept", "o_type": "..."}]
Only extract facts explicitly stated. Normalize entity names (no pronouns).

Text:
{text}

Return JSON only."""

def extract_triples(text: str) -> list[dict]:
    msg = client.messages.create(
        model="claude-opus-4-5",
        max_tokens=2000,
        messages=[{"role": "user", "content": EXTRACT_PROMPT.format(text=text)}],
    )
    raw = msg.content[0].text
    return json.loads(re.search(r"\[.*\]", raw, re.DOTALL).group(0))
```

For high-volume extraction, use a cheaper model (`claude-haiku-4-5` or `gpt-4o-mini`) and batch 10-20 chunks per call. Cache by `sha256(chunk)` to avoid re-extraction.

## Neo4j + Embeddings Hybrid Store

```python
from neo4j import GraphDatabase
from openai import OpenAI

driver = GraphDatabase.driver("bolt://localhost:7687", auth=("neo4j", "pass"))
oai = OpenAI()

CREATE_SCHEMA = """
CREATE CONSTRAINT entity_name IF NOT EXISTS FOR (e:Entity) REQUIRE e.name IS UNIQUE;
CREATE VECTOR INDEX entity_embed IF NOT EXISTS
  FOR (e:Entity) ON (e.embedding)
  OPTIONS {indexConfig: {`vector.dimensions`: 1536, `vector.similarity_function`: 'cosine'}};
"""

def embed(text: str) -> list[float]:
    return oai.embeddings.create(model="text-embedding-3-small", input=text).data[0].embedding

def upsert_triple(tx, s, p, o, s_type, o_type, source_chunk_id):
    tx.run("""
        MERGE (a:Entity {name: $s}) SET a.type = $s_type, a.embedding = $s_emb
        MERGE (b:Entity {name: $o}) SET b.type = $o_type, b.embedding = $o_emb
        MERGE (a)-[r:REL {type: $p}]->(b)
        SET r.source = $src
    """, s=s, o=o, p=p, s_type=s_type, o_type=o_type,
        s_emb=embed(s), o_emb=embed(o), src=source_chunk_id)

with driver.session() as s:
    s.run(CREATE_SCHEMA)
    for t in triples:
        s.execute_write(upsert_triple, t["s"], t["p"], t["o"],
                        t["s_type"], t["o_type"], chunk_id)
```

### Graph-augmented retrieval (entity seed + n-hop expansion)

```cypher
// Find entities semantically similar to the query, then expand 2 hops
CALL db.index.vector.queryNodes('entity_embed', 5, $query_embedding)
YIELD node AS seed, score
MATCH path = (seed)-[*1..2]-(neighbor:Entity)
WITH seed, neighbor, score, [r IN relationships(path) | r.type] AS rels
RETURN seed.name, neighbor.name, rels, score
ORDER BY score DESC LIMIT 30;
```

## Microsoft GraphRAG (Community Summarization)

GraphRAG's insight: after building the entity graph, run **hierarchical community detection** (Leiden), summarize each community with an LLM, and use those summaries for **global** queries.

```python
# pip install graphrag
# graphrag init --root ./ragtest
# Configure settings.yaml with OpenAI/Azure keys, then:
#   graphrag index --root ./ragtest
#
# Query modes:
#   graphrag query --method local  "What did Alice work on?"
#   graphrag query --method global "Summarize all regulatory themes in the corpus"
#   graphrag query --method drift  "How do safety issues relate to recalls?"

from graphrag.query.structured_search.local_search.search import LocalSearch
from graphrag.query.structured_search.global_search.search import GlobalSearch

# Local = entity-centric (start from entities matching the query, walk graph)
# Global = map-reduce over community summaries (thematic / corpus-wide)
# DRIFT  = hybrid: local seed, global expansion for connective tissue
```

When to pick which mode:
- **Local**: "What's X's role?", "Who did X work with?" - starts from named entities.
- **Global**: "Main themes", "Recurring risks", "Summarize the corpus" - needs community reports.
- **DRIFT**: multi-hop exploratory questions where local and global both matter.

## HippoRAG (Personalized PageRank)

HippoRAG builds a passage-to-entity graph once, then at query time:
1. NER on query to find seed entities.
2. Run Personalized PageRank (PPR) with seeds as the teleport distribution.
3. Rank passages by aggregated PPR mass of their entities.

```python
# pip install hipporag
from hipporag import HippoRAG

hipporag = HippoRAG(
    save_dir="./hippo_index",
    llm_model_name="gpt-4o-mini",
    embedding_model_name="nvidia/NV-Embed-v2",
)

hipporag.index(docs=["passage 1...", "passage 2...", "passage 3..."])
answers = hipporag.rag_qa(queries=["Which researcher's student works on X?"])
```

Use HippoRAG when you need **single-step multi-hop** retrieval without building explicit Cypher queries.

## LlamaIndex Property Graph Index

```python
from llama_index.core import PropertyGraphIndex, Document
from llama_index.core.indices.property_graph import (
    SchemaLLMPathExtractor, ImplicitPathExtractor,
)
from llama_index.graph_stores.neo4j import Neo4jPropertyGraphStore
from llama_index.llms.anthropic import Anthropic
from llama_index.embeddings.openai import OpenAIEmbedding
from typing import Literal

Entities = Literal["Person", "Org", "Product", "Concept"]
Relations = Literal["WORKS_AT", "FOUNDED", "USES", "RELATED_TO"]

graph_store = Neo4jPropertyGraphStore(
    username="neo4j", password="pass", url="bolt://localhost:7687",
)

index = PropertyGraphIndex.from_documents(
    [Document(text=t) for t in corpus],
    property_graph_store=graph_store,
    kg_extractors=[
        SchemaLLMPathExtractor(
            llm=Anthropic(model="claude-opus-4-5"),
            possible_entities=Entities,
            possible_relations=Relations,
            strict=True,  # drop triples not matching schema
        ),
        ImplicitPathExtractor(),  # adds MENTIONS edges from chunks to entities
    ],
    embed_model=OpenAIEmbedding(model="text-embedding-3-small"),
    show_progress=True,
)

# Query with graph + vector hybrid
retriever = index.as_retriever(
    include_text=True,
    similarity_top_k=10,
    path_depth=2,   # expand 2 hops from seed entities
)
nodes = retriever.retrieve("Which founders worked at companies that use Kafka?")
```

## LangChain Graph Retriever

```python
from langchain_neo4j import Neo4jGraph, GraphCypherQAChain
from langchain_anthropic import ChatAnthropic

graph = Neo4jGraph(url="bolt://localhost:7687", username="neo4j", password="pass")
graph.refresh_schema()

chain = GraphCypherQAChain.from_llm(
    llm=ChatAnthropic(model="claude-opus-4-5"),
    graph=graph,
    verbose=True,
    allow_dangerous_requests=True,  # LLM writes Cypher; restrict DB user to read-only
    validate_cypher=True,
    return_intermediate_steps=True,
)

result = chain.invoke({"query": "Who reports to Alice's manager?"})
# Inspect result["intermediate_steps"][0]["query"] for the generated Cypher
```

**Safety**: always give the Neo4j role only `MATCH`/read privileges; never let an LLM write or delete.

## Hybrid Graph + Vector Pipeline

```python
def hybrid_retrieve(query: str, k_vec: int = 10, k_graph: int = 10):
    # 1. Semantic top-K from chunk vector index
    vec_hits = vectorstore.similarity_search(query, k=k_vec)

    # 2. Graph traversal seeded by query entities
    entities = extract_entities(query)
    with driver.session() as s:
        graph_hits = s.run("""
            MATCH (e:Entity) WHERE e.name IN $ents
            MATCH (e)-[*1..2]-(n:Entity)<-[:MENTIONS]-(c:Chunk)
            RETURN DISTINCT c.id AS id, c.text AS text
            LIMIT $k
        """, ents=entities, k=k_graph).data()

    # 3. Rerank the union with Cohere or a cross-encoder
    return rerank(query, vec_hits + graph_hits, top_n=6)
```

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Extracting triples with no schema | Constrain entity/relation types via `SchemaLLMPathExtractor` |
| LLM-generated Cypher with write access | Grant read-only role; validate with `validate_cypher` |
| No entity normalization (Alice vs A. Smith) | Canonicalize with embedding clustering + name-matching |
| GraphRAG with tiny corpus | Community summaries add little under ~50 docs; use local mode only |
| Building graph every query | Index once; incrementally update on new docs |
| Ignoring provenance | Every edge must store `source_chunk_id` for citations |

## Production Checklist

- [ ] Schema for entities and relations documented and enforced
- [ ] Entity canonicalization step (dedup aliases before insert)
- [ ] Provenance (source chunk + offsets) stored on every edge
- [ ] Read-only DB credentials for LLM-generated Cypher
- [ ] Incremental graph updates on doc ingest (no full rebuilds in prod)
- [ ] Hybrid retriever (graph + vector + rerank) benchmarked vs vector-only
- [ ] Community summaries refreshed on a schedule (GraphRAG)
- [ ] Latency budget: graph traversal capped (e.g., `LIMIT 50`, depth <= 2)
