# LinkedIn Post — v1.1.1

```
Released Dev-Suite v1.1.1 this week.

The most requested change was simple: "don't just do things automatically —
ask me first." So I rebuilt the task orchestrator with a permission system
that mirrors how Claude Code itself works: it pauses on sensitive operations
and waits for your approval before proceeding.

What's new in v1.1.1:

→ Interactive permission system for the multi-agent orchestrator
  (approve/deny before any destructive action runs)

→ Two new specialized agents:
  • ux-expert — covers visual hierarchy, design tokens, motion design, ethical UX
  • python-integration-test-expert — pytest, TestContainers, async testing patterns

→ 16 CodeQL security issues resolved (ReDoS + path injection)

→ 178 new tests covering the permission system

---

Dev-Suite is an open-source toolkit that extends Claude Code with specialized
agents, MCP servers, and a configuration dashboard. The idea is that your AI
assistant should know your stack deeply — not just "write some code", but
"write a Spring Boot service with JPA, Flyway, MapStruct, and proper error handling."

MIT license. No subscription. You use your own Anthropic account.

→ github.com/claude-dev-suite/claude-dev-suite

Happy to connect with engineering teams exploring AI-assisted development workflows.
```

## Notes
- Post mid-week (Tuesday–Thursday), any time of day
- LinkedIn posts have a longer shelf life than Twitter — this will surface for 48–72h
- First comment: add the direct GitHub link again (LinkedIn buries links in posts)
- Can recycle the same post text 7–10 days later with minor edits (LinkedIn algorithm is forgiving)
