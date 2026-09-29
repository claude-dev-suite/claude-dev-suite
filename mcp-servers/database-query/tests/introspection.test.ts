// SPDX-License-Identifier: MIT
/**
 * Introspection query shape (schema filters, OID joins) and pure helpers.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { normalizeMysqlDefault } from '../src/introspect/mysql.js';
import { extractChecks } from '../src/introspect/sqlite.js';
import { arr } from '../src/introspect/types.js';
import { handleDescribeTable, handleListTables, handleListObjects } from '../src/handlers/schema.js';
import { installFakes, parse, resetFakes } from './helpers.js';

afterEach(resetFakes);

describe('postgres introspection queries', () => {
  it('old defect: every catalog query is filtered by schema (no bare table-name joins)', async () => {
    const fakes = installFakes({ DATABASE_URL: 'postgres://u@h/d' }, (sql) => {
      if (/server_version_num/.test(sql)) return { rows: [{ v: 160000 }] };
      if (/FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace\s+WHERE n.nspname = \$1 AND c.relkind IN/.test(sql))
        return { rows: [{ oid: 1, name: 'orders', relkind: 'r', comment: null, view_def: null }] };
      if (/FROM pg_constraint con/.test(sql))
        return {
          rows: [
            { table_name: 'orders', name: 'orders_fk', type: 'f', definition: 'FOREIGN KEY …', columns: ['a', 'b'], ref_schema: 'sales', ref_table: 'x', ref_columns: ['a', 'b'], on_update: 'a', on_delete: 'c' },
          ],
        };
      return { rows: [] };
    });
    const r = parse(await handleDescribeTable({ table: 'orders', schema: 'sales' }));
    expect(r.foreignKeys[0]).toMatchObject({ columns: ['a', 'b'], refColumns: ['a', 'b'], onDelete: 'CASCADE' });
    const sqls = fakes.get('default')!.allQueries.filter((q) => /pg_class|pg_constraint|pg_index|pg_trigger|pg_attribute/.test(q.sql));
    expect(sqls.length).toBeGreaterThanOrEqual(5);
    for (const q of sqls) {
      expect(q.sql).toMatch(/n\.nspname = \$1/);
      expect(q.params[0]).toBe('sales');
    }
  });

  it('reports a missing table as an error, not an empty definition', async () => {
    installFakes({ DATABASE_URL: 'postgres://u@h/d' }, (sql) => (/current_schema/.test(sql) ? { rows: [{ s: 'public' }] } : { rows: [] }));
    const r = await handleDescribeTable({ table: 'nope' });
    expect(r.isError).toBe(true);
    expect(parse(r).error).toMatch(/not found in schema "public"/);
  });

  it('list_tables marks truncation', async () => {
    installFakes({ DATABASE_URL: 'postgres://u@h/d' }, (sql) =>
      /FROM pg_class c/.test(sql)
        ? { rows: Array.from({ length: 5 }, (_, i) => ({ schema: 'public', name: `t${i}`, relkind: 'r' })) }
        : /current_schema/.test(sql)
          ? { rows: [{ s: 'public' }] }
          : { rows: [] }
    );
    const r = parse(await handleListTables({ limit: 2 }));
    expect(r.count).toBe(2);
    expect(r.total).toBe(5);
    expect(r.truncated).toBe(true);
  });

  it('unsupported object kinds are an explicit error per engine', async () => {
    installFakes({ DATABASE_URL: 'sqlite::memory:' });
    const r = await handleListObjects({ kind: 'function' });
    expect(parse(r).error).toMatch(/not supported on SQLite/);
  });
});

describe('helpers', () => {
  it('normalizeMysqlDefault turns information_schema defaults into SQL expressions', () => {
    expect(normalizeMysqlDefault('abc', 'varchar(10)', '', false)).toBe("'abc'");
    expect(normalizeMysqlDefault('0', 'int', '', false)).toBe('0');
    expect(normalizeMysqlDefault('CURRENT_TIMESTAMP', 'timestamp', 'DEFAULT_GENERATED', false)).toBe('CURRENT_TIMESTAMP');
    expect(normalizeMysqlDefault('(uuid())', 'char(36)', 'DEFAULT_GENERATED', false)).toBe('((uuid()))');
    expect(normalizeMysqlDefault("'abc'", 'varchar(10)', '', true)).toBe("'abc'");
    expect(normalizeMysqlDefault('NULL', 'varchar(10)', '', true)).toBeNull();
    expect(normalizeMysqlDefault(null, 'int', '', false)).toBeNull();
  });

  it('extractChecks reads named and unnamed CHECK clauses from SQLite DDL', () => {
    const c = extractChecks(`CREATE TABLE t (a INT CHECK (a > 0), b TEXT, CONSTRAINT b_chk CHECK (length(b) < 10 AND b <> ')'))`);
    expect(c).toEqual([
      { name: 'check_1', expression: 'CHECK (a > 0)' },
      { name: 'b_chk', expression: "CHECK (length(b) < 10 AND b <> ')')" },
    ]);
  });

  it('arr parses both driver-parsed arrays and array literals', () => {
    expect(arr(['a'])).toEqual(['a']);
    expect(arr('{a,"b c"}')).toEqual(['a', 'b c']);
    expect(arr(null)).toEqual([]);
  });
});
