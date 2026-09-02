# Dev-Suite Development Guide

Dev-suite is a library/toolkit that extends Claude Code with agents, skills, MCP servers, and a configuration dashboard. **This is a source repository — it contains NO active MCP servers, NO `.mcp.json`, NO `.mcp-servers/`, and NO runtime configuration.** See README.md for user-facing documentation.

## Architecture

```
dev-suite/
├── agents/{category}/{name}-expert.md      # Specialized agents (YAML frontmatter)
├── skills/{category}/{tech}/SKILL.md       # Skill files + optional quick-ref/
├── mcp-servers/{name}/                     # MCP server source (TypeScript, npm workspaces)
│   ├── src/index.ts                        # Server implementation
│   └── metadata.json                       # Server metadata (tools, envVars, detectedWhen)
├── mcp-servers/shared/                     # @dev-suite/shared — SSRF + path guards used by
│                                           #   several servers; consumed as source, no metadata.json
├── configurator/dashboard/
│   ├── src/                                # React frontend (Vite + TailwindCSS + Zustand)
│   ├── server/src/services/                # Express backend services
│   ├── server/tests/                       # Vitest unit tests
│   └── electron/                           # Electron desktop app (main.cjs, preload.cjs, updater.cjs)
├── registry/features.json                  # Upgrade feature registry (+ its JSON schema)
├── presets/                                # Stack preset data — not wired to any consumer yet
├── rules/                                  # Project rule templates offered by the wizard
├── templates/                              # Project scaffolding templates + hook scripts
├── commands/                               # Slash commands (installed into .claude/commands)
├── scripts/                                # CI gates + setup: validate-catalog, audit-mcp-descriptions,
│                                           #   check-docs-sync, check-type-sync, gen-* doc generators
└── init-project.sh|ps1                     # Entry point (builds if needed, launches dashboard)
```

## Critical Rules

### DO NOT:
1. **Create `.mcp.json` or `.mcp-servers/` in this repository** — MCP servers exist only as source code under `mcp-servers/*/src/`
2. **Hardcode component lists** — Derive agents from a filesystem scan, MCP servers from the `mcp-servers/package.json` workspaces, env vars from each `metadata.json`. Framework detection lives in `detection.service.ts`; `registry/features.json` is the upgrade feature registry only, and there is no `frameworks.json`.
3. **Hardcode counts in docs** — Never write exact counts of agents, skills, MCP servers, or technologies in CLAUDE.md or README.md; derive dynamically when needed (e.g., `find agents -name '*.md' | wc -l`)
4. **Skip backup creation** — Dashboard MUST create `.dev-suite-backup/` before overwriting any user files
5. **Use relative paths in generated `.mcp.json`** — All paths must be absolute via `path.resolve()`
6. **Modify installed components in target projects manually** — Use `/reconfigure` command or dashboard

### DO:
1. **Keep components loosely coupled** — Agents declare skills/MCP servers in frontmatter → Skills reference KB docs → MCP `metadata.json` declares `recommendedFor`/`detectedWhen`. MCP servers are never required — agents must work without them.
2. **Update metadata when adding components** — Add to `mcp-servers/package.json` workspaces, create `metadata.json`, add YAML frontmatter
3. **Use dynamic configuration** — Load the feature registry from `registry/features.json`, parse each `metadata.json`, extract YAML frontmatter
4. **Test cross-platform** — `init-project.sh` (Linux/macOS) + `init-project.ps1` (Windows)
5. **Validate generated config** — Check `.mcp.json` syntax, verify absolute paths, ensure env vars are set
6. **Record `availableAtInstall` catalog snapshot** — `installation.service.ts` writes this to `.dev-suite-manifest.json` for new-component discovery
7. **Verify documentation before committing** — Before creating any git commit that includes changes to `agents/`, `skills/`, `mcp-servers/`, or `configurator/dashboard/server/src/services/detection/`, verify that README.md agent/skill/MCP-server tables and technology lists still match the filesystem. Also check if CHANGELOG.md needs an entry. Fix any stale documentation before committing.

## Key Patterns

### Agent Frontmatter Fields
```yaml
---
name: react-expert              # Agent identifier
description: |                  # Multi-line description
  React specialist...
model: sonnet                   # Optional: model override (sonnet, haiku, opus)
# Restricts tool access. `mcp__<server>__*` entries are also how most agents
# declare their MCP access — the explicit `mcp_servers:` list below is optional
# and only 13 of the agents use it.
allowed-tools: Read, Write, Edit, Glob, Grep, mcp__documentation__*
core_skills:                    # Installed with the agent — full `{category}/{name}` paths
  - frontend-frameworks/react
  - frontend-frameworks/react-hooks
  - languages/typescript
extended_skills:                # Reachable on demand via the skill-loader MCP server
  - state-management/zustand
  - styling/tailwindcss
mcp_servers:                    # Optional explicit list, in addition to allowed-tools
  - documentation
---
```

`allowed-tools` is **required** — an agent without it inherits every tool by
omission rather than by design, and `validate-catalog.mjs` now fails on it. The
same gate fails an agent whose body gives execution instructions without `Bash`,
or delegates without `Task`: three shipped agents were instructed to run test
suites they had no way to run.

Prefer **one** `core_skills` entry. A subagent's `skills:` frontmatter injects
the **full body** of each listed skill at startup (~1.8k tokens each), in every
subagent spawned from that agent — so the cost multiplies with the width of a
fan-out. Core is the skill the agent cannot work without on its first turn;
everything else goes to `extended_skills` and is one `Skill` call away.

Both halves of that are measured, not inferred, so they do not need re-deriving:
a probe agent declaring one 41 KB skill and holding no file-reading tools quoted
a sentinel from the **last line** of that skill's body, while the same agent
without the declaration saw nothing — and the declaration cost ~17.7k additional
cache-creation tokens. The same undeclared agent then loaded the same skill
through the `Skill` tool and saw the sentinel, so `extended_skills` costs a
round trip, not the skill. Installed agents always receive `Skill` in `tools`
(`toInstalledAgentContent`, `grantSkillTool`), which is what makes the extended
tier reachable at all.

Skill entries are directory paths under `skills/`, not bare names: `frontend-frameworks/react`
resolves to `skills/frontend-frameworks/react/SKILL.md`. `validate-catalog.mjs` fails on a path
that does not exist. An agent with 60+ skills can collapse them with `- bundle:<namespace>/<name>`
(see `services/agent-bundles.ts`), expanded at install time.

### MCP Server Metadata Fields
Each `mcp-servers/{name}/metadata.json` contains: `name`, `description`, `shortDescription`, `category`, `tools[]`, `envVars[]` (with `name`, `description`, `default`, `required`), `recommendedFor[]` (agent IDs that benefit from this server — never required), `detectedWhen[]` (technology keywords).

### Naming Conventions

| Component | Pattern | Example |
|-----------|---------|---------|
| Agents | `{technology}-expert.md` | `react-expert.md` |
| Skills | `SKILL.md` in a `{category}/{tech}` folder | `frontend-frameworks/react/SKILL.md` |
| MCP servers | lowercase with hyphens | `api-tester`, `database-query` |
| Commands | `{command-name}.md` | `init-project.md` |
| Registry | `{purpose}.json` | `features.json` |

### Generated Files in Target Projects

Always, whichever assistants were selected:
`AGENTS.md`, `.dev-suite.json`, `.dev-suite-manifest.json`, `.claude/agents/`, `.claude/skills/`,
`.mcp-servers/*/`

Per selected target (derive the authoritative list from `targets/target-layout.ts`):

| Target | Files |
|--------|-------|
| `claude-code` | `CLAUDE.md`, `.mcp.json`, `.claude/rules/`, `.claude/commands/`, `.claude/settings.json` |
| `copilot` | `.vscode/mcp.json`, `.github/mcp.json`, `.github/instructions/` |
| `cursor` | `.cursor/mcp.json`, `.cursor/rules/` |
| `gemini` | `.gemini/settings.json`, `.gemini/agents/`, `.agents/skills/` |
| `codex` | `.codex/config.toml`, `.agents/skills/` |
| `cline` | `.clinerules/` |
| `kimi-code` | `.kimi-code/mcp.json`, `.kimi-code/agents/`, `.agents/skills/` |

`CLAUDE.md` and `.mcp.json` are **not** written unless `claude-code` is a target. Slash commands
are Claude-Code-only — no other assistant reads `.claude/commands`.

`AGENTS.md` holds the generated routing section (cross-assistant standard); `CLAUDE.md` is a
pointer that imports it via `@AGENTS.md`, since Claude Code does not read AGENTS.md natively.
Never duplicate routing content across the two.

## Service Map

Path: `configurator/dashboard/server/src/services/`

| Service | Purpose |
|---------|---------|
| `agents.service.ts` | Load agent metadata from YAML frontmatter, load MCP metadata from metadata.json |
| `analytics.service.ts` | Track knowledge base usage and correlate with orchestrator jobs |
| `best-practices-validator.service.ts` | Validate projects against best practices rules |
| `code-review.service.ts` | Code review job creation and management |
| `custom-agents.service.ts` | User-created custom agent management |
| `detection.service.ts` | Detect project stack (frameworks, databases, Git provider) |
| `detection/assistant-detection.service.ts` | Detect which AI assistants a project already uses (marker files + manifest targets) and recommend which to pre-select in the wizard |
| `git.service.ts` | Git operations and repository management |
| `hooks.service.ts` | Git and Claude Code hooks management |
| `installation.service.ts` | Copy files, install MCP servers, generate config, record catalog snapshot |
| `management.service.ts` | Manage installed components, discover new ones, and regenerate the instructions files (routing goes into `AGENTS.md`; `CLAUDE.md` only imports it) — delegates to `installation/claude-md.service.ts` |
| `recipes.service.ts` | Pre-built workflow recipes for common tasks |
| `templates.service.ts` | Project scaffolding template management |
| `upgrade.service.ts` | Apply incremental `hook-merge` features to installed dev-suite components |
| `reinstall.service.ts` | Transactional erase-and-replace reinstall/sync (scoped erase of managed files + re-install from source, backup + rollback, orphan removal, per-file opt-out). Target-aware: classification, backup and rollback derive per-file layout from `file.target`, so several assistants can coexist in one project |
| `release-check.service.ts` | Check the latest GitHub release vs the running dev-suite version (cached, semver compare, graceful on network/rate-limit errors) |
| `workflows.service.ts` | Multi-step workflow orchestration |
| `codegen.service.ts` | Spec-driven code generation pipeline with validation and AI refinement |
| `rules.service.ts` | List available project rule templates from the `rules/` directory |
| `usage.service.ts` | Fetch usage/billing data from the Anthropic Admin API for the Usage panel |
| `credentials.service.ts` | Store, mask, and verify the Anthropic credential the Agent SDK runs the model with — API key or `setup-token` OAuth token, kept in `~/.dev-suite/credentials.json` and layered over `process.env` per call via the SDK's `options.env`. Distinct from the per-project Admin API key `usage.service.ts` uses: that one only reports usage and cannot run the model |
| `agent-bundles.ts` | Expand `bundle:` skill references in agent frontmatter into concrete skill directory lists |
| `targets/target-layout.ts` | Per-assistant layout descriptors (directories, instructions/MCP/settings files) + capability flags; the single source of truth for target paths. **Formats these descriptors encode are specified in `docs/ASSISTANT-FORMAT-REFERENCE.md` — read it before touching any target adapter, and never research assistant formats independently** |
| `targets/target-paths.ts` | Resolve a layout descriptor into one project's concrete paths (relative POSIX for the manifest, absolute for filesystem calls) |
| `targets/target-adapter.ts` | The seam between deciding what to install (tool-neutral `InstallPlan`) and writing it for one assistant; capability-degradation reporting |
| `targets/adapters/claude-code.adapter.ts` | Writes Claude-Code-specific config: `skillListingBudgetFraction`, `.mcp.json`, `.claude/rules`, validator hook (the `.claude/` agent+skill substrate is shared, see below) |
| `targets/adapters/copilot.adapter.ts` | Writes Copilot config: `.vscode/mcp.json` (VS Code) + `.github/mcp.json` (CLI) + `.github/instructions/*`; merges into existing MCP files |
| `targets/adapters/cursor.adapter.ts` | Writes Cursor config: `.cursor/mcp.json` + `.cursor/rules/*.mdc`; merges into existing MCP files |
| `targets/adapters/gemini.adapter.ts` | Writes Gemini config: `.gemini/settings.json` (mcpServers + `context.fileName`) and native subagents `.gemini/agents/*.md`; reads skills from `.agents/skills` mirror |
| `targets/adapters/codex.adapter.ts` | Writes Codex MCP config: `[mcp_servers.*]` in `.codex/config.toml` (TOML merge); reads AGENTS.md + `.agents/skills` natively; surfaces the trusted-project caveat |
| `targets/adapters/cline.adapter.ts` | Writes Cline path-scoped rules to `.clinerules/*.md` (`paths:`, neutral body); reads AGENTS.md + `.claude/skills`; reports MCP + native-agents as permanent skipped gaps |
| `targets/adapters/kimi.adapter.ts` | Writes Kimi Code config: `.kimi-code/mcp.json` (JSON merge) + native subagents `.kimi-code/agents/*.md`; reads AGENTS.md + `.agents/skills`; refuses built-in agent names and reports `${...}`-templated agent bodies |
| `installation/substrate.ts` | Install the shared `.claude/agents`+`.claude/skills` substrate once per install (Copilot/Cursor read it directly); mirror skills to `.agents/skills` when a target reads that instead (Codex/Gemini) |
| `installation/path-scoped-rules.ts` | Compute glob-scoped rule specs from installed agents and write them per target via the 2.2 writers |
| `installation/mcp-config-file.ts` | Read/write+track an assistant'"'"'s MCP config file on disk (merge side; rendering is the pure writer) |
| `installation/manifest-tracking.ts` | Record written files (with hash and target) in the extended manifest; shared by the service and every adapter |
| `installation/commands.ts` | Copy the project-facing slash commands into `.claude/commands` (Claude Code only) and track them; maintainer-only commands are excluded |
| `installation/uninstall.ts` | Safe removal: un-merges the files dev-suite shares with the user (`AGENTS.md`, `.codex/config.toml`, every MCP config) instead of deleting them, bounds-checks every manifest path, and walks owned trees file by file so `custom/` and foreign skills survive |
| `installation/drift.service.ts` | Classify every tracked file against its manifest baseline (`drift-in-section`, `acknowledged`, `deleted`, …). Nothing locks a project while concurrent agents edit it, so a managed file can change under an install; for marker-delimited files only the span between the markers is compared, since the user's prose around it changes legitimately |
| `installation/secret-store.ts` | Per-project credential store in `~/.dev-suite/env/<id>.json` (0600). The only recovery path used to be reading values back out of the MCP configs, which a worktree does not have — so a reinstall there wiped them |
| `installation/worktree.ts` | Detect a linked git worktree. It contains only *tracked* files, so a gitignored MCP config is simply absent and agents run against a project with no dev-suite unless something says so |
| `installation/materialize-local.ts` | Rebuild this checkout's MCP configs from the committed manifest plus the local secret store — the fix for the worktree case, with no secret committed |
| `installation/project-lock.ts` | Serialise every operation that rewrites a project's installation (install, reinstall, add/remove). Re-entrant, because reinstall and the Manage tab delegate to `install()` — the manifest is written last, so two overlapping runs produced a record describing neither |
| `installation/write-guard.ts` | Snapshot the surfaces an install may overwrite, and restore them if it throws — the manifest is written last, so without this a failed install left untracked files behind |
| `installation/managed-file.ts` | Write a file only when dev-suite owns it: reads the previous manifest so a hand-written `.gemini/agents/*.md`, `.claude/agents/*.md` or rule file is preserved and reported, never clobbered |
| `installation/skill-ownership.ts` | Ownership sentinel for installed skill directories, so a re-install removes its own skills and never the user's or another tool's in `.agents/skills` |
| `installation/managed-surfaces.ts` | The per-target set of paths a write touches; shared by install's backup and reinstall's, and layout-derived so neither service depends on the other |
| `installation/install-recovery.ts` | Recover env vars and the skill-loading mode from **every** selected assistant's MCP config (JSON and Codex TOML) — reading Claude's `.mcp.json` alone wiped credentials in a Cursor- or Gemini-only project |
| `installation/gitignore.ts` | Add/remove a marked `.gitignore` block for the MCP configs that carry wizard env values and for the local backup directories |
| `installation/skill-frontmatter.ts` | Rewrite an installed SKILL.md's `name:` to its flattened directory, which the Agent Skills spec requires |
| `installation/file-operations.ts` | Low-level copy/hash/flatten helpers: skill flattening, bundle expansion, `toInstalledAgentContent` frontmatter transform |
| `installation/category-paths.ts` | Map an agent category to the glob patterns its path-scoped rule file should carry |
| `installation/security-helpers.ts` | Path/entry-name/agent-id/skill-path validation shared by every writer — the guard against traversal in installed content |
| `targets/writers/mcp-config.writer.ts` | Serialize MCP servers into each assistant's format (Claude `mcpServers`, VS Code `servers`+stdio, Copilot CLI `local`+tools, Cursor stdio), merging with the user's own entries |
| `targets/writers/path-scoped-rules.writer.ts` | Serialize glob-scoped agent routing per assistant (`paths:` / `applyTo:` / `globs:`) |
| `targets/writers/gemini-settings.writer.ts` | Serialize `.gemini/settings.json` (mcpServers + AGENTS.md-aware context.fileName), merging with existing settings |
| `targets/writers/gemini-agent.writer.ts` | Turn a dev-suite agent into a native Gemini subagent (`.gemini/agents/<id>.md`, name/description/kind + verbatim body) |
| `targets/writers/kimi-agent.writer.ts` | Turn a dev-suite agent into a native Kimi subagent (`.kimi-code/agents/<id>.md`); owns the built-in-name and `${...}`-template guards |
| `targets/writers/agent-frontmatter.ts` | Shared YAML-scalar + frontmatter-stripping helpers for the native agent writers |
| `targets/writers/codex-toml.writer.ts` | Serialize `[mcp_servers.*]` TOML tables for `.codex/config.toml` via a comment-preserving section-level merge (no TOML dependency) |
| `targets/adapters/index.ts` | Adapter registry keyed by `TargetId`; must stay in step with `isImplemented()` |
| `installation/claude-md.service.ts` | Generate the shared instructions section, write `AGENTS.md` + the `CLAUDE.md` import pointer, and per-category path-scoped rule files |

Subdirectories with additional logic: `code-review/`, `codegen/` (per-target-family code generators), `detection/`, `git/`, `hooks/`, `installation/`, `orchestrator/`, `upgrade/`

Tech stack: React 19, Express 5, Electron 40, Vite 7, Zustand, Zod 4, TypeScript 5, TailwindCSS, Vitest

## How-To Checklists

### Add a New Agent
1. Create `agents/{category}/{name}-expert.md` with YAML frontmatter (`name`, `description`, `skills`, `mcp_servers`, optionally `model` and `allowed-tools`)
2. Write agent body content (role, responsibilities, best practices)
3. Create or update skill directories in `skills/` as needed
4. Add any KB references in skill quick-ref files
5. Update README.md agent table

### Add a New MCP Server
1. Create `mcp-servers/{server-name}/` with `package.json` (`@dev-suite/{name}`, main: `dist/index.js`)
2. Add `metadata.json` with all eight fields `validate-catalog.mjs` requires: `name` (must equal the directory name), `description`, `shortDescription`, `category`, `tools` (**array of strings**, matching the tools the server registers with ListTools), `envVars` (declare every `process.env.X` the server reads, or the wizard never prompts for it), `recommendedFor`, `detectedWhen`
3. Add `src/index.ts` with MCP server implementation
4. Add `tsconfig.json` (extend from root or create standalone)
5. Update `mcp-servers/package.json` workspaces array
6. Keep `package.json` `version` equal to the `version:` passed to `new Server()` in `src/index.ts` — CI compares them
7. Keep every tool `description` at 120 characters or fewer, or add `// audit-justification: <reason>` on the line immediately above
8. Build: `cd mcp-servers && npm install && npm run build`

### Add a New Skill
1. Create `skills/{category}/{technology}/SKILL.md` with skill definition
2. Optionally add `quick-ref/` subdirectory with focused guides (basics.md, patterns.md, etc.)
3. Add the skill directory name to relevant agent frontmatter `skills` arrays

### Add Documentation to Knowledge Base
**IMPORTANT: never leave the KB repo or its content inside this repository.**

1. Clone the KB repo into a temp location **outside** this repo:
   ```bash
   git clone https://github.com/claude-dev-suite/knowledge_base.git /tmp/kb
   ```
2. Add markdown files under `knowledge/{technology}/{topic}.md` inside the cloned repo
3. Update the relevant category file in `mcp-servers/documentation/src/docs-index/` in **this** repo (e.g., `testing.ts`, `backend.ts`, `ai.ts`) — `docs-index.ts` is a re-export aggregator; add entries to the appropriate category file
4. Commit and push to the KB repository:
   ```bash
   cd /tmp/kb && git add . && git commit -m "add {technology} docs" && git push
   ```
5. **Delete the local clone immediately after pushing:**
   ```bash
   rm -rf /tmp/kb
   ```
6. Verify no `knowledge/` folder exists in this repo: `ls knowledge 2>&1 | grep -q 'No such' && echo OK`

The documentation MCP server fetches content on-demand from the remote repo with a 2h cache — no local copy needed.

## Testing

**Location**: `configurator/dashboard/server/tests/`

**Commands** (from `configurator/dashboard/server/`):
```bash
npm run test            # Run all tests
npm run test:coverage   # Run with coverage report
```

**Test coverage**: the suite is discovered from the filesystem — `find configurator/dashboard/server/tests -name '*.test.ts'` is the authoritative list, and every route file under `src/routes/` has a matching test. Do not maintain an inventory of test files here; it goes stale within a release.

Areas that carry non-obvious invariants, worth reading before changing the code they cover:

| Area | What the tests pin down |
|------|-------------------------|
| `targets/writers/` | Golden files fixing the exact MCP and path-scoped-rule bytes per assistant, plus merge and stale-entry semantics |
| `targets/multi-target-install.test.ts` | Real multi-assistant installs: per-surface MCP shapes, the shared substrate for a non-Claude target, merge safety on an unparseable file |
| `targets/target-layout.test.ts` / `target-paths.test.ts` | Descriptor/capability consistency and manifest target migration |
| `reinstall.service.test.ts` | Erase-and-replace: custom-agent preservation, merge of CLAUDE.md and settings.json, opt-out keep, orphan removal, rollback, per-target classification |
| `installation/claude-md.service.test.ts` | AGENTS.md + CLAUDE.md import, legacy migration, description sanitization |
| `installation/uninstall.test.ts` | The removal contract: user prose, user MCP servers, Codex comments, `custom/` and foreign skills all survive an uninstall; a manifest path that escapes the project is refused |
| `installation/write-guard.test.ts` | A failed install rolls back to byte-identical state and leaves no manifest, so `getStatus()` and disk agree |
| `installation/managed-file.test.ts` | A hand-written agent or rule file is preserved, not recorded as dev-suite's, and survives the later uninstall |
| `installation/rule-id-safety.test.ts` | A traversing rule id cannot overwrite a project file, from either the wizard or a Sync reading the project's own `.dev-suite.json` |
| `hooks/*.test.ts` | Every hook script executed against real payloads, and — for the output filters — the command they *emit* run in a fresh shell. The bugs they cover are payload-shape and handoff bugs: hooks reading `.command` and `$CLAUDE_FILE_PATHS`, neither of which Claude Code sends, and an emitted command whose argument stayed an unexpanded variable. No service-level unit test can see either |
| `installation/drift.service.test.ts` | Drift verdicts: inside vs outside the markers, ratified content, a manifest predating `sectionHash` raising nothing, CRLF not reading as a change |
| `security-hardening.test.ts`, `security-codeql.test.ts`, `git-security.test.ts` | Hook-script and branch injection, `shell:false`, IPv6 SSRF ranges, symlink escape, timing-safe WS token, path-injection and ReDoS regressions |
| `mcp-servers/*/tests/security.test.ts` | Per-server guards: Zod arg validation, KB branch validator, the SELECT-only read-only transaction |

**CI gates** (`.github/workflows/ci.yml`) — these fail the build, so run them locally before pushing:

```bash
node scripts/audit-mcp-descriptions.mjs   # MCP tool descriptions <= 120 chars unless justified
node scripts/validate-catalog.mjs         # agent/skill/MCP metadata consistency
node scripts/validate-frontmatter.mjs     # YAML frontmatter shape across agents, commands, skills
node scripts/check-type-sync.mjs          # shared types in sync between client and server
node scripts/validate-env-secrets.mjs     # every credential-shaped env var is flagged `secret`
node scripts/gen-capability-matrix.mjs --check   # docs/AGENT-CAPABILITY-MATRIX.md is current
node scripts/gen-agents-reference.mjs --check    # README Agents Reference is current
node scripts/check-docs-sync.mjs          # prose matches steps.ts / IMPLEMENTED_TARGETS / workspaces
```

Both `gen-*` scripts write the file when run without `--check`; never edit their output by hand.

**Manual verification checklist** (when modifying initialization logic):
- Detection identifies frameworks, databases, and Git provider correctly
- `.mcp.json` has correct absolute paths
- `.dev-suite.json` matches selections
- Generated `CLAUDE.md` includes selected agents
- `.dev-suite-manifest.json` contains `availableAtInstall` with full catalog
- Monorepo subprojects detected (e.g., `frontend/package.json` + `backend/pom.xml`)
- New-component discovery works (add agent to dev-suite, reopen dashboard, verify notification)

## Commands

```bash
# Build all MCP servers
cd mcp-servers && npm install && npm run build

# Build specific server
cd mcp-servers && npm run build:{server-name}

# Run tests
cd configurator/dashboard/server && npm run test

# Run dashboard frontend dev server
cd configurator/dashboard && npm run dev

# Launch dashboard for a project
./init-project.sh /path/to/project

# Verify agent files exist
ls agents/*/*.md

# Check MCP server builds
ls mcp-servers/*/dist/index.js
```

## Versioning (Semantic Versioning)

Version format: `MAJOR.MINOR.PATCH` — applied to `configurator/dashboard/package.json` and `configurator/dashboard/server/package.json`.

| Bump | When | Example trigger |
|------|------|-----------------|
| `PATCH` (x.x.**+1**) | Bug fixes only, no new user-facing features | Fix a crash, correct wrong behaviour, TS/type error |
| `MINOR` (x.**+1**.0) | New backwards-compatible feature or capability | New agent, new API endpoint, new UI panel, new skill |
| `MAJOR` (**+1**.0.0) | Breaking change — existing config/API no longer works as before | Config format change, removed endpoint, renamed CLI flag |

**Rules:**
- A MINOR bump always resets PATCH to 0 (e.g. `1.1.2` → `1.2.0`, never `1.1.2` → `1.2.2`)
- A MAJOR bump always resets MINOR and PATCH to 0 (e.g. `1.2.3` → `2.0.0`)
- When in doubt between PATCH and MINOR, prefer MINOR if any new capability is exposed to the user
- Current published versions as of 2026-04-04: `1.1.0`, `1.1.1`, `1.1.2`, `1.2.2` (note: 1.2.2 was incorrectly named — should have been 1.2.0; apply correct semver from the next release onward)

**Release checklist** (run in order, never skip steps):
1. Decide bump type (PATCH / MINOR / MAJOR) based on the table above
2. Update `configurator/dashboard/package.json` and `configurator/dashboard/server/package.json` to the new version
3. Move `## [Unreleased]` content in `CHANGELOG.md` to `## [x.y.z] - YYYY-MM-DD`, leave a blank `## [Unreleased]` above it
4. *(Optional smoke test on Windows)* `cd configurator/dashboard && npm run electron:build` — verifies the local NSIS build is not broken before tagging. macOS/Linux artifacts are produced only by CI; no local cross-build.
5. Commit: `release(vX.Y.Z): <one-line summary>`
6. Tag: `git tag -a vX.Y.Z -m "vX.Y.Z — <summary>"`
7. Push commit + tag: `git push origin main --tags` — this triggers the `Release` workflow, which auto-creates the release if missing.
8. *(Optional)* edit the release notes: `gh release edit vX.Y.Z --notes "..."`. **Do not pass binary files** — CI uploads them across 3 runners (windows-latest, macos-latest, ubuntu-latest). Expect ~25-45 min for all platforms to finish.
9. Verify the CI `Release` workflow passes for **all three** matrix jobs (win / mac / linux). If any platform fails: fix the issue, then either:
   - re-run the failed matrix job from the Actions UI (faster), **or**
   - move the tag (`git tag -d vX.Y.Z && git tag -a vX.Y.Z HEAD ...`) and force-push (`git push origin vX.Y.Z --force`) — this re-runs everything.
10. Verify the published assets contain the full set:
    - Windows: `*Setup*.exe`, `*Setup*.exe.blockmap`, `latest.yml`
    - macOS:   `*-arm64.dmg`, `*-x64.dmg` (+ blockmaps), `latest-mac.yml`
    - Linux:   `*.AppImage`, `*.deb`, `latest-linux.yml` (no `.rpm` — not produced by the current build)
11. For risky releases, ship as `vX.Y.Z-rc.N` first (CI workflow triggers on any `v*` tag) and validate on macOS/Linux machines before promoting to a stable tag.

## Anti-Staleness Rule

Never write exact counts of agents, MCP servers, skills, or supported technologies in `CLAUDE.md` or `README.md`. These numbers change frequently and go stale. When a count is needed, derive it dynamically from the filesystem (e.g., `find agents -name '*-expert.md'`). This applies to all component lists and technology enumerations.
