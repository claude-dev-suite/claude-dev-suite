# Reddit — v1.15.0

r/ClaudeAI first. r/devtools 2–3 days later. Read each subreddit's self-promotion rule
before posting, and answer every comment for the first few hours.

---

## r/ClaudeAI

**Title:** `Dev-Suite v1.15.0 — review skills that stay quiet about what your linter already reports`

**Body:**

```
Dev-Suite is an MIT toolkit that installs specialized agents, framework skills and MCP
servers into a project. This release adds review skills for eleven languages, and the
design constraint was subtraction rather than coverage.

The problem: ask for a review of a Go diff and a good chunk of the output is things
`go vet` and errcheck already printed. It looks thorough, and it buries the findings that
actually needed a reader.

So each skill has two halves — a table of what the toolchain reports by default, which the
review is told to skip, and the checks that survive it. A few that surprised me:

- ruff's default rule set is E4, E7, E9, F. Mutable default args, naive datetime.now(),
  blocking calls in async def, shell=True — all opt-in.
- noUncheckedIndexedAccess and exactOptionalPropertyTypes are not in TypeScript's `strict`.
- Rust overflow checks are on in debug, off in release: an unsigned subtraction panics in
  `cargo test` and wraps silently in the shipped binary.

They're wired into the code-reviewer agent as extended skills, so they cost nothing until a
diff in that language shows up.

Repo: https://github.com/claude-dev-suite/claude-dev-suite

If something about your stack isn't covered there's a thread open for exactly that — and a
set of good first issues if you'd rather write the skill yourself.
```

---

## r/devtools

**Title:** `Per-language code review as a delta against the toolchain's default rule set`

**Body:**

```
I've been building Dev-Suite, an open-source toolkit that installs agents, skills and MCP
servers into a repo for whichever AI coding assistant the team uses (Claude Code, Copilot,
Cursor, Gemini CLI, Codex CLI, Cline, Kimi Code).

The latest release covers eleven languages for code review, and the interesting engineering
was in what to leave out.

An LLM reviewer's leverage is what the toolchain cannot say. But "what the toolchain says"
is not a language property — it's a config property, and it moves with the tool version.
So each skill states it explicitly and links the upstream index rather than copying it: a
stale copy of a rule list is worse than none, because it will disagree with the linter the
reader is actually running.

Concrete consequences:

- Python: settle ruff's `select` from pyproject.toml once rather than guess per file. The
  default is E4, E7, E9, F — far narrower than its reputation.
- TypeScript: type-aware rules never ran unless parserOptions.project is set, so a clean
  lint says nothing about floating promises.
- Java: the analysers are absent by default, not narrow — so equals/hashCode and boxed ==
  are review findings in most projects.
- Rust: the "already covered" table is long and the check list is short. Reviewing Rust
  like C++ produces noise.

Architecture note, since this is r/devtools: skills load in two tiers. A skill declared in
an agent's frontmatter has its full body injected into every subagent spawned from that
agent — measured at ~17.7k extra cache-creation tokens for one 41 KB skill — so the default
is on-demand loading through a loader server, and only the skill an agent cannot work
without on turn one is declared.

MIT: https://github.com/claude-dev-suite/claude-dev-suite
```
