---
name: tabular-rag
description: |
  Structured data + RAG. NL2SQL hybrid patterns (text-to-SQL then execute vs embed
  rows), table embedding strategies (row-level, schema-level, hybrid), semantic
  layer integration (Cube, dbt metrics), LangChain SQLDatabaseChain, LlamaIndex
  PandasQueryEngine, safe SQL execution (read-only, sandboxed), schema-aware
  retrieval. Full PostgreSQL + pgvector hybrid code.

  USE WHEN: user mentions "tabular RAG", "NL2SQL", "text to SQL", "RAG on tables",
  "database RAG", "SQL RAG", "semantic layer", "structured data RAG"

  DO NOT USE FOR: unstructured doc RAG - use `rag-architecture`;
  metadata filtering only - use `self-querying-retriever`;
  KG retrieval - use `graph-rag`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Tabular RAG

## Three Patterns for Tables

| Pattern | Retrieves | Strength | Weakness |
|---|---|---|---|
| NL2SQL | Rows via generated SQL | Exact aggregations, joins | Brittle on ambiguous queries |
| Row-embedding | Rows as documents | Fuzzy semantic match on content | Bad at aggregates |
| Schema-embedding | Table/column metadata | Routing across many tables | Needs NL2SQL second step |
| Hybrid | All three composed | Production-quality | Orchestration cost |

## Pattern 1: NL2SQL

Generate SQL from natural language, execute safely, format the result.

### Minimum Viable Pipeline

```python
from langchain_community.utilities import SQLDatabase
from langchain.chains import create_sql_query_chain
from langchain_anthropic import ChatAnthropic
from sqlalchemy import create_engine

engine = create_engine("postgresql+psycopg://ro_user:***@db:5432/analytics",
                       connect_args={"options": "-c default_transaction_read_only=on"})
db = SQLDatabase(engine, sample_rows_in_table_info=3, view_support=True)

llm = ChatAnthropic(model="claude-sonnet-4-5-20250929", temperature=0)
sql_chain = create_sql_query_chain(llm, db)

sql = sql_chain.invoke({"question": "Total revenue by region for Q3 2025"})
result = db.run(sql)
```

Always bind to a read-only role at the database level. Belt-and-suspenders: `SET TRANSACTION READ ONLY` and app-level guards.

### Schema Trimming for Large Databases

Schema pasted wholesale blows the context window and confuses the model. Route to the relevant tables first.

```python
from langchain_core.documents import Document
from langchain_qdrant import QdrantVectorStore
from langchain_openai import OpenAIEmbeddings

def table_docs(db):
    docs = []
    for t in db.get_usable_table_names():
        info = db.get_table_info([t])
        docs.append(Document(page_content=info, metadata={"table": t}))
    return docs

table_store = QdrantVectorStore.from_documents(
    table_docs(db), OpenAIEmbeddings(), collection_name="schemas"
)

def relevant_schema(question: str, k: int = 5) -> str:
    hits = table_store.similarity_search(question, k=k)
    return "\n\n".join(d.page_content for d in hits)
```

Pass `relevant_schema(question)` to the SQL chain instead of the full DB schema.

### Safe Execution

```python
import re
from sqlalchemy.exc import SQLAlchemyError

BLOCKED = re.compile(r"\b(INSERT|UPDATE|DELETE|DROP|TRUNCATE|ALTER|CREATE|GRANT|REVOKE)\b", re.I)

def execute_safe(sql: str, engine) -> list[dict]:
    if BLOCKED.search(sql):
        raise ValueError("Mutating SQL not allowed")
    if ";" in sql.rstrip(";"):
        raise ValueError("Multi-statement SQL not allowed")
    with engine.connect() as conn:
        conn.execute(sqlalchemy.text("SET statement_timeout = '5s'"))
        conn.execute(sqlalchemy.text("SET LOCAL lock_timeout = '1s'"))
        rows = conn.execute(sqlalchemy.text(sql)).mappings().all()
        return [dict(r) for r in rows[:1000]]
```

Defense in depth:
1. Read-only DB role (primary defense).
2. Regex blocker for mutating keywords.
3. Single-statement enforcement.
4. `statement_timeout` and `lock_timeout`.
5. Result size cap.

### Self-Correcting SQL

The LLM produces invalid SQL ~10-20% of the time. Let it see the error and try again.

```python
def generate_with_retry(question: str, max_attempts: int = 3):
    errors = []
    for _ in range(max_attempts):
        sql = sql_chain.invoke({
            "question": question,
            "previous_errors": "\n".join(errors),
        })
        try:
            return sql, execute_safe(sql, engine)
        except (SQLAlchemyError, ValueError) as e:
            errors.append(f"Query: {sql}\nError: {e}")
    raise RuntimeError("SQL generation failed", errors)
```

## Pattern 2: Row Embedding

Embed each row (or row + neighbors) into a vector store. Works for fuzzy text-content tables (support tickets, job descriptions, product catalogs).

```python
from langchain_core.documents import Document

def row_to_doc(row: dict, table: str) -> Document:
    # Verbalize the row
    text = "\n".join(f"{k}: {v}" for k, v in row.items() if v is not None)
    return Document(
        page_content=text,
        metadata={"table": table, "id": row["id"], **{k: v for k, v in row.items()
                                                       if isinstance(v, (str, int, float, bool))}},
    )

rows = db.run("SELECT * FROM support_tickets", fetch="all")
docs = [row_to_doc(r, "support_tickets") for r in rows]

store = QdrantVectorStore.from_documents(docs, OpenAIEmbeddings(),
                                         collection_name="tickets")
```

Keep a `source` metadata field pointing to the canonical row so you can re-read fresh values.

## Pattern 3: pgvector Hybrid (single store, structured + semantic)

Postgres + pgvector gives you SQL filters, joins, and vector similarity in one query.

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE tickets (
    id BIGINT PRIMARY KEY,
    created_at TIMESTAMPTZ,
    status TEXT,
    priority TEXT,
    customer_id BIGINT,
    subject TEXT,
    body TEXT,
    embedding VECTOR(1536)
);

CREATE INDEX ON tickets USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
CREATE INDEX ON tickets (status);
CREATE INDEX ON tickets (created_at);
```

```python
import psycopg
from openai import OpenAI

oai = OpenAI()

def hybrid_search(question: str, status: str, since: str, k: int = 10):
    emb = oai.embeddings.create(model="text-embedding-3-small", input=question).data[0].embedding
    with psycopg.connect(DSN) as conn, conn.cursor() as cur:
        cur.execute("""
            SELECT id, subject, body,
                   1 - (embedding <=> %s::vector) AS sim
            FROM tickets
            WHERE status = %s AND created_at > %s
            ORDER BY embedding <=> %s::vector
            LIMIT %s
        """, (emb, status, since, emb, k))
        return cur.fetchall()
```

Filter in SQL, rank by similarity. Pattern scales cleanly to millions of rows with HNSW + btree indexes.

## LlamaIndex PandasQueryEngine

```python
from llama_index.experimental.query_engine import PandasQueryEngine
import pandas as pd

df = pd.read_parquet("sales_q3.parquet")
qe = PandasQueryEngine(df=df, llm=Anthropic(model="claude-sonnet-4-5-20250929"),
                       verbose=True, synthesize_response=True)
response = qe.query("Total revenue by region for Q3")
```

PandasQueryEngine generates and executes Pandas code. Fast on small frames (< 10M rows) in Python memory. Sandbox the execution — same discipline as SQL.

## Semantic Layer Integration (Cube, dbt metrics)

Hand the LLM a constrained vocabulary of metrics and dimensions, not raw tables. Eliminates a whole class of errors (wrong joins, wrong grouping).

```python
# Cube.dev schema (JavaScript)
# cube('Sales', {
#   sql: `SELECT * FROM sales`,
#   measures: { revenue: { sql: `amount`, type: `sum` } },
#   dimensions: { region: { sql: `region`, type: `string` },
#                 customer: { sql: `customer_id`, type: `number` } }
# });

# LLM-to-Cube query JSON:
cube_query = {
    "measures": ["Sales.revenue"],
    "dimensions": ["Sales.region"],
    "timeDimensions": [{
        "dimension": "Sales.created_at",
        "granularity": "month",
        "dateRange": ["2025-07-01", "2025-09-30"],
    }],
}
# POST to /cubejs-api/v1/load
```

For dbt metrics, similar pattern: expose metric names + allowed dimensions; LLM produces a `dbt-sl` query.

## Evaluation

- **Execution accuracy**: does the generated SQL run and match the expected result?
- **Semantic equivalence**: SQL may differ but return the same rows — compare results, not strings.
- **Column coverage**: did the LLM find the right columns? Track columns referenced vs ground truth.

```python
def eval_sql(generated: str, expected_result, engine):
    try:
        actual = execute_safe(generated, engine)
        return set(tuple(r.values()) for r in actual) == set(tuple(r.values()) for r in expected_result)
    except Exception:
        return False
```

Benchmarks to measure against: Spider 2.0, BIRD. Claude Sonnet 4.5 achieves ~75% execution accuracy on BIRD; domain-specific prompting + schema retrieval push this to 85%+.

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Passing full schema for every query | Route to tables first |
| Write-capable DB role | Read-only role always |
| No statement timeout | Runaway queries kill the DB |
| Embedding primary-key-only rows | Include relevant text columns; verbalize |
| NL2SQL on metrics that exist in a semantic layer | Use the semantic layer — fewer errors |
| Ignoring SQL errors | Self-correct with error feedback |
| Returning raw rows to the user | Have the LLM summarize or format |
| Table embeddings out-of-sync with schema | Re-index on DDL change |
| Mixing rows from incompatible tables in one store | Separate collections per entity type |
| No cost limits | NL2SQL on a 10B-row table without LIMIT = million-dollar query |

## Production Checklist

- [ ] Database connection uses a read-only role
- [ ] `statement_timeout` and `lock_timeout` set per session
- [ ] Regex blocker for mutating keywords as a secondary guard
- [ ] Schema routing retriever (embeds table descriptions) for DBs > 10 tables
- [ ] Self-correcting SQL with error feedback, max 3 attempts
- [ ] Result size capped (1000 rows)
- [ ] Execution logged with generated SQL, duration, row count
- [ ] Semantic layer (Cube/dbt) used for known metrics when available
- [ ] Eval set of (NL, SQL, expected_result) with execution-accuracy scoring
- [ ] pgvector hybrid for mixed structured + unstructured queries
- [ ] Row-embedding pipelines triggered on CDC (see `cdc-streaming-ingestion`)
- [ ] Cost cap per query (tokens + DB runtime)
