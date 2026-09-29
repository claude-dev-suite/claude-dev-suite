// SPDX-License-Identifier: MIT
/**
 * Turn a SchemaDiff into SQL.
 *
 * PostgreSQL is first-class: real types (format_type), identity/generated
 * columns, PK/UNIQUE/CHECK/FK constraints, indexes (pg_get_indexdef), enums,
 * sequences and views, with USING casts on type changes.
 * MySQL/MariaDB and SQLite are best effort and say so in `warnings`.
 *
 * `includeDrops` governs every DROP of an object that exists only on the
 * side being changed — in the up AND the down direction. Replacing a changed
 * constraint/index (drop + add) is not a removal and is always emitted.
 */

import type { Engine } from "./config.js";
import { type SchemaDiff, diffSnapshots } from "./diff.js";
import type { ColumnDef, ForeignKeyDef, IndexDef, SchemaSnapshot, TableDef } from "./introspect/types.js";
import { qualified, quoteIdent, quoteLiteral } from "./sql-lexer.js";

export interface MigrationPart {
  statements: string[];
  warnings: string[];
}

export interface MigrationOptions {
  includeDrops: boolean;
}

/** Rewrite `targetSchema.` qualification in target-side text to the schema being migrated. */
function rebaser(from: string | null, to: string | null): (s: string | null | undefined) => string {
  if (!from || !to || from === to) return (s) => s ?? "";
  const esc = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|[^\\w"\`])("${esc}"|\`${esc}\`|${esc})\\.`, "g");
  const q = /^[a-z_][a-z0-9_]*$/.test(to) ? to : `"${to.replace(/"/g, '""')}"`;
  return (s) => (s ?? "").replace(re, `$1${q}.`);
}

// ---------------------------------------------------------------------------
// PostgreSQL
// ---------------------------------------------------------------------------

function pgColumnDef(c: ColumnDef, rb: (s: string | null | undefined) => string): string {
  let d = `${quoteIdent(c.name, "postgres")} ${rb(c.type)}`;
  if (c.generated) d += ` GENERATED ALWAYS AS (${rb(c.generated)}) STORED`;
  else if (c.identity) d += ` GENERATED ${c.identity} AS IDENTITY`;
  else if (c.default !== null) d += ` DEFAULT ${rb(c.default)}`;
  if (!c.nullable) d += " NOT NULL";
  return d;
}

function pgFk(f: ForeignKeyDef, schema: string, targetSchema: string | null): string {
  const refSchema = f.refSchema && f.refSchema !== targetSchema ? f.refSchema : schema;
  return (
    `CONSTRAINT ${quoteIdent(f.name, "postgres")} FOREIGN KEY (${f.columns.map((c) => quoteIdent(c, "postgres")).join(", ")}) ` +
    `REFERENCES ${qualified(refSchema, f.refTable, "postgres")} (${f.refColumns.map((c) => quoteIdent(c, "postgres")).join(", ")})` +
    (f.onUpdate !== "NO ACTION" ? ` ON UPDATE ${f.onUpdate}` : "") +
    (f.onDelete !== "NO ACTION" ? ` ON DELETE ${f.onDelete}` : "")
  );
}

/** pg_get_indexdef output, re-pointed at the table in the schema being migrated. */
function pgIndexDef(i: IndexDef, schema: string, table: string, rb: (s: string | null | undefined) => string): string {
  if (i.definition) {
    const m = /^(CREATE (?:UNIQUE )?INDEX )("(?:[^"]|"")+"|\S+)( ON (?:ONLY )?)((?:"(?:[^"]|"")+"|[^\s."]+)(?:\.(?:"(?:[^"]|"")+"|[^\s."]+))?)( USING [\s\S]*)$/i.exec(i.definition);
    if (m) return `${m[1]}${quoteIdent(i.name, "postgres")}${m[3]}${qualified(schema, table, "postgres")}${rb(m[5])}`;
  }
  return `CREATE ${i.unique ? "UNIQUE " : ""}INDEX ${quoteIdent(i.name, "postgres")} ON ${qualified(schema, table, "postgres")}${i.method ? ` USING ${i.method}` : ""} (${i.columns.join(", ")})${i.predicate ? ` WHERE ${rb(i.predicate)}` : ""}`;
}

function postgresStatements(d: SchemaDiff, schema: string, opts: MigrationOptions): MigrationPart {
  const S: string[] = [];
  const W: string[] = [];
  const rb = rebaser(d.targetSchema, schema);
  const T = (name: string) => qualified(schema, name, "postgres");
  const Q = (name: string) => quoteIdent(name, "postgres");
  const add = (comment: string, ...stmts: string[]) => {
    S.push(`-- ${comment}`, ...stmts.map((s) => (s.endsWith(";") ? s : s + ";")), "");
  };

  // 1. enums
  for (const e of d.enumsAdded) add(`enum ${e.name}`, `CREATE TYPE ${T(e.name)} AS ENUM (${e.values.map(quoteLiteral).join(", ")})`);
  for (const e of d.enumsChanged) {
    for (const v of e.addedValues) {
      const idx = e.target.values.indexOf(v);
      const prev = e.target.values.slice(0, idx).reverse().find((x) => e.source.values.includes(x) || e.addedValues.indexOf(x) < e.addedValues.indexOf(v));
      add(`enum ${e.name}: add value ${v}`, `ALTER TYPE ${T(e.name)} ADD VALUE IF NOT EXISTS ${quoteLiteral(v)}${prev ? ` AFTER ${quoteLiteral(prev)}` : ""}`);
    }
    if (e.removedValues.length)
      W.push(`Enum ${e.name}: values ${e.removedValues.join(", ")} cannot be removed with ALTER TYPE — recreate the type manually`);
    if (!e.addedValues.length && !e.removedValues.length) W.push(`Enum ${e.name}: value order differs — not changeable in place`);
  }
  if (d.enumsChanged.some((e) => e.addedValues.length))
    W.push("ALTER TYPE … ADD VALUE: before PostgreSQL 12 it cannot run inside a transaction block, and new values cannot be used in the same transaction");

  // 2. sequences
  for (const q of d.sequencesAdded)
    add(
      `sequence ${q.name}`,
      `CREATE SEQUENCE IF NOT EXISTS ${T(q.name)}${q.dataType ? ` AS ${q.dataType}` : ""}${q.increment ? ` INCREMENT BY ${q.increment}` : ""}${q.start ? ` START WITH ${q.start}` : ""}`
    );

  // 3. drops that must precede structural changes
  if (opts.includeDrops) for (const v of d.viewsRemoved) add(`drop ${v.kind.replace("_", " ")} ${v.name}`, `DROP ${v.kind === "materialized_view" ? "MATERIALIZED VIEW" : "VIEW"} IF EXISTS ${T(v.name)}`);
  for (const c of d.tablesChanged) {
    for (const f of c.foreignKeys.removed) {
      const replaced = c.foreignKeys.added.some((a) => a.name === f.name);
      if (replaced || opts.includeDrops) add(`${replaced ? "replace" : "drop"} foreign key ${c.table}.${f.name}`, `ALTER TABLE ${T(c.table)} DROP CONSTRAINT IF EXISTS ${Q(f.name)}`);
    }
  }

  // 4. new tables (FKs added in step 7, so creation order does not matter)
  for (const t of d.tablesAdded) {
    const lines = [...t.columns].sort((a, b) => a.position - b.position).map((c) => "  " + pgColumnDef(c, rb));
    if (t.primaryKey) lines.push(`  CONSTRAINT ${Q(t.primaryKey.name)} PRIMARY KEY (${t.primaryKey.columns.map(Q).join(", ")})`);
    for (const u of t.uniqueConstraints) lines.push(`  CONSTRAINT ${Q(u.name)} UNIQUE (${u.columns.map(Q).join(", ")})`);
    for (const ch of t.checkConstraints) lines.push(`  CONSTRAINT ${Q(ch.name)} ${rb(ch.expression)}`);
    add(`create table ${t.name}`, `CREATE TABLE ${T(t.name)} (\n${lines.join(",\n")}\n)`);
    for (const i of t.indexes.filter((x) => !x.constraintBacked && !x.primary)) add(`index ${i.name}`, pgIndexDef(i, schema, t.name, rb));
    if (t.comment) add(`comment on ${t.name}`, `COMMENT ON TABLE ${T(t.name)} IS ${quoteLiteral(t.comment)}`);
    if (t.triggers.length) W.push(`Table ${t.name}: ${t.triggers.length} trigger(s) not migrated (functions are not diffed): ${t.triggers.map((x) => x.name).join(", ")}`);
  }

  // 5. changed tables
  for (const c of d.tablesChanged) {
    const tn = T(c.table);
    for (const col of c.columnsAdded) {
      add(`add column ${c.table}.${col.name}`, `ALTER TABLE ${tn} ADD COLUMN ${pgColumnDef(col, rb)}`);
      if (!col.nullable && col.default === null && !col.identity && !col.generated)
        W.push(`${c.table}.${col.name}: NOT NULL without a default — fails if ${c.table} has rows`);
    }
    for (const ch of c.columnsChanged) {
      const cn = Q(ch.name);
      const s = ch.source;
      const t = ch.target;
      if (ch.changes.includes("generated") || ch.changes.includes("identity")) {
        W.push(`${c.table}.${ch.name}: identity/generated change needs a manual migration (not emitted)`);
      }
      if (ch.changes.includes("type")) {
        if (s.default !== null && !s.identity) add(`drop default before type change ${c.table}.${ch.name}`, `ALTER TABLE ${tn} ALTER COLUMN ${cn} DROP DEFAULT`);
        add(
          `change type ${c.table}.${ch.name}: ${s.type} -> ${t.type}`,
          `ALTER TABLE ${tn} ALTER COLUMN ${cn} TYPE ${rb(t.type)} USING ${cn}::${rb(t.type)}`
        );
        W.push(`${c.table}.${ch.name}: type change ${s.type} -> ${t.type} rewrites the table and fails if a value cannot be cast`);
      }
      if ((ch.changes.includes("default") || (ch.changes.includes("type") && s.default !== null)) && !t.identity && !t.generated) {
        if (t.default !== null) add(`default ${c.table}.${ch.name}`, `ALTER TABLE ${tn} ALTER COLUMN ${cn} SET DEFAULT ${rb(t.default)}`);
        else if (!ch.changes.includes("type")) add(`drop default ${c.table}.${ch.name}`, `ALTER TABLE ${tn} ALTER COLUMN ${cn} DROP DEFAULT`);
      }
      if (ch.changes.includes("nullable")) {
        if (t.nullable) add(`nullable ${c.table}.${ch.name}`, `ALTER TABLE ${tn} ALTER COLUMN ${cn} DROP NOT NULL`);
        else {
          add(`not null ${c.table}.${ch.name}`, `ALTER TABLE ${tn} ALTER COLUMN ${cn} SET NOT NULL`);
          W.push(`${c.table}.${ch.name}: SET NOT NULL fails if the column contains NULLs`);
        }
      }
    }
    if (c.primaryKey) {
      if (c.primaryKey.source) add(`replace primary key ${c.table}`, `ALTER TABLE ${tn} DROP CONSTRAINT IF EXISTS ${Q(c.primaryKey.source.name)}`);
      if (c.primaryKey.target)
        add(`primary key ${c.table}`, `ALTER TABLE ${tn} ADD CONSTRAINT ${Q(c.primaryKey.target.name)} PRIMARY KEY (${c.primaryKey.target.columns.map(Q).join(", ")})`);
    }
    for (const u of c.uniqueConstraints.removed) {
      const replaced = c.uniqueConstraints.added.some((a) => a.name === u.name);
      if (replaced || opts.includeDrops) add(`${replaced ? "replace" : "drop"} unique ${c.table}.${u.name}`, `ALTER TABLE ${tn} DROP CONSTRAINT IF EXISTS ${Q(u.name)}`);
    }
    for (const u of c.uniqueConstraints.added) add(`unique ${c.table}.${u.name}`, `ALTER TABLE ${tn} ADD CONSTRAINT ${Q(u.name)} UNIQUE (${u.columns.map(Q).join(", ")})`);
    for (const k of c.checkConstraints.removed) {
      const replaced = c.checkConstraints.added.some((a) => a.name === k.name);
      if (replaced || opts.includeDrops) add(`${replaced ? "replace" : "drop"} check ${c.table}.${k.name}`, `ALTER TABLE ${tn} DROP CONSTRAINT IF EXISTS ${Q(k.name)}`);
    }
    for (const k of c.checkConstraints.added) add(`check ${c.table}.${k.name}`, `ALTER TABLE ${tn} ADD CONSTRAINT ${Q(k.name)} ${rb(k.expression)}`);
    if (opts.includeDrops) for (const col of c.columnsRemoved) add(`drop column ${c.table}.${col.name}`, `ALTER TABLE ${tn} DROP COLUMN IF EXISTS ${Q(col.name)}`);

    // 6. indexes
    for (const i of c.indexes.removed) {
      const replaced = c.indexes.added.some((a) => a.name === i.name);
      if (replaced || opts.includeDrops) add(`${replaced ? "replace" : "drop"} index ${i.name}`, `DROP INDEX IF EXISTS ${T(i.name)}`);
    }
    for (const i of c.indexes.added) add(`index ${i.name}`, pgIndexDef(i, schema, c.table, rb));
  }

  // 7. foreign keys (after every table exists)
  for (const t of d.tablesAdded) for (const f of t.foreignKeys) add(`foreign key ${t.name}.${f.name}`, `ALTER TABLE ${T(t.name)} ADD ${pgFk(f, schema, d.targetSchema)}`);
  for (const c of d.tablesChanged) for (const f of c.foreignKeys.added) add(`foreign key ${c.table}.${f.name}`, `ALTER TABLE ${T(c.table)} ADD ${pgFk(f, schema, d.targetSchema)}`);

  // 8. views
  const viewSql = (v: TableDef, replace: boolean) =>
    v.kind === "materialized_view"
      ? `CREATE MATERIALIZED VIEW ${T(v.name)} AS\n${rb(v.viewDefinition).replace(/;\s*$/, "")}`
      : `CREATE ${replace ? "OR REPLACE " : ""}VIEW ${T(v.name)} AS\n${rb(v.viewDefinition).replace(/;\s*$/, "")}`;
  for (const v of d.viewsAdded) add(`create ${v.kind.replace("_", " ")} ${v.name}`, viewSql(v, false));
  for (const { source, target } of d.viewsChanged) {
    if (target.kind === "materialized_view" || source.kind !== target.kind) {
      add(`recreate ${target.name}`, `DROP ${source.kind === "materialized_view" ? "MATERIALIZED VIEW" : "VIEW"} IF EXISTS ${T(source.name)}`, viewSql(target, false));
    } else {
      add(`replace view ${target.name}`, viewSql(target, true));
      W.push(`View ${target.name}: CREATE OR REPLACE fails if columns were removed/renamed/retyped — drop and recreate it instead`);
    }
  }

  // 9. final drops
  if (opts.includeDrops) {
    for (const t of d.tablesRemoved) add(`drop table ${t.name}`, `DROP TABLE IF EXISTS ${T(t.name)}`);
    for (const q of d.sequencesRemoved) add(`drop sequence ${q.name}`, `DROP SEQUENCE IF EXISTS ${T(q.name)}`);
    for (const e of d.enumsRemoved) add(`drop enum ${e.name}`, `DROP TYPE IF EXISTS ${T(e.name)}`);
  } else {
    const skipped =
      d.tablesRemoved.length + d.viewsRemoved.length + d.enumsRemoved.length + d.sequencesRemoved.length +
      d.tablesChanged.reduce(
        (n, c) =>
          n + c.columnsRemoved.length +
          c.indexes.removed.filter((i) => !c.indexes.added.some((a) => a.name === i.name)).length +
          c.foreignKeys.removed.filter((i) => !c.foreignKeys.added.some((a) => a.name === i.name)).length,
        0
      );
    if (skipped) W.push(`${skipped} object(s) exist only on the side being changed and were NOT dropped (includeDrops=false)`);
  }
  return { statements: S, warnings: W };
}

// ---------------------------------------------------------------------------
// MySQL / MariaDB (best effort)
// ---------------------------------------------------------------------------

function myColumnDef(c: ColumnDef, rb: (s: string | null | undefined) => string): string {
  let d = `${quoteIdent(c.name, "mysql")} ${c.type}`;
  if (c.generated) {
    const stored = /STORED/i.test(c.extra ?? "") ? "STORED" : "VIRTUAL";
    d += ` GENERATED ALWAYS AS (${rb(c.generated)}) ${stored}`;
    if (!c.nullable) d += " NOT NULL";
    return d;
  }
  d += c.nullable ? " NULL" : " NOT NULL";
  if (c.default !== null) d += ` DEFAULT ${c.default}`;
  if (c.autoIncrement) d += " AUTO_INCREMENT";
  const extra = (c.extra ?? "").replace(/(VIRTUAL|STORED) GENERATED/i, "").trim();
  if (extra) d += ` ${extra}`;
  if (c.comment) d += ` COMMENT ${quoteLiteral(c.comment)}`;
  return d;
}

const myIdxCols = (i: IndexDef) =>
  i.columns.map((c) => {
    const m = /^(.*)\((\d+)\)$/.exec(c);
    return m ? `${quoteIdent(m[1], "mysql")}(${m[2]})` : quoteIdent(c, "mysql");
  });

function myFk(f: ForeignKeyDef): string {
  return (
    `CONSTRAINT ${quoteIdent(f.name, "mysql")} FOREIGN KEY (${f.columns.map((c) => quoteIdent(c, "mysql")).join(", ")}) ` +
    `REFERENCES ${quoteIdent(f.refTable, "mysql")} (${f.refColumns.map((c) => quoteIdent(c, "mysql")).join(", ")})` +
    ` ON UPDATE ${f.onUpdate} ON DELETE ${f.onDelete}`
  );
}

function mysqlStatements(d: SchemaDiff, schema: string, opts: MigrationOptions): MigrationPart {
  const S: string[] = [];
  const W: string[] = ["MySQL/MariaDB migration is best effort: review column options, charsets/collations and partitioning by hand"];
  const rb = rebaser(d.targetSchema, schema);
  const T = (n: string) => qualified(schema, n, "mysql");
  const Q = (n: string) => quoteIdent(n, "mysql");
  const add = (comment: string, ...stmts: string[]) => S.push(`-- ${comment}`, ...stmts.map((s) => s + ";"), "");

  for (const c of d.tablesChanged)
    for (const f of c.foreignKeys.removed) {
      const replaced = c.foreignKeys.added.some((a) => a.name === f.name);
      if (replaced || opts.includeDrops) add(`${replaced ? "replace" : "drop"} foreign key ${c.table}.${f.name}`, `ALTER TABLE ${T(c.table)} DROP FOREIGN KEY ${Q(f.name)}`);
    }
  if (opts.includeDrops) for (const v of d.viewsRemoved) add(`drop view ${v.name}`, `DROP VIEW IF EXISTS ${T(v.name)}`);

  for (const t of d.tablesAdded) {
    const lines = [...t.columns].sort((a, b) => a.position - b.position).map((c) => "  " + myColumnDef(c, rb));
    if (t.primaryKey) lines.push(`  PRIMARY KEY (${t.primaryKey.columns.map(Q).join(", ")})`);
    for (const i of t.indexes.filter((x) => !x.primary)) lines.push(`  ${i.unique ? "UNIQUE " : ""}KEY ${Q(i.name)} (${myIdxCols(i).join(", ")})`);
    for (const k of t.checkConstraints) lines.push(`  CONSTRAINT ${Q(k.name)} ${rb(k.expression)}`);
    add(`create table ${t.name}`, `CREATE TABLE ${T(t.name)} (\n${lines.join(",\n")}\n)${t.comment ? ` COMMENT=${quoteLiteral(t.comment)}` : ""}`);
  }

  for (const c of d.tablesChanged) {
    const tn = T(c.table);
    for (const col of c.columnsAdded) add(`add column ${c.table}.${col.name}`, `ALTER TABLE ${tn} ADD COLUMN ${myColumnDef(col, rb)}`);
    for (const ch of c.columnsChanged) {
      add(`modify column ${c.table}.${ch.name} (${ch.changes.join(", ")})`, `ALTER TABLE ${tn} MODIFY COLUMN ${myColumnDef(ch.target, rb)}`);
      if (ch.changes.includes("type")) W.push(`${c.table}.${ch.name}: ${ch.source.type} -> ${ch.target.type} may truncate or fail on existing data`);
    }
    if (c.primaryKey) {
      const parts: string[] = [];
      if (c.primaryKey.source) parts.push("DROP PRIMARY KEY");
      if (c.primaryKey.target) parts.push(`ADD PRIMARY KEY (${c.primaryKey.target.columns.map(Q).join(", ")})`);
      add(`primary key ${c.table}`, `ALTER TABLE ${tn} ${parts.join(", ")}`);
    }
    // unique constraints are unique indexes in MySQL; handle with indexes
    const uniqRemoved = c.uniqueConstraints.removed.map((u) => u.name);
    for (const name of uniqRemoved) {
      const replaced = c.uniqueConstraints.added.some((a) => a.name === name);
      if (replaced || opts.includeDrops) add(`${replaced ? "replace" : "drop"} unique ${c.table}.${name}`, `DROP INDEX ${Q(name)} ON ${tn}`);
    }
    for (const u of c.uniqueConstraints.added) add(`unique ${c.table}.${u.name}`, `CREATE UNIQUE INDEX ${Q(u.name)} ON ${tn} (${u.columns.map(Q).join(", ")})`);
    for (const k of c.checkConstraints.removed) {
      const replaced = c.checkConstraints.added.some((a) => a.name === k.name);
      if (replaced || opts.includeDrops) add(`${replaced ? "replace" : "drop"} check ${c.table}.${k.name}`, `ALTER TABLE ${tn} DROP CONSTRAINT ${Q(k.name)}`);
    }
    for (const k of c.checkConstraints.added) add(`check ${c.table}.${k.name}`, `ALTER TABLE ${tn} ADD CONSTRAINT ${Q(k.name)} ${rb(k.expression)}`);
    for (const i of c.indexes.removed) {
      const replaced = c.indexes.added.some((a) => a.name === i.name);
      if (replaced || opts.includeDrops) add(`${replaced ? "replace" : "drop"} index ${i.name}`, `DROP INDEX ${Q(i.name)} ON ${tn}`);
    }
    for (const i of c.indexes.added) add(`index ${i.name}`, `CREATE ${i.unique ? "UNIQUE " : ""}INDEX ${Q(i.name)} ON ${tn} (${myIdxCols(i).join(", ")})`);
    if (opts.includeDrops) for (const col of c.columnsRemoved) add(`drop column ${c.table}.${col.name}`, `ALTER TABLE ${tn} DROP COLUMN ${Q(col.name)}`);
  }
  for (const t of d.tablesAdded) for (const f of t.foreignKeys) add(`foreign key ${t.name}.${f.name}`, `ALTER TABLE ${T(t.name)} ADD ${myFk(f)}`);
  for (const c of d.tablesChanged) for (const f of c.foreignKeys.added) add(`foreign key ${c.table}.${f.name}`, `ALTER TABLE ${T(c.table)} ADD ${myFk(f)}`);
  for (const v of [...d.viewsAdded, ...d.viewsChanged.map((x) => x.target)])
    add(`view ${v.name}`, `CREATE OR REPLACE VIEW ${T(v.name)} AS ${rb(v.viewDefinition)}`);
  if (opts.includeDrops) for (const t of d.tablesRemoved) add(`drop table ${t.name}`, `DROP TABLE IF EXISTS ${T(t.name)}`);
  if (d.tablesAdded.some((t) => t.triggers.length) || d.tablesChanged.some((c) => c.target.triggers.length !== c.source.triggers.length))
    W.push("Triggers are not migrated");
  return { statements: S, warnings: W };
}

// ---------------------------------------------------------------------------
// SQLite (best effort)
// ---------------------------------------------------------------------------

function sqliteStatements(d: SchemaDiff, schema: string, opts: MigrationOptions): MigrationPart {
  const S: string[] = [];
  const W: string[] = ["SQLite migration is best effort: SQLite cannot ALTER a column's type/constraints in place"];
  const Q = (n: string) => quoteIdent(n, "sqlite");
  const T = (n: string) => (schema && schema !== "main" ? qualified(schema, n, "sqlite") : Q(n));
  const add = (comment: string, ...stmts: string[]) => S.push(`-- ${comment}`, ...stmts.map((s) => (s.trim().endsWith(";") ? s : s + ";")), "");

  if (opts.includeDrops) for (const v of d.viewsRemoved) add(`drop view ${v.name}`, `DROP VIEW IF EXISTS ${T(v.name)}`);
  for (const t of d.tablesAdded) {
    if (!t.createSql) {
      W.push(`Table ${t.name}: no CREATE statement available`);
      continue;
    }
    add(`create table ${t.name}`, t.createSql);
    for (const i of t.indexes) if (i.definition) add(`index ${i.name}`, i.definition);
    for (const tr of t.triggers) if (tr.definition) add(`trigger ${tr.name}`, tr.definition);
  }
  for (const c of d.tablesChanged) {
    const tn = T(c.table);
    for (const col of c.columnsAdded) {
      let def = `${Q(col.name)} ${col.type}`;
      if (!col.nullable) def += " NOT NULL";
      if (col.default !== null) def += ` DEFAULT ${col.default}`;
      add(`add column ${c.table}.${col.name}`, `ALTER TABLE ${tn} ADD COLUMN ${def}`);
      if (!col.nullable && col.default === null) W.push(`${c.table}.${col.name}: SQLite cannot ADD a NOT NULL column without a default`);
    }
    const needsRebuild =
      c.columnsChanged.length ||
      c.primaryKey ||
      c.foreignKeys.added.length ||
      c.foreignKeys.removed.length ||
      c.checkConstraints.added.length ||
      c.checkConstraints.removed.length ||
      c.uniqueConstraints.added.length ||
      c.uniqueConstraints.removed.length;
    if (needsRebuild) {
      const common = c.target.columns.filter((x) => c.source.columns.some((y) => y.name === x.name)).map((x) => Q(x.name)).join(", ");
      const body = (c.target.createSql ?? "").replace(/^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?("(?:[^"]|"")+"|`[^`]+`|\[[^\]]+\]|\S+)/i, `CREATE TABLE ${Q(c.table + "__new")}`);
      S.push(
        `-- TABLE REBUILD REQUIRED for ${c.table} (${[
          c.columnsChanged.length ? "column type/nullability/default" : "",
          c.primaryKey ? "primary key" : "",
          c.foreignKeys.added.length || c.foreignKeys.removed.length ? "foreign keys" : "",
          c.checkConstraints.added.length || c.checkConstraints.removed.length ? "checks" : "",
          c.uniqueConstraints.added.length || c.uniqueConstraints.removed.length ? "unique constraints" : "",
        ]
          .filter(Boolean)
          .join(", ")}).`,
        "-- Left commented out on purpose: review, then run OUTSIDE a transaction (PRAGMA foreign_keys cannot change inside one).",
        "-- PRAGMA foreign_keys = OFF;",
        "-- BEGIN;",
        ...body.split("\n").map((l, i, a) => `-- ${l}${i === a.length - 1 ? ";" : ""}`),
        `-- INSERT INTO ${Q(c.table + "__new")} (${common}) SELECT ${common} FROM ${tn};`,
        `-- DROP TABLE ${tn};`,
        `-- ALTER TABLE ${Q(c.table + "__new")} RENAME TO ${Q(c.table)};`,
        ...c.target.indexes.filter((i) => i.definition).map((i) => `-- ${i.definition};`),
        ...c.target.triggers.filter((t) => t.definition).map((t) => `-- ${String(t.definition).replace(/\n/g, "\n-- ")};`),
        "-- PRAGMA foreign_key_check;",
        "-- COMMIT;",
        "-- PRAGMA foreign_keys = ON;",
        ""
      );
      W.push(`Table ${c.table} needs a rebuild; the recipe is emitted commented out for review`);
    }
    for (const i of c.indexes.removed) {
      const replaced = c.indexes.added.some((a) => a.name === i.name);
      if (replaced || opts.includeDrops) add(`${replaced ? "replace" : "drop"} index ${i.name}`, `DROP INDEX IF EXISTS ${T(i.name)}`);
    }
    for (const i of c.indexes.added) {
      if (i.definition) add(`index ${i.name}`, i.definition);
      else W.push(`Index ${i.name}: no definition available`);
    }
    if (opts.includeDrops)
      for (const col of c.columnsRemoved) {
        add(`drop column ${c.table}.${col.name} (SQLite >= 3.35)`, `ALTER TABLE ${tn} DROP COLUMN ${Q(col.name)}`);
        W.push(`${c.table}.${col.name}: DROP COLUMN fails if the column is indexed, part of a key/constraint, or used by a view/trigger`);
      }
  }
  for (const v of d.viewsAdded) if (v.viewDefinition) add(`create view ${v.name}`, v.viewDefinition);
  for (const { source, target } of d.viewsChanged)
    if (target.viewDefinition) add(`recreate view ${target.name}`, `DROP VIEW IF EXISTS ${T(source.name)}`, target.viewDefinition);
  if (opts.includeDrops) for (const t of d.tablesRemoved) add(`drop table ${t.name}`, `DROP TABLE IF EXISTS ${T(t.name)}`);
  return { statements: S, warnings: W };
}

export function statementsFor(engine: Engine, d: SchemaDiff, schema: string, opts: MigrationOptions): MigrationPart {
  if (engine === "postgres") return postgresStatements(d, schema, opts);
  if (engine === "mysql") return mysqlStatements(d, schema, opts);
  return sqliteStatements(d, schema, opts);
}

/**
 * Up = source -> target, Down = target -> source, both applied to the
 * source database's schema and both honouring includeDrops.
 */
export function buildMigration(engine: Engine, source: SchemaSnapshot, target: SchemaSnapshot, opts: MigrationOptions) {
  const schema = source.schema ?? "main";
  const upDiff = diffSnapshots(source, target);
  const downDiff = diffSnapshots({ ...target }, { ...source });
  // For the down direction the "target-side" text is the source database's.
  downDiff.sourceSchema = target.schema;
  downDiff.targetSchema = source.schema;
  const up = statementsFor(engine, upDiff, schema, opts);
  const down = statementsFor(engine, downDiff, schema, opts);
  return { upDiff, up, down };
}
