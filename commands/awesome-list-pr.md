---
name: awesome-list-pr
description: Generate a pull request body for adding dev-suite to an awesome list
allowed-tools: Read, Bash
argument-hint: <awesome-list-repo> — e.g. /awesome-list-pr sindresorhus/awesome-mcp
---

# Awesome List PR

Generate a complete, guidelines-compliant pull request for adding dev-suite to an awesome list.

## How to execute this command

1. Identify the target list:
   - If `$ARGUMENTS` is provided, use it as the target repo (e.g. `awesome-mcp-servers`)
   - If not provided, ask the user which awesome list they're targeting

2. Gather current project stats:
   - Run `find agents -name '*-expert.md' | wc -l` → agent count
   - Run `find skills -name 'SKILL.md' | wc -l` → skill count
   - Run `ls mcp-servers/ | grep -v package | wc -l` → MCP server count
   - Run `git describe --tags --abbrev=0` → latest version

3. Determine the correct category for the target list:
   - `awesome-mcp` / `awesome-mcp-servers`: category is "Developer Tools" or "Toolkits"
   - `awesome-claude`: category is "Extensions" or "Tooling"
   - `awesome-ai-tools`: category is "Developer Tools"
   - `awesome-anthropic`: category is "Open Source Projects"
   - Generic awesome list: category is "Developer Tools"

4. Generate the following:

---

## Output

### PR Title
```
Add dev-suite — Claude Code toolkit with agents, MCP servers, and dashboard
```

### PR Body

```markdown
## Addition: dev-suite

**Repository:** https://github.com/claude-dev-suite/claude-dev-suite

**One-line description:**
> Specialized agents, MCP servers, skills, and a visual dashboard for Claude Code. MIT.

**Why it belongs in this list:**
Dev-Suite is a comprehensive open-source toolkit that extends Claude Code with:
- Specialized sub-agents for specific tech stacks (React, Spring Boot, Rust, etc.)
- MCP servers that give Claude access to documentation, Docker, databases, logs, and more
- A visual Electron dashboard with stack detection, component selection, and multi-agent orchestration
- MIT licensed, actively maintained, production-tested

**Checklist** (per contribution guidelines):
- [x] The entry follows the format: `[Name](link) — Description. License.`
- [x] Description is brief, clear, and starts with a capital letter
- [x] The project is open source (MIT)
- [x] The repository has a README, LICENSE, and contributing guide
- [x] The link goes directly to the GitHub repository
- [x] I have read the contribution guidelines
```

### One-line entry (for the list file)
```
[Dev-Suite](https://github.com/claude-dev-suite/claude-dev-suite) — Specialized agents, MCP servers, and a visual dashboard for Claude Code. MIT.
```

---

## Notes

- Check the target list's contribution guidelines before opening the PR
- Some lists require the project to have ≥ N stars — verify before submitting
- If the list hasn't been updated in 6+ months, deprioritize it (low ROI)
- Always match the exact format of existing entries in the list (spacing, punctuation, capitalization)

## Target lists (priority order)

| Repo | Status | Notes |
|------|--------|-------|
| `mcpso/awesome-mcp-servers` | High priority | MCP-specific, exact audience |
| `punkpeye/awesome-mcp-servers` | High priority | Large, active |
| `awesome-claude-code` (any) | High priority | Direct audience |
| `sindresorhus/awesome` | Medium | Requires high star count |
| `awesome-ai-tools` | Medium | Broad audience |
| `awesome-anthropic` | Medium | Brand-aligned |
