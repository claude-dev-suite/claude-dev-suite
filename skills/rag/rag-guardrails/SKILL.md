---
name: rag-guardrails
description: |
  Trust-and-safety layer for RAG. Hallucination detection (LLM self-check,
  NLI entailment, TRUE metric), groundedness scoring, forced-citation prompting,
  out-of-scope refusal, NeMo Guardrails, Guardrails AI, Pydantic structured
  outputs with source verification, LLM-as-judge validators.

  USE WHEN: user mentions "hallucination detection", "groundedness", "citation enforcement",
  "NeMo Guardrails", "Guardrails AI", "LLM-as-judge", "refusal", "faithfulness",
  "TRUE metric", "answer verification"

  DO NOT USE FOR: prompt-injection via retrieved docs - use `rag-security`;
  retrieval quality metrics (recall/precision) - use `rag-observability`;
  caching of verified answers - use `rag-caching`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# RAG Guardrails

## Layered Defense Model

```
Query -> Input guard (scope, PII) -> Retrieve -> Context guard (PII, injection)
      -> Generate (forced citation) -> Output guard (groundedness, format) -> Answer
```

No single check is enough. Combine at minimum: **scope check**, **forced citations**, **groundedness score**, **schema validation**.

## Forced-Citation Prompting

```python
SYSTEM = """You answer strictly from the sources below, each tagged [S0], [S1], ...

RULES (non-negotiable):
1. Every sentence of the answer MUST end with one or more citations like [S2] or [S0][S3].
2. If the sources do not contain the answer, reply EXACTLY: "INSUFFICIENT_CONTEXT"
3. Do not use outside knowledge. Do not speculate.
4. Quote numbers, dates, and named entities verbatim from the sources.

SOURCES:
{context}"""

def build_context(docs):
    return "\n\n".join(f"[S{i}] {d.page_content}" for i, d in enumerate(docs))
```

Parse-time check: reject any answer where a sentence lacks `[S\d+]`.

```python
import re
SENT_RE = re.compile(r"[^.!?]+[.!?]")
CITE_RE = re.compile(r"\[S\d+\]")

def has_citation_per_sentence(answer: str) -> bool:
    sentences = [s.strip() for s in SENT_RE.findall(answer) if s.strip()]
    return all(CITE_RE.search(s) for s in sentences)
```

## Groundedness Scoring (NLI Entailment)

Run a Natural Language Inference model over each `(source_sentence, answer_sentence)` pair and require entailment.

```python
# pip install transformers torch
from transformers import pipeline

nli = pipeline("text-classification",
               model="MoritzLaurer/DeBERTa-v3-large-mnli-fever-anli-ling-wanli",
               top_k=None)

def groundedness(answer: str, context: str) -> float:
    ans_sents = [s.strip() for s in SENT_RE.findall(answer) if s.strip()]
    scored = []
    for sent in ans_sents:
        # premise=context, hypothesis=answer sentence
        out = nli(f"{context} </s> {sent}")[0]
        ent = next(o["score"] for o in out if o["label"].upper() == "ENTAILMENT")
        scored.append(ent)
    return sum(scored) / max(len(scored), 1)

# Threshold typically >= 0.7 for production
```

## LLM Self-Check (TRUE-style)

Google's TRUE metric: ask a judge LLM whether the answer is entailed by the sources, with a binary output.

```python
JUDGE_PROMPT = """Given SOURCES and a CLAIM, answer ONLY "YES" or "NO".
YES if every factual statement in CLAIM is explicitly supported by SOURCES.
NO otherwise.

SOURCES:
{sources}

CLAIM:
{claim}

Answer:"""

def true_score(sources: str, answer: str) -> bool:
    r = claude.messages.create(
        model="claude-haiku-4-5",
        max_tokens=4,
        messages=[{"role": "user", "content": JUDGE_PROMPT.format(
            sources=sources, claim=answer)}],
    )
    return r.content[0].text.strip().upper().startswith("YES")
```

Cheaper than NLI, no GPU; good default for < 500 QPS.

## Out-of-Scope Refusal

```python
SCOPE_CLASSIFIER = """Is this query answerable from a knowledge base about {domain}?
Reply exactly "IN_SCOPE" or "OUT_OF_SCOPE".

Query: {query}"""

def in_scope(query: str, domain: str) -> bool:
    r = claude.messages.create(
        model="claude-haiku-4-5", max_tokens=8,
        messages=[{"role": "user",
                   "content": SCOPE_CLASSIFIER.format(domain=domain, query=query)}],
    )
    return "IN_SCOPE" in r.content[0].text.upper()
```

Also refuse when top-K retrieval scores are all below a floor (e.g., cosine < 0.35). This catches questions the classifier misses.

```python
def should_refuse(hits, floor: float = 0.35) -> bool:
    return not hits or max(h.score for h in hits) < floor
```

## Pydantic Structured Output + Source Verification

```python
from pydantic import BaseModel, Field, field_validator
from typing import List

class Citation(BaseModel):
    source_id: str = Field(pattern=r"^S\d+$")
    quote: str       # verbatim span from the source

class GroundedAnswer(BaseModel):
    answer: str
    citations: List[Citation]
    confidence: float = Field(ge=0, le=1)

    @field_validator("citations")
    @classmethod
    def at_least_one(cls, v):
        if not v:
            raise ValueError("must cite at least one source")
        return v

def verify_quotes(ans: GroundedAnswer, sources: dict[str, str]) -> bool:
    return all(c.quote in sources.get(c.source_id, "") for c in ans.citations)
```

Use the model's JSON mode (Anthropic tool use, OpenAI `response_format={"type":"json_schema"}`) and reject any response failing `verify_quotes`.

## NeMo Guardrails

```python
# pip install nemoguardrails
# config/config.yml
#   models:
#     - type: main
#       engine: openai
#       model: gpt-4o-mini
# config/rails.co
#   define user ask out of scope
#     "what is the weather"
#   define flow
#     user ask out of scope
#     bot refuse

from nemoguardrails import LLMRails, RailsConfig

config = RailsConfig.from_path("./config")
rails = LLMRails(config)
response = rails.generate(messages=[{"role": "user", "content": user_q}])
```

Register a custom **output rail** that runs `true_score` and replaces the answer with a refusal on failure.

```python
@rails.register_action
async def check_grounding(context: dict):
    return true_score(context["retrieved_context"], context["bot_message"])
```

## Guardrails AI

```python
# pip install guardrails-ai
# guardrails hub install hub://guardrails/provenance_llm
from guardrails import Guard
from guardrails.hub import ProvenanceLLM

guard = Guard().use(
    ProvenanceLLM(validation_method="sentence", llm_callable="gpt-4o-mini",
                  on_fail="exception"),
)

validated = guard.parse(
    llm_output=answer_text,
    metadata={"query": query, "sources": context_text},
)
```

Other useful validators: `ToxicLanguage`, `DetectPII`, `CompetitorCheck`, `RegexMatch`.

## LLM-as-Judge Evaluator (Batch)

For offline eval harnesses, use a stronger judge model with a rubric:

```python
RUBRIC = """Rate the ANSWER on three axes from 1 to 5:
- groundedness: fully supported by SOURCES?
- completeness: addresses the QUESTION?
- correctness: factually right per SOURCES?

Return JSON: {{"groundedness": n, "completeness": n, "correctness": n, "reasoning": "..."}}

QUESTION: {q}
SOURCES: {s}
ANSWER: {a}"""
```

Run it over a golden set nightly and alert when median groundedness drops below baseline by >0.5.

## Putting It Together

```python
def guarded_rag(query: str):
    if not in_scope(query, domain="internal-docs"):
        return "I can't answer that from this knowledge base."
    hits = retriever.search(query, k=8)
    if should_refuse(hits):
        return "INSUFFICIENT_CONTEXT"
    context = build_context(hits)
    ans = llm_generate(SYSTEM.format(context=context), query)
    if not has_citation_per_sentence(ans):
        ans = llm_generate(SYSTEM.format(context=context), query)  # one retry
    if not true_score(context, ans):
        return "I couldn't verify an answer from the sources."
    return ans
```

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Relying on LLM honesty alone | Always add an output guard (NLI or judge LLM) |
| "Please cite sources" without enforcement | Parse citations; reject uncited answers |
| Judge using same model as generator | Use a different model or, at minimum, different prompt |
| Refusing only on empty retrieval | Also refuse on low top-1 score and on scope classifier |
| No quote verification | Require verbatim quotes; string-check against source text |
| Fixed thresholds never retuned | Re-evaluate thresholds on each model/index change |

## Production Checklist

- [ ] Input scope classifier wired in
- [ ] Retrieval score floor configured
- [ ] Forced-citation prompt + sentence-level parser
- [ ] Groundedness check (NLI or TRUE) on every answer
- [ ] Structured output schema (Pydantic) validated
- [ ] Refusal string standardized and logged
- [ ] Judge prompts version-controlled
- [ ] Offline eval harness runs nightly on a golden set
