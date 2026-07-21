# Multi-Assistant Support — Planning Document

Status: **approved plan** (2026-07-21). Phases 0 and 1 complete; Phase 2 next.
Scope: make dev-suite generate configuration for multiple AI coding assistants, not only Claude Code.

## Decisions (locked 2026-07-21)

| # | Decision | Outcome |
|---|----------|---------|
| 1 | First targets | **GitHub Copilot (CLI + VS Code) and Cursor** (Tier 1); Codex CLI + Gemini CLI later (Tier 2); Windsurf/Devin + Cline last (Tier 3); Roo Code never (product discontinued May 2026) |
| 2 | Instructions file strategy | **`AGENTS.md` is the primary generated artifact** (marker-delimited dev-suite section). `CLAUDE.md` imports it via `@AGENTS.md` (officially supported import syntax, max 4 hops). Copilot reads AGENTS.md natively; `.github/copilot-instructions.md` generated only if needed. |
| 3 | Writes outside the project (home-dir MCP config for Copilot CLI etc.) | **Opt-in checkbox in the wizard**, off by default. Never write to the user's home directory silently. |
| 4 | Unified skills directory | *Amended after verification:* Claude Code does **not** read `.agents/skills/` (only `.claude/skills/`, `~/.claude/skills/`; symlinks need admin on Windows). Copilot and Cursor both read `.claude/skills/` directly. → **`.claude/skills/` stays the canonical physical location for Tier 1**; `.agents/skills/` added as dual-write in Phase 3 for Codex/Gemini. Revisit if Claude Code adds `.agents/skills/` discovery. |
| 5 | Orchestrator (chat/job-queue on `@anthropic-ai/claude-agent-sdk`) | **Out of scope — stays Claude-only.** Declare it as such in the UI. Multi-runtime orchestration is a separate future initiative. |

## Key research findings (July 2026)

- The **Agent Skills standard (SKILL.md)** is adopted by ~40 clients. Copilot, Cursor, Windsurf/Devin and Cline read `.claude/skills/` directly; Copilot CLI and Cursor also read `.claude/agents/`. Part of multi-assistant compatibility is therefore free.
- **`AGENTS.md`** (Linux Foundation / Agentic AI Foundation) is read natively by Codex, Copilot, Cursor, Windsurf/Devin, Zed, Amp, Cline. Not by Gemini CLI (needs `context.fileName` setting) nor by Claude Code (needs `@AGENTS.md` import in CLAUDE.md).
- **MCP is the only primitive requiring real per-tool conversion.** Nobody reads Claude Code's `.mcp.json`:
  - VS Code/Copilot: `.vscode/mcp.json`, top-level key **`servers`** (not `mcpServers`), `${env:VAR}`, `inputs` for secrets
  - Copilot CLI: `~/.copilot/mcp-config.json` (home dir → opt-in), `type: local`, `tools` allowlist
  - Cursor: `.cursor/mcp.json`, `mcpServers`, near-identical stdio entries, `${env:VAR}`
  - Gemini CLI: `.gemini/settings.json` key `mcpServers`; Codex: TOML `[mcp_servers.<n>]` in `.codex/config.toml` (trusted projects only); Windsurf/Cline: user-global config only
- Codebase state: the installation pipeline is tool-neutral until serialization; Claude coupling is concentrated in `toInstalledAgentContent()` (installation/file-operations.ts), scattered `.claude`/`.mcp.json`/`CLAUDE.md` path literals across ~15 services (no central path module), a duplicated `generateDevSuiteSection` (installation/claude-md.service.ts vs management.service.ts), Claude hook events/env vars in `hooks.constants.ts` and `registry/features.json`, and ~230 "Claude" occurrences in 35 frontend files.

## Target formats (Tier 1)

| Primitive | Copilot | Cursor |
|---|---|---|
| Instructions | `AGENTS.md` (native); `.github/instructions/*.instructions.md` with `applyTo:` for path-scoped rules | `AGENTS.md` (native, ≥1.6); `.cursor/rules/*.mdc` (`description`/`globs`/`alwaysApply`) for path-scoped rules |
| Agents | `.github/agents/*.agent.md` (fm: `name`, `description`, `tools`, `model`, `mcp-servers`; body ≤30k chars); CLI also reads `.claude/agents/` | `.cursor/agents/*.md` (fm: `name`, `description`, `model`, `readonly`, `is_background`); also reads `.claude/agents/` |
| Skills | reads `.claude/skills/` directly ✔ | reads `.claude/skills/` directly ✔ |
| MCP | `.vscode/mcp.json` (`servers`); CLI `~/.copilot/mcp-config.json` (opt-in) | `.cursor/mcp.json` (`mcpServers`) |
| Hooks | `.github/hooks/*.json` (v1 schema, command/http/prompt) | `.cursor/hooks.json` (camelCase events) |
| Settings/permissions | `.github/copilot/settings.json`; `--allow-tool` syntax | `.cursor/cli.json` (`permissions.allow/deny`) |

## Architecture

- **`target-layout.ts`**: per-tool descriptor `{ agentsDir, skillsDir, commandsDir, rulesDir, mcpConfigFile, instructionsFile, settingsFile, hooksLocation, capabilities }`. All services resolve paths through it; Claude Code is the first instance.
- **`TargetAdapter` interface**: `layout()`, `capabilities()`, `writeInstructions()`, `writeAgent()`, `writeSkills()`, `writeCommands()`, `writeMcpConfig()`, `writeHooks()`, `writeSettings()`. Single logical pipeline in `installation.service`; per-target writers at the end. `toInstalledAgentContent()` becomes the Claude adapter's transform.
- **Capability degradation**: adapters declare unsupported primitives (e.g. Windsurf has no file-based agents); pipeline skips and reports instead of failing.
- **Manifest**: `TrackedFile` gains a `target` discriminator (single `.dev-suite-manifest.json`, not per-target files). `ReinstallService.classify()`/erase/backup derive prefixes from the target layout so tools can coexist in one project. `custom/` guard and `<!-- dev-suite-managed -->` sentinels generalize as-is. Old manifests migrate on first reinstall/sync (implicit `target: 'claude-code'`).
- **Abstract model tiers**: `model: sonnet` in source frontmatter becomes a tier (`fast`/`balanced`/`powerful`) resolved per target.
- **Abstract hook events**: internal names (`before-tool`, `after-file-edit`, `agent-stop`) mapped per target; `registry/features.json` `apply.target` becomes logical (`settings`, `agent:<id>`), resolved by the adapter; update `features.schema.json`.
- **Assistant detection**: new `detection/assistant-detection.ts` probing `.claude/`, `.cursor/`, `.github/copilot-instructions.md`, `.codex/`, `.gemini/`, `.windsurf|.devin/`, `.clinerules`, `AGENTS.md` → wizard pre-selects targets; existing unmanaged `AGENTS.md` is merged via markers, never overwritten (backup rule applies).

## Phases

### Phase 0 — Quick wins (no refactoring) — **DONE**
- `AGENTS.md` carries the marker-delimited dev-suite section; `CLAUDE.md` is a pointer with `@AGENTS.md`.
- Section content made portable: no `.claude/rules/...` paths in the shared file (Claude Code auto-loads those rules via `paths:` frontmatter, so the pointer was informational only — no token-cost regression).
- Legacy installs migrate on next install/sync; user content outside markers preserved in both files; both tracked in the manifest.
- Result: instructions coverage for Copilot/Cursor/Codex/Windsurf/Zed at near-zero cost. Skills/agents already partially picked up by Copilot CLI and Cursor via `.claude/` compat.

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

### Phase 3 — Tier 2 (Codex CLI, Gemini CLI)
- Codex: `.codex/agents/*.toml`, TOML `[mcp_servers.*]` (trusted-project caveat), AGENTS.md already covered.
- Gemini: `.gemini/agents/*.md`, `mcpServers` in `.gemini/settings.json`, `context.fileName` setting for AGENTS.md, commands as TOML.
- `.agents/skills/` dual-write (Codex/Gemini/Cursor read it; Claude keeps `.claude/skills/`).
- Abstract hooks + logical `features.json` targets; settings/permissions writers.

### Phase 4 — Polish
- Tier 3 adapters with degradation (Windsurf/Devin, Cline).
- Content translation pass: lint agent/skill bodies for Claude-specific tool names (`Read`/`Edit`, `mcp__*`, `Task`/`subagent_type`) → neutral phrasing or per-target conditional sections.
- Commands → user-invocable skills where possible (skills are replacing slash commands ecosystem-wide).
- Per-target E2E; real-CLI smoke tests (Copilot CLI, Codex, Gemini) against a generated project.

## Testing strategy
- Refactor layout-coupled tests (installation, file-operations, claude-md, management, reinstall + CLI, upgrade/feature-applier, hooks, recipes, custom-agents, route tests, wizard E2E) to be layout-parametric; `describe.each(targets)` matrix as the regression net for each new adapter.
- Golden-file snapshots per writer per target; MCP converter fixtures per schema; multi-target coexistence tests (install Claude+Cursor → reinstall only Cursor → `.claude/` untouched).

## Risks / unverified items (re-verify at implementation time — conventions move fast)
- Copilot CLI repo-level MCP path (`.copilot/mcp-config.json`) confirmed only by third-party sources.
- `.prompt.md` slash commands not shipped in Copilot CLI standalone (issues #618/#1113 open at v1.0.71).
- Codex skills location inconsistency (`.agents/skills` documented vs `$CODEX_HOME/skills` in installers).
- AGENTS.md nested semantics differ per tool (Codex concatenates root-down; others "closest wins") → generate a single root AGENTS.md only.
- VS Code `chat.useAgentsMdFile` default is unclear across sources.
- Claude Code may add `.agents/skills/` discovery later → would simplify decision 4.

## Out of scope
- Orchestrator / chat / job-queue multi-runtime (stays on `@anthropic-ai/claude-agent-sdk`, preset `claude_code`).
- Roo Code support (discontinued; Kilo Code fork only if demand appears).
