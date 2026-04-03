# Show HN: Dev-Suite v1.1.1

## Title
```
Show HN: Dev-Suite – Claude-Code-style permission system, UX/Python agents, 178 tests
```

## Body (plain text, no markdown)
```
Hey HN, I'm Mario, author of Dev-Suite — an open-source toolkit that extends Claude Code
with specialized agents, MCP servers, and a configuration dashboard.

v1.1.1 ships with:

- Interactive permission system (Claude-Code style): the task orchestrator now asks for
  approval before running destructive operations — same UX as Claude Code itself
- Two new agents: ux-expert (visual hierarchy, design tokens, motion design, ethical design)
  and python-integration-test-expert (pytest, TestContainers, async testing)
- Security: 16 CodeQL alerts fixed — ReDoS patterns and path-injection vulnerabilities
- 178 new unit + integration tests covering the permission system

The project currently has ~43 specialized agents, 346+ skills, and MCP servers for
documentation, Docker, databases, API testing, log analysis, performance profiling,
and security scanning.

MIT licensed: https://github.com/claude-dev-suite/claude-dev-suite

Happy to answer questions about the architecture: how the MCP protocol integration
works, how the multi-agent orchestrator handles permissions, or how the Electron
dashboard connects to the Claude Code CLI.
```

## Posting guidelines
- Post Tuesday–Thursday, 9–11 AM ET
- Stay active in comments for the first 2 hours after posting
- If asked about pricing/model: "MIT, completely free, self-hosted"
- If asked about Claude API costs: "Dev-Suite extends Claude Code CLI — you use your own Anthropic account"
- Do NOT edit the title after posting (penalizes HN ranking)
