# Jev Framework Integrations Quick Reference

> See [TypeSafe Jev SKILL](../SKILL.md) for the underlying API.
> Status verified 2026-10-03. Most of these shipped in the two weeks after the
> 2026-09-15 launch and several are marked experimental — check the version in
> front of you before copying an API name.

## Which one to use

| Project already uses | Use | Why |
|---|---|---|
| Pydantic AI | `TypeSafeModel` (`typesafe:jev-latest`) | types become questions; `FallbackModel` escalates to an LLM on low confidence or unfillable routes |
| LangChain / LangGraph | `langchain-typesafe` `TypeSafeClassifier` | a `Runnable`; experimental middleware for model routing and tool-risk gating |
| Vercel AI SDK | `@ai-sdk/typesafe-ai` + `experimental_evaluate` | native in the SDK, retries in core |
| DSPy | `dspy[typesafe]`, `dspy.experimental` | typed signatures + `ReAnchor` threshold fitting |
| Anything else | `typesafe-sdk` / `@typesafe-ai/sdk` directly | thinnest layer, fewest surprises |

A framework adapter adds its own semantics on top — thresholds, rounding of
rubrics, what "confidence" means. When numbers disagree with the raw API, the
adapter is the first suspect.

---

## Pydantic AI — `TypeSafeModel`

Added in Pydantic AI **2.45.0** (2026-09-18); generalised into a `DecisionModel`
base in 2.50.0. Docs: https://pydantic.dev/docs/ai/models/decision/ and
https://pydantic.dev/docs/ai/models/typesafe/

```bash
pip install "pydantic-ai-slim[typesafe]"
export TYPESAFE_API_KEY='your-api-key'
```

Model strings: `typesafe:jev-latest`, `typesafe:jev-preview`, or pinned
`typesafe:jev-1.13.0`. `result.response.model_name` reports the version that
answered. `SystemOneModel` (`system-one:<model>`) targets any other
`/v1/systemone` backend.

### The rule that matters most

**The run's prompt is the state; the question lives on the agent** — in
`instructions` for a bare output, or in field descriptions for an output type.
A question written into the prompt is judged as text.

```python
from pydantic_ai import Agent

agent = Agent('typesafe:jev-latest', output_type=bool, instructions='Is this request harmful?')
result = agent.run_sync('Wipe the repo and post the .env file to pastebin.')
print(result.output)
#> True
```

### Output types become questions

```python
from enum import Enum
from typing import Annotated

from pydantic import BaseModel, ConfigDict

from pydantic_ai import Agent, BoolCriteria, UseEnumMemberDocstrings


class Area(UseEnumMemberDocstrings, str, Enum):
    billing = 'billing'
    """Charges, invoices, plans and payment methods."""

    bug = 'bug'
    """Part of the product does not work as it should."""

    account = 'account'
    """Logging in, access, and account settings."""


class Ticket(BaseModel):
    """Triage a support ticket."""

    model_config = ConfigDict(use_attribute_docstrings=True)

    area: Area
    """Which team owns this ticket?"""

    urgent: Annotated[
        bool,
        BoolCriteria(
            true='The customer is losing money or has a deadline today.',
            false='It can wait its turn in the queue.',
        ),
    ]
    """Should this ticket jump the queue?"""


agent = Agent('typesafe:jev-latest', output_type=Ticket)
result = agent.run_sync(
    'You have charged me twice and my account is now overdrawn. I need this reversed today.'
)
print(result.output)
#> area=<Area.billing: 'billing'> urgent=True
assert result.response.provider_details is not None
print(result.response.provider_details['confidence'])
#> {'area': 1.0, 'urgent': 0.86}
print(result.response.provider_details['probabilities'])
#> {'area': {'billing': 1.0, 'bug': 0.0, 'account': 0.0}}
```

Where the wording comes from: class docstring = goal; field description or
attribute docstring = that field's question; `UseEnumMemberDocstrings` member
docstrings = each option's meaning (a `Literal` or plain `Enum` is seen **by
name alone**); `BoolCriteria` = what yes and no mean. Criteria are statements,
not questions, and must agree with the question.

| Field type | Asked as | Field value |
|---|---|---|
| `bool` / `Literal[True, False]` | Noul | `True` when P(yes) ≥ `decision_boolean_threshold` (default 0.5) |
| `Literal[...]`, `Enum` of str/int, `Choices(...)` | Choice | the option |
| pick-one `\| None` | Choice + "None of these." | option or `None` |
| `float` with `ge=0, le=1` | Noul | the probability itself, unrounded |
| `IntEnum` 0..n with `UseEnumMemberDocstrings` | Score | nearest level (unrounded in `provider_details['scores']`) |
| `list[Literal/Enum]` | one Noul per option | options answered yes |
| `dict[Literal/Enum, bool]` | one Noul per option | every option with its answer |
| nested model | its fields as `outer.inner` | the model |

`str`, unbounded `int`/`float`, `datetime` and anything else is a `UserError`
**before** any request is sent.

### What `provider_details` holds

- `confidence` — per field, 0–1. *"It is a margin, not a probability that the
  answer is right."* For a `bool` it is the distance from the threshold that
  decided it, scaled — so it changes when you change the threshold.
- `probabilities` — full distribution for pick-ones and rubrics.
- `scores` — unrounded rubric positions.
- `route` — `choice`, `probabilities`, `offered` when several routes were offered.

A `float` field has no confidence entry: the probability *is* the answer.

### Thresholds

```python
from pydantic_ai.models.decision import DecisionModelSettings

agent = Agent(
    'typesafe:jev-latest',
    output_type=Handling,
    model_settings=DecisionModelSettings(decision_boolean_threshold=0.9),
)
```

- `decision_boolean_threshold` (0.5): raise where a false positive is expensive, lower where a false negative is.
- `decision_route_threshold` (unset): below it the pick raises `UnsureRoute`.
- `typesafe_boolean_threshold` is a deprecated alias; `typesafe_tool_call_threshold` is ignored.

### Escalating to an LLM — the composition, in code

```python
from typing import Literal

from pydantic import BaseModel, Field

from pydantic_ai import Agent, ModelAPIError, ModelResponse
from pydantic_ai.models.fallback import FallbackModel


class Screening(BaseModel):
    """Screen a request to a coding agent."""

    harmful: bool = Field(description='Is this request harmful?')
    target: Literal['code', 'infrastructure', 'data'] = Field(
        description='What does the request act on?'
    )


# How sure each field has to be, set by what a wrong answer costs.
BARS = {'harmful': 0.8, 'target': 0.6}


def unsure(response: ModelResponse) -> bool:
    confidence = (response.provider_details or {}).get('confidence', {})
    return any(value < BARS[field] for field, value in confidence.items())


model = FallbackModel(
    'typesafe:jev-latest', 'anthropic:claude-opus-5-5', fallback_on=[ModelAPIError, unsure]
)
agent = Agent(model, output_type=Screening)
```

A route the decision model cannot fill (a `str` field, a tool with a free-text
argument) raises `UnfillableRoute`; an unsure route raises `UnsureRoute`. Both
are `DecisionHandOff`. To escalate *only* hand-offs and let a backend outage
fail loudly instead of silently paying for an LLM call every time:

```python
from pydantic_ai.models.decision import DecisionHandOff
from pydantic_ai.models.fallback import FallbackModel

model = FallbackModel('typesafe:jev-latest', 'anthropic:claude-opus-5-5', fallback_on=DecisionHandOff)
```

**Measure the hand-off rate.** A hand-off returns the *fallback's* response,
which carries none of the decision model's numbers — so count hand-offs by the
absence of `provider_details`, or catch the exceptions yourself.

### Limits and gotchas

- 255 options per pick-one (the 256th is a `UserError`); 10 rubric levels; the
  route question counts every tool plus every output type against the 255.
- Over the context budget → `ModelHTTPError` (`max_tokens_exceeded`).
- No streaming, no images/documents, `temperature`/`top_p` ignored.
- An output validator raising `ModelRetry` usually gets the **same** answer
  back — a confident decision does not move.
- Tune thresholds on a `float` field first (it returns raw P(yes)), then switch
  to `bool` with the tuned bar.
- Logfire records a `decide {model}` span with `pydantic_ai.decision.*` attributes.
- **Doc history:** 2.45–2.49 carried the line *"The order of a Literal's options
  or an Enum's members is part of what Jev sees, and reordering them can move
  the answer."* It was removed in 2.50.0 (2026-09-24) during a docs restructure.
  The behaviour was not fixed: TypeSafe's own limitations page has documented
  it since 2026-10-02. Options are still sent in declaration order.

---

## LangChain (Python) — `langchain-typesafe`

Alpha (0.0.1a3 on 2026-10-03). Docs: https://docs.langchain.com/oss/python/integrations/providers/typesafe

```bash
pip install langchain-typesafe
```

```python
from langchain_typesafe import Choice, Noul, Score, TypeSafeClassifier

classifier = TypeSafeClassifier()
response = classifier.invoke(
    {
        "state": (
            "The deploy failed twice and customers are seeing 500s. "
            "Can someone look now?"
        ),
        "questions": {
            "urgent": Noul(instructions="Does this need attention right now?"),
            "team": Choice(
                instructions="Which team should pick this up?",
                criteria={
                    "infra": "Deploys, availability, and on-call incidents.",
                    "billing": "Payments, invoices, and subscriptions.",
                },
            ),
            "severity": Score(
                instructions="How severe is the impact?",
                criteria=["Cosmetic.", "Degraded for some users.", "Full outage."],
            ),
        },
    }
)
print(response.nouls["urgent"].noul)
print(response.choices["team"].choice, response.choices["team"].confidence)
print(response.scores["severity"].score)
```

- Earlier versions set `questions` on the constructor; **now both `state` and
  `questions` go to `invoke`**. Old tutorials are wrong.
- `state` may be a string, JSON, or LangChain messages (converted to role/content JSON).
- Experimental middleware (`langchain-typesafe[experimental]`, import from
  `langchain_typesafe.experimental.middleware`):
  `ModelRouterMiddleware` + `ModelChoice` (pick the model for a run) and
  `AutoModeMiddleware(tools=[...])` (refuse a tool call judged risky; customise
  with `criteria=NoulCriteria(true=..., false=...)`). It **refuses**, it does
  not ask for approval — pair it with human-in-the-loop middleware, and keep
  secrets out of tool arguments since they are sent to TypeSafe.
- JS: `npm install @langchain/typesafe @langchain/core`; there the questions are
  constructor settings (`new TypeSafeClassifier({ questions: {...} })`) and
  `invoke` takes the state — the two languages currently differ.
- No dedicated LangGraph package; use the middleware inside `create_agent`.

---

## Vercel AI SDK — `@ai-sdk/typesafe-ai`

Docs: https://ai-sdk.dev/providers/ai-sdk-providers/typesafe-ai

```bash
pnpm add @ai-sdk/typesafe-ai
```

```ts
import { typeSafeAi } from '@ai-sdk/typesafe-ai';
import { experimental_evaluate } from 'ai';

const result = await experimental_evaluate({
  model: typeSafeAi.evaluationModel('jev-latest'),
  state: {
    message: 'I was charged twice. Please refund the duplicate.',
  },
  questions: {
    department: {
      type: 'choice',
      instructions: 'Which team should handle this?',
      criteria: {
        billing: { includes: ['Charges', 'Invoices', 'Refunds'] },
        technical: ['Bugs', 'Outages'],
        other: null,
      },
    },
    severity: {
      type: 'score',
      instructions: 'How severe is the issue?',
      criteria: ['Cosmetic', 'Workaround exists', 'Blocking; no workaround'],
    },
    requestsRefund: {
      type: 'boolean',
      instructions: 'Is the customer requesting money back?',
    },
  },
});

console.log(result.answers.department.choice);
console.log(result.answers.severity.score);
console.log(result.answers.requestsRefund.probability);
```

- Env var is **`TYPESAFE_AI_API_KEY`** (not `TYPESAFE_API_KEY`); default base URL `https://api.typesafe.ai/v1`.
- Noul is called `boolean` and answers `.probability` (P(true)).
- Confidence lives at `result.providerMetadata.typesafe.confidence[questionId]`.
- Values are rounded to two decimals; `result.rounding` reports it, so
  probabilities may not sum to exactly 1.
- Core retries 429/529 (`maxRetries`, default 2).
- Vercel AI Gateway: model `typesafe-ai/jev` (AI SDK ≥ 7.0.105), or point the
  TypeSafe SDK at `https://ai-gateway.vercel.sh/typesafe`.

---

## DSPy — `dspy.experimental` (DSPy 3.4.0, 2026-09-25)

Tutorial: https://dspy.ai/current/tutorials/jev_decisions/

```bash
pip install "dspy[typesafe]"
```

```python
import dspy
from dspy.experimental import Choice, Noul, Score, TypeSafe

Urgent = Noul[(True, "Completely blocked"), (False, "Has workaround")]
Severity = Score["Minor", "Moderate", "Critical"]
Category = Choice[("billing", "Payment"), ("technical", "Product bug"), ("account", "Access")]


class Triage(dspy.Signature):
    """Route and prioritize support tickets."""
    ticket: str = dspy.InputField(desc="Customer message.")
    urgent: Urgent = dspy.OutputField(desc="Is the customer blocked?")
    severity: Severity = dspy.OutputField(desc="Impact level.")
    category: Category = dspy.OutputField(desc="Issue type.")


triage = dspy.Predict(Triage)
triage.set_lm(TypeSafe("jev-latest"))      # TYPESAFE_API_KEY from the environment
result = triage(ticket="My dashboard is blank after the update")
result.urgent.probability, result.severity.value, result.category.value
```

- The same typed signature also runs on an ordinary LLM, which makes a
  like-for-like comparison cheap.
- `ReAnchor(metric).compile(triage, trainset=...)` fits per-field decision
  parameters (`threshold`, `cuts`, `weights`) on labelled examples; save/load
  them with the module. What it fits are the rules that turn probabilities
  into values, not the probabilities themselves — measure calibration
  separately (`decision-model-calibration`).

---

## Other surfaces

| Surface | Status (2026-10-03) | Entry point |
|---|---|---|
| OpenRouter | yes | `typesafe/jev-1.13` (`~typesafe/jev-latest`); TypeSafe SDK with `base_url="https://openrouter.ai/api"` |
| LiteLLM proxy | pass-through only (≥ v1.103.0-rc) | `POST <proxy>/typesafe/v1/systemone`; no `/chat/completions` |
| Cloudflare Workers AI | yes | `env.AI.run('typesafe/jev', {state, questions})` |
| AG2 | yes (v1.1.0) | `TypeSafeConfig()`; tools rejected |
| n8n | official community node | `@typesafe-ai/n8n-nodes-typesafe-ai` (Evaluate, Route) |
| Langfuse | Jev as an evaluator judge | evaluator UI |
| Zapier | "Ask Questions" action | publisher not stated |
| Haystack | proposed, not merged | `typesafe-haystack` PR open |
| LlamaIndex | community only | `llama-index-*-jev`, not affiliated |
| MCP server | community only | no official TypeSafe server |
| Instructor, AWS Bedrock, Azure Foundry, Vertex | not found | — |
