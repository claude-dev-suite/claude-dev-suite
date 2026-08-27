# Changelog

All notable changes to dev-suite are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Security

- **Two path traversals reaching destructive filesystem calls.** Custom
  agent/skill ids (`agentId`, `skillId`) were validated on the *create* path and
  nowhere else, so `DELETE /api/custom-skills/..%2F..%2Fsrc` reached a recursive
  `rmSync` outside the project and the rename path reached a `renameSync` of an
  arbitrary directory. The hook endpoints had the mirror problem: `repoPath` was
  joined onto the project without any check, and `path.join` resolves `..`
  rather than rejecting it, so hooks could be installed into or deleted from a
  repository elsewhere on disk. Both now go through one shared assertion
  (`assertValidComponentId`, `resolveRepoPath`), plus a Zod pattern at the route
  boundary so a bad id is a 400 before any handler runs.
- **SSRF: `api-tester` followed redirects unchecked.** Only the initial URL was
  validated and `fetch` defaults to `redirect: "follow"`, so a public URL
  answering `302 Location: http://169.254.169.254/…` was fetched with no further
  check. Each hop is re-validated now, matching the policy
  `performance-profiler` already applied.
- **SSRF: one guard instead of three.** The three implementations differed in
  strength — `api-tester`'s let every non-loopback IPv6 through (`fc00::/7`
  unique-local, `fe80::/10` link-local) and never decoded decimal/hex/octal IPv4
  literals, so `http://2852039166/` reached the cloud-metadata endpoint. All
  servers now use `@dev-suite/shared`, which handles both.
- **The orchestrator's MCP WebSocket accepted job submissions from anyone.**
  `dashboard-bridge` called `listen(port)` — binding `0.0.0.0` — and accepted
  connections with no token and no origin check, so any peer on the network
  could queue a job with an arbitrary `projectPath` and `agentId`. It now binds
  loopback and requires a handshake.
- **Path traversal in `fetch_docs`.** `isSafeSegment` was applied only to the
  docs-index `local` path; on an index miss the raw `technology`/`topic` tool
  arguments were returned verbatim and reached `path.join`. Both are validated
  now, and the KB cache asserts containment when building a path.
- **The interactive permission gate could not prevent anything.** It inspected
  the streamed assistant message, which the SDK emits after deciding to run the
  tool — an `rm -rf` could already have executed by the time the dialog
  appeared, and Deny only aborted what came next. It is now the SDK's
  `canUseTool` callback, consulted before each execution, whose verdict binds.
- **The Express error handler was never reached.** `createServer()` registered
  it before `registerRoutes()`/`mountFrontend()` had run, so it sat ahead of
  every route and thrown errors fell through to Express's default finalhandler,
  which serialises the stack trace into the response outside production. The M3
  mitigation was inert in the real app while its unit test, which calls the
  middleware directly, kept passing.
- **The Anthropic Admin API key is no longer left out of `.gitignore`.**
- **`backup_restore` and `export_report`** confine their write paths to
  `DB_BACKUP_DIR` / `LOG_EXPORT_DIR` when those are set.

### Added

- **`validate-catalog.mjs` gained three assertions** that would each have caught
  a shipped defect: every `agents/` directory must map to a category, every
  `model:` must be one of the three supported values, and every MCP server's
  `envVars[]` must declare what its source reads. All three metadata files that
  were under-declaring env vars have been filled in, so the gate is clean.
- **`AGENTS.md` is now generated as the primary instructions file**, with
  `CLAUDE.md` reduced to a pointer that pulls it in via Claude Code's supported
  `@AGENTS.md` import. `AGENTS.md` is the cross-assistant standard (read natively
  by Copilot, Cursor, Codex, Windsurf, Zed and others), so a dev-suite install is
  now understood by those assistants without any extra configuration, while
  routing content stays in a single source of truth. Existing installations
  migrate on the next install/sync: the routing section moves out of `CLAUDE.md`
  and is replaced by the import. User content outside the dev-suite markers is
  preserved in both files, and both are tracked in the manifest.
- **Target layout descriptors** (`services/targets/target-layout.ts`): a single
  source of truth for where each supported assistant expects its configuration
  (directories, instructions file, MCP config, settings, hooks) plus capability
  flags, so services stop hardcoding `.claude/`, `.mcp.json` and `CLAUDE.md`.
  Every supported assistant has a descriptor and a full write path — see
  `docs/planning/multi-assistant.md`.
- **Gemini CLI and OpenAI Codex CLI are now installable targets.** Selecting
  Gemini writes `.gemini/settings.json` — dev-suite's MCP servers plus a
  `context.fileName` that makes Gemini read the shared `AGENTS.md` (which it
  ignores by default). Selecting Codex writes its MCP servers as
  `[mcp_servers.*]` TOML tables in `.codex/config.toml`, merged into the file so
  the user's own tables and comments survive. Because Codex and Gemini read
  neither `.claude/agents` nor `.claude/skills`, the installer mirrors the skills
  tree to the cross-tool `.agents/skills` directory whenever a target that reads
  it is selected — so both get the full skill set.
- **Gemini gets native subagents.** Selecting Gemini now also generates a
  `.gemini/agents/<id>.md` file per installed agent, so each dev-suite agent is a
  delegatable `@`-agent in Gemini — the one target that previously got only
  AGENTS.md routing (it reads neither `.claude/agents` nor the shared substrate).
- **Cline is now an installable target.** It reads `AGENTS.md` and the
  `.claude/skills` substrate directly, so dev-suite writes its path-scoped rules
  to `.clinerules/*.md`. Cline has no committable MCP config (user-global only)
  and its file-based agents apply only to the SDK/CLI, not the VS Code extension;
  MCP, native agents and rule templates are reported as skipped capabilities
  rather than silently missing.
- **Kimi Code is now an installable target.** It reads the root `AGENTS.md`
  natively and skills from the cross-tool `.agents/skills` mirror (the same one
  Codex and Gemini use), so only two surfaces are Kimi-specific: MCP config in
  `.kimi-code/mcp.json` (JSON, `mcpServers`, merged so the user's own servers and
  HTTP entries survive) and native subagents in `.kimi-code/agents/<id>.md`. The
  agent writer never emits `override` and refuses any id that would shadow a
  Kimi built-in agent (`agent`, `coder`, `explore`, `plan`) — that combination is
  how a repository takes over Kimi's main system prompt. Kimi has no glob-scoped
  rules and no committable settings/hooks file (both are user-level
  `~/.kimi-code/config.toml`), which the adapter reports as skipped capabilities
  (logged, like every other adapter's — there is no user-facing summary channel
  yet). Because Kimi bodies are `${...}` templates, agents whose prose contains
  such sequences in code examples are reported the same way rather than silently
  rewritten. Seven assistants — Claude Code, Copilot, Cursor, Gemini,
  Codex, Cline, Kimi Code — are now selectable. Targets the current Kimi Code
  generation (`.kimi-code/`); the legacy `kimi-cli` reads `.claude/skills`
  anyway, and has no project-level MCP config at all.
- **Wizard "Target Assistants" step.** The install wizard now has a step that
  detects which AI assistants a project already uses, pre-selects the ones it
  found (falling back to Claude Code), and lets the user choose which to generate
  configuration for. The selection is sent to the install endpoint as `targets`.
  The wizard's step definitions were centralised into one module, which also
  fixed the sidebar step list that had silently fallen a step behind.
- **GitHub Copilot and Cursor are now installable targets.** `install()` accepts
  any combination of `claude-code`, `copilot` and `cursor` and writes each
  assistant's own configuration: Copilot gets `.vscode/mcp.json` and
  `.github/mcp.json` (its two MCP surfaces, with different keys and `type`
  values) plus `.github/instructions/*`; Cursor gets `.cursor/mcp.json` and
  `.cursor/rules/*.mdc`. `AGENTS.md` is written for all of them; the `CLAUDE.md`
  import pointer only when Claude Code is selected. MCP config files are merged
  with any servers the user already has, and an unparseable existing file is left
  untouched rather than overwritten. The `.claude/agents` and `.claude/skills`
  directories are written once as shared infrastructure that Copilot and Cursor
  read directly, so agents and skills are available even in a Copilot- or
  Cursor-only install.
- **Multi-target install plumbing.** `install()` accepts a `targets` list and
  runs one adapter per assistant, recording them in the manifest; the request
  schema validates targets against the set that has a working adapter, so the
  API cannot promise output it can't produce. Reinstall and its backup/rollback
  became target-aware, which fixed two latent defects: agent-file basenames now
  respect each target's extension (a hardcoded `.md` would have left `.agent` on
  Copilot ids and broken orphan detection), and the backup now captures config
  that lives outside a target's config directory (Copilot's `.vscode/mcp.json`
  would otherwise have been missed on rollback). Only Claude Code is installable
  today, so behaviour is unchanged; the plumbing is ready for the adapters.
- **Per-assistant format writers** (`services/targets/writers/`): MCP
  configuration and path-scoped agent routing, serialized into each assistant's
  own format. These are the only two primitives that genuinely differ between
  tools — Copilot and Cursor read `.claude/agents/` and `.claude/skills/`
  directly, so agents and skills need no second write. The MCP writers merge
  with any servers the user already configured rather than overwriting the file,
  and refuse to silently discard a config they cannot parse. Not yet reachable
  from the UI; the adapters that consume them land next.
- **Target adapter seam** (`services/targets/target-adapter.ts` +
  `targets/adapters/`): `install()` now resolves a tool-neutral `InstallPlan`
  without touching disk, then hands it to one adapter per target. Claude Code is
  the only implementation so far and reproduces its previous output exactly. The
  Claude-specific behaviours moved with it — flat skill directories, the native
  subagent frontmatter transform, and `skillListingBudgetFraction` — so an
  assistant that reads `.claude/` directly inherits none of them.
- **Target path resolver** (`services/targets/target-paths.ts`): turns a layout
  descriptor into the concrete paths of one project, in both project-relative
  POSIX form (what the manifest stores, so entries compare across platforms) and
  absolute form (what filesystem calls need). Every path dev-suite writes now
  derives from the descriptor instead of a hardcoded literal. Behaviour is
  unchanged for Claude Code — the resolver reproduces exactly the paths written
  before.
- **Manifest target tagging**: `.dev-suite-manifest.json` records which
  assistants a project was installed for (`targets`), and every tracked file
  carries a `target`, so several assistants can share one project without
  reinstall/erase crossing between them. Manifests written before this release
  are attributed to `claude-code` automatically when read.

- **Generated agent documentation.** `scripts/gen-capability-matrix.mjs` and
  `scripts/gen-agents-reference.mjs` render `docs/AGENT-CAPABILITY-MATRIX.md` and
  README's Agents Reference from agent frontmatter, via a shared reader
  (`scripts/agent-catalog.mjs`) that expands `bundle:` references and verifies every
  skill path exists. Both hand-written surfaces had drifted badly: the capability
  matrix was wrong in every column (13 of 16 sampled skill names did not exist),
  the README tables were missing 12 of 63 agents and three whole categories, and
  both derived MCP access from the `mcp_servers:` field alone — which only 13
  agents use, the rest declaring it through `mcp__<server>__*` in `allowed-tools`.
  Both scripts run with `--check` in CI.
- **`scripts/check-docs-sync.mjs`** — a CI gate asserting that prose matches the
  machine-readable source: the wizard step count against `steps.ts`, the target
  assistants against `IMPLEMENTED_TARGETS` and the adapter registry, the MCP server
  list against the npm workspaces, and the launchers against the server's `main`.
  Three of the ten worst findings in the coherence audit were exactly this drift.
- **`validate-catalog.mjs` now also checks** that every `metadata.json` `tools[]`
  holds strings, that it matches the tools the server registers with `ListTools`,
  and (as a warning) that every `process.env.X` a server reads is declared in
  `envVars[]`.
- **The three output-filter hooks are documented.** `filter-test-output`,
  `filter-lint` and `truncate-logs` shipped in `templates/hooks/` and
  `CLAUDE_OUTPUT_FILTER_HOOKS` but appeared in no markdown file;
  `docs/HOOKS-REFERENCE.md` now covers what each intercepts, what survives, and the
  token saving.

- **`scripts/validate-frontmatter.mjs` — frontmatter validity check, run in
  CI.** Parses every frontmatter block under `agents/`, `commands/` and
  `skills/` with `gray-matter` (the same parser the dashboard uses at runtime),
  and fails on YAML that does not parse, on missing `name` / `description`, and
  on keys whose type doesn't match the documented one — the `argument-hint`
  array above included. `scripts/validate-catalog.mjs` could not catch this
  class of bug: it reads frontmatter with a line-oriented regex that accepts
  YAML a real parser rejects, and it only walks `agents/`.

### Changed

- **A per-project lock serialises every operation that rewrites the manifest.**
  install, reinstall and the Manage tab's add/remove all run the same
  read-plan-write sequence with the manifest written last, and nothing prevented
  two of them overlapping. The lock is re-entrant, since reinstall and the Manage
  operations delegate to `install()`.
- **Incremental upgrades refuse a project that does not target Claude Code.**
  Every path in `registry/features.json` is a `.claude/…` literal and nothing in
  that engine consults the project's targets.
- **New `@dev-suite/shared` workspace.** `mcp-servers/shared/` previously held
  build output with no source and no consumers, which is why the guards meant to
  live there were duplicated instead — three SSRF implementations and five copies
  of the file-path check. It holds the source now, and the servers import it.
- **`InstallManifest` in the client contract now describes what the route
  actually returns.** It declared `files: string[]` plus `directories`,
  `devSuiteVersion` and `envVarsAdded` — fields no service has ever produced — so
  `check-type-sync` kept two copies of a fiction perfectly in sync with each
  other while `manifest.skipped` never reached the UI.
- **`validate-catalog` now cross-checks the hand-maintained tables against the
  filesystem**: `STACK_TO_AGENTS`/`STACK_TO_MCP` against the real catalog, and
  `bundle:` references and their contents against `skills/**`, which it skipped
  outright before. It caught the `nuxt-expert` reference on its first run.
- **Copilot's second MCP surface (`.github/mcp.json`) lives in the layout
  descriptor** instead of being hardcoded in four modules, so
  `sharedConfigCoverage()` — the gate whose job is catching exactly that — can
  finally see it.
- **`.dev-suite-analytics/` and `.dev-suite-live.json` are declared** in the
  generated `.gitignore` block. They are written after an install by processes
  the pipeline does not own, and belonged to no list at all.
- **A request-scoped logger is now a real Winston child.** `createChildLogger`
  built a whole new logger — a Console plus four rotating file transports plus
  two process listeners — on every HTTP request.

- **Instruction generation deduplicated.** `management.service` had its own copy
  of the CLAUDE.md section builder that diverged from the installer's: it emitted
  the older flat routing layout and was the only one that sanitized agent
  descriptions. Both now use the installer's implementation, so regenerating
  after adding/removing a component produces the same output as a fresh install,
  and description sanitization (which strips constructs that could forge section
  markers or inject prompts) applies on every path.
- **Updates tab simplified to a single update mechanism.** The incremental
  feature-upgrade UI (available-updates list, 3-way conflict detection/resolution,
  selective apply, and upgrade history) was retired in favour of a version panel
  (installed-in-project vs. available-from-source) on top of the transactional
  **Reinstall / Sync** flow, which fully re-aligns a project to the current source
  (backup + rollback, orphan removal, per-file Overwrite/Keep opt-out). The
  now-unused `UpdateCard`, `ConflictModal`, `UpgradeHistoryList`, and `DiffViewer`
  components were removed.

- **`README.md` and `CLAUDE.md` rewritten where they described a world that no
  longer exists**: the Generated Files list was Claude-only and wrong in both
  directions for the other six adapters (now split into always-written and
  per-target); the install wizard was documented as 5 steps when it has 7, omitting
  Rules and Assistants; "Quick Mode" and "Non-Interactive Mode" documented
  `--quick` / `--non-interactive` flags that no launcher parses, and are replaced
  by the headless reinstall CLI that does exist; the `.dev-suite.json` example
  showed stack, git and hook data the file has never contained; the Linux download
  names matched no artifact electron-builder produces; CLAUDE.md's architecture
  tree pointed at `registry/frameworks.json` and `scripts/lib/metadata-parser.sh`,
  neither of which exists; its agent frontmatter example used bare skill names and
  the obsolete flat `skills:` field; and its Service Map misdescribed rows and
  omitted four `installation/` modules. The `121+ technologies` literal, which
  violated the repo's own Anti-Staleness Rule at five sites, is gone.
- **Documentation consolidated.** Six overlapping logging documents became two
  colocated ones (`src/utils/logger.README.md`, `src/middleware/README.md`);
  `LOGGER_MIGRATION.md`, `LOGGING.md`, `LOGGING_SUMMARY.md` and
  `LOGGING_EXAMPLE.md` are removed. Both documented a `LOG_DIR` variable nothing
  reads and a `/api/health` endpoint that is served at `/health`.
  `SECURITY_FIX_PATH_TRAVERSAL.md` no longer inlines a copy of the fix — that copy
  had drifted to a weaker `startsWith` boundary check than the shipped code, which
  is how a fixed vulnerability comes back. Completed plans and version-pinned
  campaign copy moved to `docs/archive/`.
- **`presets/`** is marked as unwired: nine JSON files that no code reads, backing
  a documented `/init-project <preset>` argument that was never implemented.

### Fixed

- **20 documentation topics paid for a KB lookup that could never succeed.**
  Their index entries named a `local` file the knowledge base does not have — in
  every case an article the KB simply never wrote, with the real content already
  reachable under another topic key, so there was nothing to repoint them to. Git
  mode sparse-checked-out the directory anyway, failed, logged
  `[KB] Git fetch failed, falling back to live:` and served the upstream `url` —
  the right answer, at the cost of a wasted checkout and an error line on every
  request. `DocEntry.local` is now optional and says the same thing by absence:
  `fetch_docs` skips git mode for a known topic that declares none, and an
  unindexed topic still tries the key-derived path. Verified against the live KB
  with `scripts/audit-kb-index.mjs`: real mismatches 0, orphans 0, unreachable 0.
  One behaviour change: `list_topics` in git mode no longer enumerates a KB
  directory for `server-performance` and `server-hardening`, whose fake `local`
  pointed into `linux/` and made them answer with the articles `linux-server`
  owns. (#117)
- **An install deleted the user's own MCP servers from `.mcp.json`.** The Claude
  Code adapter was the only one that wrote its MCP config without merging, while
  `uninstall.ts` lists that same file under `SHARED_CONFIGS` and un-merges it
  key by key. The two halves of the lifecycle disagreed about who owned the file
  and the install side won, by deletion. It merges now, like every other target.
- **Every reinstall and every Manage-tab add/remove erased accumulated state.**
  `features`, `upgradeHistory` and `detectedStack` were rebuilt empty on each
  install, so the integration-validator hook stopped being configured, the API
  Integration Validation section vanished from `AGENTS.md`, and applied upgrade
  features were forgotten. An omitted `detectedStack` now means "unchanged".
- **Rule files for non-Claude assistants were recorded under the wrong target,**
  which excluded them from drift detection, from the per-file "keep my version"
  opt-out and from the target-scoped backup. The `.agents/skills` mirror was
  likewise recorded as `codex` even in a Gemini- or Kimi-only project.
- **A lost manifest silently downgraded a project to Claude Code,** rewriting
  `CLAUDE.md` and `.mcp.json` into a project that had deliberately opted out of
  both. The assistant selection is now recorded in `.dev-suite.json` too, and
  consulted before that assumption.
- **`AGENTS.md` promised slash commands to assistants that cannot run them,** and
  listed two while installing roughly a dozen. The section is now
  Claude-Code-only and derived from the command catalog.
- **`AGENTS.md` told Codex and Cline to delegate with `@id`,** which they cannot
  do: `anyTargetLoadsAgents` answered on the paths a layout *declares* rather
  than on what dev-suite actually writes. Codex declares `.codex/agents`, but its
  format is TOML and dev-suite emits none.
- **Adding or removing an MCP server bypassed the whole target layer.** It copied
  the bundle by hand, ran `npm install` (which the installer never does — bundles
  are self-contained), and rewrote `.mcp.json` directly. In a Cursor- or
  Gemini-only project that wrote a config no selected assistant reads, left the
  real one untouched, and recorded nothing in the manifest, so uninstall could
  not remove it. It delegates to a full resync now, as add/removeAgent already did.
- **The Usage panel reported $0 regardless of real spend** (the `{success,data}`
  envelope was cast straight to the payload), **could never save its
  configuration** (it posted `path` where the schema requires `projectPath`), and
  **always claimed no API key was configured** (it read a write-only field the
  server deliberately never returns). Editing a threshold also silently deleted
  the stored credential.
- **The KB Analytics panel read fields that do not exist** (`stats`/`items`/
  `totalPages` against the route's `entries`/`total`/`offset`/`limit`), sent
  filter names the route ignores, never fetched the stats endpoint that populates
  its own filters, and posted "Clear Data" with no body.
- **Nine API calls used relative URLs,** which resolve against `file://` in the
  packaged renderer: empty logs, empty Add-Agent and Add-MCP modals, ignored
  documentation uploads. They worked in development through the Vite proxy.
- **The Setup Wizard was unreachable after installation** — the redirect effect
  depended on `currentPanel` and bounced the user straight back — which removed
  the only route to adding a second assistant target.
- **The Hooks tab entered an infinite render loop** as soon as
  `/api/hooks/status` answered: `useGitHooksForm` returned a fresh object each
  render, and an effect that sets state depended on it.
- **The detected stack was lost between `/api/detect` and `/api/install`.** The
  two endpoints disagree on casing and the schema is `.passthrough()`, so
  `meta_framework` and `db_type` were carried along unnoticed while the camelCase
  reads produced `undefined`: the manifest recorded `db_type: ''`, the validator
  hook matched the wrong stack, and no Next.js project was ever considered
  compatible with a Next.js feature.
- **Degraded capabilities were computed and never shown.** The install pipeline
  reports what each assistant could not receive; nothing rendered it, so a user
  installing for Cline or Codex was never told.
- **Accepted generated code landed in the wrong directory.** The output-dir
  de-duplication compared only the last segment of `outputDir` against the first
  of the file path, so the default `src/generated` produced
  `src/generated/src/generated/…`.
- **Scaffolded projects contained the template's own `files/` directory** instead
  of its contents.
- **`templates/`, `rules/` and `commands/` were not packaged into the Electron
  build,** so the Rules step and the Template panel were empty in every release
  while working in development. `templatesDir` also resolved by counting
  directories up from `__dirname`, a layout that only holds in a checkout.
- **A rollback left the `.gitignore` edit behind** while logging "the project is
  unchanged".
- **`POST /api/uninstall` answered `success: true` and discarded `errors`,** so a
  partial uninstall was indistinguishable from a clean one.
- **A finished job released an execution slot it no longer owned,** leaving two
  jobs running after `force_unstick`, one of them uncancellable.
- **Sub-task outputs were keyed by agent id,** so a plan using the same agent
  twice fed the wrong text to the next step.
- **`STACK_TO_AGENTS` recommended `nuxt-expert`,** an agent that has never
  existed, so a detected Nuxt project got no frontend recommendation at all.
- **The Updates panel compared two identical constants** and showed "Up to date"
  permanently; **new-component discovery called a URL that does not exist** and
  swallowed the 404, so the "N new" badge never appeared.

- **Token analytics no longer invents a cost.** It multiplied token counts by a
  per-model price table compiled into `analytics.service.ts` and stored the
  product on each record — a fabricated figure, frozen into history, that went
  stale the moment a rate changed. It *was* stale: the table still carried 2025
  prices. Real spend already has a real source, `usage.service.ts`, which reads
  `token_cost_usd` / `total_cost_usd` from the Anthropic Admin API cost report —
  amounts actually billed. The price table, the `costUsd` field, the aggregated
  `totalCostUsd`, the "Estimated Cost" stat card and the pricing disclaimer are
  all removed; the panel reports tokens (measured) and points at the Usage panel
  for money. The two cannot be merged: the Admin API bills per model and
  workspace and does not attribute spend to an individual agent, skill or MCP
  tool, which is the axis this panel groups by.
- **`tests/orchestrator.security.test.ts` tested nothing.** The production import
  was commented out and the file defined its own `validateProjectPath` — "a mock
  implementation matching the actual logic" — so 343 lines and 30+ assertions ran
  against a copy that could not detect drift in the real thing. The comment
  explaining why ("since it's not exported") was itself stale: the logic had been
  refactored into the exported `ValidationService`. The suite now exercises that
  service against real directories, and two of its cases had to be rewritten
  because `path.join` collapses `..` before the guard ever sees it — building a
  traversal fixture that way tests Node's normaliser, not the guard.
- **Every installed skill violated the Agent Skills spec.** Flattening renames
  `frontend-frameworks/react` to a single directory, but `SKILL.md` was copied
  byte-for-byte, so `name: react` sat inside `frontend-frameworks-react/` — and
  the spec makes the name matching its parent directory a MUST. 35 of 35
  directories in a real install were wrong, including in the `.agents/skills`
  mirror that is the only skills path Codex, Gemini and Kimi read. The name is
  now rewritten to the flattened value after the copy.
- **Skill directories never reached the manifest.** `trackManifestFile` hashes
  the path and skips what it cannot read, so a directory raised EISDIR and was
  dropped silently — which is why the `.agents/skills` mirror had no removal
  path at all. Directories are tracked explicitly now (`trackManifestDir`).
- **The Manage tab wrote only the Claude Code substrate.** `addAgent` /
  `removeAgent` / `addMcpServer` / `removeMcpServer` never called an adapter, so
  adding an agent to a Gemini install left `.gemini/agents/` untouched and the
  skills mirror stale: the dashboard reported it installed while it did not
  exist in Gemini. Removing one left `.cursor/rules/frontend.mdc` still
  recommending a deleted agent. They now delegate to a scoped re-install that
  runs every adapter — which also stops the Manage tab creating a `CLAUDE.md` in
  a project deliberately installed without Claude Code.
- **Reinstall's `verify()` was tautological.** It iterated the *new* manifest, so
  a component that failed to install was never tracked and therefore invisible —
  a reinstall that had just erased it reported success. It now checks the
  selection: every selected agent must have produced an agent file and every
  selected MCP server its bundle.
- **Reinstall wiped API keys in any project without a `.mcp.json`.** Env vars and
  the skill-loading mode were recovered from Claude Code's config alone, so a
  Cursor- or Gemini-only project came back with `{}` and every value the user had
  entered in the wizard was silently lost. Recovery now reads every selected
  assistant's config, including Codex's TOML.
- **Capability degradations never reached the user.** Every adapter's `skipped`
  list ended in a single `logger.info` and reached neither the API response, the
  manifest, nor the UI — so the contract that says nothing is dropped silently
  was, in practice, silent. They are returned on the manifest and persisted.
  Codex did not even build a list (it ignored `plan.rules` entirely), and
  Gemini/Kimi blamed the wrong feature ("no glob-scoped rules") while reassuring
  about something that was not dropped.
- **Deselecting an agent left an orphaned, still-invocable native subagent.**
  `.gemini/agents/<id>.md` and `.kimi-code/agents/<id>.md` were written per id
  and never pruned, and the manifest is rebuilt from scratch — so `@qa-expert`
  stayed live forever and no removal path could see it. Pruning is scoped to what
  the previous manifest recorded, never a directory wipe.
- **Seventeen agents never got a path-scoped rule file.** Six of the fifteen
  directories under `agents/` had no entry in `categoryMap`, so mobile, cloud,
  data, gamedev, industrial and bitcoin agents fell through to `core` — which is
  always-on. The token-cost reduction path-scoped rules exist for was inverted
  for exactly the categories with the longest descriptions. `validate-catalog.mjs`
  now fails if a directory has no category.
- **Rule files were neither reconciled nor tracked.** `installedRuleFiles` was
  *assigned* on each install rather than merged, so a rule file a later install
  no longer wrote vanished from the record while staying on disk, unreachable by
  any removal path. They are now diffed against the previous install and removed,
  and recorded in `manifest.files` so reinstall's preview can see a local edit and
  the per-file "keep my version" opt-out can protect it.
- **`validatePathWithinBase` canonicalized only the leaf.** A symlinked
  *intermediate* directory redirected every write underneath it: a junction at
  `<project>/.claude` sent 23 files outside the project with no error. It now
  canonicalizes the deepest existing ancestor, and refuses a path it cannot
  canonicalize rather than trusting it. The unguarded `mkdir` sinks in
  `substrate.ts` go through it too.
- **`removePathScopedRules` used a bare `startsWith` on the raw string**, so
  `.claude/rules/../../../x.md` passed and resolved outside the project — the
  only remaining barrier being a marker every dev-suite rule file on the machine
  carries, which is to say rule files in the user's *other* projects. It resolves
  first and compares after, with separators normalised so Windows is not silently
  exempt.
- **Wizard credentials were committable and unmentioned.** The env values a user
  types are written verbatim into up to seven config files, two of which teams
  routinely commit, and the local backup directories hold copies. A marked
  `.gitignore` block now covers both; it is deliberately not tracked in the
  manifest, since `.gitignore` is the user's file — uninstall strips only the
  block.
- **The file viewer served MCP configs while hiding assistant directories.**
  `.env` was denied while `/api/files/read?file=.cursor/mcp.json` returned the
  same credential verbatim, and only `.claude` was whitelisted, so a
  multi-assistant install was largely invisible in the tree. Every assistant
  directory is now listed, and every MCP config is on the secret deny-list.
- **`acceptFiles` flattened every generated path** with `path.basename`, so a Go
  server previewed as `models/models.go` + `handlers/handlers.go` +
  `routes/routes.go` landed in one directory with three different package
  clauses — `go build` fails outright. The relative structure is preserved,
  traversing segments are rejected explicitly, and the containment check still
  bounds the result.
- **`POST /api/upgrade/install-agent` could not find six agent categories**: it
  hardcoded nine of the fifteen directories. The list is read from disk now.
- **Re-applying a hook-merge feature appended a duplicate** instead of replacing
  the entry with the same matcher, so the prompt fired twice per event.
- **An MCP config could be silently discarded.** Valid JSON of an unexpected
  shape (`[…]`, `null`, a string, or a non-object under `servers`) fell through
  to `{}` without throwing, so the adapters' skip-and-report branch never fired.
  It now raises `McpConfigParseError` like any other unusable file. A UTF-8 BOM —
  the Windows default, on a product that ships a Windows desktop app — made every
  merge refuse the file with a misleading "not valid JSON"; it is stripped before
  parsing and not re-emitted.
- **A stale `_README.md` survived an eager re-install**, still instructing the
  model to call a `skill-loader` server that mode does not install, and its
  "runtime requirement" paragraph claimed `DEV_SUITE_ROOT` was set in `.mcp.json`
  (it is not), named Claude Code's config even for a Cursor-only install, and
  baked the installing machine's absolute path into a project file — pointing it
  at a directory without `skills/` makes the server throw on startup. The index
  is removed before each install, rewritten only in lazy mode, and mirrored to
  `.agents/skills` so the assistants that read only the mirror can see it.
- **The mirror stopped being a mirror** when a re-install dropped the
  agents-reading target, leaving stale skills that Copilot, Cursor and Cline still
  read. It is reconciled either way, removing only folders dev-suite marked.
- **A pre-existing directory occupying a flattened skill name silently suppressed
  that skill**: the name still landed in the agent's frontmatter while nothing
  resolved it, and `cleanStaleSkills` never cleared a directory without a
  `SKILL.md`, so it could not self-heal.
- **`previewReinstall` could not report a deleted managed file** — it hashed to
  null and fell through both branches, so the reinstall recreated it with no
  mention. **Reinstall backups accumulated unboundedly** inside the project,
  each holding a copy of the user's credentials; the three most recent are kept.
- **The wizard tab was hidden once anything was installed**, so there was no way
  to add an assistant afterwards — a Cursor user who later adopted Codex had to
  uninstall to reach the step. A non-array `targets` in the manifest threw an
  uncaught TypeError out of assistant detection and hard-blocked the wizard.
  `selectedAssistants` was not reset when the project path changed, carrying one
  project's choice into another. `Step5Install` discarded the server's error and
  showed a fixed string.
- **Dev-suite's own substrate made every project self-detect as Claude Code**:
  `.claude` is written for every install whatever the targets, so any project it
  had touched looked like a Claude Code project on the next run. Markers
  dev-suite writes itself are ignored once a manifest exists.
- **`AGENTS.md` promised things six assistants cannot do**: slash commands
  (`.claude/commands` is Claude-Code-only), `@agent` delegation to Codex and
  Cline, which load no agent files at all, automatic glob activation for targets
  with no glob mechanism, and an API-validation hook only Claude Code runs. Each
  is now written only when it applies. Deselecting Claude Code left a legacy
  routing section in `CLAUDE.md`; it is stripped.
- **Cursor `.mdc` `globs:` still opened with `*`** for 7 of 12 categories,
  because reordering cannot help when every glob starts with one. The value is
  quoted when it does.
- **`model:` was never parsed.** It is on every agent file and drives real cost,
  but `parseAgent` ignored it, so nothing downstream could display or check it —
  and a custom agent with an unrecognised value validated as OK and *displayed*
  as sonnet, making a typo invisible. Both are fixed, and `validate-catalog.mjs`
  now rejects a `model:` that is not sonnet, opus or haiku.
- **Uninstalling no longer deletes the user's own files.** `uninstall()` unlinked
  every entry in `manifest.files`, and multi-assistant support newly put the files
  dev-suite *merges into* on that list. Uninstalling therefore deleted hand-written
  `AGENTS.md` prose, `.codex/config.toml` (model, comments, `[tui]`),
  `.gemini/settings.json` (theme and the user's own MCP servers), `.cursor/mcp.json`
  and `.claude/settings.json` permissions outright — with `errors: []`, no backup,
  and reported as success, contradicting the command's own documented list of what
  it preserves. A file dev-suite merged into is now un-merged instead of deleted:
  its own entries come out, everything else is written back, and the file is
  removed only when nothing of the user's is left in it
  (`installation/uninstall.ts`).
- **Uninstalling no longer destroys `custom/` agents and skills.**
  `.claude/agents` and `.claude/skills` were removed with
  `rmSync({recursive:true})` and no guard, taking every dashboard-authored custom
  agent and skill with them — while the CLI printed "directories removed when empty
  of user content". Both trees are now walked file by file: only what the manifest
  or an ownership marker attributes to dev-suite is removed, parents are pruned
  bottom-up when empty, and `custom/` is never touched.
- **A manifest path can no longer point outside the project.** The unlink loop did
  `path.join(projectPath, filePath)` with no `..` check, so a manifest listing
  `../../.ssh/authorized_keys` deleted that file and reported it in `removed[]`.
  Every path is now bounds-checked, and a rejected entry is reported as an error
  rather than silently skipped.
- **The cross-tool `.agents/skills` mirror is removed on uninstall**, which it never
  was — the whole tree was left behind. Only folders carrying dev-suite's ownership
  marker go: reference doc section 2.2 makes that directory shared ground with
  Copilot, Cursor, Codex, Gemini, Kimi and Devin.
- **Re-installing no longer deletes skills dev-suite did not write.**
  `cleanStaleSkills` inferred ownership from "this folder contains a SKILL.md",
  which is equally true of a skill the user wrote, and the same rule ran over
  `.agents/skills`. Dev-suite now writes a `.dev-suite-owned` marker into each skill
  directory it materialises and removes only marked ones; directories recorded in a
  manifest written before markers existed are still recognised, so upgrading does
  not strand stale skills (`installation/skill-ownership.ts`).
- **A rule id can no longer escape the rules directory.** `rules` is
  `z.array(z.string())` with no pattern and the id was interpolated straight into
  both the source lookup and the destination, so `rules: ['../../README']`
  overwrote a project's README.md with dev-suite's — reachable without any crafted
  request, because `reinstall.service.ts` reads the id list back out of the
  project's own `.dev-suite.json` during a Sync. The id is now validated at the
  sinks (`isValidRuleId` in `rules.service.ts`), the destination is bounds-checked,
  and the Sync path filters the list.
- **A failed install rolls back instead of leaving a half-installed project.**
  `install()` wrote with no snapshot and writes the manifest last, so a throw
  part-way through the adapter loop left files on disk with no record of them —
  `.mcp.json` overwritten to `{"mcpServers":{}}`, `.claude/` and `.mcp-servers/`
  populated — while `getStatus()` reported "not installed" and the dashboard
  offered the wizard again. The write phase now snapshots every surface it may
  touch and restores it on failure (`installation/write-guard.ts`), the same
  discipline `reinstall.service.ts` already had. `InstallConfig.createBackup`
  turns it off for the reinstall flow, which has already taken its own backup.
- **Writers no longer overwrite an agent or rule file the user wrote.**
  `.gemini/agents/<id>.md`, `.kimi-code/agents/<id>.md`, `.claude/agents/<id>.md`
  and the path-scoped rule files were written unconditionally, replacing a
  hand-written prompt with no backup and no report — and then recording it as
  dev-suite's, so a later uninstall deleted what had been the user's file. Gemini
  and Kimi are the sharp cases: detection pre-selects them precisely because those
  directories already exist. A file is now replaced only when the previous manifest
  recorded it, and a preserved file is reported as a skipped capability
  (`installation/managed-file.ts`).
- **Codex TOML merge: a comment on a table header no longer corrupts the file.**
  `isTableHeader` required the line to end with `]`, so `[mcp_servers.mine]  # my
  server` was not recognised as a header: the user's table was absorbed into the
  section above it and deleted along with it — silently, because the output was
  still valid TOML, and by default, since dev-suite appends its tables last. An
  annotated *managed* header had the mirror-image bug, producing a duplicate table
  that TOML forbids, so Codex would load none of the project config while the
  adapter logged success.

- **Five commands are no longer dropped by strict frontmatter parsers.**
  `argument-hint` was written with bare brackets, which YAML does not read as
  the documented string: `[project-path]` parses as the array
  `["project-path"]` (`init-project`, `uninstall`, `uninstall-dev-suite`),
  while `[--quick] [--verbose]` and `[version] — e.g. ...` are a flow sequence
  followed by trailing content — invalid YAML that makes the *entire*
  frontmatter block throw, taking `name`, `description` and `allowed-tools`
  down with it (`health-check`, `release-promote`). Claude Code tolerated both
  shapes, so this stayed invisible until GitHub Copilot CLI ≥1.0.65 tightened
  its type check and silently stopped listing the commands. All five values are
  now quoted. Reported and fixed by @thejesh23 in #112 / #113.
- **Documentation MCP server: git-mode now reaches KB content that lives under a
  different path than its record keys.** `fetch_docs`/`list_topics` previously
  rebuilt the KB path from the `{technology}/{topic}` record keys, ignoring the
  index `local` field. When the knowledge base stores a topic elsewhere (e.g.
  technology `bitcoin-consensus` → `bitcoin/protocol/consensus/overview.md`),
  git-mode looked in the wrong place, failed, and silently degraded to live HTML
  scraping. Path resolution now derives the KB directory and file from `local`
  (new `resolveKbCoords`/`resolveKbDir` helpers, with traversal guards), falling
  back to the key-derived path when `local` is absent. This makes ~526 additional
  (technology, topic) pairs — whole domains such as `bitcoin-*`, most `rag-*`,
  and `gamedev-2d-art-*` — serveable from the KB instead of via live scraping,
  raising git-mode reachability from ~40% to ~85% of indexed pairs.
- **Documentation MCP server: repointed 10 dead upstream doc URLs** (the ones with
  no KB fallback either — `gin`, `echo`, `fresh`, `nx`, and the OWASP JWT
  cheatsheet used by `jwt`/`cryptography`) to their web-verified current pages, so
  those live-only topics resolve again. Full audit in `docs/kb-audit-2026-07.md`.

- **The documented browser entry point now works from a clean clone.**
  `init-project.sh`, `init-project.ps1` and `/ui-wizard` all launched
  `configurator/dashboard/server.cjs`, a file that has never existed in this
  repository and that no build produces — both launchers exited 1 and the slash
  command died with `MODULE_NOT_FOUND`. They now launch the server's real entry
  point (`server/dist/index.js`) and build the server and UI on first run.
  Because the Express app was a pure JSON API that never served HTML (the Electron
  shell loads the Vite bundle itself with `loadFile`), the browser flow was
  missing its other half too: a new `server/src/frontend.ts` serves the built SPA
  with a client-side-routing fallback, or an explanatory 503 when the UI has not
  been built. `scripts/check-docs-sync.mjs` now fails CI if a launcher ever again
  points at something the build does not produce.
- **The Windows MCP setup script built 4 of the 11 servers.**
  `scripts/setup-mcp-servers.ps1` hardcoded a four-name list while its bash twin
  derived the list from the npm workspaces, so Windows users routed there by
  `init-project.ps1` were left with seven servers that had no `dist/index.js` —
  including `skill-loader`, which is always required. It now reads the workspaces
  the same way.
- **The MCP tool-description CI gate was passing on data that violated it.**
  `scripts/audit-mcp-descriptions.mjs` required the opening quote on the same line
  as `description:`, so every multi-line field was silently skipped: it reported
  "Over limit, NOT justified: 0" while 19 descriptions across six servers exceeded
  120 characters with no justification. The extractor now reads the whole string
  expression (multi-line templates and `+` concatenation included), and all 19
  descriptions have been shortened — 280 fields are measured, up from 235.
- **The uninstaller removed nothing and reported success.** Both
  `commands/uninstall-dev-suite.md` (an embedded script) and
  `scripts/uninstall-dev-suite.sh` parsed manifest shapes that have never existed
  — a line-based `grep -oP` over a pretty-printed JSON array of objects in one,
  `.actions.files_copied[]` in the other. Manifest parsing now lives with the code
  that writes the manifest: a new headless CLI
  (`npm run uninstall -- --project <path> [--dry-run] [--json]`) calls the same
  `InstallationService.uninstall()` the dashboard uses, and both documented entry
  points are thin wrappers over it. This replaces roughly 800 lines of shell.
- **Slash commands were never installed, but uninstall deleted the directory.**
  `installCommands()` now writes the project-facing `commands/*.md` into
  `.claude/commands` when Claude Code is a target (maintainer-only release and
  community commands excluded), tracked in the manifest. `relCommandsDir` has been
  removed from uninstall's recursive `dirsToRemove`, so a user's own commands in
  that directory survive — dev-suite's are removed individually, the way rule
  files already were.
- **`/sync-dev-suite` documented backups it does not make.** The command claimed
  it "creates backups before modifying files"; only `.mcp.json` is backed up,
  while agents, skills and commands are overwritten with a plain `cp`, and step 1
  runs an undocumented `git reset --hard` on the dev-suite checkout. The doc now
  states both plainly, lists the real nine steps, and points at
  `/reinstall-dev-suite` for anyone with local edits.
- **Cline silently discarded selected rule templates.** Its adapter never
  inspected `plan.rules`, unlike every sibling adapter, so a Cline install dropped
  them with no degradation report. It now reports `rule-templates` as skipped.
- **Four adapter and writer file headers contradicted the code below them** — the
  Gemini adapter denied writing the native subagents it writes, the Kimi adapter
  claimed skipped-capability reports it never pushes, and the Gemini subagent
  writer cited Cursor's section of the format reference instead of Gemini's.
- **`registry/features.json` declared a `matcherBuilder` that nothing dispatches.**
  Three hook features named a builder function that does not exist and is never
  called, so applying them wrote a matcher-less `SubagentStop` hook. They now carry
  an explicit `matcher`, and the dead field is gone from `HookMergeConfig`.
- **MCP metadata corrections**: `code-quality`'s `tools[]` shipped
  `{name, description}` objects where the type is `string[]` (the dashboard
  rendered them as `[object Object]`); `documentation` did not declare its
  `list_docs` tool; and `api-explorer` declared no env vars at all despite reading
  `API_EXPLORER_ENDPOINTS` — with `envVars: []` the wizard never prompted for it,
  so the server shipped inert while its README documented a configuration
  mechanism that did not exist.
- **API caching doc**: `useApi(..., { cache: false })` is a TypeScript error —
  `UseApiOptions` omits `cache`; the option is `useCache`. The debug-logging
  instruction (`localStorage.setItem('debug', '*')`) does nothing; the frontend
  logger enables `debug` from `import.meta.env.DEV`.
- **Launcher Node floor** raised from 18 to 20 in both scripts, matching the
  documented prerequisite.
- **CHANGELOG hygiene**: an Updates-tab entry filed under `[1.12.0]` describes a
  change that landed after that tag and was already recorded under `[Unreleased]`;
  it has been removed. `[1.9.0]` is marked as never tagged — only `v1.9.0-rc.1`
  was published.

### Tests

- Regression suites for each tier of the audit: `audit-2026-tier0.test.ts`
  through `tier4`, plus `src/__tests__/audit-2026-tier1.test.tsx` and
  `App.wizard-redirect.test.tsx` on the client, and per-server suites under
  `mcp-servers/*/tests/`.
- **Fixtures that could not detect the bug they covered were corrected.** The
  templates fixture placed files at the template root rather than under `files/`,
  which is why it could not see that the prefix was never stripped.

## [1.12.0] - 2026-07-02

### Fixed

- **External links now work in the packaged Electron app.** The preload script
  exposes `electronAPI.openExternal` (backed by a new `open-external` IPC handler
  that validates URLs against the https allowlist), and `setWindowOpenHandler`
  routes allowlisted URLs to the system browser instead of silently denying
  everything. `console.anthropic.com` was added to the allowlist so the Usage
  panel's "Add Credits" / "Enable Extra Usage" / API-key links open correctly.

### Added

- **`scripts/validate-catalog.mjs` — component-catalog consistency check, run
  in CI.** Validates that every MCP workspace has a complete `metadata.json`
  (including `detectedWhen`), that `package.json` versions match the
  `new Server()` version literals, that `recommendedFor` / agent-frontmatter
  `skills` / `mcp_servers` references resolve, and that `registry/*.json`
  parses with existing `$schema` refs. It already caught and fixed: a broken
  `frontend/react` skill reference in `code-reviewer`, version drift in 5 MCP
  servers, missing `detectedWhen` in 6 metadata files, and the missing
  `registry/features.schema.json`.

### Changed

- **`codegen.service.ts` split by target-language family** (2,010 → ~500
  lines). Code generators now live in
  `server/src/services/codegen/` (`typescript.ts`, `java.ts`, `python.ts`,
  `go.ts`, plus `spec-parser.ts`, `targets.ts`, `shared.ts`); the service file
  keeps only the `CodeGenService` class with an unchanged public surface.
  Pure move-refactor, no behaviour change.

- **Shared API-contract types are now kept in sync and enforced in CI.** The
  hand-maintained duplicate type files between `src/types/` (frontend) and
  `server/src/types/` had drifted (stale `ChatMessagePayload`, missing
  `isDefault` on `McpServer`, lost JSDoc, and more). Eight contract file pairs
  (`agents`, `api`, `core`, `git`, `mcp`, `orchestrator`, `reinstall`,
  `release`) are realigned to the runtime-verified shape, marked with a
  `KEPT IN SYNC` header, and checked byte-for-byte (modulo ESM import
  extensions) by the new `scripts/check-type-sync.mjs` in CI. Side-specific
  files (`custom-agents`, `templates`, `upgrade`) are documented as
  intentionally different.

- **GitHub auth flow extracted into `GitAuthService`**
  (`configurator/dashboard/server/src/services/git/git-auth.service.ts`). The
  ~126-line inline `/auth-login` handler and its module-level mutable state in
  `git.routes.ts` now live in a dedicated, unit-tested service (process
  lifecycle, one-time-code parsing, status polling, cancel/cleanup). Concurrent
  `/auth-login` calls no longer race: a second call joins the in-flight login
  and receives the same one-time code instead of killing and respawning the
  `gh` process. Observable API behaviour is otherwise unchanged.

- **CI now enforces what it builds:** `ci.yml` typechecks and builds the
  frontend (`tsc && vite build`), runs the MCP-server workspace test suites
  (previously local-only, including the SSRF/ReDoS security suites), and also
  triggers on direct pushes to `main` (previously pull requests only).
  `log-analyzer` uses `--passWithNoTests` until it gets its first suite.

### Removed

- Repository housekeeping: removed the orphaned `mcp-servers/shared/` package
  (never in the npm workspaces, imported by nothing, yet bundled into the
  Electron build), dead files in `server/src/services/`
  (`orchestrator.service.ts.old`, two leftover `.sh` scripts), and the tracked
  runtime `.dev-suite.json` (forbidden by the repo rules). `.gitignore` now
  covers `*.prt` agent-test artifacts and the bundled `node-x64/` runtime.

### Security

- **PR-CI-surfaced fixes** (first run of MCP tests + CodeQL over the moved
  codegen code): `getDiffForReview` now enforces string type, `..` barrier,
  containment, and realpath canonicalization on `repoPath` before using it as
  a spawn cwd; the codegen YAML-fallback regexes were rewritten linear-time
  (polynomial backtracking on untrusted spec content).

- **Second hardening round — gaps found re-auditing the first pass:**
  - **`benchmark_code` Java runtime now honours the raw-code gate** (it had no
    `PERF_PROFILER_ALLOW_RAW_CODE` check and ran arbitrary Java by default).
  - **SSRF guards now block IPv6 and encoded-IP bypasses** (`::ffff:` IPv4-mapped,
    `fc00::/7` ULA, `fe80::/10` link-local, and decimal/octal/hex IPv4 forms) across
    performance-profiler, api-tester, database-query, and the dashboard
    `live-performance` route; DB-URL validation now fails closed on DNS-resolution
    failure, and redirects are re-validated per hop.
  - **`explain_query` now runs inside a `READ ONLY` transaction** (EXPLAIN ANALYZE
    previously executed statements with no read-only wrapper).
  - **Dashboard server:** `/api/files/read` denies secret files
    (`.dev-suite/usage-config.json`, `.env*`, `*.pem`, `*.key`, `id_*`); path
    containment compares with a trailing separator (no sibling-dir escape);
    git stage/unstage/discard use a `--` end-of-options separator; the permission
    prompt times out to **deny** (was allow); `deepMerge` blocks prototype-pollution
    keys; request-log redaction matches by substring incl. URL query params;
    `mcp-suggestions`/`analyze-mcp` validate input; CSP drops `'unsafe-inline'`
    from `script-src`; production server build emits no sourcemaps.
  - **CI:** remaining workflows (`ci.yml`, `codeql.yml`, `e2e.yml`) pin all
    third-party actions to commit SHAs.
  - The misleading dead symlink-escape check in `validateScriptPath` was removed;
    `security-scanner` container scans reject leading-dash targets.

- **Hardening pass across MCP servers, dashboard server, frontend, Electron, and
  CI** (follow-up to the June 2026 audit):
  - **performance-profiler `benchmark_code` no longer executes attacker-controllable
    raw code.** The bypassable regex blocklist was removed; the tool now takes a
    validated `scriptPath` by default, with raw-code execution gated behind an
    opt-in `PERF_PROFILER_ALLOW_RAW_CODE=1` flag. `runCommand` was converted from
    `exec()` (shell) to `execFile`/argv (no shell) across all profilers.
  - **SSRF guards added** to performance-profiler (`profile_endpoint`,
    `replay_flow`, `stress_test`) and database-query (`compare_schemas`,
    `generate_migration` reject private-range / metadata DB URLs and redact
    credentials). `validateScriptPath` now requires absolute paths and resolves
    symlinks; api-tester file-read tools validate paths.
  - **security-scanner** ReDoS-guards user-supplied `excludePaths`; **docker-manager**
    bounds the `tail` parameter.
  - **Dashboard server:** Anthropic admin API key is masked in `GET /usage/config`
    and added to log redaction; `Host`-header validation middleware blocks DNS
    rebinding; the `gh auth` flow and code-review/management git calls use
    `shell:false`; `addMcpServer` runs `npm install --ignore-scripts`; Zod
    validation and size/limit caps applied to git, management, orchestrator, and
    logging routes; Claude hook commands validated before write.
  - **WebSocket auth** moved from the URL query string to a first-message `auth`
    handshake (token no longer leaks to logs/history), with a 5s auth timeout.
  - **Frontend:** production sourcemaps disabled; `window.open`/`openExternal`
    gated behind an `https`-only allowlist helper.
  - **Electron:** `shell.openExternal` restricted to an `https` host allowlist;
    unused `versions` preload surface removed; CSP rationale documented.
  - **CI:** bundled Node.js download verified against `SHASUMS256.txt`; all
    third-party GitHub Actions pinned to commit SHAs; `community.yml`
    `pull_request_target` jobs owner-guarded.

### Fixed

- **Uninstalling from the full-screen Manage modal now returns to the install
  wizard.** Uninstall correctly reset state and navigated back to the setup
  wizard when triggered from the Manage *tool window*, but the full-screen
  **Manage** modal mounted `ManagePanel` without an `onUninstall` handler, so
  uninstalling there left the modal open on a now-empty panel. The modal now
  wires the same handler — it closes itself, clears `isInstalled`, returns to
  the wizard (step 1), and invalidates the API cache.

- **MCP servers no longer break on install when `npm` is unavailable.**
  Installed servers previously shipped as unbundled `dist/index.js` files with
  bare imports, relying on a post-copy `npm install --omit=dev` in the target
  project to fetch runtime dependencies. That step is network/`npm`/PATH
  dependent and failed silently inside the packaged Electron app (where
  `process.execPath` is the Electron binary, not Node, and the GUI process PATH
  often lacks `npm`), leaving servers whose `.mcp.json` entry crashed with
  `ERR_MODULE_NOT_FOUND`. Each MCP server is now built into a **self-contained
  esbuild bundle** at dev-suite build time — every third-party dependency is
  inlined, so the copied server needs nothing but Node. The install /
  reinstall flow no longer runs `npm install` for MCP servers at all.

### Changed

- **MCP server build is now an esbuild bundle, not `tsc` emit.** Each server's
  `build` script type-checks with `tsc --noEmit` and then bundles
  `src/index.ts` into a single self-contained `dist/index.js`
  (`mcp-servers/scripts/bundle.mjs`). The bundler is **fail-loud**: it inspects
  esbuild's metafile and fails the build if any non-builtin dependency is left
  external (the only allowed externals are optional native add-ons —
  `bufferutil`, `utf-8-validate`, `pg-native` — that `ws`/`pg` degrade
  gracefully without). This guarantees new or updated components that pull in
  new dependencies have them bundled at build time; install / reinstall /
  upgrade on the user's machine never touch npm for MCP servers.

### Security

- **Hardened shell/command-injection surfaces and input validation across the
  backend and MCP servers** (security audit remediation):
  - Git-hook generation no longer writes user-supplied `script` or
    `protectedBranches` verbatim into executable `.git/hooks/*` files. The hook
    install schema dropped its `.passthrough()` and now validates per-hook
    config: custom scripts are restricted to a safe-character allowlist and
    branch names go through `validateGitRef` (plus single-quote escaping in the
    generated script as defense-in-depth).
  - The `code-quality` MCP server now validates every tool's arguments with Zod
    (previously raw `as unknown as` casts) and spawns all language linters with
    `shell: false` (was `shell: true`), so metacharacters in a `filePath` can no
    longer be interpreted by a shell.
  - The `documentation` MCP server's KB fetcher uses `execFile` with argument
    arrays instead of `exec` string interpolation, and validates
    `KB_REPO_BRANCH` against a safe pattern (falls back to `main`).
  - The `database-query` MCP server wraps every query in a read-only Postgres
    transaction (`SET TRANSACTION READ ONLY`) so writes are rejected at the
    engine level regardless of the SELECT-prefix text check.
  - The npm package-installer spawns with `shell: false` (Windows-safe `.cmd`
    resolution), closing a CMD-metacharacter injection path.
  - The `live-performance` URL probe extends its SSRF blocklist to IPv4-mapped
    IPv6, ULA (`fc00::/7`), link-local (`fe80::/10`) and unspecified addresses
    (loopback remains intentionally allowed and is now documented).
  - `files/read` resolves symlinks with `realpathSync` before the containment
    check, blocking symlink escapes out of the project root.
  - Error responses never include stack traces; the raw error message is only
    surfaced with the explicit `DEV_SUITE_DEBUG_ERRORS=true` opt-in.
  - WebSocket token comparison uses `crypto.timingSafeEqual`.
  - The release-check service only exposes a `releaseUrl` that starts with
    `https://github.com/`, and the dashboard banner re-validates the scheme —
    closing an open-redirect / `javascript:` vector on API-sourced URLs.
  - `getDevSuiteDir()` is consolidated into a single validated helper (three
    copies previously skipped the `DEV_SUITE_DIR` existence/absolute/traversal
    checks). Silent hash-read failures now log; `saveManifest` throws on write
    failure; stray `console.warn` calls moved to the structured logger; native
    `alert()` dialogs replaced with the in-app toast system; file-content
    preview runs Shiki output through DOMPurify as defense-in-depth.

## [1.11.0] - 2026-06-02

### Fixed

- **Splash logo clipped at the top.** The Electron splash window was 520×400, but
  with the project-path selector visible the content (logo + tagline + 4 steps +
  path selector + version) needs ~490px. Because the container centers its content
  vertically with `overflow: hidden`, the overflow spilled off the top and cropped
  the "Dev-Suite" wordmark. Increased the splash window height to 520px so the full
  content fits while staying centred (`electron/main.cjs`).

### Added

- **GitHub release update alert.** The dashboard now checks the latest published
  GitHub release of dev-suite and compares it against the running version
  (`package.json`), showing a dismissible "Update available: vX.Y.Z" banner in
  the header when a newer release exists. Backend endpoint
  `GET /api/release-check` (new `release-check.service.ts`) queries
  `releases/latest` for `claude-dev-suite/claude-dev-suite` — unauthenticated
  (public repo), using `GH_TOKEN`/`GITHUB_TOKEN` only if present, with a 1h
  in-memory cache, a 5s timeout, and graceful degradation on network/rate-limit
  errors. Suppressed inside the packaged Electron app (the native auto-updater
  already covers app updates) and dismissible per version; fills the gap in
  web/dev where the Electron updater does not run.
- **Erase-and-replace reinstall/sync.** A new transactional way to bring an
  installed project back in line with the current dev-suite source, replacing
  the incremental upgrade engine for component sync (which only covered
  `hook-merge`/`agent-replace` and had no orphan removal). It scopes its erase
  to manifest-tracked *managed* files (agents, MCP servers, rules) and
  re-installs from `.dev-suite.json`, so it removes orphaned/renamed components,
  while preserving user content: custom agents/skills under `custom/`, user text
  in `CLAUDE.md` (outside the dev-suite markers), and user keys in
  `.claude/settings.json`. Locally modified managed files are surfaced in a
  preview with a per-file **Overwrite / Keep** opt-out. The whole operation is
  wrapped in a backup + automatic rollback on failure, and a post-install verify
  (tracked files exist, `.mcp.json` has absolute server paths). Surfaced via a
  new **Reinstall / Sync** tab in the dashboard Updates view
  (`ReinstallPanel` + `useReinstall`), a `POST /api/reinstall/{preview,execute}`
  API, a headless CLI (`npm run reinstall -- --project <path> [--dry-run|--yes|--keep …]`),
  and a `/reinstall-dev-suite` slash command.
- **`cleanStaleSkills` now preserves the reserved `.claude/skills/custom/`
  folder** (previously any top-level skill dir containing a `SKILL.md` — including
  user `custom/` skills — was wiped on every install/reinstall).
- **Multi-domain architect.** The `architect` agent was reworked from a
  web/enterprise-biased agent into a domain-agnostic one. It now runs a
  "Step 0 — Domain routing" protocol (classify the request's domain, then
  discover + load the relevant skills via `skill-loader`/`Skill` before
  designing) and uses a small domain-agnostic `core_skills` + on-demand
  `extended_skills`.
- **`systems/` skill pack** — low-level / systems architecture domains the
  catalog lacked: `os-kernel-architecture`, `embedded-rtos`,
  `systems-networking`, `storage-engines`, `distributed-consensus`,
  `virtualization`, `hardware-aware-design`, `data-intensive`,
  `security-architecture`.
- **`ai-systems/` skill pack** — AI-integrated systems architecture (decision
  layer): `edge-inference`, `inference-serving-topology`, `hybrid-edge-cloud`,
  `ai-hardware-selection`, `model-gateway-routing`, `agentic-architecture`.
- **Generalized vertical architecture skills** (engine-agnostic counterparts of
  existing domain-specific packs): `systems/distributed-ledger` (from
  `bitcoin/*`), `systems/cyber-physical` (from `industrial/*`),
  `systems/game-engine-architecture` (from `gamedev/unity-*`).

### Fixed

- **Installed agents now use Claude Code's native subagent frontmatter, so tool
  restrictions and skill preload actually take effect.** Previously the
  installer copied agents verbatim, leaving dev-suite's `allowed-tools:` field
  (which Claude Code ignores for subagents — they silently inherited *all*
  tools) and path-style `skills:` entries (which don't match the flattened skill
  directories, so preload was skipped with a "skill not found" warning). The
  installer now rewrites each `.claude/agents/*.md` at install time into native
  `tools:` + `mcpServers:` + flat `skills:` via a new `toInstalledAgentContent`
  transform, and installs skills as flat top-level dirs in both eager and lazy
  modes. Verified end-to-end against Claude Code 2.1.158: subagents are now
  restricted to their declared tools, preload their core skills without
  warnings, and reach their MCP servers (incl. `skill-loader`) at runtime.

## [1.10.0] - 2026-05-18

Minor release — adds water-treatment domain expertise to dev-suite. New
`membrane-expert` agent for Reverse Osmosis (RO), Nanofiltration (NF), and
Electrodeionization (EDI) processes, backed by six knowledge skills covering
the full diagnostic chain: pretreatment → fundamentals → NF distinct
selectivity → troubleshooting → autopsy → economics/EDI. First domain-vertical
agent in dev-suite (previous industrial agents were DCS/PLC engineering only).

### Added

- **membrane-expert agent** — Reverse Osmosis and EDI process expert (Sonnet)
  for water treatment, desalination, ultrapure water, and pharmaceutical WFI.
  Covers ASTM D4516 KPI normalization (NPF, NSP, NDP), fouling/scaling
  diagnostics, CIP planning, integrity testing, SEC/LCOW economics, EDI
  sizing with FCE, and regulatory citation (ASTM, ISO, USP, Ph. Eur., WHO,
  EN, SEMI). Bilingual IT/EN. Filed under `agents/industrial/`.
- **Six new industrial skills** backing the agent:
  - `industrial/membrane-ro-fundamentals` — formulas, standards reference,
    vendor design windows (DuPont, Hydranautics, Toray, Suez, LANXESS),
    water chemistry, EDI quick reference, IT/EN glossary
  - `industrial/membrane-troubleshooting` — diagnostic frame of reference,
    fouling taxonomy, scaling by mineral species, integrity loss, CIP
    decision matrix, ASTM D4516 trend-based diagnostics, baseline schema
  - `industrial/membrane-economics-edi` — SEC/LCOW benchmarks, lifecycle
    decision matrix, EDI fundamentals + FCE, 8 EDI failure modes, EDI vs
    Mixed-Bed DI economics, pharma UPW/WFI regulatory context
  - `industrial/membrane-pretreatment` — pretreatment chain architectures
    (SWRO open/beach well, BWRO well/surface, tertiary reuse), KPI targets
    (SDI, turbidity, AOC, Fe/Mn), coagulation chemistry, antiscalant
    selection, SBS dechlorination + the oxidant paradox, biocide strategy
  - `industrial/membrane-nf` — Nanofiltration distinct from RO/UF: DSPM-DE
    rejection mechanism, IEP-driven pH selectivity tuning, vendor matrix
    (NF270/NF90/NF200/NF245, Suez DK/DL/HL, Toray SUL, Pentair tubular),
    applications (softening, NOM removal, offshore sulfate, mining, dairy,
    OSN), per-ion rejection tracking
  - `industrial/membrane-autopsy` — autopsy decision matrix, sampling and
    preservation protocol, lab method suite (visual, weight-loss, dye test
    per ASTM D6908, SEM/EDS, FTIR, biofilm characterization, Fujiwara
    chlorine confirmation, cross-section), findings-to-action interpretation,
    warranty claim workflow (open RMA before pulling element)

### Changed

- README "Industrial Automation Agents" section renamed to "Industrial
  Agents" to host both DCS/PLC automation and water-treatment process
  expertise.

## [1.9.0] - 2026-05-14 (never tagged — only `v1.9.0-rc.1` was published; these changes shipped in 1.10.0)

Minor release — Dev-Suite Dashboard is now published as a native
installer for **Windows, macOS (Apple Silicon + Intel), and Linux
(AppImage / .deb / .rpm)**. The previous workflow only produced a
Windows `.exe`. Existing users see no behavioural change; new platforms
gain a one-click installer flow.

### Added

- **Cross-platform release artifacts** — every tagged release now ships:
  - Windows: NSIS `Setup-x.y.z.exe` (x64) + blockmap + `latest.yml`
  - macOS: `arm64.dmg` and `x64.dmg` + blockmaps + `latest-mac.yml`
  - Linux: `AppImage`, `.deb` + `latest-linux.yml` (RPM postponed — see Notes)
- **Multi-platform GitHub Actions matrix** — `release.yml` runs on
  `windows-latest`, `macos-latest`, and `ubuntu-latest` in parallel.
  A new `clean-assets` job runs first to strip stale artifacts.
- **`Desktop App Downloads` section in README** — per-platform install
  steps including unsigned-build mitigations (SmartScreen "Run anyway"
  on Windows, right-click → Open / `xattr -d com.apple.quarantine` on
  macOS, AppImage `chmod +x` and FUSE 2 fallback on Linux).
- **Platform-aware Node.js bundling** — `extraResources` now uses
  `node-${arch}` so per-arch Node distributions can coexist; the macOS
  build packs both `arm64` and `x64` binaries in the same run.
- **System Node.js detection on startup** — the Electron app now probes
  the user's PATH for `node` after the splash screen and, if missing,
  shows a warning dialog with a direct link to nodejs.org. Without a
  system Node, Claude Code cannot spawn the MCP servers listed in
  `.mcp.json`, so the dialog prevents silent failures users would
  otherwise blame on dev-suite. The app still opens (user can dismiss
  the warning) but the message makes the dependency explicit.

### Changed

- **`electron/main.cjs` path resolution** — five helpers
  (`findBundledNode`, `findServerPath`, `findSplashPreload`,
  `findSplashHtml`, `findPreload`) now use `process.resourcesPath` and
  pick `node.exe` vs `bin/node` based on `process.platform`. Required
  for macOS, where resources live under `.app/Contents/Resources/`
  rather than `./resources/`.
- **`CLAUDE.md` release checklist** — extended from 9 to 11 steps to
  reflect multi-platform CI: local rebuild is now an optional Windows
  smoke test, CI publishes the full asset set, and pre-release `rc.N`
  tags are documented for risky releases.

### Notes

- Installers are **unsigned**. macOS users must approve via right-click
  → Open or strip the quarantine flag on first launch. Windows users
  see a one-time SmartScreen prompt. Code signing / Apple notarization
  is planned for a follow-up release.
- **RPM target temporarily disabled.** `rpmbuild` fails when fpm passes
  the productName "Dev-Suite Dashboard" (with space) as the spec
  package name, and fpm swallows rpmbuild's stderr. The AppImage runs
  natively on Fedora/RHEL/openSUSE so users on RPM distros are still
  covered. RPM can be re-enabled later by setting `linux.executableName`
  or shipping a custom spec template.

## [1.8.2] - 2026-05-10

Patch release — eliminates the Claude Code *"N skill descriptions
dropped"* warning on dev-suite installs by promoting the `skill-loader`
MCP server to a built-in capability, introducing a tiered skill schema
on agent frontmatters, and auto-tuning the project's
`skillListingBudgetFraction`. Existing projects continue to work
unchanged; re-installing the dev-suite picks up the new behaviour
automatically.

### Added

- **Tiered skill schema on agent frontmatters** — agents can now declare
  two separate lists:
  - `core_skills:` — always preloaded under
    `.claude/skills/<flat-name>/SKILL.md` (Level 1 description budget).
  - `extended_skills:` — not preloaded; reachable on demand via the
    `skill-loader` MCP server (`list_skills`, `load_skill`).
  Legacy `skills:` is still accepted; when present without
  `core_skills:`, the first 3 entries are treated as core
  (`LEGACY_SKILLS_CORE_CAP`) and the rest fall through to extended.
  This protects Claude Code's Level 1 budget when an unmigrated agent
  declares 20+ skills (e.g. `spring-boot-expert`).

- **`skill-loader` is now a built-in** — `isDefault: true` in its
  `metadata.json` causes the install pipeline to auto-include it
  regardless of user wizard selection, and `Step3McpServers.tsx`
  renders a non-interactive *"Always installed"* badge instead of a
  checkbox. Lazy mode becomes the default for any install where
  `skill-loader` is present. Explicit `skillLoadingMode: 'eager'`
  (`@deprecated`) is preserved as a documented escape hatch.

- **`skill-loader` self-bundles its skills catalog** — a `prebuild`
  step (`scripts/copy-skills.mjs`) syncs `dev-suite/skills/` into the
  package's own `skills/` directory, which is shipped both inside the
  Electron installer (via `extraResources`) and into per-project
  `.mcp-servers/skill-loader/` copies. The server self-resolves at
  runtime to its own bundled catalog, so projects are fully portable
  across machines without `DEV_SUITE_ROOT`. The env var remains a
  documented dev-time override against a live `dev-suite/skills/`.

- **Auto-tuned `skillListingBudgetFraction`** — install pipeline writes
  `0.05` (5%, ~100 descriptions of headroom) into the project's
  `.claude/skills/settings.json` if no value is set. Costs ~10K tokens
  per session (trivial vs ~200K context). User-set values are
  preserved unchanged.

- **Stale skill cleanup on re-install** — `.claude/skills/` is scrubbed
  of dev-suite-managed folders (any subfolder containing a `SKILL.md`)
  before the install populates it, so eager→lazy transitions and
  changes to selected agents don't accumulate orphan descriptions.
  Top-level non-skill files (e.g. user's `NOTES.md`) are preserved.

- **Top-10 heaviest agents migrated to the new schema** — `rag-expert`,
  `sysadmin-expert`, `ux-expert`, `mongodb-expert`,
  `creative-frontend-expert`, `electron-expert`,
  `spring-boot-integration-test-expert`, `windows-driver-expert`,
  `svelte-expert`, `react-expert`. Each declares ≤ 3 individual
  `core_skills`; bundles are exclusively in `extended_skills`.

### Changed

- **`installAgentLazy()` preloads only `core_skills`** (or, for legacy
  agents, the first 3 entries of `skills:`). Extended skills stay in
  the dev-suite catalog and are fetched on demand by `skill-loader` at
  runtime, drastically reducing the `.claude/skills/` footprint.
- **`.claude/skills/_README.md`** rewritten to describe the new
  *core preloaded vs. extended on-demand* model.
- **`installAgent()` (eager mode)** now correctly expands `bundle:<id>`
  references via the shared parser (regression fix: before this
  release, bundle entries were silently dropped in eager mode because
  `parseAgentSkills` used a non-bundle-aware regex).
- **Three duplicate `parseAgentSkills` implementations consolidated**
  into a single `parseAgentSkillsStructured()` in
  `installation/file-operations.ts`. `agents.service.ts`,
  `installation.service.ts`, and `management.service.ts` share the
  same parser (line-by-line, comment-tolerant, bundle-expanding).
- **`Step3McpServers.tsx`** banner copy updated: tiered skill loading
  is now described as built-in, not as something the user enables.

### Fixed

- **`skill-loader.load_skill` honors `disable-model-invocation`** —
  skills tagged this way were already filtered out of `list_skills`
  but could still be loaded by guessing the path. The loader now
  checks the frontmatter and rejects the load.

### Tests

- Three test files extended:
  `configurator/dashboard/server/tests/installation/file-operations.test.ts`
  (parser cap, explicit `core_skills:` bypass, bundle expansion in
  both tiers), `tests/installation.service.test.ts` (auto-include of
  `isDefault` MCP servers, eager bypass, stale cleanup, settings.json
  budget write/preserve/merge), `tests/agents.service.test.ts`
  (`coreSkills`/`extendedSkills`/`isDefault` shape).
- New `mcp-servers/skill-loader/tests/lib.test.ts` — 44 unit tests
  covering `parseFrontmatter` (CRLF, multi-line `|`, malformed),
  `firstSentence`, `resolveSkillPath` (traversal + absolute escape),
  `buildSkillIndex` (filters, sort, fallback names), `loadSkillBody`,
  `loadQuickRefBody` (path-separator rejection), and `resolveSkillsDir`
  (env override vs bundled fallback).
- `configurator/dashboard/server/tests/test-utils.ts` —
  `createMockSkillLoader()` helper for auto-include scenarios.

### Modified files

- `mcp-servers/skill-loader/` — `metadata.json` (`isDefault: true`,
  optional env), `src/index.ts` (uses `lib.resolveSkillsDir`),
  `src/lib.ts` (new pure-function library, ~250 lines), `package.json`
  (`prebuild` script + test scripts), `scripts/copy-skills.mjs`
  (skills sync), `tests/lib.test.ts` (new).
- `configurator/dashboard/server/src/types.ts` — `Agent.coreSkills`,
  `Agent.extendedSkills`, `McpServer.isDefault`, `@deprecated 'eager'`.
- `configurator/dashboard/server/src/services/installation/file-operations.ts`
  — `parseAgentSkillsStructured()`, `LEGACY_SKILLS_CORE_CAP`.
- `configurator/dashboard/server/src/services/installation.service.ts`
  — `cleanStaleSkills()`, `ensureSkillBudget()`, auto-include of
  `isDefault` MCP servers, `installAgentLazy` preloads only core.
- `configurator/dashboard/server/src/services/agents.service.ts` —
  uses shared parser, surfaces `isDefault`, no longer auto-prefills
  `DEV_SUITE_ROOT`.
- `configurator/dashboard/server/src/services/management.service.ts`
  — duplicate `parseAgentSkills` removed.
- `configurator/dashboard/src/components/wizard/Step3McpServers.tsx`
  — checkbox replaced by *"Always installed"* badge for built-ins;
  auto-select on mount.
- `configurator/dashboard/src/types/mcp.ts` — `McpServer.isDefault`.
- `configurator/dashboard/package.json` — `extraResources` filter
  includes `skill-loader/skills/**`.
- `agents/{data/rag,infrastructure/sysadmin,frontend/ux,
  database/mongodb,frontend/creative-frontend,frontend/electron,
  testing/spring-boot-integration-test,backend/windows-driver,
  frontend/svelte,frontend/react}-expert.md` — split into
  `core_skills` + `extended_skills`, ≤ 3 individual cores per agent.
- `.gitignore` — `mcp-servers/skill-loader/skills/`.

## [1.8.1] - 2026-05-06

Patch release — fixes a regression where the orchestrator chat would fail
with `Claude SDK execution error (subtype: error_during_execution): No
conversation found with session ID: ...` after switching projects in the
dashboard.

### Fixed

- **Orchestrator chat: stale cross-project session resume** — the
  dashboard persisted the chat session ID in `localStorage` under a
  single global key (`orchestrator_session_id`), so opening the
  dashboard for project B after using project A would re-send the
  stored session ID with `resumeSession: true`. The Claude Agent SDK
  stores sessions per-CWD under `~/.claude/projects/<encoded-cwd>/`,
  so resume across projects always failed with "No conversation found".

  The `localStorage` key is now scoped per project
  (`orchestrator_session_id::<projectPath>`), and a one-shot migration
  removes the legacy unscoped key on first launch. The state hook also
  re-reads the stored ID when `projectPath` changes within the same
  dashboard instance, so switching projects no longer leaks a session
  ID across boundaries.

  **Modified files**:
  - `configurator/dashboard/src/components/orchestrator/session-storage.ts`
    — new helper module (`getSessionStorageKey`, `readStoredSessionId`,
    `writeStoredSessionId`, `clearStoredSessionId`,
    `migrateLegacySessionKey`).
  - `configurator/dashboard/src/components/orchestrator/hooks/useOrchestratorState.ts`
    — accepts `projectPath`, uses the helper, and re-initializes
    `chatSessionId` when `projectPath` changes.
  - `configurator/dashboard/src/components/orchestrator/OrchestratorPanel.tsx`
    and `hooks/useSlashCommands.ts` — every previous
    `localStorage.{get,set,remove}Item('orchestrator_session_id')`
    callsite now goes through the scoped helper.

- **Defensive fallback for invalidated sessions** — when the SDK
  returns the `No conversation found with session ID` error during a
  resume attempt (e.g. session was manually deleted or expired), the
  server now emits a dedicated `chat_session_invalidated` WebSocket
  event and the client clears the scoped `localStorage` entry plus the
  in-memory `chatSessionId`. The user gets a friendly "starting fresh
  — please resend your message" notice instead of the raw SDK error.

  **Modified files**:
  - `configurator/dashboard/server/src/types/orchestrator.ts` and
    `src/types/orchestrator.ts` — new `chat_session_invalidated`
    message type and `ChatSessionInvalidatedPayload`.
  - `configurator/dashboard/server/src/services/orchestrator/chat-session.service.ts`
    — detects the SDK error string when `resume` was set, clears
    `state.sessionId`, broadcasts `chat_session_invalidated`, and
    surfaces a localized warning instead of the raw stack trace.
  - `configurator/dashboard/src/components/orchestrator/hooks/useOrchestratorWebSocket.ts`
    — handles the new event and exposes
    `onChatSessionInvalidated(sessionId, reason)`.
  - `configurator/dashboard/src/components/orchestrator/OrchestratorPanel.tsx`
    — wires the callback to clear stored state in this project.

## [1.8.0] - 2026-05-06

Sprint 5 release — token-cost optimization Phase 1 + lazy skill loading + 3
new mobile agents + skill-loader MCP server + token analytics dashboard +
output-filter hook templates.

### Changed

- **Lazy skill loading — hybrid native + MCP discovery**:
  When `skill-loader` is selected, the installer now copies the skills
  *referenced by the selected agents* into `.claude/skills/<flat-name>/SKILL.md`
  so Claude Code's built-in Skills auto-discovery picks up only their
  YAML descriptions at boot (bodies stay on-demand, per the official
  progressive-disclosure model). All other dev-suite skills remain reachable
  on demand through the `skill-loader` MCP server (`list_skills` /
  `load_skill`), with zero boot cost.

  **Why**: previous lazy mode emitted a single `.claude/skills/index.md`
  that Claude Code does not auto-load — discovery had to be model-driven
  via `list_skills`. The new hybrid keeps boot context minimal (only the
  ~30–80 skills relevant to the chosen agents are visible at boot) while
  preserving native discoverability for the agents' core skill set.

  **Modified files**:
  - `configurator/dashboard/server/src/services/installation.service.ts` —
    `installAgentLazy()` now copies referenced skills under flattened names,
    handles flat-name collisions with a hash suffix, and the lazy README
    documents the dual mechanism.
  - `configurator/dashboard/server/src/services/installation/file-operations.ts`
    — new `flattenSkillName()` helper enforcing Claude Code's naming rules
    (lowercase, digits, hyphens, max 64 chars) with a hash-truncation
    fallback for over-length paths.
  - `configurator/dashboard/src/components/wizard/Step3McpServers.tsx` —
    info banner reworded to describe the hybrid model.

  **Replaces**: `.claude/skills/index.md` with `.claude/skills/_README.md`
  (leading underscore prevents Claude Code from mistaking the file for a
  skill folder).

  **Tests**: lazy-mode tests in `installation.service.test.ts` updated;
  new `tests/installation/file-operations.test.ts` covers the flatten
  helper (10 tests).

### Added

- **Sprint 5 — Token cost optimization Phase 1.3 (skill bundle resolver)**:
  Agent YAML frontmatter can now declare skill bundles that expand to many
  skill paths at load time, compressing heavy frontmatters without losing
  any skills at install time.

  **New file**: `configurator/dashboard/server/src/services/agent-bundles.ts`
  — exports `BUNDLES: Record<string, string[]>` (15 bundle definitions,
  covering 7 RAG groups and 7 infra groups) and `expandBundleEntry()`.

  **Modified**: `parseAgentFile()` in `agents.service.ts` now uses a
  line-by-line parser (replacing the single-regex approach) that tolerates
  YAML comment lines in skill lists, then expands `bundle:<id>` entries and
  deduplicates the final list. Plain skill lists (all other agents) are
  completely unaffected.

  **Converted agents**:
  - `agents/data/rag-expert.md` — 95 skills / 109 frontmatter lines → 11 bundles
    + 6 explicit skills / 19 lines (83% frontmatter reduction)
  - `agents/infrastructure/sysadmin-expert.md` — 56 skills / 56 frontmatter
    lines → 7 bundles + 14 explicit skills / 22 lines (61% reduction)

  **Tests**: 12 new tests in `agents.service.test.ts` covering bundle
  expansion, mixed bundle+explicit, deduplication, unknown-bundle graceful
  degradation, and backward compatibility of plain skill lists.

### Changed

- **Sprint 5 — Token cost optimization Phase 1.1 (model routing)**:
  Per-agent model recalibration based on dedicated research + 11 empirical
  benchmarks. Final distribution: 50 sonnet / 8 opus / 3 haiku (was 56/5/0).

  **Promoted to Opus** (5 agents — high-stakes specialized domains):
  - `agents/backend/windows-driver-expert.md` — kernel-mode driver code,
    BSOD-stakes, IRQL/SAL/WDF reasoning where Sonnet had documented failure modes
  - `agents/mobile/kmp-expert.md` — genuine cross-platform orchestration
    (Kotlin/Native + iOS Keychain + Android Keystore + Rust UniFFI + Gradle KMP)
    with sparse training data on UniFFI KMP fork
  - `agents/gamedev/unity-expert.md` — 30 skills spanning qualitatively
    distinct subsystems (DOTS/ECS, Netcode, Shader Graph, 2D toolkit) requiring
    multi-system reasoning per task
  - `agents/mobile/android-native-expert.md` — wallet-grade Keystore +
    biometric crypto-object binding for BHODL-class apps
  - `agents/mobile/ios-native-expert.md` — wallet-grade Secure Enclave +
    Keychain access control for BHODL-class apps

  **Demoted to Sonnet** (2 agents from Opus — benchmark confirmed equivalent):
  - `agents/industrial/dcs-analyst.md` — Sonnet matched Opus on PRT
    cross-reference anomaly detection across all evaluated criteria
  - `agents/industrial/freelance-engineer.md` — Sonnet matched Opus on
    bulk PRT generation + 5-step validation

  **Demoted to Haiku** (3 agents from Sonnet — benchmark passed 90/40 threshold):
  - `agents/infrastructure/docker-expert.md` — Dockerfile multi-stage
    refactor with cache/non-root/healthcheck handled equivalently by Haiku
  - `agents/core/documentation-expert.md` — TSDoc generation including
    `@typeParam`, `@example`, `@throws` produced at parity quality
  - `agents/core/log-analyst.md` — multi-service correlation across 5
    microservices with cascade chain identification matched Sonnet

  **Kept on Sonnet** (after benchmark, FAIL verdict on 6 candidates):
  - `vitest-expert` (Haiku missed `vi.hoisted()` for ESM mock)
  - `playwright-expert` (Haiku had `||` locator logic bug + wrong devices key)
  - `streamlit-expert` (Haiku used inline `if st.button():` anti-pattern)
  - `open-source-expert` (Haiku missed transitive AGPL through pdfkit — legal exposure)
  - `architect` (Opus differences were presentational, not substantive)
  - `deno-expert` (Haiku functional gap on `-1` button + JSX `.value` drops)
  - `prisma-expert` (conservative — multi-phase shadow column migration too complex for Haiku per pattern observed elsewhere)

### Added

- **`docs/MODEL-ROUTING-AUDIT.md`** — full per-agent rationale for the 62
  agents analyzed, benchmark methodology, decision framework (90/40 cost
  threshold, bias-to-Sonnet for ambiguity), and lessons learned. Reference
  document for future model routing decisions and onboarding.

### Architectural decision

Phase 1.1 of the token-optimization roadmap is now complete. The estimated
cumulative impact is **−10-15% session token spend** from the 3 high-frequency
Haiku demotions (docker, documentation, log-analyst), partially offset by the
5 Opus promotions on low-frequency specialists. Net cost reduction is modest
but the quality improvement on cross-platform/wallet/specialized domains is
meaningful. Phase 1.2 (top-10 agent body slimming) and Phase 1.3 (skill bundle
resolver in `agents.service.ts`) remain to be executed in subsequent sprints
to reach the original −20-30% Phase 1 target.

Key lesson from the 11 benchmarks: Haiku is reliably good at pattern-matched
codegen with mechanical correctness criteria, and consistently fails on
legal/security reasoning, framework anti-pattern detection, and simultaneous
multi-system tasks. The 90/40 threshold (90% quality at 40% cost) with bias
toward Sonnet for ambiguity prevented 6 user-facing quality regressions while
still capturing 5 meaningful cost wins.

- **11 new skills (Sprint 4 — completing the BHODL TECH_STACK coverage)**:

  Rust ecosystem (Sprint 4A):
  - `skills/network/arti/SKILL.md` — Arti pure-Rust Tor implementation by
    Tor Project. Embeddable Tor client for privacy-respecting wallets:
    TorClient API, bootstrap with persistent state cache, .onion connections,
    bridges (obfs4, snowflake), arti-hyper for HTTP through Tor, mobile
    integration via UniFFI, BootstrapStatus events for progress UI,
    onion service hosting, full BHODL pattern (BDK + Tor) and Cargo cross-compile.
  - `skills/network/rustls/SKILL.md` — rustls modern pure-Rust TLS. Drop-in
    replacement for OpenSSL/native-tls in Rust apps with mobile cross-compile
    in mind. ClientConfig + ServerConfig, certificate verification with
    webpki-roots, mTLS, custom verifier with **certificate pinning**
    (SHA-256 SPKI hash for wallet apps), ALPN, session resumption,
    crypto provider selection (ring vs aws-lc-rs), reqwest/hyper/tokio
    integration, mobile cross-compile examples.
  - `skills/databases/rusqlite/SKILL.md` — rusqlite ergonomic Rust SQLite.
    Bundled SQLite (no system dep), transactions, prepared statements,
    custom types via `ToSql`/`FromSql`, JSON1 support (BIP329 labels storage),
    blob streaming, FTS5 full-text search, migrations via rusqlite_migration,
    connection pooling (r2d2_sqlite), async via tokio-rusqlite, SQLCipher
    integration, mobile cross-compile, custom SQL functions.
  - `skills/data-processing/rust-decimal/SKILL.md` — rust_decimal exact
    fixed-point arithmetic. Critical for BHODL fiat conversions and
    cost-basis tracking — never use f64 for money. RoundingStrategy
    reference, sat ↔ fiat conversion patterns, serde + SQLite storage
    (always TEXT not REAL), wallet capital-gain calculation pattern,
    locale-aware display.
  - `skills/testing/proptest/SKILL.md` — Property-based testing for Rust.
    Strategies (regex strings, custom Arbitrary, structs via proptest-derive),
    common patterns (round-trip, invariants, equivalence, idempotence),
    shrinking + regression files, stateful property tests for state
    machines, Bitcoin-specific arbitraries (sats, xpubs, descriptors,
    PSBTs), differential testing for BDK/legacy migrations, integration
    with cargo-fuzz.
  - `skills/quality/rust-supply-chain/SKILL.md` — Production Rust supply
    chain: cargo-deny (license + advisory + bans with detailed deny.toml
    config rejecting GPL/AGPL for permissive wallet apps), cargo-audit,
    cargo-nextest (faster + more reliable than cargo test), cargo-tarpaulin
    + llvm-cov (coverage), cargo-machete (unused deps), cargo-outdated,
    cargo-vet (audit attestations), cargo-msrv. Full GitHub Actions CI
    pattern, wallet app quality checklist, MSRV pinning.

  Kotlin/Java quality (Sprint 4B):
  - `skills/quality/kotlin-quality/SKILL.md` — detekt + ktlint + Compose
    Rules. Production-grade detekt.yml config (complexity, exceptions,
    naming with Composable exception, performance, potential-bugs, style),
    ktlint Gradle plugin, .editorconfig, baseline workflow for legacy code,
    custom detekt rule example, Compose Rules cross-platform integration,
    SARIF upload to GitHub Code Scanning. Replaces a much shorter
    pre-existing kotlin-quality skill stub.
  - `skills/languages/java-foreign/SKILL.md` — JDK 22+ Foreign Function &
    Memory API (Project Panama, JEP 442/454) and jextract. Replaces JNI
    for desktop wallet OS interop (libsecret on Linux, Keychain on macOS,
    Credential Manager on Windows). MemorySegment + Arena pattern,
    downcall/upcall handles, struct layouts, jextract auto-binding
    generation, BHODL-style cross-platform Keyring abstraction with
    expect/actual KMP integration.

  Observability + docs + cross-language scanning (Sprint 4C):
  - `skills/observability/sentry-selfhosted/SKILL.md` — Privacy-respecting
    crash reporting via self-hosted Sentry (or GlitchTip lighter alt).
    Docker Compose install, Rust + Android + iOS SDKs with `beforeSend`
    PII scrubbing (addresses, balances, seeds redacted), opt-in only
    pattern for wallet apps, route via Tor, source-map/symbol upload,
    release health, alert rules, retention/backup strategy.
  - `skills/documentation/docs-toolchain/SKILL.md` — mdBook (long-form
    Bitcoin Core-style handbook) + rustdoc (Rust API auto-gen) + Dokka
    (Kotlin API auto-gen, multiplatform-aware) + Showkase (Compose
    component browser). Single-site deployment to GitHub Pages combining
    all four outputs, versioning strategy, custom CSS branding, doc
    linting via `missing_docs` lint and detekt documentation rules.
  - `skills/quality/osv-scanner/SKILL.md` — Google's OSV-Scanner —
    language-agnostic vulnerability scanner querying OSV.dev (aggregates
    RustSec, GHSA, PyPA, npm, Go vulndb, Android, distro CVEs). Single
    tool for polyglot projects (BHODL: Rust + Kotlin + Swift + JS).
    Configuration, GitHub Actions integration with scheduled weekly scan,
    SARIF output, comparison with cargo-audit/Dependabot/Snyk/Trivy,
    SBOM scanning workflow.

### Changed

- **`kmp-expert` agent** — extended `skills:` array with all 11 Sprint 4
  skills (now declares 21 skills total; covers full BHODL stack end-to-end).
- **`android-native-expert` agent** — extended with `quality/kotlin-quality`,
  `quality/osv-scanner`, `observability/sentry-selfhosted`.
- **`ios-native-expert` agent** — extended with `quality/osv-scanner`,
  `observability/sentry-selfhosted`.
- **`rust-expert` agent** — extended with all Rust-ecosystem Sprint 4
  skills (`testing/proptest`, `network/rustls`, `network/arti`,
  `databases/rusqlite`, `data-processing/rust-decimal`,
  `quality/rust-supply-chain`, `quality/osv-scanner`,
  `observability/rust-tracing`, `build-tools/rust-cross-compile`).
  This makes `rust-expert` complete for any production Rust app, not just
  web frameworks.

### Architectural decision

Sprint 4 brings the BHODL TECH_STACK coverage to ~100% of P0/P1 items. The
new skills are all framework-agnostic — they serve any project with the
respective tech, not just BHODL. The major themes:

1. **Rust ecosystem completion**: arti + rustls + rusqlite + rust_decimal
   + proptest + rust-supply-chain are foundational for any production
   Rust app, not specifically wallet code. They were missing across the
   dev-suite generally.
2. **Java Foreign Memory API**: JDK 22+ desktop apps need this for OS
   keyring access (the legitimate JNI replacement). Important for any
   Kotlin/JVM desktop app.
3. **OSV-Scanner**: cross-language vuln scanning is the right default
   for polyglot projects. Sits alongside cargo-deny (Rust-specific
   policy) without redundancy.
4. **Self-hosted Sentry**: opt-in privacy-respecting crash reporting is
   underserved by mainstream tooling. Documented patterns make this
   achievable for small teams.
5. **Docs toolchain**: combining mdBook + rustdoc + Dokka into a unified
   docs site is the Bitcoin Core / BDK pattern — high-quality docs for
   open-source software.

With Sprint 1+2+3+4, the BHODL TECH_STACK is fully covered. Future work
on dev-suite should focus on:
- The token-cost optimization roadmap (Phase 1.1 model routing — saved in memory)
- Other verticals (gaming, web3, etc.) as projects demand
- Skill maintenance as ecosystems evolve (Compose 2.x, Kotlin 2.3, etc.)

- **9 new skills (Sprint 3 — mobile testing, build pipeline, observability)**:

  Testing skills:
  - `skills/testing/maestro/SKILL.md` — Maestro E2E mobile testing by mobile.dev:
    YAML-based declarative flow files, single tool for Android + iOS (Compose
    Multiplatform / Flutter / React Native), Maestro Studio recording, JS scripting,
    cloud runner integration, biometric/permission auto-grant patterns, full CI
    examples (GitHub Actions both Android emulator and iOS simulator), wallet
    app patterns including biometric debug-bypass for E2E.
  - `skills/testing/kotest/SKILL.md` — Kotest Kotlin testing framework: 9 spec
    styles (StringSpec, FunSpec, BehaviorSpec, etc.), rich matchers, data-driven
    tests with `withData`, property-based testing with arbs and shrinking,
    coroutine-native test bodies, test isolation modes, Spring + Testcontainers
    + Koin extensions, MockK integration, full KMP support including
    iosSimulatorArm64Test.
  - `skills/testing/turbine/SKILL.md` — Turbine for kotlinx.coroutines Flow
    testing: `flow.test { }` DSL, `awaitItem`/`awaitComplete`/`awaitError`,
    StateFlow/SharedFlow patterns, virtual time (`runTest` + `advanceTimeBy`)
    for debounce/flatMapLatest, `turbineScope` for parallel flow assertions,
    multi-platform commonTest support.
  - `skills/testing/compose-snapshot/SKILL.md` — Paparazzi (JVM, Square) +
    Roborazzi (Robolectric, Takahirom) Compose snapshot/visual regression
    testing. Multi-variant tests (themes, locales, font scales), Showkase
    auto-discovery, image diff thresholds, CI artifact upload patterns,
    re-recording workflow, KMP shared composable coverage via Android target.

  Build & supply-chain skills:
  - `skills/build-tools/gradle-kmp/SKILL.md` — Gradle for KMP: settings.gradle.kts,
    version catalogs (`libs.versions.toml`), KMP plugin config, source set
    hierarchy, XCFramework + CocoaPods + SwiftPM output, Maven Central
    publishing (vanniktech plugin), build cache + configuration cache,
    composite builds, convention plugins (`build-logic/`), full GitHub
    Actions / GitLab CI matrix patterns.
  - `skills/build-tools/rust-cross-compile/SKILL.md` — cross-compiling Rust
    for mobile and other targets: rustup target management, cargo-ndk for
    Android, native iOS targets (aarch64-apple-ios + sim variants), `lipo`
    for universal sim libs, XCFramework packaging, `cross` Docker-based
    cross-compile for Linux/Windows, openssl/sqlite/sqlcipher cross-compile
    pitfalls and fixes (vendored / rustls / bundled-sqlcipher), build profiles
    for size optimization, sccache, full CI matrix examples.
  - `skills/security/sigstore-cosign/SKILL.md` — Sigstore + Cosign keyless
    signing: OIDC-based identity (no long-lived keys), Fulcio CA, Rekor
    transparency log, signing containers + blobs + attestations (SLSA
    provenance, SBOMs), GitHub Actions integration with `id-token: write`,
    Kubernetes policy enforcement (policy-controller, Kyverno), Gitsign for
    commit signing, Cosign vs Notary v2, mobile artifact signing pattern
    for wallet app releases.
  - `skills/infrastructure/reproducible-builds/SKILL.md` — bit-for-bit
    identical builds: SOURCE_DATE_EPOCH, Bitcoin Core's Guix-based approach
    (the gold standard), Nix Flakes alternative, Rust reproducibility
    (`--remap-path-prefix`, pinned toolchain, `Cargo.lock`, codegen-units),
    Android APK reproducibility considerations, iOS dSYM/Xcode caveats with
    pragmatic XCFramework-only-reproducible recommendation, CI verification
    pattern (build twice, diff with diffoscope), distribution pattern
    (Bitcoin Core multi-builder SHA256SUMS attestations).

  Observability skill:
  - `skills/observability/rust-tracing/SKILL.md` — Rust `tracing` crate:
    spans + events + structured fields, `#[instrument]` macro, async-aware
    context propagation, multi-layer subscribers (fmt, JSON, file appender,
    OpenTelemetry, Tokio Console), env-filter and per-target filtering,
    mobile FFI integration (Android Logcat via `tracing-android`, iOS
    `os.Logger` via `tracing-oslog`) for wallet apps shipping Rust core
    via UniFFI, privacy-respecting log redaction patterns
    (`RedactedAddr` Display impl, feature-flag gated secret logging).

### Changed

- **`kmp-expert` agent** — extended `skills:` array to include the 9 new
  Sprint 3 skills: build (`gradle-kmp`, `rust-cross-compile`), testing
  (`kotest`, `turbine`, `maestro`, `compose-snapshot`), observability
  (`rust-tracing`), supply chain (`reproducible-builds`, `sigstore-cosign`).
- **`android-native-expert` agent** — extended `skills:` array with
  `testing/{kotest,turbine,maestro,compose-snapshot}` and
  `security/sigstore-cosign`.
- **`ios-native-expert` agent** — extended `skills:` array with
  `testing/maestro` and `security/sigstore-cosign`.

### Architectural decision

Sprint 3 closes the loop on the mobile/wallet stack from Sprint 1+2 by
adding the surrounding production discipline: testing (unit, Flow,
snapshot, E2E), reproducible cross-platform builds (Rust + Gradle), keyless
signing for releases, and structured observability for the Rust core. The
testing skills are deliberately framework-agnostic — Maestro works for any
mobile UI, Kotest for any Kotlin/JVM project, Turbine for any
coroutines.Flow code, Paparazzi/Roborazzi for any Jetpack Compose code.
The build/supply-chain skills (`gradle-kmp`, `rust-cross-compile`,
`sigstore-cosign`, `reproducible-builds`) form a coherent reproducibility +
verifiability story for any open-source binary distribution, modeled on
Bitcoin Core's process. `rust-tracing` is positioned as a generic
observability skill but with explicit FFI-to-mobile-logger patterns for
the BHODL-style use case. With Sprint 1+2+3 the mobile/wallet vertical
is end-to-end self-sufficient: KMP/native code → cross-compile + signed
reproducible build → tested at every layer → shipped with verifiable
provenance.

- **`android-native-expert` agent** under `agents/mobile/` — native
  Android specialist for Jetpack Compose UI + the Android platform API
  surface. Covers Compose 1.8+ with `collectAsStateWithLifecycle`, type-safe
  Navigation Compose 2.8 routes, Hilt DI; Android Keystore (with StrongBox
  detection and fallback) + BiometricPrompt with `CryptoObject` cipher
  binding for unlocking wallet secrets; WorkManager (Hilt-injected periodic
  sync); Foreground Services with Android 14+ `foregroundServiceType`
  declarations; NFC (NDEF reader-mode + HCE); Universal/App Links with
  `assetlinks.json`; FileProvider; ProGuard/R8 rules for Compose + KMP +
  UniFFI; Network Security Config + cert pinning; SQLCipher with
  Keystore-derived database key.

- **`ios-native-expert` agent** under `agents/mobile/` — native iOS
  specialist for SwiftUI 6.x + the iOS platform API surface. Covers
  SwiftUI with `@Observable` (Swift 5.9+), NavigationStack /
  NavigationSplitView with type-safe paths, Swift Concurrency (`async let`,
  `TaskGroup`, actors, `@MainActor`); Keychain Services with biometric
  Secure Access Control (`.biometryCurrentSet` + `WhenPasscodeSetThisDeviceOnly`);
  Secure Enclave P-256 keys with `dataRepresentation` persistence;
  BGTaskScheduler app-refresh + processing tasks; Universal Links via
  associated domains + AASA hosting; App Groups for extension data sharing;
  Share Extensions; Privacy Manifest (`PrivacyInfo.xcprivacy`) with
  required-reason API entries; StoreKit 2; GRDB.swift with SQLCipher;
  age-plugin-se for SEP-bound encrypted backups.

- **6 new supporting skills** (Sprint 2 of mobile/security coverage):
  - `skills/mobile/jetpack-compose/SKILL.md` +
    `quick-ref/{state-effects,navigation,interop}.md` — Compose for
    Android only: `collectAsStateWithLifecycle`, ViewModel + Hilt
    integration, `@Observable` with Compose, side-effect APIs
    (`LaunchedEffect`, `DisposableEffect`, `LifecycleEventEffect`,
    `produceState`, `derivedStateOf`, `snapshotFlow`); Navigation Compose
    2.8 type-safe `@Serializable` routes with deep links, multi-stack
    bottom nav, dialog/bottom-sheet destinations; Activity Result
    Contracts (permissions, Photo Picker, custom contracts); AndroidView /
    ComposeView interop, Fragment hosting; window insets and edge-to-edge.
  - `skills/mobile/android-native/SKILL.md` +
    `quick-ref/{keystore-biometric,nfc-services}.md` — Activity lifecycle
    (modern with `enableEdgeToEdge`); Android Keystore deep dive
    (KeyGenParameterSpec full reference, StrongBox vs TEE detection, key
    attestation chain, key invalidation handling); BiometricPrompt with
    crypto-object binding (Cipher/Signature/Mac modes), authenticator
    classes (BIOMETRIC_STRONG vs WEAK), error code reference, complete
    wallet seed-storage pattern; EncryptedSharedPreferences;
    WorkManager full reference (constraints, periodic, chained, Hilt
    workers, Foreground WorkManager); Foreground Services (Android 14+
    `foregroundServiceType` taxonomy); NFC (foreground dispatch vs reader
    mode, NDEF read/write, HCE setup); Notifications + permission;
    Universal/App Links + custom URI; FileProvider; ProGuard/R8 rules;
    Network Security Config.
  - `skills/mobile/ios-native/SKILL.md` +
    `quick-ref/{swiftui-architecture,secure-storage,system-integration}.md` —
    SwiftUI App protocol, scenes, state APIs (`@State`, `@Binding`,
    `@Observable`, `@Environment`, `@AppStorage`, `@SceneStorage`);
    NavigationStack with type-safe paths and `NavigationPath`,
    NavigationSplitView, sheets/detents/fullScreenCover/popover, alerts,
    `@FocusState`, toolbars, TabView, lifecycle modifiers, animations;
    Keychain Services deep dive (accessibility levels with focus on
    `WhenPasscodeSetThisDeviceOnly`, access controls including biometric
    SAC flags, access groups, iCloud sync semantics); Secure Enclave
    (P-256 key generation, `dataRepresentation` persistence, signing,
    ECDH, key agreement, attestation via DCAppAttest); wallet seed
    pattern with SEP-wrapped DB key; BGTaskScheduler (registration,
    scheduling, expiration handling, Xcode debugger simulation);
    Universal Links with AASA file format; App Groups (UserDefaults +
    file storage + Keychain); Share Extensions; Privacy Manifest with
    required-reason API category reference; StoreKit 2; Push
    Notifications.
  - `skills/databases/sqlcipher/SKILL.md` — SQLCipher (encrypted SQLite)
    for mobile wallet data: PRAGMA reference (key, rekey, kdf_iter,
    cipher_compatibility, cipher_use_hmac), passphrase vs raw 256-bit
    key derivation, integration in Rust (`rusqlite` with
    `bundled-sqlcipher` feature), Android (`sqlcipher-android` with Room
    or SQLDelight via SupportFactory), iOS (CocoaPods or SwiftPM with
    GRDB.swift), KMP (SQLDelight + custom drivers); key rotation;
    performance tuning (WAL, NORMAL synchronous, cache_size); backup +
    integrity checks; complete BHODL-style wallet pattern (Keystore-derived
    DB key) with troubleshooting.
  - `skills/security/libsodium/SKILL.md` — libsodium primitives cheat
    sheet, Rust bindings (`dryoc` pure-Rust preferred, `sodiumoxide` as
    alternative); SecretBox (XSalsa20-Poly1305) and SecretStream (chunked
    streaming) patterns; Argon2id password hashing with Config presets
    (interactive / moderate / sensitive); X25519 + Ed25519 public-key
    operations; key derivation; memory hygiene with `Protected<T>`
    locked-memory wrappers; bindings for Python (PyNaCl), JS
    (`libsodium-wrappers`), Java/Android (lazysodium), Swift (Sodium);
    complete wallet seed-encryption pattern.
  - `skills/security/age-encryption/SKILL.md` — age (and rage) modern
    file encryption: CLI quick start, X25519 recipients, passphrase
    Scrypt recipients, SSH key recipients (encrypt to GitHub
    `~/.ssh/authorized_keys`), plugin system (age-yubikey, age-plugin-se
    for SEP, age-plugin-tpm); file format details; Rust integration with
    the `age` crate (encrypt/decrypt + streaming); multi-recipient
    backup pattern (passphrase + YubiKey + companion's age key) for
    wallet exports; comparison with GPG.

### Architectural decision

Sprint 2 completes mobile coverage by splitting concerns three ways:
**`kmp-expert`** for shared business logic + cross-platform Compose UI,
**`android-native-expert`** for the Android side (Compose UI + Android
platform APIs + Keystore-backed crypto), **`ios-native-expert`** for the
iOS side (SwiftUI + Apple platform APIs + Keychain/SEP). Three agents +
the cross-cutting skills allow apps to pick: pure native per-platform,
shared logic + native UI, or fully shared via Compose Multiplatform —
without forcing a single approach. The cross-loaded skills
(`databases/sqlcipher`, `security/libsodium`, `security/age-encryption`)
are deliberately framework-agnostic so they remain useful in other
contexts (desktop wallets, server-side secret management, encrypted
backups for any project).

This unblocks BHODL (and similar Bitcoin/wallet apps) end-to-end at the
KMP, native Android, and native iOS layers. Sprint 3 will add mobile
testing (Maestro, Kotest, Turbine, Paparazzi/Roborazzi), build/CI
extensions (Gradle KMP CI presets, sigstore/cosign, reproducible
builds), and observability (rust-tracing, mobile crash reporting
patterns).

- **`kmp-expert` agent** under `agents/mobile/` — Kotlin Multiplatform +
  Compose Multiplatform specialist. Covers shared business logic across
  Android, iOS, JVM Desktop and Web (Wasm); declarative UI with Compose
  Multiplatform; Rust ↔ Kotlin/Swift bindings via **UniFFI** (including
  the **UbiqueInnovation KMP fork** used by BDK, LDK Node, LWK, CDK,
  Breez SDK Liquid); Gradle KMP setup (XCFramework, CocoaPods, SwiftPM);
  state/navigation/DI patterns (StateFlow + Voyager/Decompose + Koin);
  Material 3 + custom design tokens. Designed to fill the major gap in
  mobile coverage (the existing `mobile-expert` only covered React
  Native / Flutter / Expo).

- **5 new supporting skills** (Sprint 1 of mobile/FFI coverage):
  - `skills/languages/kotlin/SKILL.md` + `quick-ref/{coroutines,advanced}.md` —
    Kotlin 2.x language fundamentals (null safety, sealed/data classes,
    scope functions, coroutines/Flow, generics variance, KSP, context
    parameters, inline value classes, multiplatform `expect`/`actual`
    introduction).
  - `skills/languages/swift/SKILL.md` + `quick-ref/{concurrency,interop}.md` —
    Swift 5.10/6.x fundamentals (optionals, value vs reference,
    protocols/generics, Codable, Result Builders), Swift 6 strict
    concurrency (actors, Sendable, MainActor, AsyncSequence/Stream,
    TaskGroup), and Apple platform interop (ObjC, C, Rust via UniFFI,
    Keychain Services, Secure Enclave with biometric access control,
    `os.Logger` privacy markers).
  - `skills/languages/uniffi/SKILL.md` + `quick-ref/{proc-macro,kmp-bindings}.md` —
    Mozilla UniFFI for Rust → Kotlin/Swift bindings: UDL definition,
    proc-macro mode (`#[uniffi::export]`), async support (Tokio runtime),
    callback interfaces, trait interfaces, custom type validation at FFI
    boundary, error mapping (thiserror + `uniffi::Error`), memory model
    (`Disposable`/`AutoCloseable`), and full setup of the
    **uniffi-kotlin-multiplatform-bindings** fork (cargo-ndk, sparse iOS
    builds, KMP cinterop, Bitcoin libraries reference list).
  - `skills/mobile/kotlin-multiplatform/SKILL.md` +
    `quick-ref/{gradle,ios-integration,libraries}.md` — KMP setup
    (Gradle plugin, source set hierarchy, default + custom intermediate
    sets, target configuration), `expect`/`actual` patterns (functions,
    classes, type aliases), iOS framework export (XCFramework, CocoaPods,
    SwiftPM, embedAndSign workflow, Skie integration for idiomatic Swift
    Flow/sealed wrappers), and a curated KMP library matrix (Ktor 3,
    SQLDelight, Koin, kotlinx-datetime, Coil 3, Decompose, Kermit,
    Multiplatform Settings, Realm, etc.).
  - `skills/frontend-frameworks/compose-multiplatform/SKILL.md` +
    `quick-ref/{ios-platform,navigation-di,theming}.md` — Compose
    Multiplatform 1.8+ (Stable iOS): `@Composable`, state hoisting,
    `remember`/`mutableStateOf`/`rememberSaveable`, side effects
    (`LaunchedEffect`/`DisposableEffect`/`produceState`/`derivedStateOf`),
    Material 3, modifier order rules, performance (`@Immutable`/`@Stable`,
    `key` on `LazyColumn`), iOS platform bridging
    (`ComposeUIViewController`, `UIKitViewController` / `UIKitView`,
    SwiftUI ↔ Compose hybrid, keyboard/safe-area/gestures/haptics/share
    sheet via `expect`/`actual`), navigation libraries (Voyager, Decompose,
    Jetpack Navigation Compose KMP) with DI integration (Koin,
    kotlin-inject), and theming (Material 3 color schemes, custom design
    tokens via `CompositionLocal`, dynamic color, multi-brand, dark mode,
    high contrast, accessibility).

### Architectural decision

The new mobile/FFI skills are designed for the BHODL-style stack
(Bitcoin wallet on KMP + Compose Multiplatform with Rust core via UniFFI)
but stay framework-agnostic enough to serve any cross-platform Kotlin
project. The split between `languages/uniffi` (binding mechanics) and
`mobile/kotlin-multiplatform` (KMP build system) keeps each skill focused.
The `kmp-expert` agent cross-loads all five skills to act as the single
entry point for KMP+Compose+Rust mobile work, mirroring the
`unity-expert` cross-load pattern. This is **Sprint 1** of a larger
mobile-coverage plan; future sprints will add native Android (`android-native-expert` +
`mobile/jetpack-compose`), native iOS (`ios-native-expert` + `mobile/ios-native`),
SQLCipher / libsodium / age encryption skills, and mobile testing skills
(Maestro, Kotest, Turbine, Paparazzi/Roborazzi).

- **`gamedev/2d-art/ai-art-tools` skill** — AI-assisted 2D / pixel-art
  generation tools. Compares **PixelLab** (purpose-built pixel-art
  generator with Aseprite plugin and animation support), **Scenario**
  (per-project style-locked custom-trained models), **Leonardo.AI**
  (general game-asset generator), **Retro Diffusion** (Stable Diffusion
  fine-tune that runs locally), DIY **Stable Diffusion + LoRAs**, and
  general-purpose models (Midjourney, DALL-E 3) for concept art. Includes
  a 30-second decision matrix, integration patterns (Aseprite plugin /
  REST API / ComfyUI / batch script), hybrid AI+human workflows that
  ship, May 2026 cost reality check, and anti-patterns (raw AI ship,
  high-res-then-downscale, ignoring commercial license).

- **PixelLab pointer in `tools/SKILL.md`** — short cross-reference under
  the new "AI-assisted generation" section, pointing to the dedicated
  `ai-art-tools` skill.

- **`unity-expert` cross-loads `ai-art-tools`** — added to the existing
  engine-agnostic 2D art skills bundle (joins the 10 skills shipped in
  1.6.0). Future `godot-expert` / `phaser-expert` will inherit the same
  skill without duplication.

- **Documentation MCP — `gamedev-2d-art-ai-art-tools` registered** under
  the `gamedev-2d-art` category with `https://www.pixellab.ai/` as the
  upstream link.

### Architectural decision

PixelLab (and AI pixel-art generation in general) is a SaaS / tooling
domain, not a paradigm requiring behavioral steering or context
isolation, so a dedicated agent would be overkill. Instead, the
knowledge lives as a skill cross-loaded from existing engine agents,
which is the same pattern used for the engine-agnostic 2D art skills
(1.6.0). The split between hand-authoring tools (`tools/`) and AI
generators (`ai-art-tools/`) keeps each skill focused while letting
either be fetched independently.

---

## [1.7.0] - 2026-05-03

### Added

- **`cpp-expert` agent** under `agents/backend/` — modern C++ (C++17/20/23) generalist:
  RAII, move semantics, smart pointers, concepts, ranges, `std::expected`, `std::span`,
  coroutines, modules. CMake (presets, FetchContent, vcpkg/Conan), Google Test + Google Mock,
  clang-tidy / clang-format, and the sanitizer suite (ASan/UBSan/TSan/MSan). Designed to
  be useful as a standalone agent for any C++ work, and to be cross-loaded by other
  systems agents (e.g. `windows-driver-expert`).

- **5 supporting C++ skills**:
  - `skills/languages/cpp/SKILL.md` — modern C++ language and STL quick reference
  - `skills/build-tools/cmake/SKILL.md` — modern CMake (target-centric, presets, packaging)
  - `skills/testing/googletest/SKILL.md` — GTest + GMock (fixtures, parameterized,
    typed tests, mock interfaces, CMake `gtest_discover_tests`)
  - `skills/quality/cpp-quality/SKILL.md` — clang-tidy, clang-format, cppcheck, IWYU,
    CI integration
  - `skills/security/cpp-security/SKILL.md` — sanitizers, MSVC `/sdl` and `/guard:cf`,
    Linux/GCC hardening flags, CERT C++ patterns, fuzzing harness template

- **`windows-driver-expert` agent** under `agents/backend/` — Windows kernel and
  user-mode driver specialist (WDF / KMDF / UMDF). Covers HID stack and filter drivers
  (mouse / keyboard / touch / pen), Indirect Display Drivers (IDD) for virtual
  monitors with network streaming, IRP/IOCTL handling, IRQL discipline, the WDK
  toolchain, WinDbg with KDNET, Driver Verifier, Static Driver Verifier (SDV), WDK
  CodeQL queries, EV-cert + attestation signing, and HLK/WHQL submissions. Cross-loads
  the C++ skills and the new `windows/*` skills below.

- **6 new Windows driver skills** under `skills/windows/`:
  - `wdf-kmdf` — KMDF: DriverEntry, EvtDeviceAdd, IRPs, IOCTLs, queues, IRQL,
    pool allocation (`ExAllocatePool2`), WPP tracing, SAL annotations, PnP/Power
    callbacks, synchronization primitives
  - `wdf-umdf` — UMDF v2 in `WUDFHost.exe`: differences vs. KMDF, when to use it,
    INF entries, reflector, debugging, companion-driver patterns
  - `hid-input-filter` — HID stack architecture (Hidusb / HIDClass / Mouclass /
    Kbdclass), filter placement (upper vs. lower), internal IOCTLs
    (`IOCTL_HID_READ_REPORT` etc.), report-completion interception and
    suppression, inverted-call delivery to user mode, Virtual HID Framework (VHF)
    for input injection
  - `indirect-display` — IDD framework (`IddCx`): adapter / monitor lifecycle,
    EDID generation, swap-chain processing loop (`AcquireBuffer` →
    `FinishedProcessingFrame`), GPU-staying frame pipelines, NVENC / Quick Sync /
    AMF encoding, low-latency network transports (Rivermax, RIST/SRT, RDMA), HDR,
    multi-monitor, hardware cursor
  - `driver-debugging` — WinDbg / WinDbg-Preview, KDNET kernel debugging setup,
    Driver Verifier, Application Verifier (UMDF), `!analyze -v` flow, common
    bugcheck cheatsheet, `!irp` / `!devstack` / `!wdfkd.*` commands, kernel
    dump configuration, WPP/ETW trace decoding (`tracefmt`, `wpr`, WPA)
  - `driver-signing` — EV code-signing certificates, Microsoft Hardware Dev
    Center attestation signing vs. WHQL/HLK certification, INF compliance with
    `infverif`, test-signing for development, the build → catalog → sign →
    submit flow, dual-signing notes, `signtool verify /kp` validation

- **Documentation MCP — index entries for the new C++ and Windows-driver
  technologies**:
  - `cpp` registered under the `languages` category
  - `cmake` and `cpp-quality` registered under the `tooling` category
  - `googletest` registered under the `testing` category
  - `cpp-security` registered under the `security` category
  - New **`windows-drivers`** category file
    `mcp-servers/documentation/src/docs-index/windows-drivers.ts` registering
    `wdf-kmdf`, `wdf-umdf`, `hid-input-filter`, `indirect-display`,
    `driver-debugging`, and `driver-signing` with canonical upstream URLs
    (Microsoft Learn `windows-hardware/drivers/...` pages and
    `microsoft/Windows-driver-samples` samples). The new category is wired into
    `docs-index/index.ts` (`SUPPORTED_TECHNOLOGIES`, `docsIndex`,
    `CATEGORY_MAP`).

- **Knowledge base content (Phase A)** — 97 markdown topic files committed to
  the external `claude-dev-suite/knowledge_base` repo (commit `2a40afa`):
  - `knowledge/cpp/` (8 files), `knowledge/cmake/` (9), `knowledge/googletest/` (9),
    `knowledge/cpp-quality/` (7), `knowledge/cpp-security/` (10)
  - `knowledge/windows-drivers/{wdf-kmdf,wdf-umdf,hid-input-filter,
    indirect-display,driver-debugging,driver-signing}/` (54 files total)
  - Each file is complementary depth (internals, edge cases, advanced patterns)
    beyond the always-loaded `SKILL.md` quick references. Fetched on-demand by
    `mcp__documentation__fetch_docs(technology, topic)` with 2h cache.

### Architectural decision

Two-agent split (cpp-expert + windows-driver-expert) instead of one combined agent:
the C++ generalist is genuinely useful on its own (anyone writing modern C++
benefits), and the Windows driver specialist legitimately needs domain-specific
behavioral steering (IRQL discipline, DDI rules, signing flow, kernel
constraints) that would dilute a generic C++ agent. They cross-reference each
other through shared `cpp` / `cmake` / `cpp-quality` / `cpp-security` skills,
keeping authoritative guidance in one place per topic.

---

## [1.6.0] - 2026-05-01

### Added

- **10 engine-agnostic 2D game art skills** under `skills/gamedev/2d-art/`:
  - **`tile-design`** - autotiling math (Wang 4-bit, 16-bit, 47-tile, 256-tile blob), grid types (square/hex flat-top/hex pointy-top/staggered iso/true iso), terrain blending, transitional pieces, 9-slice rendering. Quick-refs: `wang-bitmask-table.md`, `blob-256-template.md`, `hex-flat-vs-pointy.md`.
  - **`pixel-art-fundamentals`** - resolution choice (160x144 GameBoy through 480x270 modern lo-fi), pixel-perfect display, anti-aliasing rules (selective AA on diagonals only), dithering (Bayer ordered, hand-placed checkerboard, when to dither vs not), outline philosophy (full / selective "selout" / inline / gradient), pixel hinting / sub-pixel rules, common mistakes (pillow shading, banding, jaggies, PSD-soft rendering). Quick-refs: `dithering-patterns.md`, `antialiasing-rules.md`.
  - **`palettes`** - color theory practical (warm/cool, complementary, analogous, triadic), restricted palettes ready-made (PICO-8, GameBoy DMG, DB16, DB32, AAP-64, Resurrect 64, NES, C64, Endesga 32, Sweetie 16), hue shifting (warm-cool ramps), color ramps (foliage, stone, skin, water, fire), palette swap conventions (character variants, faction colors, status effects, day/night), `.gpl/.pal/.ase/.json` formats, indexed mode workflow. Quick-refs: `lospec-recommended-palettes.md`, `hue-shift-recipes.md`.
  - **`seamless-textures`** - offset-and-paint trick, mirror techniques, repetition reduction (variant tiles + decoration overlays), transitional tiles (edge / corner / T-junction), normal map authoring (Sprite Lamp / Sprite DLight / Materialize / hand-paint), procedural + hand-pixel hybrid, specialized surfaces (roof / floor / wall / water / sky).
  - **`animation-frames`** - frame counts (idle 2-4f / walk 6-8f / run 6-8f / attack 4-6f), squash/stretch limits in pixel art, looping cycles, anticipation/impact/recovery beats, sub-pixel motion problem, sprite sheet layouts (Aseprite tags + JSON sidecar / TexturePacker / manual grid), per-frame easing. Quick-refs: `walk-cycle-keyframes.md`, `attack-anticipation.md`.
  - **`tools`** - Aseprite (de facto pixel art DCC), Tiled, LDtk, Tilesetter, Pixelorama, Spine / DragonBones (skeletal 2D), TexturePacker, Sprite Lamp / Sprite DLight (normal maps), PSD Importer / Aseprite Importer, Krita / Procreate / Photoshop. Quick-refs: `aseprite-shortcuts.md`, `ldtk-vs-tiled.md`, `aseprite-lua-scripting.md`.
  - **`lighting-art`** - workflow for Unity 2D Lights / Godot CanvasLight, normal map painting, sprite layer separation (diffuse / normal / emissive / mask), self-shadowing in pixel art, day/night palette swap vs realtime light mixing, glow / emissive layers, bloom interaction with pixel art.
  - **`vfx-2d`** - canonical frame patterns (smoke / fire / water / electricity / sparks / hit / explosion / heal), hitstop / hit pause durations, screen shake intensity curves and parameters, color flash, trail effects, procedural particles vs pre-baked frames, Vlambeer "Art of Screenshake" juice principles (squash / hitstop / flash / particles / shake / sound / trail / decal layering), decals.
  - **`environment-design`** - parallax planning (layer count, scroll-speed ratios, atmospheric perspective via palette desaturation), foreground/background composition, silhouette readability vs busy backgrounds, tile density and rhythm, environmental storytelling via tiles (worn paths, broken architecture, scorch marks), light direction consistency, mood palette mapping.
  - **`character-design`** - silhouette-first methodology with black-out test, character-to-tile size ratio, expressions in low resolution (eye / mouth pixel placement), anatomy shortcuts in pixel art, faction/role visual language (silhouette + palette identifying class), walk cycle conveying weight and attitude, player-vs-NPC distinction.

- **Documentation MCP - `gamedev-2d-art` category**: new file `mcp-servers/documentation/src/docs-index/gamedev-2d-art.ts` registering all 10 skills with canonical upstream links (Lospec, Aseprite docs, Vlambeer talk, Boris-the-Brave Wang tiles, Saint11 art tutorials, Unity URP 2D Lighting docs).

- **`unity-expert` agent updated**: cross-loads all 10 `gamedev/2d-art/*` skills in addition to the existing 20 Unity-specific gamedev skills. Skills are engine-agnostic - when future Godot/Phaser/etc. agents are added they will load the same 2D art skills.

### Architectural decision

The 10 new skills are engine-agnostic and live under `skills/gamedev/2d-art/`
(parallel to the existing `skills/gamedev/unity-*` engine-specific skills).
Cross-loading onto `unity-expert` today; ready to attach to a future
`godot-expert` / `phaser-expert` without duplication. No new agent created
because the knowledge is purely instructional (no behavioral steering or
context-isolation justifying a dedicated agent).

---

## [1.5.0] - 2026-04-30

### Added

- **5 Bitcoin / Lightning / L2 domain agents** under `agents/bitcoin/`:
  - **`bitcoin-protocol-expert`** (opus) — consensus, transactions, scripts (P2PK→P2TR+Tapscript), SegWit, Taproot (BIP340/341/342), PSBT (BIP174/370/371), descriptors (BIP380-385), Miniscript, P2P (BIP155/152/157/158/324), package relay (BIP331), TRUC v3 (BIP431), message signing (BIP137/322), proposals (CTV/APO/OP_VAULT/CAT/drivechains), cryptography (secp256k1, ECDSA, Schnorr, BIP32, MuSig2 BIP327, FROST, adaptor signatures, DLCs), metaprotocols (Ordinals, Inscriptions, BRC-20, Runes, Atomicals).
  - **`bitcoin-core-expert`** — bitcoin.conf, JSON-RPC, REST, ZMQ, indexes (txindex/blockfilter/coinstats), pruning, descriptors wallet, signet, P2P configuration, Tor/I2P/CJDNS, Guix reproducible builds, Bitcoin Knots, integration with Electrs/Fulcrum/Esplora/mempool.space/BTCPay, self-hosted node distros (Umbrel/Start9/RaspiBlitz/MyNode/Citadel).
  - **`lightning-expert`** (opus) — full BOLT specs, channel state machines, HTLC mechanics, onion routing (Sphinx), gossip, watchtowers, splicing, taproot channels; LND/CLN/LDK/Eclair/Greenlight/phoenixd; BOLT12 offers, LNURL, Lightning Address, LSP (BLIPs), WebLN, NWC (NIP-47), UMA; Loop/Pool/Lit, submarine swaps via Boltz; security (replacement cycling 2023, channel jamming, pinning, anchor outputs); multi-asset over LN (Taproot Assets v0.7, RGB-Lightning); consumer wallets matrix (Phoenix, Mutiny, Breez SDK, Zeus, Aqua, BlueWallet).
  - **`bitcoin-wallet-expert`** — HD wallets (BIP32/39/44/49/84/86), output descriptors, PSBT signing flows, multisig coordination (cross-vendor), time-locked vaults (CSV, OP_VAULT BIP345 proposal), coin selection (BnB / SRD / waste metric), fee estimation, RBF/CPFP, hardware wallet integration (Trezor, Ledger, Coldcard Mk4/Q, BitBox02, Jade, Foundation Passport, SeedSigner, Krux, Keystone, Specter DIY, HWI), privacy (CoinJoin Wabisabi/Whirlpool/JoinMarket, PayJoin BIP78, Silent Payments BIP352, BIP47 PayNyms), payment standards (BIP21, BIP329 labels, BIP85 entropy, SLIP-39 Shamir, SeedQR).
  - **`bitcoin-testing-expert`** — regtest, signet (incl. **Mutinynet** with 30-second blocks for fast LN dev), Polar (LN regtest GUI), Nigiri (full stack regtest with Esplora), Bitcoin Core's Python functional test framework, fuzzing (libFuzzer harnesses + cargo-fuzz on rust-bitcoin/bdk/secp256k1), property-based testing (proptest, hypothesis).

- **Bitcoin skills tree** under `skills/bitcoin/` covering protocol, cryptography, wallets, Bitcoin Core, Lightning (protocol + impl + app + security + consumer-wallets), L2 (statechains/Ark/Spark/Liquid/Taproot Assets/RGB/Counterparty/Stacks/Rootstock/Fedimint/Cashu/Citrea/Strata/BSquared/Bitlayer/Merlin/Botanix/BOB/Hemi/MAP/Babylon/BitVM/threshold-tBTC/drivechains-spacechains), metaprotocols (Ordinals/Inscriptions/BRC-20/Runes/Atomicals), privacy (CoinJoin/PayJoin/Silent Payments/stealth/Tor/BIP47/Dandelion/p2p-exchanges/atomic-swaps), mining (PoW/difficulty/Stratum V1/V2/pool architectures/decentralized pools/firmware), hardware (13 vendors + DIY signers + HWI + PSBT flows + multi-vendor multisig), infrastructure (Electrs/Fulcrum/Esplora/mempool.space/BTCPay/Specter/Sparrow/Electrum/BlueWallet/Caravan/node-distros), testing (regtest/signet/Polar/Nigiri/core-test-framework/fuzz/property-based), and libraries across Rust (rust-bitcoin, BDK, LDK, miniscript-rs, rust-secp256k1, rust-dlc), TypeScript/JS (bitcoinjs-lib, @scure/btc-signer, mempool.js, bcoin, bolt11), Python (python-bitcoinlib, embit, bitcoinlib, hdwallet, bdkpython), Go (btcd, btcsuite, lnd-go, tapd-go), JVM (bitcoinj, bdk-jvm), .NET (NBitcoin), C (libsecp256k1, libwally, libbitcoin). Quick-ref subdirectories on the densest topics (scripts opcodes / output-types / Tapscript, transactions sighash / serialization / malleability / RBF-CPFP / v3-TRUC, Taproot tweak / control-block / sighash-default / taptree, Schnorr pseudocode / batch-verify / pitfalls, MuSig2 protocol / key-agg / attacks, BOLT summary / feature bits, channel state-machine / commitment-tx / force-close).

- **Bitcoin detection in `detection.service.ts`**: new `BitcoinDetectionService` runs alongside language detection. Recognizes signals across `Cargo.toml` (bitcoin/bdk/ldk/miniscript/secp256k1/rust-dlc/taproot-assets/rgb), `package.json` (bitcoinjs-lib/@scure/btc-signer/mempool.js/bolt11/cashu-ts/NWC/WebLN/stacks/rsk), `requirements.txt`+`pyproject.toml` (python-bitcoinlib/embit/bdkpython/bitcoinlib/hdwallet/cashu/pyln-client), `go.mod` (btcd/lnd/tapd), `pom.xml`+`build.gradle` (bitcoinj/bdk-jvm/bdk-android), `.csproj` (NBitcoin/BTCPayServer), operational config files (bitcoin.conf/lnd.conf/eclair.conf/electrs.toml/fulcrum.conf/tapd.conf/arkd.conf/phoenix.conf), Docker compose images (lncm/bitcoind, lightninglabs/lnd, lightninglabs/tapd, elementsproject/lightningd, cashubtc/nutshell, fedimint/fedimintd, btcpayserver, getumbrel/electrs, mempool/backend, mempool/frontend, arkade/arkd, blockstream/esplora), and Ordinals/Runes assets (`inscriptions/`, `runes.json`, `ord.yaml`). New `STACK_TO_AGENTS` mappings route detected Bitcoin tags to the appropriate Bitcoin domain agents (and to language-experts for library-specific work).

- **Documentation MCP — `bitcoin` category** in `mcp-servers/documentation/src/docs-index/bitcoin.ts`: registers Bitcoin technologies under the `bitcoin` category with canonical upstream URLs and `local` paths under `bitcoin/<area>/<topic>/overview.md` for the external `claude-dev-suite/knowledge_base` repo (Phase B topic-deep articles to follow in a later release).

### Architectural decision

After research into agent-vs-skill efficiency in Claude Code (per official Anthropic docs), Bitcoin support is delivered as **5 domain-experts + ~170 skills** rather than per-language Bitcoin agents. Language-specific work routes through the existing language-experts (`rust-expert`, `typescript-expert`, etc.) with Bitcoin library skills loaded onto them via detection. This avoids duplicating language knowledge while preserving cross-language Bitcoin domain expertise (consensus, BOLT specs, hardware multisig coordination).

---

## [1.4.0] - 2026-04-28

### Added

- **`unity-expert` agent**: new deep-expertise agent for Unity 6 game development covering both 2D and 3D. Comprehensive coverage of: MonoBehaviour lifecycle, ScriptableObjects, GameObject/Component model, prefabs, serialization, coroutines, events; rendering pipelines (Built-in / URP / HDRP), Shader Graph, Volume framework, Renderer Features, GPU Resident Drawer, lighting; new Input System (`InputAction`, `InputActionAsset`, rebinding, multi-device), UI Toolkit (UXML/USS) and uGUI optimization; 3D physics (Rigidbody, Collider, Joints) and animation (Animator state machines, Animation Rigging, Humanoid retargeting); Addressables (AssetReference, labels, groups, build profiles, remote content, Cloud Content Delivery); performance tooling (Profiler, Frame Debugger, Memory Profiler, GC allocation hunting, object pooling, IL2CPP, Burst, batching, LOD); DOTS/ECS (Entities 1.x, Burst, Jobs, ISystem, baking); Netcode for GameObjects (NetworkVariable, RPCs, client-side prediction, lag compensation, Multiplay/Relay/Lobby); XR (XR Interaction Toolkit 3.x, AR Foundation, OpenXR, hand tracking); editor tooling (custom Inspectors, PropertyDrawers, EditorWindow, asset post-processors, headless `-batchmode -executeMethod` builds); Unity Test Framework (EditMode + PlayMode, performance tests); platform builds (IL2CPP vs Mono, Build Profiles, Android AAB + PAD, iOS Xcode post-processing, WebGL). **Dedicated 2D cluster** (deep): Sprite Renderer + Sprite Atlas v2 (master/variants, packing, tight mesh), 9-slice rendering, Sorting Layers / Order in Layer / Sorting Group, sprite import settings, Pixels Per Unit consistency, Pixel Perfect Camera; Tilemap (Grid + Tilemap, Rule Tiles, Animated Tiles, Tile Palette, Hexagonal/Isometric grids, Composite Collider 2D + Tilemap Collider 2D, procedural generation); 2D physics (Rigidbody2D body types, Collider2D shapes, joints, effectors, layer collision matrix, allocation-free queries); 2D Animation (frame-by-frame, skeletal bones + skinning + IK, PSD Importer, Aseprite Importer, Sprite Library / Resolver); 2D Lighting (URP 2D Renderer, Light 2D types, Shadow Casters 2D, Sprite Mask, Renderer2DData, normal-mapped sprites, blend styles); 2D cameras (Cinemachine 2D, Position Composer, Group Composer, Confiner 2D, Pixel Perfect integration, parallax, Cinemachine Impulse for screen shake); 2D gameplay (kinematic vs dynamic character controllers, **coyote time**, **jump buffer**, variable jump, wall slide / wall jump, dash, hitstop / juice, top-down 8-way movement). Ships with `agents/gamedev/unity-expert.md`.
- **20 Unity skills** under `skills/gamedev/`: 13 generic (`unity-core`, `unity-rendering`, `unity-input-ui`, `unity-physics-anim`, `unity-addressables`, `unity-performance`, `unity-dots`, `unity-netcode`, `unity-xr`, `unity-editor-tooling`, `unity-testing`, `unity-build-platforms`, `unity-best-practices`) + 7 dedicated 2D (`unity-2d-core`, `unity-2d-tilemap`, `unity-2d-physics`, `unity-2d-animation`, `unity-2d-lighting`, `unity-2d-cameras`, `unity-2d-gameplay`). Each skill ships frontmatter with `USE WHEN` / `DO NOT USE FOR`, code patterns, anti-patterns table, and production checklist.
- **Unity / 2D detection in `detection.service.ts`**: new `detectUnity()` runs **before** `detectDotnet()` so Unity-auto-generated `.csproj`/`.sln` files are no longer misclassified as ASP.NET. Detection signals: `ProjectSettings/ProjectVersion.txt` (definitive) + `Assets/` + `Packages/manifest.json`. Maps installed `com.unity.*` packages to `additionalTechnologies`: `unity-urp`, `unity-hdrp`, `unity-netcode`, `unity-dots`, `unity-ar`, `unity-xr`, `unity-addressables`, `unity-input-system`, `unity-cinemachine`, `unity-timeline`, `unity-localization`, plus a `unity-2d` flag whenever any `com.unity.2d.*` package is present. Sets `frontend.framework = 'unity'`, `runtime = 'csharp'`, and `projectType = 'game'`. New stack-to-agent mappings route Unity projects to `unity-expert`.
- **Knowledge base — Phase A overview stubs for 20 Unity skills**: registered the new `gamedev` category in `mcp-servers/documentation/src/docs-index/gamedev.ts`, with 20 entries pointing to per-skill `overview.md` stubs in the `claude-dev-suite/knowledge_base` repo. Each stub cross-references the canonical Unity Manual / package docs page and the matching dev-suite `SKILL.md`.
- **Knowledge base — Phase B topic articles for the 2D cluster (21)**: registered 21 additional topic entries in `gamedev.ts` (3 per dedicated 2D skill) and produced full deep-dive markdown for each. Articles: `unity-2d-core/{sprite-atlas-v2, sorting-layers-and-groups, pixel-perfect-camera}`, `unity-2d-tilemap/{rule-tiles, composite-collider-tilemap, procedural-tilemap-generation}`, `unity-2d-physics/{rigidbody2d-body-types, effectors-2d, contact-filters-and-allocation-free-queries}`, `unity-2d-animation/{skeletal-2d-animation, psd-importer-workflow, sprite-library-and-resolver}`, `unity-2d-lighting/{2d-lights-and-blend-styles, shadow-casters-2d, normal-mapped-sprites}`, `unity-2d-cameras/{cinemachine-2d-position-composer, confiner-2d, parallax-techniques}`, `unity-2d-gameplay/{coyote-time-and-jump-buffer, variable-jump-and-fall-gravity, dash-and-wall-jump}`. Each ships canonical-source link, ready-to-paste C# snippets, tuning ranges, and an anti-patterns table. Articles are bundled in `unity-kb-phase-b-2d.tar.gz` for push to the external `claude-dev-suite/knowledge_base` repo. Phase B for non-2D skills will follow in a later release.
- **`unity-2d-game` project template**: scaffolds a Unity 6 project with `_Project/` folder layout, asmdef-ready `Scripts/` root, sample `PlayerController2D.cs` (kinematic-style with coyote time + jump buffer + variable jump height + early-release detection), `CameraFollow2D.cs` starter, `.gitignore`, `.gitattributes` (Git LFS for `.psd` / `.fbx` / `.png` / `.wav` / `.aseprite` and Unity merge tool for `.unity` / `.prefab` / `.asset`), `.editorconfig`, and a templated `README.md` with placeholders for product / company / pixels-per-unit. `template.json` lists recommended packages: `com.unity.render-pipelines.universal`, `com.unity.inputsystem`, `com.unity.cinemachine`, `com.unity.2d.sprite`, `com.unity.2d.tilemap`, `com.unity.2d.tilemap.extras`, `com.unity.2d.animation`, `com.unity.2d.pixel-perfect`, `com.unity.test-framework`.
- **3 Unity automation recipes** in `automation-recipes.ts`: `unity-csharp-format` (Auto-format `.cs` files via dotnet format / CSharpier on Write/Edit), `unity-meta-check` (pre-commit guard for orphaned `.meta` files), `unity-no-binary-text` (pre-commit check that scenes / prefabs / assets are serialized as text — catches missing `Asset Serialization Mode = Force Text`).
- **README — Game Development Agents section**: new bullet under `What is Dev-Suite?` and a dedicated row in the Agents Reference table covering `unity-expert` and the 20 Unity skills. Stack detection bullet now lists Unity (2D, URP, HDRP, DOTS, Netcode, XR, Addressables, Cinemachine, Input System); auto-detection scan list now includes `ProjectSettings/ProjectVersion.txt` and `Packages/manifest.json`.
- **External MCP recommendation (not bundled)**: README and `unity-expert` agent recommend `CoplayDev/unity-mcp` (MIT) and `IvanMurzak/Unity-MCP` (Apache-2.0) as optional open-source MCP servers if the user wants Claude Code to drive the Unity Editor directly (scene / script / asset / profiler / build tools). Dev-suite does not bundle or require them — agents and skills work standalone.

---

## [1.3.0] - 2026-04-18

### Added

- **`list_docs` tool for documentation MCP server**: new tool that returns a compact catalog of all available KB articles (`{ technology: [topics...] }`), optionally filtered by category (24 categories: frontend, backend, rag, retrieval, embeddings, vector-stores, document-processing, rag-frameworks, rag-ops, etc.). Enables agent-driven retrieval — agents call `list_docs()` to discover what knowledge is available, then `fetch_docs(technology, topic)` to retrieve specific articles. Server version bumped to 2.4.0.
- **Knowledge Base Protocol for all agents**: updated 46 agent files — replaced `mcp__documentation__fetch_docs` with `mcp__documentation__*` wildcard in frontmatter (access to all documentation tools), and replaced the old `## Documentation Loading Protocol` section with a concise `## Knowledge Base Protocol` that instructs agents to call `list_docs()` for KB discovery before fetching deep-dive articles.
- **Knowledge base stubs for rag-expert skills (Phase 1)**: registered 85 new technologies in the `documentation` MCP server index across 7 new category files (`rag.ts`, `retrieval.ts`, `embeddings.ts`, `vector-stores.ts`, `document-processing.ts`, `rag-frameworks.ts`, `rag-ops.ts`) totalling 283 supported technologies. Pushed matching 85 stub `overview.md` files to the `claude-dev-suite/knowledge_base` repo (one per skill), cross-referencing the corresponding `SKILL.md` cheat-sheet and upstream canonical docs. Phase 2+ will replace stubs with full tutorials, benchmarks, paper summaries, troubleshooting, and migration guides.
- **rag-expert agent**: new deep-expertise agent for Retrieval-Augmented Generation systems. Comprehensive knowledge base across the full RAG stack. **Architecture & retrieval**: naive → advanced → agentic RAG, Self-RAG/CRAG/Adaptive, chunking strategies (recursive, semantic, contextual, parent-child, proposition-based, late chunking), query transformations (HyDE, multi-query, RAG-fusion, step-back, sub-query decomposition, self-querying, routing), hybrid search + RRF, advanced retrieval (parent-document, small-to-big, RAPTOR, auto-merging). **Retrieval algorithms**: ColBERT, SPLADE, BM25 deep tuning, RankGPT, cross-encoder training, Cohere/Voyage/BGE/Jina reranking. **Conversational/specialized**: conversational RAG with memory, streaming with citations, personalization, time-aware retrieval, tabular (NL2SQL hybrid), long-context vs RAG, feedback loops. **Graph RAG**: Microsoft GraphRAG, HippoRAG, entity resolution, knowledge graph construction, ontology-guided retrieval. **Multimodal**: vision, tables, audio (Whisper/AssemblyAI/Deepgram), video (keyframe + transcript). **Embeddings**: OpenAI/Voyage/Cohere/BGE/E5/Jina/Nomic/mxbai, multilingual, Matryoshka, fine-tuning, hard-negative mining, drift detection, semantic dedup. **Vector stores**: pgvector, Qdrant, Weaviate, Pinecone, Milvus, Redis, LanceDB, MongoDB Atlas, ChromaDB, OpenSearch, Vespa, Elasticsearch, ANN algorithms, quantization. **Ingestion**: PDF/DOCX/PPTX/XLSX/EML/audio/video/markdown/web-scraping, Airflow/Prefect/Dagster orchestration, Debezium/Kafka CDC. **Evaluation**: RAGAS, DeepEval, TruLens, ARES, Giskard RAGET, continuous evaluation in CI, shadow-mode deployment. **Guardrails/security**: hallucination detection, forced citations, NeMo Guardrails, PII redaction (Presidio), multi-tenant isolation, GDPR, indirect prompt injection. **Ops/infra**: TEI/Triton GPU serving, batch inference (OpenAI/Anthropic batches), cost allocation, multi-region deployment, LLM gateways (Portkey/OpenRouter/LiteLLM). **Frameworks**: LangChain 0.3+, LlamaIndex 0.12+, Haystack 2.x, DSPy 2.5+, LangGraph, Ragatouille, R2R, Canopy, txtai. **Observability**: LangSmith, Langfuse, Arize Phoenix, Comet Opik, OpenTelemetry GenAI. Ships with new skill categories: `skills/rag/`, `skills/retrieval/`, `skills/embeddings/`, `skills/vector-stores/`, `skills/document-processing/`, `skills/rag-frameworks/`, `skills/rag-ops/`.
- **Native Android / Kotlin detection**: `detection.service.ts` now recognizes Android modules (`com.android.application` / `com.android.library` plugins, including `libs.versions.toml` aliases) and classifies them as `mobile` projects with `frontend.framework = 'android-native'` and `runtime = 'kotlin'`. Detects **Room** (mapped to `dbType: 'sqlite'`, `orm: 'room'`), **Jetpack Compose**, and Kotlin as additional technologies. Java/Spring detection is skipped on Android modules so they're no longer mislabeled as JVM backends. New stack-to-agent mappings route Android projects to `mobile-expert`.
- **Project Rules wizard step**: a new step 4 in the installation wizard lets users select behavioral rules for Claude Code agents. Rules are copied to `.claude/rules/` in the target project and tracked in `.dev-suite.json`. Five templates are bundled: Conventional Commits ⭐, Semantic Versioning ⭐, Branch Protection, Changelog Maintenance ⭐, README Accuracy ⭐ (starred = pre-selected as recommended).
- **Remember last project folder**: the splash screen now pre-fills the last successfully opened project path on startup. The path is persisted in `dev-suite-prefs.json` inside the Electron user-data directory and validated (existence check) before use.
- **sysadmin-expert agent**: new agent for production server configuration covering Nginx, Caddy, Traefik, SSL/TLS (Let's Encrypt), DNS, UFW/fail2ban, systemd, WireGuard VPN, Prometheus/Grafana monitoring, backup strategies, server hardening, email infrastructure (SPF/DKIM/DMARC), zero-downtime deployments, load balancing, and WAF. Ships with 17 new skill files under `skills/infrastructure/`.

---

## [1.2.2] - 2026-04-04

### Fixed

- **Project selector — WSL Linux paths**: `validateProjectPath` in the Electron main process now correctly handles Windows UNC paths (`\\wsl$\Ubuntu\...`, `\\wsl.localhost\Ubuntu\...`) — backslashes are no longer corrupted by the forward-slash normalization, and traversal checks skip the server+share prefix as required by the UNC spec.
- **Project selector — manual path input**: the path field in the splash screen is now editable; users can type or paste any path (including WSL UNC paths) directly without having to use the Browse dialog. A WSL example hint is shown below the field.
- **Project selector — window too small**: splash window enlarged from 400×340 to 520×400.
- **Agent selection — checkbox click doesn't toggle**: clicking the checkbox element inside an agent card was calling `onToggleAgent` twice (once from `Checkbox.onChange` and once from the bubbled `Card.onClick`), causing the selection to double-toggle and appear broken. Fixed by making the Checkbox `pointer-events-none` so the Card's single `onClick` handler is the only toggle trigger.
- **Workflow template dropdown**: secondary subtasks (`{testing}`, `qa-expert`) are now marked `optional: true` — workflows like *Frontend Feature*, *Backend Feature*, *Full Stack Feature*, *Bug Fix*, and *Code Review* are no longer grayed out when a testing/QA agent isn't installed. Compatible workflows with skipped optional agents show a hint in the dropdown (e.g. `"Frontend Feature (no testing)"`). Adds `skippedAgents` tracking to `ResolvedWorkflow`.
- **Files viewer — "cannot load file" on Markdown and other files**: Shiki syntax highlighter now has a top-level `try/catch`; if the dynamic import or highlighting fails (e.g. inside Electron's asar bundle), the file content is rendered as escaped plain text instead of showing an error.

---

## [1.1.2] - 2026-04-03

### Added

- **creative-frontend-expert** agent — advanced animation (Framer Motion, GSAP), Three.js/R3F, SVG animation, Canvas/WebGL, advanced CSS effects
- **6 New Skills** — `animation/framer-motion`, `animation/gsap`, `graphics/three-js`, `graphics/svg-animation`, `graphics/canvas-webgl`, `styling/advanced-css-effects`
- **Files viewer API** — new `files.routes.ts` with read-only project file browsing endpoints

### Fixed

- **MCP server preparation** (`/prepare-servers`): route was ignoring the `failed[]` return value and always responding `success: true` even when individual servers failed to build
- **Install error message**: `Step5Install` was swallowing the real backend error and showing a generic message; now surfaces the actual error from the response body
- **Electron packaged app**: `prepareServers()` was attempting `npm install` on the pre-built `resources/dev-suite/mcp-servers/` directory (no `node_modules`, potentially read-only), throwing "Failed to install MCP dependencies" before installation even started; now skips npm install when all requested server `dist/index.js` files already exist
- **MCP server `npm install`**: `installMcpServer()` invoked npm via `npm.cmd` which looks for `npm-cli.js` relative to itself — unreliable in Electron where the bundled node's `node_modules/npm/` may be stripped; now calls `npm-cli.js` directly via `process.execPath`, falling back to system npm
- **Orchestrator path validation**: projects outside the home directory or on a different drive (e.g. `D:\projects\...`) were rejected with "Path must be within allowed workspace directories"; fixed by adding `PROJECT_PATH` (set by Electron at launch) to allowed roots and making comparisons case-insensitive on Windows
- **TypeScript build errors** (pre-existing, blocked CI): `useEffect` TDZ in `LivePerformancePanel`, `useRef` React 19 regression in `useOrchestratorWebSocket`, `unknown`-typed `summary`/`st` in `OrchestratorPanel`

---

## [1.1.1] - 2026-03-15

### Added

- **Python Integration Testing** — Complete Python integration testing infrastructure
  - **1 New Agent**
    - `python-integration-test-expert` — pytest, testcontainers-python, pytest-django, FastAPI TestClient, factory_boy, Celery testing, respx/responses/pytest-httpserver HTTP mocking, Pact contract testing
  - **5 New Skills**
    - `testing/python-integration` — Test pyramid, conftest.py architecture, pytest markers, GitHub Actions CI/CD, pytest-xdist parallel execution
    - `testing/testcontainers-python` — All container modules (PostgreSQL, MySQL, MongoDB, Redis, Kafka, RabbitMQ), wait strategies, async support, Docker Compose
    - `testing/pytest-django` — All `@pytest.mark.django_db` options, fixtures (db, client, rf, settings, mailoutbox, django_assert_num_queries), DRF APIClient, async views, factory_boy integration
    - `testing/fastapi-testing` — TestClient, AsyncClient/anyio, dependency overrides, JWT auth, WebSocket, file upload, HTTP mocking (respx, responses, pytest-httpserver)
    - `testing/factory-boy` — All declarations (Faker, Sequence, SubFactory, RelatedFactory, Trait, post_generation, Maybe, Dict), DjangoModelFactory, SQLAlchemyModelFactory
  - **7 Quick-Refs** added to `skills/testing/pytest/quick-ref/`
    - `testcontainers-python.md`, `integration-patterns.md`, `sqlalchemy-fixtures.md`, `alembic-testing.md`, `redis-kafka-testing.md`, `pact-python.md`, `grpc-testing.md`
  - **15 Knowledge Base files** across 7 new directories
    - `testcontainers-python/` — basics, databases (SQLAlchemy 2.0 savepoint, Alembic, async), messaging (Kafka, RabbitMQ, Celery)
    - `pytest-django/` — basics (all fixtures), advanced (DRF, async views, factory_boy, signals, management commands, Django Channels)
    - `fastapi-testing/` — basics, async (AsyncClient, anyio, lifespan), http-mocking (respx, responses, pytest-httpserver)
    - `factory-boy/` — basics (all declarations), advanced (traits, pytest-factoryboy, complex chains)
    - `celery-testing/` — pytest plugin, all fixtures, chains/chords/groups, retry, signals, Django integration
    - `python-integration-testing/` — patterns (test pyramid, CI/CD, xdist), sqlalchemy (savepoint isolation), alembic (migration testing)
    - `pact-python/` — consumer-driven contract testing, all matchers, provider verification, Pact Broker, V3 message pacts
  - **docs-index** updated — 7 new technologies registered in `mcp-servers/documentation/src/docs-index/testing.ts`

### Fixed

- **CI/CD** — E2E workflow now installs server dependencies and builds frontend before running Playwright tests
- **CI/CD** — E2E workflow uses 6-way sharding to stay within timeout limits
- **E2E Fixture** — Fixed race condition where `mainPage` fixture could capture DevTools window instead of the app window
- **CI/CD** — CI workflow now installs server dependencies before TypeScript build
- **Security** — Fixed 13 ReDoS vulnerabilities in codegen spec parsers (OpenAPI, AsyncAPI, TypeSpec, Protobuf, BPMN)
- **Security** — Fixed path-injection in `management.service.ts` `updateClaudeMd()` with `resolveProjectPath()` validation
- **Security** — Fixed path-injection in `code-review.routes.ts` with path containment check for file diffs

### Added

- **DriftWire / Industrial Automation Integration** — Full support for Python DCS/PLC engineering projects
  - **5 New Agents**
    - `streamlit-expert` — Streamlit UI specialist (session state, caching, forms, multipage, Docker, testing)
    - `data-engineering-expert` — pandas, openpyxl, lxml, bulk data pipelines, Excel/XML/CSV, UTF-16 file formats
    - `dcs-analyst` — ABB Freelance PRT/DMF/CSV file analysis, tag extraction, DCS reverse engineering (Opus model)
    - `freelance-engineer` — ABB Freelance engineering file generation, PRT/DMF bulk templating (Opus model)
    - `automation-architect` — DCS/PLC automation pipeline design, cross-platform (ABB, Siemens, Emerson, Honeywell) (Opus model)
  - **10 New Skills**
    - `backend-frameworks/streamlit` — Complete Streamlit reference (layout, widgets, caching, config, secrets, Docker)
    - `data-validation/pydantic` — Pydantic v2 (BaseModel, validators, Annotated types, pydantic-settings, serialization)
    - `data-processing/pandas` — pandas + openpyxl + lxml + UTF-16LE file handling, bulk generation patterns
    - `ai-integration/anthropic-python` — Anthropic Python SDK (messages, streaming, tool use, vision, async, Streamlit integration)
    - `best-practices/ruff` — Ruff linter/formatter (CLI, pyproject.toml config, rule sets, CI, pre-commit)
    - `industrial/freelance-formats` — ABB Freelance PRT/DMF/CSV format reference, section grammar, encoding rules
    - `industrial/isa-standards` — ISA-5.1 tag naming, ISA-88 batch, ISA-95 hierarchy, ISA-18.2 alarms, ISA-101 HMI
    - `industrial/dcs-platforms` — ABB Freelance, Siemens PCS7/TIA Portal, Emerson DeltaV, Honeywell Experion cross-platform reference
    - `industrial/iec61131` — IEC 61131-3 languages (LD/FBD/ST/IL/SFC), POUs, PLCopen, exchange formats
    - `industrial/bulk-engineering` — Bulk engineering pipeline, PRT templating, NAMUR NE 148, recommended tech stack
  - **Python detection extended** — `detection.service.ts` now detects `streamlit` as a backend framework and `ruff`, `pydantic`, `anthropic`, `openpyxl`, `pandas`, `lxml` as additional technologies from `requirements.txt`/`pyproject.toml`
  - **Detection constants** — `aiosqlite` added to `PYTHON_DB_RULES`; new `STACK_TO_AGENTS` mappings for `streamlit`, `pandas`, `openpyxl`, `lxml`, `pydantic`, `ruff`, `anthropic`
  - **2 New Registry Hooks** (`registry/features.json`)
    - `python-ruff-format-hook` — PostToolUse hook that runs `ruff format` + `ruff check --fix` on `.py` file saves
    - `pytest-smoke-hook` — SubagentStop hook triggering `qa-expert` with pytest after Python agent completions
  - **MCP metadata** — `database-query` server `detectedWhen` extended with `sqlite` and `sqlalchemy`

- **Code Generator** — Spec-driven code generation dashboard tab with 3-phase pipeline
  - Supports OpenAPI (JSON/YAML), AsyncAPI, TypeSpec, Protobuf, and BPMN spec formats
  - Deterministic code generation for 9 target languages/frameworks (TypeScript Express/Fastify/NestJS/Koa, Java Spring, Python FastAPI/Flask, Go Gin/Echo)
  - AI refinement phase using existing agents + dedicated `codegen-refinement` skill for naming, imports, error-handling adaptation
  - Convention scanner reads `.prettierrc`, `tsconfig.json`, ESLint config, and `package.json` to align generated code with project style
  - 5-step dashboard UI: Technology → Upload Spec → Configure → Preview → Generate
  - Drag-and-drop file upload with real-time spec validation
  - File browser with code preview and Accept All / Refine with Claude options
  - Backend: 8 REST endpoints with multer upload, Zod validation, rate limiting
  - New skill: `skills/codegen/codegen-refinement/SKILL.md`

---

## [1.1.0] - 2026-03-05

### Added

- **51 New Skills** covering AI, mobile, real-time, infrastructure, security, architecture, and production patterns
  - AI integration: `vector-databases`, `rag-patterns`, `etl-pipelines`
  - Mobile: `react-native`, `flutter`, `expo`
  - Real-time: `socket-io`, `sse`, `webrtc`
  - Infrastructure: `terraform`, `job-queues`, `cron-scheduling`, `api-gateway`, `health-checks`, `deployment-strategies`, `service-mesh`
  - Security: `rate-limiting`, `cryptography`, `audit-logging`, `gdpr`, `cors-security-headers`
  - Architecture: `ddd`, `event-sourcing-cqrs`, `multitenancy`
  - API design: `webhooks`, `pagination`, `grpc`
  - Testing: `load-testing`, `contract-testing`
  - Observability: `error-tracking`
  - Utilities: `pdf-generation`, `data-export`, `image-processing`, `charting`
  - Best practices: `resilience-patterns`, `caching-strategies`, `feature-flags`, `error-handling`
  - Other: `i18n`, `push-notifications`, `pwa`, `webauthn`, `stripe`
- **2 New Agents**
  - `mobile-expert` — React Native, Flutter, Expo, push notifications, payments
  - `cloud-expert` — AWS, Azure, GCP, Terraform, serverless, API gateway, service mesh
- **Comprehensive Agent-Skill Cross-Reference** — All 321 skills mapped to at least one agent, zero orphans, zero broken references. Extensive skill additions to 22 existing agents
- **Knowledge Base (Tier 1)** — 61 deep-dive documentation files across 13 technologies
  - Architecture: DDD (5 files), Event Sourcing/CQRS (5 files), Multitenancy (4 files)
  - AI: RAG Patterns (5 files), Vector Databases (5 files)
  - Security: Cryptography (5 files), GDPR (5 files)
  - Infrastructure: Terraform (5 files), Service Mesh (4 files)
  - Best Practices: Resilience Patterns (5 files), Caching Strategies (4 files)
  - Testing: Load Testing (5 files), Contract Testing (4 files)
- **Documentation MCP Server** — 3 new docs-index categories (architecture, ai, security) and updates to infrastructure, standards, testing indexes registering all 13 KB technologies
- **Messaging Integration Testing Skills** - Three new testing skills for message broker integration testing
  - `messaging-testing-kafka`, `messaging-testing-rabbitmq`, `messaging-testing` with quick-ref guides
  - Updated `testcontainers`, `spring-kafka`, and `spring-amqp` skills with test examples
- **Smoke Test Agent** - `smoke-test-expert` for post-implementation end-to-end verification with 7-phase pipeline and fix orchestration
- **New Component Discovery** - Surfaces agents/MCP servers added after initial installation with catalog snapshots
- **Angular/.NET Ecosystem** - `angular-expert` and `dotnet-expert` agents with 20+ new skills
- **Git Authentication Flow** - Dashboard Git panel detects auth errors and prompts `gh auth login`
- **Electron Performance** - Faster splash screen, lazy-loaded modules, NSIS installer

---

## [1.0.0] - 2026-02-06

### Initial Public Release

- **10 MCP Servers**: Documentation, Database Query, Docker Manager, API Tester, API Explorer, Log Analyzer, Performance Profiler, Code Quality, Security Scanner, Dashboard Bridge
- **34 Agents**: Core, Frontend, Backend, Testing, Database, Infrastructure, Messaging, Security experts (at release)
- **240+ Skills**: Framework-specific knowledge files with quick-reference guides (at release)
- **Web Dashboard**: React + TypeScript + Vite + TailwindCSS + Zustand frontend with Express TypeScript backend
- **Electron Desktop App**: Native desktop app with auto-updater and splash screen
- **Orchestrator**: WebSocket-based multi-agent task execution from dashboard
- **Code Review**: AI-powered code review with scope selection and multi-agent support
- **Git Integration**: Full Git operations panel with staging, commits, branches, and diff viewer
- **Templates**: Project scaffolding for React, Next.js, Spring Boot, Express, FastAPI, and more
- **Custom Agents**: Create and manage custom agents from the dashboard
- **Upgrade System**: Feature registry with upgrade detection and conflict resolution
- **Analytics**: Track knowledge base usage and agent performance

### Technical Stack

- **Frontend**: React 19, TypeScript, Vite, TailwindCSS, Zustand
- **Backend**: Express 5, TypeScript, Zod validation
- **Desktop**: Electron with auto-updates
- **MCP Servers**: TypeScript, npm workspaces
- **Knowledge Base**: Git-based on-demand fetching for 137 technologies

---

## Summary

| Version | MCP Servers | Agents | Skills | KB Files | Tools |
|---------|-------------|--------|--------|----------|-------|
| 1.1.1   | 10          | 47     | 337+   | 76+      | 79    |
| 1.1.0   | 10          | 41     | 321    | 61       | 79    |
| 1.0.0   | 10          | 34     | 240+   | —        | 79    |
