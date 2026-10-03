# TypeSafe Python SDK Quick Reference

> See [TypeSafe Jev SKILL](../SKILL.md) for the request model, limits and pricing.
> Verified against `typesafe-sdk` **0.7.2** (2026-09-26). Source:
> https://docs.typesafe.ai/sdk/python/usage and the API reference under `/sdk/python/api/`.

## Install

```bash
pip install typesafe-sdk                 # or: uv add typesafe-sdk
pip install 'typesafe-sdk[http2]'        # HTTP/2 multiplexing for many concurrent calls
```

Python >= 3.10. Built on `httpx2`, `pydantic>=2.12`, `tenacity`. MIT.

Breaking changes so far, all in minor versions — pin the SDK:
- 0.6.0: `Score.criteria` became an ordered **sequence** (was a dict keyed by int)
- 0.7.0: serialization moved from `msgspec` to `pydantic`; `response_model=` added

## Clients

```python
from typesafe_sdk import AsyncTypeSafeClient, TypeSafeClient

client = TypeSafeClient()                         # reads TYPESAFE_API_KEY
client = TypeSafeClient(model="jev-1.13.0")       # pin the version you tuned against
```

Constructor arguments (all optional): `api_key`, `model`, `retry`, `timeout`
(per attempt, default 10.0 s), `headers`, `transport`, `http_client`, `base_url`.
Both clients are context managers; close the async one with `aclose()` or
`async with`. An invalid key raises `TypeSafeError` **at construction**, before
any request.

| Env var | Default |
|---|---|
| `TYPESAFE_API_KEY` | required |
| `TYPESAFE_BASE_URL` | `https://api.typesafe.ai` |
| `TYPESAFE_DEFAULT_MODEL` | `jev-latest` |
| `TYPESAFE_LOG_LEVEL` | unset (`debug`/`info`/`warning`/`error`/`off`, read once at import) |

## Calling

```python
system_one(state, questions, model=None, retry=None, timeout=None,
           extra_headers=None, extra_body=None, response_model=None)
```

```python
import asyncio

from typesafe_sdk import AsyncTypeSafeClient, Choice, Noul, Score


async def main() -> None:
    async with AsyncTypeSafeClient() as client:
        result = await client.system_one(
            "I was charged twice. Please help ASAP.",
            {
                "billing": Noul(instructions="Is this about billing?"),
                "tone": Choice(
                    instructions="What is the tone?",
                    criteria={"calm": None, "angry": None},
                ),
                "urgency": Score(
                    instructions="How urgent is this?",
                    criteria=["low", "medium", "high"],
                ),
            },
        )
        print(
            result.nouls["billing"].noul,
            result.choices["tone"].choice,
            result.scores["urgency"].score,
        )


asyncio.run(main())
```

## Question types

| Class | Signature | Notes |
|---|---|---|
| `Noul` | `Noul(instructions=None, criteria: NoulCriteria \| None = None)` | `NoulCriteria(true=..., false=...)` |
| `Choice` | `Choice(criteria: Mapping[str, JSONContent \| None], instructions=None)` | criteria **required**; dict order is the order the model sees |
| `Score` | `Score(criteria: Sequence[JSONContent], instructions=None)` | ordered, non-empty; API accepts 2–10 |

`JSONContent` = string, object or array. Raw dicts
(`{"type": "noul", "instructions": ...}`) are accepted and can be mixed with
objects — useful for API fields the SDK has not modelled yet.

## Response

`SystemOneResponse` (frozen, strict pydantic model):

| Attribute | Content |
|---|---|
| `model` | the versioned id that answered — log it |
| `answers` | key → `NoulAnswer` / `ChoiceAnswer` / `ScoreAnswer` |
| `nouls`, `choices`, `scores` | typed views over `answers` |
| `usage` | `input_tokens`, `output_tokens` |
| `request_id` | for support tickets |
| `raw_http_response` | the underlying response (`.json()` for unknown answer kinds) |

`ScoreAnswer.probabilities` and `.legend` are keyed by **int** in the SDK
(strings on the wire). Unknown answer kinds are logged and skipped.

### Typed responses (`response_model`, since 0.7.0)

```python
from typesafe_sdk import Noul, NoulAnswer, SystemOneResponse, TypeSafeClient


class BillingResponse(SystemOneResponse):
    billing: NoulAnswer


with TypeSafeClient() as client:
    result = client.system_one(
        "I was charged twice.",
        {"billing": Noul(instructions="Is this about billing?")},
        response_model=BillingResponse,
    )
    assert 0 <= result.billing.noul <= 1
    assert result.billing == result.nouls["billing"]
    print(result.request_id)
```

Any plain `BaseModel` with an `answers` field also works as `response_model`.

## Retries

```python
from typesafe_sdk import RetryPolicy, TypeSafeClient

client = TypeSafeClient(retry=RetryPolicy(max_retries=3, backoff_max=0.2, timeout=1.0))
# or per call: client.system_one(state, questions, retry=RetryPolicy(...))
```

`RetryPolicy` defaults: `max_retries=2`, `backoff_initial=0.5`, `backoff_max=5.0`,
`backoff_jitter=0.25`, `http_statuses={408, 429, *range(500, 600)}`,
`respect_retry_after=True`, `api_connection_error=True`, `api_timeout_error=True`,
`exceptions=set()`, `predicate=None`, `timeout=30.0` — the **total** retry
budget per call. On a latency-critical path set `timeout` to what the caller
can actually wait.

## Exceptions

```
TypeSafeError
├── TypeSafeAPIError              .status .body .headers .endpoint .request_id
│   ├── TypeSafeBadRequestError            400
│   ├── TypeSafeAuthenticationError        401
│   ├── TypeSafePermissionDeniedError      403
│   ├── TypeSafeNotFoundError              404
│   ├── TypeSafeUnprocessableEntityError   422
│   ├── TypeSafeRateLimitError             429   .retry_after_ms
│   ├── TypeSafeInternalServerError        5xx
│   └── TypeSafeAPIResponseValidationError       .field_path
└── TypeSafeAPIConnectionError    (also ConnectionError)
    └── TypeSafeAPITimeoutError   (also TimeoutError)   .timeout
```

**Gotcha:** connection and timeout errors are *not* `TypeSafeAPIError`. The
docs' example catches only `TypeSafeAPIError`, which lets a timeout escape.
Catch `TypeSafeError` where you need a fallback for every failure:

```python
from typesafe_sdk import TypeSafeAPIError, TypeSafeError

try:
    result = client.system_one(state, questions)
except TypeSafeAPIError as error:      # the API answered with an error
    log.warning("typesafe %s %s", error.status, error.request_id)
    result = None
except TypeSafeError:                  # never answered: connection, timeout, bad key
    result = None
if result is None:
    route_to_fallback()
```

## HTTP/2

```python
import httpx2

from typesafe_sdk import AsyncTypeSafeClient

client = AsyncTypeSafeClient(http_client=httpx2.AsyncClient(http2=True))
```

## Logging

```python
import logging

logging.getLogger("typesafe_sdk").setLevel(logging.DEBUG)
```

`info` logs one line per request; `debug` adds headers and bodies. Secret
headers are redacted; **request and response bodies are not** — `debug` in
production writes your state to the logs.

## Forward compatibility

```python
client.system_one(state, questions, extra_body={"beam_width": 4})   # illustrative field
```

`extra_body` sends fields the SDK does not model yet; `extra_headers` likewise.

## Gateways

Point `base_url` at any service implementing the TypeSafe OpenAPI spec:

| Gateway | `base_url` | `model` | key env var |
|---|---|---|---|
| OpenRouter | `https://openrouter.ai/api` | `~typesafe/jev-latest` | `OPENROUTER_API_KEY` |
| Vercel AI Gateway | `https://ai-gateway.vercel.sh/typesafe` | `typesafe-ai/jev` | `AI_GATEWAY_API_KEY` |
| Pydantic AI Gateway | `https://gateway-us.pydantic.dev/proxy/typesafe` | `jev-latest` | `PYDANTIC_AI_GATEWAY_API_KEY` |

```python
import os

from typesafe_sdk import Noul, TypeSafeClient

with TypeSafeClient(
    api_key=os.environ["OPENROUTER_API_KEY"],
    base_url="https://openrouter.ai/api",
    model="~typesafe/jev-latest",
) as client:
    result = client.system_one(
        "I was charged twice.",
        {"billing": Noul(instructions="Is this about billing?")},
    )
```

## Testing without the network

Pass `transport=` (an `httpx2` mock transport) or `http_client=` to the
constructor and return canned JSON in the shape of the API reference. The
answer objects are frozen pydantic models, so fixtures can be built directly.
To compare Jev with an LLM through identical calling code, use
`typesafe-ai/system-one-adapter-python` ("Drop-in TypeSafeClient replacement
backed by LLM APIs").
