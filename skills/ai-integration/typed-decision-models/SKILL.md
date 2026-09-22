---
name: typed-decision-models
description: |
  Replacing an LLM used as a classifier with a model that returns typed
  decisions and probabilities instead of prose — TypeSafe's Jev and the wider
  pattern. Covers the three primitives, the decomposition that makes them work,
  post-hoc calibration, and the measured evidence on where the claims hold.

  USE WHEN: user mentions "Jev", "TypeSafe AI", "System One model", "typed
  decision model", "calibrated probabilities", "classifier instead of LLM",
  "logprobs", "confidence threshold", "ECE", "calibration error", asks how to
  get a confidence score out of a model, or asks whether to replace a
  classification prompt with something cheaper.

  DO NOT USE FOR: prose generation, code generation, multi-step reasoning, or
  anything needing a written justification — those are the cases these models
  explicitly cannot serve.
allowed-tools: Read, Grep, Glob, Write, Edit, WebFetch
---

# Typed decision models

A class of model that does not generate text. You declare the answer space up
front; the model distributes probability inside it. TypeSafe's **Jev** is the
first sold under that banner ("System One", after Kahneman's fast thinking),
but the pattern outlives any one vendor and the useful parts of it can be built
on models you already pay for.

The point is not speed. The point is that **the answer and the confidence come
back as separate things**, so code can act on one and route on the other.

## The three primitives

| | question | returns | limits |
|---|---|---|---|
| **Choice** | which of these? | the winner, the full distribution, a `confidence` | ≤ 255 options, unordered |
| **Score** | at what level? | a weighted position (so: between two rungs), `legend`, distribution, `confidence` | 2–10 described levels, ordered |
| **Noul** | is this true? | one number 0–1; 0.5 is maximum uncertainty | no separate `confidence` — the probability *is* the confidence |

Questions in one request share a single read of the state, so adding a question
costs only its own instructions. They are **independent**: one answer never
enters another's context. A decision that genuinely depends on a previous one
needs a second call.

## The shape that actually works

Keep every question atomic — glance work, not reasoning. A complex judgement
gets decomposed into several questions and recomposed **in code**, where the
weights change without rewriting a prompt.

This is not stylistic advice. On a phishing corpus of 2,000 emails, one broad
question scored **62.6%**; the same model with the judgement split into five
atomic questions and the weights fitted on 1,000 labelled examples scored
**95.0%**. The decomposition did the work, not the model.

```python
response = client.system_one(
    state={"ticket": {...}, "policy": "..."},
    questions={
        "department":  Choice(...),   # one read of the state
        "is_urgent":   Noul(...),     # serves all three
        "frustration": Score(...),
    },
)
```

Threshold on confidence, not on the answer — **the answer says what, the
confidence says whether to act** — and raise the threshold with the stakes:

```python
if answer.confidence < 0.6:       route_to_human()
elif answer.choice == "read_only": do_it()
elif answer.confidence > 0.85:     do_the_expensive_thing()
else:                              ask_first()
```

## What the evidence says, as of September 2026

Read this before quoting a vendor number at anyone.

**The accuracy claim is agreement, not correctness.** TypeSafe's published
67.8% is agreement with a two-frontier-model consensus, not human ground truth,
on four workflows the vendor chose. Independent runs land lower: **75.3% on
BANKING77, last of nine models tested**, saving $0.04 per 1,000 requests over a
mid-tier LLM while making ~7.8 more errors per 100.

**The "0% hallucination" bar is not measured.** TypeSafe's own footnote:
*"Our number is not empirical. Schema matching is guaranteed, thus we can
confidently add 0% into the plots."* The guarantee is structural — three
options in, one of those three out. It says nothing about picking the right
one. **It cannot hallucinate a shape; it can absolutely decide wrong.**

**Calibration — the whole reason to prefer this class — measures poorly.**
Independently: **ECE 0.107**, 4.4× the noise floor, with Choice and Score
*overconfident* (fitted temperatures 3.29 and 3.40) and Noul under-confident.
A worst case of 44.7% correct at an average assigned probability of 0.74.
Reverse-engineering over 10,000 calls found *list-dependent temperature* rather
than fixed per-option scoring.

**Option order moves the answer.** From Pydantic's integration docs, not from a
critic: *"The order of a Literal's options or an Enum's members is part of what
Jev sees, and reordering them can move the answer."* Reports of up to 20 points
of probability shift. Mitigation is the same as for any multiple-choice
classifier: cyclic permutation of the label order and average, or accept that
the number is conditioned on your ordering.

**Limits the vendor documents itself.** State is not treated as hostile —
prompt injection through the state is live. Accuracy falls as the state grows
with detail unrelated to the question. Dates are read as text, not as ordered
quantities. It is not a calculator. There are no probabilistic guarantees:
probabilities need not be complementary and scoring is inconsistent across
question formats.

**Nobody has evaluated it in any language but English.** Not badly — at all.
No vendor multilingual eval, no third-party one, no first-hand report either
way. On a non-English corpus this is an open variable, not a known cost.

## Post-hoc calibration beats picking a model

The single highest-leverage intervention in the literature, and it applies to
whatever model you end up with:

> A few hundred to a few thousand labelled examples plus a one-parameter
> (temperature) or two-parameter (Platt) fit moves ECE into the **0.03–0.08**
> band, from wherever it started.

Measured across GPT-4's post-training collapse (ECE 0.007 pre-train →
**0.074 after RLHF**, a 10.6× degradation on MMLU), across verbalized-vs-logprob
comparisons, and in production classification work (~45–50% calibration error
→ ~5–8% with `CalibratedClassifierCV` on 1k–10k labels).

So the order of operations is: **build the labelled corpus first.** It is what
lets you compare candidates at all, it outlives every model you try, and it is
worth more than the choice between them.

## Getting a probability without Jev

**Anthropic cannot give you one.** The Messages API has no `logprobs` or
`top_logprobs` parameter; on the OpenAI-compatibility layer both are documented
as *"Ignored"* and the response field as *"Always empty."* Claude can be a
**typed** classifier — constrained decoding guarantees the schema — but never a
**probabilistic** one. If a design needs calibrated confidence from Claude, it
needs sampling frequency, verbalized confidence, or a panel of readers voting,
all of which cost more than one call.

Where logprobs do exist, the recipe is: constrain the label to a **single
token** in an enum, so that one token's logprob *is* the class posterior. Then
calibrate on your own labels. Note that a grammar constraint renormalizes the
distribution it reports — for a single-token enum that renormalization is
exactly the conditional posterior you want; for anything richer the number is
contaminated.

## When to reach for this, and when not to

**Yes**: the decision repeats, at volume, the answers are known in advance, and
seconds matter. Routing, triage, moderation, tool selection, scoring large
tables — the cases where per-token pricing used to forbid the mapping.

**No**: you need generated text, a written justification, multi-step reasoning,
or the problem is one-of-a-kind. And **no** where an audit needs a reason: a
number without a *why* is a problem in regulated contexts, not a detail.

The composition is the honest use: **the typed model classifies and routes
fast; the LLM picks up whatever it declares uncertain.** Calibration is what
makes that handoff trustworthy — which is why, if calibration is unverified on
your data, you have an ordering and not a threshold.

## The cheapest test that can change your mind

Before wiring anything: take a corpus you have already labelled, send it
through the candidate, and compare. Not a demo, not a benchmark someone else
ran — your own labels, your own language, your own state shape. A few dollars
and an afternoon settles what a launch post cannot.
