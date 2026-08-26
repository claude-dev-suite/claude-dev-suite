# Show HN: Dev-Suite

## Title
```
Show HN: Dev-Suite – specialized agents, MCP servers, and a config dashboard for Claude Code
```

## Body (plain text, no markdown)

```
Hey HN. I've been building Dev-Suite for the past several months —
an open-source toolkit that extends Claude Code with domain-specific agents,
MCP servers, and a visual configuration dashboard.

The problem I was solving: Claude Code is powerful but "vanilla". Every project
starts from scratch — no knowledge of your stack, no domain-specific tools, no
way to quickly configure which capabilities you need. I wanted it to behave like
a senior engineer who already knows React, Spring Boot, Rust, or whatever I'm
working with.

What Dev-Suite adds:

1. Specialized agents (~43 total) — sub-agents for specific tech stacks and domains.
   Each one has deep context for its area: the react-expert knows React 19, hooks,
   Zustand, TanStack Query, Tailwind, shadcn/ui. The spring-boot-expert knows JPA,
   Flyway, MapStruct, Spring Security. The security-expert runs OWASP checks. You
   invoke them with @react-expert or through the orchestrator — they don't bleed
   context into each other.

2. MCP servers (10) — extend Claude with real tools: fetch documentation on-demand,
   query Docker, run database queries, test API endpoints, tail and analyze logs,
   profile performance, run security scans. These are proper MCP servers that show
   up in Claude's tool list, not wrappers.

3. Skills (346+) — structured knowledge bases that agents load as context: framework
   quick-refs, patterns, gotchas. The documentation server fetches them from a Git-
   based KB on demand with a 2h cache, so they're always up to date without bloating
   the local install.

4. Electron dashboard — visual project setup: detects your stack from package.json,
   pom.xml, Cargo.toml, etc., lets you select which agents and MCP servers to install,
   generates the .mcp.json and CLAUDE.md for that project. The orchestrator tab lets
   you submit multi-step jobs with real-time streaming output.

5. Task orchestrator with permission system — runs multi-agent jobs from the GUI.
   It pauses and asks for approval before destructive operations, same UX pattern
   as Claude Code itself.

The architecture: agents are markdown files with YAML frontmatter. MCP servers are
TypeScript npm packages. Skills are loaded at agent invocation time. The dashboard
is React + Express + Electron. Everything is configurable and overridable.

MIT licensed, self-hosted, you use your own Anthropic account.

https://github.com/claude-dev-suite/claude-dev-suite

Happy to go deep on: how the MCP protocol works in practice, how agent-to-skill
loading works, the orchestrator permission model, or the Electron + Express
architecture of the dashboard.
```

---

## Posting guidelines

- **Timing:** Tuesday–Thursday, 9–11 AM ET. Do not post on Monday or Friday.
- **Stay active in comments** for the first 2 hours — HN's algorithm weighs comment
  velocity heavily in the early window.
- **Do not edit the title** after posting (triggers HN ranking penalty).
- **Tone in comments:** conversational, technical, direct. No "great question!".
  Acknowledge critical comments without being defensive.

## Likely questions and suggested answers

**"How is this different from just writing a good CLAUDE.md?"**
> A CLAUDE.md gives Claude instructions. Dev-Suite gives it tools (MCP servers),
> deep domain knowledge (skills), and pre-built sub-agents with specific roles.
> They're complementary — dev-suite generates the CLAUDE.md too, but that's
> the smallest part of what it does.

**"Does this work with other Claude Code alternatives?"**
> It's built specifically for Claude Code (the Anthropic CLI). The agents and
> skills could be adapted, but the MCP server integration and dashboard are
> Claude Code-specific.

**"What's the cost?"**
> MIT, completely free. You bring your own Anthropic account — same API costs
> as using Claude Code directly, nothing added.

**"Why Electron?"**
> The dashboard needs to launch Claude Code processes, read local project files,
> and write config files — browser can't do that. Electron was the practical choice.
> The core (agents, skills, MCP servers) works fine without it.

**"Is it stable enough to use in production?"**
> The agents and MCP servers are stable. The orchestrator is newer — use it for
> development workflows, not production automation, until it matures.
