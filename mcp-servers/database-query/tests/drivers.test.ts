// SPDX-License-Identifier: MIT
/**
 * The engine-level guarantees of the Postgres and MySQL drivers, checked
 * against fake pools that record what is sent on the wire.
 */

import { describe, it, expect, vi } from 'vitest';
import { loadRegistry } from '../src/config.js';
import { PostgresDriver } from '../src/drivers/postgres.js';
import { MysqlDriver, writesServerFile } from '../src/drivers/mysql.js';

const conn = (url: string, env: Record<string, string> = {}) => loadRegistry({ DATABASE_URL: url, ...env }).connections.get('default')!;

function fakePgPool(onQuery: (q: { text: string; queryMode?: string; values?: unknown[] }) => unknown = () => ({ rows: [], fields: [], command: 'SELECT', rowCount: 0 })) {
  const sent: Array<{ text: string; queryMode?: string; values?: unknown[] }> = [];
  const client = {
    query: vi.fn(async (q: string | { text: string; queryMode?: string; values?: unknown[] }) => {
      const obj = typeof q === 'string' ? { text: q } : q;
      sent.push(obj);
      const r = onQuery(obj);
      if (r instanceof Error) throw r;
      return r ?? { rows: [], fields: [], command: 'SELECT', rowCount: 0 };
    }),
    release: vi.fn(),
  };
  const pool = { connect: vi.fn(async () => client), on: vi.fn(), end: vi.fn() };
  return { pool, client, sent };
}

describe('PostgresDriver', () => {
  it('read session: BEGIN READ ONLY, SET LOCAL statement_timeout, ROLLBACK', async () => {
    const { pool, sent, client } = fakePgPool();
    const d = new PostgresDriver(conn('postgres://u:p@h/d', { DB_STATEMENT_TIMEOUT_MS: '1234' }), () => pool as never);
    await d.withSession('read', (s) => s.query('SELECT 1'), { timeoutMs: 1234 });
    expect(sent.map((q) => q.text)).toEqual(['BEGIN READ ONLY', 'SET LOCAL statement_timeout = 1234', 'SELECT 1', 'ROLLBACK']);
    expect(client.release).toHaveBeenCalled();
  });

  it('user statements use the extended protocol (rejects multi-statement strings server-side)', async () => {
    const { pool, sent } = fakePgPool();
    const d = new PostgresDriver(conn('postgres://u:p@h/d'), () => pool as never);
    await d.withSession('read', (s) => s.query('SELECT 1'));
    expect(sent.find((q) => q.text === 'SELECT 1')!.queryMode).toBe('extended');
  });

  it('rolls back and rethrows when a statement fails', async () => {
    const { pool, sent } = fakePgPool((q) => (q.text === 'BAD' ? new Error('syntax error') : undefined));
    const d = new PostgresDriver(conn('postgres://u:p@h/d'), () => pool as never);
    await expect(d.withSession('read', (s) => s.query('BAD'))).rejects.toThrow('syntax error');
    expect(sent.at(-1)!.text).toBe('ROLLBACK');
  });

  it('write session is refused on a read-only connection', async () => {
    const { pool } = fakePgPool();
    const d = new PostgresDriver(conn('postgres://u:p@h/d'), () => pool as never);
    await expect(d.withSession('write', async () => 1)).rejects.toThrow(/read-only/);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('write session commits, or rolls back when commit:false (dry run)', async () => {
    const { pool, sent } = fakePgPool();
    const d = new PostgresDriver(conn('postgres://u:p@h/d', { DATABASE_ALLOW_WRITES: 'true' }), () => pool as never);
    await d.withSession('write', (s) => s.query('UPDATE t SET a = 1'));
    expect(sent.map((q) => q.text)).toContain('COMMIT');
    sent.length = 0;
    await d.withSession('write', (s) => s.query('UPDATE t SET a = 1'), { commit: false });
    expect(sent.at(-1)!.text).toBe('ROLLBACK');
    expect(sent.map((q) => q.text)).not.toContain('COMMIT');
  });

  it('keeps duplicate column names instead of overwriting values', async () => {
    const { pool } = fakePgPool((q) =>
      q.text === 'SELECT a.id, b.id' ? { rows: [[1, 2]], fields: [{ name: 'id' }, { name: 'id' }], command: 'SELECT' } : undefined
    );
    const d = new PostgresDriver(conn('postgres://u:p@h/d'), () => pool as never);
    const r = await d.withSession('read', (s) => s.query('SELECT a.id, b.id'));
    expect(r.rows[0]).toEqual({ id: 1, id_2: 2 });
  });
});

function fakeMysqlPool(version = '8.0.36') {
  const sent: string[] = [];
  const conn = {
    query: vi.fn(async (q: string | { sql: string }) => {
      const sql = typeof q === 'string' ? q : q.sql;
      sent.push(sql);
      if (sql === 'SELECT VERSION() AS v') return [[{ v: version }], []];
      if (typeof q !== 'string') return [[], []];
      return [{ affectedRows: 0 }, undefined];
    }),
    release: vi.fn(),
    destroy: vi.fn(),
  };
  const pool = { getConnection: vi.fn(async () => conn), query: conn.query, end: vi.fn() };
  return { pool, sent, conn };
}

describe('MysqlDriver', () => {
  it('read session: max_execution_time + START TRANSACTION READ ONLY + ROLLBACK (MySQL)', async () => {
    const { pool, sent } = fakeMysqlPool('8.0.36');
    const d = new MysqlDriver(conn('mysql://u:p@h/d'), () => pool as never);
    await d.withSession('read', (s) => s.query('SELECT 1'), { timeoutMs: 5000 });
    expect(sent).toEqual([
      'SELECT VERSION() AS v',
      'SET SESSION max_execution_time = 5000',
      'START TRANSACTION READ ONLY',
      'SELECT 1',
      'ROLLBACK',
    ]);
  });

  it('uses max_statement_time (seconds) on MariaDB', async () => {
    const { pool, sent } = fakeMysqlPool('11.4.2-MariaDB');
    const d = new MysqlDriver(conn('mysql://u:p@h/d'), () => pool as never);
    await d.withSession('read', async () => undefined, { timeoutMs: 2500 });
    expect(sent).toContain('SET SESSION max_statement_time = 2.500');
  });

  it('refuses SELECT … INTO OUTFILE on read sessions', async () => {
    const { pool } = fakeMysqlPool();
    const d = new MysqlDriver(conn('mysql://u:p@h/d'), () => pool as never);
    await expect(d.withSession('read', (s) => s.query("SELECT * FROM t INTO OUTFILE '/tmp/x'"))).rejects.toThrow(/OUTFILE/);
    expect(writesServerFile("SELECT 'into outfile' FROM t")).toBe(false);
  });
});
