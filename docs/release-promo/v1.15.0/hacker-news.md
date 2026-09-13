# Show HN — v1.15.0

**Post Tuesday–Thursday, 9–11 ET. Stay in the comments for the first 2 hours.**

---

**Title** (80 char limit — the first is 79):

```
Show HN: Code-review skills that only flag what your linter doesn't
```

Alternates, if the first has been tried:

```
Show HN: Dev-Suite – agents, skills and MCP servers for seven AI coding assistants
Show HN: Ruff's default rule set is narrower than its reputation, and 10 more findings
```

---

**Body:**

```
I maintain Dev-Suite, an MIT-licensed toolkit that installs specialized agents,
framework skills and MCP servers into a project for Claude Code, Copilot, Cursor,
Gemini CLI, Codex CLI, Cline or Kimi Code.

The last release added eleven per-language code-review skills, and writing them
turned out to be an exercise in subtraction. A model reviewing Go spends most of
its output re-deriving what `go vet` and errcheck already print. So each skill
carries two tables: what the toolchain reports by default, which the review must
stay silent about, and the defects that survive it.

What I got wrong before measuring:

- ruff's default rule set is E4, E7, E9, F. Mutable default arguments, naive
  datetime.now(), blocking calls in async def and shell=True are all opt-in
  families — in a project that never widened `select`, those are the reviewer's
  job, not the linter's.
- TypeScript's strictness is a setting, not a fact. noUncheckedIndexedAccess and
  exactOptionalPropertyTypes are not in `strict`, so array access lying about
  presence is invisible in most repos. The rules that catch floating promises are
  type-aware only, so they never ran unless parserOptions.project was set.
- Java's static analysis isn't narrow by default, it's absent. javac reports very
  little, and SpotBugs/ErrorProne/NullAway are build steps a plain Spring Boot
  starter doesn't have.
- Rust argues for the opposite discipline. rustc plus default clippy covers most
  of it, so the list is short: RefCell moving an aliasing error to runtime, an Rc
  cycle, a lock held across .await, unsafe whose invariant isn't written down.
  One finding is profile-dependent rather than code-dependent — overflow checks
  are on in debug and off in release, so an unsigned subtraction panics under
  cargo test and wraps silently in the binary users run.

The install side had its own constraint: everything written into your project has
to be committable. No absolute paths, no secret literals — a teammate clones the
repo and gets the same setup, and secrets stay in a per-project store outside it.

Repo: https://github.com/claude-dev-suite/claude-dev-suite

Happy to talk about the architecture — the per-assistant adapters, why AGENTS.md
is the primary file and CLAUDE.md just imports it, or the skill-loading tiers
(a declared skill's full body is injected into every subagent, which is why
almost everything is on-demand instead).
```

---

**Prepared answers for likely comments**

- *"Isn't this just prompt files?"* — Largely, yes, plus the installer that keeps them consistent across seven assistants and the MCP servers that give tools. The interesting part isn't the format, it's the tier system: a declared skill costs cache-creation tokens in every subagent spawned from that agent, measured at ~17.7k for one 41 KB skill, so the default has to be on-demand loading.
- *"Why not a plugin/marketplace?"* — Because the output has to live in the user's repo and be reviewable in a PR. Config that only exists on one machine is the problem being solved.
- *"How is this different from just asking Claude?"* — It isn't, for one file. It differs when the same project is opened by four people using four different assistants.
- *"Eleven languages by one person means shallow."* — Fair challenge. Point at the delta tables; they're checkable against each tool's own default rule set, which is exactly why every analyser reference is live-linked to the upstream index rather than copied.
