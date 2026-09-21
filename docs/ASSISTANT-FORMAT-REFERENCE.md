# Assistant Format Reference

**Normative reference for every AI coding assistant dev-suite generates configuration for.**

If you are implementing compatibility for a target, **this file is the source of
truth**. Do not research formats independently — divergent research is how two
adapters end up writing two different shapes for the same tool. If you find that
reality contradicts this document, fix *this document first* (with a source URL
and the date), then write the code.

- **Verified**: 2026-07-22, against official vendor documentation and, where docs
  and source disagreed, against vendor source code.
- **Extended**: 2026-07-28 with §3.8 Kimi Code, verified against Moonshot's
  official docs. The same pass re-confirmed that **Claude Code still does not
  read `AGENTS.md`** (<https://code.claude.com/docs/en/memory>): *"Claude Code
  reads `CLAUDE.md`, not `AGENTS.md`."* Several third-party 2026 articles claim
  it was added as a fallback — it was not, and the `@AGENTS.md` import pointer
  remains load-bearing.
- **Re-verify before**: starting any new adapter, or any release that changes
  generated output. These conventions move fast — several claims in this file
  were wrong six months ago.

### Post-implementation re-verification (2026-07-22)

After the adapters were built, every file shape dev-suite actually writes was
cross-checked against current official docs, one assistant at a time. **All
written formats were CONFIRMED** — VS Code `.vscode/mcp.json` (`servers`/stdio)
and Copilot CLI `.github/mcp.json` (`mcpServers`/local/`tools`), Copilot
`applyTo` instructions, Cursor `.cursor/mcp.json` and `.mdc` `globs`, Gemini
`.gemini/settings.json` (`mcpServers` + `context.fileName`) and `.gemini/agents`
(`name`/`description`/`kind: local`), Codex `[mcp_servers.*]` + `.env` sub-table
TOML, and Cline `.clinerules` `paths:`. Two findings, neither a wrong format:

1. **Copilot CLI does not read `.claude/agents`** — only VS Code does; the CLI
   reads only `.github/agents/*.agent.md` (which dev-suite doesn't generate). So
   the Copilot CLI surface gets agent *routing* via AGENTS.md but no native
   subagent definitions. Now reported as a skipped capability by the Copilot
   adapter. Writing native `.github/agents/*.agent.md` (which would also enrich
   VS Code with tool restrictions) is a documented follow-up.
2. **Cursor `.mdc` `globs:` starting with `*`** is a strict-YAML alias edge that
   Cursor's lenient parser tolerates but no official example demonstrates. The
   writer now orders any concrete-prefixed glob first (match-neutral) to avoid
   relying on that leniency.

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
| Kimi Code | **Yes**, root `AGENTS.md` | `.kimi-code/AGENTS.md` (project), `$KIMI_CODE_HOME/AGENTS.md` (global) | Injected as reference data; multi-file combining rule UNCONFIRMED |

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
| Kimi Code | ❌ | ✅ | `.kimi-code/skills/` |
| Kimi CLI (legacy) | ✅ (brand group) | ✅ | `.kimi/skills/` |

**Writing `.claude/skills/` + `.agents/skills/` covers every tool listed.** Neither
alone does — and Kimi Code, the newest entry, does not widen the requirement: it
reads `.agents/skills/`, which is already written for Codex and Gemini. Note
Claude Code's collision precedence is **enterprise > personal > project** —
*inverted* relative to the project-wins convention most tools use.

The Kimi generations disagree with each other, which is the trap: the legacy
**Kimi CLI** reads a "brand group" (`.kimi/skills` → `.claude/skills` →
`.codex/skills`) and so picks up a Claude-Code-only install for free, while
**Kimi Code** dropped `.claude/skills` entirely. An install that reached a Kimi
CLI user does *not* reach the same user after they migrate.

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
| Kimi Code | `.kimi-code/agents/**/*.md` and `.agents/agents/**/*.md`, both recursive | ❌ |

`.agents/agents/` is the only *generic* agent location any vendor documents, and
so far **only Kimi documents it** — it is not the agent counterpart of
`.agents/skills/` yet. Writing there buys no portability today, so dev-suite
writes the brand path (`.kimi-code/agents/`) whose precedence is at least
bounded by the documented scope order.

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
| Kimi Code | — | — | **No glob mechanism at all** |

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
| Kimi Code | `.kimi-code/mcp.json` | `mcpServers` | omit — `command` implies stdio |
| Kimi CLI (legacy) | **None** — `~/.kimi/mcp.json` only | — | — |

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

### 3.1.1 Claude Code — plugin distribution

Sources: <https://code.claude.com/docs/en/plugins>,
<https://code.claude.com/docs/en/plugins-reference>,
<https://code.claude.com/docs/en/plugin-marketplaces>,
<https://code.claude.com/docs/en/discover-plugins>

This is a **distribution** format, not a consumption format: it is how a third party
ships agents, skills, commands, hooks and MCP config to Claude Code users. It is listed
here so nobody has to re-derive it. Investigated 2026-09-19; **dev-suite does not
implement it**, for the reasons in the last block.

- **Marketplace manifest**: `.claude-plugin/marketplace.json` at the repository root.
  Required: `name` (kebab-case), `owner` (object with a required `name`), `plugins[]`.
  Each plugin entry requires `name` and `source`. A relative `source` must start with
  `./`, e.g. `"./plugins/my-plugin"`. Users add it with
  `/plugin marketplace add owner/repo`. CONFIRMED
- **Plugin manifest**: `.claude-plugin/plugin.json`, **optional** — only `name` is
  required when present. Everything else (`commands/`, `agents/`, `skills/`, `hooks/`,
  `.mcp.json`) sits at the **plugin root**, never inside `.claude-plugin/`. CONFIRMED
- **Layout**: `skills/<name>/SKILL.md`, `commands/*.md` (flat; the docs call these
  "skills as flat Markdown files" and say *"Use `skills/` for new plugins"*),
  `agents/*.md`, `hooks/hooks.json`, `.mcp.json`, `.lsp.json`, `monitors/monitors.json`,
  `bin/`, `settings.json`. CONFIRMED
- **Path fields**: `skills` **adds to** the default directory; `commands`, `agents` and
  `outputStyles` **replace** it. All paths must be relative and start with `./`.
  CONFIRMED
- **Namespacing**: plugin skills and commands are namespaced `/plugin-name:skill-name`.
  A project's own `/skill-name` and the plugin copy **both remain available** — neither
  overrides the other. CONFIRMED
- **Agents are the exception**: *"Project and user `.claude/agents/` definitions override
  same-named plugin agents, so the plugin version only takes effect once the originals
  are removed."* They appear in the @-mention typeahead as `my-plugin:code-reviewer`.
  CONFIRMED — this is why shipping agents in a plugin is pointless for any project that
  also ran the configurator.
- **`${CLAUDE_PLUGIN_ROOT}`**: substituted inline wherever it appears in skill and agent
  content, and passed to hook processes and MCP/LSP subprocesses. CONFIRMED
- **No escaping the plugin root**: *"Claude Code doesn't let a plugin reference files
  outside its own directory. It rejects a component path that resolves outside the plugin
  root, whether the path is declared in `plugin.json` or in a marketplace entry."* A
  symlink to elsewhere in the same marketplace is **dereferenced and its content copied
  into the cache**. CONFIRMED
- **Install is a fetch, not a build.** There is no documented post-install hook. Anything
  the plugin needs at runtime must already be in the repository. CONFIRMED
- **Version**: `version` in `plugin.json` is optional; when set, users receive updates
  only when it is bumped, and it resolves against git tags named
  `{plugin-name}--v{version}`. CONFIRMED
- **Size**: a **command source** in copy mode is refused above 256 MiB or 20,000 entries.
  No limit is documented for a relative-path source. PLAUSIBLE (the limit is stated for
  one source type; whether it generalises is not)
- **Local testing**: `claude --plugin-dir ./my-plugin` loads a plugin without installing;
  `claude plugin validate ./my-plugin` runs the same check the submission pipeline does.
  CONFIRMED
- **Distribution reach**: `claude-plugins-official` is auto-registered on first
  interactive launch but *"there is no application process"*. `claude-plugins-community`
  accepts submissions via in-app forms but **must be added manually** by each user, and
  the `/plugin` Discover tab only lists marketplaces already added. CONFIRMED

**Why dev-suite does not ship one.** Three documented constraints remove every useful
payload, independently of whether the channel is worth having:

1. The launcher and the configurator live at the repository root. A plugin under
   `plugins/` cannot reference them, and a symlink copies content into the cache without
   bringing the build.
2. MCP servers cannot ship: `mcp-servers/*/dist/` is gitignored (and a bare `dist/`
   matches at any depth), and a marketplace install performs no build.
3. Agents cannot usefully ship: a project's `.claude/agents/` overrides them, and the
   source files use `allowed-tools`/`core_skills`, which `toInstalledAgentContent`
   transforms at the install boundary.

What remains self-contained is the skills — which are already distributed by
`npx skills add claude-dev-suite/claude-dev-suite`, a channel that works today, needs no
manifest, and reaches all seven target assistants rather than one.

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
  Dev-suite writes two kinds here: path-scoped agent routing (`alwaysApply: false`
  + `globs`, "Auto Attached") and rule templates (`alwaysApply: true`, no `globs`,
  "Always"). The second was reported as an unsupported capability until
  September 2026 — it was never a Cursor limitation, only an unimplemented one.
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

### 3.8 Kimi Code (Moonshot AI)

Sources: <https://moonshotai.github.io/kimi-code/en/customization/agents.html>,
`/customization/skills.html`, `/customization/mcp.html`,
`/configuration/config-files.html`; legacy generation at
<https://moonshotai.github.io/kimi-cli/en/customization/skills.html> and
`/customization/mcp.html`. Verified 2026-07-28.

> **⚠ Two generations, different directories.** `kimi-cli` (data root `~/.kimi`,
> project marker `.kimi/`) is being superseded by **Kimi Code** (`~/.kimi-code`,
> project marker `.kimi-code/`, overridable with `KIMI_CODE_HOME`). The docs home
> page states Kimi CLI *"is evolving into Kimi Code"* and points users at the new
> project. dev-suite targets **Kimi Code only**; the differences that matter are
> called out inline. "Kimi K3" is a *model*, not a configuration surface — it
> changes nothing here. CONFIRMED

- **Instructions**: reads the root `AGENTS.md` natively — no pointer file, no
  settings key, nothing for dev-suite to write. Also reads `.kimi-code/AGENTS.md`
  (project), `$KIMI_CODE_HOME/AGENTS.md` (global, default `~/.kimi-code/`) and
  the generic `~/.agents/AGENTS.md`. Content is *"injected into the prompt as
  reference data"*, unlike an agent-file body, which becomes the system prompt.
  CONFIRMED. How several of these files combine (concatenate vs closest-wins) is
  **UNCONFIRMED** — dev-suite writes a single root file, which is safe under any
  reading.
- **Skills**: project `.kimi-code/skills/` and `.agents/skills/`, resolved from
  the project root (nearest `.git` ancestor); user `$KIMI_CODE_HOME/skills/` and
  `~/.agents/skills/`. Scope precedence **Project > User > Extra > Built-in**.
  **Does not read `.claude/skills/`** — the legacy Kimi CLI did, via a
  first-match-wins brand group (`.kimi/skills` → `.claude/skills` →
  `.codex/skills`) governed by `merge_all_available_skills` (default `true`).
  CONFIRMED
  Directory-form frontmatter is stricter than the open spec: *"both `name` and
  `description` **must** be explicitly provided. Omitting either one will cause
  parsing to fail."* Flat `.md` skills are also accepted, with the directory form
  winning on a name collision. CONFIRMED
- **Agents**: `.kimi-code/agents/` and `.agents/agents/` (project),
  `$KIMI_CODE_HOME/agents/` and `~/.agents/agents/` (user), all scanned
  **recursively** for `.md`. Extra roots via `extra_agent_dirs` in `config.toml`.
  Scope order: explicit `--agent-file` > Project > Extra > User > Built-in.
  Markdown with YAML frontmatter; **`description` is the only required field**.
  Others: `name` (kebab-case, defaults to the filename), `whenToUse`, `override`,
  `model_preference` (`primary`|`secondary`), `tools`, `disallowedTools`,
  `subagents`. Built-in agent names are `coder`, `explore`, `plan`. CONFIRMED
  **⚠ Two hazards, both load-bearing for a writer:**
  1. **`override: true` replaces a built-in agent's entire system prompt.** A
     project file named `agent.md` or `coder.md` with that flag takes over the
     main agent. The docs warn to *"review `.kimi-code/agents/` and
     `.agents/agents/` in unfamiliar repositories"* precisely because these files
     come from the cloned repo. A generator must never emit `override`, and never
     a name that collides with a built-in.
  2. **The body is a template, not literal text**: *"it is rendered as a template
     each time the prompt is built: `${var}` placeholders substitute live context
     values"* (documented variables include `${base_prompt}`, `${skills}`,
     `${agents_md}`). Agent prose containing `${…}` from code examples — shell
     vars, JS template literals, `${{ secrets.X }}` in CI snippets — sits in that
     substitution path. What Kimi does with an *unknown* placeholder is
     **UNCONFIRMED**.
- **MCP**: project `.kimi-code/mcp.json`, user `~/.kimi-code/mcp.json` (or
  `$KIMI_CODE_HOME/mcp.json`); *"project-level entry takes precedence and
  overrides the user-level entry."* JSON, key `mcpServers`. Stdio entries take
  `command` + `args`, optional `env`, `cwd`, `enabled`, `startupTimeoutMs`,
  `toolTimeoutMs`, `enabledTools`, `disabledTools`; HTTP/SSE use `url`,
  `headers`, `bearerTokenEnvVar`, `transport`. No `type` discriminator for stdio.
  CONFIRMED — this is the closest shape to Claude Code's `.mcp.json` of any
  non-Claude target. **The legacy Kimi CLI has no project-level MCP file at all**
  (`~/.kimi/mcp.json` only), so this capability arrived with Kimi Code.
- **Path-scoped rules**: none. No `applyTo`/`globs`/`paths` mechanism exists;
  scoping is by scope hierarchy only. CONFIRMED
- **Settings / hooks / permissions**: TOML in `~/.kimi-code/config.toml`
  (`[[hooks]]`, `[[permission.rules]]`, `[tools]`, `[models]`, …) — **user-level
  only**. The one project-level TOML is `.kimi-code/local.toml`, created by
  `/add-dir` for workspace paths and documented as machine-specific (*add to
  `.gitignore`*). Nothing committable for dev-suite to write. CONFIRMED
- **Commands**: no project-level slash-command directory documented. Skills are
  invoked as `/skill:<name>`. CONFIRMED

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
11. **Kimi Code dropped `.claude/skills`.** The legacy Kimi CLI read it as part
    of its brand group, Kimi Code does not. The same project stops exposing its
    skills the day the user migrates, with no error on either side — only
    `.agents/skills/` reaches both. *(Added 2026-07-28.)*
12. **Kimi agent bodies are `${var}` templates.** An agent file body is rendered
    as a template on every prompt build. Prose carrying `${…}` from code examples
    enters the substitution path, and unknown-placeholder behaviour is
    undocumented — a corrupted system prompt would show up as degraded answers,
    never as a parse error. *(Added 2026-07-28.)*

---

## Part 5 — Unconfirmed register

**Do not implement against these.** Either defer the feature or degrade
gracefully. Resolve one and move it into Part 3 with its source.

| # | Item | Affects |
|---|---|---|
| 1 | `${env:VAR}` interpolation in `.vscode/mcp.json` — the reference page lists only `${input:id}` and `${workspaceFolder}` | Copilot MCP writer — prefer literal values or `envFile` |
| 2 | Whether Copilot CLI honours `.vscode/mcp.json` | Copilot MCP writer — assume it does not |
| 2b | Whether Copilot CLI accepts a project `.mcp.json` entry that omits `type` and `tools` (i.e. the file dev-suite already writes for Claude Code). The path and top-level key match, but the documented CLI entry shape uses `type: "local"` plus a `tools` allowlist, and whether those default is not documented. **Not testable here — Copilot CLI is not installed on the dev machine.** | Sidestepped rather than resolved: dev-suite writes `.github/mcp.json` with the explicit CLI shape, so it never depends on a default, and never mutates the file Claude Code owns |
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
| 13 | How Kimi Code combines several `AGENTS.md` (root vs `.kimi-code/AGENTS.md` vs global): concatenate or closest-wins | Kimi instructions — dev-suite writes one root file, safe under either |
| 14 | Precedence between `.kimi-code/agents` and `.agents/agents` (both are "Project" scope) | Kimi agents — write one location only, never both |
| 15 | Whether any tool other than Kimi reads `.agents/agents/` | Cross-target agent writers — do not treat it as a standard yet |
| 16 | What Kimi Code does with an **unknown** `${var}` in an agent body (substitute empty, leave literal, or error) | Kimi agent writer — bodies are copied verbatim; the adapter reports affected agents instead of rewriting prose. **Verify empirically before relying on native Kimi subagents** |
| 17 | Version floor for every Kimi Code claim (docs are built from `main`, unversioned) | Kimi — establish by testing a pinned binary if a floor is needed |
| 18 | Whether `"source": "./"` (the repository root as the plugin itself) is a valid Claude Code marketplace source. The spec says a path source "must start with `./`" and every example is a subdirectory | Plugin marketplace — use an explicit subdirectory, never `"./"` |
| 19 | Precedence between a plugin **command** and a project `.claude/commands/` file of the same name. Skills are documented as both remaining available under separate names; commands are documented as "skills as flat Markdown files" but the collision is not stated directly | Plugin commands — assume both appear, and do not rely on either winning |
| 20 | Whether the 256 MiB / 20,000-entry ceiling documented for a **command source** also applies to a relative-path source | Plugin size — stay well under it regardless |
| 21 | Whether a Gemini CLI **extension** (`gemini-extension.json` + the `gemini-cli-extension` topic) can carry anything dev-suite could actually ship, given MCP bundles are not committed. The extension *gallery* is documented; the useful payload is not established | Gemini distribution — not implemented; skills already ship via `npx skills add` |
| 22 | Whether a **Cursor** hook (`.cursor/hooks.json`, 21 camelCase events) can return context the model reads, the way Claude Code's `additionalContext` does. The events are confirmed; an output contract that reaches the model is not | Skill-suggestion hooks — Cursor gets the model-driven protocol only |
| 23 | Whether a **Gemini CLI** hook (`BeforeAgent` / `BeforeModel` / `BeforeToolSelection`) can inject context. Gemini hooks must emit only JSON on stdout, so a channel exists; what the schema accepts is not documented | Skill-suggestion hooks — Gemini gets the model-driven protocol only |
| 24 | Whether a **Copilot** hook (`.github/hooks/*.json`) can inject context. The `prompt` type is documented for `sessionStart` only, and `command`/`http` output handling is not stated. Note these are CLI/cloud-agent only — never VS Code | Skill-suggestion hooks — Copilot gets the model-driven protocol only |
| 25 | Whether **Codex** `userPromptSubmit` / `subagentStart` hooks can inject context, and whether the feature flag is on by default (see #7) | Skill-suggestion hooks — Codex gets the protocol inline in AGENTS.md instead |
| 26 | Whether a **Cline** hook script can inject context, on top of the unresolved path in #9. Moot for skills while Cline has no committable MCP: there is no `skill-loader` to point at | Skill-suggestion hooks — not applicable to Cline |
| 27 | Whether Claude Code's `updatedInput` on `PreToolUse` applies to the **`Task`** tool, i.e. whether rewriting a subagent's prompt before it spawns is honoured. `additionalContext` and `updatedInput` are documented for `PreToolUse` generally; the `Task` case is not called out. `SubagentStart` exists and matches on `agent_type`, but its decision-control row was not readable | Skill-suggestion hook — verify empirically before relying on either |

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
- **Kimi Code costs almost nothing to support and was already half-supported.**
  It reads the root `AGENTS.md` and `.agents/skills/` that Codex and Gemini
  already require, so only two writers are target-specific: `.kimi-code/mcp.json`
  (a near-copy of the Claude shape) and native agent files. It has no
  glob-scoped rules and no committable settings/hooks — both are permanent
  capability gaps to report, not gaps to fill.

Capability flags live in `configurator/dashboard/server/src/services/targets/target-layout.ts`;
paths resolve through `target-paths.ts`. When this document and those descriptors
disagree, this document is right and the descriptor is a bug.
