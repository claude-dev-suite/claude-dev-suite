# Reddit Posts — v1.1.1

---

## r/ClaudeAI

**Title:**
```
Dev-Suite v1.1.1 — added a permission system to the multi-agent orchestrator
```

**Body:**
```
Hey r/ClaudeAI,

Shipped v1.1.1 of Dev-Suite, the open-source toolkit I maintain for extending
Claude Code.

Biggest change: the task orchestrator now has an interactive permission system.
Before, when you submitted a multi-agent job from the GUI, it ran everything
automatically. Now it pauses and asks for confirmation before destructive
operations — same pattern Claude Code uses natively.

Also added two new agents:
- ux-expert (visual hierarchy, design tokens, motion, ethical design)
- python-integration-test-expert (pytest, TestContainers, async)

The project gives Claude Code specialized agents for your stack (React, Spring Boot,
Rust, Go, etc.), MCP servers for docs/Docker/DBs/logs, and a visual dashboard with
stack detection.

Repo: https://github.com/claude-dev-suite/claude-dev-suite

Happy to answer questions about how it works with Claude Code.
```

---

## r/devtools

**Title:**
```
Dev-Suite v1.1.1: Claude-Code-style permission system for the multi-agent orchestrator + security fixes
```

**Body:**
```
Released v1.1.1 of Dev-Suite — an open-source toolkit that extends Claude Code
with specialized agents, MCP servers, and a configuration dashboard.

**What changed:**

Permission system — the task orchestrator now implements a confirm/deny flow
before executing sensitive operations. 178 tests cover the new system. The
pattern mirrors Claude Code's own permission model so the UX is consistent.

Security — 16 CodeQL alerts resolved: ReDoS-vulnerable regexes and path-injection
risks. The fixes are documented in the commit history for anyone interested in
the specific patterns.

New agents — ux-expert and python-integration-test-expert bring the total to 43
specialized agents.

**Architecture note:** The orchestrator runs on an Express backend, the permission
prompts are streamed via WebSocket to the React frontend, and the whole thing runs
inside an Electron shell. Coordination between agents uses a job queue with real-time
status updates.

Repo: https://github.com/claude-dev-suite/claude-dev-suite
MIT license.
```

---

## Posting order
1. r/ClaudeAI first (largest relevant audience)
2. r/devtools 2–3 days later (different audience, different framing)
3. r/SideProject (use r/ClaudeAI post text) — only if you have karma there
4. Do NOT cross-post the same text to multiple subreddits on the same day
