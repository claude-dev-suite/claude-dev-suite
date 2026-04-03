# dev.to Article Outline — v1.1.1

**Title (SEO-optimized):**
```
How I built a Claude Code permission system for multi-agent task orchestration
```

**Alternative titles:**
- "Dev-Suite v1.1.1: adding a safety layer to Claude Code's multi-agent workflows"
- "Building an interactive approval flow for AI agent pipelines (with Claude Code)"

**Tags:** `claudecode`, `mcp`, `devtools`, `opensource`, `anthropic`

**Estimated read time:** 6–8 min

---

## Outline

### Introduction (3–4 sentences)
Brief context: dev-suite extends Claude Code. The orchestrator lets you submit
multi-agent jobs from a GUI. Problem: it was running everything automatically,
including destructive operations. Solution: build a permission system that mirrors
how Claude Code itself handles sensitive actions.

### The problem with "just run it"
- Example scenario: user submits a job that involves git operations, file deletion, DB migrations
- Without a permission layer: scary to run in a shared environment
- User feedback: "I need to know what it's going to do before it does it"
- [Screenshot: before — job runs with no confirmation]

### How Claude Code handles permissions natively
- Claude Code has a built-in permission model: read-only tools, edit tools, bash tools each have different trust levels
- The user approves/denies tool use at the session level
- Reference: how Claude Code's permission prompts feel in practice

### What we built for the orchestrator
- The architecture: job queue → WebSocket stream → permission prompt in frontend
- How it pauses the job and waits for a response
- Approve → continues, Deny → job marked as cancelled with reason
- [Screenshot: permission dialog in the UI]
- Key design decision: match the exact UX pattern of Claude Code (don't invent a new mental model)

### Implementation details (for the technical reader)
- Express backend: job queue pauses on `PERMISSION_REQUIRED` status
- WebSocket: streams the permission request to connected frontend clients
- React frontend: modal dialog with the operation details + approve/deny
- Electron: no special handling needed — the web app works as-is
- Testing: 178 tests, including cases for timeout (auto-deny after N seconds)

### The two new agents
- ux-expert: why a UX-specific agent is useful alongside the React/Angular/Vue agents
- python-integration-test-expert: filling the gap between pytest unit tests and full E2E

### Security fixes (briefly)
- 16 CodeQL alerts: ReDoS and path injection
- What ReDoS is, why it matters for a server-side Node.js app
- The fix pattern: replace exponential-backtrack regexes with safe alternatives

### How to try it
- Quick start: git clone + bash init-project.sh
- The permission system is on by default — no config needed
- Link to repo

### What's next
- [Your actual roadmap items]

---

## Notes
- Add code snippets for the WebSocket permission flow (most interesting technical part)
- Cross-post to Hashnode same day
- Submit to daily.dev after publishing
- Target keyword appears naturally: "Claude Code", "multi-agent", "permission system"
- Length: 800–1200 words hits the sweet spot for dev.to engagement
