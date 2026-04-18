---
name: giskard-rag
description: |
  Giskard RAGET (RAG Evaluation Toolkit): automatic testset generation
  (simple / complex / distracting / conversational), component-level scoring
  (retriever / generator / rewriter), hallucination and bias tests, CI
  integration. Compared to RAGAS and DeepEval.

  USE WHEN: user mentions "Giskard", "RAGET", "Giskard RAG toolkit", "automatic
  testset generation", "component-level RAG scoring", "hallucination test
  Giskard"

  DO NOT USE FOR: general RAGAS usage - use `rag-evaluation`; Stanford ARES -
  use `ares-framework`; CI/CD wiring - use `continuous-evaluation`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Giskard RAGET

## What Giskard RAGET Brings

RAGET (part of the Giskard testing library) generates a diverse test set from
your own documents and evaluates the RAG pipeline **component by component** —
retriever, generator, query rewriter, and knowledge base coverage — instead of
only scoring end-to-end answers.

Unique strengths:

- Test diversity across 5 question types (simple, complex, distracting,
  conversational, situational).
- Per-component diagnosis: "Is the retriever the problem or the generator?"
- Bias and hallucination scanners inherited from Giskard core.
- HTML report output suitable for review meetings.

## Install

```bash
pip install "giskard[llm]"
```

## Question Types

| Type | What it stresses |
|---|---|
| simple | Baseline factual retrieval |
| complex | Multi-hop reasoning across chunks |
| distracting | Relevant + irrelevant-but-similar chunks |
| situational | User persona / context in the prompt |
| conversational | Multi-turn dialogue history |
| double | Two distinct questions in one utterance |

Balanced distribution catches different failure modes.

## Testset Generation

```python
from giskard.rag import KnowledgeBase, generate_testset
import pandas as pd

kb_df = pd.DataFrame({
    "text": [open(p).read() for p in doc_paths],
    "source": doc_paths,
})
kb = KnowledgeBase(kb_df)

testset = generate_testset(
    kb,
    num_questions=120,
    agent_description="Support bot for a SaaS analytics product. Users ask about"
                      " dashboards, SQL exports, billing, and API keys.",
    language="en",
)
testset.save("ragtest.jsonl")
```

Review the generated testset — synthetic data is never perfect. Filter out
questions the KB clearly cannot answer.

## Scoring a Pipeline

```python
from giskard.rag import evaluate, QATestset

testset = QATestset.load("ragtest.jsonl")

def answer_fn(question: str, history=None) -> str:
    """Adapter to your RAG pipeline."""
    return my_rag_chain.invoke({"question": question, "history": history or []})

report = evaluate(
    answer_fn,
    testset=testset,
    knowledge_base=kb,
)

report.save("ragtest_report/")
report.to_pandas().head()
```

The report includes:

- Correctness by question type and topic.
- Component scores: retriever, generator, router, rewriter, knowledge base.
- Failure list with reasons (context missing vs wrong generation vs both).

## Component-Level Diagnostics

RAGET separates failures into buckets so you know where to invest:

| Bucket | Meaning | Fix |
|---|---|---|
| Retriever | Relevant chunk not in top-K | Re-chunk, reranker, hybrid search |
| Generator | Correct context, wrong answer | Prompt edit, stronger model, few-shot |
| Rewriter | Query reformulation lost meaning | Disable or tune rewriter |
| Router | Wrong index/tool selected | Update routing rules or retrain classifier |
| Knowledge Base | Answer not in KB at all | Add docs; do NOT tune RAG |

RAGAS aggregates everything; RAGET tells you which module to touch.

## Custom LLM for Generation and Judging

```python
from giskard.llm.client.openai import OpenAIClient
import giskard

giskard.llm.set_llm_api("openai")
giskard.llm.set_default_client(OpenAIClient(model="gpt-4o-mini"))

# Or Anthropic via LangChain wrapper
from giskard.llm.client.litellm import LiteLLMClient
giskard.llm.set_default_client(
    LiteLLMClient(model="anthropic/claude-sonnet-4-5-20250929"))
```

## Hallucination and Bias Scan

```python
import giskard

scan_results = giskard.scan(
    model=my_giskard_model,
    dataset=my_giskard_dataset,
    only=["hallucination", "stereotype"],
)
scan_results.to_html("scan_report.html")
```

Catches:

- Ungrounded claims (hallucination).
- Demographic stereotypes and sycophancy.
- Prompt injection susceptibility.
- Sensitivity to wording changes.

## Comparison with RAGAS and DeepEval

| Aspect | RAGAS | DeepEval | Giskard RAGET |
|---|---|---|---|
| Testset generation | Basic, distribution-tunable | Via Synthesizer module | Strong, 6 question types with personas |
| Component-level scoring | No | Partial | Yes |
| Hallucination scanner | Faithfulness metric | Hallucination metric | Built-in + prompt-injection scan |
| HTML report | No | No | Yes |
| CI integration | LangSmith / custom | Pytest-native | Pytest via `giskard.scan.run` |
| Learning curve | Low | Low-medium | Medium |
| Best for | Baseline metrics | CI gates | Diagnosing where the RAG fails |

Not mutually exclusive — teams often use RAGAS nightly for metrics and Giskard
weekly for diagnostics.

## Pytest CI Integration

```python
# tests/test_rag_quality.py
import pytest
from giskard.rag import QATestset, evaluate

testset = QATestset.load("ragtest.jsonl")

@pytest.fixture(scope="module")
def report():
    return evaluate(my_answer_fn, testset=testset, knowledge_base=kb)

def test_overall_correctness(report):
    assert report.correctness_by_question_type()["simple"] >= 0.85

def test_retriever_recall(report):
    assert report.component_scores()["Retriever"] >= 0.80

def test_no_hallucination_regressions(report):
    failures = report.failures()
    hallucinations = [f for f in failures if f.reason == "hallucination"]
    assert len(hallucinations) <= 3
```

## Conversational Testset Example

```python
testset = generate_testset(
    kb,
    num_questions=60,
    question_types=["conversational", "distracting"],
    agent_description="Customer support agent with multi-turn memory.",
)

for row in testset:
    history = row.conversation_history  # list[tuple[role, content]]
    final_q = row.question
    answer = my_rag_chain.invoke({"history": history, "question": final_q})
```

## Knowledge Base Coverage Report

```python
from giskard.rag import KnowledgeBaseReport

kb_report = KnowledgeBaseReport(kb)
kb_report.topic_distribution()  # histogram of topics
kb_report.coverage_gaps(testset) # questions with no supporting doc
```

Coverage gaps indicate missing content — fix by adding docs rather than tuning
RAG.

## Tips That Save Hours

- Set `agent_description` carefully: the generator uses it to invent realistic
  queries. Vague descriptions produce vague queries.
- Seed generation for reproducibility: `generate_testset(..., seed=42)`.
- Regenerate the testset when the KB changes; otherwise retrieval recall drifts.
- Start with 100-200 questions; scale to 500+ once the pipeline stabilizes.
- Store testset in git alongside code — changes to it are reviewable.

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Mixing Giskard component scores across KB versions | Regenerate testset per KB version |
| Skipping the human review step on synthetic testsets | Review at least 30% of questions |
| Using default agent description "helpful assistant" | Detail the domain, user persona, and scope |
| Running hallucination scan with a weak judge LLM | Use GPT-4o or Claude Sonnet class models |
| Treating RAGAS faithfulness and Giskard correctness as equivalent | They measure different things; keep both |
| Overwriting report files without history | Version the HTML reports for trend review |

## Production Checklist

- [ ] KB dataframe built with `source` column for traceability
- [ ] `agent_description` written specifically for the domain
- [ ] Testset generated with balanced question-type distribution
- [ ] At least 30% of generated questions reviewed and unusable ones filtered
- [ ] Testset committed to git; regenerated on KB updates
- [ ] Component-level thresholds set (retriever >= X, generator >= Y)
- [ ] Pytest wrapper wired into CI with per-component assertions
- [ ] Hallucination + prompt-injection scan scheduled weekly
- [ ] HTML reports archived for trend analysis
