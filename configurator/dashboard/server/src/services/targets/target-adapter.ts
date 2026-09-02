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
   * Server names dev-suite wrote into this project on the PREVIOUS install.
   *
   * Adapters that merge into a shared config pass it as `previouslyManaged` so a
   * deselected server is dropped. It must not be the full catalog: a user whose
   * own config already had a server dev-suite also ships (`documentation`, say)
   * had it deleted on a *first* install, which is the opposite of the merge
   * contract. Empty on a first install — nothing was ours yet.
   */
  mcpCatalog: string[];
  /** The assistants this install is targeting. */
  targets: TargetId[];
  /**
   * Relative paths dev-suite wrote on the *previous* install, read from the
   * on-disk manifest before this one starts.
   *
   * Writers use it to tell "replace my own file" from "clobber the user's".
   * Empty on a first install, which is exactly right: an existing file is then
   * the user's by definition.
   */
  previouslyManaged: ReadonlySet<string>;
  /**
   * `relPath` → content hash recorded by the previous install.
   *
   * Ownership alone is not enough to decide a write is safe: a file dev-suite
   * installed and something else then edited is still "ours" by path, and used
   * to be overwritten silently. With the hash, a writer can tell an untouched
   * file (replace it) from a drifted one (back it up and report it).
   */
  previousFileHashes?: ReadonlyMap<string, string>;
  /**
   * `relPath` → hash of the marked span only, for files carrying the dev-suite
   * markers. A whole-file hash is useless for those: it moves whenever the user
   * edits their own prose around our section.
   */
  previousSectionHashes?: ReadonlyMap<string, string>;
  /** `relPath` → hash a human ratified via `promote`; that content is replaceable. */
  acknowledgedFileHashes?: ReadonlyMap<string, string>;
  /**
   * Agent files the previous install wrote, keyed by target id.
   *
   * Native subagent writers use it to delete the file of an agent that is no
   * longer selected — without it a deselected `@qa-expert` stayed live in
   * Gemini and Kimi forever, since the manifest is rebuilt from scratch and no
   * removal path could see the leftover.
   */
  previousAgentFiles: ReadonlyMap<string, readonly string[]>;
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
  /**
   * Drifted rule files: still installed and still ours, but changed since we
   * wrote them, so left in place. They belong in `ruleFiles` (or the stale
   * prune deletes them) but must be recorded at their baseline hash.
   */
  driftedRuleFiles?: string[];
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
