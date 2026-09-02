/**
 * The `.gitignore` block must be narrow, and it must never be narrow enough to
 * leak.
 *
 * The old rule ignored every MCP config of every selected target as soon as the
 * wizard collected *any* env value — `KB_REPO_BRANCH` or `DASHBOARD_PORT` was
 * enough — which quietly dropped `.codex/config.toml` and
 * `.gemini/settings.json` (whole assistant configs) out of version control, and
 * left a `git worktree` with no assistant configuration at all.
 *
 * The replacement decides per file, from the bytes on disk. These tests pin
 * both directions: a non-secret env value ignores nothing, and a file still
 * containing a secret literal is never un-ignored.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  configsContainingSecrets,
  updateGitignore,
  removeGitignoreBlock,
} from '../../src/services/installation/gitignore.js';
import { createTempDir, cleanupTempDir } from '../test-utils.js';

const DB_URL = 'postgres://app:s3cr3t-pw@db.internal:5432/prod';

describe('updateGitignore', () => {
  let dir: string;
  beforeEach(() => { dir = createTempDir('gitignore-'); });
  afterEach(() => { cleanupTempDir(dir); });

  const write = (rel: string, content: string) => {
    const abs = path.join(dir, ...rel.split('/'));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  };
  const read = () => fs.readFileSync(path.join(dir, '.gitignore'), 'utf-8');

  it('always ignores .mcp-servers/, even with no secrets at all', () => {
    updateGitignore(dir, ['claude-code'], []);
    expect(read()).toContain('.mcp-servers/');
    expect(read()).toContain('.dev-suite-backup-*/');
  });

  it('ignores no MCP config when only non-secret env values were set', () => {
    // Exactly the historical false positive: a cache TTL and a port.
    write('.mcp.json', JSON.stringify({ mcpServers: { documentation: { env: { KB_CACHE_TTL: '7200' } } } }));
    write('.codex/config.toml', '[mcp_servers.documentation.env]\nKB_CACHE_TTL = "7200"\n');
    write('.gemini/settings.json', JSON.stringify({ mcpServers: {} }));

    updateGitignore(dir, ['claude-code', 'codex', 'gemini'], []);

    const content = read();
    expect(content).not.toContain('.mcp.json');
    expect(content).not.toContain('.codex/config.toml');
    expect(content).not.toContain('.gemini/settings.json');
    expect(content).toContain('.mcp-servers/');
  });

  it('ignores only the files that actually contain the secret value', () => {
    write('.mcp.json', JSON.stringify({ mcpServers: { db: { env: { DATABASE_URL: DB_URL } } } }));
    // Codex is configured for this project but holds no secret.
    write('.codex/config.toml', '[mcp_servers.documentation]\ncommand = "node"\n');

    updateGitignore(dir, ['claude-code', 'codex'], [DB_URL]);

    const content = read();
    expect(content).toContain('.mcp.json');
    expect(content).not.toContain('.codex/config.toml');
  });

  it('keeps ignoring a file that still holds a secret literal', () => {
    write('.cursor/mcp.json', JSON.stringify({ mcpServers: { db: { env: { DATABASE_URL: DB_URL } } } }));

    updateGitignore(dir, ['cursor'], [DB_URL]);
    expect(read()).toContain('.cursor/mcp.json');

    // A second pass that forgets to pass the value must not un-ignore it while
    // the literal is still on disk — so the caller re-derives it from the
    // catalog, and the safety net only lifts when the bytes change.
    updateGitignore(dir, ['cursor'], [DB_URL]);
    expect(read()).toContain('.cursor/mcp.json');
  });

  it('un-ignores a config once the secret is gone from it', () => {
    write('.mcp.json', JSON.stringify({ mcpServers: { db: { env: { DATABASE_URL: DB_URL } } } }));
    updateGitignore(dir, ['claude-code'], [DB_URL]);
    expect(read()).toContain('.mcp.json');

    write('.mcp.json', JSON.stringify({ mcpServers: { db: { env: {} } } }));
    updateGitignore(dir, ['claude-code'], [DB_URL]);
    expect(read()).not.toContain('.mcp.json');
  });

  it('is idempotent — repeated runs leave one block and identical bytes', () => {
    write('.mcp.json', JSON.stringify({ mcpServers: { db: { env: { DATABASE_URL: DB_URL } } } }));
    updateGitignore(dir, ['claude-code'], [DB_URL]);
    const first = read();
    updateGitignore(dir, ['claude-code'], [DB_URL]);
    updateGitignore(dir, ['claude-code'], [DB_URL]);
    expect(read()).toBe(first);
    expect(read().match(/# --- dev-suite \(managed\) ---/g)).toHaveLength(1);
  });

  it('preserves the user’s own entries', () => {
    fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules\ndist/\n');
    updateGitignore(dir, ['claude-code'], []);
    const content = read();
    expect(content).toContain('node_modules');
    expect(content).toContain('dist/');
    expect(removeGitignoreBlock(dir)).toBe(true);
    expect(read()).toContain('node_modules');
    expect(read()).not.toContain('.mcp-servers/');
  });

  it('carries guidance on what IS committable', () => {
    updateGitignore(dir, ['claude-code'], []);
    const content = read();
    expect(content).toContain('AGENTS.md');
    expect(content).toContain('.dev-suite.json');
  });

  it('never reveals the secret value itself in the block', () => {
    write('.mcp.json', JSON.stringify({ mcpServers: { db: { env: { DATABASE_URL: DB_URL } } } }));
    updateGitignore(dir, ['claude-code'], [DB_URL]);
    expect(read()).not.toContain(DB_URL);
    expect(read()).not.toContain('s3cr3t-pw');
  });
});

describe('configsContainingSecrets', () => {
  let dir: string;
  beforeEach(() => { dir = createTempDir('gitignore-scan-'); });
  afterEach(() => { cleanupTempDir(dir); });

  it('returns nothing when no secret values are supplied', () => {
    fs.writeFileSync(path.join(dir, '.mcp.json'), JSON.stringify({ mcpServers: {} }));
    expect(configsContainingSecrets(dir, ['claude-code'], [])).toEqual([]);
    expect(configsContainingSecrets(dir, ['claude-code'], ['   '])).toEqual([]);
  });

  it('finds both of Copilot’s MCP surfaces independently', () => {
    fs.mkdirSync(path.join(dir, '.vscode'), { recursive: true });
    fs.mkdirSync(path.join(dir, '.github'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.vscode', 'mcp.json'), `{"servers":{"db":{"env":{"DATABASE_URL":"${DB_URL}"}}}}`);
    fs.writeFileSync(path.join(dir, '.github', 'mcp.json'), '{"mcpServers":{}}');

    const found = configsContainingSecrets(dir, ['copilot'], [DB_URL]);
    expect(found).toEqual(['.vscode/mcp.json']);
  });

  it('finds a secret inside Codex TOML too', () => {
    fs.mkdirSync(path.join(dir, '.codex'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.codex', 'config.toml'), `[mcp_servers.db.env]\nDATABASE_URL = "${DB_URL}"\n`);
    expect(configsContainingSecrets(dir, ['codex'], [DB_URL])).toEqual(['.codex/config.toml']);
  });

  // The scan compares what the user typed against the bytes on disk, but no
  // writer stores the value verbatim. A raw substring test therefore misses any
  // credential the serialiser had to escape — and DATABASE_URL is the one value
  // the wizard makes a human type by hand, which is where odd characters come
  // from. Each of these fails against a plain `content.includes(value)`.
  describe('values the writers had to escape', () => {
    it('finds a password containing a backslash in a JSON config', () => {
      const secret = String.raw`Server=db;User Id=svc;Password=p\ss;`;
      fs.mkdirSync(path.join(dir, '.cursor'), { recursive: true });
      fs.writeFileSync(
        path.join(dir, '.cursor', 'mcp.json'),
        JSON.stringify({ mcpServers: { db: { env: { DATABASE_URL: secret } } } })
      );

      expect(configsContainingSecrets(dir, ['cursor'], [secret])).toEqual(['.cursor/mcp.json']);
    });

    it('finds a password containing a double quote', () => {
      const secret = 'pa"ss-word';
      fs.mkdirSync(path.join(dir, '.cursor'), { recursive: true });
      fs.writeFileSync(
        path.join(dir, '.cursor', 'mcp.json'),
        JSON.stringify({ mcpServers: { db: { env: { DATABASE_URL: secret } } } })
      );

      expect(configsContainingSecrets(dir, ['cursor'], [secret])).toEqual(['.cursor/mcp.json']);
    });

    it('finds an escaped secret in Codex TOML', () => {
      const secret = String.raw`domain\user:pw"1`;
      fs.mkdirSync(path.join(dir, '.codex'), { recursive: true });
      const escaped = secret.replace(/\\/g, String.raw`\\`).replace(/"/g, String.raw`\"`);
      fs.writeFileSync(
        path.join(dir, '.codex', 'config.toml'),
        `[mcp_servers.db.env]\nDATABASE_URL = "${escaped}"\n`
      );

      expect(configsContainingSecrets(dir, ['codex'], [secret])).toEqual(['.codex/config.toml']);
    });

    it('still does not ignore a config that merely resembles the secret', () => {
      // The widened comparison must not become a substring free-for-all: a
      // config with no credential in it stays committable.
      fs.mkdirSync(path.join(dir, '.cursor'), { recursive: true });
      fs.writeFileSync(
        path.join(dir, '.cursor', 'mcp.json'),
        JSON.stringify({ mcpServers: { docs: { env: { KB_REPO_BRANCH: 'main' } } } })
      );

      expect(configsContainingSecrets(dir, ['cursor'], [String.raw`p\ss`])).toEqual([]);
    });
  });
});
