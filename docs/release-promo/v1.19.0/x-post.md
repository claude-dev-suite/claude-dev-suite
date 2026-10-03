# X post — the "0% hallucination" footnote

> **Cleared to post once the v1.19.0 Release workflow has published all three platforms.**
> Anyone arriving from the post should get a working install.

**Angle:** not an announcement. Every claim the post makes is a verified fact about a
model people are evaluating right now, and the project comes in as the payoff. Jev
launched on 2026-09-15 and is being argued about this month. The audience is people
running LLM classifiers in production, plus the Pydantic AI, LangChain and Claude Code
ecosystems.

**Every number below is sourced** in `knowledge/typesafe-jev/evidence.md` (KB) and
`skills/ai-integration/typed-decision-models/SKILL.md`. Don't paraphrase them into
something stronger.

**Timing:** Tuesday–Thursday. Mention `@pydantic` or `@LangChainAI` only in a reply,
never in the first post.

---

## Option A — a single post (276 characters as X counts them)

```
Jev's launch chart shows "0% hallucination".

The footnote: "Our number is not empirical."

It can't return an invalid label. It can still return the wrong one.

dev-suite now ships an agent + KB on where Jev pays off, and how to prove it on your data:
github.com/claude-dev-suite/claude-dev-suite
```

---

## Option B — a thread (every post ≤ 280; a URL counts as 23)

**1/**

```
TypeSafe's Jev answers with a typed decision and its probabilities, never prose. It's pitched as the replacement for every LLM you're quietly using as a classifier.

We read every independent evaluation before building on it. Here's what holds up 🧵
```

**2/**

```
The "0% hallucination" bar is a footnote, not a measurement:

"Our number is not empirical. Schema matching is guaranteed, thus we can confidently add 0% into the plots."

Constrained output can't produce an invalid shape. It can produce a wrong value.
```

**3/**

```
The headline 67.8% is agreement with two frontier models, not human labels.

Independently (18 annotation tasks): mid-tier accuracy, ~11.6 macro-F1 behind the best LLM, at ~44x lower cost.

Send its unsure cases to an LLM and you match the LLM at 1/4–1/2 the cost.
```

**4/**

```
Before you threshold on it:

`confidence` is a spread statistic, not P(correct).

Option order moves answers. TypeSafe now documents that Jev "leans toward the option that comes first".

Calibrate on your own labels: 50 is enough to start, under 30 can make it worse.
```

**5/**

```
dev-suite now ships:

- decision-model-expert: finds the LLM-as-classifier call sites in your repo
- skills for the Jev SDKs + Pydantic AI, LangChain, Vercel AI SDK, DSPy
- a KB with a runnable eval harness: Jev vs your LLM, on your data

MIT 👇
github.com/claude-dev-suite/claude-dev-suite
```

---

## Sources for each claim

| Claim | Source |
|---|---|
| "Our number is not empirical…" | TypeSafe launch blog footnote, typesafe.ai/blog/introducing-system-one-models-and-jev |
| 67.8% = agreement with the GPT-6 Astra + Claude Fable 5.1 average | evals.typesafe.ai methodology; launch blog |
| −11.6 macro-F1 median, ~44× cheaper, cascade at ¼–½ the cost | arXiv 2609.24574 (Ibrahim & Zaki) |
| `confidence` is a dispersion statistic | docs.typesafe.ai/confidence formulas; Pydantic AI: "a margin, not a probability that the answer is right" |
| "leans toward the option that comes first" | docs.typesafe.ai/model-jaggedness/jev-1.13, reviewed 2026-10-02 |
| 50 labels to start (−62% ECE), under 30 can be worse | SamuelSacco/jev-exploration |

## Notes

- **The tone is fair, not hostile.** The thread also says Jev is cheap and works well in a
  cascade. A post that only dunks on a vendor reads as a hit piece and gets ignored by the
  people who matter: the ones deciding whether to adopt it.
- **Lead with A if you post once.** B is for a day you can stay and answer replies. The
  replies are where the reach comes from.
- **Don't claim "we tested Jev".** No live API calls were made. Everything is either
  published evidence or offline-verified code. If asked, say exactly that.
