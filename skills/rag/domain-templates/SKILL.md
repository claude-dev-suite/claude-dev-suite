---
name: domain-templates
description: |
  Production RAG templates for five domains: customer-support, developer-docs,
  legal, medical, financial. Each covers corpus shape, chunking, embedding model
  choice, metadata schema, domain-specific guardrails (hallucination tolerance,
  PII, compliance), and evaluation criteria.

  USE WHEN: user mentions "RAG for support", "legal RAG", "medical RAG",
  "developer docs RAG", "financial RAG", "domain template RAG"

  DO NOT USE FOR: general architecture - use `rag-architecture`;
  evaluation methodology - use `rag-evaluation`;
  security specifics - use `rag-security`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Domain Templates

Each template specifies: corpus shape, chunking, embedding model, metadata schema, retrieval strategy, guardrails, eval criteria.

## Template 1: Customer Support

### Corpus Shape
- Help articles (500-2000 words), macros, product FAQs, historical tickets, release notes.
- High churn: content changes weekly.
- Often multilingual.

### Chunking
- Help articles: Markdown header split, 800 chars, 150 overlap.
- Historical tickets: per-turn; one chunk = (question + resolution) pair.
- Release notes: per version, fixed-size 600 chars.

### Embedding
- `text-embedding-3-small` (cost-sensitive) or multilingual `embed-multilingual-v3.0` (Cohere) if non-English.

### Metadata Schema
```python
{
  "article_id": str, "category": str, "product": str,
  "locale": str, "audience": Literal["customer","agent","internal"],
  "updated_at": datetime, "deprecated": bool,
  "resolution_success_rate": float  # for ticket chunks
}
```

### Retrieval
- Hybrid BM25 + dense; reranker.
- Hard filter: `deprecated=false`, `audience in allowed_audiences`, `locale in user_locales`.
- Soft bias: recency decay (half-life 180 days); boost `resolution_success_rate` for ticket chunks.

### Guardrails
- Hallucination tolerance: low. Answer grounded strictly in retrieved content; fall back to "contact support" if confidence low.
- PII: strip customer names/emails from historical tickets before indexing.
- Response style: short, action-oriented, always cite article.

### Eval
- Resolution rate (did the user stop asking?).
- Deflection rate (% of queries handled without human).
- Agent override rate (agent edits response before sending).
- First-contact resolution within N turns.

## Template 2: Developer Documentation

### Corpus Shape
- API docs (generated), tutorials, cookbook examples, SDK source code, GitHub issues.
- Heterogeneous: prose + code + reference tables.

### Chunking
- Prose: Markdown header split, 1000 chars, 200 overlap.
- Code: Language-aware splitter, 1500 chars; preserve whole functions/classes.
- API reference: one chunk per endpoint or method.

### Embedding
- `voyage-code-3` for code-heavy; `text-embedding-3-large` for mixed.
- Separate indexes for code vs prose; route per query intent.

### Metadata Schema
```python
{
  "doc_id": str, "kind": Literal["prose","code","api","example"],
  "language": str, "library": str, "version": str,
  "section_path": list[str], "symbol": str | None,
  "updated_at": datetime
}
```

### Retrieval
- Query classifier: "how do I" -> prose+examples; "what does X return" -> api; "why does X fail" -> issues+examples.
- Version-aware filter from user's installed version.
- Code-aware reranker (cross-encoder trained on code-query pairs).

### Guardrails
- Answer must include a runnable code snippet when a how-to is requested.
- Version lock: never return docs for a different major version unless explicitly asked.
- Hallucination tolerance: zero on API signatures. Verify symbol exists in indexed API reference before emitting.

### Eval
- Code snippet runnability (execute in sandbox; pass/fail).
- API signature accuracy (does returned signature match indexed reference?).
- Link coverage (% answers that cite the canonical doc page).
- Offline benchmark: SWE-bench-retrieval, CodeRAG-bench.

## Template 3: Legal

### Corpus Shape
- Contracts, case law, statutes, internal memos, regulations.
- Stable content; layered (statute -> regulation -> case interpretation).
- Extreme precision needs; jurisdictional.

### Chunking
- Contracts / statutes: section/clause aware; proposition-based for atomic facts.
- Case law: head-note + holding + reasoning separately indexed.
- Preserve section numbering and hierarchy in metadata.

### Embedding
- Domain-tuned: `Nomic Embed Legal`, Voyage `voyage-law-2`, or fine-tune on case retrieval corpus.

### Metadata Schema
```python
{
  "doc_id": str, "kind": Literal["contract","statute","regulation","case","memo"],
  "jurisdiction": str, "effective_date": date, "superseded_by": str | None,
  "section_path": list[str], "clause_number": str | None,
  "citation": str, "parties": list[str] | None,
  "valid_from": date | None, "valid_to": date | None,
  "authority_score": float
}
```

### Retrieval
- Hybrid search mandatory; BM25 for exact statute lookups (e.g., "Section 11 USC 362").
- Strict filters: `jurisdiction`, `effective_date <= query_date`, `superseded_by is null`.
- Time-travel support (`valid_at`) for historical analysis.
- Hierarchical: first retrieve statute, then regulations, then cases interpreting it.

### Guardrails
- Citations mandatory; every claim attributed.
- Never paraphrase statute wording; quote verbatim.
- "This is not legal advice" disclaimer.
- Superseded content filter at query time, with explicit override.
- PII: redact clients/parties if showing to other users.

### Eval
- Citation correctness (cited source actually supports claim) — human-graded.
- Jurisdictional correctness.
- Temporal correctness (statute version active at query date).
- Attorney review score on a sample.

## Template 4: Medical

### Corpus Shape
- Clinical guidelines, drug monographs, clinical trials, EHR notes, patient education.
- Very high stakes; life-safety.
- Regulated: HIPAA in US, GDPR in EU.

### Chunking
- Guidelines: propositional (each recommendation a chunk).
- Drug monographs: section-aware (indications, dosing, contraindications).
- Clinical trials: structured abstracts, one chunk per PICO field.

### Embedding
- `BioBERT`, `PubMedBERT`, or `Nomic Embed Medical`. Fine-tune on UMLS synonyms.

### Metadata Schema
```python
{
  "doc_id": str, "kind": Literal["guideline","drug","trial","ehr","patient_ed"],
  "icd10": list[str], "snomed_ct": list[str], "rxnorm": list[str],
  "evidence_level": Literal["A","B","C","D"],
  "population": dict,          # age range, pregnancy, renal function
  "updated_at": datetime, "authority": str,
  "contraindications": list[str],
  "phi_status": Literal["none","de-identified","identified"]
}
```

### Retrieval
- Query augmentation with medical ontology expansion (UMLS/SNOMED synonyms).
- Strict filter on `authority` for clinical-decision queries (e.g., only from approved guideline sources).
- Boost higher evidence levels.
- Population filter: match patient demographics explicitly.

### Guardrails
- HIPAA: no PHI leaves the secure boundary; all operations logged.
- Answer template: always include evidence level, source, caveats.
- Hard refusals: dosing recommendations without patient context, diagnosis, emergency.
- Minimum authority threshold per query type (e.g., must be from NIH/guideline source).
- Version-pinned: drug monographs versioned; use latest unless queried historically.
- Disclaimer: "for informational purposes; not a substitute for clinician judgment".
- Audit log: every query + retrieval + response stored for compliance.

### Eval
- Clinical accuracy (clinician-graded).
- Safety (any contraindication missed = fail).
- Citation match (cited source supports claim).
- Population-appropriate (pediatric vs adult dosing correct).
- Benchmark: MedQA, MedMCQA with retrieval-augmented variants.

## Template 5: Financial

### Corpus Shape
- 10-K/10-Q filings, earnings transcripts, analyst research, market data, internal research.
- Structured (tables, XBRL) + unstructured (MD&A narrative).
- Time-sensitive; regulatory.

### Chunking
- 10-K/10-Q: section-aware (Item 1, 1A Risk Factors, 7 MD&A).
- Earnings transcripts: per speaker + topic shift (semantic chunking).
- Tables: preserve as structured data; NL2SQL hybrid (see `tabular-rag`).
- Research reports: executive summary + sections.

### Embedding
- `voyage-finance-2`, FinE5, or FinBERT fine-tuned.

### Metadata Schema
```python
{
  "doc_id": str, "kind": Literal["10k","10q","transcript","research","news","table"],
  "ticker": str, "fiscal_period": str,        # "2025-Q3"
  "filing_date": date, "reporting_date": date,
  "section": str, "speaker": str | None,
  "currency": str, "is_restatement": bool,
  "embargo_until": datetime | None            # for non-public research
}
```

### Retrieval
- Ticker filter mandatory for company-specific queries.
- Fiscal period filter or time-aware scoring.
- Restatement handling: when is_restatement=true, flag prior versions as superseded.
- Embargo: respect `embargo_until`; filter at query time.
- Hybrid structured (numbers from tables) + unstructured (narrative) retrieval.

### Guardrails
- Forward-looking statements flagged per Safe Harbor.
- No advice on buy/sell/hold — information only.
- Material non-public information: restrict by user entitlement.
- Numerical accuracy: extract numbers from the source (not paraphrased).
- Citation with page + paragraph precision.
- Audit: every research query logged per regulatory requirements (FINRA).

### Eval
- Numerical extraction accuracy (reported numbers match filing exactly).
- Temporal correctness (did the query find the right fiscal period?).
- Forward-looking statement detection rate.
- Analyst QA score on a monthly sample.
- Embargo leak rate (should be zero).

## Cross-Domain Patterns

| Aspect | Support | Dev Docs | Legal | Medical | Financial |
|---|---|---|---|---|---|
| Hallucination tolerance | Low | Zero on API | Very low | Zero | Very low |
| PII/PHI risk | Medium | Low | High | Very high | Medium-high |
| Citation mandatory | Preferred | Yes | Always | Always | Always |
| Temporal awareness | Helpful | Version | Critical | Important | Critical |
| Authority signal | Useful | Vital | Critical | Critical | Critical |
| Ontology augmentation | Optional | Optional | Optional | Vital (UMLS) | Useful (tickers) |
| Regulatory audit | No | No | Yes | Yes (HIPAA) | Yes (FINRA/SEC) |

## Anti-Patterns (Cross-Domain)

| Anti-Pattern | Fix |
|---|---|
| Generic chunking for specialized content | Domain-aware splitters |
| Generic embedding model for specialized language | Domain-tuned model (medical, legal, code, finance) |
| No authority / source hierarchy | Canonical sources need explicit boost |
| No time/version filter | Returns stale/superseded content |
| Same guardrails across domains | Medical/legal need stricter refusal policy |
| No audit log in regulated domains | Makes compliance demonstrably impossible |
| One index for mixed content | Split per corpus type with router |
| Evaluation with generic benchmarks only | Need domain experts for final grading |

## Production Checklist (Per-Domain)

- [ ] Corpus shape characterized (count, size, churn rate, language)
- [ ] Chunking strategy picked per content type in the corpus
- [ ] Domain-tuned embedding model evaluated vs general-purpose
- [ ] Metadata schema declared and validated (Pydantic)
- [ ] Authority signal defined and populated
- [ ] Time / version filter wired
- [ ] Ontology augmentation (if applicable)
- [ ] Guardrail prompt templates checked by a domain expert
- [ ] Citation format enforced in the response schema
- [ ] Domain-specific eval set (>= 100 queries, expert-graded)
- [ ] Regulatory audit logging turned on where required
- [ ] Refusal criteria documented and tested
- [ ] Escalation path (human review) for low-confidence answers
- [ ] Re-evaluation cadence scheduled (quarterly for regulated domains)
