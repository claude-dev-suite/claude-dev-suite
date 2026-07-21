# Assistant Format Reference

**Normative reference for every AI coding assistant dev-suite generates configuration for.**

If you are implementing compatibility for a target, **this file is the source of
truth**. Do not research formats independently — divergent research is how two
adapters end up writing two different shapes for the same tool. If you find that
reality contradicts this document, fix *this document first* (with a source URL
and the date), then write the code.

- **Verified**: 2026-07-22, against official vendor documentation and, where docs
  and source disagreed, against vendor source code.
- **Re-verify before**: starting any new adapter, or any release that changes
  generated output. These conventions move fast — several claims in this file
  were wrong six months ago.

## How to read this file

Every factual claim carries a confidence marker:

| Marker | Meaning | How to treat it |
|---|---|---|
| **CONFIRMED** | Stated in official vendor docs or read from vendor source | Implement against it |
| **PLAUSIBLE** | Third-party sources, or inferred from consistent official examples | Implement, but cover with a golden-file test and verify empirically before release |
| **UNCONFIRMED** | Could not be established | **Do not implement.** Defer the feature or degrade gracefully |

Anything not listed here is not established. Absence of a feature in this
document means "unknown", not "unsupported" — check and add it.

---

## Part 1 — The two open standards

Multi-assistant support exists because of two cross-vendor standards. Their
governance is asymmetric in a way that matters: **AGENTS.md has a foundation but
no real spec; Agent Skills has a real spec but no foundation.**

### 1.1 AGENTS.md

- Governed by the **Agentic AI Foundation** (Linux Foundation), since December 2025.
  Canonical location: <https://agents.md> — the site *is* the spec. CONFIRMED
- **There is no normative structure.** Quoting the spec: *"AGENTS.md is just
  standard Markdown. Use any headings you like."* No required headings, no
  frontmatter specification, no encoding rule, no size limit, no conformance
  language (no MUST/SHOULD/MAY), no schema, no version. CONFIRMED
- The compatibility list on agents.md is a **self-reported showcase, not a
  conformance registry**. Being listed implies nothing testable. CONFIRMED

**Nesting semantics are contested — this is the load-bearing detail.** The spec
says closest-wins, single-file selection: *"the closest AGENTS.md to the edited
file wins."* (CONFIRMED) But OpenAI Codex does not select one file — it
concatenates *every* AGENTS.md from git root down to cwd, with closer files
winning on conflict (PLAUSIBLE). Devin turns a subdirectory `AGENTS.md` into a
glob rule scoped to `<dir>/**` (CONFIRMED). Three different semantics.

**Consequence: generate a single root `AGENTS.md` and nothing else.** With one
file, all three readings converge on identical behaviour. The moment nested files
are emitted, a subdirectory file that assumes it *replaces* the root will instead
be *appended to* it under Codex. This is a portability hazard, not a preference.

**Referencing AGENTS.md from a tool-specific file** is not in the spec, but
Anthropic documents it explicitly and it is exactly what dev-suite does:

> *"Claude Code reads `CLAUDE.md`, not `AGENTS.md`. If your repository already
> uses `AGENTS.md` for other coding agents, create a `CLAUDE.md` that imports it
> so both tools read the same instructions without duplicating them."*
> — <https://code.claude.com/docs/en/memory> CONFIRMED

A symlink is offered as an alternative, but Anthropic warns that Windows symlinks
need Administrator privileges or Developer Mode and recommends the `@AGENTS.md`
import instead. dev-suite targets Windows, so the import is the correct choice.

### 1.2 Agent Skills (SKILL.md)

- Canonical spec: <https://agentskills.io/specification>. Reference validator:
  `skills-ref validate ./my-skill` from <https://github.com/agentskills/agentskills>.
  Originally Anthropic's, now in a neutral `agentskills` GitHub org. CONFIRMED
- **Not** an AAIF project — the foundation's founding projects are MCP, goose and
  AGENTS.md only. CONFIRMED

**The complete normative frontmatter surface.** Everything else is a vendor
extension.

| Field | Required | Type | Constraints |
|---|---|---|---|
| `name` | **Yes** | string | 1–64 chars; `a-z0-9` and hyphens only; no leading/trailing hyphen; **no consecutive hyphens**; **must match the parent directory name** |
| `description` | **Yes** | string | 1–1024 chars, non-empty; state both *what* and *when* |
| `license` | No | string | Name or reference to a bundled license file |
| `compatibility` | No | string | 1–500 chars; environment requirements |
| `metadata` | No | map<string,string> | Arbitrary; no mandated keys |
| `allowed-tools` | No | string | **Space-separated**, e.g. `Bash(git:*) Read`. Marked **Experimental** — support varies between implementations |

Structural rules: frontmatter must be the first content, delimited by `---` on
their own lines, no leading whitespace. **Unrecognized keys must be ignored by
compliant runtimes** — this is the extension mechanism that makes vendor fields
legal. CONFIRMED

**`paths` and `disable-model-invocation` are NOT in the spec** — both are Claude
Code extensions. Do not assume portability.

**Bundled resources** (all optional, all in the spec): `scripts/` (executable
code), `references/` (on-demand docs), `assets/` (templates, data). Reference them
with **relative paths from the skill root**, and *"keep file references one level
deep from SKILL.md."* CONFIRMED

**Progressive disclosure**, three levels: metadata ~100 tokens loaded at startup
for *all* skills; instructions <5000 tokens recommended, loaded on activation;
resources loaded only when needed. *"Keep your main SKILL.md under 500 lines."*
These are recommendations — the validator checks frontmatter and naming, not body
length. CONFIRMED

**The spec does not specify an installation directory.** There is no page on
discovery at all. Location is 100% vendor-defined and the ecosystem is genuinely
forked — see §2.2. Any claim that `.agents/skills/` is "the standard location"
is wrong for half the tools.

---

## Part 2 — Cross-cutting matrices

Read these first. They answer "do I need to write this at all?", which is usually
the highest-value question.

### 2.1 Instructions

| Tool | Reads `AGENTS.md` natively? | Own file | Combining rule |
|---|---|---|---|
| Claude Code | **No** — needs `@AGENTS.md` import in CLAUDE.md | `CLAUDE.md` | Concatenated root-down |
| Copilot | **Yes**, both surfaces (VS Code ≥1.104, `chat.useAgentsMdFile` defaults **true**) | `.github/copilot-instructions.md`; CLI also reads `CLAUDE.md` | All combined, **no precedence** |
| Cursor | **Yes**, root + nested | `.cursor/rules/` | Nested: child wins |
| Codex CLI | **Yes** (`AGENTS.override.md` wins over `AGENTS.md`) | — | Concatenated root-down, 32 KiB cap |
| Gemini CLI | **No** — needs `context.fileName` | `GEMINI.md` | Concatenated root-down + just-in-time |
| Devin Desktop | **Yes**; a subdirectory file auto-becomes a glob rule for `<dir>/**` | `.devin/rules/` | File + directory forms both read |
| Cline | **Yes**; also auto-detects `.cursorrules` and `.windsurfrules` | `.clinerules/` dir | All `.md`/`.txt` merged |

### 2.2 Skills discovery — the fork

**No single directory reaches every tool.** This table is why a dual-write exists.

| Tool | `.claude/skills/` | `.agents/skills/` | Own location |
|---|---|---|---|
| Claude Code | ✅ (own) | ❌ | `.claude/skills/` |
| Copilot | ✅ | ✅ | `.github/skills/` |
| Cursor | ✅ (explicit compat) | ✅ | `.cursor/skills/` |
| Codex CLI | ❌ | ✅ (primary) | `.codex/skills/` |
| Gemini CLI | ❌ | ✅ (outranks own) | `.gemini/skills/` |
| Devin Desktop | ⚠️ opt-in setting only, off by default | ✅ | `.windsurf/skills/` |
| Cline | ✅ (by default) | not documented | `.cline/skills/`, `.clinerules/skills/` |

**Writing `.claude/skills/` + `.agents/skills/` covers every tool listed.** Neither
alone does. Note Claude Code's collision precedence is **enterprise > personal >
project** — *inverted* relative to the project-wins convention most tools use.

### 2.3 Agent / subagent files

| Tool | Own format | Reads `.claude/agents/`? |
|---|---|---|
| Claude Code | `.claude/agents/**/*.md`, recursive | ✅ (own) |
| Copilot | `.github/agents/*.agent.md` | ✅ VS Code reads it directly |
| Cursor | `.cursor/agents/*.md` | ✅ (also `.codex/agents/`); `.cursor/` wins |
| Codex CLI | `.codex/agents/**/*.toml` | ❌ |
| Gemini CLI | `.gemini/agents/*.md` | ❌ |
| Devin Desktop | UNCONFIRMED | UNCONFIRMED |
| Cline | `.cline/agents/` — **but `.cline/` is SDK/CLI/Kanban only, not the VS Code extension** | ❌ |

**Copilot and Cursor need no agent writer** — they read `.claude/agents/` directly.
The fidelity caveat: our installed agents carry Claude-native frontmatter
(`tools:`, `mcpServers:`, `skills:`) absent from both schemas, so tool
restrictions and skill preload degrade to "ignored". Files load; capabilities
don't. Writing native per-target agent files recovers that and is otherwise optional.

### 2.4 Path-scoped (glob-activated) rules

| Tool | File | Frontmatter key | Value shape |
|---|---|---|---|
| Claude Code | `.claude/rules/*.md` | `paths:` | YAML list of globs |
| Copilot | `.github/instructions/*.instructions.md` | `applyTo:` | Comma-separated globs, relative to workspace root |
| Cursor | `.cursor/rules/*.mdc` | `globs:` | **Unquoted comma-separated string** — not a YAML list |
| Codex CLI | — | — | **No glob mechanism at all** |
| Gemini CLI | — | — | **No glob mechanism at all** |
| Devin Desktop | `.devin/rules/*.md` | `trigger:` + `globs:` | `trigger` ∈ `always_on`/`glob`/`model_decision`/`manual` |
| Cline | `.clinerules/*.md` | `paths:` | YAML list of globs |

Four different keys and three different value shapes for one concept. This is the
single richest source of silent breakage in the whole surface.

### 2.5 MCP — is anything committable?

| Tool | Project-level file | Top-level key | `type` value |
|---|---|---|---|
| Claude Code | `.mcp.json` | `mcpServers` | omit for stdio; `http`/`sse`/`ws` for remote |
| Copilot (VS Code) | `.vscode/mcp.json` | **`servers`** | must be **`"stdio"`** |
| Copilot (CLI) | `.mcp.json` or `.github/mcp.json` (trust-gated) | `mcpServers` | **`"local"`** |
| Cursor | `.cursor/mcp.json` | `mcpServers` | `"stdio"` |
| Codex CLI | `.codex/config.toml` — **trusted projects only** | TOML `[mcp_servers.<name>]` | n/a |
| Gemini CLI | `.gemini/settings.json` | `mcpServers` | n/a (`command` implies stdio) |
| Devin Desktop | `.devin/config.json` | `mcpServers` | CONFIRMED for Devin CLI, **PLAUSIBLE for Desktop** |
| Cline | **None** — user-global only | — | — |

Note Copilot's two surfaces disagree on **both** the top-level key and the `type`
value. One file cannot serve both.

---

## Part 3 — Per-assistant reference

### 3.1 Claude Code — the baseline

Sources: <https://code.claude.com/docs/en/memory>, `/skills`, `/sub-agents`, `/mcp`, `/settings`

- **Instructions**: discovery order is managed policy → `~/.claude/CLAUDE.md` →
  `./CLAUDE.md` or `./.claude/CLAUDE.md` → `./CLAUDE.local.md` → nested
  subdirectories on demand. Concatenated, not overriding. `@path` imports: **max
  4 hops**, and **import parsing skips Markdown code spans and fenced blocks**
  (wrap a path in backticks to mention it without importing). Does **not** read
  `AGENTS.md`. CONFIRMED
- **Path-scoped rules**: `.claude/rules/*.md` with `paths:` glob frontmatter;
  files without `paths` load unconditionally. CONFIRMED — this is a real,
  documented feature, which is what makes dev-suite's token optimisation valid.
- **Skills**: `.claude/skills/<name>/SKILL.md`. Precedence **enterprise >
  personal > project**. Nested `.claude/skills/` discovered on demand below cwd.
  Symlinked skill directories supported. Does **not** read `.agents/skills/`.
  Vendor extensions beyond the open standard: `when_to_use`, `argument-hint`,
  `arguments`, `disable-model-invocation`, `user-invocable`, `allowed-tools`,
  `disallowed-tools`, `model`, `effort`, `context` (`fork`), `agent`, `hooks`,
  `paths`, `shell`. CONFIRMED
- **Subagents**: `.claude/agents/`, scanned **recursively** — subdirectory path
  does not affect identity, which comes only from the `name` field. **The tool
  key is `tools`, NOT `allowed-tools`** — this is why dev-suite transforms agent
  frontmatter at the install boundary; source files using `allowed-tools` are
  silently ignored and the subagent inherits every tool. Other keys:
  `disallowedTools`, `model`, `permissionMode`, `maxTurns`, `skills`,
  `mcpServers`, `hooks`, `memory`, `background`, `effort`, `isolation`, `color`,
  `initialPrompt`. CONFIRMED
- **MCP**: `.mcp.json`, key `mcpServers`. Precedence managed > CLI flag > project
  > user (`~/.claude.json`). CONFIRMED
- **Settings**: managed > CLI args > `.claude/settings.local.json` >
  `.claude/settings.json` > `~/.claude/settings.json`. CONFIRMED
  `skillListingBudgetFraction` is **referenced from the skills docs but not
  listed in the settings reference and has no documented default** — dev-suite
  sets it to 0.05. UNCONFIRMED (default value)
- **Commands**: `.claude/commands/*.md` still works and is not deprecated, but
  *"custom commands have been merged into skills"* and skills are the
  recommended path for new work. CONFIRMED

### 3.2 GitHub Copilot

Sources: <https://docs.github.com/en/copilot/reference/custom-agents-configuration>,
<https://code.visualstudio.com/docs/agents/reference/mcp-configuration>,
<https://docs.github.com/en/copilot/reference/hooks-reference>

- **Instructions**: `AGENTS.md` native. VS Code since **v1.104**;
  `chat.useAgentsMdFile` defaults to **`true`** (still labelled experimental).
  CLI reads `.github/copilot-instructions.md`, `AGENTS.md` **and `CLAUDE.md`**, at
  repo root, cwd and intermediate directories. *"VS Code combines and adds them to
  the chat context, no specific order is guaranteed."* CONFIRMED
- **Path-scoped rules**: `.github/instructions/*.instructions.md` (user-level
  `~/.copilot/instructions/`), key `applyTo`, glob relative to workspace root,
  comma-separated multi-glob valid: `"**/*.ts,**/*.tsx"`. CONFIRMED
- **Agents**: `.github/agents/*.agent.md`; user level `~/.copilot/agents/`. Keys:
  `name` (optional, filename is fallback), `description` (**required**), `tools`,
  `model`, `mcp-servers`, `target` (`vscode`|`github-copilot`),
  `disable-model-invocation`, `user-invocable`, `metadata`; VS Code-only
  `argument-hint`, `handoffs`, `agents`, `hooks` (preview). **`infer` is retired.**
  Filenames restricted to `. - _ a-z A-Z 0-9`. CONFIRMED
  **Size cap**: 30,000 characters — but documented in the **cloud-agent** context;
  VS Code documents no limit. Treat as a safe ceiling, not a hard constraint.
- **Skills**: `.github/skills`, `.claude/skills`, `.agents/skills`; personal
  `~/.copilot/skills` or `~/.agents/skills`. CONFIRMED
- **MCP (VS Code)**: `.vscode/mcp.json`, top-level **`servers`** plus optional
  `inputs` and `sandbox`. For stdio, `type` is required and its only valid value
  is `"stdio"`; then `command` (required), `args`, `env`, `envFile`, `cwd`, `dev`,
  `sandboxEnabled`. Secrets via `inputs` + `${input:id}`; `${workspaceFolder}`
  supported. CONFIRMED
- **MCP (CLI)**: user `~/.copilot/mcp-config.json`, key `mcpServers`, entry uses
  `"type": "local"` with `command`, `args`, `env`, and a `tools` allowlist
  (`["*"]` for all). Project-level is **`.mcp.json` or `.github/mcp.json`**,
  precedence over user-level on name conflict, requires folder-trust
  confirmation. CONFIRMED — note this is the same filename dev-suite already
  writes for Claude Code.
- **Hooks**: `.github/hooks/*.json` with `version: 1`, plus `~/.copilot/hooks/`
  and inline in `.github/copilot/settings.json`. Types are exactly `command`,
  `http`, `prompt` (sessionStart only). Other keys: `disableAllHooks`, `cwd`,
  `env`, `timeoutSec`, `matcher`. **CLI and cloud agent only — not VS Code**
  project-level. CONFIRMED

### 3.3 Cursor

Sources: <https://cursor.com/docs/rules>, `/subagents`, `/mcp`, `/skills`, `/hooks`

- **Instructions**: `AGENTS.md` native, root and nested with child winning. Plain
  markdown, no frontmatter. **`.cursorrules` has been dropped from current docs —
  do not write it.** CONFIRMED (its precedence against `AGENTS.md` is UNCONFIRMED)
- **Rules**: `.cursor/rules/*.mdc`. Plain `.md` in that directory is ignored.
  Frontmatter is exactly `description`, `globs`, `alwaysApply` — **no `type` key**;
  rule types are *derived*:

  | Type | Combination |
  |---|---|
  | Always | `alwaysApply: true` |
  | Agent Requested | `alwaysApply: false` + `description`, no `globs` |
  | Auto Attached | `alwaysApply: false` + `globs` |
  | Manual | `alwaysApply: false`, neither |

  `globs` is an **unquoted comma-separated plain string**, e.g.
  `globs: docs/**/*.md, docs/**/*.mdx`. PLAUSIBLE — every doc example follows this
  form but the rule is never stated. **Emitting a YAML list here would fail
  silently; cover it with a golden-file test.** Precedence: Team → Project → User.
- **Agents**: `.cursor/agents/*.md`, user `~/.cursor/agents/`. Keys `name`
  (defaults to filename), `description`, `model` (default `inherit`), `readonly`
  (default false), `is_background` (default false) — all optional. Also reads
  `.claude/agents/` and `.codex/agents/`; `.cursor/` wins on conflict. CONFIRMED
  Nested subdirectories under `.cursor/agents` are reportedly **not** scanned. PLAUSIBLE
- **Skills**: `.cursor/skills/`, `.agents/skills/`, and explicitly `.claude/skills/`
  and `.codex/skills/` *"for compatibility"*. Recursive discovery. Landed in
  Cursor 2.4. Collision precedence across locations is UNCONFIRMED — write once.
- **MCP**: `.cursor/mcp.json`, user `~/.cursor/mcp.json`, key `mcpServers`,
  `type: "stdio"` + `command`/`args`/`env`/`envFile`. Interpolation `${env:VAR}`,
  `${userHome}`, `${workspaceFolder}`, `${pathSeparator}` all supported and
  documented. CONFIRMED
- **Hooks**: `.cursor/hooks.json`, requires a `version` key, 21 camelCase events
  (`beforeShellExecution`, `afterFileEdit`, `preToolUse`, …), optional `matcher`. CONFIRMED
- **Permissions**: `.cursor/cli.json` with `permissions.allow`/`deny`; global
  counterpart has a **different filename**, `~/.cursor/cli-config.json`. Rule
  syntax `Shell(git)`, `Read(src/**/*.ts)`, `Mcp(server:tool)`; deny beats allow. CONFIRMED

### 3.4 OpenAI Codex CLI

Sources: <https://learn.chatgpt.com/docs/agent-configuration/agents-md>,
`/config-file/config-basic`, `/extend/mcp`, `/build-skills`, plus `openai/codex` source

> Docs moved: `developers.openai.com/codex/*` now 308-redirects to
> `learn.chatgpt.com/docs/*`. Old deep links are dead.

- **Instructions**: `AGENTS.override.md` → `AGENTS.md` → `project_doc_fallback_filenames`.
  Read from `~/.codex/` (or `$CODEX_HOME`) then every directory from **git root
  down to cwd**. *"Codex concatenates files from the root down… Files closer to
  your current directory override earlier guidance because they appear later."*
  Capped at `project_doc_max_bytes`, default **32 KiB**. CONFIRMED
- **MCP**: `.codex/config.toml` (project), `~/.codex/config.toml`,
  `/etc/codex/config.toml`. TOML, `[mcp_servers.<name>]` with `command`, `args`,
  `env_vars` (forward from local env), `[mcp_servers.<name>.env]` (explicit),
  `cwd`, `enabled`, `startup_timeout_sec`, `tool_timeout_sec`. CONFIRMED
  **⚠ Trust gate**: *"If you mark a project as untrusted, Codex skips
  project-scoped `.codex/` layers, including project-local config, hooks, and
  rules."* Project MCP config **silently does nothing** in an untrusted project —
  the most likely source of "it doesn't work" reports.
- **Agents** ("agent roles"): `.codex/agents/**/*.toml`, scanned **recursively**;
  user `~/.codex/agents/**/*.toml`. Fields `name`, `description`,
  `nickname_candidates`, plus a flattened full `ConfigToml` so any config key is
  valid inline. **`deny_unknown_fields` is set** — an unrecognized top-level key
  is a hard parse error, not a warning. CONFIRMED (read from source:
  `codex-rs/core/src/config/agent_roles.rs`)
- **Skills**: `.agents/skills` (walked repo-root-down), `.codex/skills`,
  `$CODEX_HOME/skills` (**deprecated**, source comment says kept for backward
  compatibility), `$HOME/.agents/skills`, `/etc/codex/skills`. **Does not read
  `.claude/skills`.** Duplicate names are **not merged** — both appear in
  selectors. CONFIRMED. Precedence between `.codex/skills` and `.agents/skills`
  is UNCONFIRMED.
- **Path-scoped rules**: none. **⚠ Trap: `.codex/rules/` exists but is the
  exec/command policy directory, not instructions.** Do not model it as one. CONFIRMED
- **Commands**: `~/.codex/prompts/*.md`, top-level files only, **user-level only —
  never project-level**, so not shareable via a repo. Officially deprecated in
  favour of skills and reported broken from CLI ≥ 0.117.0. **Do not emit.** CONFIRMED
- **Hooks**: `hooks.json` in the config folder or `[hooks]` in `config.toml`.
  Sits behind a feature flag in source. Events `preToolUse`, `permissionRequest`,
  `postToolUse`, `preCompact`, `postCompact`, `sessionStart`, `sessionEnd`,
  `userPromptSubmit`, `subagentStart`, `subagentStop`, `stop` — wire enum is
  camelCase while config matchers use PascalCase. PLAUSIBLE (treat as opt-in)

### 3.5 Google Gemini CLI

Sources: `google-gemini/gemini-cli` `docs/cli/gemini-md.md`, `docs/tools/mcp-server.md`,
`docs/core/subagents.md`, `docs/cli/using-agent-skills.md`, `docs/reference/configuration.md`

- **Instructions**: default context filename is `GEMINI.md`. **Does not read
  `AGENTS.md` natively.** Enable it via `context.fileName` (string or array) in
  settings:
  ```json
  { "context": { "fileName": ["AGENTS.md", "GEMINI.md"] } }
  ```
  Schema default is `undefined` with `GEMINI.md` as the effective fallback.
  **Setting it replaces the list** — include `GEMINI.md` explicitly if you still
  want it read. Combining is concatenate-root-down across three tiers: global
  `~/.gemini/GEMINI.md`, workspace dirs and parents, and **just-in-time** (when a
  tool touches a file, the CLI scans that directory and its ancestors). Supports
  `@./file.md` imports. CONFIRMED
- **MCP**: `.gemini/settings.json` (project) and `~/.gemini/settings.json` (user).
  JSON, key `mcpServers`, entries with `command`, `args`, `env`, `cwd`, `timeout`
  (**milliseconds** — Codex's equivalent is seconds), `trust`. `$VAR` expansion
  works inside `env`. `url`/`httpUrl` for remote. CONFIRMED
- **Agents**: `.gemini/agents/*.md`, user `~/.gemini/agents/*.md`. *"The file MUST
  start with YAML frontmatter enclosed in triple-dashes."* Fields `name`,
  `description`, `kind`, `tools`, `model`, `temperature`, `max_turns`. Note
  **snake_case in frontmatter but camelCase in `settings.json` overrides**
  (`runConfig.maxTurns`). Invoked with `@name`. CONFIRMED
- **Skills**: precedence low→high built-in → extension → user
  (`~/.gemini/skills/` or `~/.agents/skills/`) → workspace (`.gemini/skills/` or
  `.agents/skills/`). The `.agents/skills/` alias **takes precedence over**
  `.gemini/skills/` and is explicitly framed as *"an interoperable path"*.
  **Does not read `.claude/skills`.** CONFIRMED
- **Path-scoped rules**: none. Scoping is directory hierarchy + JIT loading. CONFIRMED
- **Commands**: `.gemini/commands/*.toml` (project wins over user
  `~/.gemini/commands/`). Subdirectories namespace with `:` —
  `commands/git/commit.toml` → `/git:commit`. Required `prompt`, optional
  `description`, arguments via `{{args}}`. CONFIRMED
- **Hooks**: defined **inside `settings.json`** under a `hooks` object, not a
  separate file. Events `SessionStart`, `SessionEnd`, `BeforeAgent`, `AfterAgent`,
  `BeforeModel`, `AfterModel`, `BeforeToolSelection`, `BeforeTool`, `AfterTool`,
  `PreCompress`, `Notification`. `type` accepts only `"command"`. `timeout` in ms,
  default 60000. **Hooks must emit only JSON on stdout** — a stray `echo` breaks
  parsing and silently degrades to "Allow". CONFIRMED

### 3.6 Devin Desktop (formerly Windsurf)

Sources: <https://docs.devin.ai/desktop/cascade/agents-md>, `/memories`, `/skills`,
`/hooks`, `/workflows`, <https://docs.devin.ai/cli/extensibility/mcp/configuration>

> **⚠ The product was renamed.** Cognition rebranded Windsurf to **Devin Desktop**
> in June 2026; `windsurf.com` and `docs.windsurf.com` now redirect to `devin.ai`.
> Cascade reached EOL in July 2026 and was replaced by **Devin Local**. Docs under
> `desktop/cascade/*` describe a retired agent. Legacy `.windsurf/` and
> `.codeium/` paths are still read during a transition period, with auto-copy on
> first run. CONFIRMED (rebrand); PLAUSIBLE (EOL date — third-party press)

- **Instructions**: `AGENTS.md` native, plain markdown. **A subdirectory
  `AGENTS.md` automatically becomes a glob rule scoped to `<directory>/**`.**
  Rules: `.devin/rules/*.md` (preferred) → `.windsurf/rules/*.md` (fallback) →
  `.windsurfrules` (legacy). Devin CLI also reads `CLAUDE.md` and
  `AGENTS.local.md`. CONFIRMED
- **Glob rules**: frontmatter `trigger` ∈ `always_on`|`glob`|`model_decision`|`manual`,
  plus `globs`. Limits: 12,000 chars per workspace file, 6,000 global. CONFIRMED
- **MCP**: `.devin/config.json` (committable, version-controlled),
  `.devin/config.local.json` (gitignored), `~/.config/devin/config.json`. Key
  `mcpServers`, standard `command`/`args`/`env`. **CONFIRMED for Devin CLI;
  PLAUSIBLE for Devin Desktop** — no page explicitly confirms the Desktop UI reads
  it. Verify empirically before relying on it.
- **Agents**: UNCONFIRMED. Devin Local "supports subagents" but no documented
  project-level file schema was found.
- **Skills**: `.windsurf/skills/`, `~/.codeium/windsurf/skills/`, `.agents/skills/`,
  `~/.agents/skills/`. `.claude/skills/` **only if "Claude Code config reading" is
  enabled**, which is not the default — prefer `.agents/skills/`. CONFIRMED
- **Workflows**: `.windsurf/workflows/*.md`, 12,000 char cap; global
  `~/.codeium/windsurf/global_workflows/`. Docs still say `.windsurf/`, not
  `.devin/`. CONFIRMED
- **Hooks**: `.windsurf/hooks.json` at workspace root, committable. Shape
  `{"hooks": {"<event>": [{"command": "...", "show_output": true}]}}`, 12 events
  including `pre_write_code`, `post_write_code`, `pre_mcp_tool_use`,
  `pre_user_prompt`. Merged system → user → workspace. CONFIRMED

### 3.7 Cline

Sources: <https://docs.cline.bot/customization/cline-rules>, `/skills`,
`/mcp/mcp-overview`, `/getting-started/config`

- **Instructions**: `.clinerules/` **directory** at project root (all `.md`/`.txt`
  merged) is primary; the legacy single `.clinerules` file still works. Reads
  `AGENTS.md` natively and **auto-detects `.cursorrules` and `.windsurfrules`**.
  Global: `~/Documents/Cline/Rules`. CONFIRMED
- **Glob rules**: frontmatter key is **`paths:`** as a YAML list — the same key
  and shape as Claude Code, and different from every other tool. CONFIRMED
- **MCP**: **nothing committable.** VS Code extension is user-global only
  (`cline_mcp_settings.json` under the extension's `globalStorage`); the CLI uses
  `~/.cline/mcp.json`. Project-level MCP is an **open feature request**
  (cline/cline discussion #2418), not shipped, and the docs actively warn against
  committing the settings file. CONFIRMED
- **Agents**: `.cline/agents/` exists, but `.cline/` features are explicitly
  scoped: *"currently only applies to Cline SDK, CLI, and Kanban. Not applicable
  on VSCode and JetBrains Extension for now."* So for the VS Code extension:
  **no**. CONFIRMED (the exclusion); PLAUSIBLE (the directory)
- **Skills**: **`.claude/skills/` is scanned by default**, alongside
  `.cline/skills/`, `.clinerules/skills/` and global `~/.cline/skills/`.
  Frontmatter requires `name` (must match directory name) and `description`
  (≤1024 chars). CONFIRMED
- **Workflows**: `.clinerules/workflows/*.md`, invoked as slash commands; global
  `~/Documents/Cline/Workflows/`. Project wins on collision. CONFIRMED
- **Hooks**: `.clinerules/hooks/` project-level (executable **scripts**, not JSON
  config), global `~/Documents/Cline/Rules/Hooks/`. Events follow Claude Code
  naming (`PreToolUse`, `PostToolUse`, `UserPromptSubmit`, `TaskStart`, …).
  PLAUSIBLE — **the docs contradict themselves**, with `/getting-started/config`
  listing `.cline/hooks/` instead. Verify before generating.

---

## Part 4 — Silent-breakage traps

Ranked by how quietly they fail. Every one of these produces no error message.

1. **Cursor `globs` as a YAML list.** It expects an unquoted comma-separated
   string. A YAML list parses fine and the rule simply never activates.
2. **Codex untrusted projects.** All `.codex/` project layers — config, MCP,
   hooks, rules — are skipped silently. A user marking a project untrusted gets
   no MCP servers and no explanation.
3. **Claude Code `allowed-tools` in subagent frontmatter.** Not a recognized key.
   The subagent inherits *every* tool rather than the restricted set — a security
   posture change, not just a missing feature. (dev-suite already transforms this
   at the install boundary.)
4. **Copilot's two MCP surfaces.** VS Code wants `servers` + `type: "stdio"`; the
   CLI wants `mcpServers` + `type: "local"`. Writing one shape to the other's path
   yields a config that parses but registers nothing.
5. **Gemini `context.fileName` replaces rather than appends.** Setting it to
   `["AGENTS.md"]` silently stops `GEMINI.md` from being read.
6. **Gemini hooks writing anything but JSON to stdout.** Parsing fails and the
   hook degrades to "Allow" — a deny hook becomes a no-op.
7. **Codex `deny_unknown_fields` on agent roles.** An unknown key is a hard parse
   error, so a forward-compatible extra field breaks the whole file.
8. **Nested `AGENTS.md` semantics.** Override under the spec, append under Codex.
   A subdirectory file meant to replace guidance instead accumulates with it.
9. **Skills name collisions.** Codex does not merge duplicates — both variants
   appear in the selector. Claude Code inverts the usual precedence (enterprise >
   personal > project).
10. **Copilot combining instruction files with no precedence.** `AGENTS.md`,
    `.github/copilot-instructions.md` and (on the CLI) `CLAUDE.md` all load
    together. A pointer file that imports `AGENTS.md` can cause the same content
    to load twice on that surface.

---

## Part 5 — Unconfirmed register

**Do not implement against these.** Either defer the feature or degrade
gracefully. Resolve one and move it into Part 3 with its source.

| # | Item | Affects |
|---|---|---|
| 1 | `${env:VAR}` interpolation in `.vscode/mcp.json` — the reference page lists only `${input:id}` and `${workspaceFolder}` | Copilot MCP writer — prefer literal values or `envFile` |
| 2 | Whether Copilot CLI honours `.vscode/mcp.json` | Copilot MCP writer — assume it does not |
| 3 | Which Cursor version introduced `AGENTS.md`, and its precedence against `.cursorrules` / `.cursor/rules` | Cursor instructions — write `AGENTS.md`, never `.cursorrules` |
| 4 | Skill/agent name-collision precedence between `.cursor/` and `.claude/` | Cursor — write skills once |
| 5 | Whether nested `.cursor/rules/` in subfolders are honoured | Cursor rules — emit at root only |
| 6 | Codex precedence between `.codex/skills` and `.agents/skills` | Codex skills — use `.agents/skills` |
| 7 | Whether Codex hooks are enabled by default (feature-flagged in source) | Codex hooks — treat as opt-in |
| 8 | Whether **Devin Desktop** (not just Devin CLI) reads `.devin/config.json` for MCP | Devin MCP writer — **blocking**, verify empirically |
| 9 | Cline hooks path: `.clinerules/hooks/` vs `.cline/hooks/` (docs contradict) | Cline hooks — **blocking**, verify before generating |
| 10 | Devin Desktop project-level custom agent format | Devin agents — no writer until resolved |
| 11 | `skillListingBudgetFraction` documented default | Claude Code settings — dev-suite sets 0.05 explicitly, so behaviour is deterministic regardless |
| 12 | Exact version floors for any Codex/Gemini claim (both ship docs from `main` without per-release pinning) | All — establish by testing a pinned binary if a floor is needed |

---

## Part 6 — What this means for dev-suite

Consequences of the matrices above, for implementers:

- **`AGENTS.md` at the project root, single file, never nested.** It is the only
  artifact read by six of the seven tools, and single-root is the only
  nesting-safe choice. Claude Code reaches it through the vendor-documented
  `@AGENTS.md` import in `CLAUDE.md`.
- **Agents and skills need no per-target write for Copilot and Cursor** — both
  read `.claude/` directly. They *do* for Codex and Gemini, which read neither;
  `.agents/skills/` is the dual-write target that reaches them plus Devin.
- **MCP and path-scoped rules are the only formats requiring real conversion**
  for Tier 1, because they are the only two with no cross-tool overlap.
- **Cline can never receive committable MCP config** — that is a permanent
  capability gap, not a missing adapter. Model it as a capability flag and report
  it to the user rather than failing.
- **Codex's trust gate and Devin's Desktop-vs-CLI ambiguity are the two places
  where a correct file still does nothing.** Both warrant a user-facing note in
  the install summary rather than silent success.

Capability flags live in `configurator/dashboard/server/src/services/targets/target-layout.ts`;
paths resolve through `target-paths.ts`. When this document and those descriptors
disagree, this document is right and the descriptor is a bug.
