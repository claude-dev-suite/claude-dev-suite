/**
 * Golden-file tests for the MCP configuration writers.
 *
 * MCP is where the vendors diverge most, and where a wrong guess is invisible:
 * a config with the wrong top-level key or `type` value parses fine and
 * registers no servers at all. So these pin exact output.
 *
 * Format claims are sourced from docs/ASSISTANT-FORMAT-REFERENCE.md section 2.5.
 */

import { describe, it, expect } from 'vitest';
import {
  writeClaudeCodeMcpConfig,
  writeVsCodeMcpConfig,
  writeCopilotCliMcpConfig,
  writeCursorMcpConfig,
  writeKimiMcpConfig,
  McpConfigParseError,
} from '../../../src/services/targets/writers/mcp-config.writer.js';
import type { McpServerEntry } from '../../../src/services/targets/target-adapter.js';

const SERVERS: Record<string, McpServerEntry> = {
  documentation: {
    command: 'node',
    args: ['/abs/project/.mcp-servers/documentation/dist/index.js'],
    env: { KB_BRANCH: 'main' },
  },
};

const NO_ENV: Record<string, McpServerEntry> = {
  'skill-loader': {
    command: 'node',
    args: ['/abs/project/.mcp-servers/skill-loader/dist/index.js'],
    env: {},
  },
};

describe('writeClaudeCodeMcpConfig', () => {
  it('keeps the historical .mcp.json shape exactly', () => {
    // This is what dev-suite has always written; changing it would churn every
    // installed project on the next sync.
    expect(writeClaudeCodeMcpConfig(SERVERS)).toBe(
      JSON.stringify(
        {
          mcpServers: {
            documentation: {
              command: 'node',
              args: ['/abs/project/.mcp-servers/documentation/dist/index.js'],
              env: { KB_BRANCH: 'main' },
            },
          },
        },
        null,
        2
      )
    );
  });
});

describe('writeVsCodeMcpConfig', () => {
  it('uses the servers key and type stdio', () => {
    const parsed = JSON.parse(writeVsCodeMcpConfig(SERVERS));

    // The single most likely mistake: reusing Claude's `mcpServers` key here.
    expect(Object.keys(parsed)).toEqual(['servers']);
    expect(parsed.mcpServers).toBeUndefined();
    expect(parsed.servers.documentation).toEqual({
      type: 'stdio',
      command: 'node',
      args: ['/abs/project/.mcp-servers/documentation/dist/index.js'],
      env: { KB_BRANCH: 'main' },
    });
  });

  it('omits env entirely when there is nothing to set', () => {
    const parsed = JSON.parse(writeVsCodeMcpConfig(NO_ENV));
    expect(parsed.servers['skill-loader']).not.toHaveProperty('env');
  });
});

describe('writeCopilotCliMcpConfig', () => {
  it('uses type local and a tools allowlist, not the VS Code shape', () => {
    const parsed = JSON.parse(writeCopilotCliMcpConfig(SERVERS));

    expect(Object.keys(parsed)).toEqual(['mcpServers']);
    expect(parsed.mcpServers.documentation).toEqual({
      type: 'local',
      command: 'node',
      args: ['/abs/project/.mcp-servers/documentation/dist/index.js'],
      env: { KB_BRANCH: 'main' },
      tools: ['*'],
    });
  });

  it('disagrees with the VS Code surface on both key and type', () => {
    // Documented divergence within one vendor — one file cannot serve both.
    const cli = JSON.parse(writeCopilotCliMcpConfig(SERVERS));
    const vscode = JSON.parse(writeVsCodeMcpConfig(SERVERS));

    expect(Object.keys(cli)).not.toEqual(Object.keys(vscode));
    expect(cli.mcpServers.documentation.type).toBe('local');
    expect(vscode.servers.documentation.type).toBe('stdio');
  });
});

describe('writeCursorMcpConfig', () => {
  it('uses mcpServers with an explicit stdio type', () => {
    const parsed = JSON.parse(writeCursorMcpConfig(SERVERS));

    expect(Object.keys(parsed)).toEqual(['mcpServers']);
    expect(parsed.mcpServers.documentation.type).toBe('stdio');
  });
});

describe('writeKimiMcpConfig', () => {
  it('uses mcpServers with no type discriminator', () => {
    const parsed = JSON.parse(writeKimiMcpConfig(SERVERS));

    expect(Object.keys(parsed)).toEqual(['mcpServers']);
    expect(parsed.mcpServers.documentation).toEqual({
      command: 'node',
      args: ['/abs/project/.mcp-servers/documentation/dist/index.js'],
      env: { KB_BRANCH: 'main' },
    });
    // `type` is not part of Kimi's documented entry shape — inventing it would
    // be guessing at a field the vendor never defined.
    expect(parsed.mcpServers.documentation).not.toHaveProperty('type');
  });

  it('omits env entirely when there is nothing to set', () => {
    const parsed = JSON.parse(writeKimiMcpConfig(NO_ENV));
    expect(parsed.mcpServers['skill-loader']).not.toHaveProperty('env');
  });

  it('preserves the user\'s own Kimi servers when merging', () => {
    const existing = JSON.stringify({
      mcpServers: { 'user-http-server': { url: 'https://example.test/mcp' } },
    });
    const parsed = JSON.parse(writeKimiMcpConfig(SERVERS, { existing }));

    expect(parsed.mcpServers['user-http-server']).toEqual({ url: 'https://example.test/mcp' });
    expect(parsed.mcpServers.documentation).toBeDefined();
  });
});

describe('merging with an existing file', () => {
  it('preserves servers dev-suite does not manage', () => {
    const existing = JSON.stringify({
      mcpServers: {
        'user-own-server': { command: 'python', args: ['server.py'] },
      },
    });

    const parsed = JSON.parse(writeCursorMcpConfig(SERVERS, { existing }));

    // Clobbering a shared config file is the difference between a helpful tool
    // and one nobody trusts with their project.
    expect(parsed.mcpServers['user-own-server']).toEqual({
      command: 'python',
      args: ['server.py'],
    });
    expect(parsed.mcpServers.documentation).toBeDefined();
  });

  it('preserves unrelated top-level keys', () => {
    const existing = JSON.stringify({ inputs: [{ id: 'token', type: 'promptString' }], servers: {} });
    const parsed = JSON.parse(writeVsCodeMcpConfig(SERVERS, { existing }));
    expect(parsed.inputs).toEqual([{ id: 'token', type: 'promptString' }]);
  });

  it('removes entries it used to manage but no longer installs', () => {
    const existing = JSON.stringify({
      mcpServers: {
        documentation: { command: 'node', args: ['old'] },
        'api-tester': { command: 'node', args: ['stale'] },
        'user-own-server': { command: 'python', args: ['server.py'] },
      },
    });

    const parsed = JSON.parse(
      writeCursorMcpConfig(SERVERS, {
        existing,
        previouslyManaged: ['documentation', 'api-tester'],
      })
    );

    // Deselecting a server has to actually remove it, or stale entries pile up.
    expect(parsed.mcpServers['api-tester']).toBeUndefined();
    // ...but only ours. A same-named foreign entry was never in previouslyManaged.
    expect(parsed.mcpServers['user-own-server']).toBeDefined();
    expect(parsed.mcpServers.documentation.args).toEqual([
      '/abs/project/.mcp-servers/documentation/dist/index.js',
    ]);
  });

  it('overwrites our own stale entry rather than merging into it', () => {
    const existing = JSON.stringify({
      mcpServers: { documentation: { command: 'node', args: ['old'], env: { GONE: '1' } } },
    });
    const parsed = JSON.parse(writeCursorMcpConfig(SERVERS, { existing }));
    expect(parsed.mcpServers.documentation.env).toEqual({ KB_BRANCH: 'main' });
  });

  it('treats an empty or whitespace file as absent', () => {
    expect(() => writeCursorMcpConfig(SERVERS, { existing: '   ' })).not.toThrow();
    expect(JSON.parse(writeCursorMcpConfig(SERVERS, { existing: '' })).mcpServers).toBeDefined();
  });

  it('refuses to silently discard a config it cannot parse', () => {
    // Overwriting a malformed file would destroy whatever the user had. The
    // caller decides: back up and replace, or skip and report.
    expect(() => writeCursorMcpConfig(SERVERS, { existing: '{ not json', file: '.cursor/mcp.json' }))
      .toThrow(McpConfigParseError);
  });
});

describe('all writers', () => {
  const writers = [
    ['claude-code', writeClaudeCodeMcpConfig],
    ['vscode', writeVsCodeMcpConfig],
    ['copilot-cli', writeCopilotCliMcpConfig],
    ['cursor', writeCursorMcpConfig],
    ['kimi-code', writeKimiMcpConfig],
  ] as const;

  it.each(writers)('%s keeps server args absolute', (_id, write) => {
    const rendered = write(SERVERS);
    expect(rendered).toContain('/abs/project/.mcp-servers/documentation/dist/index.js');
  });

  it.each(writers)('%s emits valid JSON with 2-space indent', (_id, write) => {
    const rendered = write(SERVERS);
    expect(() => JSON.parse(rendered)).not.toThrow();
    expect(rendered).toContain('\n  ');
  });

  it.each(writers)('%s produces an empty container when nothing is installed', (_id, write) => {
    const parsed = JSON.parse(write({}));
    const key = Object.keys(parsed)[0];
    expect(parsed[key]).toEqual({});
  });
});

/**
 * Portability: what makes these files committable.
 *
 * An install writes an absolute path and a literal credential — correct on the
 * machine that ran it, wrong or unsafe on every other. Each writer therefore
 * renders the bundle path with its own project-root token and a `secret: true`
 * value as a reference. Only tokens marked CONFIRMED in
 * docs/ASSISTANT-FORMAT-REFERENCE.md are used; a surface without one gets a
 * project-relative path, which a clone can at least resolve.
 */
describe('portable output', () => {
  // A Windows absolute path on purpose: the comparison against `entryRelPath`
  // is POSIX, so without normalisation no Windows install would ever match and
  // every one of them would keep emitting the absolute path.
  const PORTABLE: Record<string, McpServerEntry> = {
    'database-query': {
      command: 'node',
      args: ['C:\\work\\proj\\.mcp-servers\\database-query\\dist\\index.js'],
      env: { DATABASE_URL: 'postgres://u:pw@h:5432/db', DB_POOL_SIZE: '5' },
      entryRelPath: '.mcp-servers/database-query/dist/index.js',
      secretEnvNames: ['DATABASE_URL'],
    },
  };

  const entryOf = (json: string, key = 'mcpServers') =>
    JSON.parse(json)[key]['database-query'];

  it('Claude Code uses ${CLAUDE_PROJECT_DIR} with a default, and references the secret', () => {
    const entry = entryOf(writeClaudeCodeMcpConfig(PORTABLE));
    // The `:-.` default matters: CLAUDE_PROJECT_DIR is set in the server's
    // environment, not Claude Code's, so a project-scoped file needs a fallback.
    expect(entry.args[0]).toBe('${CLAUDE_PROJECT_DIR:-.}/.mcp-servers/database-query/dist/index.js');
    expect(entry.env.DATABASE_URL).toBe('${DATABASE_URL}');
    // Non-secret config is shared verbatim — that is the point of sharing it.
    expect(entry.env.DB_POOL_SIZE).toBe('5');
  });

  it('Cursor uses ${workspaceFolder} and ${env:VAR}', () => {
    const entry = entryOf(writeCursorMcpConfig(PORTABLE));
    expect(entry.args[0]).toBe('${workspaceFolder}/.mcp-servers/database-query/dist/index.js');
    expect(entry.env.DATABASE_URL).toBe('${env:DATABASE_URL}');
    expect(entry.env.DB_POOL_SIZE).toBe('5');
  });

  it('VS Code uses ${workspaceFolder} but keeps the literal, since ${env:VAR} is unconfirmed', () => {
    const entry = entryOf(writeVsCodeMcpConfig(PORTABLE), 'servers');
    expect(entry.args[0]).toBe('${workspaceFolder}/.mcp-servers/database-query/dist/index.js');
    // Part 5 item 1: not implemented against an unconfirmed mechanism. The file
    // keeps the credential, and gitignore.ts keeps ignoring this one file.
    expect(entry.env.DATABASE_URL).toBe('postgres://u:pw@h:5432/db');
  });

  it('surfaces with no documented token still get a resolvable relative path', () => {
    for (const json of [writeCopilotCliMcpConfig(PORTABLE), writeKimiMcpConfig(PORTABLE)]) {
      const entry = entryOf(json);
      expect(entry.args[0]).toBe('.mcp-servers/database-query/dist/index.js');
      expect(path_isAbsolutish(entry.args[0])).toBe(false);
    }
  });

  it('leaves an entry dev-suite did not install completely alone', () => {
    // No `entryRelPath`: a server the user added by hand, pointing anywhere.
    const foreign: Record<string, McpServerEntry> = {
      'database-query': { command: 'npx', args: ['-y', 'some-server'], env: { DATABASE_URL: 'x' } },
    };
    const entry = entryOf(writeClaudeCodeMcpConfig(foreign));
    expect(entry.args).toEqual(['-y', 'some-server']);
    expect(entry.env.DATABASE_URL).toBe('x');
  });
});

/** Absolute in either convention — no `path` import needed for this check. */
function path_isAbsolutish(p: string): boolean {
  return p.startsWith('/') || /^[A-Za-z]:/.test(p);
}
