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
 * | Kimi Code         | `.kimi-code/mcp.json` | `mcpServers` | omitted    |
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
 * Strip a UTF-8 BOM before parsing.
 *
 * `JSON.parse` rejects U+FEFF, so a BOM made every merge refuse the file with
 * "not valid JSON" — and that is the Windows default (PowerShell `Out-File`,
 * Notepad's "UTF-8 with BOM"), on a product that ships a Windows desktop app.
 * It failed safe but told the user something untrue, and re-running never
 * helped. Not re-emitted: dev-suite writes plain UTF-8.
 */
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

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
      const parsed = JSON.parse(stripBom(opts.existing));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        // Valid JSON of the wrong shape used to fall through to `{}`, quietly
        // discarding the file — the one JSON path that lost data without
        // throwing, so the adapters' skip-and-report branch never fired.
        throw new McpConfigParseError(
          opts.file ?? key,
          new Error('root is not a JSON object')
        );
      }
      root = parsed as JsonObject;
    } catch (e) {
      if (e instanceof McpConfigParseError) throw e;
      throw new McpConfigParseError(opts.file ?? key, e);
    }
  }

  const existingUnderKey = root[key];
  if (
    existingUnderKey !== undefined &&
    (typeof existingUnderKey !== 'object' || existingUnderKey === null || Array.isArray(existingUnderKey))
  ) {
    // Same reasoning: `{"servers": [...]}` silently lost the array.
    throw new McpConfigParseError(
      opts.file ?? key,
      new Error(`"${key}" is present but is not an object`)
    );
  }
  const existingServers = existingUnderKey ? { ...(existingUnderKey as JsonObject) } : {};

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

/**
 * Kimi Code — `.kimi-code/mcp.json`.
 *
 * Same `mcpServers` key as Claude Code, and **no `type` discriminator**: the
 * presence of `command` is what makes an entry stdio (`url` would make it
 * HTTP/SSE). Adding `type: "stdio"` here would be inventing a field the docs
 * don't define, so it is deliberately omitted — see reference doc section 3.8.
 *
 * Kimi's own file, not Claude's: it reads only `.kimi-code/mcp.json` (project)
 * and `~/.kimi-code/mcp.json` (user), with the project entry winning. Empty
 * `env` is dropped rather than written as `{}`, matching the other writers.
 */
export function writeKimiMcpConfig(
  servers: Record<string, McpServerEntry>,
  opts: McpMergeOptions = {}
): string {
  const converted: Record<string, unknown> = {};
  for (const [name, entry] of Object.entries(servers)) {
    converted[name] = {
      command: entry.command,
      args: entry.args,
      ...(Object.keys(entry.env).length > 0 ? { env: entry.env } : {}),
    };
  }
  return mergeUnderKey('mcpServers', converted, opts);
}
