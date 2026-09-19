# Presets

Stack presets: a named bundle of agents, MCP servers and stack settings for a common
project shape (React SPA, Go API, monorepo fullstack, …).

> **Not wired up yet.** Nothing in the dashboard, the launcher or the server reads these
> files today — they are data waiting for a consumer. The wizard's own pre-selection is
> driven by `detection.service.ts` against `registry/*.json`, not by anything here.
>
> Until a preset loader exists, treat these as design notes rather than configuration.
> There is no `/init-project <preset>` argument, and no `--quick` flag on the launcher.

Each file is one preset. Adding a file changes nothing until a loader reads this directory.

## These files have drifted, and nothing catches it

Because no consumer reads them, no CI gate validates them either. Measured on
2026-09-19 across all nine presets:

- **18 skill names resolve to no skill directory at all** — `security`,
  `database-design`, `accessibility`, `concurrency`, `async`, `memory-safety`,
  `nextjs-app-router`, `nitro`, `nuxt3`, `vue-composition`.
- **10 names are ambiguous.** Presets name skills bare (`typescript`, `java`, `go`,
  `python`, `rust`), but skills live at `{category}/{tech}` and those leaf names repeat
  across categories: `typescript` is both `languages/typescript` and `review/typescript`;
  `java` is four directories (`languages/`, `logging/`, `profiling/`, `review/`);
  `python` likewise.

Anything that starts reading this directory must therefore do two things first: resolve
bare names to full `{category}/{tech}` paths with an explicit disambiguation rule, and
fail loudly on a name that does not resolve. A loader that silently drops unresolved
names would install a preset that is quietly missing a third of its skills.

Adding a `validate-presets` gate alongside the other `scripts/validate-*.mjs` checks is
the cheap fix, and it should land **before** the first consumer, not after.
