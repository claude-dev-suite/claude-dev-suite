// SPDX-License-Identifier: MIT
/**
 * Codex CLI `config.toml` MCP writer.
 *
 * Codex keeps MCP config as TOML tables `[mcp_servers.<name>]` in
 * `.codex/config.toml` (reference doc section 3.4). There is no TOML dependency
 * in this repo, and a parse→serialize round-trip would strip the user's
 * comments and formatting — a config.toml is hand-edited, so that matters.
 *
 * Instead this does a **section-level text merge**: the file is split at
 * top-level table headers (`[...]` / `[[...]]`), dev-suite's own
 * `[mcp_servers.<name>]` sections are removed, and freshly-rendered ones are
 * appended. Everything the user wrote — other tables, their own MCP servers,
 * comments — is preserved verbatim.
 *
 * Only the values dev-suite emits (server name, command, string args, string
 * env) are serialized here, so the escaping surface is small and known; the
 * writer does not attempt to be a general TOML serializer.
 */

import type { McpServerEntry } from '../target-adapter.js';

/** A TOML basic-string, escaped. Only the cases our values can contain. */
function tomlString(value: string): string {
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
  return `"${escaped}"`;
}

function tomlStringArray(values: string[]): string {
  return `[${values.map(tomlString).join(', ')}]`;
}

/** Render one server as its `[mcp_servers.<name>]` block (+ optional env table). */
function renderServer(name: string, entry: McpServerEntry): string {
  const lines = [`[mcp_servers.${tomlBareOrQuoted(name)}]`];
  lines.push(`command = ${tomlString(entry.command)}`);
  lines.push(`args = ${tomlStringArray(entry.args)}`);
  const envKeys = Object.keys(entry.env);
  let block = lines.join('\n');
  if (envKeys.length > 0) {
    const envLines = [`[mcp_servers.${tomlBareOrQuoted(name)}.env]`];
    for (const key of envKeys) {
      envLines.push(`${tomlBareOrQuoted(key)} = ${tomlString(entry.env[key] ?? '')}`);
    }
    block += '\n' + envLines.join('\n');
  }
  return block;
}

/** A TOML key: bare when it is a simple identifier, quoted otherwise. */
function tomlBareOrQuoted(key: string): string {
  return /^[A-Za-z0-9_-]+$/.test(key) ? key : tomlString(key);
}

/**
 * True when a line opens a table or array-of-tables.
 *
 * A trailing comment is part of real-world config (`[tui]  # my theme`), and
 * requiring the line to *end* with `]` used to misclassify those as ordinary
 * body lines: the annotated table was absorbed into the section above it and
 * deleted along with it, silently, because the result was still valid TOML.
 */
function isTableHeader(line: string): boolean {
  return /^\s*\[\[?[^\]]*\]\]?\s*(?:#.*)?$/.test(line);
}

/** Extract the `<name>` from a `[mcp_servers.<name>]` / `.env` header, or null. */
function managedServerName(header: string): string | null {
  const t = header.trim();
  // The comment tail stays anchored: an annotated managed header must still be
  // recognised as ours, or the merge appends a duplicate table and TOML forbids
  // a table being defined twice — Codex would then load no project config.
  const m = t.match(/^\[mcp_servers\.([^.\]]+)(?:\.env)?\]\s*(?:#.*)?$/);
  if (!m || m[1] === undefined) return null;
  // Strip surrounding quotes if the name was quoted.
  const raw = m[1];
  return raw.startsWith('"') && raw.endsWith('"') ? raw.slice(1, -1) : raw;
}

/**
 * Merge dev-suite's MCP servers into an existing `config.toml`, preserving all
 * other content. `previouslyManaged` names whose sections should be dropped when
 * no longer installed (so deselecting a server removes it).
 */
export function writeCodexTomlMcp(
  servers: Record<string, McpServerEntry>,
  opts: { existing?: string | null; previouslyManaged?: readonly string[] } = {}
): string {
  const managed = new Set([...Object.keys(servers), ...(opts.previouslyManaged ?? [])]);

  const rendered = Object.entries(servers)
    .map(([name, entry]) => renderServer(name, entry))
    .join('\n\n');

  if (!opts.existing || opts.existing.trim().length === 0) {
    return rendered.length > 0 ? rendered + '\n' : '';
  }

  // Split existing content into a preamble (before the first header) and
  // header-delimited sections.
  const lines = opts.existing.split('\n');
  const preamble: string[] = [];
  const sections: { header: string; body: string[] }[] = [];
  let current: { header: string; body: string[] } | null = null;

  for (const line of lines) {
    if (isTableHeader(line)) {
      current = { header: line, body: [] };
      sections.push(current);
    } else if (current) {
      current.body.push(line);
    } else {
      preamble.push(line);
    }
  }

  // Keep every section that isn't one of ours (a managed mcp_servers table).
  const kept = sections.filter(s => {
    const name = managedServerName(s.header);
    return name === null || !managed.has(name);
  });

  const parts: string[] = [];
  const preambleText = preamble.join('\n').replace(/\s+$/, '');
  if (preambleText.length > 0) parts.push(preambleText);
  for (const s of kept) {
    parts.push([s.header, ...s.body].join('\n').replace(/\s+$/, ''));
  }
  if (rendered.length > 0) parts.push(rendered);

  return parts.join('\n\n').replace(/\s+$/, '') + '\n';
}
