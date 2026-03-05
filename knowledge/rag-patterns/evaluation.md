# RAG Evaluation

## Overview

RAG systems fail silently: they generate fluent, confident answers even when retrieval is poor or the LLM hallucinates beyond the retrieved context. Without systematic evaluation, you cannot distinguish a good RAG pipeline from a bad one. This document covers evaluation metrics, the RAGAS framework, LangSmith evaluation, building eval datasets, and automated testing pipelines.

---

## Core Evaluation Metrics

RAG evaluation decomposes into two stages: **retrieval quality** (did we find the right chunks?) and **generation quality** (did the LLM produce a correct answer from those chunks?).

### Retrieval Metrics

| Metric | What It Measures | Range |
|--------|-----------------|-------|
| **Context Precision** | Are the retrieved chunks relevant to the question? | 0-1 |
| **Context Recall** | Do the retrieved chunks cover all the information needed? | 0-1 |
| **Hit Rate (Recall@k)** | Is the correct chunk in the top-k results? | 0-1 |
| **MRR (Mean Reciprocal Rank)** | How high does the first relevant chunk rank? | 0-1 |

### Generation Metrics

| Metric | What It Measures | Range |
|--------|-----------------|-------|
| **Faithfulness** | Is the answer grounded in the retrieved context (no hallucination)? | 0-1 |
| **Answer Relevance** | Does the answer address the question asked? | 0-1 |
| **Answer Correctness** | Is the answer factually correct? (requires ground truth) | 0-1 |
| **Answer Similarity** | How similar is the answer to the reference answer? | 0-1 |

---

## RAGAS Framework

RAGAS (Retrieval Augmented Generation Assessment) is the most widely adopted RAG evaluation framework. It uses LLMs as judges to score metrics without requiring manual labeling for most metrics.

### Installation and Basic Usage

```python
pip install ragas langchain_openai

from ragas import evaluate
from ragas.metrics import (
    faithfulness,
    answer_relevancy,
    context_precision,
    context_recall,
    answer_correctness,
)
from datasets import Dataset

# Prepare evaluation dataset
eval_data = {
    "question": [
        "How do I enable row-level security in PostgreSQL?",
        "What is the difference between shared and separate schemas?",
    ],
    "answer": [
        "To enable RLS, use ALTER TABLE orders ENABLE ROW LEVEL SECURITY, then create policies with CREATE POLICY.",
        "Shared schema uses tenant_id columns for all tenants in one schema. Separate schemas create a namespace per tenant.",
    ],
    "contexts": [
        ["ALTER TABLE orders ENABLE ROW LEVEL SECURITY; CREATE POLICY tenant_isolation ON orders USING (tenant_id = current_setting('app.current_tenant'))"],
        ["Shared database/shared schema: all tenants share tables with tenant_id discriminator. Separate schema: each tenant gets a dedicated PostgreSQL schema."],
    ],
    "ground_truth": [
        "Enable RLS with ALTER TABLE ... ENABLE ROW LEVEL SECURITY and FORCE ROW LEVEL SECURITY, then create policies using CREATE POLICY with USING and WITH CHECK clauses.",
        "In shared schema, all tenants share the same tables with a tenant_id column. In separate schemas, each tenant gets their own schema namespace within the same database.",
    ],
}

dataset = Dataset.from_dict(eval_data)

result = evaluate(
    dataset,
    metrics=[
        faithfulness,
        answer_relevancy,
        context_precision,
        context_recall,
        answer_correctness,
    ],
)

print(result)
# {'faithfulness': 0.92, 'answer_relevancy': 0.88, 'context_precision': 0.95, ...}
```

### Understanding Each Metric

#### Faithfulness

Measures whether every claim in the answer can be traced back to the retrieved context. A faithfulness score of 0.6 means 40% of the claims are hallucinated.

```python
from ragas.metrics import faithfulness

# RAGAS internally:
# 1. Extracts individual claims from the answer
# 2. For each claim, checks if it can be inferred from the context
# 3. faithfulness = (supported claims) / (total claims)

# Example: High faithfulness
# Context: "PostgreSQL RLS uses CREATE POLICY statements"
# Answer: "You can use CREATE POLICY to define RLS rules in PostgreSQL"
# -> All claims grounded in context -> faithfulness = 1.0

# Example: Low faithfulness
# Context: "PostgreSQL RLS uses CREATE POLICY statements"
# Answer: "You can use CREATE POLICY for RLS. MySQL also supports RLS natively."
# -> "MySQL supports RLS" is not in context -> faithfulness = 0.5
```

#### Context Precision

Measures whether the retrieved chunks that are relevant are ranked higher than irrelevant ones.

```python
from ragas.metrics import context_precision

# High precision: relevant chunks at positions 1, 2; irrelevant at 3, 4, 5
# Low precision: irrelevant at positions 1, 2, 3; relevant at 4, 5
```

#### Context Recall

Measures whether all statements in the ground truth answer are supported by at least one retrieved chunk.

```python
from ragas.metrics import context_recall

# Requires ground_truth in the dataset
# context_recall = (ground truth statements supported by context) / (total ground truth statements)
```

---

## LangSmith Evaluation

LangSmith provides tracing, evaluation, and monitoring for LLM applications.

### Setting Up Evaluation Runs

```python
from langsmith import Client
from langsmith.evaluation import evaluate as ls_evaluate

client = Client()

# Create a dataset in LangSmith
dataset = client.create_dataset(
    "rag-eval-v1",
    description="RAG evaluation dataset for multitenancy docs"
)

# Add examples
examples = [
    {
        "inputs": {"question": "How do I enable RLS?"},
        "outputs": {"answer": "Use ALTER TABLE ... ENABLE ROW LEVEL SECURITY and create policies with CREATE POLICY."},
    },
    {
        "inputs": {"question": "What is schema-per-tenant?"},
        "outputs": {"answer": "Each tenant gets a dedicated PostgreSQL schema within a shared database."},
    },
]

for example in examples:
    client.create_example(
        inputs=example["inputs"],
        outputs=example["outputs"],
        dataset_id=dataset.id,
    )
```

### Custom Evaluators

```python
from langsmith.evaluation import EvaluationResult

def faithfulness_evaluator(run, example) -> EvaluationResult:
    """Custom evaluator that checks if the answer is grounded in retrieved context."""
    prediction = run.outputs.get("answer", "")
    contexts = run.outputs.get("contexts", [])

    # Use an LLM to judge faithfulness
    from langchain_openai import ChatOpenAI
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

    prompt = f"""Given the following context and answer, determine if every claim
in the answer is supported by the context. Return a score from 0.0 to 1.0.

Context: {' '.join(contexts)}

Answer: {prediction}

Score (0.0-1.0):"""

    response = llm.invoke(prompt)
    score = float(response.content.strip())

    return EvaluationResult(key="faithfulness", score=score)


def correctness_evaluator(run, example) -> EvaluationResult:
    """Check answer correctness against ground truth."""
    prediction = run.outputs.get("answer", "")
    reference = example.outputs.get("answer", "")

    from langchain_openai import ChatOpenAI
    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

    prompt = f"""Compare the predicted answer to the reference answer.
Score from 0.0 (completely wrong) to 1.0 (fully correct).

Reference: {reference}
Predicted: {prediction}

Score (0.0-1.0):"""

    response = llm.invoke(prompt)
    score = float(response.content.strip())

    return EvaluationResult(key="correctness", score=score)


# Run evaluation
results = ls_evaluate(
    rag_chain.invoke,
    data="rag-eval-v1",
    evaluators=[faithfulness_evaluator, correctness_evaluator],
    experiment_prefix="rag-v2-chunking-1000",
)
```

---

## Building Evaluation Datasets

### Approach 1: Manual Curation

Best for high-stakes applications. Domain experts write question-answer-context triples.

```python
eval_dataset = [
    {
        "question": "How do I set up RLS for a multitenant PostgreSQL database?",
        "ground_truth": "Enable RLS with ALTER TABLE ... ENABLE ROW LEVEL SECURITY, then FORCE ROW LEVEL SECURITY. Create policies with CREATE POLICY using the USING clause for reads and WITH CHECK for writes. Set tenant context with SET LOCAL app.current_tenant.",
        "expected_sources": ["multitenancy/row-level-security.md"],
        "difficulty": "medium",
    },
    # ... more examples
]
```

### Approach 2: Synthetic Generation

Use an LLM to generate question-answer pairs from your documents.

```python
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(model="gpt-4o", temperature=0.7)

def generate_qa_pairs(document_text: str, num_pairs: int = 5) -> list[dict]:
    prompt = f"""Given the following document, generate {num_pairs} question-answer pairs
that test understanding of the key concepts. Each question should be specific and
answerable from the document. Format as JSON array.

Document:
{document_text}

Generate {num_pairs} pairs as JSON:
[{{"question": "...", "answer": "...", "difficulty": "easy|medium|hard"}}]"""

    response = llm.invoke(prompt)
    return json.loads(response.content)


# Generate from all your documents
all_qa_pairs = []
for doc in documents:
    pairs = generate_qa_pairs(doc.page_content)
    for pair in pairs:
        pair["source"] = doc.metadata["source"]
    all_qa_pairs.extend(pairs)
```

### Approach 3: RAGAS Synthetic Test Generation

```python
from ragas.testset.generator import TestsetGenerator
from ragas.testset.evolutions import simple, reasoning, multi_context
from langchain_openai import ChatOpenAI, OpenAIEmbeddings

generator_llm = ChatOpenAI(model="gpt-4o")
critic_llm = ChatOpenAI(model="gpt-4o")
embeddings = OpenAIEmbeddings(model="text-embedding-3-small")

generator = TestsetGenerator.from_langchain(
    generator_llm=generator_llm,
    critic_llm=critic_llm,
    embeddings=embeddings,
)

testset = generator.generate_with_langchain_docs(
    documents=documents,
    test_size=50,
    distributions={
        simple: 0.4,           # Simple factual questions
        reasoning: 0.3,        # Questions requiring inference
        multi_context: 0.3,    # Questions needing multiple chunks
    },
)

eval_dataset = testset.to_pandas()
```

### Dataset Size Guidelines

| Purpose | Minimum Size | Recommended |
|---------|-------------|-------------|
| Smoke test (CI) | 10-20 | 30 |
| Development iteration | 50-100 | 100 |
| Pre-production validation | 200-500 | 500 |
| Comprehensive benchmark | 500+ | 1000+ |

---

## Automated Testing Pipeline

### CI Pipeline (GitHub Actions)

```yaml
name: RAG Quality Check
on:
  pull_request:
    paths:
      - 'knowledge/**'
      - 'rag-pipeline/**'

jobs:
  eval:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.12'

      - name: Install dependencies
        run: pip install ragas langchain langchain-openai datasets

      - name: Run RAG evaluation
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        run: python scripts/run_rag_eval.py

      - name: Check thresholds
        run: python scripts/check_eval_thresholds.py
```

### Evaluation Script

```python
# scripts/run_rag_eval.py
import json
import sys
from pathlib import Path
from ragas import evaluate
from ragas.metrics import faithfulness, answer_relevancy, context_precision, context_recall
from datasets import Dataset

# Load eval dataset
with open("eval/dataset.json") as f:
    eval_data = json.load(f)

# Run your RAG pipeline on each question
results = []
for item in eval_data:
    response = rag_pipeline.query(item["question"])
    results.append({
        "question": item["question"],
        "answer": response.answer,
        "contexts": [c.page_content for c in response.source_documents],
        "ground_truth": item["ground_truth"],
    })

dataset = Dataset.from_dict({
    k: [r[k] for r in results] for k in results[0].keys()
})

# Evaluate
scores = evaluate(
    dataset,
    metrics=[faithfulness, answer_relevancy, context_precision, context_recall],
)

# Save results
output = {
    "scores": {k: float(v) for k, v in scores.items()},
    "per_question": scores.to_pandas().to_dict(orient="records"),
}

Path("eval/results.json").write_text(json.dumps(output, indent=2))
print(json.dumps(output["scores"], indent=2))
```

### Threshold Enforcement

```python
# scripts/check_eval_thresholds.py
import json
import sys

THRESHOLDS = {
    "faithfulness": 0.85,
    "answer_relevancy": 0.80,
    "context_precision": 0.75,
    "context_recall": 0.75,
}

with open("eval/results.json") as f:
    results = json.load(f)

failures = []
for metric, threshold in THRESHOLDS.items():
    actual = results["scores"].get(metric, 0)
    if actual < threshold:
        failures.append(f"{metric}: {actual:.3f} < {threshold:.3f}")

if failures:
    print("RAG quality check FAILED:")
    for f in failures:
        print(f"  - {f}")
    sys.exit(1)
else:
    print("RAG quality check PASSED:")
    for metric, threshold in THRESHOLDS.items():
        actual = results["scores"][metric]
        print(f"  {metric}: {actual:.3f} (threshold: {threshold:.3f})")
```

---

## Tracking Evaluation Over Time

### Experiment Tracking

```python
import json
from datetime import datetime
from pathlib import Path

def record_experiment(
    experiment_name: str,
    config: dict,
    scores: dict,
    notes: str = ""
):
    """Append experiment results to a JSONL log."""
    record = {
        "timestamp": datetime.utcnow().isoformat(),
        "experiment": experiment_name,
        "config": config,
        "scores": scores,
        "notes": notes,
    }

    with open("eval/experiment_log.jsonl", "a") as f:
        f.write(json.dumps(record) + "\n")


# Usage after evaluation
record_experiment(
    experiment_name="chunk-size-512-overlap-100-rerank",
    config={
        "chunk_size": 512,
        "chunk_overlap": 100,
        "embedding_model": "text-embedding-3-small",
        "reranker": "cohere-rerank-v3.5",
        "retrieval_k": 20,
        "final_k": 5,
    },
    scores=scores,
    notes="Added cross-encoder re-ranking; +4% faithfulness over baseline",
)
```

---

## Anti-Patterns

1. **Evaluating only end-to-end answer quality.** When answers are wrong, you cannot tell if the problem is retrieval or generation. Always evaluate both stages independently.
2. **Using the same LLM for generation and evaluation.** The evaluator may have the same blind spots as the generator. Use a stronger model for evaluation (e.g., GPT-4o as judge for GPT-4o-mini generation).
3. **Evaluating on the training/indexing corpus.** Your eval dataset should include questions not directly copied from the documents to test actual retrieval and reasoning.
4. **Ignoring edge cases in the eval set.** Include adversarial questions (unanswerable from the corpus), multi-hop questions, and questions requiring negation.
5. **Running evaluation only once.** RAG quality degrades as knowledge bases grow and change. Run evaluation on every change to the corpus or pipeline.
6. **No ground truth for context recall.** Context recall requires reference answers. Without them, you can only measure faithfulness and relevance, missing coverage gaps entirely.

---

## Production Checklist

- [ ] Evaluation dataset has at least 50 curated question-answer pairs with ground truth
- [ ] Evaluation covers all difficulty levels: simple, reasoning, multi-context
- [ ] Faithfulness, answer relevancy, context precision, and context recall are all measured
- [ ] Quality thresholds are enforced in CI (fails the build if below threshold)
- [ ] Evaluation runs on every change to the knowledge base or retrieval pipeline
- [ ] Experiment tracking logs config, scores, and timestamps for comparison
- [ ] A/B testing framework exists for comparing pipeline configurations
- [ ] Edge cases include: unanswerable questions, multi-hop reasoning, exact-match terms
- [ ] Evaluation cost is budgeted (LLM-as-judge calls add up)
- [ ] Human evaluation supplements automated metrics quarterly (spot-check 50+ answers)
- [ ] Regression alerts fire when any metric drops more than 5% from the previous run
