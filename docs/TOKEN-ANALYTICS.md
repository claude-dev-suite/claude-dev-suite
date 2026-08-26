# Token Analytics

Dev-Suite can track token consumption per agent, per skill, and per MCP tool,
giving you visibility into where tokens go and helping you validate the ROI of
token-optimisation work (Phases 1–3 of the dev-suite token optimisation
roadmap).

---

## Privacy first — tracking is OPT-IN

**Token tracking is disabled by default.**

No tracking happens unless you explicitly enable it.  Token analytics never
records prompt text, file contents, or any sensitive payload — only numeric
counts and categorical metadata (which agent / skill / tool was used).

---

## This panel counts tokens. It does not report money.

Token counts are measured facts: the client reports what a call consumed.

Cost is not. Dev-suite used to multiply those counts by a per-model price table
compiled into `analytics.service.ts` and store the product on each record — so a
figure invented from a list price was frozen into history, and went stale the
moment Anthropic changed a rate. It *had* gone stale: the table still carried
2025 prices.

Real spend already has a real source. The **Usage** panel reads
`token_cost_usd` / `total_cost_usd` from the Anthropic Admin API's cost report —
amounts actually billed, per model and workspace. Use it for anything to do with
money.

The two cannot be merged: the Admin API bills per model and workspace, and does
not attribute spend to an individual agent, skill or MCP tool, which is exactly
the axis this panel groups by. Rather than approximate the gap, this panel
reports the axis it can measure and points at the panel that knows the rest.


## What is tracked

Each `TokenUsageEntry` contains:

| Field | Description |
|-------|-------------|
| `id` | Unique entry ID (auto-generated) |
| `timestamp` | ISO 8601 creation time |
| `agentId` | Which agent triggered the call (optional) |
| `skillPath` | Which skill directory was loaded (optional) |
| `mcpTool` | Which MCP tool was invoked (optional) |
| `sessionId` | Optional session grouping key |
| `tokensInput` | Number of input tokens |
| `tokensOutput` | Number of output tokens |
| `model` | Model used: `haiku` | `sonnet` | `opus` |
| `success` | Whether the call completed successfully |
| `durationMs` | Wall-clock duration in milliseconds (optional) |

### What is NOT tracked

- Prompt text or message content
- File contents
- User identifiers
- Response text

---

## Storage

Entries are stored at `.dev-suite-analytics/token-usage.json` in the target
project directory (same directory as `kb-usage.json`).  The file is
human-readable JSON.

```
.dev-suite-analytics/
  kb-usage.json          # KB usage (always active)
  token-usage.json       # Token usage (opt-in)
```

---

## How to enable

Set the environment variable `TOKEN_ANALYTICS_ENABLED=true` in the environment
where the dev-suite dashboard server runs.

### Electron / desktop app

Create or edit a `.env` file alongside the server entry-point, or set the
variable before launching:

```bash
TOKEN_ANALYTICS_ENABLED=true ./init-project.sh /path/to/project
```

### Manual server launch

```bash
TOKEN_ANALYTICS_ENABLED=true node configurator/dashboard/server/dist/index.js
```

When the variable is absent or set to any value other than `true` the
token-usage endpoints return **HTTP 403** and the dashboard panel shows an
informative opt-in notice.

---

## HTTP API

All endpoints require `TOKEN_ANALYTICS_ENABLED=true`.  Without it they return
`{ "success": false, "error": "Token analytics is disabled..." }` with HTTP 403.

### Record an entry

```http
POST /api/analytics/token-usage
Content-Type: application/json

{
  "projectPath": "/absolute/path/to/project",
  "agentId": "react-expert",
  "skillPath": "frontend-react",
  "mcpTool": "fetch_docs",
  "tokensInput": 1200,
  "tokensOutput": 450,
  "model": "sonnet",
  "success": true,
  "durationMs": 380
}
```

There is no cost field: the server records what it was told and nothing more.

**curl example:**

```bash
curl -X POST http://localhost:3456/api/analytics/token-usage \
  -H "Content-Type: application/json" \
  -d '{
    "projectPath": "/home/user/my-project",
    "agentId": "react-expert",
    "tokensInput": 1500,
    "tokensOutput": 600,
    "model": "sonnet",
    "success": true
  }'
```

### List entries

```http
GET /api/analytics/token-usage?path=/abs/path&since=2025-01-01T00:00:00Z&limit=50
```

Optional query params: `agentId`, `skillPath`, `mcpTool`, `model`, `since`,
`limit`.

### Aggregated stats (dashboard view)

```http
GET /api/analytics/token-usage/aggregate?path=/abs/path&groupBy=agent&since=2025-01-01T00:00:00Z
```

`groupBy` accepts: `agent` | `skill` | `mcpTool` | `model`

Response:
```json
{
  "success": true,
  "data": [
    {
      "key": "react-expert",
      "totalTokens": 8250,
      "totalCostUsd": 0.027,
      "callCount": 5,
      "avgTokensPerCall": 1650
    }
  ]
}
```

---

## How clients report usage

Any component that calls the Anthropic API can POST to the endpoint above.
Typical integration points:

1. **Custom hooks** (`scripts/hooks/`) — wrap your Claude CLI invocation and
   parse the `usage` block from the response JSON.
2. **MCP servers** — after each tool call, extract token counts from the
   Anthropic SDK response and POST to the endpoint.
3. **Orchestrator jobs** — the orchestrator already captures cost data; pipe it
   to the token-usage endpoint.

Example orchestrator integration (pseudo-code):

```typescript
const result = await runClaudeAgent({ agentId, prompt });
if (process.env.TOKEN_ANALYTICS_ENABLED === 'true') {
  await fetch(`${API_BASE}/api/analytics/token-usage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectPath,
      agentId,
      tokensInput: result.usage.input_tokens,
      tokensOutput: result.usage.output_tokens,
      model: result.model,
      success: result.success,
      durationMs: result.durationMs,
    }),
  });
}
```

---

## Dashboard panel

The **Token Analytics** tab in the dashboard (visible when dev-suite is
installed) shows:

- Summary cards: total tokens, average tokens per call, call count
- Group-by tab bar: By Agent / By Skill / By MCP Tool / By Model
- Time-range selector: Last 24h / Last 7d / Last 30d / All time
- Top-10 bar chart with token counts and call counts
- Pricing disclaimer

When the feature is disabled (no `TOKEN_ANALYTICS_ENABLED=true`) the panel
shows an opt-in notice rather than an error.
