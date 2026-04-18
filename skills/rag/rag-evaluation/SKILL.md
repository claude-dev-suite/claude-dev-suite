---
name: rag-evaluation
description: |
  Evaluating RAG systems. RAGAS, DeepEval, TruLens, custom LLM-as-judge, golden
  datasets, synthetic test generation, A/B testing, retrieval-only metrics
  (Hit@K, MRR, NDCG), and answer quality metrics.

  USE WHEN: user mentions "RAGAS", "RAG evaluation", "faithfulness", "answer
  relevancy", "context precision", "hit rate", "MRR", "NDCG", "LLM as judge",
  "golden dataset", "synthetic data"

  DO NOT USE FOR: runtime telemetry only - use standard monitoring;
  chunking decisions - use `chunking-strategies`; overall design - use `rag-architecture`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# RAG Evaluation

## Two Evaluation Layers

| Layer | Questions | Metrics |
|---|---|---|
| Retrieval | Did we fetch the right docs? | Hit@K, MRR, NDCG, Context Precision, Context Recall |
| Generation | Did we use them faithfully and helpfully? | Faithfulness, Answer Relevancy, Answer Correctness |

Evaluate retrieval independently. A retrieval bug is invisible if you only score final answers.

## Retrieval-Only Metrics

Track recall@10 on retrieval; anything < 0.9 usually explains downstream answer problems.

```python
import numpy as np

def hit_at_k(retrieved: list[str], relevant: set[str], k: int) -> int:
    return int(any(d in relevant for d in retrieved[:k]))

def recall_at_k(retrieved: list[str], relevant: set[str], k: int) -> float:
    if not relevant: return 0.0
    return sum(1 for d in retrieved[:k] if d in relevant) / len(relevant)

def reciprocal_rank(retrieved: list[str], relevant: set[str]) -> float:
    for rank, d in enumerate(retrieved, start=1):
        if d in relevant: return 1.0 / rank
    return 0.0

def mrr(pairs: list[tuple[list[str], set[str]]]) -> float:
    return float(np.mean([reciprocal_rank(r, rel) for r, rel in pairs]))

def ndcg_at_k(retrieved: list[str], relevance: dict[str, float], k: int) -> float:
    dcg = sum(relevance.get(d, 0.0) / np.log2(i + 2) for i, d in enumerate(retrieved[:k]))
    ideal = sorted(relevance.values(), reverse=True)[:k]
    idcg = sum(r / np.log2(i + 2) for i, r in enumerate(ideal))
    return dcg / idcg if idcg > 0 else 0.0
```

## RAGAS (Python)

Industry-standard open-source metrics. Works against any retriever/LLM.

```python
from datasets import Dataset
from ragas import evaluate
from ragas.metrics import (
    faithfulness, answer_relevancy, context_precision, context_recall,
    answer_correctness,
)
from langchain_anthropic import ChatAnthropic
from langchain_openai import OpenAIEmbeddings

samples = [
    {
        "user_input": "How do I rotate my API key?",
        "retrieved_contexts": [doc1_text, doc2_text, doc3_text],
        "response": "Go to Settings > API Keys and click Rotate...",
        "reference": "Settings -> API Keys -> Rotate button generates a new key.",
    },
    # ...
]

ds = Dataset.from_list(samples)
result = evaluate(
    ds,
    metrics=[faithfulness, answer_relevancy, context_precision, context_recall, answer_correctness],
    llm=ChatAnthropic(model="claude-sonnet-4-5-20250929"),
    embeddings=OpenAIEmbeddings(model="text-embedding-3-small"),
)
print(result.to_pandas())
```

What each metric measures:

| Metric | Needs ground truth | Range | Measures |
|---|---|---|---|
| Faithfulness | No | 0-1 | Answer claims supported by retrieved context |
| Answer Relevancy | No | 0-1 | Answer addresses the question |
| Context Precision | Yes | 0-1 | Ratio of retrieved context that is relevant |
| Context Recall | Yes | 0-1 | Did we retrieve all relevant context |
| Answer Correctness | Yes | 0-1 | Answer matches ground truth (F1 + semantic) |

Ground-truth-free metrics (faithfulness, answer relevancy) enable production monitoring without labeled data.

## RAGAS Synthetic Test Generation

```python
from ragas.testset import TestsetGenerator
from langchain_community.document_loaders import DirectoryLoader

docs = DirectoryLoader("./corpus").load()
generator = TestsetGenerator.from_langchain(
    generator_llm=ChatAnthropic(model="claude-sonnet-4-5-20250929"),
    critic_llm=ChatAnthropic(model="claude-sonnet-4-5-20250929"),
    embeddings=OpenAIEmbeddings(model="text-embedding-3-small"),
)
testset = generator.generate_with_langchain_docs(
    docs, testset_size=50,
    distributions={"simple": 0.5, "multi_context": 0.3, "reasoning": 0.2},
)
testset.to_pandas().to_csv("testset.csv")
```

Always review synthetic sets — filter off-topic or trivial questions before using for regression.

## DeepEval

Pytest-style LLM tests, good for CI.

```python
from deepeval import evaluate
from deepeval.test_case import LLMTestCase
from deepeval.metrics import (
    ContextualRelevancyMetric, ContextualPrecisionMetric, ContextualRecallMetric,
    FaithfulnessMetric, AnswerRelevancyMetric,
)

tc = LLMTestCase(
    input="How do I rotate my API key?",
    actual_output="Go to Settings > API Keys and click Rotate.",
    expected_output="Settings -> API Keys -> Rotate button.",
    retrieval_context=[doc1_text, doc2_text],
)

metrics = [
    FaithfulnessMetric(threshold=0.7),
    AnswerRelevancyMetric(threshold=0.7),
    ContextualPrecisionMetric(threshold=0.7),
    ContextualRecallMetric(threshold=0.7),
]
evaluate([tc], metrics)
```

Runs under `pytest`; fails the build on metric threshold regressions.

## TruLens (in-app tracing + evaluation)

Records every request with its feedback scores — best for live production dashboards.

```python
from trulens.core import TruSession, Feedback
from trulens.apps.langchain import TruChain
from trulens.providers.openai import OpenAI as TruOpenAI
import numpy as np

session = TruSession()
p = TruOpenAI()
f_ground = Feedback(p.groundedness_measure_with_cot_reasons, name="Groundedness").on(
    context=TruChain.select_context()).on_output()
f_rel = Feedback(p.relevance_with_cot_reasons, name="AnswerRel").on_input_output()
f_ctx = Feedback(p.context_relevance_with_cot_reasons, name="CtxRel").on_input().on(
    TruChain.select_context()).aggregate(np.mean)

tru = TruChain(rag_chain, app_name="kb-v1", feedbacks=[f_ground, f_rel, f_ctx])
with tru as recorder:
    rag_chain.invoke("How do I rotate my API key?")
session.get_leaderboard()
```

## Custom LLM-as-Judge

When built-in metrics miss a domain concern (e.g., regulatory tone).

```python
from anthropic import Anthropic
import json

client = Anthropic()

JUDGE_PROMPT = """You are scoring an answer on tone compliance for medical advice.
Rules:
- Must include a disclaimer about consulting a professional.
- Must not diagnose.
- Must cite sources by [id].

Return JSON: {{"score": 0-10, "reasons": [str]}}.

Question: {q}
Answer: {a}"""

def tone_judge(q: str, a: str) -> dict:
    msg = client.messages.create(
        model="claude-sonnet-4-5-20250929",
        max_tokens=500,
        messages=[{"role": "user", "content": JUDGE_PROMPT.format(q=q, a=a)}],
    )
    return json.loads(msg.content[0].text)
```

Always calibrate judge models against human labels on 30-100 examples before trusting scores.

## Golden Dataset Construction

```python
import json, hashlib
from dataclasses import dataclass, asdict

@dataclass
class GoldRecord:
    id: str
    question: str
    expected_answer: str
    relevant_doc_ids: list[str]
    persona: str           # e.g., "new_user", "admin"
    difficulty: str        # "easy", "medium", "hard"
    category: str          # "factual", "procedural", "multi_hop"

def hashed_id(q: str) -> str:
    return hashlib.sha256(q.encode()).hexdigest()[:16]

gold = [GoldRecord(
    id=hashed_id("How do I rotate my API key?"),
    question="How do I rotate my API key?",
    expected_answer="Settings -> API Keys -> Rotate button.",
    relevant_doc_ids=["kb_001", "kb_047"],
    persona="admin", difficulty="easy", category="procedural",
)]

with open("gold.jsonl", "w") as f:
    for g in gold:
        f.write(json.dumps(asdict(g)) + "\n")
```

Aim for 100-300 records; stratify across categories, personas, and difficulties.

## A/B Testing in Production

```python
from hashlib import md5

def assign_variant(query_id: str, traffic: dict[str, float]) -> str:
    bucket = int(md5(query_id.encode()).hexdigest(), 16) % 10_000 / 10_000
    acc = 0.0
    for variant, share in traffic.items():
        acc += share
        if bucket < acc:
            return variant
    return list(traffic)[-1]

variant = assign_variant(query_id, {"control": 0.8, "reranker_v2": 0.2})
answer = pipelines[variant].invoke(query)
log_event(query_id, variant, answer, latency_ms, faithfulness_score)
```

Required for real deployments — offline eval and live distributions diverge within weeks.

## Answer Quality Metrics Beyond RAGAS

Citation coverage, hallucination rate (LLM judge), refusal rate, P50/P95/P99 latency, cost per answered query.

## Evaluation Cadence

| Frequency | Scope |
|---|---|
| Per PR (CI) | Small gold subset + DeepEval thresholds |
| Nightly | Full gold set + RAGAS (including synthetic) |
| Weekly | Sample live traffic, score with LLM judges |
| Monthly | Human review of outliers, refresh gold set |

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Only evaluating final answer | Evaluate retrieval separately (recall@k, MRR) |
| Gold set never grows | Add failures from prod weekly |
| LLM judge on Haiku for complex rubric | Use Sonnet; validate against human on 50 examples |
| No cost/latency tracking alongside quality | Plot quality vs cost curve per variant |
| Evaluating with the same LLM that generates | Use a different model for judge to reduce bias |
| Offline metrics only | Add live A/B with traffic split |
| Synthetic-only test set | Synthetic is biased; mix 50% real queries |
| Single aggregate score | Break down per category, persona, difficulty |

## Production Checklist

- [ ] Gold set versioned in git with 100+ records
- [ ] Retrieval metrics (recall@10, MRR) tracked separately from answer metrics
- [ ] RAGAS run nightly; results stored and diffed
- [ ] DeepEval gates in CI with explicit thresholds
- [ ] LLM judge calibrated against human labels (> 0.7 agreement)
- [ ] Live TruLens or custom telemetry captures faithfulness on sample of prod traffic
- [ ] A/B harness with hash-based assignment; cost, latency, and quality reported together
- [ ] Synthetic test generation pipeline scheduled (monthly refresh)
- [ ] Failure cases mined from prod and added to gold set
