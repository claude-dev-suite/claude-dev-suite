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
