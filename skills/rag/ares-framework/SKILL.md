---
name: ares-framework
description: |
  ARES (Stanford) automated RAG evaluation: synthetic query generation,
  fine-tuned classifiers for faithfulness and relevance, prediction-powered
  inference (PPI) for unbiased estimates from a small gold set. Compared to
  RAGAS.

  USE WHEN: user mentions "ARES", "Stanford ARES", "prediction-powered inference",
  "PPI for RAG", "ares-ai", "fine-tuned RAG judges", "automated RAG eval with
  small gold set"

  DO NOT USE FOR: LLM-as-judge only workflow - use `rag-evaluation` (RAGAS);
  Giskard tooling - use `giskard-rag`; CI integration patterns - use
  `continuous-evaluation`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# ARES Evaluation Framework

## What ARES Is

ARES (Stanford, 2024) is an automated RAG evaluation framework. Unlike RAGAS,
which uses a large LLM as judge at eval time, ARES trains small classifiers
(DeBERTa-size) on synthetic data, then uses **prediction-powered inference (PPI)**
to combine classifier outputs with a small human-labeled set for statistically
unbiased estimates.

Core claim: you can get tight confidence intervals on RAG quality metrics with
as few as 150-300 human labels, plus thousands of synthetic examples.

## Three Scored Dimensions

| Dimension | Question |
|---|---|
| Context Relevance | Is retrieved context relevant to the query? |
| Answer Faithfulness | Is the answer grounded in the context (no hallucination)? |
| Answer Relevance | Does the answer address the query? |

Each is a binary classifier producing probability scores.

## Pipeline

```
corpus -> synth (q, ctx, a, labels) -> train 3 classifiers
                                           |
                                           v
prod logs (q, ctx, a) -> classifier predictions -> PPI  <- gold (150-300 human labels)
                                                     |
                                                     v
                                    unbiased metric + confidence interval
```

## Setup

```bash
pip install ares-ai
```

Requires a local GPU (~16GB VRAM) for classifier fine-tuning.

## Synthetic Query Generation

```python
from ares import ARES

ares = ARES(
    synthetic_query_generator="google/flan-t5-xl",
    document_filepaths=["corpus.tsv"],
    few_shot_prompt_filename="few_shot_prompts.tsv",
    synthetic_queries_filenames=["synth_queries.tsv"],
    documents_sampled=10000,
)
ares.generate_synthetic_data()
```

The synthetic set contains:

- Relevant positive examples (query + matching context).
- Negative contexts (query + random / near-miss context).
- Hallucinated answers (inject contradictions).
- Unfaithful rewrites.

## Training Judge Classifiers

```python
classifier_cfg = {
    "classification_dataset": "synth_queries.tsv",
    "test_set_selection": "gold_test.tsv",
    "label_column": ["Context_Relevance_Label",
                     "Answer_Faithfulness_Label",
                     "Answer_Relevance_Label"],
    "num_epochs": 10,
    "patience_value": 3,
    "learning_rate": 5e-6,
    "training_dataset_path": "synth_queries.tsv",
    "assigned_batch_size": 8,
    "gradient_accumulation_multiplier": 16,
    "model_choice": "microsoft/deberta-v3-large",
}

ares.train_classifier(**classifier_cfg)
```

Output: three fine-tuned DeBERTa classifiers saved to disk.

## Prediction-Powered Inference (PPI)

Human labels are expensive. Pure LLM-judge is cheap but biased.
PPI gives unbiased estimates by correcting classifier bias using a small
labeled sample.

```python
ppi_cfg = {
    "evaluation_datasets": ["prod_logs_labeled.tsv"],  # has ~200 human labels + classifier preds
    "few_shot_examples_filepath": "few_shot_prompts.tsv",
    "checkpoints": ["ckpt_context_rel.pt",
                    "ckpt_faithfulness.pt",
                    "ckpt_answer_rel.pt"],
    "labels": ["Context_Relevance_Label",
               "Answer_Faithfulness_Label",
               "Answer_Relevance_Label"],
    "gold_label_path": "gold_labels.tsv",
}

scores = ares.evaluate_RAG(**ppi_cfg)
# {
#   "Context Relevance":  {"score": 0.83, "ci_low": 0.79, "ci_high": 0.87},
#   "Answer Faithfulness":{"score": 0.91, "ci_low": 0.88, "ci_high": 0.94},
#   "Answer Relevance":   {"score": 0.77, "ci_low": 0.72, "ci_high": 0.82},
# }
```

PPI output includes confidence intervals — critical for reporting and A/B tests.

## PPI Math (Intuition)

Let f(x) be the classifier prediction, y be the true label on gold set of
size n, and classifier predictions on an unlabeled set of size N.

```
mean_true ~= mean(f over unlabeled) + mean(y - f over gold)
             ^^^^^ biased estimator    ^^^^^ bias correction
```

CI shrinks as both n and N grow; N is cheap (classifier predictions), so PPI
gives near-full-label precision with small n.

## Comparison with RAGAS

| Aspect | RAGAS | ARES |
|---|---|---|
| Judge | Large LLM (GPT-4, Claude Sonnet) at eval time | Small fine-tuned classifier |
| Cost per 1000 evals | $5-20 (LLM calls) | ~$0 (local inference) |
| Calibration | Prompt-engineered, hard to debug | Classifier + PPI, statistically grounded |
| Labeled data | None needed | 150-300 gold labels required |
| Infrastructure | API key only | Needs GPU for training |
| Confidence intervals | Not built-in | Native via PPI |
| Domain adaptation | Rewrite prompt | Fine-tune on domain synth |
| Startup cost | Minutes | Hours (training) |
| Ongoing eval speed | API-bound | Fast (local) |

## When ARES Wins

- You evaluate at scale (>100k samples per run) and LLM-judge cost is
  prohibitive.
- You need **confidence intervals** for A/B tests or regulatory reporting.
- You have a specialized domain (medical, legal) where generic LLM judges
  miscalibrate.
- You want reproducible evaluation: fixed classifier weights vs a constantly
  updating LLM.
- You need offline evaluation without outbound API calls.

## When ARES Loses

- You have fewer than ~100 gold labels (PPI loses statistical power).
- You need quick iteration: RAGAS runs in minutes, ARES needs a training phase.
- You don't have GPU access.
- Your judge criteria change weekly — re-fine-tuning is heavier than prompt
  edits.

## Gold Label Collection

ARES expects rows:

```
query	context	answer	Context_Relevance_Label	Answer_Faithfulness_Label	Answer_Relevance_Label
"..."	"..."	"..."	1	1	0
```

Label conventions:

- Context Relevance: 1 if context contains info to answer, else 0.
- Answer Faithfulness: 1 if every claim in answer is in context, else 0.
- Answer Relevance: 1 if answer addresses query, else 0.

Get three annotators per item; use majority vote. Report Cohen's kappa > 0.6
before trusting labels.

## CI Integration Sketch

```python
# nightly_ares.py
results = ares.evaluate_RAG(**ppi_cfg)
for dim, vals in results.items():
    if vals["ci_low"] < BASELINES[dim] - 0.02:
        print(f"REGRESSION: {dim} dropped to {vals['score']:.3f} (CI {vals['ci_low']:.3f}-{vals['ci_high']:.3f})")
        raise SystemExit(1)
```

Also see `continuous-evaluation` skill for full CI patterns.

## Refreshing the Judge

Re-train when:

- Domain vocabulary shifts (new product area, new regulations).
- Synthetic data quality improves (better generator LLM available).
- Gold set grows by 2x or more.
- Classifier accuracy on gold drops below 85%.

Do not re-train for cosmetic query wording changes.

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Running ARES without any gold labels | Need 150+ for PPI to work |
| Using synthetic-only data as the final evaluator | Synthetic has generator bias; PPI requires real labels |
| Single-annotator gold set | Three annotators + majority; report kappa |
| Training classifier once, never refreshing | Re-train quarterly or on domain shift |
| Mixing ARES scores across model versions | Re-score baseline with current classifier every time |
| Reporting point estimate only | Always include the CI from PPI |
| Relying on ARES in domains the generator doesn't cover | Fine-tune generator LLM or inject few-shot domain examples |

## Production Checklist

- [ ] Synthetic set of 5k-10k queries generated and manually spot-checked
- [ ] Gold set of 150-300 examples with 3 annotators and kappa > 0.6
- [ ] Three judge classifiers trained; test-set accuracy logged
- [ ] PPI evaluation script wired into nightly pipeline
- [ ] Confidence intervals reported alongside point scores
- [ ] Baseline scores versioned; regression alert < baseline - 2pp
- [ ] Classifier retrain schedule documented (quarterly + on-trigger)
- [ ] Documented comparison vs RAGAS before adopting in production
