// SPDX-License-Identifier: MIT
/**
 * MCP configuration writers.
 *
 * MCP is the primitive that diverges most across assistants — different file,
 * different top-level key, different entry shape, sometimes two incompatible
 * shapes for the *same* vendor. See docs/ASSISTANT-FORMAT-REFERENCE.md section
 * 2.5, which is normative.
 *
 * | Surface           | File                  | Key          | `type`     |
 * |-------------------|-----------------------|--------------|------------|
 * | Claude Code       | `.mcp.json`           | `mcpServers` | omitted    |
 * | Copilot (VS Code) | `.vscode/mcp.json`    | `servers`    | `"stdio"`  |
 * | Copilot (CLI)     | `.github/mcp.json`    | `mcpServers` | `"local"`  |
 * | Cursor            | `.cursor/mcp.json`    | `mcpServers` | `"stdio"`  |
 *
 * **Merge, don't clobber.** Unlike `.mcp.json`, which dev-suite has always
 * owned outright, these files usually already contain the user's own servers.
 * Every writer preserves entries it does not manage.
 *
 * All server arguments are absolute paths, per the project rule that generated
 * MCP config must not depend on the working directory. That also sidesteps
 * `${env:VAR}` interpolation, whose availability in `.vscode/mcp.json` is
 * unconfirmed (reference doc, Part 5, item 1).
 */

import type { McpServerEntry } from '../target-adapter.js';

/** Raised when an existing config file cannot be parsed. */
export class McpConfigParseError extends Error {
  constructor(
    readonly file: string,
    readonly cause: unknown
  ) {
    super(`Existing MCP config at ${file} is not valid JSON`);
    this.name = 'McpConfigParseError';
  }
}

export interface McpMergeOptions {
  /**
   * Current file content, when the file already exists. Entries dev-suite does
   * not manage are carried over untouched.
   */
  existing?: string | null;
  /**
   * Server names dev-suite wrote on a previous install. Any that are no longer
   * in the install set are removed, so deselecting a server actually removes
   * it. Without this, stale entries accumulate.
   */
  previouslyManaged?: readonly string[];
  /** Path used in error messages only. */
  file?: string;
}

type JsonObject = Record<string, unknown>;

/**
 * Merge dev-suite's servers into whatever the file already contains.
 *
 * @throws {McpConfigParseError} when existing content is present but unparseable —
 * the caller must decide whether to back it up and overwrite, or skip and report.
 * Silently discarding a user's config is never the right default.
 */
function mergeUnderKey(
  key: string,
  ours: Record<string, unknown>,
  opts: McpMergeOptions
): string {
  let root: JsonObject = {};

  if (opts.existing && opts.existing.trim().length > 0) {
    try {
      const parsed = JSON.parse(opts.existing);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        root = parsed as JsonObject;
      }
    } catch (e) {
      throw new McpConfigParseError(opts.file ?? key, e);
    }
  }

  const existingServers =
    root[key] && typeof root[key] === 'object' && !Array.isArray(root[key])
      ? { ...(root[key] as JsonObject) }
      : {};

  // Drop entries we used to manage but no longer install; leave foreign ones.
  for (const stale of opts.previouslyManaged ?? []) {
    if (!(stale in ours)) delete existingServers[stale];
  }

  root[key] = { ...existingServers, ...ours };

  return JSON.stringify(root, null, 2);
}

/** Claude Code — `.mcp.json`. Entry shape is passed through unchanged. */
export function writeClaudeCodeMcpConfig(
  servers: Record<string, McpServerEntry>,
  opts: McpMergeOptions = {}
): string {
  return mergeUnderKey('mcpServers', servers, opts);
}

/**
 * Copilot on the VS Code surface — `.vscode/mcp.json`.
 *
 * Top-level key is `servers`, not `mcpServers`, and `type` is required with
 * `"stdio"` as its only valid value for a local server. Reusing Claude's shape
 * here produces a file that parses and registers nothing.
 */
export function writeVsCodeMcpConfig(
  servers: Record<string, McpServerEntry>,
  opts: McpMergeOptions = {}
): string {
  const converted: Record<string, unknown> = {};
  for (const [name, entry] of Object.entries(servers)) {
    converted[name] = {
      type: 'stdio',
      command: entry.command,
      args: entry.args,
      ...(Object.keys(entry.env).length > 0 ? { env: entry.env } : {}),
    };
  }
  return mergeUnderKey('servers', converted, opts);
}

/**
 * Copilot on the CLI surface — `.github/mcp.json`.
 *
 * The CLI uses `type: "local"` and a `tools` allowlist, and disagrees with the
 * VS Code surface on both the key and the type value, so one file cannot serve
 * both.
 *
 * We write `.github/mcp.json` rather than `.mcp.json` even though the CLI reads
 * both: `.mcp.json` is Claude Code's file, and writing a Copilot-shaped entry
 * into it would either break Claude Code or depend on both tools tolerating the
 * other's fields. Separate files keep the targets independent, which is what
 * makes multiple assistants able to share one project.
 *
 * `tools: ['*']` mirrors dev-suite's Claude Code behaviour, where an installed
 * server's tools are all available.
 */
export function writeCopilotCliMcpConfig(
  servers: Record<string, McpServerEntry>,
  opts: McpMergeOptions = {}
): string {
  const converted: Record<string, unknown> = {};
  for (const [name, entry] of Object.entries(servers)) {
    converted[name] = {
      type: 'local',
      command: entry.command,
      args: entry.args,
      ...(Object.keys(entry.env).length > 0 ? { env: entry.env } : {}),
      tools: ['*'],
    };
  }
  return mergeUnderKey('mcpServers', converted, opts);
}

/**
 * Cursor — `.cursor/mcp.json`.
 *
 * Nearly Claude-compatible: same `mcpServers` key, but `type: "stdio"` is
 * documented as part of the entry shape.
 */
export function writeCursorMcpConfig(
  servers: Record<string, McpServerEntry>,
  opts: McpMergeOptions = {}
): string {
  const converted: Record<string, unknown> = {};
  for (const [name, entry] of Object.entries(servers)) {
    converted[name] = {
      type: 'stdio',
      command: entry.command,
      args: entry.args,
      ...(Object.keys(entry.env).length > 0 ? { env: entry.env } : {}),
    };
  }
  return mergeUnderKey('mcpServers', converted, opts);
}
