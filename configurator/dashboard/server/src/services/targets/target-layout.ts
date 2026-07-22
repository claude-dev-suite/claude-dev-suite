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
  | 'cline';

/**
 * Which shared skills directory a target reads. The `.claude/skills` substrate
 * is read by Claude Code, Copilot, Cursor and Cline; Codex and Gemini read the
 * cross-tool `.agents/skills` directory instead. dev-suite writes whichever is
 * needed (see installation/substrate.ts).
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
}

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
 * addition to `.claude/skills` when a selected target reads it (Codex, Gemini).
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
  // Tier 3 descriptors (windsurf, cline) land with their adapters.
});

/**
 * Targets that currently have a full write path implemented. Must stay in step
 * with the adapter registry in `targets/adapters/index.ts` — a test asserts it.
 */
const IMPLEMENTED_TARGETS: readonly TargetId[] = Object.freeze(['claude-code', 'copilot', 'cursor', 'gemini', 'codex']);

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
  return targets.some(t => {
    const layout = TARGET_LAYOUTS[t];
    return layout?.capabilities.skillsSource === 'agents';
  });
}

/**
 * Directories a target owns inside a project, used by uninstall/erase flows.
 * Only directories dev-suite writes into are returned — never the whole
 * config dir when the assistant also stores unrelated user state there.
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
