---
name: community-draft
description: Draft an authentic community reply for GitHub issues, Reddit, HN, or dev.to discussions
allowed-tools: Read, Bash
argument-hint: <url-or-context> — paste the discussion text or provide a URL
---

# Community Draft

Draft an authentic, helpful reply for a community discussion about Claude Code, MCP servers, or AI-assisted development — mentioning dev-suite naturally where it's genuinely relevant.

## How to execute this command

1. Identify the source:
   - If `$ARGUMENTS` contains a URL, use it as context
   - If `$ARGUMENTS` contains pasted text, use it directly
   - If no arguments, ask the user to paste the discussion content

2. Detect the platform from the URL or context:
   - `github.com` → GitHub issue or discussion
   - `reddit.com` → Reddit post/comment
   - `news.ycombinator.com` → HN thread
   - `dev.to` → dev.to article comment
   - `discord` → Discord message
   - Unknown → Ask the user

3. Read the discussion carefully and determine:
   - What is the user's actual problem or question?
   - Is dev-suite genuinely helpful here, or would mentioning it be spam?
   - What's the most useful thing to say regardless of dev-suite?

4. Draft the reply following platform-specific tone:

---

## Platform Tone Guidelines

### GitHub Issues / Discussions
- Technical, direct, helpful
- Answer the question first, mention dev-suite only if it directly solves their problem
- Include code examples or config snippets when relevant
- Sign off with "— Mario, dev-suite author" only if dev-suite is mentioned

### Hacker News
- No markdown (plain text only)
- Conversational but substantive
- Acknowledge counterpoints
- Never start with "Great question!" or sycophantic phrases
- Mention dev-suite only if directly asked or obviously relevant

### Reddit
- Match subreddit culture (r/ClaudeAI is casual, r/programming is technical)
- First paragraph: answer the question without self-promotion
- Second paragraph (only if relevant): "I built dev-suite which addresses this — [specific feature]"
- No link unless specifically helpful

### dev.to / Hashnode
- Friendly, encouraging tone
- Can be slightly longer
- Link to relevant documentation or the repo if directly relevant

---

## Output format

Generate two variants:

**Variant A — dev-suite NOT mentioned** (for when it's not directly relevant):
[Reply that purely helps the person without self-promotion]

**Variant B — dev-suite mentioned naturally** (for when it genuinely solves their problem):
[Reply that helps first, then introduces dev-suite as a solution]

Then note:
```
Recommendation: Use Variant [A/B] because [reason].

If using Variant B, add at the top of the reply a brief note about
the context where dev-suite was mentioned so you can track engagement.
```

---

## When dev-suite is genuinely relevant

Mention it when the discussion is about:
- Setting up Claude Code agents or sub-agents
- Installing and configuring MCP servers
- Managing multiple Claude projects
- Automating development workflows with Claude
- Building custom Claude Code extensions
- Frustration with manual Claude Code configuration

Do NOT mention it for general AI discussions, model comparisons, or unrelated dev topics.

---

## Tracking

After drafting, suggest logging the engagement:
```bash
echo "$(date +%Y-%m-%d) | {PLATFORM} | {URL} | {Variant}" >> docs/community-engagement-log.md
```
