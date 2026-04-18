---
name: shadow-mode-deployment
description: |
  Shadow and canary deployment of RAG pipeline changes: dual-execute new + old,
  offline LLM-judge comparison, gradual traffic ramp, auto-rollback guardrails,
  multi-armed bandits, per-component feature flags (retriever, reranker,
  generator).

  USE WHEN: user mentions "shadow mode", "canary deployment", "dual execute",
  "shadow traffic RAG", "feature flags RAG", "multi-armed bandit", "auto
  rollback", "LaunchDarkly RAG", "Unleash RAG"

  DO NOT USE FOR: CI pre-merge eval - use `continuous-evaluation`; offline
  eval only - use `rag-evaluation`; drift detection - use `drift-detection`
allowed-tools: Read, Grep, Glob, Write, Edit
---
# Shadow Mode & Canary Deployment for RAG

## Why Shadow Mode for RAG

Offline evaluation diverges from live traffic within weeks because:

- Query distribution shifts (product updates, seasonality).
- Corpus updates introduce content you never tested against.
- Judge LLM scores don't always match user satisfaction.

Shadow mode runs a candidate pipeline alongside production without affecting
user-facing output. Only after shadow metrics match or beat baseline do you
ramp real traffic.

## Stages

| Stage | User Impact | Traffic to Candidate | Purpose |
|---|---|---|---|
| Shadow (dual-execute) | Zero (candidate output discarded) | 100% mirror | Latency + quality comparison |
| Dark canary | Zero (compared offline) | Mirror + log | LLM-judge A/B offline |
| Canary | Small | 1-5% | Real user signal |
| Gradual ramp | Growing | 10 / 25 / 50 / 100% | Confidence building |
| Bandit | Dynamic | Optimal allocation | Revenue / satisfaction maximisation |

## Dual Execution Wrapper

```python
import asyncio, time
from dataclasses import dataclass

@dataclass
class PipelineResult:
    answer: str
    contexts: list[str]
    latency_ms: float
    cost: float

async def serve(query: str, user_id: str, flags) -> PipelineResult:
    shadow_enabled = flags.is_enabled("rag.shadow_v2", user_id=user_id)
    if not shadow_enabled:
        return await prod_pipeline.answer(query)

    prod_task   = asyncio.create_task(prod_pipeline.answer(query))
    cand_task   = asyncio.create_task(cand_pipeline.answer(query))
    prod_result = await prod_task

    async def log_shadow():
        try:
            cand_result = await asyncio.wait_for(cand_task, timeout=5.0)
            await log_event({
                "query": query, "user_id": user_id,
                "prod": prod_result.__dict__,
                "cand": cand_result.__dict__,
                "ts": time.time(),
            })
        except asyncio.TimeoutError:
            await log_event({"query": query, "user_id": user_id,
                             "cand_error": "timeout"})
    asyncio.create_task(log_shadow())
    return prod_result
```

Candidate latency and errors are logged without blocking the user.

## Offline Comparison with an LLM Judge

```python
from anthropic import Anthropic
import json

client = Anthropic()

JUDGE = """You compare two RAG answers to the same question and pick the
better one. Return JSON: {"winner": "A"|"B"|"tie", "reason": str}.

Question: {q}
Answer A: {a}
Answer B: {b}"""

def judge_pair(q, a, b):
    msg = client.messages.create(
        model="claude-sonnet-4-5-20250929",
        max_tokens=400,
        messages=[{"role": "user", "content": JUDGE.format(q=q, a=a, b=b)}],
    )
    return json.loads(msg.content[0].text)

# Randomize A/B order per sample to avoid position bias
import random
def judge_shadow_log(entries):
    results = {"prod_wins": 0, "cand_wins": 0, "ties": 0}
    for e in entries:
        if random.random() < 0.5:
            v = judge_pair(e["query"], e["prod"]["answer"], e["cand"]["answer"])
            mapping = {"A": "prod_wins", "B": "cand_wins", "tie": "ties"}
        else:
            v = judge_pair(e["query"], e["cand"]["answer"], e["prod"]["answer"])
            mapping = {"A": "cand_wins", "B": "prod_wins", "tie": "ties"}
        results[mapping[v["winner"]]] += 1
    return results
```

Run daily over the previous day's shadow log; require cand_wins >= prod_wins
with p < 0.05 (sign test) before promoting.

## Feature Flags for Independent Components

RAG has several swappable components. Flag them independently so you can isolate
which change caused a regression.

```python
# LaunchDarkly example
import ldclient
ld = ldclient.get()

def build_pipeline(user):
    retriever = HybridRetriever() if ld.variation(
        "rag.retriever.hybrid", user, False) else DenseRetriever()

    reranker_model = ld.variation(
        "rag.reranker.model", user, "BAAI/bge-reranker-v2-m3")
    reranker = CrossEncoder(reranker_model)

    gen_model = ld.variation(
        "rag.generator.model", user, "claude-sonnet-4-5-20250929")

    return RAGPipeline(retriever, reranker, generator=gen_model)
```

Unleash equivalent:

```python
from UnleashClient import UnleashClient

unleash = UnleashClient(url="https://unleash.example/api", app_name="rag-svc",
                       custom_headers={"Authorization": UNLEASH_TOKEN})
unleash.initialize_client()

if unleash.is_enabled("rag.reranker.v2", {"userId": user_id}):
    reranker = new_reranker
```

## Gradual Ramp

```python
# Ramp config lives outside code
RAMP = {"rag.generator.claude45": [
    {"day": 0, "pct": 1},
    {"day": 1, "pct": 5},
    {"day": 3, "pct": 25},
    {"day": 5, "pct": 50},
    {"day": 7, "pct": 100},
]}
```

Each step requires:

- Shadow judge win-rate >= 50% over last 24h.
- Latency p95 not worse by more than 10% vs baseline.
- Error rate not increased.
- Manual sign-off for the 50% -> 100% promotion (cheap insurance).

## Auto-Rollback Guardrails

```python
# rollback_watcher.py (runs every 5 minutes)
SLA = {
    "faithfulness_avg": (0.85, ">"),
    "latency_p95_ms":   (4000, "<"),
    "error_rate":       (0.01, "<"),
}

def check_window(metric, window_minutes=15):
    # pull metric from prometheus / ds-monitoring
    ...

breaches = []
for metric, (thresh, op) in SLA.items():
    val = check_window(metric)
    bad = (op == ">" and val < thresh) or (op == "<" and val > thresh)
    if bad:
        breaches.append((metric, val, thresh))

if len(breaches) >= 2:
    ld.update("rag.generator.claude45", {"rolloutPercent": 0})
    page("rag-oncall", f"AUTO-ROLLBACK: {breaches}")
```

Guardrail design:

- Require at least two breaches to avoid flapping on single-metric noise.
- Cooldown after rollback — do not auto-reenable.
- Keep a single kill-switch flag `rag.emergency_disable_all_experiments`.

## Multi-Armed Bandit for Variant Selection

Once multiple candidates are healthy, a bandit can outperform static A/B splits.
Thompson sampling on a binary reward (user thumbs-up or click-through):

```python
import numpy as np

class ThompsonBandit:
    def __init__(self, arms):
        self.alpha = {a: 1.0 for a in arms}
        self.beta  = {a: 1.0 for a in arms}
    def pick(self):
        samples = {a: np.random.beta(self.alpha[a], self.beta[a]) for a in self.alpha}
        return max(samples, key=samples.get)
    def record(self, arm, reward_0_1):
        self.alpha[arm] += reward_0_1
        self.beta[arm]  += 1 - reward_0_1

bandit = ThompsonBandit(["control", "reranker_v2", "hybrid_v1"])
variant = bandit.pick()
answer = PIPELINES[variant](query)
# After receiving feedback:
bandit.record(variant, 1.0 if user_thumbs_up else 0.0)
```

Bandits skew traffic; keep a minimum 5% exploration on each healthy arm for
continuous comparison.

## Observability Schema

Per shadow log entry:

```json
{
  "query": "...",
  "user_id": "u_abc",
  "prod": {"answer": "...", "latency_ms": 1820, "cost": 0.004, "model": "sonnet-4.5"},
  "cand": {"answer": "...", "latency_ms": 2105, "cost": 0.005, "model": "opus-4.6"},
  "prod_faithfulness": 0.91,
  "cand_faithfulness": 0.93,
  "judge_winner": "cand",
  "variant_flags": {"retriever": "hybrid", "reranker": "bge-v2-m3"},
  "ts": 1730000000
}
```

Index on `variant_flags.*` to slice metrics by component.

## Rollback Drill

Practice rollback monthly:

1. Create a "red button" test: flip `rag.generator.claude45` from 50% to 0%.
2. Measure time-to-rollback (should be < 30s).
3. Verify no user-facing error spike during transition.

Practice surfaces bugs before real incidents.

## Cost Controls for Shadow Mode

Shadow doubles inference cost. Mitigations:

- Sample traffic: `if hash(user_id) % 100 < 10` runs the candidate on 10%.
- Skip shadow on cached queries.
- Use smaller candidate models when shadowing large ones for latency proxies.
- Cap daily shadow budget; disable shadow automatically when exceeded.

## Anti-Patterns

| Anti-Pattern | Fix |
|---|---|
| Promoting 1% -> 100% in one step | Ramp through 5/25/50 with pauses |
| Auto-rollback on single noisy metric | Require 2+ breaches over 15min window |
| Shadow only the generator | Shadow the whole pipeline; retriever changes often dominate |
| Randomized user assignment without sticky bucketing | Hash user_id so user sees consistent variant |
| Offline judge only, no real-user metric | Capture thumbs-up / click-through; offline signals drift |
| No kill-switch flag | Add `rag.emergency_disable_all_experiments` at every layer |
| Bandit with no exploration floor | Reserve >= 5% for each healthy arm |
| Ignoring cost doubling during shadow | Sample traffic; set daily shadow budget cap |

## Production Checklist

- [ ] Dual-execution wrapper with bounded candidate timeout
- [ ] Shadow log schema agreed and indexed on component flags
- [ ] Daily LLM-judge A/B on shadow log with position randomization
- [ ] Per-component flags (retriever, reranker, generator) in feature-flag system
- [ ] Sticky user bucketing via hash(user_id)
- [ ] Ramp schedule with explicit promotion criteria at each step
- [ ] Auto-rollback watcher with 2-of-N breach rule and cooldown
- [ ] Kill-switch flag for all experiments
- [ ] Real-user reward signal wired (thumbs / click / task success)
- [ ] Shadow cost budgeted and capped; traffic sampled
- [ ] Rollback drill practiced monthly
- [ ] Dashboard shows quality + latency + cost per variant, sliced by flag
