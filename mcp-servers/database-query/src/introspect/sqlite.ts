// SPDX-License-Identifier: MIT
/**
 * SQLite introspection via sqlite_schema and the table-valued pragma
 * functions (pragma_table_xinfo, pragma_foreign_key_list, pragma_index_list,
 * pragma_index_xinfo). A "schema" is an attached database name ("main").
 */

import type { Session } from "../drivers/types.js";
import { quoteIdent, tokenize } from "../sql-lexer.js";
import {
  type CheckDef,
  type ColumnDef,
  type Introspector,
  type ObjectKind,
  type RelationSummary,
  type SearchHit,
  type TableDef,
  bool,
  num,
  str,
} from "./types.js";

function master(schema: string): string {
  return `${quoteIdent(schema, "sqlite")}.sqlite_master`;
}

/** Extract CHECK (...) clauses (with optional CONSTRAINT name) from CREATE TABLE sql. */
export function extractChecks(createSql: string | null): CheckDef[] {
  if (!createSql) return [];
  const toks = tokenize(createSql, "sqlite").filter((t) => t.type !== "ws" && t.type !== "comment");
  const out: CheckDef[] = [];
  for (let i = 0; i < toks.length; i++) {
    if (toks[i].type === "word" && toks[i].text.toUpperCase() === "CHECK" && toks[i + 1]?.text === "(") {
      const open = toks[i + 1];
      let j = i + 2;
      while (j < toks.length && !(toks[j].text === ")" && toks[j].depth === open.depth)) j++;
      if (j >= toks.length) break;
      const expr = createSql.slice(open.start + 1, toks[j].start).trim();
      let name = `check_${out.length + 1}`;
      if (i >= 2 && toks[i - 2].type !== "punct" && toks[i - 2].text.toUpperCase() === "CONSTRAINT") {
        name = toks[i - 1].text.replace(/^["`[]|["`\]]$/g, "");
      }
      out.push({ name, expression: `CHECK (${expr})` });
      i = j;
    }
  }
  return out;
}

const FK_ACTIONS = new Set(["NO ACTION", "RESTRICT", "CASCADE", "SET NULL", "SET DEFAULT"]);

export const sqliteIntrospector: Introspector = {
  supportedObjectKinds: ["trigger", "view", "index"],

  async defaultSchema() {
    return "main";
  },

  async listSchemas(s) {
    const r = await s.query("SELECT name AS schema, file FROM pragma_database_list ORDER BY seq");
    return r.rows;
  },

  async listRelations(s, schema, kinds) {
    const types: string[] = [];
    if (kinds.includes("table")) types.push("table");
    if (kinds.includes("view")) types.push("view");
    if (!types.length) return [];
    const r = await s.query(
      `SELECT name, type FROM ${master(schema)}
        WHERE type IN (${types.map(() => "?").join(",")}) AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\'
        ORDER BY name`,
      types
    );
    const out: RelationSummary[] = [];
    for (const row of r.rows) {
      const c = await s.query("SELECT count(*) AS n FROM pragma_table_xinfo(?, ?)", [row.name, schema]);
      out.push({
        schema,
        name: String(row.name),
        kind: row.type === "view" ? "view" : "table",
        rowEstimate: null,
        totalBytes: null,
        columnCount: num(c.rows[0]?.n),
        comment: null,
      });
    }
    // sqlite_stat1 gives a row estimate when ANALYZE has been run.
    try {
      const st = await s.query(`SELECT tbl, stat FROM ${quoteIdent(schema, "sqlite")}.sqlite_stat1 WHERE idx IS NULL OR idx = tbl`);
      for (const row of st.rows) {
        const rel = out.find((o) => o.name === row.tbl);
        if (rel) rel.rowEstimate = num(String(row.stat).split(" ")[0]);
      }
    } catch {
      /* no sqlite_stat1 — ANALYZE never run */
    }
    // dbstat (compile-time optional) gives sizes.
    try {
      const sz = await s.query("SELECT name, SUM(pgsize) AS bytes FROM dbstat WHERE schema = ? GROUP BY name", [schema]);
      for (const row of sz.rows) {
        const rel = out.find((o) => o.name === row.name);
        if (rel) rel.totalBytes = num(row.bytes);
      }
    } catch {
      /* dbstat not compiled in */
    }
    return out;
  },

  async tables(s, schema, names) {
    const filter = names && names.length ? ` AND name IN (${names.map(() => "?").join(",")})` : "";
    const rels = await s.query(
      `SELECT name, type, sql FROM ${master(schema)}
        WHERE type IN ('table','view') AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\'${filter} ORDER BY name`,
      names ?? []
    );
    const tables: TableDef[] = [];
    for (const rel of rels.rows) {
      const name = String(rel.name);
      const createSql = str(rel.sql);
      const t: TableDef = {
        schema,
        name,
        kind: rel.type === "view" ? "view" : "table",
        comment: null,
        columns: [],
        primaryKey: null,
        foreignKeys: [],
        uniqueConstraints: [],
        checkConstraints: rel.type === "table" ? extractChecks(createSql) : [],
        indexes: [],
        triggers: [],
        createSql,
        viewDefinition: rel.type === "view" ? createSql : null,
      };
      const autoinc = !!createSql && /\bAUTOINCREMENT\b/i.test(createSql);
      const cols = await s.query("SELECT cid, name, type, \"notnull\" AS nn, dflt_value, pk, hidden FROM pragma_table_xinfo(?, ?)", [name, schema]);
      const pkCols: Array<{ name: string; pk: number }> = [];
      for (const c of cols.rows) {
        const hidden = Number(c.hidden ?? 0);
        if (hidden === 1) continue; // virtual-table hidden column
        const col: ColumnDef = {
          name: String(c.name),
          position: Number(c.cid) + 1,
          type: String(c.type ?? ""),
          nullable: !bool(c.nn) && Number(c.pk) === 0,
          default: str(c.dflt_value),
          identity: null,
          generated: hidden === 2 || hidden === 3 ? `(generated ${hidden === 3 ? "STORED" : "VIRTUAL"})` : null,
          comment: null,
        };
        if (Number(c.pk) > 0) {
          pkCols.push({ name: col.name, pk: Number(c.pk) });
          if (autoinc && /^integer$/i.test(col.type)) col.autoIncrement = true;
        }
        t.columns.push(col);
      }
      if (pkCols.length) t.primaryKey = { name: "PRIMARY", columns: pkCols.sort((a, b) => a.pk - b.pk).map((c) => c.name) };

      if (t.kind === "table") {
        const fks = await s.query('SELECT id, seq, "table" AS ref_table, "from" AS col, "to" AS ref_col, on_update, on_delete FROM pragma_foreign_key_list(?, ?) ORDER BY id, seq', [name, schema]);
        for (const f of fks.rows) {
          const id = `fk_${name}_${f.id}`;
          let fk = t.foreignKeys.find((x) => x.name === id);
          if (!fk) {
            const up = String(f.on_update ?? "NO ACTION").toUpperCase();
            const del = String(f.on_delete ?? "NO ACTION").toUpperCase();
            fk = {
              name: id,
              columns: [],
              refSchema: schema,
              refTable: String(f.ref_table),
              refColumns: [],
              onUpdate: FK_ACTIONS.has(up) ? up : "NO ACTION",
              onDelete: FK_ACTIONS.has(del) ? del : "NO ACTION",
            };
            t.foreignKeys.push(fk);
          }
          fk.columns.push(String(f.col));
          // NULL "to" means "the parent's primary key"
          fk.refColumns.push(f.ref_col === null ? "(primary key)" : String(f.ref_col));
        }

        const idxs = await s.query('SELECT name, "unique" AS is_unique, origin, partial FROM pragma_index_list(?, ?)', [name, schema]);
        for (const ix of idxs.rows) {
          const ixName = String(ix.name);
          const info = await s.query('SELECT seqno, cid, name, "key" AS is_key FROM pragma_index_xinfo(?, ?) ORDER BY seqno', [ixName, schema]);
          const columns = info.rows.filter((r) => bool(r.is_key)).map((r) => (r.name === null ? "(expression)" : String(r.name)));
          const sqlRow = await s.query(`SELECT sql FROM ${master(schema)} WHERE type = 'index' AND name = ?`, [ixName]);
          const definition = str(sqlRow.rows[0]?.sql);
          const origin = String(ix.origin);
          t.indexes.push({
            name: ixName,
            columns,
            unique: bool(ix.is_unique),
            primary: origin === "pk",
            method: null,
            predicate: bool(ix.partial) && definition ? (definition.match(/\bWHERE\b([\s\S]*)$/i)?.[1]?.trim() ?? null) : null,
            definition,
            constraintBacked: origin === "pk" || origin === "u",
          });
          if (origin === "u") t.uniqueConstraints.push({ name: ixName, columns });
        }
      }

      const trg = await s.query(`SELECT name, sql FROM ${master(schema)} WHERE type = 'trigger' AND tbl_name = ?`, [name]);
      for (const tr of trg.rows) t.triggers.push({ name: String(tr.name), table: name, definition: str(tr.sql) });
      tables.push(t);
    }
    return { tables, unavailable: [] };
  },

  async snapshot(s, schema, names) {
    const { tables, unavailable } = await this.tables(s, schema, names);
    return { engine: "sqlite", schema, tables, enums: [], sequences: [], unavailable };
  },

  async listObjects(s, schema, kind: ObjectKind) {
    const type = kind === "view" ? "view" : kind === "trigger" ? "trigger" : kind === "index" ? "index" : null;
    if (!type) return [];
    const r = await s.query(
      `SELECT name, tbl_name AS "table", sql AS definition FROM ${master(schema)} WHERE type = ? ORDER BY tbl_name, name`,
      [type]
    );
    return r.rows;
  },

  async search(s, pattern, schema, limit) {
    const like = `%${pattern.replace(/[\\%_]/g, (m) => "\\" + m)}%`;
    const schemas = schema ? [schema] : (await s.query("SELECT name FROM pragma_database_list")).rows.map((r) => String(r.name));
    const hits: SearchHit[] = [];
    for (const sc of schemas) {
      const objs = await s.query(
        `SELECT type, name, tbl_name FROM ${master(sc)} WHERE name LIKE ? ESCAPE '\\' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' LIMIT ${limit}`,
        [like]
      );
      for (const o of objs.rows)
        hits.push({ kind: String(o.type), schema: sc, name: String(o.name), ...(o.type !== "table" && o.type !== "view" ? { table: String(o.tbl_name) } : {}) });
      const cols = await s.query(
        `SELECT m.name AS table_name, c.name AS col, c.type AS type
           FROM ${master(sc)} m, pragma_table_xinfo(m.name, ?) c
          WHERE m.type IN ('table','view') AND c.name LIKE ? ESCAPE '\\' LIMIT ${limit}`,
        [sc, like]
      );
      for (const c of cols.rows) hits.push({ kind: "column", schema: sc, name: String(c.col), table: String(c.table_name), detail: str(c.type) });
    }
    return hits;
  },
};
