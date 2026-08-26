# Multi-Assistant Support — Planning Document

Status: **Phase 2 complete** (2026-07-22) — Claude Code, GitHub Copilot and Cursor
are installable end to end (backend + wizard). Phases 3–4 (Codex/Gemini, then
Devin/Cline + content translation) remain. **Not yet released**: the version bump
and tagging happen at release time, on `main`, as a separate user-triggered step.
Scope: make dev-suite generate configuration for multiple AI coding assistants, not only Claude Code.

## Decisions (locked 2026-07-21)

| # | Decision | Outcome |
|---|----------|---------|
| 1 | First targets | **GitHub Copilot (CLI + VS Code) and Cursor** (Tier 1); Codex CLI + Gemini CLI later (Tier 2); Devin Desktop + Cline last (Tier 3); Roo Code never (product discontinued May 2026). *Naming note: Windsurf was rebranded **Devin Desktop** in June 2026 and Cascade reached EOL in July 2026 — the Tier 3 target is Devin Desktop, and legacy `.windsurf/` paths are still read during a transition period.* |
| 2 | Instructions file strategy | **`AGENTS.md` is the primary generated artifact** (marker-delimited dev-suite section). `CLAUDE.md` imports it via `@AGENTS.md` (officially supported import syntax, max 4 hops). Copilot reads AGENTS.md natively; `.github/copilot-instructions.md` generated only if needed. |
| 3 | Writes outside the project (home-dir MCP config for Copilot CLI etc.) | **Opt-in checkbox in the wizard**, off by default. Never write to the user's home directory silently. |
| 4 | Unified skills directory | *Amended after verification:* Claude Code does **not** read `.agents/skills/` (only `.claude/skills/`, `~/.claude/skills/`; symlinks need admin on Windows). Copilot and Cursor both read `.claude/skills/` directly. → **`.claude/skills/` stays the canonical physical location for Tier 1**; `.agents/skills/` added as dual-write in Phase 3 for Codex/Gemini. Revisit if Claude Code adds `.agents/skills/` discovery. |
| 5 | Orchestrator (chat/job-queue on `@anthropic-ai/claude-agent-sdk`) | **Out of scope — stays Claude-only.** Declare it as such in the UI. Multi-runtime orchestration is a separate future initiative. |

## Key research findings (July 2026)

*Superseded by [`docs/ASSISTANT-FORMAT-REFERENCE.md`](../ASSISTANT-FORMAT-REFERENCE.md)
for anything format-related — several claims in the original list were wrong. Kept
here only as the strategic shape of the problem:*

- Much of multi-assistant compatibility is **free**, because several tools read
  each other's directories. But no single skills directory reaches everyone:
  `.claude/skills/` + `.agents/skills/` together do.
- **`AGENTS.md`** is the one artifact nearly everyone reads. Two exceptions need
  a shim: Claude Code (`@AGENTS.md` import) and Gemini CLI (`context.fileName`).
- **MCP and path-scoped rules are the only primitives requiring real per-tool
  conversion** — they are the only two with no cross-tool overlap. Correction to
  the original claim that "nobody reads Claude Code's `.mcp.json`": Copilot CLI
  does, at project level.
- Codebase state: the installation pipeline is tool-neutral until serialization; Claude coupling is concentrated in `toInstalledAgentContent()` (installation/file-operations.ts), scattered `.claude`/`.mcp.json`/`CLAUDE.md` path literals across ~15 services (no central path module), a duplicated `generateDevSuiteSection` (installation/claude-md.service.ts vs management.service.ts), Claude hook events/env vars in `hooks.constants.ts` and `registry/features.json`, and ~230 "Claude" occurrences in 35 frontend files.

## Target formats

**Moved out of this document.** Formats for every supported assistant — Claude
Code, Copilot, Cursor, Codex CLI, Gemini CLI, Devin Desktop and Cline — live in
[`docs/ASSISTANT-FORMAT-REFERENCE.md`](../ASSISTANT-FORMAT-REFERENCE.md), which is
normative for implementers and carries per-claim confidence markers, an
unconfirmed register, and a ranked list of silent-breakage traps.

Kept here only because it is *planning* rather than *reference*: what the
verification changed about the plan itself.

### What slice 2.0 changed in the plan

**The big one: agents and skills need no second write.** Both Copilot and Cursor
read `.claude/agents/` and `.claude/skills/` directly. The planned agent writers
and any skills dual-write drop out of Tier 1 — a dev-suite install is already
discovered by both tools. What genuinely needs conversion is only **MCP config**
and **path-scoped rules**, because those two formats have no cross-tool overlap.
Fidelity caveat: our installed agent files carry Claude-native frontmatter
(`tools:`, `mcpServers:`, `skills:`) that is not in either tool's schema, so tool
restrictions and skill preload degrade to "ignored". Native per-target agent files
would recover that, but are now clearly optional rather than core.

**Corrections to earlier assumptions:**
- `.copilot/mcp-config.json` as a repo-level path is **refuted** — it is
  `.mcp.json` or `.github/mcp.json`. Notably that means Copilot CLI reads the very
  file dev-suite already writes; whether our entries validate without a `type` key
  is untested and is the first thing slice 2.2 should check.
- `chat.useAgentsMdFile` defaults to **true**, not false. Sources saying otherwise
  describe pre-1.104 behaviour.
- Copilot's 30k character cap is real but **scoped to the cloud-agent context**;
  VS Code documents no limit. Treat as a safe ceiling, not a hard constraint.
- Cursor's `globs` is an **unquoted comma-separated string**, not a YAML list.
  This is inferred from consistent doc examples rather than stated — and emitting
  a YAML list is exactly the kind of thing that fails silently, so it needs a
  golden-file test.

**New finding that affects already-shipped Phase 0 work:** Copilot CLI reads
`AGENTS.md` *and* `CLAUDE.md` natively and combines them without precedence. Our
`CLAUDE.md` pointer contains `@AGENTS.md`, and the CLI also supports
`@relative/path` includes — so on that surface the instructions may be loaded
twice. Harmless for correctness, wasteful for tokens. Verify against the real CLI
before the Phase 2 release; if confirmed, the fix is to make the pointer's import
Claude-only (e.g. keep the marker section but drop the bare `@AGENTS.md` line for
projects targeting Copilot CLI).

**Unconfirmed items** are tracked in the reference doc's register (Part 5), not
here — two of them (Devin Desktop MCP, Cline hooks path) are marked blocking.

## Architecture

- **`target-layout.ts`**: per-tool descriptor `{ agentsDir, skillsDir, commandsDir, rulesDir, mcpConfigFile, instructionsFile, settingsFile, hooksLocation, capabilities }`. All services resolve paths through it; Claude Code is the first instance.
- **`TargetAdapter` interface** *(implemented in 2.1, shape differs from the original sketch)*: a single `write(ctx)` rather than one method per primitive. Granular writers turned out to be the wrong cut — Copilot and Cursor need no agent or skill writer at all (they read `.claude/` directly), so most of the sketched methods would have been empty for most targets. `installation.service` resolves a tool-neutral `InstallPlan`, then hands it to one adapter per target. `toInstalledAgentContent()` moved into the Claude adapter, along with flat-skill installation and `skillListingBudgetFraction`.
- **Capability degradation**: adapters declare unsupported primitives (e.g. Cline can never receive committable MCP config — a permanent gap, not a missing adapter); pipeline skips and reports instead of failing.
- **Manifest**: `TrackedFile` gains a `target` discriminator (single `.dev-suite-manifest.json`, not per-target files). `ReinstallService.classify()`/erase/backup derive prefixes from the target layout so tools can coexist in one project. `custom/` guard and `<!-- dev-suite-managed -->` sentinels generalize as-is. Old manifests migrate on first reinstall/sync (implicit `target: 'claude-code'`).
- **Abstract model tiers**: `model: sonnet` in source frontmatter becomes a tier (`fast`/`balanced`/`powerful`) resolved per target.
- **Abstract hook events**: internal names (`before-tool`, `after-file-edit`, `agent-stop`) mapped per target; `registry/features.json` `apply.target` becomes logical (`settings`, `agent:<id>`), resolved by the adapter; update `features.schema.json`.
- **Assistant detection**: new `detection/assistant-detection.ts` probing `.claude/`, `.cursor/`, `.github/copilot-instructions.md`, `.codex/`, `.gemini/`, `.devin|.windsurf/`, `.clinerules`, `AGENTS.md` → wizard pre-selects targets; existing unmanaged `AGENTS.md` is merged via markers, never overwritten (backup rule applies).

## Phases

### Phase 0 — Quick wins (no refactoring) — **DONE**
- `AGENTS.md` carries the marker-delimited dev-suite section; `CLAUDE.md` is a pointer with `@AGENTS.md`.
- Section content made portable: no `.claude/rules/...` paths in the shared file (Claude Code auto-loads those rules via `paths:` frontmatter, so the pointer was informational only — no token-cost regression).
- Legacy installs migrate on next install/sync; user content outside markers preserved in both files; both tracked in the manifest.
- Result: instructions coverage for Copilot/Cursor/Codex/Devin/Cline/Zed at near-zero cost. Skills/agents already partially picked up by Copilot CLI and Cursor via `.claude/` compat.

### Phase 1 — Foundations (behavior-preserving refactor) — **DONE**
- **Done**: `services/targets/target-layout.ts` with descriptors for Claude Code / Copilot / Cursor, capability flags, `getManagedDirs`/`getSharedFiles`/`isCustomUserPath` helpers, `isImplemented` gating.
- **Done**: unified `generateDevSuiteSection` (management.service's diverging copy removed; its description sanitizer now applies on every path — it previously ran only on regeneration, so freshly installed instructions were unsanitized).
- **Done**: `target` on `TrackedFile`, `targets` on `ExtendedManifest`, transparent migration in `loadManifest` (`migrateManifestTargets`).
- **Done**: `ROOT_MANAGED_FILES` in reinstall so backup/rollback treat `AGENTS.md` and `CLAUDE.md` as a unit (restoring one without the other would leave a dangling import).
- **Done**: `services/targets/target-paths.ts` — resolves a layout descriptor into concrete paths for one project, in both project-relative POSIX form (manifest-facing) and absolute form (filesystem-facing). Accessors for optional locations throw rather than silently resolving to the project root.
- **Done**: literal sweep across installation, management, reinstall, custom-agents, recipes, claude-hooks, claude-md, package-installer and the installation routes. Every dev-suite-written path now derives from the descriptor.
- **Deliberately left as literals** (not layout-derived, with reasons):
  - `~/.claude/projects` in `orchestrator.routes.ts` — Claude Code's own session store, not something dev-suite writes.
  - `.claude/hooks/*.sh` entries in `hooks.constants.ts` — hook events/scripts are abstracted in Phase 3.
  - `.mcp-servers` in `utils/constants.ts` / `utils/fs-utils.ts` scan-exclusion lists — utils must not depend on services.

**Verified**: full suite green (2144 tests) plus a real install into a temp project — tree, manifest tagging and POSIX manifest paths all unchanged from before the sweep.

### Phase 2 — Tier 1 adapters (first multi-assistant release)
- `TargetAdapter` interface + Claude, Copilot, Cursor adapters.
- MCP converter: `.vscode/mcp.json` (`servers` key), `.cursor/mcp.json`, opt-in `~/.copilot/mcp-config.json`.
- Path-scoped rules writers: `.github/instructions/*.instructions.md` (`applyTo:`), `.cursor/rules/*.mdc` (`globs:`).
- Agent writers: `.github/agents/*.agent.md` (30k body cap check), `.cursor/agents/*.md`.
- Skills: keep `.claude/skills/` canonical (decision 4 amended).
- Assistant detection + wizard "Target assistants" multi-select step (+ home-dir opt-in checkbox).
- Reinstall/upgrade/uninstall scoped per target; CLI `--target` flag.
- UI de-branding where generic (hooks section naming, wizard copy); orchestrator/chat stays Claude-branded.
- Version bump: **MINOR**.

#### Phase 2 breakdown (5 slices, each ends green + committed)

Sequenced so the risky, unknown part (file formats) is proven before anything is
wired to users, and so nothing ships half-visible: the wizard only gains a target
picker once the write path behind it actually works.

**2.0 — Format re-verification gate** — **DONE 2026-07-21**
Results folded into the Tier 1 table above. Outcome: agents and skills need no
second write (both tools read `.claude/` directly), so Tier 1 conversion reduces
to MCP config + path-scoped rules. Five items remain unconfirmed and are listed
above as "do not encode assumptions".

**2.1 — Adapter seam** — **DONE 2026-07-22** *(pure refactor, no new targets, no user-visible change)*
Split `install()` at its natural seam. Lines 141-198 are already pure decision
making — nothing has touched disk — so they become an `InstallPlan`; everything
from line 200 becomes `TargetAdapter.write(plan)`. `ClaudeCodeAdapter` is the
only implementation and reproduces current behaviour exactly.
- Stays *outside* the adapter (per-project, not per-target): `.dev-suite.json`,
  `.dev-suite-manifest.json`, and the `.mcp-servers/<name>/` bundle copies —
  bundles are plain node packages, only the config file referencing them differs.
- Moves *into* the Claude adapter (Claude-specific, not general): `ensureSkillBudget`
  (`skillListingBudgetFraction` is a Claude Code setting) and `toInstalledAgentContent`.
- Everything else in `file-operations.ts` is tool-neutral and stays shared.
- Done when: suite green with no test rewrites beyond import paths, and a real
  install produces a byte-identical tree.

**2.2 — Copilot + Cursor writers** — **DONE 2026-07-22**

Outcome and the two decisions it forced:

- **Copilot CLI gets `.github/mcp.json`, not `.mcp.json`.** The open question was
  whether the CLI accepts the `.mcp.json` dev-suite already writes; it could not
  be answered — Copilot CLI is not installed on the dev machine, and the docs
  neither state that `type`/`tools` default nor that they are required. Rather
  than gamble on a default, we write the explicit CLI shape to the other
  documented project path. That also avoids putting Copilot-shaped entries into
  the file Claude Code owns, which is what lets both tools share a project.
- **Decision 3's home-directory opt-in is no longer needed for MCP.** It existed
  because Copilot CLI's MCP config was believed to be user-scope only. Both
  Copilot surfaces now have committable project-level files, so nothing needs to
  be written outside the project. Keep the opt-in mechanism for any future
  user-scope write, but Phase 2 does not require it.
- Rule and MCP writers are pure functions with golden-file tests. The Claude Code
  rule generator now uses the same module rather than holding a second copy of
  the format.

*Original scope, for reference:*
*Scope reduced by 2.0: agents and skills dropped — both tools read `.claude/`
directly.* What remains is the two formats with no cross-tool overlap:
- **MCP config**: `.vscode/mcp.json` (`servers`, `type: "stdio"`) and
  `.cursor/mcp.json` (`mcpServers`, `type: "stdio"`). Copilot CLI is a third
  shape (`type: "local"` + `tools` allowlist) at a user-scope path → opt-in,
  decision 3. **First task of this slice**: test whether Copilot CLI accepts the
  `.mcp.json` dev-suite already writes — if it does, that surface needs no writer
  at all.
- **Path-scoped rules**: `.github/instructions/*.instructions.md` (`applyTo`,
  comma-separated globs) and `.cursor/rules/*.mdc` (`description`/`globs`/
  `alwaysApply`). The `.mdc` `globs` value must be an unquoted comma-separated
  string — golden-file test required, since a YAML list would fail silently.
Both together rather than one at a time: what's left is small and shares structure.
Optional stretch (not required to ship): native agent files per target, to recover
the tool-restriction and skill-preload fidelity that Claude-native frontmatter
loses when read by another tool.

**2.3 — Multi-target plumbing + reinstall scoping** — **DONE 2026-07-22**

What shipped: `targets` on `InstallConfig` and `InstallRequestSchema` (validated
against `isImplemented`, so unimplemented targets 400 at the API and throw for
direct callers); `install()` loops one adapter per target and records them in the
manifest; both reinstall defects fixed; reinstall reconstructs its install config
with the manifest's targets. Suite +16, no existing tests changed. Only
`claude-code` is installable, so a second target isn't reachable yet — the loop
runs once and output is byte-identical to before.

Two scope calls made during the slice:
- **`--target` on the reinstall CLI was deferred**, not built. Reinstall derives
  its targets from the manifest, so a `--target` filter is inert until multiple
  targets can actually be installed. Adding a flag that does nothing is the
  silent-no-op smell the plan warns against; it moves to the slice where it can
  filter something real.
- **The Copilot/Cursor adapters are the remaining gap before 2.4** → done as
  **2.3b** (below).

**2.3b — Copilot + Cursor adapters + the `.claude/` substrate** — **DONE 2026-07-22**

The slice that makes multi-assistant actually work. `install(targets)` now
produces correct config for Claude Code, Copilot and Cursor, in any combination.

The substrate question, settled: `.claude/agents` and `.claude/skills` are
**shared infrastructure**, not the Claude Code target. Copilot and Cursor read
them directly, so they are written once by the service (a new
`installation/substrate.ts`, extracted from the Claude adapter) on every install
regardless of the target set — on the same footing as the `.mcp-servers/`
bundles. The Claude Code adapter shrank to what is genuinely Claude-specific:
`skillListingBudgetFraction`, `.mcp.json`, `.claude/rules`, the validator hook.

- Copilot adapter: `.vscode/mcp.json` (`servers`/stdio) **and** `.github/mcp.json`
  (`mcpServers`/local) — both surfaces — plus `.github/instructions/*`. Merges
  into existing MCP files; reports settings/hooks as skipped.
- Cursor adapter: `.cursor/mcp.json` + `.cursor/rules/*.mdc`, same merge/skip.
- Path-scoped rule *spec* computation extracted to
  `installation/path-scoped-rules.ts`; each target serializes with its own 2.2
  writer. `removePathScopedRules` now recognises every target's rules dir.
- `CLAUDE.md` pointer is written only when Claude Code is a selected target;
  `AGENTS.md` always (every Tier 1 assistant reads it natively).
- `isImplemented()` widened to `claude-code`/`copilot`/`cursor`, so the API and
  wizard accept them.

One defect the slice surfaced and fixed: a Copilot-only install still writes the
`.claude/` substrate, but `managedSurfaces(['copilot'])` didn't back up `.claude`,
so a failed reinstall could lose it. `managedSurfaces` now always includes the
Claude Code surfaces because the substrate is always present.

Verified by a real multi-target install (all three + Copilot-only) and a
multi-target reinstall round-trip. Suite 2216.

*Original scope, for reference:*
Thread `targets: TargetId[]` from request to manifest, and give reinstall/uninstall
a target dimension. Persistence needs no schema change — `ExtendedManifest.targets`,
`TrackedFile.target` and `migrateManifestTargets` already exist from Phase 1, and
`getManagedDirs`/`getSharedFiles`/`isCustomUserPath` were written for this and are
still unused.
Two real defects to fix here, both currently latent because only Claude Code has a
write path:
  - `componentName()` (reinstall.service.ts:400) basenames agent paths with a
    hardcoded `'.md'`. Copilot's `.agent.md` would yield `foo.agent`, so orphan
    detection and selection matching would silently miss every Copilot agent. Must
    use the layout's `agentFileExtension`.
  - `rootManagedFiles()` (reinstall.service.ts:80-92) drops any path containing `/`,
    and its comment claims those are covered by the config-dir tree backup. **That
    comment is wrong for Copilot**: backup copies `configDir` (`.github`), while the
    MCP file lives at `.vscode/mcp.json` — covered by neither. A failed Copilot
    reinstall would roll back without restoring its MCP config. Backup must collect
    the union of each target's config dirs *and* the parent dir of any nested config
    file. (Introduced in the Phase 1 sweep; comment is fixed as part of this slice.)
Also here: `validation/schemas.ts` `InstallRequestSchema` is already out of sync
with `InstallConfig` (missing `rules` and `skillLoadingMode`, carrying two legacy
booleans the service ignores, with a blind `as InstallConfig` cast at the route).
Fix that drift while adding `targets`, with the enum derived from `isImplemented()`
so the API rejects targets whose adapter hasn't landed.
Plus CLI `--target` (repeatable, mirroring `--keep`) and per-target result reporting.

**2.4 — Assistant detection + wizard step** — **DONE 2026-07-22**

Split into 2.4a (backend detection service + `/api/detect-assistants`) and 2.4b
(frontend). Both shipped:
- New "Target Assistants" wizard step (step 6, before Install) that self-fetches
  `/api/detect-assistants`, pre-selects the recommended targets, and requires at
  least one to proceed. Its selection flows into the install POST as `targets`.
- The home-dir opt-in checkbox was **not** needed after all (2.2 found both
  Copilot surfaces have committable project files), so it was dropped.
- The wizard's hardcoded step bounds were centralised into
  `wizard/steps.ts` (`WIZARD_STEPS` + `LAST_WIZARD_STEP`), consumed by the
  container, `ui.store`, `Layout` and `Sidebar`. This also fixed the sidebar
  labels, which were silently a step behind (5 entries for a 6-step wizard, no
  "Rules"). Inserting the step was then one edit, not eight.
- The stale `WizardContainer.test.tsx` (a hand-rolled mock asserting "Step N of
  5") was rewritten to exercise the real step registry and `Sidebar`.
- `InstallRequest.targets` added to both synced `api.ts` copies (type-sync check
  passes).

*Original scope, for reference:*
- `detection/assistant-detection.service.ts` as a **standalone** sub-service returning
  its own typed array — it is orthogonal to stack detection and `DetectionResult` has
  no natural slot for it. Markers table in `detection.constants.ts` derived from
  `TARGET_LAYOUTS` so it can't drift from the descriptors.
- New wizard step (copy `StepRules.tsx` — the closest existing pattern for a small
  fixed list) + home-dir opt-in checkbox for Copilot CLI's `~/.copilot/mcp-config.json`,
  off by default per decision 3.
- Non-obvious cost: the wizard hardcodes its bounds in ~8 places (`ui.store.ts` clamps
  at 6 in three methods, `WizardContainer`'s `< 6` checks, step-indicator arrays,
  `_getProgressInfo` totals), and the sidebar step labels are duplicated in
  `Layout.tsx` and `Sidebar.tsx` — **both already stale at 5 entries for a 6-step
  wizard**. Fix the duplication rather than adding a third copy.
- `wizard/__tests__/WizardContainer.test.tsx` doesn't render the real container; it
  mocks it and asserts "Step N of 5". It will break on the clamp change and should be
  made to exercise the real component instead of re-mocking.

**2.5 — De-branding + docs** — **DONE 2026-07-22** (release itself deferred)

- De-branded the 3 wizard copy strings that became misleading once the wizard
  serves several assistants (ModeSelection "Generate CLAUDE.md…", StepRules
  "Claude Code agents will follow…", Step3 "native Claude Code skills").
- **Did not touch the manage-UI Claude-hooks strings.** On reflection, gating
  the Hooks tab per target is a *feature*, not de-branding, and the strings are
  factually correct — it really does configure Claude Code hooks. Renaming or
  hiding it would misrepresent, not clarify. Recorded as a follow-up, not done
  under the banner of a de-brand pass. Orchestrator/chat stays Claude-branded
  (decision 5); internal `ClaudeHook*` type names stay.
- README gained a "Multi-Assistant Support" section + feature bullet + wizard
  step; the capability matrix is agent→MCP→skill, orthogonal, so untouched.
- **Version bump and release deferred by design.** Per the versioning-at-release
  memory, the bump happens once at release time against the last published
  version, on `main` — not per-iteration on a feature branch. Tagging/pushing
  triggers billed CI across three runners and is a user-triggered step. So the
  CHANGELOG stays under `[Unreleased]`; the release is the next action after this
  branch merges. It is a **MINOR** bump (new capability, backwards-compatible).

### Phase 3 — Tier 2 (Codex CLI, Gemini CLI)

**3.1 — Foundations + Gemini adapter** — **DONE 2026-07-22**
- Codex and Gemini descriptors added; `skillsSource: 'claude' | 'agents'` capability
  distinguishes who reads `.claude/skills` (Claude/Copilot/Cursor/Cline) from who
  reads the cross-tool `.agents/skills` (Codex/Gemini/Devin).
- **`.agents/skills` dual-write**: the substrate mirrors its `.claude/skills` tree
  to `.agents/skills` (byte-identical) whenever a selected target reads it, so
  Codex and Gemini — which read neither `.claude/agents` nor `.claude/skills` —
  still get the skills. `managedSurfaces` backs the mirror up.
- **Gemini adapter** (implemented): `.gemini/settings.json` with `mcpServers`
  (JSON, no `type` field) and a `context.fileName` that includes `AGENTS.md`
  (Gemini doesn't read it by default) while preserving the user's own context
  files and settings. Merges, and refuses to clobber an unparseable file.
- Reported as skipped for Gemini: native subagents (routing rides in AGENTS.md)
  and glob rules (Gemini has none). `isImplemented` now includes `gemini`.

**3.2 — Codex adapter** — **DONE 2026-07-22**
- Codex MCP config written as `[mcp_servers.<name>]` TOML tables in
  `.codex/config.toml`, via a **section-level text merge** (no TOML dependency):
  the file is split at top-level headers, dev-suite's own server tables are
  replaced, and everything else — the user's tables, their own MCP servers, and
  their comments — is preserved verbatim. Values are TOML-escaped (Windows paths,
  quotes). An array-of-tables (`[[...]]`) is never mistaken for one of our
  sections. Golden tests cover fresh write, merge, stale-drop, and escaping.
- The trusted-project caveat and the absence of native agent-role TOML are
  surfaced as advisory skipped entries.
- `isImplemented` now includes `codex`. Codex is fully installable: AGENTS.md +
  `.agents/skills` (both via the shared substrate) + MCP config.

**Phase 3 status: Codex and Gemini both installable.** Remaining Phase 3 items —
abstract hooks and logical `features.json` targets — are independent of the
adapters and can follow when hook portability is tackled.

---

*Original Phase 3 scope:*
- Codex: `.codex/agents/*.toml`, TOML `[mcp_servers.*]` (trusted-project caveat), AGENTS.md already covered.
- Gemini: `.gemini/agents/*.md`, `mcpServers` in `.gemini/settings.json`, `context.fileName` setting for AGENTS.md, commands as TOML.
- `.agents/skills/` dual-write (Codex/Gemini/Cursor read it; Claude keeps `.claude/skills/`).
- Abstract hooks + logical `features.json` targets; settings/permissions writers.

### Phase 4 — Polish

**4.1 — Cline adapter (Tier 3, first)** — **DONE 2026-07-22**
Cline was the safe Tier 3 target: its formats are documented and confirmed, unlike
Devin Desktop (rebranded, Cascade EOL, MCP status PLAUSIBLE-only). Cline reads
`AGENTS.md` and the `.claude/skills` substrate directly, so the adapter writes only
path-scoped rules to `.clinerules/*.md` — `paths:` YAML frontmatter (same key as
Claude) with a tool-neutral body (Cline has no Task-tool delegation). MCP
(user-global only) and file-based agents (SDK/CLI only, not the VS Code extension)
are reported as **permanent** skipped gaps, not unfinished work. `isImplemented`
now includes `cline`; six assistants are selectable.

**4.2 — Native Gemini subagents** — **DONE 2026-07-22**
Gemini was the one target with no delegatable subagents (it reads neither
`.claude/agents` nor the substrate — only AGENTS.md routing). The adapter now
generates `.gemini/agents/<id>.md` per installed agent: Gemini frontmatter
(`name`/`description`/`kind: local`) over the agent's own role body, carried
verbatim. `tools`/`model` are deliberately omitted so no Claude tool/model name
is mapped onto Gemini. The body is the same prose Copilot and Cursor already read
from `.claude/agents`, so Gemini is on equal footing.

*Deliberately not done — content-translation of agent bodies:* the bodies still
carry the occasional Claude tool name (`Edit`/`Write`). A regex prose-neutralizer
is fragile (easy to garble domain text) and can't be validated without a real
CLI, so it stays deferred; shipping the body verbatim matches what the other
`.claude/agents`-reading assistants already get.

**4.3 — Kimi Code adapter** — **DONE 2026-07-28**
Not in the original tier plan; added after a compatibility study of Moonshot's
docs (§3.8 of the format reference, written before any code, per this repo's
doc-first rule). Kimi Code turned out to be the cheapest target yet: it reads the
root `AGENTS.md` natively and skills from `.agents/skills`, both already produced
for Codex/Gemini, so only `.kimi-code/mcp.json` (JSON `mcpServers`, no `type`
discriminator, merged) and native subagents `.kimi-code/agents/<id>.md` are
Kimi-specific. `isImplemented` now includes `kimi-code`; seven assistants are
selectable.

Three decisions worth recording:
- **`.kimi-code/agents/` over the generic `.agents/agents/`** — both are "Project"
  scope with undocumented precedence, and no other vendor reads `.agents/agents/`
  today, so the generic path buys no portability while risking double
  registration.
- **Never emit `override`, never a built-in name** (`agent`, `coder`, `explore`,
  `plan`). Kimi's docs warn that a project agent file with `override: true`
  replaces the main agent's entire system prompt — a generator that emits it
  would turn every install into that attack. Enforced in the writer and tested.
- **Kimi Code only, not legacy `kimi-cli`.** The legacy generation reads
  `.claude/skills` (so it is already served by the substrate) and has no
  project-level MCP config at all. Its `.kimi` directory is still a detection
  marker so those users get pre-selected.

*Known unknown, deliberately not worked around:* Kimi renders an agent body as a
`${var}` template on every prompt build, and unknown-placeholder behaviour is
undocumented. Agent prose carries `${...}` inside code examples; rewriting those
examples would damage the content, so the adapter reports the affected agents as
a skipped capability instead. Register entry 16 tracks the empirical check.

*Surfaced while doing 4.3 — `SkippedCapability` never reaches the user.* Every
adapter's `skipped[]` (Codex's trust gate, Cline's permanent MCP gap, Kimi's
template-variable advisory) is only `logger.info`'d in `installation.service.ts`;
`install()` returns no warnings channel and the wizard shows nothing. The
degradation model is only half-built: adapters degrade correctly, but the user is
never told. Wiring `skipped[]` into the install result and the wizard's summary
step is a small, cross-cutting Phase 4 item — and it is what makes every
"reported rather than silently missing" claim in this document actually true.

**Remaining Phase 4**: Devin Desktop adapter (blocked on verifying Desktop reads
`.devin/config.json` for MCP), native subagents for Codex (`.codex/agents/*.toml`
with `deny_unknown_fields` — risky, needs real-CLI validation), **native Copilot
agents** (`.github/agents/*.agent.md`, 30k body cap — would cover the Copilot CLI
surface, which reads only that path and NOT `.claude/agents`, and would enrich VS
Code with tool restrictions; surfaced by the 2026-07-22 re-verification), safe
content-translation of agent bodies, and real-CLI E2E smoke tests. Plus the
Phase 3 residual (abstract hooks + logical `features.json` targets).

### Format re-verification (2026-07-22)

Every written format cross-checked against official docs after implementation —
all CONFIRMED. See docs/ASSISTANT-FORMAT-REFERENCE.md "Post-implementation
re-verification" for the two findings (Copilot CLI agents gap → now reported +
follow-up above; Cursor `globs` leading-`*` YAML edge → hardened by reordering).

*Original Phase 4 scope:*
- Tier 3 adapters with degradation (Devin Desktop, Cline — note Cline's MCP gap is permanent).
- Content translation pass: lint agent/skill bodies for Claude-specific tool names (`Read`/`Edit`, `mcp__*`, `Task`/`subagent_type`) → neutral phrasing or per-target conditional sections.
- Commands → user-invocable skills where possible (skills are replacing slash commands ecosystem-wide).
- Per-target E2E; real-CLI smoke tests (Copilot CLI, Codex, Gemini) against a generated project.

## Testing strategy
- Refactor layout-coupled tests (installation, file-operations, claude-md, management, reinstall + CLI, upgrade/feature-applier, hooks, recipes, custom-agents, route tests, wizard E2E) to be layout-parametric; `describe.each(targets)` matrix as the regression net for each new adapter.
- Golden-file snapshots per writer per target; MCP converter fixtures per schema; multi-target coexistence tests (install Claude+Cursor → reinstall only Cursor → `.claude/` untouched).

## Risks / unverified items (re-verify at implementation time — conventions move fast)

Tier 1 items were re-verified on 2026-07-21; see "Still unconfirmed after 2.0"
above for what survived. Resolved since the original plan:
- ~~Copilot CLI repo-level MCP path~~ → refuted, it is `.mcp.json` / `.github/mcp.json`.
- ~~VS Code `chat.useAgentsMdFile` default unclear~~ → defaults to `true` since v1.104.

Still open, mostly Tier 2/3 (verify when those phases start):
- `.prompt.md` slash commands not shipped in Copilot CLI standalone (issues #618/#1113 open at v1.0.71).
- Codex skills location inconsistency (`.agents/skills` documented vs `$CODEX_HOME/skills` in installers).
- AGENTS.md nested semantics differ per tool (Codex concatenates root-down; others "closest wins") → generate a single root AGENTS.md only.
- Claude Code may add `.agents/skills/` discovery later → would simplify decision 4.
- Copilot CLI may double-load instructions via `AGENTS.md` + our `CLAUDE.md` pointer (see 2.0 findings).

## Out of scope
- Orchestrator / chat / job-queue multi-runtime (stays on `@anthropic-ai/claude-agent-sdk`, preset `claude_code`).
- Roo Code support (discontinued; Kilo Code fork only if demand appears).
