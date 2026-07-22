/**
 * Golden/behavioural tests for the Codex config.toml MCP writer.
 *
 * This writer does a text-level section merge (no TOML dependency), so the
 * risky behaviours are: producing valid TOML, dropping only dev-suite's own
 * server tables, and preserving everything else — the user's tables, their own
 * MCP servers, and their comments.
 */

import { describe, it, expect } from 'vitest';
import { writeCodexTomlMcp } from '../../../src/services/targets/writers/codex-toml.writer.js';
import type { McpServerEntry } from '../../../src/services/targets/target-adapter.js';

const SERVERS: Record<string, McpServerEntry> = {
  documentation: {
    command: 'node',
    args: ['/abs/project/.mcp-servers/documentation/dist/index.js'],
    env: { KB_BRANCH: 'main' },
  },
};

describe('writeCodexTomlMcp — fresh file', () => {
  it('renders an mcp_servers table with command, args and an env sub-table', () => {
    const out = writeCodexTomlMcp(SERVERS);
    expect(out).toBe(
      `[mcp_servers.documentation]
command = "node"
args = ["/abs/project/.mcp-servers/documentation/dist/index.js"]
[mcp_servers.documentation.env]
KB_BRANCH = "main"
`
    );
  });

  it('omits the env sub-table when there is no env', () => {
    const out = writeCodexTomlMcp({ 'skill-loader': { command: 'node', args: ['/abs/x.js'], env: {} } });
    expect(out).toContain('[mcp_servers.skill-loader]');
    expect(out).not.toContain('.env]');
  });

  it('produces empty output when nothing is installed', () => {
    expect(writeCodexTomlMcp({})).toBe('');
  });
});

describe('writeCodexTomlMcp — merging an existing config.toml', () => {
  it("preserves the user's other tables, servers and comments", () => {
    const existing = `# My Codex config
model = "gpt-5-codex"

[mcp_servers.user-own]
command = "python"
args = ["server.py"]

[some_other_table]
key = "value"
`;

    const out = writeCodexTomlMcp(SERVERS, { existing });

    // User content survives, verbatim.
    expect(out).toContain('# My Codex config');
    expect(out).toContain('model = "gpt-5-codex"');
    expect(out).toContain('[mcp_servers.user-own]');
    expect(out).toContain('command = "python"');
    expect(out).toContain('[some_other_table]');
    expect(out).toContain('key = "value"');
    // ...and ours is appended.
    expect(out).toContain('[mcp_servers.documentation]');
  });

  it('replaces a stale copy of a server it manages, rather than duplicating it', () => {
    const existing = `[mcp_servers.documentation]
command = "node"
args = ["OLD"]
[mcp_servers.documentation.env]
KB_BRANCH = "old"
`;
    const out = writeCodexTomlMcp(SERVERS, { existing });

    // Exactly one documentation table, with the new args.
    expect(out.match(/\[mcp_servers\.documentation\]/g)).toHaveLength(1);
    expect(out).toContain('args = ["/abs/project/.mcp-servers/documentation/dist/index.js"]');
    expect(out).not.toContain('"OLD"');
    expect(out).not.toContain('KB_BRANCH = "old"');
  });

  it('drops a previously-managed server that is no longer installed, keeping the user\'s', () => {
    const existing = `[mcp_servers.documentation]
command = "node"
args = ["x"]

[mcp_servers.api-tester]
command = "node"
args = ["stale"]

[mcp_servers.user-own]
command = "python"
args = ["s.py"]
`;
    const out = writeCodexTomlMcp(SERVERS, {
      existing,
      previouslyManaged: ['documentation', 'api-tester'],
    });

    expect(out).not.toContain('api-tester');
    expect(out).toContain('[mcp_servers.user-own]'); // untouched
    expect(out.match(/\[mcp_servers\.documentation\]/g)).toHaveLength(1);
  });

  it('does not mistake an array-of-tables for one of its own sections', () => {
    const existing = `[[projects]]
name = "a"

[[projects]]
name = "b"
`;
    const out = writeCodexTomlMcp(SERVERS, { existing });
    expect(out.match(/\[\[projects\]\]/g)).toHaveLength(2);
  });
});

describe('writeCodexTomlMcp — escaping', () => {
  it('escapes backslashes and quotes in values (e.g. Windows paths)', () => {
    const out = writeCodexTomlMcp({
      srv: { command: 'C:\\Program Files\\node.exe', args: ['a"b'], env: {} },
    });
    expect(out).toContain('command = "C:\\\\Program Files\\\\node.exe"');
    expect(out).toContain('args = ["a\\"b"]');
  });
});
