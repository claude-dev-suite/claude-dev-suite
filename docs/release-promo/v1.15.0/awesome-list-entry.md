# Awesome-list one-liners — v1.15.0

Pick the line that matches the list's subject, match the surrounding entries' formatting,
and read the target repo's CONTRIBUTING first — a mismatched format is the most common
reason these PRs are closed.

**Generic / developer tools:**

```
[Dev-Suite](https://github.com/claude-dev-suite/claude-dev-suite) - Specialized agents, framework skills, MCP servers and a visual configurator, installed into your project for Claude Code, Copilot, Cursor, Gemini CLI, Codex CLI, Cline or Kimi Code. MIT.
```

**Claude Code / agent-skills lists:**

```
[Dev-Suite](https://github.com/claude-dev-suite/claude-dev-suite) - Installs domain-expert agents and framework skills into a repo, with on-demand loading and an on-demand knowledge base so declared skills don't inflate every subagent's context. MIT.
```

**MCP lists:**

```
[Dev-Suite](https://github.com/claude-dev-suite/claude-dev-suite) - Bundle of local stdio MCP servers (documentation with an on-demand knowledge base, database query, Docker, API testing, log analysis, performance profiling, security scanning) plus a configurator that writes each assistant's MCP config. MIT.
```

**Code-review lists:**

```
[Dev-Suite review skills](https://github.com/claude-dev-suite/claude-dev-suite) - Per-language review guidance defined as the delta against each toolchain's default rule set, so the review stays silent about what the linter already reports. MIT.
```

---

**Candidate targets** (verify each list's submission rules before opening anything):

| List | Angle |
|------|-------|
| `hesreallyhim/awesome-claude-code` | Hand-picked; toolkit / skills angle |
| `VoltAgent/awesome-agent-skills` | Cross-assistant skills angle |
| `travisvn/awesome-claude-skills`, `ComposioHQ/awesome-claude-skills` | Skills angle |
| `punkpeye/awesome-mcp-servers`, `wong2/awesome-mcp-servers` | MCP angle |

**Note on MCP registries** (mcp.so, glama.ai, smithery.ai, PulseMCP): these expect a single
installable or hosted server. Dev-Suite's servers are local stdio workspaces inside the repo
and are not published individually to npm — submit under the toolkit angle, or publish one
server standalone first if a registry requires an install command.

**Already indexing dev-suite without being asked** (from the repo's referrer data):
lobehub.com and skills.sh. Worth checking what they say and correcting it if stale.
