# Designing Jev Questions and State Quick Reference

> See [TypeSafe Jev SKILL](../SKILL.md) for the API. Guidance drawn from
> docs.typesafe.ai (primitives, concepts, patterns, jev-1.13 jaggedness —
> reviewed 2026-10-02) and verified 2026-10-03.
>
> **Deep Knowledge**: `mcp__documentation__fetch_docs` with technology `typesafe-jev`, topic `recipes-extraction`, `recipes-routing`.

## Pick the primitive

| The answer is… | Use | Not |
|---|---|---|
| true/false about one proposition | **Noul** | a 2-option Choice — the two are not interchangeable (see below) |
| one of a known set of alternatives | **Choice** | several Nouls, unless "none of them" is a real answer |
| a position on one ordered dimension | **Score** | a Noul — P(yes) of "strong in Python" is *not* a degree of Python skill |
| a number, a count, a date difference | **code** | any primitive |
| free text | **an LLM** | chained Choices ("will not work well and will be very slow") |

A Choice is **relative** (which option wins); one Noul per option is
**absolute** (each can be low). The vendor's skill-suggestion cookbook uses
both on one shortlist: the Choice picks the skill, the Nouls decide whether to
suggest any at all.

## Write the state

- **Send only what the question needs.** Accuracy falls as unrelated content
  grows ("Jev suffers from context rot"). Filter in code first; when you can't,
  use a Noul to filter for relevance (the RAG-passages cookbook pattern).
- **Structure beats prose.** State can be a JSON object or array: a
  conversation as role/content records, a record with named fields.
- **Point at parts of the state by name**, in backticks:
  `` "Is `ticket.messages[0].text` a complaint?" ``.
- **Keep questions out of the state.** The state is judged; it is never obeyed
  — and anything an attacker writes into it can still steer the answer.
- Text only. English first; other languages work at lower accuracy — measure.

## Write the question

- **Atomic.** One judgement per question; recombine in code. A complex
  judgement asked as one question is the most common reason for a bad result.
- **Literal.** *"`jev-1.13` answers the question you wrote, not the one you
  meant."* If you catch yourself explaining what you meant, that explanation is
  the missing half of the instruction.
- **Direct.** No double negatives, no property-of-a-property. Reduce hops.
- **Structured instructions** for questions that carry data: put the question
  in one field and the data in others, referenced in backticks.
- The question **key is never sent** — only `instructions` and `criteria`.

### Noul

- A statement works as well as a question ("The customer is requesting a
  refund"). Try both on your data.
- Make the boundary unambiguous ("*any* Python experience"). Add
  `criteria={"true": ..., "false": ...}` only when the boundary is subtle, and
  keep whichever variant scores better on your examples.
- `true` must describe a yes. Inverted criteria measurably hurt.
- Threshold by cost, with a middle band for humans — the vendor's example:

```python
YES, NO = 0.8, 0.2
p = result.nouls["is_human_escalation"].noul
if p >= YES:
    route_to_agent()
elif p <= NO:
    route_to_bot()
else:
    route_to_review()
```

### Choice

- Option **names and descriptions are both sent** — write descriptions that
  separate the options from each other.
- **Add `other` / `none of the above`** whenever the list may not cover every
  input; the model must otherwise pick something.
- Give the **full** list (up to 255) rather than a shortlist; each option costs a
  few tokens.
- For large taxonomies, chain Choices level by level and keep the best K paths
  (the hierarchical-classification cookbook runs a beam search over
  `probabilities`).
- **Order matters**: the model leans toward the first option. Check any Choice
  that drives an action with the options rotated (recipe in
  `decision-model-calibration`).

### Score

- **"Describe situations, not degrees."** "Broken or degraded feature; a
  workaround exists" can be matched against text. "Moderately severe" can't.
- Every level is judged **on its own**: the model does not see a level's
  number or its neighbours, so "worse than the previous level" is meaningless,
  and `["0", "1", "2"]` as criteria fails.
- One dimension per Score. "Punctual and smart and experienced" is three
  questions.
- Give a rare extreme its own level ("abusive or threatening" above "very angry").
- If the model keeps landing between two levels on inputs you think are clear,
  use structured levels with the same fields on each: `{"what": ..., "examples": [...]}`.
- Normalise before combining: divide by `len(criteria) - 1`.
- Use `score` for thresholds, never to interpolate an exact quantity between
  levels — *"score levels are weak in numerical calibration."*

## Patterns

**Speculative fan-out.** Ask every question any branch might need in one
request; let code ignore the irrelevant answers. Extra questions barely change
latency and cost only their own tokens.

```python
category = result.answers["category"]
if category.choice == "bug_report":
    if result.answers["bug_severity"].score > 1.5 and result.answers["has_reproducible_steps"].noul > 0.6:
        escalate_to_engineering(ticket_id, severity="high")
    else:
        add_to_bug_backlog(ticket_id)
elif category.choice == "billing":
    route_to_billing(ticket_id, refund_likely=result.answers["refund_requested"].noul > 0.7)
```

**Composite scoring.** Several Scores, normalised, combined with weights that
live in code and change under review:

```python
py      = response.answers["python_depth"].score / 4
lead    = response.answers["team_leadership"].score / 4
arch    = response.answers["system_design"].score / 4
general = response.answers["generalist"].score / 4

# Senior IC
ic_score = (0.40 * py) + (0.10 * lead) + (0.40 * arch) + (0.10 * general)
# Engineering Manager
em_score = (0.15 * py) + (0.40 * lead) + (0.20 * arch) + (0.25 * general)
```

Fit the weights on labelled data (a logistic regression on the normalised
answers) instead of guessing them — that is the step that turned 62.6% into
95.0% in the phishing benchmark.

**Confidence-gated routing.** A floor for "unsure → human", then a higher bar
per action proportional to its blast radius.

**Extract in code, pick with Jev.** For values (dates, amounts, IDs): find
candidates with a regex or parser, then ask a Choice which candidate is the
requested one. For dates, ask for the *parts* (month, day, year — each a small
Choice with a "not stated" option) and assemble and compare them in code.

**Count in code.** One Noul per item, threshold, and sum:

```python
from typesafe_sdk import Noul, TypeSafeClient

client = TypeSafeClient(model="jev-1.13.0")  # docs example uses "jev-1.13"; only jev-1.13.0 is a listed id
YES = 0.5  # up to you on what you want the threshold to be, depends on your usecase.

items = ["typesafe", "apple", "california", "banana", "likes", "calibration", "orange", "vertex"]

result = client.system_one(
    {"items": items},
    {
        f"item_{i}": Noul(instructions=f"Is `items[{i}]` the name of a fruit?")
        for i in range(len(items))
    },
)

count = sum(result.nouls[f"item_{i}"].noul > YES for i in range(len(items)))
```

**Cascade.** Jev decides; whatever falls under its bar goes to an LLM. The
published evidence (arXiv 2609.24574) is that this matches the LLM alone at a
quarter to half of its cost — *if* the hand-off rate stays low.

**Guarding an agent.** Gate a tool call with a Noul *before* it runs — but a
gate on attacker-influenced text is a filter, not an authorization boundary.
Destructive tools still need human approval.

## Known failure modes (jev-1.13)

| # | Failure mode | Do this instead |
|---|---|---|
| 1 | Literal reading | write the exact condition and criteria for each option |
| 2 | Math, counting, numeric encodings (hex, binary) | compute in code; pass named buckets |
| 3 | Date and time comparison | extract parts; compare in code |
| 4 | Indirection, double negatives | reduce hops; point to the relevant state |
| 5 | Large state with irrelevant detail | filter first |
| 6 | Adversarial content in state | explicit criteria; test edge cases; never the only safeguard |
| 7 | Contradictory instructions and criteria | align them |
| 8 | Choice option order | rotate the options and check consistency |
| 9 | Generation | use a generative model |

Earlier revisions of that page also warned that structural invariants do not
hold: a Noul and its negation summed to 1.19 on one ticket, and a Noul and a
yes/no Choice gave 0.22 vs 0.01 for the same question. The section was dropped
on 2026-10-02, but nothing says the behaviour changed — still don't carry a
threshold from a Noul to a Choice, and don't expect `P(x) + P(not x) = 1`.

## Official cookbooks worth reading

docs.typesafe.ai/cookbooks — each with full code: self-consistency (nouls,
choices), parallel questions, re-ranking, line-by-line search, structure
recovery, function calling, skill suggestion, entity alignment, classifying RAG
passages, double-checking citations, guardrails for LLMs, SDE cascade, date
extraction, pre-parsed value extraction, hierarchical classification,
classification using confidence, autoresearch feature discovery.
