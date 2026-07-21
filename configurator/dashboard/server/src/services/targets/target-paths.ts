// SPDX-License-Identifier: MIT
/**
 * Target Path Resolver
 *
 * Turns a {@link TargetLayout} descriptor into concrete paths for one project.
 * Services use this instead of hardcoding `.claude/agents`, `.mcp.json`, … so
 * that pointing dev-suite at another assistant is a descriptor change, not a
 * find-and-replace across the codebase.
 *
 * Two flavours of every path:
 *  - `rel*()` → project-relative, POSIX separators. This is what goes into the
 *    manifest, and manifest paths are compared as strings across platforms.
 *  - the matching accessor without the prefix → absolute, native separators,
 *    for filesystem calls.
 *
 * Accessors for optional locations throw when the target has no such directory,
 * so a capability mismatch surfaces at the call site instead of silently
 * writing to the project root.
 */

import * as path from 'path';
import {
  DEFAULT_TARGET,
  MCP_SERVERS_DIR,
  SHARED_INSTRUCTIONS_FILE,
  getTargetLayout,
  type TargetId,
  type TargetLayout,
} from './target-layout.js';

/** Concrete paths of one target inside one project. */
export class TargetPaths {
  readonly layout: TargetLayout;

  constructor(
    /** Absolute path of the target project. */
    readonly root: string,
    readonly target: TargetId = DEFAULT_TARGET
  ) {
    this.layout = getTargetLayout(target);
  }

  /** Resolve a project-relative path to an absolute one. */
  abs(relativePath: string): string {
    return path.join(this.root, ...relativePath.split('/'));
  }

  private required(value: string | undefined, what: string): string {
    if (!value) {
      throw new Error(`Target "${this.target}" has no ${what} directory configured`);
    }
    return value;
  }

  // --- Directories -------------------------------------------------------

  get relConfigDir(): string {
    return this.required(this.layout.configDir, 'config');
  }
  get configDir(): string {
    return this.abs(this.relConfigDir);
  }

  get relAgentsDir(): string {
    return this.required(this.layout.agentsDir, 'agents');
  }
  get agentsDir(): string {
    return this.abs(this.relAgentsDir);
  }

  get relSkillsDir(): string {
    return this.required(this.layout.skillsDir, 'skills');
  }
  get skillsDir(): string {
    return this.abs(this.relSkillsDir);
  }

  get relCommandsDir(): string {
    return this.required(this.layout.commandsDir, 'commands');
  }
  get commandsDir(): string {
    return this.abs(this.relCommandsDir);
  }

  get relRulesDir(): string {
    return this.required(this.layout.rulesDir, 'rules');
  }
  get rulesDir(): string {
    return this.abs(this.relRulesDir);
  }

  /**
   * Where dev-suite installs MCP server bundles. Target-independent: the
   * bundles are plain node packages, only the config file referencing them
   * differs per assistant.
   */
  get relMcpServersDir(): string {
    return MCP_SERVERS_DIR;
  }
  get mcpServersDir(): string {
    return this.abs(MCP_SERVERS_DIR);
  }

  // --- Files -------------------------------------------------------------

  /** The instructions file this target reads (may be the shared AGENTS.md). */
  get relInstructionsFile(): string {
    return this.layout.instructionsFile;
  }
  get instructionsFile(): string {
    return this.abs(this.relInstructionsFile);
  }

  /** The cross-assistant instructions file, always AGENTS.md. */
  get relSharedInstructionsFile(): string {
    return SHARED_INSTRUCTIONS_FILE;
  }
  get sharedInstructionsFile(): string {
    return this.abs(SHARED_INSTRUCTIONS_FILE);
  }

  get relMcpConfigFile(): string {
    return this.required(this.layout.mcpConfigFile, 'MCP config');
  }
  get mcpConfigFile(): string {
    return this.abs(this.relMcpConfigFile);
  }

  get relSettingsFile(): string {
    return this.required(this.layout.settingsFile, 'settings');
  }
  get settingsFile(): string {
    return this.abs(this.relSettingsFile);
  }

  // --- Per-entity paths --------------------------------------------------

  /** Agent definition file, e.g. `.claude/agents/react-expert.md`. */
  relAgentFile(agentId: string): string {
    return `${this.relAgentsDir}/${agentId}${this.layout.agentFileExtension ?? '.md'}`;
  }
  agentFile(agentId: string): string {
    return this.abs(this.relAgentFile(agentId));
  }

  /** Skill directory, e.g. `.claude/skills/frontend-react`. */
  relSkillDir(skillName: string): string {
    return `${this.relSkillsDir}/${skillName}`;
  }
  skillDir(skillName: string): string {
    return this.abs(this.relSkillDir(skillName));
  }

  /** Path-scoped rule file, e.g. `.claude/rules/frontend.md`. */
  relRuleFile(ruleId: string): string {
    return `${this.relRulesDir}/${ruleId}${this.layout.ruleFileExtension ?? '.md'}`;
  }
  ruleFile(ruleId: string): string {
    return this.abs(this.relRuleFile(ruleId));
  }

  /** Installed MCP server bundle directory. */
  relMcpServerDir(serverName: string): string {
    return `${MCP_SERVERS_DIR}/${serverName}`;
  }
  mcpServerDir(serverName: string): string {
    return this.abs(this.relMcpServerDir(serverName));
  }

  /** Entry point of an installed MCP server bundle. */
  mcpServerEntry(serverName: string): string {
    return path.join(this.mcpServerDir(serverName), 'dist', 'index.js');
  }

  /** User-reserved agents directory — dev-suite never erases its contents. */
  get relCustomAgentsDir(): string {
    return this.layout.customAgentsDir ?? `${this.relAgentsDir}/custom`;
  }
  get customAgentsDir(): string {
    return this.abs(this.relCustomAgentsDir);
  }

  /** User-reserved skills directory — dev-suite never erases its contents. */
  get relCustomSkillsDir(): string {
    return this.layout.customSkillsDir ?? `${this.relSkillsDir}/custom`;
  }
  get customSkillsDir(): string {
    return this.abs(this.relCustomSkillsDir);
  }
}

/** Resolve the paths of `target` inside `projectPath`. */
export function targetPaths(projectPath: string, target: TargetId = DEFAULT_TARGET): TargetPaths {
  return new TargetPaths(projectPath, target);
}
