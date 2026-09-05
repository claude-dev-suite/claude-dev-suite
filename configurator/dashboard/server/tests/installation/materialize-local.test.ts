/**
 * A worktree must be able to rebuild what git could not carry.
 *
 * `await materializeLocal()` takes the committed records (`.dev-suite.json`,
 * `.dev-suite-manifest.json`) plus the out-of-repo secret store and reproduces
 * each assistant's MCP config. The contract these tests pin:
 *
 *  - the output is byte-identical to what the install writers produce, per
 *    target, including the shapes that genuinely diverge (VS Code's `servers` +
 *    `type: "stdio"`, Copilot CLI's `type: "local"`, Codex TOML);
 *  - with no store, the config is written *without* `env` and the gap is
 *    reported as a skipped capability rather than silently accepted;
 *  - server arguments stay absolute, pointing at the main checkout's bundles —
 *    a worktree copies no bundles.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { materializeLocal } from '../../src/services/installation/materialize-local.js';
import { SecretEnvStore } from '../../src/services/installation/secret-store.js';
import {
  writeClaudeCodeMcpConfig,
  writeCursorMcpConfig,
  writeVsCodeMcpConfig,
  writeCopilotCliMcpConfig,
} from '../../src/services/targets/writers/mcp-config.writer.js';
import { writeCodexTomlMcp } from '../../src/services/targets/writers/codex-toml.writer.js';
import { writeGeminiSettings } from '../../src/services/targets/writers/gemini-settings.writer.js';
import { createTempDir, cleanupTempDir } from '../test-utils.js';

const DB_URL = 'postgres://app:s3cr3t-pw@db.internal:5432/prod';

/** A project whose bundles live in `main`, mimicking a worktree of it. */
function scaffold(
  root: string,
  targets: string[],
  servers: Record<string, { envVars: { name: string }[] }>
): { project: string; main: string } {
  const main = path.join(root, 'main');
  const project = path.join(root, 'wt');
  fs.mkdirSync(project, { recursive: true });

  for (const [name, metadata] of Object.entries(servers)) {
    const dist = path.join(main, '.mcp-servers', name, 'dist');
    fs.mkdirSync(dist, { recursive: true });
    fs.writeFileSync(path.join(dist, 'index.js'), '// bundle\n');
    fs.writeFileSync(
      path.join(main, '.mcp-servers', name, 'metadata.json'),
      JSON.stringify({ name, envVars: metadata.envVars })
    );
  }

  fs.writeFileSync(
    path.join(project, '.dev-suite.json'),
    JSON.stringify({ targets, mcpServers: { enabled: Object.keys(servers) } }, null, 2)
  );
  fs.writeFileSync(
    path.join(project, '.dev-suite-manifest.json'),
    JSON.stringify({ targets, mcpServers: Object.keys(servers), files: [] }, null, 2)
  );

  return { project, main };
}

const entryFor = (main: string, name: string) =>
  path.join(main, '.mcp-servers', name, 'dist', 'index.js');

describe('materializeLocal', () => {
  let root: string;
  let home: string;
  let store: SecretEnvStore;

  beforeEach(() => {
    root = createTempDir('materialize-');
    home = createTempDir('materialize-home-');
    store = new SecretEnvStore(home);
  });
  afterEach(() => { cleanupTempDir(root); cleanupTempDir(home); });

  it('rebuilds every target byte-identically to the install writers', async () => {
    const { project, main } = scaffold(
      root,
      ['claude-code', 'cursor', 'copilot', 'codex', 'gemini'],
      { 'database-query': { envVars: [{ name: 'DATABASE_URL' }] } }
    );
    store.write(project, { DATABASE_URL: DB_URL });

    const result = await materializeLocal(project, { store, mainCheckout: main });

    const expected = {
      'database-query': {
        command: 'node',
        args: [entryFor(main, 'database-query')],
        env: { DATABASE_URL: DB_URL },
        // The bundle lives in the main checkout, outside this project, so no
        // relative path is expressible — but the credential is still stored,
        // so the writers must render it as a reference.
        secretEnvNames: ['DATABASE_URL'],
      },
    };
    const previouslyManaged = ['database-query'];
    const read = (rel: string) => fs.readFileSync(path.join(project, ...rel.split('/')), 'utf-8');

    expect(read('.mcp.json')).toBe(
      writeClaudeCodeMcpConfig(expected, { previouslyManaged, file: '.mcp.json' })
    );
    expect(read('.cursor/mcp.json')).toBe(
      writeCursorMcpConfig(expected, { previouslyManaged, file: '.cursor/mcp.json' })
    );
    expect(read('.vscode/mcp.json')).toBe(
      writeVsCodeMcpConfig(expected, { previouslyManaged, file: '.vscode/mcp.json' })
    );
    expect(read('.github/mcp.json')).toBe(
      writeCopilotCliMcpConfig(expected, { previouslyManaged, file: '.github/mcp.json' })
    );
    expect(read('.codex/config.toml')).toBe(writeCodexTomlMcp(expected, { previouslyManaged }));
    expect(read('.gemini/settings.json')).toBe(
      writeGeminiSettings(expected, { previouslyManaged, file: '.gemini/settings.json' })
    );

    expect(result.written.sort()).toEqual([
      '.codex/config.toml',
      '.cursor/mcp.json',
      '.gemini/settings.json',
      '.github/mcp.json',
      '.mcp.json',
      '.vscode/mcp.json',
    ]);
    expect(result.secretsApplied).toEqual(['DATABASE_URL']);
  });

  it('points server args at the main checkout and copies no bundles', async () => {
    const { project, main } = scaffold(root, ['claude-code'], {
      'database-query': { envVars: [{ name: 'DATABASE_URL' }] },
    });
    store.write(project, { DATABASE_URL: DB_URL });

    await materializeLocal(project, { store, mainCheckout: main });

    const config = JSON.parse(fs.readFileSync(path.join(project, '.mcp.json'), 'utf-8'));
    const args: string[] = config.mcpServers['database-query'].args;
    expect(path.isAbsolute(args[0])).toBe(true);
    expect(args[0]).toBe(entryFor(main, 'database-query'));
    // The whole point: no 15 MB duplicate per agent.
    expect(fs.existsSync(path.join(project, '.mcp-servers'))).toBe(false);
  });

  it('writes no env and reports a skipped capability when nothing is stored', async () => {
    const { project, main } = scaffold(root, ['claude-code'], {
      'database-query': { envVars: [{ name: 'DATABASE_URL' }] },
    });

    const result = await materializeLocal(project, { store, mainCheckout: main });

    const config = JSON.parse(fs.readFileSync(path.join(project, '.mcp.json'), 'utf-8'));
    // Empty, exactly as an install with no value writes it — the Claude writer
    // passes the entry through unchanged, so byte-identity is preserved.
    expect(config.mcpServers['database-query'].env).toEqual({});
    expect(result.secretsApplied).toEqual([]);
    expect(result.skipped.some(s => s.capability === 'mcp-env' && s.reason.includes('DATABASE_URL')))
      .toBe(true);
  });

  it('gives each server only the variables its metadata declares', async () => {
    const { project, main } = scaffold(root, ['claude-code'], {
      'database-query': { envVars: [{ name: 'DATABASE_URL' }] },
      documentation: { envVars: [{ name: 'KB_CACHE_TTL' }] },
    });
    store.write(project, { DATABASE_URL: DB_URL });

    await materializeLocal(project, { store, mainCheckout: main, extraEnvVars: { KB_CACHE_TTL: '7200' } });

    const config = JSON.parse(fs.readFileSync(path.join(project, '.mcp.json'), 'utf-8'));
    // Referenced, not written: the value stays in ~/.dev-suite/env.
    expect(config.mcpServers['database-query'].env).toEqual({ DATABASE_URL: '${DATABASE_URL}' });
    expect(JSON.stringify(config)).not.toContain('s3cr3t-pw');
    // The database URL must not leak into a server that never asked for it.
    expect(config.mcpServers.documentation.env).toEqual({ KB_CACHE_TTL: '7200' });
    expect(JSON.stringify(config.mcpServers.documentation)).not.toContain('s3cr3t-pw');
  });

  it('skips a server whose bundle is nowhere reachable', async () => {
    const { project } = scaffold(root, ['claude-code'], {
      'database-query': { envVars: [{ name: 'DATABASE_URL' }] },
    });
    // No mainCheckout, no local bundle, no dev-suite source.
    const result = await materializeLocal(project, {
      store,
      mainCheckout: undefined,
      devSuiteDir: path.join(root, 'no-dev-suite-here'),
    });
    expect(result.servers).toEqual([]);
    expect(result.skipped.some(s => s.capability === 'mcp-server')).toBe(true);
  });

  it('reports, rather than guesses, when there is no install record', async () => {
    const project = path.join(root, 'bare');
    fs.mkdirSync(project, { recursive: true });
    const result = await materializeLocal(project, { store });
    expect(result.written).toEqual([]);
    expect(result.skipped[0].reason).toContain('.dev-suite.json');
  });

  it('preserves the user’s own MCP entries when merging', async () => {
    const { project, main } = scaffold(root, ['cursor'], {
      'database-query': { envVars: [{ name: 'DATABASE_URL' }] },
    });
    fs.mkdirSync(path.join(project, '.cursor'), { recursive: true });
    fs.writeFileSync(
      path.join(project, '.cursor', 'mcp.json'),
      JSON.stringify({ mcpServers: { 'my-own': { command: 'node', args: ['x.js'] } } }, null, 2)
    );
    store.write(project, { DATABASE_URL: DB_URL });

    await materializeLocal(project, { store, mainCheckout: main });

    const config = JSON.parse(fs.readFileSync(path.join(project, '.cursor', 'mcp.json'), 'utf-8'));
    expect(config.mcpServers['my-own']).toBeDefined();
    expect(config.mcpServers['database-query']).toBeDefined();
  });

  it('leaves an unparseable config untouched and reports it', async () => {
    const { project, main } = scaffold(root, ['claude-code'], {
      'database-query': { envVars: [{ name: 'DATABASE_URL' }] },
    });
    fs.writeFileSync(path.join(project, '.mcp.json'), '{ not json');

    const result = await materializeLocal(project, { store, mainCheckout: main });

    expect(fs.readFileSync(path.join(project, '.mcp.json'), 'utf-8')).toBe('{ not json');
    expect(result.skipped.some(s => s.capability === 'mcp' && s.reason.includes('.mcp.json'))).toBe(true);
  });

  it('reports a target that has no project-level MCP config', async () => {
    const { project, main } = scaffold(root, ['cline'], {
      'database-query': { envVars: [{ name: 'DATABASE_URL' }] },
    });
    const result = await materializeLocal(project, { store, mainCheckout: main });
    expect(result.written).toEqual([]);
    expect(result.skipped.some(s => s.capability === 'mcp')).toBe(true);
  });

  it('refuses a manifest server name that is not a single path segment', async () => {
    const { project, main } = scaffold(root, ['claude-code'], {
      'database-query': { envVars: [{ name: 'DATABASE_URL' }] },
    });
    fs.writeFileSync(
      path.join(project, '.dev-suite.json'),
      JSON.stringify({ targets: ['claude-code'], mcpServers: { enabled: ['../../evil'] } })
    );
    fs.writeFileSync(
      path.join(project, '.dev-suite-manifest.json'),
      JSON.stringify({ targets: ['claude-code'], mcpServers: ['../../evil'] })
    );

    const result = await materializeLocal(project, { store, mainCheckout: main });
    expect(result.servers).toEqual([]);
    expect(result.skipped.some(s => s.reason.includes('evil'))).toBe(false);
  });
});
