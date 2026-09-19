# awesome-claude-code — submission draft

Target: `hesreallyhim/awesome-claude-code`

## Submit with this link — do not create the issue via the API

<https://github.com/hesreallyhim/awesome-claude-code/issues/new?template=recommend-resource.yml&title=%5BResource%5D%3A+Dev-Suite&display_name=Dev-Suite&category=Multi-Purpose&link=https%3A%2F%2Fgithub.com%2Fclaude-dev-suite%2Fclaude-dev-suite&author_name=claude-dev-suite&author_link=https%3A%2F%2Fgithub.com%2Fclaude-dev-suite&description=Configurator+that+detects+a+project%27s+stack+and+installs+a+matching+subset+of+specialized+agents%2C+framework+skills+and+local+MCP+servers+into+it%2C+writing+each+assistant%27s+own+config+format+rather+than+a+single+shared+one.+Skills+are+tiered%2C+so+a+subagent+starts+with+only+what+it+needs+and+reaches+the+rest+on+demand.+Alongside+Claude+Code+it+also+targets+Copilot%2C+Cursor%2C+Gemini+CLI%2C+Codex+CLI%2C+Cline+and+Kimi+Code.>

Every field is prefilled. Only the five required checkboxes need ticking — and they are
personal attestations ("I have visited this repo before with my own eyes"), so a human
should be the one ticking them.

**Why not `gh issue create`:** `.github/workflows/validate-new-issue.yml` gates both of its
jobs on `contains(github.event.issue.labels.*.name, 'resource-submission')`. That label is
applied server-side **by the form**. An issue created through the API arrives without it,
skips validation entirely, and is treated as an out-of-band submission — which is exactly
what happened to #1324.

> **Must go through the form.** Issue #1324 (3 April 2026) was a free-form issue and a bot
> closed it 9 seconds later with a 7-day cooldown. Nothing was read. The cooldown expired
> in April 2026.

## Eligibility

Met via *"at least 14 days of active development since the first commit"* — the repository
dates from 6 February 2026. The 100-star alternative is not needed.

## Field values

| Field | Value |
|---|---|
| **Display Name** | `Dev-Suite` |
| **Category** | `Multi-Purpose` |
| **Link** | `https://github.com/claude-dev-suite/claude-dev-suite` |
| **Author Name** | `claude-dev-suite` |
| **Author Link** | `https://github.com/claude-dev-suite` |

### Description

> Configurator that detects a project's stack and installs a matching subset of
> specialized agents, framework skills and local MCP servers into it, writing each
> assistant's own config format rather than a single shared one. Skills are tiered, so a
> subagent starts with only what it needs and reaches the rest on demand. Alongside Claude
> Code it also targets Copilot, Cursor, Gemini CLI, Codex CLI, Cline and Kimi Code.

430 characters, three sentences, descriptive register, no counts.

### Checklist

Check all five required boxes. **Leave the sixth unchecked** — it is a trap
("Do not check the following box").

## Distinctness

Required by the first checkbox. The `Multi-Purpose` section currently holds Claude CodePro,
claude-code-tools, Everything Claude Code, Fullstack Dev Skills and TÂCHES Claude Code
Resources. The nearest are Claude CodePro (a development environment with spec-driven
workflow and hooks) and Fullstack Dev Skills (a skills plugin across frameworks).

Dev-Suite differs on three points none of them cover:

1. **It writes seven assistants' native config formats** from one catalog. No entry in the
   list does this.
2. **Installation is selective and stack-driven** — detection picks a subset, rather than
   the user adopting a whole opinionated set.
3. **Skills are tiered and the knowledge base is fetched remotely**, so declared skills do
   not inflate every subagent's context.

## The one judgement call

The form requires checking *"This resource is specific to Claude Code."*

Dev-Suite's Claude Code support is the deepest of its seven targets — slash commands exist
for Claude Code only, and `.mcp.json`, `.claude/rules` and `.claude/settings.json` are
Claude-Code-only surfaces. So the box is defensible.

But the project now positions itself as assistant-neutral, and the description above says so
in its last sentence deliberately, rather than hiding it. The maintainer may still judge it
off-topic for a Claude Code list. That is the honest trade: a rejection on scope is
recoverable, a submission that misrepresents the project is not.

**Do not** reframe it as Claude-Code-only to improve the odds.

## Other lists

Same rule applies everywhere: read the target's CONTRIBUTING and use its template exactly.
Candidates and per-list one-liners are in `docs/release-promo/v1.15.0/awesome-list-entry.md`
— but note those one-liners predate the September 2026 repositioning and still lead with
Claude Code.
