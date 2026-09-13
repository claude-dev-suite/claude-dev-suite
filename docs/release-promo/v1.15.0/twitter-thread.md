# X / Twitter thread — v1.15.0

Post immediately after the HN submission. Each tweet under 280 characters.

---

**1/8**
```
Writing code-review skills for 11 languages taught me something uncomfortable:
most of what an AI reviewer says, your linter already said.

So dev-suite v1.15.0 ships the delta instead — what survives the toolchain.

Here's what I got wrong before measuring 🧵
```

**2/8**
```
Ruff's default rule set is E4, E7, E9, F.

Mutable default args, naive datetime.now(), blocking calls in async def,
shell=True — all opt-in families.

In a project that never widened `select`, those are the reviewer's job,
not the linter's.
```

**3/8**
```
TypeScript's strictness is a setting, not a fact.

noUncheckedIndexedAccess and exactOptionalPropertyTypes are NOT in `strict`.

So array access lying about presence is invisible in most repos —
and everyone assumes `strict` covered it.
```

**4/8**
```
Java's static analysis isn't narrow by default. It's absent.

javac reports very little. SpotBugs, ErrorProne, NullAway are separate
build steps a plain Spring Boot starter doesn't have.

equals without hashCode is a review finding, not a tool finding.
```

**5/8**
```
Rust argues for the opposite discipline: review it like C++ and you
produce almost pure noise.

Short list, four places the compiler can't reach:
RefCell → runtime panic · Rc cycles · lock held across .await ·
unsafe whose invariant isn't written down
```

**6/8**
```
My favourite finding is profile-dependent, not code-dependent:

Rust overflow checks are ON in debug, OFF in release.

An unsigned subtraction panics under `cargo test` and wraps silently
in the binary your users run.
```

**7/8**
```
What dev-suite is, if you're new:

• specialized agents + framework skills + MCP servers, installed into your repo
• one install targets Claude Code, Copilot, Cursor, Gemini, Codex, Cline, Kimi
• everything it writes is committable — no absolute paths, no secrets

MIT.
```

**8/8**
```
github.com/claude-dev-suite/claude-dev-suite

There are good first issues open now — adding a skill takes ~45 min and
needs no build step. Contributions very welcome.

⭐ helps more than you'd think
```

---

Tag @AnthropicAI only in a reply, and only if a thread about MCP or Claude Code skills is
already running — never on the first tweet.
