# Twitter/X Thread — v1.1.1

Post as a thread. Tweet 1 first, reply to yourself for the rest.

---

**Tweet 1 (hook)**
```
Dev-Suite v1.1.1 is out.

Biggest addition: the task orchestrator now has a Claude-Code-style interactive
permission system — asks before running anything destructive.

Here's what's new 🧵
```

---

**Tweet 2**
```
The orchestrator runs multi-agent jobs from the GUI.

Before v1.1.1, it executed everything automatically.

Now it pauses and asks for approval on sensitive operations — same pattern
Claude Code uses. Much safer for production tasks.
```

---

**Tweet 3**
```
Two new specialized agents:

→ ux-expert: visual hierarchy, design tokens, motion design, color systems,
  ethical design, mobile UX

→ python-integration-test-expert: pytest, TestContainers, async testing,
  fixtures, coverage

Brings the total to 43 agents across frontend, backend, infra, security, data.
```

---

**Tweet 4**
```
Security pass: fixed 16 CodeQL alerts.

ReDoS patterns (vulnerable regex) and path-injection risks — both classes
that are easy to miss in code review but flagged by static analysis.

178 new tests cover the permission system end-to-end.
```

---

**Tweet 5 (for newcomers)**
```
What is Dev-Suite?

It extends Claude Code (the Anthropic CLI) with:
• Specialized sub-agents for your tech stack
• MCP servers for docs, Docker, DBs, logs, API testing
• A visual dashboard with stack detection + config
• 346+ skills and knowledge bases

MIT, self-hosted, no subscription.
```

---

**Tweet 6 (CTA)**
```
→ github.com/claude-dev-suite/claude-dev-suite

If you use Claude Code and haven't tried dev-suite yet, the quick start
is a single git clone + bash script.

Drop a ⭐ if it's useful.
```

---

## Notes
- Tag @AnthropicAI on Tweet 5 only (not spammy, contextually appropriate)
- Use images: screenshot of the permission dialog on Tweet 2, agent list on Tweet 3
- Post the thread in one sitting — don't split across days
