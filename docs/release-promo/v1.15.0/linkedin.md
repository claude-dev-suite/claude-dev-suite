# LinkedIn post — v1.15.0

Post the same day as HN. Worth re-sharing for 48h.

---

```
Eleven code-review skills later, the most useful thing I wrote was a list of what
NOT to say.

An AI reviewing a Go diff spends most of its output re-deriving what `go vet` and
errcheck already printed. It reads as thorough. It is noise, and it buries the two
findings that mattered.

So in the latest release of Dev-Suite, every per-language review skill carries two
tables: what the toolchain reports by default — which the review stays silent about
— and the defects that survive it.

Three things I had wrong before I checked:

• Ruff's default rule set is E4, E7, E9, F. Mutable default arguments, naive
  datetime.now(), blocking calls inside async def and shell=True all live in opt-in
  families. In a project that never widened its selection, those are the reviewer's
  job.

• TypeScript's strictness is a setting, not a property of the language.
  noUncheckedIndexedAccess and exactOptionalPropertyTypes are not part of `strict`,
  so array access that lies about presence goes unseen in most codebases.

• Java's static analysis isn't narrow by default — it's absent. SpotBugs, ErrorProne
  and NullAway are separate build steps that a standard Spring Boot starter simply
  doesn't have.

For engineering teams the practical point is smaller and duller than the AI framing
suggests: before you evaluate any review tool, human or otherwise, find out what your
own configuration already reports. Half the value is in one line of a config file.

Dev-Suite is MIT-licensed and installs into a project for Claude Code, GitHub Copilot,
Cursor, Gemini CLI, Codex CLI, Cline or Kimi Code — everything it writes is committable,
so a teammate clones the repo and gets the same setup.

github.com/claude-dev-suite/claude-dev-suite

Happy to connect with anyone working on AI-assisted development tooling.
```
