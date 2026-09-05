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
 * **Portability.** These files are committed, so an absolute path is not merely
 * inelegant — it is wrong on every machine but the one that generated it. Each
 * writer therefore renders the bundle path with its own confirmed project-root
 * token, and a secret env value as a reference to the ambient variable rather
 * than a literal:
 *
 * | Surface           | Root token                | Secret reference |
 * |-------------------|---------------------------|------------------|
 * | Claude Code       | `${CLAUDE_PROJECT_DIR:-.}`| `${VAR}`         |
 * | Cursor            | `${workspaceFolder}`      | `${env:VAR}`     |
 * | Copilot (VS Code) | `${workspaceFolder}`      | — (literal)      |
 * | Copilot (CLI)     | — (project-relative)      | — (literal)      |
 * | Kimi Code         | — (project-relative)      | — (literal)      |
 *
 * Every token above is CONFIRMED in docs/ASSISTANT-FORMAT-REFERENCE.md. Where a
 * surface has none, the path is left project-relative: still not guaranteed,
 * but a clone can resolve it where an absolute foreign path never can. Where a
 * surface has no confirmed env indirection — `${env:VAR}` in `.vscode/mcp.json`
 * is Part 5 item 1, and deliberately not used — the literal stays, and
 * `installation/gitignore.ts` keeps ignoring that one file, because it scans the
 * bytes actually on disk. So a project loses committability only on the
 * surfaces that genuinely cannot express the indirection, and only when a
 * secret is in play.
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

/**
 * Rewrite the bundle argument into a form another machine can resolve.
 *
 * `entry.args` holds the absolute path, which is what a locally-generated
 * config wants; `entry.entryRelPath` is the project-relative twin. Only the
 * argument that *is* that entry point is touched — a server with extra flags
 * keeps them, and an entry dev-suite did not install (no `entryRelPath`) is
 * passed through untouched.
 */
export function portableArgs(entry: McpServerEntry, projectRootToken?: string): string[] {
  const rel = entry.entryRelPath;
  if (!rel) return entry.args;

  const rendered = projectRootToken ? `${projectRootToken}/${rel}` : rel;
  return entry.args.map(arg => {
    // The manifest and this comparison are POSIX; the resolved path is not, on
    // Windows. Normalise before matching or the entry is never recognised and
    // every Windows install keeps emitting an absolute path.
    const normalised = arg.split('\\').join('/');
    return normalised === rel || normalised.endsWith(`/${rel}`) ? rendered : arg;
  });
}

/**
 * Replace the values of `secret: true` env vars with a reference the assistant
 * expands from the ambient environment at launch.
 *
 * Non-secret values are left verbatim on purpose: `KB_REPO_BRANCH` or a cache
 * TTL is configuration a team wants to share, and turning it into a reference
 * would force every developer to set it by hand to get the documented default.
 * Without a `renderRef` the values are returned unchanged.
 */
export function portableEnv(
  entry: McpServerEntry,
  renderRef?: (name: string) => string
): Record<string, string> {
  const secrets = entry.secretEnvNames;
  if (!renderRef || !secrets || secrets.length === 0) return entry.env;

  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(entry.env)) {
    out[name] = secrets.includes(name) ? renderRef(name) : value;
  }
  return out;
}

/** Claude Code — `.mcp.json`. Entry shape is passed through unchanged. */
export function writeClaudeCodeMcpConfig(
  servers: Record<string, McpServerEntry>,
  opts: McpMergeOptions = {}
): string {
  const converted: Record<string, unknown> = {};
  for (const [name, entry] of Object.entries(servers)) {
    // `${CLAUDE_PROJECT_DIR}` is set in the *server's* environment, not in
    // Claude Code's own, so a project-scoped `.mcp.json` needs the `:-.`
    // default for the expansion to resolve at all. It falls back to the
    // directory `claude` was launched from, which is the project root in the
    // normal case.
    const env = portableEnv(entry, varName => '${' + varName + '}');
    // `env` is emitted even when empty: that is what this writer has always
    // produced, and an install that only gained a portable path should not also
    // rewrite every entry's shape.
    converted[name] = {
      command: entry.command,
      args: portableArgs(entry, '${CLAUDE_PROJECT_DIR:-.}'),
      env,
    };
  }
  return mergeUnderKey('mcpServers', converted, opts);
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
    // `${workspaceFolder}` is confirmed here; `${env:VAR}` is not (Part 5 item
    // 1), so a secret stays a literal and this one file keeps being gitignored.
    converted[name] = {
      type: 'stdio',
      command: entry.command,
      args: portableArgs(entry, '${workspaceFolder}'),
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
      // No interpolation token is documented for this surface, so the path is
      // left project-relative rather than absolute: unverified, but resolvable
      // from a clone, which an absolute foreign path never is.
      args: portableArgs(entry),
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
    // Cursor documents both tokens, so this surface is fully committable: the
    // path resolves per-checkout and the credential never leaves the machine.
    const env = portableEnv(entry, varName => '${env:' + varName + '}');
    converted[name] = {
      type: 'stdio',
      command: entry.command,
      args: portableArgs(entry, '${workspaceFolder}'),
      ...(Object.keys(env).length > 0 ? { env } : {}),
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
      // As for the Copilot CLI surface: no documented token, so relative.
      args: portableArgs(entry),
      ...(Object.keys(entry.env).length > 0 ? { env: entry.env } : {}),
    };
  }
  return mergeUnderKey('mcpServers', converted, opts);
}
