// SPDX-License-Identifier: MIT
import { describe, it, expect, afterEach } from 'vitest';
import { analyzeIndexes, handleFindSlowQueries, handleHealthCheck } from '../src/handlers/performance.js';
import type { IndexDef, TableDef } from '../src/introspect/types.js';
import { callTool } from '../src/handlers/dispatch.js';
import { installFakes, parse, resetFakes } from './helpers.js';

afterEach(resetFakes);

const ix = (name: string, columns: string[], extra: Partial<IndexDef> = {}): IndexDef => ({
  name,
  columns,
  unique: false,
  primary: false,
  method: 'btree',
  predicate: null,
  definition: null,
  constraintBacked: false,
  ...extra,
});

const t = (name: string, indexes: IndexDef[], fks: Array<{ name: string; columns: string[] }> = []): TableDef => ({
  schema: 'public',
  name,
  kind: 'table',
  comment: null,
  columns: [],
  primaryKey: null,
  foreignKeys: fks.map((f) => ({ ...f, refSchema: 'public', refTable: 'x', refColumns: f.columns, onUpdate: 'NO ACTION', onDelete: 'NO ACTION' })),
  uniqueConstraints: [],
  checkConstraints: [],
  indexes,
  triggers: [],
});

describe('analyzeIndexes', () => {
  it('finds duplicates, redundant prefixes and unindexed foreign keys', () => {
    const r = analyzeIndexes([
      t('a', [ix('a_pkey', ['id'], { unique: true, primary: true, constraintBacked: true }), ix('a_id_dup', ['id']), ix('a_x', ['x']), ix('a_x_y', ['x', 'y'])]),
      t('b', [ix('b_ab', ['org_id', 'user_id'])], [
        { name: 'b_user_fk', columns: ['user_id'] },
        { name: 'b_org_fk', columns: ['org_id'] },
        { name: 'b_both_fk', columns: ['user_id', 'org_id'] },
      ]),
    ]);
    expect(r.duplicates).toEqual([{ table: 'a', drop: 'a_id_dup', keep: 'a_pkey', columns: ['id'] }]);
    expect(r.redundant.map((x) => x.index)).toEqual(['a_x']);
    // user_id is not a leading column of any index; org_id is; (user_id, org_id) is covered in any order
    expect(r.unindexedForeignKeys.map((x) => x.foreignKey)).toEqual(['b_user_fk']);
  });

  it('compares partial indexes only with the same predicate, and skips opaque expression indexes', () => {
    const r = analyzeIndexes([
      t('c', [ix('c1', ['x'], { predicate: 'x > 0' }), ix('c2', ['x']), ix('c3', ['x'], { predicate: 'x  > 0' }), ix('e1', ['(expression)']), ix('e2', ['(expression)'])]),
    ]);
    expect(r.duplicates.map((d) => [d.keep, d.drop])).toEqual([['c1', 'c3']]);
  });
});

describe('find_slow_queries', () => {
  it('old defect: says pg_stat_statements is unavailable (with how-to) instead of pretending', async () => {
    installFakes({ DATABASE_URL: 'postgres://u@h/d' }, (sql) => {
      if (/FROM pg_extension/.test(sql)) return { rows: [] };
      if (/shared_preload_libraries/.test(sql)) return { rows: [{ v: '' }] };
      return { rows: [] };
    });
    const r = parse(await handleFindSlowQueries({}));
    expect(r.statements.status).toBe('unavailable');
    expect(r.statements.howToEnable.join(' ')).toMatch(/shared_preload_libraries/);
    expect(r.tableScanStats.note).toMatch(/heuristic/);
  });

  it('reads pg_stat_statements (PG13+ column names) and applies the table filter to BOTH queries', async () => {
    const fakes = installFakes({ DATABASE_URL: 'postgres://u@h/d' }, (sql) => {
      if (/FROM pg_extension/.test(sql)) return { rows: [{ version: '1.10', schema: 'public' }] };
      if (/FROM pg_attribute WHERE attrelid = to_regclass/.test(sql)) return { rows: [{ attname: 'total_exec_time' }, { attname: 'mean_exec_time' }] };
      if (/pg_stat_statements s/.test(sql)) return { rows: [{ query: 'select * from orders', calls: 3, total_ms: 10 }] };
      return { rows: [] };
    });
    const r = parse(await handleFindSlowQueries({ table: 'orders', orderBy: 'mean_time' }));
    expect(r.statements.status).toBe('ok');
    expect(r.statements.queries).toHaveLength(1);
    const q = fakes.get('default')!.allQueries;
    const stmts = q.find((x) => /pg_stat_statements s/.test(x.sql))!;
    expect(stmts.sql).toMatch(/total_exec_time/);
    expect(stmts.sql).toMatch(/ORDER BY s\.mean_exec_time DESC/);
    expect(stmts.params).toContain('%orders%');
    const scans = q.find((x) => /FROM pg_stat_user_tables/.test(x.sql))!;
    expect(scans.params).toEqual(['orders']);
    // the failing statement was isolated by a savepoint
    expect(q.some((x) => /^SAVEPOINT/.test(x.sql))).toBe(true);
  });

  it('is an explicit "not supported" on SQLite', async () => {
    installFakes({ DATABASE_URL: 'sqlite::memory:' });
    expect(parse(await callTool('find_slow_queries', {})).error).toMatch(/not supported on SQLite/);
  });
});

describe('health_check', () => {
  it('a failing check is "unavailable" and does not poison the others (savepoints)', async () => {
    const fakes = installFakes({ DATABASE_URL: 'postgres://u@h/d' }, (sql) => {
      if (/pg_blocking_pids/.test(sql)) return new Error('permission denied');
      if (/max_connections/.test(sql)) return { rows: [{ total: 95, active: 1, idle_in_transaction: 0, max_connections: 100 }] };
      return { rows: [] };
    });
    const r = parse(await handleHealthCheck({}));
    const byName = Object.fromEntries(r.checks.map((c: { name: string }) => [c.name, c]));
    expect(byName.blocking_locks.status).toBe('unavailable');
    expect(byName.blocking_locks.message).toMatch(/permission denied/);
    expect(byName.connections.status).toBe('critical');
    expect(r.status).toBe('critical');
    const sqls = fakes.get('default')!.allQueries.map((q) => q.sql);
    expect(sqls.filter((s) => /^ROLLBACK TO SAVEPOINT/.test(s))).toHaveLength(1);
  });
});
