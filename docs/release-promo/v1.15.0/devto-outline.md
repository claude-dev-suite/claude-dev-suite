# dev.to article outline — v1.15.0

**Title:** What your linter already told you: writing code-review skills for eleven languages

**Tags:** `codereview`, `claudecode`, `devtools`, `opensource`

**Canonical:** publish on dev.to first, cross-post to Hashnode with a canonical URL back.

---

## Introduction (3 sentences)

An AI reviewing a Go diff spends most of its output re-deriving what `go vet` already
printed. That reads as thorough, and it buries the two findings that mattered. The fix
isn't a better prompt — it's knowing precisely what the toolchain reports before you write
a word of guidance.

## The premise: a review is a delta

- What the toolchain reports is not a language property. It's a config property, versioned
  with the tool.
- Two tables per language: *already covered* (stay silent) and *survives the toolchain*
  (report).
- Why the analyser references are linked live rather than copied — a stale rule list
  disagrees with the linter the reader is running, which is the one failure mode that
  destroys trust in a review.

## What I got wrong, per language

### Python — the default rule set is E4, E7, E9, F

Opt-in families people assume are on: `B006` mutable default arguments, `DTZ` naive
datetime, `ASYNC` blocking calls inside `async def`, `S` shell=True. Settle `select` from
pyproject.toml once.

Bonus, the two failures that are silent: a coroutine never awaited warns only at garbage
collection, on stderr, at an unrelated moment; a discarded `asyncio.create_task` can be
collected mid-flight, because the loop holds only a weak reference.

### TypeScript — strictness is a setting

`noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are not in `strict`. Type-aware
rules never ran without `parserOptions.project`. What survives `tsc --strict`: `as T`
laundering an unvalidated payload, a type predicate that doesn't establish what it claims,
`Promise.all` where partial failure is normal, an `async` callback handed to `forEach`.

### Java — the analysers are absent, not narrow

javac reports little; SpotBugs, ErrorProne and NullAway are separate build steps. So:
`equals` without `hashCode`, boxed `==`, a JPA entity keyed on a generated id that is null
before persist, a `ThreadLocal` never removed on a pooled container thread, `synchronized`
around I/O inside a virtual thread.

### Rust — the case for restraint

Long "already covered" table, short check list: `RefCell` moving aliasing from compile time
to a runtime panic, an `Rc` cycle reference counting can never collect, a lock held across
an `.await`, `unsafe` whose invariant isn't written down. Plus the profile-dependent one:
overflow checks on in debug, off in release.

### SQL — the inversion

Every other language has a toolchain doing part of the work. Here the reviewer *is* the
analysis, and engine differences change what a query means: REPEATABLE READ on MySQL
against READ COMMITTED elsewhere, `UNIQUE` accepting one NULL on SQL Server and many
elsewhere, Oracle treating the empty string as NULL.

## How this loads without costing tokens

- Two tiers: declared skills are injected in full into every subagent; extended skills cost
  one round trip through the loader.
- The measurement: ~17.7k additional cache-creation tokens for one declared 41 KB skill.
- So the reviewer declares nothing per-language and loads the one matching the diff.

## Try it against your own last PR

Install into a repo, review your last merged pull request, and compare the output against
what CI already reported. A large overlap is exactly the problem the delta tables exist to
fix — and a good bug report if it persists.

## What's next

The languages not covered yet, and how to add one: the skill is a single markdown file and
the validation is two Node scripts, no build step.
