---
name: ontology-guided-retrieval
description: |
  Ontology-aware RAG. Leveraging domain ontologies (SNOMED CT, FIBO,
  schema.org, Gene Ontology, custom OWL) to expand queries with synonyms,
  hyponyms, and broader concepts; boost retrieval for ontology-matched
  entities; hybrid SPARQL + vector pipelines; RDFLib + embeddings.
  Examples with medical and financial ontologies.

  USE WHEN: user mentions "ontology", "SNOMED", "FIBO", "schema.org",
  "OWL", "SKOS", "RDF", "SPARQL RAG", "taxonomy-guided", "concept expansion",
  "hyponym retrieval"

  DO NOT USE FOR: building a KG from text - use `knowledge-graph-construction`;
  deduping entities - use `entity-resolution`;
  generic graph RAG - use `graph-rag`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Ontology-Guided Retrieval

Vector RAG treats every chunk as an island of text. Ontologies bring structure: `ibuprofen` is-a `NSAID` is-a `analgesic`; `USD` has-currency-code `840`; `Software Engineer` broader `Engineer`. Folding these relations into retrieval unlocks precision gains (exact concept matching) and recall gains (synonym and hyponym expansion) that vector-only systems can't match.

## When to Use

- Regulated domains with authoritative ontologies: healthcare (SNOMED CT, ICD-10, LOINC, RxNorm), finance (FIBO, GLEIF), biology (GO, ChEBI, UniProt), legal (LKIF, EuroVoc).
- You already have a taxonomy (product categories, industry codes NAICS/SIC) you want to respect.
- Queries use jargon that must map to canonical concepts for compliance or downstream systems.

Not worth it for: general-purpose consumer chat, corpora with no natural taxonomy.

## Ontology Formats

| Format | Purpose | Tools |
|---|---|---|
| OWL 2 | Formal ontology with classes, properties, axioms | Protégé, owlready2 |
| RDFS | Lightweight: classes + subClassOf + labels | rdflib |
| SKOS | Taxonomies: broader, narrower, related, prefLabel, altLabel | rdflib, skosmos |
| schema.org | Structured markup vocabulary | json-ld, rdflib |
| JSON-LD | JSON serialization of RDF | pyld, rdflib |

Most useful SKOS relations:
- `prefLabel` — canonical name.
- `altLabel` — synonyms.
- `broader` / `narrower` — IS-A-ish hierarchy.
- `related` — lateral association.

## Loading an Ontology with rdflib

```python
from rdflib import Graph, Namespace, URIRef
from rdflib.namespace import SKOS, RDF, RDFS

g = Graph()
g.parse("snomed-subset.ttl", format="turtle")      # or .owl, .rdf, .nt

# All narrower concepts of "Infectious disease"
q = """
SELECT ?c ?label WHERE {
  ?c skos:broader* <http://snomed.info/id/40733004> ;
     skos:prefLabel ?label .
}
"""
for row in g.query(q, initNs={"skos": SKOS}):
    print(row.c, row.label)
```

## Owlready2 for OWL Reasoning

```python
# pip install owlready2
from owlready2 import get_ontology, sync_reasoner_pellet

onto = get_ontology("fibo.owl").load()
sync_reasoner_pellet(infer_property_values=True)

for cls in onto.classes():
    print(cls.iri, list(cls.label), list(cls.ancestors()))
```

Reasoning materializes inferred `subClassOf` and property chains — use it once at ingest time, then query the materialized graph (don't reason at query time in RAG's hot path).

## Query Expansion via Ontology

Given a user query containing ontology-matched terms, expand with synonyms, hyponyms, and broader parents.

```python
def expand_terms(term: str, g: Graph) -> dict:
    q = """
    SELECT ?syn ?narrower ?broader WHERE {
      ?c skos:prefLabel|skos:altLabel ?t .
      FILTER (LCASE(STR(?t)) = LCASE(?input))
      OPTIONAL { ?c skos:altLabel ?syn }
      OPTIONAL { ?n skos:broader ?c ; skos:prefLabel ?narrower }
      OPTIONAL { ?c skos:broader ?b . ?b skos:prefLabel ?broader }
    }
    """
    syn, narrower, broader = set(), set(), set()
    for r in g.query(q, initNs={"skos": SKOS}, initBindings={"input": term}):
        if r.syn:       syn.add(str(r.syn))
        if r.narrower:  narrower.add(str(r.narrower))
        if r.broader:   broader.add(str(r.broader))
    return {"synonyms": list(syn), "hyponyms": list(narrower), "hypernyms": list(broader)}
```

Generate an expanded query for retrieval:

```python
def build_expanded(query: str, matched_terms: list[str]) -> list[str]:
    variants = [query]
    for term in matched_terms:
        x = expand_terms(term, g)
        for syn in x["synonyms"]:
            variants.append(query.replace(term, syn))
        for hyp in x["hyponyms"]:              # narrower terms retrieve more specific docs
            variants.append(query.replace(term, hyp))
    return variants
```

Then dense-retrieve each variant and union/dedup results.

## Concept Matching in Queries

Identifying which ontology concepts appear in a query:

- **Lexicon + lookup** (fast): build a radix tree of all `prefLabel` + `altLabel`; longest-match tokenization.
- **SciSpaCy / MedCAT** (medical): pretrained entity linkers to UMLS/SNOMED.
- **LLM + few-shot**: for rare terms, ask an LLM to output ontology IDs given candidate concepts.

```python
# MedCAT example for SNOMED
from medcat.cat import CAT
cat = CAT.load_model_pack("/path/to/medcat-snomed-modelpack.zip")
doc = cat.get_entities("Patient presents with NSTEMI and raised troponin.")
for ent in doc["entities"].values():
    print(ent["source_value"], ent["cui"], ent["pretty_name"])
```

## Ontology-Boosted Retrieval

After detecting ontology concepts, boost chunks that mention the same concept IDs.

```python
def retrieve_with_boost(query: str, concept_ids: list[str], top_k=20):
    vec_hits = vectorstore.similarity_search_with_score(query, k=top_k*3)
    boosted = []
    for doc, score in vec_hits:
        overlap = len(set(doc.metadata.get("concept_ids", [])) & set(concept_ids))
        boosted.append((doc, score - 0.05 * overlap))   # lower score = better in many libs
    boosted.sort(key=lambda x: x[1])
    return boosted[:top_k]
```

At ingest time, tag each chunk with the concept IDs detected in it so this filter is a metadata hit, not a runtime extraction.

## SPARQL + Vector Hybrid

For queries with structured parts (`Drugs that interact with warfarin AND treat atrial fibrillation`), run SPARQL over the KG/ontology and use the result as a filter on the vector search.

```python
def hybrid_retrieve(nl_query: str):
    sparql = """
    SELECT ?drug WHERE {
      ?drug a :Drug ;
            :interactsWith :Warfarin ;
            :treats :AtrialFibrillation .
    }
    """
    drug_ids = [str(r.drug) for r in kg.query(sparql)]
    if drug_ids:
        # Filter vector search to chunks mentioning any of these drugs
        return vectorstore.similarity_search(
            nl_query, k=10,
            filter={"concept_ids": {"$in": drug_ids}},
        )
    return vectorstore.similarity_search(nl_query, k=10)
```

LLM-generated SPARQL (like LLM-generated Cypher) needs: read-only endpoint, query validator, and timeout. Restrict the endpoint to a small SPARQL profile for safety.

## RDFLib + Embedding Hybrid Store

Store entity embeddings in the same RDF graph using a literal property:

```python
from rdflib import Literal, XSD
import base64, numpy as np

def attach_embedding(g: Graph, iri: URIRef, vec: np.ndarray):
    blob = base64.b64encode(vec.astype("float32").tobytes()).decode()
    g.add((iri, URIRef("urn:embed"), Literal(blob, datatype=XSD.string)))
```

Retrieval:

```python
def top_k_entities(q_vec: np.ndarray, k=10):
    entities = []
    for s, _, o in g.triples((None, URIRef("urn:embed"), None)):
        v = np.frombuffer(base64.b64decode(str(o)), dtype="float32")
        sim = float(np.dot(q_vec, v) / (np.linalg.norm(q_vec) * np.linalg.norm(v) + 1e-9))
        entities.append((s, sim))
    return sorted(entities, key=lambda x: -x[1])[:k]
```

This is fine for <100k entities. Beyond that, put embeddings in a vector DB and keep only IRI+label in RDF.

## Example: Medical RAG with SNOMED

```python
# Query: "What treats angina in diabetics?"
concepts = medcat_extract(query)       # angina (194828000), diabetes (73211009)
# Expand via SNOMED: angina -> stable angina (59546005), unstable angina (4557003)
expanded_ids = expand_with_children(concepts, depth=2)

# SPARQL: find treatments
sparql = f"""
SELECT ?treatment WHERE {{
  ?treatment :treats ?cond .
  FILTER (?cond IN ({','.join(f'<{c}>' for c in expanded_ids)}))
}}
"""
candidate_ids = run_sparql(sparql)

# Retrieve clinical notes mentioning these IDs + the query vector
docs = vectorstore.similarity_search(
    query, k=10,
    filter={"snomed_ids": {"$in": candidate_ids + concepts}},
)
```

## Example: Financial RAG with FIBO

```python
# Query: "How do municipal bonds compare to treasury bonds for tax efficiency?"
# FIBO class hierarchy: MunicipalBond < DebtInstrument, TreasuryBond < GovernmentBond < DebtInstrument
# Expand query with FIBO labels + altLabels; boost chunks tagged with these IRIs.
```

GLEIF (LEI) adds precise issuer identification — tag each chunk with LEI when known so queries about "JPMorgan" vs "JP Morgan" vs "JPM" all resolve to the same entity.

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Expanding with every synonym/hyponym (explodes) | Limit depth (1–2) and cap variants at ~5 |
| SPARQL at query time on a giant live graph | Pre-materialize the subgraph or cache answers |
| Letting an LLM write SPARQL to a writable endpoint | Read-only endpoint + validator + timeout |
| Ignoring ontology versioning | Pin ontology version in manifest; re-index on upgrade |
| Free-text concept matching (no IRI) | Always resolve to the canonical IRI/code |
| Reasoning at query time (owlready2 in hot path) | Reason once at ingest; query materialized graph |
| Tagging chunks with only surface form | Tag with concept IDs for language-agnostic filtering |

## Production Checklist

- [ ] Ontology version pinned and stored in manifest
- [ ] Reasoning / expansion materialized at ingest time
- [ ] Chunks tagged with concept IDs (not just surface text)
- [ ] Query-time concept matcher (lexicon / MedCAT / LLM) benchmarked for precision
- [ ] Query expansion capped (depth ≤ 2, variants ≤ 5)
- [ ] SPARQL endpoint read-only, timeout-bounded, query-shape validated
- [ ] Hybrid retrieval (concept filter + vector) benchmarked vs vector-only
- [ ] Ontology update pipeline (re-tag chunks, bump manifest version)
- [ ] Gold eval set covering rare concepts + hypernym/hyponym expansion
