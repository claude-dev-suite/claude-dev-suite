---
name: release-promote
description: Generate all promotional content for a new dev-suite release across every channel
allowed-tools: Read, Write, Bash, Glob
argument-hint: [version] — e.g. /release-promote v1.2.0
---

# Release Promote

Generate complete, copy-paste-ready promotional content for a dev-suite release.

## How to execute this command

1. Determine the version:
   - If `$ARGUMENTS` is provided, use it as the version tag (e.g. `v1.2.0`)
   - Otherwise, run `git describe --tags --abbrev=0` to get the latest tag

2. Gather release data:
   - Read `CHANGELOG.md` — extract the section for this version (everything between the version header and the next one)
   - Run `find agents -name '*-expert.md' | wc -l` to count agents
   - Run `find skills -name 'SKILL.md' | wc -l` to count skills
   - Run `ls mcp-servers/ | grep -v package | wc -l` to count MCP servers
   - Read the last 20 git commits: `git log --oneline -20`

3. Extract 3–5 key highlights from the CHANGELOG section. Focus on:
   - New agents or skills added
   - New MCP server capabilities
   - Dashboard/orchestrator improvements
   - Bug fixes that significantly improve reliability

4. Generate the following content and write it to `docs/release-promo/{VERSION}/`:

---

## Content to Generate

### File: `hacker-news.md`

**Show HN post** — technical, direct, zero marketing language.

Format:
```
Title: Show HN: Dev-Suite {VERSION} – {one-line description of biggest change}

Body:
Hey HN, I'm Mario, author of Dev-Suite — an open-source toolkit that extends Claude Code with specialized agents, MCP servers, and a configuration dashboard.

{VERSION} ships with:
- {highlight 1}
- {highlight 2}
- {highlight 3}

The project is MIT-licensed and lives at github.com/claude-dev-suite/claude-dev-suite.

Happy to answer questions about the architecture (MCP protocol, agent orchestration, the Electron dashboard).
```

Timing note: Post Tuesday–Thursday, 9–11 ET. Stay active in comments for first 2 hours.

---

### File: `twitter-thread.md`

**Twitter/X thread** — 6–8 tweets, each under 280 characters.

Structure:
- Tweet 1: Hook — what's new in one punchy line + version number
- Tweet 2–5: One highlight per tweet, concrete and specific
- Tweet 6: "Here's what dev-suite is:" + 3-bullet summary for newcomers
- Tweet 7: GitHub link + call to star
- Tweet 8 (optional): Tag @AnthropicAI if a highlight is MCP-related

---

### File: `linkedin.md`

**LinkedIn post** — professional tone, storytelling format, 150–300 words.

Structure:
- Opening line (hook, no "Excited to announce")
- What changed and why it matters for engineering teams
- 3 bullet highlights
- CTA: link to GitHub + "Happy to connect with devs exploring Claude Code"

---

### File: `reddit.md`

**Two Reddit posts** with different tones:

**r/ClaudeAI** — casual, community tone:
```
Title: Dev-Suite {VERSION} — {biggest change}
Body: [what's new, why useful for Claude Code users, link]
```

**r/devtools** — technical, show-the-work tone:
```
Title: Dev-Suite {VERSION}: {technical highlight}
Body: [architecture detail, what problem it solves, link]
```

---

### File: `devto-outline.md`

**dev.to article outline** — ready to flesh out into a full post.

Structure:
```
Title: {Version} of Dev-Suite is out — here's what changed and why it matters

Tags: claudecode, mcp, devtools, opensource

## Introduction (3 sentences)
## What's new in {VERSION}
### {Highlight 1}
### {Highlight 2}
### {Highlight 3}
## How to update
## What's next
```

---

### File: `awesome-list-entry.md`

**Single-line description** for awesome-list submissions:
```
[Dev-Suite](https://github.com/claude-dev-suite/claude-dev-suite) — Specialized agents, MCP servers, and a visual dashboard for Claude Code. MIT.
```

---

## Output

After generating all files, print a summary:

```
Release promo content for {VERSION} saved to docs/release-promo/{VERSION}/

Files generated:
  ✓ hacker-news.md      — Show HN post (ready to copy-paste)
  ✓ twitter-thread.md   — X thread ({N} tweets)
  ✓ linkedin.md         — LinkedIn post
  ✓ reddit.md           — r/ClaudeAI + r/devtools posts
  ✓ devto-outline.md    — dev.to article outline
  ✓ awesome-list-entry.md — one-liner for awesome lists

Posting checklist:
  □ HN: Tuesday–Thursday 9–11 ET, stay active in comments for 2h
  □ Twitter: post thread immediately after HN
  □ LinkedIn: post same day, can recycle for 48h
  □ Reddit: post to r/ClaudeAI first, r/devtools 2–3 days later
  □ dev.to: publish within the week, cross-post to Hashnode
```
