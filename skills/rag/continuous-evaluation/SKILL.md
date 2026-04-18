---
name: continuous-evaluation
description: |
  CI/CD for RAG quality: golden dataset fixtures, RAGAS/DeepEval in pytest,
  regression thresholds, GitHub Actions workflows, merge-blocking gates,
  weekly scheduled eval, LangSmith/Langfuse in CI.

  USE WHEN: user mentions "RAG CI", "eval in CI", "regression gate", "golden
  dataset fixture", "PR quality check", "scheduled RAG evaluation", "LangSmith
  CI", "Langfuse CI"

  DO NOT USE FOR: RAGAS metric internals - use `rag-evaluation`; ARES - use
  `ares-framework`; Giskard internals - use `giskard-rag`; shadow deploys -
  use `shadow-mode-deployment`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Continuous RAG Evaluation

## Three Layers of Cadence

| Layer | When | Budget | Purpose |
|---|---|---|---|
| PR gate | Every pull request | <5 min, $0-$5 | Block obvious regressions |
| Nightly | Daily scheduled | 20-60 min, $10-$50 | Full gold set + trend reporting |
| Weekly | Weekly scheduled | Hours, $50-$300 | Refresh testset, sample live traffic |

Missing any of these layers leaves a gap. PR gate without nightly misses slow
drift; nightly without PR gate lets bad PRs land.

## Golden Dataset as a Fixture

```python
# tests/fixtures/gold.py
import json, functools

@functools.lru_cache(maxsize=1)
def load_gold():
    with open("tests/fixtures/gold.jsonl") as f:
        return [json.loads(l) for l in f]

# tests/fixtures/gold.jsonl is git-tracked
```

```json
{"id":"g001","question":"How do I rotate an API key?","expected":"Settings > API Keys > Rotate","relevant_doc_ids":["kb-042","kb-110"],"category":"procedural","difficulty":"easy"}
{"id":"g002","question":"Which SSO providers are supported?","expected":"Okta, Google Workspace, Microsoft Entra","relevant_doc_ids":["kb-200"],"category":"factual","difficulty":"easy"}
```

Rules:

- Keep 100-300 records minimum.
- Stratify across category, difficulty, persona.
- Version with git; never mutate without a PR.
- Add one failing production query each week.

## PR Gate with DeepEval + Pytest

```python
# tests/test_rag_pr_gate.py
import pytest
from deepeval import assert_test
from deepeval.test_case import LLMTestCase
from deepeval.metrics import (
    FaithfulnessMetric, AnswerRelevancyMetric,
    ContextualPrecisionMetric, ContextualRecallMetric,
)
from fixtures.gold import load_gold
from rag_pipeline import answer

# Fast subset: only `difficulty == easy` runs on PR
GOLD_PR = [g for g in load_gold() if g["difficulty"] == "easy"][:30]

@pytest.mark.parametrize("gold", GOLD_PR, ids=lambda g: g["id"])
def test_pr_gate(gold):
    result = answer(gold["question"])
    tc = LLMTestCase(
        input=gold["question"],
        actual_output=result.answer,
        expected_output=gold["expected"],
        retrieval_context=result.contexts,
    )
    assert_test(tc, [
        FaithfulnessMetric(threshold=0.80),
        AnswerRelevancyMetric(threshold=0.80),
        ContextualPrecisionMetric(threshold=0.70),
        ContextualRecallMetric(threshold=0.75),
    ])
```

Run: `pytest tests/test_rag_pr_gate.py -n 4 --maxfail=3`.

## Nightly RAGAS Eval

```python
# eval/nightly.py
from datasets import Dataset
from ragas import evaluate
from ragas.metrics import (faithfulness, answer_relevancy,
                            context_precision, context_recall, answer_correctness)
from rag_pipeline import answer
from fixtures.gold import load_gold
import json, os, time

rows = []
for g in load_gold():
    r = answer(g["question"])
    rows.append({
        "user_input": g["question"],
        "retrieved_contexts": r.contexts,
        "response": r.answer,
        "reference": g["expected"],
    })

ds = Dataset.from_list(rows)
result = evaluate(ds, metrics=[faithfulness, answer_relevancy,
                               context_precision, context_recall,
                               answer_correctness])

df = result.to_pandas()
summary = {
    "timestamp": int(time.time()),
    "commit_sha": os.environ.get("GITHUB_SHA", "local"),
    "metrics": {c: float(df[c].mean()) for c in df.select_dtypes("number").columns},
}
with open("eval/history.jsonl", "a") as f:
    f.write(json.dumps(summary) + "\n")

# Regression check vs baseline
with open("eval/baseline.json") as f:
    baseline = json.load(f)
for metric, value in summary["metrics"].items():
    base = baseline.get(metric, 0.0)
    if value < base - 0.03:
        raise SystemExit(f"REGRESSION: {metric} {value:.3f} < baseline {base:.3f} - 0.03")
```

## GitHub Actions Workflow

```yaml
# .github/workflows/rag-eval.yml
name: RAG Evaluation

on:
  pull_request:
    paths:
      - "src/rag/**"
      - "prompts/**"
      - "configs/retriever.yaml"
      - "tests/fixtures/gold.jsonl"
  schedule:
    - cron: "0 3 * * *"   # nightly 03:00 UTC

jobs:
  pr-gate:
    if: github.event_name == 'pull_request'
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: {python-version: "3.12"}
      - run: pip install -r requirements-eval.txt
      - run: pytest tests/test_rag_pr_gate.py -n 4 --maxfail=3 --junitxml=gate.xml
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: pr-gate-report
          path: gate.xml

  nightly:
    if: github.event_name == 'schedule'
    runs-on: ubuntu-latest
    timeout-minutes: 90
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: {python-version: "3.12"}
      - run: pip install -r requirements-eval.txt
      - run: python eval/nightly.py
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      - name: Commit history
        run: |
          git config user.name "rag-bot"
          git config user.email "rag-bot@users.noreply.github.com"
          git add eval/history.jsonl
          git commit -m "chore(eval): nightly $(date -u +%F)" || exit 0
          git push
```

## Branch Protection

Required checks to enable on `main`:

- `pr-gate` workflow success.
- At least one human review.
- Status from Langfuse / LangSmith eval run if using a managed platform.

## Baseline Management

Baseline drifts — monthly refresh:

```python
# eval/refresh_baseline.py
import json, statistics
with open("eval/history.jsonl") as f:
    recent = [json.loads(l) for l in f.readlines()[-30:]]

baseline = {}
for m in recent[0]["metrics"]:
    values = [r["metrics"][m] for r in recent]
    baseline[m] = statistics.median(values)

with open("eval/baseline.json", "w") as f:
    json.dump(baseline, f, indent=2)
```

Commit the refreshed baseline via PR, with a description of why it moved.

## Hermetic CI Considerations

- Pin model versions (`claude-sonnet-4-5-20250929`, `gpt-4o-mini-2024-07-18`).
- Use deterministic temperature (0) for judges.
- Cache embeddings for the gold set to avoid re-encoding in every run.
- Mock external data sources; rely only on the committed KB snapshot.

```python
# conftest.py
import pytest

@pytest.fixture(scope="session")
def frozen_kb():
    from rag_pipeline import load_kb
    return load_kb(snapshot="2026-04-01")  # immutable snapshot
```

## LangSmith / Langfuse in CI

```python
# LangSmith
from langsmith import Client
from langsmith.evaluation import evaluate as ls_evaluate

client = Client()
experiment = ls_evaluate(
    lambda inputs: answer(inputs["question"]).answer,
    data="gold-v3",
    evaluators=[faithfulness_evaluator, relevance_evaluator],
    experiment_prefix=f"ci-{os.environ['GITHUB_SHA'][:7]}",
)
url = experiment.experiment_url
print(f"::notice::LangSmith run {url}")
```

```python
# Langfuse
from langfuse.decorators import observe
from langfuse import Langfuse

lf = Langfuse()
dataset = lf.get_dataset("gold-v3")
run_name = f"ci-{os.environ['GITHUB_SHA'][:7]}"
for item in dataset.items:
    with item.observe(run_name=run_name) as trace_id:
        r = answer(item.input["question"])
        lf.score(trace_id=trace_id, name="faithfulness",
                 value=compute_faithfulness(r, item.expected_output))
```

## Regression Policy

Tiered thresholds:

| Metric | Warn | Block PR |
|---|---|---|
| Faithfulness | -1pp | -3pp |
| Answer relevancy | -1pp | -3pp |
| Context recall | -2pp | -5pp |
| Answer correctness | -2pp | -5pp |

Blocking thresholds are intentionally loose early; tighten as your baseline
stabilizes.

## Sampling Live Traffic Weekly

```python
# Sunday 02:00 — sample last week of prod logs
from rag_pipeline.telemetry import sample_prod_traces

traces = sample_prod_traces(days=7, n=200)
ds = Dataset.from_list([{
    "user_input": t.question,
    "retrieved_contexts": t.contexts,
    "response": t.answer,
    "reference": None,   # no ground truth
} for t in traces])

result = evaluate(ds, metrics=[faithfulness, answer_relevancy])
# Ground-truth-free metrics only for live traces
```

Feeds results into the same `eval/history.jsonl` with a `source=live` tag.

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Running full gold set on every PR | Subset to ~30 easy items for PR gate |
| No baseline file; thresholds hardcoded in tests | Manage `eval/baseline.json` via monthly refresh |
| Judges at `temperature=0.7` | Set temperature=0 for determinism in CI |
| Evaluation silently fails, merge proceeds | Mark step `continue-on-error: false` and check exit codes |
| Eval workflow reads live DB | Use immutable KB snapshots; commit gold set |
| Never updating gold set | Weekly: add 1-5 failures from prod |
| Ignoring latency/cost in regression checks | Track p95 latency and $/query alongside quality |

## Production Checklist

- [ ] Golden dataset with 100+ stratified records in git
- [ ] PR gate subset (easy, ~30 items) under 5 minutes
- [ ] Nightly full-eval writes to `eval/history.jsonl`
- [ ] Baseline file refreshed monthly via PR
- [ ] Regression thresholds documented and enforced
- [ ] GitHub Actions secrets configured; model versions pinned
- [ ] Weekly live-traffic sampling with ground-truth-free metrics
- [ ] LangSmith or Langfuse dashboards linked in README
- [ ] Latency and cost tracked alongside quality metrics
- [ ] Runbook for "CI eval failed" — how to triage in < 15 min
