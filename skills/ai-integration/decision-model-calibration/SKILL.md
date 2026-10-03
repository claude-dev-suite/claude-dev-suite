---
name: decision-model-calibration
description: |
  Turning a model's class probabilities into numbers you can set a threshold on:
  building the labelled corpus, measuring accuracy and calibration honestly (ECE
  with a noise floor, Brier, risk–coverage), fitting temperature/Platt, removing
  option-order bias, conformal prediction sets, and choosing per-action
  thresholds. Applies to Jev and any typed classifier with probabilities, and
  says which LLM providers expose logprobs at all.

  USE WHEN: user asks whether a confidence/probability can be trusted, how to
  pick a threshold, about "calibration", "ECE", "reliability diagram",
  "temperature scaling", "Platt", "isotonic", "CalibratedClassifierCV",
  "conformal prediction", "abstain", "selective prediction", "risk coverage",
  "position bias", "option order", "logprobs", or wants to evaluate Jev or an
  LLM classifier against labels.

  DO NOT USE FOR: training classifiers from scratch, or generic LLM evals of
  free-text output (no class probabilities to calibrate).
allowed-tools: Read, Grep, Glob, Write, Edit, Bash
---

# Calibrating decision models

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology:
> `decision-calibration` and one of these topics:
> - `calibration`: ECE variants, debiased estimators, isotonic and vector scaling, bootstrap CIs, contextual calibration.
> - `order-bias`: position and label bias, flip-rate measurement, PriDe.
> - `conformal`: LAC, APS and RAPS, plus class-conditional coverage.
> - `provider-logprobs`: request examples for each provider.
> - `eval-harness`: a complete runnable harness that compares Jev with an LLM on your own corpus and writes the decision report.

A probability is useful only if "0.9" means right about nine times in ten **on
your data**. No vendor can promise that for you: calibration depends on your
inputs, your language and your label set, and it shifts with every model
version. This skill is the procedure; `typed-decision-models` has the evidence
about Jev in particular. The code below was run on simulated data with known
over-confidence before it was written here (Python 3.12, numpy 2.5, scipy 1.18,
scikit-learn 1.9.1).

## 1. The corpus comes first

It outlives every model you try against it, and it is the only thing that lets
you compare them.

- **Draw from production traffic**, not from what is easy to label. Same
  language, same state shape, same class balance — and include the ambiguous
  cases, which are the ones thresholds exist for.
- **Size.** About 50 labels per question can fit a one-parameter correction;
  **fewer than ~30 can make calibration worse** (observed on Jev). Isotonic
  regression needs on the order of 1,000 (scikit-learn warns against it when
  the number of calibration samples is "too low (≪1000)"). Thresholds for rare, expensive classes need enough
  examples *of that class*.
- **Split** into a calibration half and a test half; never report a metric on
  the data a correction was fitted on.
- **Label what a person on the team would do**, not what the model said. A
  corpus labelled by another model measures agreement, not correctness — the
  exact flaw in the Jev launch benchmark.
- **Record the model version** alongside every stored probability, so a
  re-tune can be triggered when it changes.

## 2. Measure

```python
import numpy as np


def ece(confidence, correct, n_bins=10):
    """Expected calibration error with equal-mass bins (less biased than equal-width)."""
    confidence = np.asarray(confidence, float)
    correct = np.asarray(correct, float)
    order = np.argsort(confidence)
    total = len(confidence)
    return sum(
        len(b) / total * abs(correct[b].mean() - confidence[b].mean())
        for b in np.array_split(order, n_bins)
        if len(b)
    )


def ece_noise_floor(confidence, n_bins=10, n_sims=2000, seed=0):
    """ECE a *perfectly calibrated* model would show on this many items with these
    confidences. A measured ECE inside this band is indistinguishable from noise."""
    rng = np.random.default_rng(seed)
    confidence = np.asarray(confidence, float)
    sims = [ece(confidence, rng.random(confidence.size) < confidence, n_bins) for _ in range(n_sims)]
    return np.percentile(sims, [50, 95])


def brier(probs, labels):
    """Multiclass Brier score; probs is (n, k), labels are column indices."""
    probs = np.asarray(probs, float)
    onehot = np.eye(probs.shape[1])[labels]
    return np.mean(np.sum((probs - onehot) ** 2, axis=1))
```

Report, per question:
- **accuracy with a confidence interval**. n = 77 gives roughly ±10 points;
- **ECE next to its noise floor**. The floor depends on n *and* on how spread
  the confidences are: at n = 60 a perfectly calibrated model scores a median
  ≈ 0.06 when confidences cluster near 1, but ≈ 0.13 when they spread over
  0.4–1 (simulated with `ece_noise_floor`). A bare ECE is uninterpretable;
- **Brier score**, which punishes both miscalibration and poor discrimination;
- **direction**: is the error over-confident (most binned accuracy below binned
  confidence) or compressed toward the middle?

What "confidence" means:
- **Choice:** use `p_max`, or the probability of the chosen option.
- **Noul:** use `max(p, 1 − p)`, with correctness judged at your threshold.

**Do not calibrate Jev's `confidence` field.** It is a dispersion statistic
derived from the distribution (`(p_max − 1/n)/(1 − 1/n)` for Choice), not a
probability. Calibrate `probabilities` or `noul`.

## 3. Fit

### Choice / Score: one temperature

```python
from scipy.optimize import minimize_scalar
from scipy.special import softmax

# Jev rounds probabilities to 0.01 and returns exact zeros. log(0) is -inf, and a
# tiny floor (1e-6) turns every zero into a huge negative logit that inflates the
# fitted temperature. Half the rounding quantum is the honest floor.
FLOOR = 0.005


def to_matrix(answers, options):
    """[{'billing': 0.88, ...}, ...] -> (n, k) array in a fixed option order."""
    return np.array([[a[o] for o in options] for a in answers], float)


def fit_temperature(probs, labels, floor=FLOOR):
    logits = np.log(np.clip(probs, floor, 1.0))
    labels = np.asarray(labels)

    def nll(t):
        p = softmax(logits / t, axis=1)
        return -np.mean(np.log(p[np.arange(len(labels)), labels]))

    return minimize_scalar(nll, bounds=(0.05, 20.0), method="bounded").x


def apply_temperature(probs, t, floor=FLOOR):
    return softmax(np.log(np.clip(probs, floor, 1.0)) / t, axis=1)
```

T > 1 means the model was over-confident; T < 1 means it was under-confident.
The floor is not a detail:
- **Simulation:** true over-confidence T = 2.0, outputs rounded to 0.01 like
  Jev's. A 0.005 floor recovered T = 1.84; a 1e-6 floor reported **3.02**.
- **Published study:** the same artefact made an independent Jev audit publish
  temperatures of 3.29 and 3.40. Its author corrected them on 2026-09-22 to
  1.30 and 1.92.

### Noul: Platt (two parameters)

```python
from scipy.special import logit
from sklearn.linear_model import LogisticRegression


def fit_platt(p_yes, y, floor=FLOOR):
    x = logit(np.clip(np.asarray(p_yes, float), floor, 1 - floor)).reshape(-1, 1)
    return LogisticRegression(C=1e6).fit(x, y)  # effectively unregularised: two parameters


def apply_platt(model, p_yes, floor=FLOOR):
    x = logit(np.clip(np.asarray(p_yes, float), floor, 1 - floor)).reshape(-1, 1)
    return model.predict_proba(x)[:, 1]
```

Platt's slope also corrects **compression toward 0.5**, which independent work
reports for Jev and which a pure shift cannot fix.

### Your own scikit-learn classifier

scikit-learn ≥ 1.8 has `method="temperature"` alongside `"sigmoid"` and
`"isotonic"`. `cv="prefit"` was deprecated in 1.6 and 1.9.1 rejects it with
`InvalidParameterError`; wrap an already-fitted model in `FrozenEstimator`:

```python
from sklearn.calibration import CalibratedClassifierCV
from sklearn.frozen import FrozenEstimator

calibrated = CalibratedClassifierCV(FrozenEstimator(clf), method="temperature").fit(X_cal, y_cal)
```

### What one fit buys

- **Classic result:** temperature scaling alone fixes most of the
  miscalibration of modern networks (Guo et al., ICML 2017).
- **On Jev:** refitting a Platt intercept on 50 labels cut held-out ECE by
  62% in-domain; the slope did not transfer to new domains.
- **This skill's simulation:** ECE went 0.145 → 0.035 on held-out data.

Fit **one correction per question**. Never share one across Noul, Choice and
Score, or across fields.

## 4. Remove option-order bias before trusting a Choice

Multiple-choice selectors favour positions:
- Zheng et al., *Large Language Models Are Not Robust Multiple Choice
  Selectors* (ICLR 2024).
- Pezeshkpour & Hruschka (2023) measured gaps of 13–75% from reordering alone.
- TypeSafe documents that `jev-1.13` "leans toward the option that comes first".

**Cyclic permutation** averages over n orders instead of n!. With Jev, all the
orders go into **one request**: questions are independent and share one read of
the state, so the extra orders cost tokens, not a round trip.

```python
def rotations(criteria, limit=None):
    """Cyclic rotations of a Choice's options (Zheng et al., ICLR 2024): n orders, not n!."""
    items = list(criteria.items())
    n = len(items)
    count = n if limit is None else min(limit, n)
    shifts = sorted({round(j * n / count) % n for j in range(count)})  # evenly spread, first order kept
    return [dict(items[i:] + items[:i]) for i in shifts]


def order_checked_choice(client, state, instructions, criteria, limit=None):
    """Ask the same Choice under several option orders in ONE request and average.

    Questions in a request are independent and share one read of the state, so
    the extra orders cost only their question tokens, not another round trip.
    """
    from typesafe_sdk import Choice

    orders = rotations(criteria, limit)
    questions = {f"order_{i}": Choice(instructions=instructions, criteria=c) for i, c in enumerate(orders)}
    result = client.system_one(state, questions)
    answers = [result.choices[key] for key in questions]
    averaged = {o: sum(a.probabilities[o] for a in answers) / len(answers) for o in criteria}
    winner = max(averaged, key=averaged.get)
    stable = all(a.choice == winner for a in answers)
    return winner, averaged, stable
```

- **Cost:** n orders cost ~n× the question tokens. All of them must fit in the
  64k request budget.
- **Many options:** set `limit` (e.g. 3–4 evenly spaced rotations).
- **How to use it:**
  - Run it **offline over the corpus** first, to measure how often the answer
    flips.
  - Add it in production only for decisions whose `stable=False` rate justifies
    the tokens.
  - Calibrate the *averaged* probabilities, not the single-order ones.
- **Option names matter too.** Renaming labels moved AUC from 0.81 to 0.58 on
  hosted Jev (arXiv 2609.26758). Once a wording is tuned, freeze option names
  like an API.
- **Contextual calibration** (Zhao et al., *Calibrate Before Use*, ICML 2021)
  is the complementary fix for a label prior. Score a content-free input such
  as "N/A", then divide out the bias it reveals.

## 5. Choose thresholds from cost, then check coverage

```python
def risk_coverage(confidence, correct):
    """For each candidate bar: the share of items kept and the error rate among them."""
    confidence = np.asarray(confidence, float)
    correct = np.asarray(correct, bool)
    rows = []
    for bar in np.unique(confidence):
        kept = confidence >= bar
        rows.append((bar, kept.mean(), 1 - correct[kept].mean()))
    return rows


def lowest_bar_for(target_error, confidence, correct, min_kept=30):
    """Lowest bar whose kept items err at most target_error, with at least min_kept items."""
    for bar, coverage, error in risk_coverage(confidence, correct):
        if error <= target_error and coverage * len(confidence) >= min_kept:
            return bar, coverage, error
    return None
```

- **Ask for each direction's cost separately.** For a Noul, the false-positive
  and false-negative costs set where the bar sits. TypeSafe's own advice: raise
  it when acting on a false yes is expensive, lower it when missing a true yes
  is.
- **Read coverage alongside error.** A bar that hands 80% of traffic to an LLM
  costs more than no decision model at all; the hand-off rate is the number
  that shows it.
- **Bars are ranges, not points.** Jev's probabilities move by a few hundredths
  between identical calls, so leave margin.
- **For a guarantee rather than an estimate**, use selective classification
  with a risk bound (Geifman & El-Yaniv, NeurIPS 2017). It picks the bar so
  that the target error holds with high probability.
- **Re-tune whenever any of these change:** model version, option wording,
  option set, or traffic mix.

## 6. Conformal sets: "one of these, with 90% coverage"

When acting needs a guarantee and a single label is too strong, return a
**set**. Use split conformal with the LAC score (Kumar et al. 2023), on
calibrated probabilities:

```python
def conformal_qhat(p_true_label, alpha):
    """p_true_label: calibrated probability each calibration item gave its *true* label."""
    scores = np.sort(1.0 - np.asarray(p_true_label, float))
    n = len(scores)
    k = int(np.ceil((n + 1) * (1 - alpha)))
    return 1.0 if k > n else scores[k - 1]  # too few items: the set must be everything


def prediction_set(probabilities, qhat):
    return [option for option, p in probabilities.items() if 1.0 - p <= qhat]
```

- **What it guarantees:** the true label is in the set at least 1 − α of the
  time, provided traffic is exchangeable with the calibration data. In
  simulation, α = 0.1 gave 91.7% coverage.
- **How to act on it:**
  - singleton → act automatically;
  - two or more options → ask the user or a human;
  - empty → treat as out of distribution.
- **Variants:** APS (Romano et al. 2020) and RAPS (Angelopoulos et al., ICLR
  2021) give adaptive or smaller sets.
- **When the guarantee breaks:** it does not survive a shift in traffic.
  Re-calibrate when the input mix changes.

## 7. Which providers give you probabilities at all (2026-10-03)

| Provider | Class probabilities | Notes |
|---|---|---|
| **TypeSafe Jev** | yes, native | `probabilities` / `noul`, rounded to 0.01 |
| **Anthropic (Claude)** | **no** | Messages API has no logprobs; OpenAI-compat `logprobs`/`top_logprobs` are "Ignored", response field "Always empty". Structured outputs give a typed enum, not a distribution |
| **OpenAI** | yes, restricted | `logprobs` + `top_logprobs` 0–20. On GPT-6, with reasoning effort other than `none` these must be removed — no logprobs from a reasoning model that is reasoning |
| **Google Gemini** | documented, **not on 3.x** | `responseLogprobs: true`, `logprobs` 0–20; `text/x.enum` for enums. A Google staff member stated on the developer forum (2026-08-05) that "logprobs are no longer returned for 3.X models"; Vertex users report 2.5 losing them too. Test the exact model |
| **vLLM** | yes | `logprobs` (cap `max_logprobs`, default 20); structured `choice` output. Default `logprobs_mode` is `raw_logprobs` — **before** logit processors, so a constraint is not reflected |
| **llama.cpp server** | yes | `n_probs`; `post_sampling_probs` for after the sampling chain; `grammar` / `json_schema` constraints |

With logprobs, constrain the label to a **single token**. For a single-token
enum, a grammar's renormalisation is exactly the conditional class posterior.
For multi-token labels it is not.

**Without logprobs (Claude), each option costs more than one call:**
- **Sample k times** and use label frequency.
- **Verbalized confidence.** It is better calibrated than token probabilities
  for RLHF models (Tian et al., EMNLP 2023), but over-confident (Xiong et al.,
  ICLR 2024).
- **A panel of prompts that vote.**

Post-training makes this worse: GPT-4's MMLU ECE went from 0.007 pre-trained
to 0.074 after RLHF (GPT-4 Technical Report, Fig. 8). Calibrate whatever you
end up with.

## Checklist before a threshold goes to production

- [ ] Labelled corpus from production traffic, in the production language, split cal/test
- [ ] Accuracy with CI, ECE with noise floor, Brier — per question, on the test half
- [ ] Option-order flip rate measured; averaging adopted where it matters
- [ ] One temperature (Choice/Score) or Platt (Noul) fit per question, floor = half the rounding quantum
- [ ] Threshold chosen from asymmetric costs; coverage / hand-off rate recorded
- [ ] Model version pinned and logged; re-tune trigger defined
- [ ] Destructive actions still gated by approval, not by a probability alone
