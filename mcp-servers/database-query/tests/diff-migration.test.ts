// SPDX-License-Identifier: MIT
/**
 * Schema diff + migration generation from snapshot fixtures (no database).
 */

import { describe, it, expect } from 'vitest';
import { diffSnapshots, describeDiff, isEmptyDiff } from '../src/diff.js';
import { buildMigration } from '../src/migration.js';
import type { ColumnDef, SchemaSnapshot, TableDef } from '../src/introspect/types.js';

const col = (name: string, type: string, extra: Partial<ColumnDef> = {}, position = 1): ColumnDef => ({
  name,
  position,
  type,
  nullable: true,
  default: null,
  identity: null,
  generated: null,
  comment: null,
  ...extra,
});

const table = (name: string, columns: ColumnDef[], extra: Partial<TableDef> = {}): TableDef => ({
  schema: 'public',
  name,
  kind: 'table',
  comment: null,
  columns: columns.map((c, i) => ({ ...c, position: i + 1 })),
  primaryKey: null,
  foreignKeys: [],
  uniqueConstraints: [],
  checkConstraints: [],
  indexes: [],
  triggers: [],
  ...extra,
});

const snap = (tables: TableDef[], extra: Partial<SchemaSnapshot> = {}): SchemaSnapshot => ({
  engine: 'postgres',
  schema: 'public',
  tables,
  enums: [],
  sequences: [],
  unavailable: [],
  ...extra,
});

const users = () =>
  table('users', [col('id', 'bigint', { nullable: false, identity: 'ALWAYS' }), col('email', 'character varying(255)', { nullable: false })], {
    primaryKey: { name: 'users_pkey', columns: ['id'] },
    indexes: [
      { name: 'users_pkey', columns: ['id'], unique: true, primary: true, method: 'btree', predicate: null, definition: 'CREATE UNIQUE INDEX users_pkey ON public.users USING btree (id)', constraintBacked: true },
    ],
  });

describe('diffSnapshots', () => {
  it('identical snapshots produce an empty diff', () => {
    expect(isEmptyDiff(diffSnapshots(snap([users()]), snap([users()])))).toBe(true);
  });

  it('matches indexes by content, not by name', () => {
    const a = users();
    const b = users();
    a.indexes.push({ name: 'idx_a', columns: ['email'], unique: false, primary: false, method: 'btree', predicate: null, definition: null, constraintBacked: false });
    b.indexes.push({ name: 'users_email_idx', columns: ['email'], unique: false, primary: false, method: 'btree', predicate: null, definition: null, constraintBacked: false });
    expect(isEmptyDiff(diffSnapshots(snap([a]), snap([b])))).toBe(true);
  });

  it('old defect: compares indexes, constraints and nullability, not just column types', () => {
    const a = users();
    const b = users();
    b.columns[1].nullable = true;
    b.checkConstraints.push({ name: 'email_chk', expression: "CHECK (email ~~ '%@%')" });
    b.indexes.push({ name: 'idx_email', columns: ['email'], unique: true, primary: false, method: 'btree', predicate: null, definition: null, constraintBacked: false });
    const d = describeDiff(diffSnapshots(snap([a]), snap([b])));
    const t = d.tablesChanged[0];
    expect(t.columnsChanged![0].changes).toEqual(['nullable']);
    expect(t.checkConstraints!.onlyInTarget[0]).toMatch(/email_chk/);
    expect(t.indexes!.onlyInTarget[0]).toMatch(/idx_email/);
  });

  it('compares across differently named schemas without false positives', () => {
    const a = users();
    const b = { ...users(), schema: 'app' };
    b.columns[0] = col('id', 'bigint', { nullable: false, default: "nextval('app.users_id_seq'::regclass)" });
    a.columns[0] = col('id', 'bigint', { nullable: false, default: "nextval('public.users_id_seq'::regclass)" });
    const d = diffSnapshots(snap([a]), snap([b], { schema: 'app' }));
    expect(isEmptyDiff(d)).toBe(true);
  });
});

describe('postgres migration', () => {
  const source = () => snap([users()]);
  const target = () => {
    const u = users();
    u.columns.push(col('status', 'order_status', { nullable: false, default: "'new'::order_status" }));
    u.columns.push(col('tags', 'text[]'));
    u.columns.push(col('price', 'numeric(10,0)'));
    const orgs = table('orgs', [col('id', 'integer', { nullable: false }), col('region', 'text', { nullable: false })], {
      primaryKey: { name: 'orgs_pkey', columns: ['id', 'region'] },
    });
    const members = table('members', [col('org_id', 'integer'), col('org_region', 'text')], {
      foreignKeys: [
        { name: 'members_org_fkey', columns: ['org_id', 'org_region'], refSchema: 'public', refTable: 'orgs', refColumns: ['id', 'region'], onUpdate: 'NO ACTION', onDelete: 'CASCADE' },
      ],
    });
    return snap([u, orgs, members], { enums: [{ schema: 'public', name: 'order_status', values: ['new', 'paid'] }] });
  };

  it('old defects: real types (no USER-DEFINED/ARRAY), numeric scale 0 kept, enums/PK/composite FK emitted', () => {
    const { up } = buildMigration('postgres', source(), target(), { includeDrops: false });
    const sql = up.statements.join('\n');
    expect(sql).not.toMatch(/USER-DEFINED|\bARRAY\b/);
    expect(sql).toContain(`CREATE TYPE "public"."order_status" AS ENUM ('new', 'paid');`);
    expect(sql).toContain('"tags" text[]');
    expect(sql).toContain('"price" numeric(10,0)');
    expect(sql).toContain('CONSTRAINT "orgs_pkey" PRIMARY KEY ("id", "region")');
    expect(sql).toContain(
      'ALTER TABLE "public"."members" ADD CONSTRAINT "members_org_fkey" FOREIGN KEY ("org_id", "org_region") REFERENCES "public"."orgs" ("id", "region") ON DELETE CASCADE;'
    );
    // the enum is created before the column that uses it
    expect(sql.indexOf('CREATE TYPE')).toBeLessThan(sql.indexOf('ADD COLUMN "status"'));
    // FKs come after both tables exist
    expect(sql.indexOf('CREATE TABLE "public"."orgs"')).toBeLessThan(sql.indexOf('FOREIGN KEY'));
    expect(up.warnings.join(' ')).not.toMatch(/NOT NULL without a default/);
  });

  it('old defect: includeDrops=false emits no DROP in either direction', () => {
    const { up, down } = buildMigration('postgres', source(), target(), { includeDrops: false });
    expect(up.statements.join('\n')).not.toMatch(/\bDROP\b/);
    expect(down.statements.join('\n')).not.toMatch(/\bDROP (TABLE|TYPE|COLUMN|INDEX)/);
  });

  it('includeDrops=true: down drops what up created', () => {
    const { down } = buildMigration('postgres', source(), target(), { includeDrops: true });
    const sql = down.statements.join('\n');
    expect(sql).toContain('DROP TABLE IF EXISTS "public"."orgs"');
    expect(sql).toContain('ALTER TABLE "public"."users" DROP COLUMN IF EXISTS "status"');
    expect(sql).toContain('DROP TYPE IF EXISTS "public"."order_status"');
  });

  it('old defect: type changes carry a USING cast', () => {
    const a = snap([table('t', [col('n', 'integer')])]);
    const b = snap([table('t', [col('n', 'bigint')])]);
    const sql = buildMigration('postgres', a, b, { includeDrops: false }).up.statements.join('\n');
    expect(sql).toContain('ALTER TABLE "public"."t" ALTER COLUMN "n" TYPE bigint USING "n"::bigint;');
  });

  it('adds enum values in place and warns about removals', () => {
    const a = snap([], { enums: [{ schema: 'public', name: 's', values: ['a', 'c'] }] });
    const b = snap([], { enums: [{ schema: 'public', name: 's', values: ['a', 'b', 'c'] }] });
    const { up, down } = buildMigration('postgres', a, b, { includeDrops: false });
    expect(up.statements.join('\n')).toContain(`ALTER TYPE "public"."s" ADD VALUE IF NOT EXISTS 'b' AFTER 'a';`);
    expect(down.warnings.join(' ')).toMatch(/cannot be removed/);
  });

  it('re-points index definitions at the migrated schema', () => {
    const a = snap([table('t', [col('a', 'int')])]);
    const tt = table('t', [col('a', 'int')], { schema: 'staging' });
    tt.indexes.push({ name: 'ix', columns: ['a'], unique: false, primary: false, method: 'btree', predicate: null, definition: 'CREATE INDEX ix ON staging.t USING btree (a)', constraintBacked: false });
    const b = snap([tt], { schema: 'staging' });
    const sql = buildMigration('postgres', a, b, { includeDrops: false }).up.statements.join('\n');
    expect(sql).toContain('CREATE INDEX "ix" ON "public"."t" USING btree (a);');
  });
});

describe('mysql / sqlite migration (best effort)', () => {
  it('mysql: MODIFY COLUMN carries the full definition and warns it is best effort', () => {
    const a = snap([table('t', [col('n', 'int', { nullable: false })])], { engine: 'mysql', schema: 'app' });
    const b = snap([table('t', [col('n', 'bigint unsigned', { nullable: false, default: '0' })])], { engine: 'mysql', schema: 'app' });
    const m = buildMigration('mysql', a, b, { includeDrops: false });
    expect(m.up.statements.join('\n')).toContain('ALTER TABLE `app`.`t` MODIFY COLUMN `n` bigint unsigned NOT NULL DEFAULT 0;');
    expect(m.up.warnings[0]).toMatch(/best effort/);
  });

  it('sqlite: constraint/type changes produce a commented-out rebuild recipe', () => {
    const a = snap([table('t', [col('n', 'INTEGER')], { createSql: 'CREATE TABLE t (n INTEGER)' })], { engine: 'sqlite', schema: 'main' });
    const b = snap([table('t', [col('n', 'TEXT')], { createSql: 'CREATE TABLE t (n TEXT)' })], { engine: 'sqlite', schema: 'main' });
    const m = buildMigration('sqlite', a, b, { includeDrops: false });
    const sql = m.up.statements.join('\n');
    expect(sql).toContain('-- TABLE REBUILD REQUIRED for t');
    expect(sql).toContain('-- CREATE TABLE "t__new" (n TEXT);');
    expect(sql.split('\n').filter((l) => l.trim() && !l.startsWith('--'))).toEqual([]);
  });
});
