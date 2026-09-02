/**
 * Recovery must not depend on files git cannot carry.
 *
 * `recoverEnvVars()` reconstructs the wizard's env values before a reinstall or
 * a Manage-tab resync. It read them out of the assistants' MCP configs, which
 * are gitignored when they hold a secret — so in a fresh `git worktree` it
 * recovered `{}` and the reinstall wiped every credential. That is the same
 * class of bug the file's own header says was already fixed once for
 * Cursor-only projects.
 *
 * The store is now primary; the config scan is the legacy path, kept so that
 * projects installed before the store still recover, and it migrates itself on
 * first use.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  recoverEnvVars,
  recoverSkillLoadingMode,
} from '../../src/services/installation/install-recovery.js';
import { SecretEnvStore } from '../../src/services/installation/secret-store.js';
import { createTempDir, cleanupTempDir } from '../test-utils.js';

const DB_URL = 'postgres://app:s3cr3t-pw@db.internal:5432/prod';

describe('recoverEnvVars', () => {
  let project: string;
  let home: string;
  let store: SecretEnvStore;

  beforeEach(() => {
    project = createTempDir('recovery-');
    home = createTempDir('recovery-home-');
    store = new SecretEnvStore(home);
  });
  afterEach(() => { cleanupTempDir(project); cleanupTempDir(home); });

  const writeConfig = (rel: string, content: unknown) => {
    const abs = path.join(project, ...rel.split('/'));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, typeof content === 'string' ? content : JSON.stringify(content, null, 2));
  };

  it('recovers from the store when no MCP config exists at all — the worktree case', () => {
    store.write(project, { DATABASE_URL: DB_URL });
    expect(recoverEnvVars(project, ['claude-code'], { store })).toEqual({ DATABASE_URL: DB_URL });
  });

  it('prefers the store over a stale value in an MCP config', () => {
    store.write(project, { DATABASE_URL: DB_URL });
    writeConfig('.mcp.json', { mcpServers: { db: { env: { DATABASE_URL: 'postgres://old' } } } });
    expect(recoverEnvVars(project, ['claude-code'], { store }).DATABASE_URL).toBe(DB_URL);
  });

  it('still falls back to the MCP config for values the store does not hold', () => {
    store.write(project, { DATABASE_URL: DB_URL });
    writeConfig('.mcp.json', { mcpServers: { docs: { env: { KB_CACHE_TTL: '7200' } } } });
    expect(recoverEnvVars(project, ['claude-code'], { store })).toEqual({
      DATABASE_URL: DB_URL,
      KB_CACHE_TTL: '7200',
    });
  });

  it('recovers a legacy install that has no store at all', () => {
    writeConfig('.mcp.json', { mcpServers: { db: { env: { DATABASE_URL: DB_URL } } } });
    expect(recoverEnvVars(project, ['claude-code'], { store }).DATABASE_URL).toBe(DB_URL);
  });

  it('migrates a legacy secret into the store, once', () => {
    writeConfig('.mcp.json', { mcpServers: { db: { env: { DATABASE_URL: DB_URL, KB_CACHE_TTL: '7200' } } } });
    expect(store.read(project)).toEqual({});

    recoverEnvVars(project, ['claude-code'], { store });

    // The secret moves to the protected store; the plain setting does not —
    // it is configuration, and belongs in the committed config file.
    expect(store.read(project)).toEqual({ DATABASE_URL: DB_URL });

    // Idempotent: a second pass changes nothing, and the value survives the
    // config file being deleted (exactly what a worktree checkout looks like).
    recoverEnvVars(project, ['claude-code'], { store });
    fs.rmSync(path.join(project, '.mcp.json'));
    expect(recoverEnvVars(project, ['claude-code'], { store })).toEqual({ DATABASE_URL: DB_URL });
  });

  it('migrates from a Cursor-only project, not just Claude Code', () => {
    writeConfig('.cursor/mcp.json', {
      mcpServers: { db: { type: 'stdio', env: { DATABASE_URL: DB_URL } } },
    });
    recoverEnvVars(project, ['cursor'], { store });
    expect(store.read(project)).toEqual({ DATABASE_URL: DB_URL });
  });

  it('migrates from Codex TOML', () => {
    writeConfig('.codex/config.toml', `[mcp_servers.db.env]\nDATABASE_URL = "${DB_URL}"\n`);
    recoverEnvVars(project, ['codex'], { store });
    expect(store.read(project)).toEqual({ DATABASE_URL: DB_URL });
  });

  it('honours the catalog’s secret declarations when a dev-suite dir is given', () => {
    const devSuiteDir = path.resolve(__dirname, '..', '..', '..', '..', '..');
    // ORCHESTRATOR_WS_TOKEN is declared secret; KB_REPO_URL is not.
    writeConfig('.mcp.json', {
      mcpServers: { bridge: { env: { ORCHESTRATOR_WS_TOKEN: 'tok-123', KB_REPO_URL: 'https://example.test/kb.git' } } },
    });
    recoverEnvVars(project, ['claude-code'], { store, devSuiteDir });
    expect(store.read(project)).toEqual({ ORCHESTRATOR_WS_TOKEN: 'tok-123' });
  });

  it('does not migrate when asked not to', () => {
    writeConfig('.mcp.json', { mcpServers: { db: { env: { DATABASE_URL: DB_URL } } } });
    recoverEnvVars(project, ['claude-code'], { store, migrate: false });
    expect(store.read(project)).toEqual({});
  });

  it('returns {} for a project with neither store nor configs', () => {
    expect(recoverEnvVars(project, ['claude-code'], { store })).toEqual({});
  });
});

describe('recoverSkillLoadingMode', () => {
  let project: string;
  beforeEach(() => { project = createTempDir('recovery-mode-'); });
  afterEach(() => { cleanupTempDir(project); });

  it('still reads the mode from the MCP config', () => {
    fs.writeFileSync(
      path.join(project, '.mcp.json'),
      JSON.stringify({ mcpServers: { 'skill-loader': { command: 'node', args: [] } } })
    );
    expect(recoverSkillLoadingMode(project, ['claude-code'])).toBe('lazy');
  });

  it('defaults to eager with no config — the worktree case', () => {
    expect(recoverSkillLoadingMode(project, ['claude-code'])).toBe('eager');
  });
});
