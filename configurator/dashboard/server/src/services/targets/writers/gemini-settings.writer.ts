// SPDX-License-Identifier: MIT
/**
 * Gemini CLI settings writer.
 *
 * Gemini keeps both MCP config and general settings in one JSON file,
 * `.gemini/settings.json`, and — unlike the other Tier 1/2 assistants — does
 * NOT read `AGENTS.md` by default. Two keys therefore have to be set together
 * (reference doc section 3.5):
 *  - `mcpServers`: dev-suite's servers (merged with the user's).
 *  - `context.fileName`: must include `AGENTS.md` so Gemini reads the shared
 *    instructions. Setting it *replaces* the default, so `GEMINI.md` is included
 *    explicitly to preserve Gemini's own memory file.
 *
 * As with the other MCP writers, existing content is merged, never clobbered,
 * and unparseable content throws rather than being silently discarded.
 */

import type { McpServerEntry } from '../target-adapter.js';
import { portableArgs, portableEnv } from './mcp-config.writer.js';
import { McpConfigParseError, type McpMergeOptions } from './mcp-config.writer.js';

/** Instruction files Gemini must be told to read (order preserved). */
const REQUIRED_CONTEXT_FILES = ['AGENTS.md', 'GEMINI.md'] as const;

type JsonObject = Record<string, unknown>;

/**
 * Render `.gemini/settings.json` with dev-suite's MCP servers and an
 * `AGENTS.md`-aware `context.fileName`, merged into any existing settings.
 *
 * @throws {McpConfigParseError} when existing content is present but unparseable.
 */
export function writeGeminiSettings(
  servers: Record<string, McpServerEntry>,
  opts: McpMergeOptions = {}
): string {
  let root: JsonObject = {};

  if (opts.existing && opts.existing.trim().length > 0) {
    try {
      // Strip a UTF-8 BOM (the Windows default) before parsing, and refuse a
      // valid-but-wrong-shaped root instead of silently discarding the file.
      const text = opts.existing.charCodeAt(0) === 0xfeff ? opts.existing.slice(1) : opts.existing;
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new McpConfigParseError(
          opts.file ?? '.gemini/settings.json',
          new Error('root is not a JSON object')
        );
      }
      root = parsed as JsonObject;
    } catch (e) {
      if (e instanceof McpConfigParseError) throw e;
      throw new McpConfigParseError(opts.file ?? '.gemini/settings.json', e);
    }
  }

  root.mcpServers = mergeServers(root.mcpServers, servers, opts.previouslyManaged);
  root.context = mergeContext(root.context);

  return JSON.stringify(root, null, 2);
}

/** Merge dev-suite's servers over the existing map, dropping our deselected ones. */
function mergeServers(
  existing: unknown,
  ours: Record<string, McpServerEntry>,
  previouslyManaged: readonly string[] = []
): JsonObject {
  const merged: JsonObject =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as JsonObject) }
      : {};

  for (const stale of previouslyManaged) {
    if (!(stale in ours)) delete merged[stale];
  }

  // Gemini's stdio entry is command/args/env — no `type` field. `$VAR`
  // expansion is confirmed inside `env` but not in `args`, so the credential
  // becomes a reference while the path is only made project-relative.
  for (const [name, entry] of Object.entries(ours)) {
    const env = portableEnv(entry, varName => '$' + varName);
    merged[name] = {
      command: entry.command,
      args: portableArgs(entry),
      ...(Object.keys(env).length > 0 ? { env } : {}),
    };
  }
  return merged;
}

/** Ensure `context.fileName` is an array containing the required files, order-stable. */
function mergeContext(existing: unknown): JsonObject {
  const context: JsonObject =
    existing && typeof existing === 'object' && !Array.isArray(existing)
      ? { ...(existing as JsonObject) }
      : {};

  const current = context.fileName;
  const names: string[] = Array.isArray(current)
    ? current.filter((n): n is string => typeof n === 'string')
    : typeof current === 'string'
      ? [current]
      : [];

  for (const required of REQUIRED_CONTEXT_FILES) {
    if (!names.includes(required)) names.push(required);
  }
  context.fileName = names;
  return context;
}
