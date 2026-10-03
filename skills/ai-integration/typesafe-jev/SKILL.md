---
name: typesafe-jev
description: |
  Building against TypeSafe's Jev: the /v1/systemone HTTP API, the Python
  (`typesafe-sdk`) and JS (`@typesafe-ai/sdk`) SDKs, Noul/Choice/Score request
  and answer shapes, model ids and pinning, limits, pricing, retries, errors,
  gateways, and the framework integrations (Pydantic AI `TypeSafeModel`,
  LangChain `TypeSafeClassifier`, Vercel AI SDK, OpenRouter, LiteLLM, DSPy).

  USE WHEN: code imports `typesafe_sdk`, `@typesafe-ai/sdk`, `langchain_typesafe`,
  `@ai-sdk/typesafe-ai`, or uses `typesafe:jev-latest`, `client.system_one`,
  `client.systemOne`, `TYPESAFE_API_KEY`, `api.typesafe.ai`; user asks how to
  call Jev, write Noul/Choice/Score questions, or wire Jev into an agent.

  DO NOT USE FOR: deciding *whether* a typed decision model fits (load
  `typed-decision-models`) or fitting/validating its probabilities (load
  `decision-model-calibration`).
allowed-tools: Read, Grep, Glob, Write, Edit, Bash, WebFetch
---

# TypeSafe Jev — integration reference

Verified against docs.typesafe.ai, the OpenAPI spec, PyPI, npm and the
integration docs on **2026-10-03**. Versions at that date: `typesafe-sdk` 0.7.2,
`@typesafe-ai/sdk` 0.6.0, model `jev-1.13.0`, Pydantic AI 2.53.0,
`@ai-sdk/typesafe-ai` 3.0.12, `langchain-typesafe` 0.0.1a3 (alpha).
The SDKs are pre-1.0 and have shipped breaking changes in minor releases —
pin them.

Deeper material:

| File | Covers |
|---|---|
| `quick-ref/python-sdk.md` | sync/async clients, `response_model`, retries, exceptions, HTTP/2, logging, gateways |
| `quick-ref/javascript-and-http.md` | JS/TS SDK, raw HTTP with curl, OpenAPI quirks |
| `quick-ref/framework-integrations.md` | Pydantic AI, LangChain, Vercel AI SDK, OpenRouter, LiteLLM, DSPy, others |
| `quick-ref/question-design.md` | writing questions and state, the documented patterns and failure modes |

> **Deep Knowledge**: Use `mcp__documentation__fetch_docs` with technology:
> `typesafe-jev` and one of these topics:
> - `api-reference`: every field, error body and limit, plus where the docs and the OpenAPI spec disagree.
> - `python-sdk` and `javascript-sdk`: the full SDK surface, mock-transport tests and concurrency patterns.
> - `pydantic-ai`, `langchain`, `vercel-ai-sdk`, `dspy`: one page per integration.
> - `recipes-extraction` and `recipes-routing`: the official cookbooks, ported and runnable.
> - `evidence`: every independent study, with its methodology and caveats.
>
> Every code block there was quoted from a cited source, executed offline against mocks, or type-checked.

## Mental model

One request = one `state` (what is judged) + a map of named `questions` (what
is asked about it). Every question is answered independently against the same
state, in parallel. The question keys are yours and **are not sent to the
model** — only `instructions` and `criteria` are.

```
POST https://api.typesafe.ai/v1/systemone
Authorization: Bearer $TYPESAFE_API_KEY
```

```json
{
  "state": "Help! My payouts have been failing for 3 days.",
  "model": "jev-latest",
  "questions": {
    "is_urgent": {"type": "noul", "instructions": "Does this convey urgency?",
                  "criteria": {"true": "Explicitly time-sensitive", "false": "No urgency expressed"}},
    "department": {"type": "choice", "instructions": "Which team should handle this?",
                   "criteria": {"billing": "Payments, invoicing, refunds",
                                "technical": "Bugs, outages, integrations",
                                "sales": "Pricing, upgrades, new accounts"}},
    "frustration": {"type": "score", "instructions": "How frustrated is the customer?",
                    "criteria": ["Calm", "Frustrated", "Very angry"]}
  }
}
```

| Question | `criteria` | Answer fields |
|---|---|---|
| `noul` | optional `{"true": …, "false": …}` | `noul` (P(yes)) |
| `choice` | **required** map option → description or `null`; ≤ 255 options | `choice`, `probabilities` (option → float), `confidence` |
| `score` | **required** ordered array of level descriptions; 2–10 levels | `score` (float, can land between levels), `legend` ("0" → text), `probabilities` ("0" → float), `confidence` |

`state`, `instructions` and each criterion accept a string, object or array.
Response top level: `model` (the versioned id that answered), `answers`,
`usage.input_tokens`, `usage.output_tokens`. Request id: `x-typesafe-request-id`.

## Python quickstart

```bash
pip install typesafe-sdk          # Python >= 3.10; extra: typesafe-sdk[http2]
export TYPESAFE_API_KEY=...
```

```python
from typesafe_sdk import Choice, Noul, Score, TypeSafeClient

client = TypeSafeClient()
state = "I was charged twice. Please help ASAP."
questions = {
    "billing": Noul(instructions="Is this about billing?"),
    "tone": Choice(
        instructions="What is the tone?", criteria={"calm": None, "angry": None}
    ),
    "urgency": Score(
        instructions="How urgent is this?", criteria=["low", "medium", "high"]
    ),
}
result = client.system_one(state, questions)
print(
    result.nouls["billing"].noul,
    result.choices["tone"].choice,
    result.scores["urgency"].score,
)
```

`result.answers[key]` holds every answer; `.nouls`, `.choices`, `.scores` are
typed views. In the SDK, `ScoreAnswer.probabilities` and `.legend` are keyed by
**int**; on the wire they are strings. `AsyncTypeSafeClient` has the same
surface. Full detail in `quick-ref/python-sdk.md`.

## JavaScript / TypeScript quickstart

```bash
npm install @typesafe-ai/sdk      # Node.js 20+; ESM + CJS + .d.ts
```

```ts
import { choice, TypeSafeClient } from "@typesafe-ai/sdk";

const client = new TypeSafeClient();
const response = await client.systemOne({
  state: { document: "I was charged twice. Please fix this ASAP." },
  questions: {
    category: choice("What is this ticket about?", {
      billing: null,
      technical: null,
      other: null,
    }),
  },
});

console.log(response.answers.category.choice);
```

Helpers: `noul(instructions?, criteria?)`, `choice(instructions, criteria)`,
`score(instructions, criteria)` (criteria typed as a tuple of ≥ 2). Answer types
are inferred from the questions. Browser use is refused unless
`dangerouslyAllowBrowser: true` — keep the key server-side.

## Models and pinning

| id | resolves to | meaning |
|---|---|---|
| `jev-latest` | `jev-1.13.0` | latest stable; SDK default |
| `jev-preview` | `jev-1.13.0` | latest build, official or not |
| `jev-1.13.0` | — | pinned |

The vendor's own rule: *"If you have tuned confidence thresholds against a
specific version, pin that version's ID instead of the alias."* Log
`response.model` on every call so an alias move is visible in your traces.
`GET /v1/models` lists aliases only; versioned ids are accepted regardless.

## Limits and pricing (as of 2026-10-03 — re-check, they move)

| Item | Value |
|---|---|
| Price | $0.042 per million **input** tokens; output tokens free |
| Rate limits | 100K tokens/s, 80 requests/s (was 40 req/s two weeks earlier); 429 on either |
| Context | 64k tokens for state + all questions; 32k for state + the single longest question |
| Choice | ≤ 255 options |
| Score | 2–10 levels (the OpenAPI spec and Python SDK enforce only "non-empty") |
| Input | text only; English primary, CJK "handled but not equally well" |
| Streaming | none |
| Sampling | none — no temperature/top_p |
| Hosting | US; no self-hosting; zero data retention for enterprise via sales |
| Training on your data | no (docs + privacy policy) |

The vendor states it cannot prove the price is not subsidised. Budget for it
going up.

## Errors and retries

| Status | Meaning |
|---|---|
| 401 | missing/invalid key |
| 422 | body failed validation; FastAPI-style `detail[]` names the field |
| 429 | rate limited — honour `retry-after` |
| 529 | overloaded — retry with backoff |

Both SDKs retry 408, 429 and 5xx twice by default with jittered exponential
backoff (0.5 s → 5 s) and honour `retry-after`. Python's `RetryPolicy.timeout`
(30 s) stops *new* attempts once spent but never interrupts one in flight, so
the worst case is that budget plus one per-attempt `timeout` (10 s) — set both
on latency-critical paths. JS has a per-attempt timeout (10 s) and no total
budget; an `AbortSignal` caps the whole call but rejects with
`APIUserAbortError`, not `APITimeoutError`.

## Rules that prevent most bugs

1. **The prompt is the state; the question goes in `instructions`.** A question
   written into the state is judged as text, not answered.
2. **One judgement per question.** Combine in code.
3. **Every Choice gets a catch-all** (`other` / `none of the above`) unless the
   options are provably exhaustive — the model must pick something.
4. **Never threshold `choice` alone.** Read `confidence`/`probabilities`; for
   Noul, the probability *is* the uncertainty.
5. **Keep arithmetic, counting and date comparison in code.** Ask Jev to
   extract or pick; compute yourself.
6. **Treat state as attacker-controlled.** Prompt injection through the state
   is documented as live. A Noul gating a destructive action is not an
   authorization layer — pair it with human approval.
7. **Test option order** on any Choice that matters (the model leans toward the
   first option). `decision-model-calibration` has a one-request rotation check.
8. **Don't send secrets in state** — it leaves your infrastructure.

## Official resources

- Docs: https://docs.typesafe.ai — append `.md` to any page path for its
  current markdown. The full dump at `/llms-full.txt` **lags**: on 2026-10-03 it
  still served the 40 req/s limit and the 2026-09-17 limitations page. Never
  quote an operational fact from it without checking the page itself
- OpenAPI: https://api.typesafe.ai/openapi.json · console: https://console.typesafe.ai
- Limitations: https://docs.typesafe.ai/model-jaggedness/jev-1.13
- Official agent skill: `claude plugin marketplace add typesafe-ai/skills`
- `typesafe-ai/system-one-adapter-python`: a drop-in replacement for
  `system_one` backed by ordinary LLM APIs (not for the whole client: different
  constructor, no `models.list`) — useful for comparing like-for-like through
  the same calling code
