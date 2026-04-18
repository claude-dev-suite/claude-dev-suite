---
name: knowledge-graph-construction
description: |
  Building knowledge graphs from unstructured text. LLM-based triple
  extraction (subject-predicate-object), schema-guided extraction via
  Pydantic + structured output, REBEL model, OpenIE, entity linking to
  Wikidata/DBpedia, validation with LLM judges, incremental KG updates,
  and exporting to Neo4j / Amazon Neptune / TigerGraph. Full pipeline.

  USE WHEN: user mentions "knowledge graph construction", "KG construction",
  "triple extraction", "OpenIE", "REBEL", "Pydantic triples",
  "entity linking Wikidata", "build knowledge graph", "extract triples"

  DO NOT USE FOR: graph RAG retrieval - use `graph-rag`;
  deduping/canonicalizing entities - use `entity-resolution`;
  ontology-aware retrieval - use `ontology-guided-retrieval`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Knowledge Graph Construction

Turning unstructured documents into a queryable graph has four stages: extract, link, validate, load. Skip any one and you get a graph that's either empty, hallucinated, inconsistent, or unusable.

## Pipeline Overview

```
chunks → extract (entities + triples) → link (canonical IDs / KB entries)
       → validate (schema, LLM judge) → load (Neo4j / Neptune / TigerGraph)
       → incremental updates on new ingests
```

## Schema First

Define the ontology up front. Free-form extraction produces noise ("rel": "is_related_to") that kills downstream querying.

```python
from pydantic import BaseModel, Field
from typing import Literal

EntityType = Literal["Person", "Organization", "Product", "Location", "Incident", "Document"]
RelationType = Literal[
    "WORKS_AT", "FOUNDED", "HEADQUARTERED_IN", "PRODUCED_BY",
    "CAUSED", "MENTIONED_IN", "REPORTS_TO", "ACQUIRED",
]

class Entity(BaseModel):
    name: str = Field(..., description="Canonical name as it appears in text")
    type: EntityType
    description: str = Field("", description="1-line grounded description")

class Triple(BaseModel):
    subject: str
    predicate: RelationType
    object: str
    evidence: str = Field(..., description="Exact quote from the source")

class Extraction(BaseModel):
    entities: list[Entity]
    triples: list[Triple]
```

Every relation type should have a clear, narrow intent; prefer many specific types over a few broad ones.

## LLM-Based Extraction (Structured Output)

### Anthropic tools API

```python
import anthropic, json
client = anthropic.Anthropic()

tool = {
    "name": "emit_extraction",
    "description": "Return the extraction.",
    "input_schema": Extraction.model_json_schema(),
}

PROMPT = """Extract entities and triples from the text.
Rules:
- Use only the schema types in the tool.
- Only extract facts EXPLICITLY stated in the text.
- Normalize names (no pronouns, no possessives).
- `evidence` must be a verbatim quote.

Text:
{chunk}"""

def extract(chunk: str) -> Extraction:
    msg = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=4000,
        tools=[tool],
        tool_choice={"type": "tool", "name": "emit_extraction"},
        messages=[{"role": "user", "content": PROMPT.format(chunk=chunk)}],
    )
    for block in msg.content:
        if block.type == "tool_use":
            return Extraction.model_validate(block.input)
    raise RuntimeError("no extraction returned")
```

### OpenAI structured outputs

```python
from openai import OpenAI
oai = OpenAI()

resp = oai.beta.chat.completions.parse(
    model="gpt-4o",
    response_format=Extraction,
    messages=[{"role": "user", "content": PROMPT.format(chunk=chunk)}],
)
extraction: Extraction = resp.choices[0].message.parsed
```

### Costs

- Use a cheaper model for extraction (`claude-haiku-4-5`, `gpt-4o-mini`) on high-volume ingestion.
- Batch the call with the OpenAI/Anthropic batch APIs for 50% discount on large corpora.
- Cache by `sha256(chunk + model_version + schema_version)` — re-run only on schema changes.

## REBEL (Encoder-Decoder Model)

REBEL is a seq-to-seq model fine-tuned to produce triples directly; no prompt engineering, no API cost.

```python
# pip install transformers sentencepiece
from transformers import pipeline

pipe = pipeline("text2text-generation", model="Babelscape/rebel-large", device=0)
out = pipe("Barack Obama was born in Honolulu and served as the 44th US president.",
           return_tensors=False, return_text=True, max_length=256)[0]["generated_text"]

# Parser for REBEL output format
def parse_rebel(raw: str) -> list[tuple[str, str, str]]:
    triples, subject, relation, obj, state = [], "", "", "", "x"
    for tok in raw.replace("<s>","").replace("<pad>","").replace("</s>","").split():
        if tok == "<triplet>":
            if subject and obj: triples.append((subject.strip(), relation.strip(), obj.strip()))
            state, subject, relation, obj = "t", "", "", ""
        elif tok == "<subj>":
            state = "s"
        elif tok == "<obj>":
            state = "o"
        else:
            if state == "t": subject += " " + tok
            if state == "s": obj += " " + tok
            if state == "o": relation += " " + tok
    if subject and obj: triples.append((subject.strip(), relation.strip(), obj.strip()))
    return triples
```

Use REBEL when: cost matters more than schema control (REBEL produces free-form relations; map to your schema with a rule table).

## OpenIE (Stanford CoreNLP, OpenIE6)

Rule-based open information extraction produces high-recall but noisy triples. Pair with a downstream LLM filter to prune low-quality ones. Useful for multilingual corpora lacking strong instruction-tuned models.

## Entity Linking to Wikidata / DBpedia

Raw surface forms aren't identifiers. Link each extracted entity to an external KB ID where possible so cross-document merges are trivial.

```python
import requests

def wikidata_search(name: str, lang="en", limit=5):
    r = requests.get("https://www.wikidata.org/w/api.php", params={
        "action": "wbsearchentities", "search": name, "language": lang,
        "format": "json", "limit": limit,
    }, timeout=5)
    return [(h["id"], h.get("description", "")) for h in r.json().get("search", [])]

# wikidata_search("Anthropic")
# [('Q110760624', 'American artificial intelligence safety and research company'), ...]
```

For ambiguous names, pass candidates to an LLM with surrounding context and let it pick the right QID. Cache the linking decision per `(name, context_hash)`.

Alternatives: [BLINK](https://github.com/facebookresearch/BLINK), [GENRE](https://github.com/facebookresearch/GENRE), spaCy's `entity_linker` pipe with a custom KB.

## Validation

Never load unvalidated triples. Three layers:

### 1. Schema validation (Pydantic already does this)

### 2. Evidence-grounded check

```python
def grounded(triple: Triple, chunk: str) -> bool:
    return triple.evidence.lower() in chunk.lower() \
           and triple.subject.lower() in triple.evidence.lower() \
           and triple.object.lower() in triple.evidence.lower()
```

### 3. LLM judge (spot-check + reject)

```python
JUDGE_PROMPT = """Does the evidence support the triple? Reply JSON:
{{"supported": true|false, "confidence": 0.0-1.0}}
Triple: ({s}, {p}, {o})
Evidence: {e}"""

def judge(t: Triple) -> dict:
    msg = client.messages.create(model="claude-haiku-4-5", max_tokens=150,
        messages=[{"role": "user", "content": JUDGE_PROMPT.format(
            s=t.subject, p=t.predicate, o=t.object, e=t.evidence)}])
    return json.loads(msg.content[0].text)
```

Run the judge on a 10% sample; alert if `supported` drops below 90%.

## Provenance

Every triple carries source metadata — essential for citations and for fixing bad extractions later.

```python
record = {
    "triple": (t.subject, t.predicate, t.object),
    "evidence": t.evidence,
    "source_doc_id": doc_id,
    "source_chunk_id": chunk_id,
    "source_offset": chunk_offset,
    "extractor": "claude-sonnet-4-5",
    "schema_version": "v3",
    "extracted_at": iso_now(),
}
```

## Loading to Graph Stores

### Neo4j

```python
from neo4j import GraphDatabase
driver = GraphDatabase.driver("bolt://localhost:7687", auth=("neo4j", "pass"))

CYPHER = """
UNWIND $rows AS row
MERGE (s:Entity {canonical_id: row.s_id})
  ON CREATE SET s.name = row.s_name, s.type = row.s_type
MERGE (o:Entity {canonical_id: row.o_id})
  ON CREATE SET o.name = row.o_name, o.type = row.o_type
MERGE (s)-[r:REL {type: row.predicate}]->(o)
  SET r.evidence = row.evidence,
      r.source_chunk_id = row.source_chunk_id,
      r.extracted_at = datetime(row.extracted_at)
"""

def load(rows: list[dict]):
    with driver.session() as s:
        for i in range(0, len(rows), 500):
            s.run(CYPHER, rows=rows[i:i+500])
```

Create constraints first:

```cypher
CREATE CONSTRAINT entity_id IF NOT EXISTS FOR (e:Entity) REQUIRE e.canonical_id IS UNIQUE;
CREATE INDEX entity_name IF NOT EXISTS FOR (e:Entity) ON (e.name);
```

### Amazon Neptune

Use Gremlin or openCypher. Bulk-load via CSV to S3 → `neptune-loader`. Same shape; predicates become edge labels.

### TigerGraph

Define `VERTEX` and `EDGE` types in GSQL. Bulk-load with `LOADING JOB`. Strongest for >100M edge graphs.

### Incremental Updates

On new ingest: extract → link → validate → diff against existing triples (keyed by `(s, p, o)`), insert new, update evidence on existing. Never delete — mark superseded for lineage.

```sql
CREATE TABLE triple_log (
    s_id TEXT, predicate TEXT, o_id TEXT,
    evidence TEXT,
    source_chunk_id TEXT,
    extracted_at TIMESTAMPTZ,
    superseded_at TIMESTAMPTZ
);
CREATE INDEX ON triple_log (s_id, predicate, o_id);
```

## Full Pipeline Skeleton

```python
def build_kg(chunks: list[dict]):
    all_rows = []
    for chunk in chunks:
        extraction = extract(chunk["text"])
        ents  = [link_entity(e) for e in extraction.entities]
        for t in extraction.triples:
            if not grounded(t, chunk["text"]):
                continue
            s_id = ent_id_by_name[t.subject]
            o_id = ent_id_by_name[t.object]
            all_rows.append({
                "s_id": s_id, "s_name": t.subject, "s_type": ...,
                "o_id": o_id, "o_name": t.object, "o_type": ...,
                "predicate": t.predicate,
                "evidence": t.evidence,
                "source_chunk_id": chunk["id"],
                "extracted_at": iso_now(),
            })
    load(all_rows)
```

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Open-ended extraction (no schema) | Schema-guided via Pydantic + structured outputs |
| Accepting triples without evidence | Require `evidence` field + grounding check |
| Using `gpt-4o` / `claude-opus` for every chunk | Haiku/mini for bulk; Opus for hard cases |
| Extracting entities but not linking to canonical IDs | Wikidata link + internal `entity-resolution` step |
| Full graph rebuild on every ingest | Incremental triple insert, keyed on `(s, p, o)` |
| Dropping provenance to "save space" | Provenance is the citation layer — keep it |
| Loading without constraints | Define uniqueness on `canonical_id` first |

## Production Checklist

- [ ] Schema (entities + relations) in Pydantic, version-tagged
- [ ] Extraction cached by `sha256(chunk + model + schema_version)`
- [ ] Grounding check (evidence quote in chunk) enforced
- [ ] LLM judge sample (10%) with alert on quality regression
- [ ] Entity linking to canonical ID (internal or Wikidata)
- [ ] Provenance fields on every triple (source, offset, extractor, time)
- [ ] Graph constraints + indexes created before bulk load
- [ ] Batch load (500–1000 rows per transaction)
- [ ] Incremental updates on ingest, no full rebuilds
- [ ] Eval corpus with gold triples for regression testing
