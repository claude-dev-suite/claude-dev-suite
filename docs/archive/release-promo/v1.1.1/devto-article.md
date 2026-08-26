---
title: I built a toolkit that turns Claude Code into a full AI dev suite
published: false
tags: claudecode, mcp, devtools, opensource
cover_image: (add screenshot of the dashboard here)
---

Claude Code is one of the most capable AI coding assistants available. But out of
the box it starts every project knowing nothing about your stack. No framework
context, no domain-specific tools, no way to configure what it can and can't do.

I wanted something different: an assistant that already knows React 19, or Spring
Boot with Flyway and MapStruct, or Rust with Axum — without me re-explaining it
every session. So I built Dev-Suite.

## What Dev-Suite is

Dev-Suite is an open-source toolkit that extends Claude Code with three things:
specialized agents, MCP servers, and a configuration dashboard.

**GitHub:** https://github.com/claude-dev-suite/claude-dev-suite  
**License:** MIT

---

## The problem with "vanilla" Claude Code

When you open a new project with Claude Code, it's a blank slate. You have to
tell it your stack, your conventions, what tools are available, what patterns
to follow. For a one-off task that's fine. For daily development work it gets
old fast.

What I wanted was something like specialized colleagues you can call in:
*"@react-expert add a form with validation"* — and it already knows you're using
React Hook Form, Zod, and shadcn/ui. No briefing required.

---

## How it works

### 1. Specialized agents (~43)

Each agent is a sub-agent with deep context for a specific domain. You invoke
them with `@agent-name` in Claude Code, or through the orchestrator GUI.

Some examples:

- **react-expert** — React 19, hooks, Zustand, TanStack Query, Tailwind, shadcn/ui
- **spring-boot-expert** — JPA, Flyway, MapStruct, Spring Security, Lombok
- **security-expert** — OWASP checks, dependency scanning, secrets detection
- **playwright-expert** — E2E tests, page object model, assertions
- **devops-expert** — CI/CD pipelines, Docker, Kubernetes, GitHub Actions

They don't bleed into each other — each one loads only its relevant context when
invoked, keeping the main context window clean.

### 2. MCP servers (10)

MCP (Model Context Protocol) is the standard Anthropic introduced to give AI
assistants access to real tools. Dev-Suite ships 10 pre-built MCP servers:

| Server | What it does |
|--------|-------------|
| documentation | Fetches framework docs on-demand from a Git-based KB |
| api-tester | Tests REST endpoints, validates responses |
| database-query | Runs queries against PostgreSQL, MySQL, SQLite |
| docker-manager | Lists containers, reads logs, manages images |
| log-analyzer | Tails and pattern-matches log files |
| performance-profiler | CPU/memory profiling for Node.js and Python |
| code-quality | Complexity analysis, duplication detection |
| security-scanner | Dependency audit, secret detection |
| git-tools | Branch management, diff analysis, commit history |
| file-manager | Safe file operations with backup |

These are proper MCP servers — they show up in Claude's tool list and are called
natively, not through prompt hacks.

### 3. Skills (346+)

Skills are structured knowledge files that agents load at invocation time. Think
of them as quick-reference guides baked into the agent's context: patterns,
gotchas, framework idioms, best practices.

The documentation MCP server fetches them from a Git-based knowledge base with
a 2-hour cache. They stay up to date without you pulling anything manually.

### 4. The dashboard

The Electron dashboard is the configuration layer. When you point it at a project,
it:

1. Detects your stack from `package.json`, `pom.xml`, `Cargo.toml`, `requirements.txt`, etc.
2. Pre-selects the relevant agents and MCP servers
3. Lets you review and customize the selection
4. Generates `.mcp.json` and `CLAUDE.md` for that project

It also has an orchestrator tab where you can submit multi-agent jobs with
real-time streaming output. The orchestrator pauses on sensitive operations and
asks for approval — same permission model as Claude Code itself.

---

## Architecture in brief

Agents are markdown files with YAML frontmatter:

```yaml
---
name: react-expert
model: sonnet
skills:
  - frontend-react
  - state-zustand
  - ui-shadcn
mcp_servers:
  - documentation
  - code-quality
---
# React Expert Agent
...
```

MCP servers are TypeScript npm packages under `mcp-servers/`. The dashboard is
React + Express + Electron. Everything runs locally — nothing goes to a third-party
server.

---

## Quick start

```bash
git clone https://github.com/claude-dev-suite/claude-dev-suite.git
cd claude-dev-suite
./init-project.sh /path/to/your/project
```

The script launches the dashboard, detects your stack, and walks you through
the setup. On Windows there's `init-project.ps1`.

---

## What's next

The project is MIT licensed and actively maintained. Current focus:

- Expanding the agent roster (contributions welcome)
- Improving the orchestrator's multi-step job handling
- Adding more MCP servers (browser automation, cloud providers)

If you use Claude Code and want something that knows your stack from day one,
give it a try. Issues and PRs are open.

**https://github.com/claude-dev-suite/claude-dev-suite**
