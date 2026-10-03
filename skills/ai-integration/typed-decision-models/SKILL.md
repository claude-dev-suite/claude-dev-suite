---
name: typed-decision-models
description: |
  Replacing an LLM used as a classifier with a model that returns typed
  decisions and probabilities instead of prose — TypeSafe's Jev and the wider
  pattern. Covers the three primitives, the decomposition that makes them work,
  what `confidence` does and does not mean, and the independently measured
  evidence on where the vendor's claims hold.

  USE WHEN: user mentions "Jev", "TypeSafe AI", "System One model", "typed
  decision model", "decision model", "calibrated probabilities", "classifier
  instead of LLM", "logprobs", "confidence threshold", "ECE", asks how to get a
  confidence score out of a model, or asks whether to replace a classification
  prompt with something cheaper.

  DO NOT USE FOR: prose generation, code generation, multi-step reasoning, or
  anything needing a written justification — those are the cases these models
  explicitly cannot serve. For SDK/API code load `typesafe-jev`; for measuring
  and fitting probabilities load `decision-model-calibration`.
allowed-tools: Read, Grep, Glob, Write, Edit, WebFetch
---

# Typed decision models

A class of model that does not generate text. You declare the answer space up
front; the model distributes probability inside it. TypeSafe's **Jev** is the
first sold under that banner ("System One", after Kahneman's fast thinking —
launched in early access on 2026-09-15), and Pydantic AI already abstracts the
class behind a `DecisionModel` base so other backends can follow.

The point is not speed. The point is that **the answer and its uncertainty come
back as separate things**, so code can act on one and route on the other.

> Facts below were verified against primary sources on **2026-10-03**. This
> vendor moves fast: its limitations page was rewritten on 2026-10-02 and its
> rate limit doubled the same week. Re-check anything operational on
> `docs.typesafe.ai` before quoting it.

## Related skills

| Need | Load |
|---|---|
| Python/JS SDK, HTTP API, limits, pricing, framework integrations | `ai-integration/typesafe-jev` |
| Building the labelled corpus, ECE, temperature/Platt fits, option-order debiasing, conformal sets, thresholds | `ai-integration/decision-model-calibration` |

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology:
> `typesafe-jev`, topic `evidence`, for the full ledger of independent studies:
> their methodology, sample sizes, authors' own caveats and later corrections,
> and the history of the vendor's limitations page.

## The three primitives

| | asks | returns | limits (jev-1.13) |
|---|---|---|---|
| **Noul** | is this true? | `noul`: P(yes), 0–1 | no `confidence` field — 0.5 *is* "unsure" |
| **Choice** | which of these? | `choice`, `probabilities` (sum to 1), `confidence` | ≤ 255 options |
| **Score** | at what level? | `score` (probability-weighted, lands *between* levels), `legend`, `probabilities`, `confidence` | 2–10 ordered levels |

Questions in one request share a single read of the `state` and are
**independent**: one answer never becomes context for another. A decision that
depends on a previous one needs a second call. Batching is the main economic
lever — the vendor's own cookbook measured 13 questions in one call at 12.2×
cheaper and 10.0× faster than 13 separate calls.

## What `confidence` is — and is not

`confidence` is a **dispersion statistic computed from `probabilities`**, not a
probability of being right:

- Choice: `(p_max − 1/n) / (1 − 1/n)` — so `(0.6, 0.3, 0.1)` and `(0.6, 0.2, 0.2)` both give 0.4.
- Score: `max(0, 1 − Σ pᵢ·|i − peak| / MAD_uniform)` — mass on a neighbouring level costs less than mass far away.
- Noul: none returned; the vendor suggests `|2p − 1|` if you need one on the same scale.

Pydantic AI says it outright: *"It is a margin, not a probability that the
answer is right."* Consequences:

- A threshold on `confidence` is an **ordering** until you have checked it against
  labels. Only after calibration does "0.9" mean "right 9 times in 10".
- Thresholds **do not transfer** between question kinds (a bar tuned on a Noul
  is meaningless on a Choice), between fields, between backends, or between
  model versions. Pin the version (`jev-1.13.0`, not `jev-latest`) once tuned.

## The shape that actually works

Keep every question atomic — glance work, not reasoning. A complex judgement is
decomposed into several questions and recomposed **in code**, where weights
change under code review instead of inside a prompt. The vendor calls this
*"probably the most important concept in this guide."*

The best public demonstration is a community benchmark on 2,000 phishing emails
(anisselbd/jev-phishing-bench, 2026-09-17): one broad question scored **62.6%**;
five atomic Noul signals combined by a logistic regression fitted on 1,000
labelled emails scored **95.0%** on the other 1,000. Read the caveats the repo
itself states before quoting it: Claude Haiku 4.5 asked the *same five
questions* reached 93.2% (difference not significant, p = 0.063), and a
two-feature regex reached 91.8% because the dataset "largely separates by
construction". **The decomposition did the work — for both models.**

```python
from typesafe_sdk import Choice, Noul, Score, TypeSafeClient

client = TypeSafeClient()  # TYPESAFE_API_KEY from the environment
result = client.system_one(
    {"ticket": ticket},                      # state: string, object or array
    {
        "department":  Choice(instructions="Which team should handle `ticket`?",
                              criteria={"billing": "Payments, invoicing, refunds",
                                        "technical": "Bugs, outages, integrations",
                                        "other": "Anything else"}),
        "is_urgent":   Noul(instructions="Does `ticket` convey urgency?"),
        "frustration": Score(instructions="How frustrated is the customer?",
                             criteria=["Calm, just stating facts",
                                       "Frustrated but civil",
                                       "Very angry, strong language"]),
    },
)
```

Gate on confidence with bars set by the **cost of being wrong**, per action —
the vendor's confidence-routing pattern uses a 0.6 floor and 0.85 for a
money-moving action (with three options, confidence > 0.85 means p_max > 0.90):

```python
action = result.choices["department"]
if action.confidence < 0.6:
    route_to_human()
elif action.choice == "technical":
    open_bug()              # cheap to undo: the floor is enough
elif action.confidence > 0.85:
    act_automatically()
else:
    ask_first()
```

Those numbers are starting points, never production values. The Confidence
page's own example uses 0.5 and 0.9 and says: "Start with conservative
thresholds, test with your own data".

## What the evidence says, as of 2026-10-03

Read this before quoting a vendor number at anyone.

**The headline accuracy is agreement, not correctness.** TypeSafe's 67.8% on
evals.typesafe.ai is agreement with the average of two frontier models at high
thinking, on four workflows it chose; its own blog admits this *"biases answers
towards OpenAI and Anthropic's models."* No human ground truth.

**The "0% hallucination" bar is not measured.** Verbatim footnote: *"Our number
is not empirical. Schema matching is guaranteed, thus we can confidently add 0%
into the plots."* The guarantee is structural. **It cannot produce an invalid
shape; it can absolutely decide wrong.**

**Independent accuracy: mid-tier, not frontier, much cheaper.**
- arXiv 2609.24574 (18 annotation tasks, 7,977 items): Jev trails the best LLM on
  14 of 15 tasks, median −11.6 macro-F1, at a median **44× lower cost**. Routing
  low-confidence items to an LLM **matched the LLM alone at ¼–½ of its cost** —
  the strongest published argument for the composition below.
- BANKING77: eight independent runs ranged 0.753–0.840 (median 0.809). The
  frequently quoted 75.3% is the *lowest* — n = 77, one item per intent.
- Latency: one pre-registered eval measured median calls ~2.2× faster than
  gpt-5.4-nano, not the 40–200× of the launch post (whose own blog says its
  numbers are "on the higher end of real world gains").

**Calibration: decent for its class, not trustworthy raw.**
- Better than the verbalized confidence of 16 of 19 LLMs tested in arXiv
  2609.24574; three frontier models still did better.
- Distortion reported as **compression toward the middle**; probabilities are
  rounded to 0.01 and Choice/Score can return exact 0 or 1.
- A 900-ticket synthetic study measured ECE 0.107 (4.4× its noise floor). Its
  author **corrected** the fitted temperatures on 2026-09-22 (Choice 3.29 → 1.30,
  Score 3.40 → 1.92) after finding that flooring exact zeros at 1e-6 inflated
  them — "read the sign, not the magnitude". Its worst case (44.7% correct at
  mean probability 0.74) was a question **unanswerable from the text by design**:
  the finding is that Jev did not lower its confidence when it could not know.
- Fitting is cheap and effective in-domain: refitting a Platt intercept on 50
  labels cut held-out ECE by 62% (SamuelSacco/jev-exploration), while **fewer
  than ~30 labels could leave it four times worse**. The fitted slope did *not*
  transfer cleanly to new domains (0 of 3), so fit per domain.

**Option order and option names move the answer.** Since 2026-10-02 the vendor
documents it: *"the order of a Choice's options can affect the answer, and
`jev-1.13` leans toward the option that comes first."* Measured effects:
- a reference card's position moved mean probability on the right answer from
  about 0.5 when first (0.50 / 0.56 across the two orders) to about 0.88 when
  last (0.89 / 0.87) (Archer Hume, 10,000 calls);
- adding an irrelevant fifth option shrank the log-odds between two others
  (+0.49 → +0.08 in the first run; +0.38 → +0.11 in a ten-block replication,
  mean change −0.28 [−0.36, −0.19]) — options **interact**, so probabilities
  are not fixed per-option scores (Hume declines to name the mechanism);
- renaming labels is worse than reordering them: arXiv 2609.26758 reports AUC
  0.81 → 0.58 on the hosted model with 24× the test-retest flip rate.

**Not deterministic.** The vendor's own self-consistency cookbook: picked labels
*"can flip inside a single condition, including TypeSafe… TypeSafe flips on 2
of the 8 questions."* Pydantic AI: numbers "move by a few hundredths from one
run to the next, so a bar is a range to choose from rather than a point."

**Not English? Expect a cost.** Two pre-registered audits exist:
- Russian (n = 600 paired): XNLI accuracy 88.3% → 77.3% and ECE 0.032 → 0.096;
  MASSIVE showed no detectable difference.
- Spanish (19,200 calls): −3.0 to −6.4 pp across XNLI, PAWS-X, MASSIVE and
  Belebele, ECE roughly doubled on XNLI; writing the instructions in Spanish
  did not help.
- No Italian evaluation was found. On any non-English corpus, measure first.

**Limits the vendor documents itself** (jev-1.13 jaggedness page): literal
reading; not a calculator and *"does not count reliably"*; *"reads dates as text,
not as ordered quantities"*; double negatives and indirection; accuracy falls
as the state grows with irrelevant content (*"context rot"*); **state is not
treated as hostile — prompt injection through the state is live**;
contradictory instructions and criteria; option order; not trained to
generate.

## Getting a probability without Jev

**Anthropic cannot give you one.** The Messages API has no `logprobs`
parameter; on the OpenAI-compatibility layer `logprobs` and `top_logprobs` are
*"Ignored"* and the response field *"Always empty."* Claude can be a **typed**
classifier — structured outputs support `enum` — but never a **probabilistic**
one. Confidence from Claude means sampling frequency, verbalized confidence, or
a panel of readers voting, each costing more than one call.

Where logprobs exist (OpenAI `top_logprobs` 0–20 but only with reasoning effort
`none` on GPT-6; Gemini `responseLogprobs` + `logprobs` 0–20 but reportedly not on 3.x models; vLLM; llama.cpp
`n_probs`), constrain the label to a **single token** in an enum so that one
token's distribution *is* the class posterior, then calibrate on your labels.
Know which distribution you are reading: vLLM's default `logprobs_mode` is
`raw_logprobs`, *before* logit processors — so a constraint is not reflected in
it. The provider matrix is in `decision-model-calibration`.

## When to reach for this, and when not to

**Yes**: the decision repeats at volume, the answers are known in advance, and
seconds or cents matter. Routing, triage, moderation, tool selection, scoring
large tables, re-ranking retrieved passages, gating a tool call before it runs.

**No**: you need generated text, a written justification, multi-step reasoning,
arithmetic, date comparison, or the problem is one of a kind. And **no** where an
audit needs a reason: a number without a *why* is a defect in regulated
contexts, not a detail.

The honest use is the composition: **the typed model decides fast; the LLM
takes whatever it declares uncertain.** Watch the hand-off rate — a chain that
hands off most requests costs an LLM call *plus* a decision call and is slower
than no decision model at all.

## The cheapest test that can change your mind

Before wiring anything: take a corpus you have already labelled — your own
language, your own state shape — send it through the candidate, and compare
accuracy, calibration and hand-off rate. At $0.042 per million input tokens a
few hundred items cost cents. An afternoon settles what a launch post cannot.
