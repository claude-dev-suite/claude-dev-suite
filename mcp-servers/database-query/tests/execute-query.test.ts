// SPDX-License-Identifier: MIT
/**
 * execute_query / execute_write / explain_query behaviour against a fake
 * driver. Each "old defect" case fails on the pre-2.3 implementation.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { handleExecuteQuery, planQuery } from '../src/handlers/execute-query.js';
import { handleExecuteWrite, classifyStatement } from '../src/handlers/execute-write.js';
import { handleExplainQuery, summarizePostgresPlan } from '../src/handlers/explain-query.js';
import { callTool } from '../src/handlers/dispatch.js';
import { installFakes, parse, resetFakes } from './helpers.js';

afterEach(resetFakes);

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1 }));

describe('planQuery', () => {
  it('old defect: a trailing ";" no longer breaks the appended LIMIT', () => {
    const p = planQuery('SELECT * FROM t;', 'postgres', 10, 0);
    expect(p.sql).toBe('SELECT * FROM t\nLIMIT 11');
  });

  it('old defect: a LIMIT in a subquery no longer counts as the outer limit', () => {
    const p = planQuery('SELECT * FROM (SELECT * FROM t LIMIT 5) s', 'postgres', 10, 0);
    expect(p.strategy).toBe('appended-limit');
    expect(p.sql.endsWith('\nLIMIT 11')).toBe(true);
  });

  it('wraps a statement that already has a top-level LIMIT, so the cap still applies', () => {
    const p = planQuery('SELECT * FROM t ORDER BY id LIMIT 100000', 'postgres', 10, 20);
    expect(p.strategy).toBe('wrapped');
    expect(p.sql).toMatch(/^SELECT \* FROM \(\nSELECT \* FROM t ORDER BY id LIMIT 100000\n\) AS _dsq_capped LIMIT 11 OFFSET 20$/);
  });

  it('appends on a new line so a trailing -- comment cannot swallow the LIMIT', () => {
    expect(planQuery('SELECT 1 -- note', 'postgres', 5, 0).sql).toBe('SELECT 1 -- note\nLIMIT 6');
  });

  it('SHOW / PRAGMA run unmodified and are capped client-side', () => {
    const p = planQuery('PRAGMA table_info(t)', 'sqlite', 5, 2);
    expect(p.strategy).toBe('as-is');
    expect(p.fetch).toBe(8);
  });
});

describe('execute_query', () => {
  it('old defect: WITH … SELECT, VALUES and leading comments are accepted', async () => {
    const fakes = installFakes({ DATABASE_URL: 'postgres://u:p@h/d' }, () => ({ rows: rows(1) }));
    for (const sql of ['WITH x AS (SELECT 1 AS id) SELECT * FROM x', 'VALUES (1)', '/* hi */ SELECT 1']) {
      const r = await handleExecuteQuery({ sql });
      expect(r.isError).toBeFalsy();
    }
    expect(fakes.get('default')!.sessions.every((s) => s.mode === 'read')).toBe(true);
  });

  it('runs in an engine read-only session, not behind a prefix check', async () => {
    const fakes = installFakes({ DATABASE_URL: 'postgres://u:p@h/d' }, (sql) =>
      /^DELETE/.test(sql) ? new Error('cannot execute DELETE in a read-only transaction') : { rows: [] }
    );
    const r = await callTool('execute_query', { sql: 'DELETE FROM users' });
    expect(r.isError).toBe(true);
    expect(parse(r).error).toMatch(/read-only transaction.*execute_write/);
    expect(fakes.get('default')!.sessions[0].mode).toBe('read');
  });

  it('old defect: no COUNT(*) re-execution unless includeTotalCount', async () => {
    const fakes = installFakes({ DATABASE_URL: 'postgres://u:p@h/d' }, () => ({ rows: rows(11) }));
    const r = parse(await handleExecuteQuery({ sql: 'SELECT id FROM t', limit: 10 }));
    expect(r.rowCount).toBe(10);
    expect(r.hasMore).toBe(true);
    expect(r.nextOffset).toBe(10);
    expect(fakes.get('default')!.allQueries.some((q) => /COUNT\(\*\)/i.test(q.sql))).toBe(false);

    const withCount = parse(
      await handleExecuteQuery({ sql: 'SELECT id FROM t', limit: 10, includeTotalCount: true })
    );
    expect(withCount.totalCount).toBeDefined();
  });

  it('rejects multi-statement input before touching the database', async () => {
    const fakes = installFakes({ DATABASE_URL: 'postgres://u:p@h/d' });
    const r = await handleExecuteQuery({ sql: 'SELECT 1; COMMIT; DROP TABLE users' });
    expect(r.isError).toBe(true);
    expect(fakes.get('default')?.allQueries.length ?? 0).toBe(0);
  });

  it('caps limit at DB_MAX_ROWS', async () => {
    installFakes({ DATABASE_URL: 'postgres://u:p@h/d', DB_MAX_ROWS: '50' }, () => ({ rows: rows(60) }));
    const r = parse(await handleExecuteQuery({ sql: 'SELECT 1', limit: 5000 }));
    expect(r.limit).toBe(50);
    expect(r.rowCount).toBe(50);
    expect(r.note).toMatch(/DB_MAX_ROWS/);
  });

  it('truncates huge cells and says so', async () => {
    installFakes({ DATABASE_URL: 'postgres://u:p@h/d' }, () => ({ rows: [{ big: 'x'.repeat(5000) }] }));
    const r = parse(await handleExecuteQuery({ sql: 'SELECT big FROM t', maxCellChars: 100 }));
    expect(r.rows[0].big.length).toBeLessThan(200);
    expect(r.truncatedCells).toBe(1);
  });

  it('routes to a named connection and errors clearly on an unknown one', async () => {
    const fakes = installFakes({ DATABASE_URLS: JSON.stringify({ a: 'postgres://h/a', b: 'mysql://h/b' }) }, () => ({ rows: [] }));
    await handleExecuteQuery({ sql: 'SELECT 1', connection: 'b' });
    expect(fakes.get('b')!.sessions).toHaveLength(1);
    const r = await callTool('execute_query', { sql: 'SELECT 1', connection: 'zzz' });
    expect(parse(r).error).toMatch(/Unknown connection "zzz"/);
    const noDefault = await callTool('execute_query', { sql: 'SELECT 1' });
    expect(parse(noDefault).error).toMatch(/pass connection/);
  });

  it('never returns a configured password, even if a driver error echoes it', async () => {
    installFakes({ DATABASE_URL: 'postgres://u:Sup3rS3cret@h/d' }, () => new Error('auth failed for u:Sup3rS3cret'));
    const r = await callTool('execute_query', { sql: 'SELECT 1' });
    expect(r.content[0].text).not.toContain('Sup3rS3cret');
  });
});

describe('execute_write', () => {
  it('refuses on a read-only connection', async () => {
    installFakes({ DATABASE_URL: 'postgres://u:p@h/d' });
    const r = await handleExecuteWrite({ sql: 'DELETE FROM t WHERE id = 1', confirm: true });
    expect(r.isError).toBe(true);
    expect(parse(r).error).toMatch(/read-only/);
  });

  it('without confirm: postgres dry run executes in a rolled-back write session', async () => {
    const fakes = installFakes({ DATABASE_URL: 'postgres://u:p@h/d', DATABASE_ALLOW_WRITES: 'true' }, () => ({ affectedRows: 3 }));
    const r = parse(await handleExecuteWrite({ sql: 'UPDATE t SET a = 1 WHERE b = 2' }));
    expect(r.dryRun).toBe(true);
    expect(r.results[0].affectedRows).toBe(3);
    const s = fakes.get('default')!.sessions[0];
    expect(s.mode).toBe('write');
    expect(s.opts.commit).toBe(false);
  });

  it('without confirm: mysql dry run does NOT execute, only EXPLAINs DML', async () => {
    const fakes = installFakes({ DATABASE_URL: 'mysql://u:p@h/d', DATABASE_ALLOW_WRITES: 'true' }, () => ({ rows: [{ id: 1 }] }));
    const r = parse(await handleExecuteWrite({ sql: 'DELETE FROM t WHERE id = 1; DROP TABLE x' }));
    expect(r.executed).toBe(false);
    const sent = fakes.get('default')!.allQueries.map((q) => q.sql);
    expect(sent).toEqual(['EXPLAIN DELETE FROM t WHERE id = 1']);
    expect(fakes.get('default')!.sessions[0].mode).toBe('read');
  });

  it('confirm:true commits all statements in one write session', async () => {
    const fakes = installFakes({ DATABASE_URL: 'postgres://u:p@h/d', DATABASE_ALLOW_WRITES: 'true' }, () => ({ affectedRows: 1 }));
    const r = parse(await handleExecuteWrite({ sql: 'INSERT INTO t VALUES (1); INSERT INTO t VALUES (2);', confirm: true }));
    expect(r.committed).toBe(true);
    expect(fakes.get('default')!.sessions).toHaveLength(1);
    expect(fakes.get('default')!.allQueries).toHaveLength(2);
  });

  it('refuses transaction control, which would make a dry run permanent', async () => {
    const fakes = installFakes({ DATABASE_URL: 'postgres://u:p@h/d', DATABASE_ALLOW_WRITES: 'true' });
    const r = await handleExecuteWrite({ sql: 'DELETE FROM t WHERE id = 1; COMMIT; DELETE FROM u WHERE id = 2' });
    expect(parse(r).error).toMatch(/Transaction control/);
    expect(fakes.get('default')?.sessions.length ?? 0).toBe(0);
    const q = await handleExecuteQuery({ sql: 'COMMIT' });
    expect(parse(q).error).toMatch(/Transaction control/);
  });

  it('flags destructive statements', () => {
    expect(classifyStatement('DELETE FROM users', 'postgres').destructive).toBe(true);
    expect(classifyStatement('DELETE FROM users WHERE id IN (SELECT id FROM x WHERE y)', 'postgres').destructive).toBe(false);
    expect(classifyStatement('UPDATE t SET a = (SELECT 1 WHERE true)', 'postgres').destructive).toBe(true);
    expect(classifyStatement('DROP TABLE t', 'postgres').destructive).toBe(true);
    expect(classifyStatement('ALTER TABLE t DROP COLUMN c', 'postgres').destructive).toBe(true);
    expect(classifyStatement('TRUNCATE t', 'mysql').destructive).toBe(true);
  });
});

describe('explain_query', () => {
  it('old defect: analyze defaults to false, so the query is not executed', async () => {
    const fakes = installFakes({ DATABASE_URL: 'postgres://u:p@h/d' }, () => ({
      rows: [{ 'QUERY PLAN': [{ Plan: { 'Node Type': 'Seq Scan', 'Relation Name': 't', 'Plan Rows': 5 } }] }],
    }));
    const r = parse(await handleExplainQuery({ sql: 'SELECT * FROM t' }));
    const sent = fakes.get('default')!.allQueries[0].sql;
    expect(sent).toBe('EXPLAIN (FORMAT JSON) SELECT * FROM t');
    expect(r.analyzed).toBe(false);
    expect(r.summary.fullScans[0].table).toBe('t');
  });

  it('analyze:true adds ANALYZE, BUFFERS inside a read-only session', async () => {
    const fakes = installFakes({ DATABASE_URL: 'postgres://u:p@h/d' }, () => ({ rows: [{ 'QUERY PLAN': [{ Plan: {} }] }] }));
    await handleExplainQuery({ sql: 'SELECT 1', analyze: true });
    expect(fakes.get('default')!.allQueries[0].sql).toMatch(/^EXPLAIN \(FORMAT JSON, ANALYZE, BUFFERS\)/);
    expect(fakes.get('default')!.sessions[0].mode).toBe('read');
  });

  it('SQLite refuses analyze with a clear error', async () => {
    installFakes({ DATABASE_URL: 'sqlite::memory:' });
    const r = await callTool('explain_query', { sql: 'SELECT 1', analyze: true });
    expect(parse(r).error).toMatch(/SQLite has no EXPLAIN ANALYZE/);
  });

  it('summarises misestimates, spills and big sequential scans', () => {
    const s = summarizePostgresPlan([
      {
        'Execution Time': 250,
        Plan: {
          'Node Type': 'Sort',
          'Sort Space Type': 'Disk',
          'Sort Space Used': 9000,
          Plans: [{ 'Node Type': 'Seq Scan', 'Relation Name': 'orders', 'Plan Rows': 100, 'Actual Rows': 50000, 'Actual Loops': 1 }],
        },
      },
    ]);
    expect(s.executionTimeMs).toBe(250);
    expect(s.misestimates).toHaveLength(1);
    expect(s.warnings.join(' ')).toMatch(/spilled to disk/);
    expect(s.warnings.join(' ')).toMatch(/Sequential scan on orders/);
  });
});
