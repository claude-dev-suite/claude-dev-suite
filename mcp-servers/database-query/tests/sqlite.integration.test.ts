// SPDX-License-Identifier: MIT
/**
 * Real SQLite (node:sqlite). Auto-skips on runtimes without node:sqlite.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createRequire } from 'module';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { resetRegistry } from '../src/config.js';
import { closeAll, setDriverFactory } from '../src/drivers/index.js';
import { callTool } from '../src/handlers/dispatch.js';
import { parse } from './helpers.js';

const require_ = createRequire(import.meta.url);
let sqlite: { DatabaseSync: new (f: string) => { exec(s: string): void; close(): void; prepare(s: string): { get(): Record<string, unknown> } } } | null = null;
try {
  sqlite = require_('node:sqlite');
} catch {
  sqlite = null;
}

const dir = mkdtempSync(join(tmpdir(), 'dbq-sqlite-'));
const main = join(dir, 'main.db').replace(/\\/g, '/');
const other = join(dir, 'other.db').replace(/\\/g, '/');

function build(file: string, v2: boolean) {
  const db = new sqlite!.DatabaseSync(file);
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, name TEXT,
                        CONSTRAINT email_chk CHECK (email LIKE '%@%'));
    CREATE TABLE orgs (id INTEGER, region TEXT, PRIMARY KEY (id, region));
    CREATE TABLE members (user_id INTEGER REFERENCES users(id), org_id INTEGER, org_region TEXT,
                          FOREIGN KEY (org_id, org_region) REFERENCES orgs(id, region) ON DELETE CASCADE);
    CREATE INDEX idx_members_org ON members(org_id, org_region);
    INSERT INTO users (email, name) VALUES ('a@x.io', 'a'), ('b@x.io', 'b'), ('c@x.io', NULL);
    ${v2 ? 'ALTER TABLE users ADD COLUMN phone TEXT; CREATE TABLE audit (id INTEGER PRIMARY KEY, at TEXT NOT NULL);' : ''}
  `);
  db.close();
}

const run = sqlite ? describe : describe.skip;

run('sqlite integration', () => {
  beforeAll(() => {
    build(main, false);
    build(other, true);
  });
  afterAll(async () => {
    await closeAll();
    rmSync(dir, { recursive: true, force: true });
  });
  afterEach(() => {
    for (const k of ['DATABASE_URL', 'DATABASE_URLS', 'DATABASE_ALLOW_WRITES', 'DB_STATEMENT_TIMEOUT_MS', 'DB_BACKUP_DIR']) delete process.env[k];
    resetRegistry();
    setDriverFactory(null);
  });
  const useEnv = (env: Record<string, string>) => {
    Object.assign(process.env, env);
    resetRegistry();
    setDriverFactory(null);
  };

  it('reads with paging and refuses writes at the engine level', async () => {
    useEnv({ DATABASE_URL: `sqlite:///${main}` });
    const r = parse(await callTool('execute_query', { sql: 'SELECT id, email FROM users ORDER BY id;', limit: 2 }));
    expect(r.rows.map((x: { id: number }) => x.id)).toEqual([1, 2]);
    expect(r.hasMore).toBe(true);
    const w = await callTool('execute_query', { sql: "UPDATE users SET name = 'z'" });
    expect(w.isError).toBe(true);
    expect(parse(w).error).toMatch(/readonly|read-only/i);
  });

  it('enforces the statement timeout on a runaway query (worker is terminated)', async () => {
    useEnv({ DATABASE_URL: `sqlite:///${main}`, DB_STATEMENT_TIMEOUT_MS: '400' });
    const started = Date.now();
    const r = await callTool('execute_query', {
      sql: 'WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c) SELECT count(*) FROM c',
    });
    expect(r.isError).toBe(true);
    expect(parse(r).error).toMatch(/statement timeout/);
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  it('introspects composite PK/FK, checks, uniques and indexes', async () => {
    useEnv({ DATABASE_URL: `sqlite:///${main}` });
    const m = parse(await callTool('describe_table', { table: 'members' }));
    expect(m.foreignKeys.find((f: { refTable: string }) => f.refTable === 'orgs')).toMatchObject({
      columns: ['org_id', 'org_region'],
      refColumns: ['id', 'region'],
      onDelete: 'CASCADE',
    });
    const o = parse(await callTool('describe_table', { table: 'orgs' }));
    expect(o.primaryKey.columns).toEqual(['id', 'region']);
    const u = parse(await callTool('describe_table', { table: 'users' }));
    expect(u.checkConstraints).toEqual([{ name: 'email_chk', expression: "CHECK (email LIKE '%@%')" }]);
    expect(u.uniqueConstraints[0].columns).toEqual(['email']);
    expect(u.columns[0].autoIncrement).toBe(true);
  });

  it('diffs two databases and generates a migration', async () => {
    useEnv({ DATABASE_URL: `sqlite:///${main}`, DATABASE_URLS: JSON.stringify({ v2: `sqlite:///${other}` }) });
    const c = parse(await callTool('compare_schemas', { targetConnection: 'v2' }));
    expect(c.identical).toBe(false);
    expect(c.differences.tablesOnlyInTarget).toEqual(['audit']);
    const g = parse(await callTool('generate_migration', { targetConnection: 'v2' }));
    expect(g.up).toContain('ALTER TABLE "users" ADD COLUMN "phone" TEXT;');
    expect(g.up).toContain('CREATE TABLE audit');
    expect(g.down).not.toMatch(/DROP/);
  });

  it('execute_write: dry run rolls back, confirm commits', async () => {
    const f = join(dir, 'w.db').replace(/\\/g, '/');
    build(f, false);
    useEnv({ DATABASE_URLS: JSON.stringify({ w: { url: `sqlite:///${f}`, readOnly: false } }) });
    const dry = parse(await callTool('execute_write', { sql: "DELETE FROM users WHERE email = 'a@x.io'" }));
    expect(dry.dryRun).toBe(true);
    expect(dry.results[0].affectedRows).toBe(1);
    const count = async () => parse(await callTool('execute_query', { sql: 'SELECT count(*) AS n FROM users' })).rows[0].n;
    expect(await count()).toBe(3);
    const real = parse(await callTool('execute_write', { sql: "DELETE FROM users WHERE email = 'a@x.io'", confirm: true }));
    expect(real.committed).toBe(true);
    expect(await count()).toBe(2);
  });

  it('backup via VACUUM INTO, restore gated by confirm with a safety copy', async () => {
    const f = join(dir, 'r.db').replace(/\\/g, '/');
    build(f, false);
    const backups = join(dir, 'backups');
    useEnv({ DATABASE_URLS: JSON.stringify({ r: { url: `sqlite:///${f}`, readOnly: false } }), DB_BACKUP_DIR: backups });
    const b = parse(await callTool('backup_restore', { operation: 'backup', backupPath: 'r1.db' }));
    expect(b.success).toBe(true);
    expect(existsSync(join(backups, 'r1.db'))).toBe(true);

    await callTool('execute_write', { sql: 'DELETE FROM users', confirm: true });
    const dry = parse(await callTool('backup_restore', { operation: 'restore', backupPath: 'r1.db' }));
    expect(dry.dryRun).toBe(true);
    const done = parse(await callTool('backup_restore', { operation: 'restore', backupPath: 'r1.db', confirm: true }));
    expect(done.success).toBe(true);
    expect(existsSync(done.safetyCopy)).toBe(true);
    const n = parse(await callTool('execute_query', { sql: 'SELECT count(*) AS n FROM users' })).rows[0].n;
    expect(n).toBe(3);

    writeFileSync(join(backups, 'bogus.db'), 'not sqlite');
    const bad = await callTool('backup_restore', { operation: 'restore', backupPath: 'bogus.db', confirm: true });
    expect(parse(bad).error).toMatch(/not a SQLite database/);
  });

  it('health_check and index_recommendations run for real', async () => {
    useEnv({ DATABASE_URL: `sqlite:///${main}` });
    const h = parse(await callTool('health_check', {}));
    expect(h.checks.find((c: { name: string }) => c.name === 'integrity').status).toBe('ok');
    const i = parse(await callTool('index_recommendations', {}));
    expect(i.unindexedForeignKeys.map((x: { foreignKey: string; columns: string[] }) => x.columns)).toEqual([['user_id']]);
  });

  it('a missing database file is an explicit error (never silently created)', async () => {
    useEnv({ DATABASE_URL: `sqlite:///${dir.replace(/\\/g, '/')}/missing.db` });
    const r = await callTool('list_tables', {});
    expect(parse(r).error).toMatch(/not found/);
    expect(existsSync(join(dir, 'missing.db'))).toBe(false);
  });
});
