// SPDX-License-Identifier: MIT
/**
 * Target Layout Descriptors
 *
 * Single source of truth for *where* each supported AI coding assistant expects
 * its project-level configuration to live. Every service that writes into a
 * target project resolves its paths through this module instead of hardcoding
 * `.claude/`, `.mcp.json`, `CLAUDE.md`, …
 *
 * Adding a new assistant = adding a descriptor here + a writer/adapter that
 * knows the file *formats* (see docs/planning/multi-assistant.md).
 *
 * Capability flags exist because assistants do not support the same primitives:
 * Windsurf has no file-based custom agents, Cline has no project-level MCP
 * config, etc. Callers must degrade gracefully (skip + report) rather than fail.
 */

/** Identifier of a supported target assistant. */
export type TargetId =
  | 'claude-code'
  | 'copilot'
  | 'cursor'
  | 'codex'
  | 'gemini'
  | 'windsurf'
  | 'cline'
  | 'kimi-code';

/**
 * Which shared skills directory a target reads. The `.claude/skills` substrate
 * is read by Claude Code, Copilot, Cursor and Cline; Codex, Gemini and Kimi Code
 * read the cross-tool `.agents/skills` directory instead. dev-suite writes
 * whichever is needed (see installation/substrate.ts).
 */
export type SkillsSource = 'claude' | 'agents';

/** Where a target reads MCP server configuration from, if at all. */
export type McpConfigScope =
  /** Config file lives inside the project (committable). */
  | 'project'
  /** Config file lives in the user's home directory (requires explicit opt-in). */
  | 'user'
  /** No MCP support. */
  | 'none';

/**
 * Which primitives a target supports. The install pipeline consults these to
 * decide what to write and what to report as unsupported.
 */
export interface TargetCapabilities {
  /** File-based custom agents / subagents. */
  agents: boolean;
  /** Agent Skills (SKILL.md) discovery. */
  skills: boolean;
  /** Reusable prompts / slash commands. */
  commands: boolean;
  /** Rules that activate on file globs (path-scoped instructions). */
  pathScopedRules: boolean;
  /** MCP support and where its config lives. */
  mcp: McpConfigScope;
  /** Lifecycle hooks. */
  hooks: boolean;
  /** Project-level settings/permissions file. */
  settings: boolean;
  /** Which shared skills directory this target reads. */
  skillsSource: SkillsSource;
  /**
   * Where this target picks up the agents a dev-suite install actually writes.
   *
   * Distinct from `agents`, which states whether the *tool* supports file-based
   * agents at all. Codex supports them (`.codex/agents/**\/*.toml`) but
   * dev-suite emits no TOML agents, so a dev-suite install leaves Codex with no
   * loadable agent — `'none'` here, `agents: true` above.
   *
   * - `'claude'`  reads the shared `.claude/agents` substrate directly
   * - `'native'`  an adapter writes agent files in the target's own format
   * - `'none'`    a dev-suite install gives this target no loadable agent
   */
  agentsSource: AgentsSource;
}

/** @see TargetCapabilities.agentsSource */
export type AgentsSource = 'claude' | 'native' | 'none';

/**
 * Filesystem layout of one target, expressed as paths relative to the project
 * root. `undefined` means the target has no such location (check capabilities).
 */
export interface TargetLayout {
  id: TargetId;
  /** Human-readable name for UI and reports. */
  displayName: string;
  /** Root configuration directory, when the target has one (e.g. `.claude`). */
  configDir?: string;
  /** Directory holding agent definition files. */
  agentsDir?: string;
  /** Directory holding skill directories (`<name>/SKILL.md`). */
  skillsDir?: string;
  /** Directory holding reusable commands/prompts. */
  commandsDir?: string;
  /** Directory holding path-scoped rule files. */
  rulesDir?: string;
  /** File extension used for agent definitions (e.g. `.md`, `.agent.md`, `.toml`). */
  agentFileExtension?: string;
  /** Extension used for path-scoped rule files. */
  ruleFileExtension?: string;
  /** Primary instructions/memory file this target reads. */
  instructionsFile: string;
  /** MCP configuration file (see `capabilities.mcp` for its scope). */
  mcpConfigFile?: string;

  /**
   * Additional project MCP config files this target reads, beyond
   * `mcpConfigFile`.
   *
   * Only Copilot has one today. It used to be hardcoded as a literal
   * `'.github/mcp.json'` in four separate modules — gitignore, install-recovery,
   * uninstall and the adapter — which meant `sharedConfigCoverage()`, whose job
   * is to catch exactly this, derived from `mcpConfigFile` alone and could not
   * see it by construction.
   */
  extraMcpConfigFiles?: string[];
  /** Project-level settings/permissions file. */
  settingsFile?: string;
  /** Hooks configuration file, when separate from the settings file. */
  hooksFile?: string;
  /** Reserved directory for user-authored agents — dev-suite never touches it. */
  customAgentsDir?: string;
  /** Reserved directory for user-authored skills — dev-suite never touches it. */
  customSkillsDir?: string;
  capabilities: TargetCapabilities;
}

/**
 * The instructions file shared across assistants. Generated as the primary
 * artifact; per-target instruction files import or duplicate it.
 * See decision 2 in docs/planning/multi-assistant.md.
 */
export const SHARED_INSTRUCTIONS_FILE = 'AGENTS.md';

/** Directory where dev-suite installs MCP server bundles (target-independent). */
export const MCP_SERVERS_DIR = '.mcp-servers';

/**
 * Cross-tool skills directory (the Agent Skills interop path). Written in
 * addition to `.claude/skills` when a selected target reads it (Codex, Gemini,
 * Kimi Code).
 */
export const AGENTS_SKILLS_DIR = '.agents/skills';

/** Target assumed when a manifest or request does not specify one. */
export const DEFAULT_TARGET: TargetId = 'claude-code';

const CLAUDE_CODE: TargetLayout = {
  id: 'claude-code',
  displayName: 'Claude Code',
  configDir: '.claude',
  agentsDir: '.claude/agents',
  skillsDir: '.claude/skills',
  commandsDir: '.claude/commands',
  rulesDir: '.claude/rules',
  agentFileExtension: '.md',
  ruleFileExtension: '.md',
  instructionsFile: 'CLAUDE.md',
  mcpConfigFile: '.mcp.json',
  settingsFile: '.claude/settings.json',
  customAgentsDir: '.claude/agents/custom',
  customSkillsDir: '.claude/skills/custom',
  capabilities: {
    agents: true,
    skills: true,
    commands: true,
    pathScopedRules: true,
    mcp: 'project',
    hooks: true,
    settings: true,
    skillsSource: 'claude',
    agentsSource: 'claude',
  },
};

/**
 * GitHub Copilot (CLI + VS Code).
 *
 * Reads `AGENTS.md` natively, and also discovers `.claude/skills/` and
 * `.claude/agents/` for cross-tool compatibility — so a Claude-Code install is
 * already partially understood by Copilot. MCP is the real divergence: VS Code
 * uses `.vscode/mcp.json` with a top-level `servers` key (not `mcpServers`),
 * while the CLI reads `~/.copilot/mcp-config.json` (user scope → opt-in).
 */
const COPILOT: TargetLayout = {
  id: 'copilot',
  displayName: 'GitHub Copilot',
  configDir: '.github',
  agentsDir: '.github/agents',
  skillsDir: '.github/skills',
  commandsDir: '.github/prompts',
  rulesDir: '.github/instructions',
  agentFileExtension: '.agent.md',
  ruleFileExtension: '.instructions.md',
  instructionsFile: SHARED_INSTRUCTIONS_FILE,
  mcpConfigFile: '.vscode/mcp.json',
  // Copilot is the one target with two MCP surfaces: VS Code reads
  // `.vscode/mcp.json`, the CLI reads `.github/mcp.json` (different key and
  // entry shape — see writers/mcp-config.writer.ts).
  extraMcpConfigFiles: ['.github/mcp.json'],
  settingsFile: '.github/copilot/settings.json',
  hooksFile: '.github/hooks/dev-suite.json',
  capabilities: {
    agents: true,
    skills: true,
    commands: true,
    pathScopedRules: true,
    mcp: 'project',
    hooks: true,
    settings: true,
    skillsSource: 'claude',
    agentsSource: 'claude',
  },
};

/**
 * Cursor.
 *
 * Reads `AGENTS.md` natively (>= 1.6) and also discovers `.claude/skills/` and
 * `.claude/agents/`. Its MCP file is nearly copy-compatible with Claude Code's
 * `.mcp.json` (same `mcpServers` key) apart from env interpolation syntax.
 */
const CURSOR: TargetLayout = {
  id: 'cursor',
  displayName: 'Cursor',
  configDir: '.cursor',
  agentsDir: '.cursor/agents',
  skillsDir: '.cursor/skills',
  commandsDir: '.cursor/commands',
  rulesDir: '.cursor/rules',
  agentFileExtension: '.md',
  ruleFileExtension: '.mdc',
  instructionsFile: SHARED_INSTRUCTIONS_FILE,
  mcpConfigFile: '.cursor/mcp.json',
  settingsFile: '.cursor/cli.json',
  hooksFile: '.cursor/hooks.json',
  capabilities: {
    agents: true,
    skills: true,
    commands: true,
    pathScopedRules: true,
    mcp: 'project',
    hooks: true,
    settings: true,
    skillsSource: 'claude',
    agentsSource: 'claude',
  },
};

/**
 * OpenAI Codex CLI.
 *
 * Reads `AGENTS.md` natively and skills from `.agents/skills`. MCP config is
 * TOML in `.codex/config.toml` (`[mcp_servers.<n>]`), and only applies in a
 * trusted project — a caveat the adapter surfaces. Does NOT read `.claude/`.
 */
const CODEX: TargetLayout = {
  id: 'codex',
  displayName: 'OpenAI Codex CLI',
  configDir: '.codex',
  agentsDir: '.codex/agents',
  skillsDir: AGENTS_SKILLS_DIR,
  instructionsFile: SHARED_INSTRUCTIONS_FILE,
  mcpConfigFile: '.codex/config.toml',
  agentFileExtension: '.toml',
  capabilities: {
    agents: true,
    skills: true,
    commands: false,
    pathScopedRules: false, // no glob mechanism — routing rides in AGENTS.md
    mcp: 'project',
    hooks: true,
    // No separate project settings file dev-suite writes — config.toml is it.
    settings: false,
    skillsSource: 'agents',
    agentsSource: 'none',
  },
};

/**
 * Google Gemini CLI.
 *
 * Reads skills from `.agents/skills`, but does NOT read `AGENTS.md` by default —
 * the adapter sets `context.fileName` in `.gemini/settings.json` to include it.
 * MCP lives in the same JSON settings file under `mcpServers`.
 */
const GEMINI: TargetLayout = {
  id: 'gemini',
  displayName: 'Gemini CLI',
  configDir: '.gemini',
  agentsDir: '.gemini/agents',
  skillsDir: AGENTS_SKILLS_DIR,
  commandsDir: '.gemini/commands',
  instructionsFile: SHARED_INSTRUCTIONS_FILE,
  mcpConfigFile: '.gemini/settings.json',
  settingsFile: '.gemini/settings.json',
  agentFileExtension: '.md',
  capabilities: {
    agents: true,
    skills: true,
    commands: true,
    pathScopedRules: false, // no glob mechanism
    mcp: 'project',
    hooks: true,
    settings: true,
    skillsSource: 'agents',
    agentsSource: 'native',
  },
};

/**
 * Cline (VS Code extension).
 *
 * Reads `AGENTS.md` and the `.claude/skills` substrate directly, and path-scoped
 * rules from `.clinerules/*.md` (`paths:` YAML list, same shape as Claude). Its
 * MCP config is user-global only — nothing committable — a permanent gap the
 * adapter reports rather than pretends to fill. File-based agents apply only to
 * Cline's SDK/CLI, not the VS Code extension, so they are not written either.
 */
const CLINE: TargetLayout = {
  id: 'cline',
  displayName: 'Cline',
  configDir: '.clinerules',
  skillsDir: '.claude/skills',
  rulesDir: '.clinerules',
  ruleFileExtension: '.md',
  instructionsFile: SHARED_INSTRUCTIONS_FILE,
  capabilities: {
    agents: false, // VS Code extension does not read file-based agents
    skills: true,
    commands: false,
    pathScopedRules: true,
    mcp: 'none', // user-global only — nothing committable
    hooks: true,
    settings: false,
    skillsSource: 'claude',
    agentsSource: 'none',
  },
};

/**
 * Kimi Code (Moonshot AI).
 *
 * Reads the root `AGENTS.md` natively and skills from `.agents/skills` — both
 * already produced for Codex/Gemini — so only two surfaces are Kimi-specific:
 * `.kimi-code/mcp.json` (JSON, `mcpServers`, the closest shape to Claude's
 * `.mcp.json` of any non-Claude target) and native agent files under
 * `.kimi-code/agents`. Does NOT read `.claude/` anything.
 *
 * No glob-scoped rules, and hooks/permissions live in the *user's*
 * `~/.kimi-code/config.toml` — the only project TOML (`.kimi-code/local.toml`)
 * is machine-specific and documented as gitignored, so there is no committable
 * settings file to write. Both are reported as permanent gaps.
 *
 * Targets the current generation only: the legacy `kimi-cli` (`.kimi/`) has no
 * project-level MCP config at all, and reads `.claude/skills` anyway.
 * See docs/ASSISTANT-FORMAT-REFERENCE.md section 3.8.
 */
const KIMI_CODE: TargetLayout = {
  id: 'kimi-code',
  displayName: 'Kimi Code',
  configDir: '.kimi-code',
  agentsDir: '.kimi-code/agents',
  skillsDir: AGENTS_SKILLS_DIR,
  instructionsFile: SHARED_INSTRUCTIONS_FILE,
  mcpConfigFile: '.kimi-code/mcp.json',
  agentFileExtension: '.md',
  capabilities: {
    agents: true,
    skills: true,
    commands: false, // no project-level command directory; skills are `/skill:<name>`
    pathScopedRules: false, // no glob mechanism — routing rides in AGENTS.md
    mcp: 'project',
    hooks: false, // `[[hooks]]` is user-level config.toml only
    settings: false, // `.kimi-code/local.toml` is machine-specific, not committable
    skillsSource: 'agents',
    agentsSource: 'native',
  },
};

/**
 * Registry of known targets.
 *
 * Only targets with a working adapter should be offered in the UI — see
 * `isImplemented()`. Descriptors for planned targets live here so that layout
 * data stays in one place while adapters land phase by phase.
 */
export const TARGET_LAYOUTS: Readonly<Partial<Record<TargetId, TargetLayout>>> = Object.freeze({
  'claude-code': CLAUDE_CODE,
  copilot: COPILOT,
  cursor: CURSOR,
  codex: CODEX,
  gemini: GEMINI,
  cline: CLINE,
  'kimi-code': KIMI_CODE,
  // Tier 3 descriptor (windsurf) lands with its adapter.
});

/**
 * Targets that currently have a full write path implemented. Must stay in step
 * with the adapter registry in `targets/adapters/index.ts` — a test asserts it.
 */
const IMPLEMENTED_TARGETS: readonly TargetId[] = Object.freeze(['claude-code', 'copilot', 'cursor', 'gemini', 'codex', 'cline', 'kimi-code']);

/** True when dev-suite can actually install for this target today. */
export function isImplemented(target: TargetId): boolean {
  return IMPLEMENTED_TARGETS.includes(target);
}

/** All targets that can currently be installed. */
export function listImplementedTargets(): TargetLayout[] {
  return IMPLEMENTED_TARGETS.map(id => getTargetLayout(id));
}

/**
 * Resolve the layout descriptor for a target.
 * @throws {Error} when the target is unknown or has no descriptor yet.
 */
export function getTargetLayout(target: TargetId = DEFAULT_TARGET): TargetLayout {
  const layout = TARGET_LAYOUTS[target];
  if (!layout) {
    throw new Error(`Unknown or not-yet-supported target: ${target}`);
  }
  return layout;
}

/**
 * True when any of these targets reads the cross-tool `.agents/skills`
 * directory rather than the `.claude/skills` substrate. Drives the substrate's
 * dual-write (installation/substrate.ts) and the reinstall backup.
 */
export function readsAgentsSkills(targets: readonly TargetId[]): boolean {
  return agentsSkillsReaders(targets).length > 0;
}

/**
 * The selected targets that read `.agents/skills`, in the given order.
 *
 * The mirror is written once and belongs to whichever of them is installed;
 * `substrate.ts` used to record it under a hardcoded `'codex'`, so a
 * Gemini-only or Kimi-only project carried manifest entries for a target it had
 * never selected — and reinstall, which classifies by `file.target`, could not
 * place them.
 */
export function agentsSkillsReaders(targets: readonly TargetId[]): TargetId[] {
  return targets.filter(t => TARGET_LAYOUTS[t]?.capabilities.skillsSource === 'agents');
}

/**
 * Every directory this target's layout *declares*, whether or not dev-suite
 * writes into it.
 *
 * NOT an uninstall set, despite what an earlier version of this comment said:
 * `getManagedDirs('copilot')` returns `.github/agents`, `.github/skills` and
 * `.github/prompts`, none of which dev-suite creates, and
 * `getManagedDirs('cline')` returns `.claude/skills`, which is the shared
 * substrate. Removal decides ownership from the manifest and the skill
 * ownership sentinel instead — see `installation/uninstall.ts`.
 */
export function getManagedDirs(target: TargetId = DEFAULT_TARGET): string[] {
  const layout = getTargetLayout(target);
  return [layout.agentsDir, layout.skillsDir, layout.commandsDir, layout.rulesDir].filter(
    (d): d is string => Boolean(d)
  );
}

/**
 * Files that are shared with the user (merged, never erased wholesale):
 * instructions files and settings/MCP config the assistant also uses for
 * unrelated configuration.
 */
export function getSharedFiles(target: TargetId = DEFAULT_TARGET): string[] {
  const layout = getTargetLayout(target);
  const files = [layout.instructionsFile, SHARED_INSTRUCTIONS_FILE];
  if (layout.settingsFile) files.push(layout.settingsFile);
  if (layout.mcpConfigFile && layout.capabilities.mcp === 'project') files.push(layout.mcpConfigFile);
  return [...new Set(files)];
}

/**
 * True when the path is inside a user-reserved `custom/` area that dev-suite
 * must never erase, for any target.
 */
export function isCustomUserPath(relativePath: string): boolean {
  return /(^|[/\\])custom([/\\]|$)/.test(relativePath);
}

/**
 * True when at least one of these targets can actually load an agent file.
 *
 * Codex and Cline read `AGENTS.md` but load no agent files of any kind, so
 * `@<id>` is not invocable for them — instructions telling them to delegate
 * described something they cannot do.
 */
export function anyTargetLoadsAgents(targets: readonly TargetId[]): boolean {
  return targets.some(t => {
    try {
      return getTargetLayout(t).capabilities.agentsSource !== 'none';
    } catch {
      return false;
    }
  });
}

/**
 * Every project MCP config file a target reads: its primary one plus any extra
 * surface. The single source for gitignore, env recovery, un-merge and the
 * coverage gate.
 */
export function mcpConfigFilesFor(target: TargetId): string[] {
  try {
    const layout = getTargetLayout(target);
    if (layout.capabilities.mcp !== 'project') return [];
    return [layout.mcpConfigFile, ...(layout.extraMcpConfigFiles ?? [])].filter(
      (f): f is string => Boolean(f)
    );
  } catch {
    return [];
  }
}

/** True when at least one of these targets has a glob-activated rule mechanism. */
export function anyTargetSupportsGlobs(targets: readonly TargetId[]): boolean {
  return targets.some(t => {
    try {
      return Boolean(getTargetLayout(t).rulesDir);
    } catch {
      return false;
    }
  });
}
