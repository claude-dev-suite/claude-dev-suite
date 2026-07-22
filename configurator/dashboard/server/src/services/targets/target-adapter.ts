// SPDX-License-Identifier: MIT
/**
 * Target Adapter
 *
 * The seam between *deciding what to install* and *writing it for one
 * assistant*. `InstallationService` resolves an {@link InstallPlan} without
 * touching disk, then hands it to one adapter per selected target.
 *
 * What belongs where:
 *  - **Service (target-neutral)**: the plan itself, `.mcp-servers/<name>/`
 *    bundle copies (plain node packages — only the config file *referencing*
 *    them differs per assistant), `.dev-suite.json`, `.dev-suite-manifest.json`,
 *    and the shared `AGENTS.md`.
 *  - **Adapter (target-specific)**: everything whose *format or location*
 *    depends on the assistant — its config directories, agent and skill files,
 *    MCP config file, settings, hooks, and path-scoped rules.
 *
 * Adapters must degrade rather than fail: when the target does not support a
 * primitive, skip it and report it via {@link TargetWriteResult.skipped} so the
 * caller can tell the user. See docs/ASSISTANT-FORMAT-REFERENCE.md for what
 * each assistant actually supports — that file is normative.
 */

import type { Agent, InstallManifest, DetectionResult } from '../../types.js';
import type { ExtendedManifest } from '../../types/index.js';
import type { TargetId, TargetLayout } from './target-layout.js';
import type { TargetPaths } from './target-paths.js';

/** How skills are made available to the assistant. */
export type SkillLoadingMode = 'eager' | 'lazy';

/**
 * A resolved, tool-neutral description of what to install.
 *
 * Everything here is decided before any file is written, and is identical
 * across targets — two adapters given the same plan install the same
 * *components*, differing only in how they serialize them.
 */
export interface InstallPlan {
  /** Absolute, validated path of the target project. */
  projectPath: string;
  /** Absolute path of the dev-suite source tree. */
  devSuiteDir: string;
  /** Agent ids to install. */
  agents: string[];
  /** MCP server names to install, after auto-includes have been resolved. */
  mcpServers: string[];
  /** Rule template ids to copy. */
  rules: string[];
  /** Environment variables to bake into MCP server entries. */
  envVars: Record<string, string>;
  /** Whether skills are copied eagerly or fetched on demand. */
  skillLoadingMode: SkillLoadingMode;
  /** Detected project stack, when detection ran. */
  detectedStack?: DetectionResult;
  /** Full agent catalog, so adapters can resolve metadata without re-reading it. */
  agentCatalog: Agent[];
  /**
   * Names of every MCP server dev-suite can install. Adapters that *merge* into
   * a shared config file (e.g. Copilot's `.vscode/mcp.json`) use this to drop
   * their own deselected entries while leaving the user's servers untouched.
   */
  mcpCatalog: string[];
}

/** A resolved MCP server entry, before it is serialized into a target's format. */
export interface McpServerEntry {
  command: string;
  args: string[];
  env: Record<string, string>;
}

/** A primitive the target could not receive, and why. */
export interface SkippedCapability {
  /** Primitive name, e.g. `mcp`, `hooks`, `pathScopedRules`. */
  capability: string;
  /** Human-readable explanation, surfaced to the user. */
  reason: string;
}

/** Everything an adapter needs to write one target's configuration. */
export interface TargetWriteContext {
  plan: InstallPlan;
  /** Resolved paths for this adapter's target. */
  paths: TargetPaths;
  /**
   * MCP servers whose bundles are already installed under `.mcp-servers/`,
   * keyed by server name. The adapter decides the file, key and entry shape —
   * see the MCP table in docs/ASSISTANT-FORMAT-REFERENCE.md, where the formats
   * genuinely diverge (Copilot's VS Code surface uses `servers`, not
   * `mcpServers`, and requires `type: "stdio"`).
   */
  mcpServers: Record<string, McpServerEntry>;
  /** Legacy manifest, kept for backward compatibility with existing consumers. */
  manifest: InstallManifest;
  /** Extended manifest — adapters record every file they write here. */
  extendedManifest: ExtendedManifest;
}

/**
 * What an adapter did, so the caller can finish the install and report.
 *
 * Note there is no `installedAgents` here: agents are written once, as the
 * shared `.claude/` substrate, before any adapter runs — see
 * installation/substrate.ts. Adapters contribute only their own format.
 */
export interface TargetWriteResult {
  /** Project-relative paths of path-scoped rule files written. */
  ruleFiles: string[];
  /** Whether the integration-validator hook was configured. */
  validatorHookConfigured: boolean;
  /** Primitives this target could not receive. */
  skipped: SkippedCapability[];
}

/**
 * Writes one assistant's configuration into a project.
 *
 * One instance per target; stateless across calls, so a single install can run
 * several adapters over the same plan.
 */
export interface TargetAdapter {
  readonly id: TargetId;
  readonly layout: TargetLayout;
  write(ctx: TargetWriteContext): Promise<TargetWriteResult>;
}
