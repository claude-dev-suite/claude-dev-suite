# TypeSafe JavaScript SDK and raw HTTP Quick Reference

> See [TypeSafe Jev SKILL](../SKILL.md) for the request model, limits and pricing.
> Verified against `@typesafe-ai/sdk` **0.6.0** (2026-09-15), the API reference at
> https://docs.typesafe.ai/api and https://api.typesafe.ai/openapi.json (spec version 0.2.0).

## JavaScript / TypeScript SDK

```bash
npm install @typesafe-ai/sdk    # Node.js 20+
```

```ts
import { choice, noul, score, TypeSafeClient } from "@typesafe-ai/sdk";

const client = new TypeSafeClient(); // TYPESAFE_API_KEY from the environment

const response = await client.systemOne({
  state: { ticket: "The deploy failed twice and customers are seeing 500s." },
  questions: {
    team: choice("Which team should pick up `ticket`?", {
      infra: "Deploys, availability, and on-call incidents.",
      billing: "Payments, invoices, and subscriptions.",
      other: null,
    }),
    urgent: noul("Does `ticket` need attention right now?"),
    severity: score("How severe is the impact?", [
      "Cosmetic.",
      "Degraded for some users.",
      "Full outage.",
    ]),
  },
});

response.answers.team.choice;        // typed as "infra" | "billing" | "other"
response.answers.team.confidence;
response.answers.urgent.noul;
response.answers.severity.score;
```

Helpers: `noul(instructions?, criteria?)`, `choice(instructions, criteria)`,
`score(instructions, criteria)` — `score` requires at least two levels at the
type level. Answer types are inferred from the question map.

### Client config (`new TypeSafeClient(config?)`)

| Field | Default |
|---|---|
| `apiKey` | `TYPESAFE_API_KEY` |
| `baseURL` | `https://api.typesafe.ai` |
| `defaultModel` | `jev-latest` |
| `timeout` | 10000 ms **per attempt**; there is no total retry budget |
| `retry` | 2 retries, backoff 500 ms → 5000 ms, jitter 0.25, statuses 408/429/5xx, `maxRetryAfterMs` 60000 |
| `dangerouslyAllowBrowser` | `false` — "Allow browser use, exposing the API key to page users" |
| `defaultHeaders`, `fetch`, `logger`, `logLevel` (`'warn'`) | — |

Per-request options (second argument): `headers`, `retry`, `signal`, `timeout`.
Because `timeout` is per attempt, three attempts can take ~30 s plus backoff —
pass an `AbortSignal.timeout(ms)` when a caller is waiting.

`systemOne` returns an `APIPromise` with `.withResponse()` (data + raw
`Response`), `.asResponse()` and `.map()`.

Errors: `TypeSafeError` base; `BadRequestError`, `AuthenticationError`,
`PermissionDeniedError`, `NotFoundError`, `UnprocessableEntityError`,
`RateLimitError`, `InternalServerError`, `APIConnectionError`,
`APITimeoutError`, `APIUserAbortError`.

**Never ship the key to a browser.** Proxy through your server; the flag exists
so that doing otherwise is a deliberate act.

## Raw HTTP

```bash
curl -sS https://api.typesafe.ai/v1/systemone \
  -H "Authorization: Bearer $TYPESAFE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "state": "Help! My payouts have been failing for 3 days.",
    "model": "jev-1.13.0",
    "questions": {
      "department": {
        "type": "choice",
        "instructions": "Which team should handle this?",
        "criteria": {
          "billing": "Payments, invoicing, refunds",
          "technical": "Bugs, outages, integrations",
          "sales": "Pricing, upgrades, new accounts"
        }
      }
    }
  }'
```

```json
{
  "model": "jev-1.13.0",
  "answers": {
    "department": {
      "type": "choice",
      "choice": "billing",
      "probabilities": { "billing": 0.88, "technical": 0.12, "sales": 0.0 },
      "confidence": 0.81
    }
  },
  "usage": { "input_tokens": 318, "output_tokens": 34 }
}
```

Score answers carry `score`, `legend` and `probabilities` keyed by the level
index **as a string** (`"0"`, `"1"`, …). Noul answers carry only `noul`.

`GET /v1/models` → `{"models": [{"name", "description", "release_date"}]}` (aliases only).

### Structured instructions

`instructions` can be an object: put the question in one field and the data it
refers to in others, and reference those by name in backticks — the same way
you point at a nested `state` value (`` `ticket.messages[0].text` ``):

```json
"instructions": {
  "potential_duplicate": {
    "name": "John Smith",
    "location": "Oakland, California",
    "last_employer": "Google"
  },
  "question": "Is the resume for the same person as `potential_duplicate`?"
}
```

### Error handling without an SDK

| Status | Action |
|---|---|
| 401 | fix the key; do not retry |
| 422 | fix the body; `detail[]` holds `loc`, `msg`, `type`, `input`, `ctx` |
| 429 / 529 | exponential backoff with jitter, honour `retry-after` |
| other 5xx, network | bounded retry, then your fallback path |

### Where the spec and the docs disagree (2026-10-03)

| Point | Docs | OpenAPI / SDKs |
|---|---|---|
| `model` required | yes (HTTP) | SDKs default to `jev-latest` |
| `instructions` required | marked required | nullable in spec and SDKs |
| Score minimum levels | 2 | `minItems: 1`; Python checks only non-empty |
| Score maximum / Choice maximum | 10 / 255 | not encoded in the spec |

Validate these limits yourself before sending, so a malformed question fails
in your code with a clear message instead of as a 422 at runtime.
