// SPDX-License-Identifier: MIT
/**
 * PostgreSQL introspection from pg_catalog.
 *
 * pg_catalog rather than information_schema because the latter reports
 * `USER-DEFINED` / `ARRAY` instead of real types, hides objects the role does
 * not own, and cannot express composite foreign keys without a cross product.
 * Every query is filtered by schema and joined by OID — never by bare name.
 */

import type { Session } from "../drivers/types.js";
import {
  type ColumnDef,
  type EnumDef,
  FK_ACTION,
  type IndexDef,
  type Introspector,
  type ObjectKind,
  type RelationKind,
  type RelationSummary,
  type SchemaSnapshot,
  type SearchHit,
  type SequenceDef,
  type TableDef,
  arr,
  bool,
  num,
  str,
} from "./types.js";

const KIND_BY_RELKIND: Record<string, RelationKind> = {
  r: "table",
  p: "partitioned_table",
  v: "view",
  m: "materialized_view",
  f: "foreign_table",
};
const RELKIND_BY_KIND: Record<RelationKind, string> = {
  table: "r",
  partitioned_table: "p",
  view: "v",
  materialized_view: "m",
  foreign_table: "f",
};

const versionCache = new WeakMap<Session, number>();
async function versionNum(s: Session): Promise<number> {
  const cached = versionCache.get(s);
  if (cached) return cached;
  const r = await s.query("SELECT current_setting('server_version_num')::int AS v");
  const v = Number(r.rows[0]?.v ?? 0);
  versionCache.set(s, v);
  return v;
}

export const postgresIntrospector: Introspector = {
  supportedObjectKinds: ["enum", "type", "function", "procedure", "trigger", "sequence", "view", "materialized_view", "index", "extension"],

  async defaultSchema(s) {
    const r = await s.query("SELECT current_schema() AS s");
    return str(r.rows[0]?.s) ?? "public";
  },

  async listSchemas(s) {
    const r = await s.query(
      `SELECT n.nspname AS schema, pg_get_userbyid(n.nspowner) AS owner,
              (SELECT count(*) FROM pg_class c WHERE c.relnamespace = n.oid AND c.relkind IN ('r','p'))::int AS tables,
              (SELECT count(*) FROM pg_class c WHERE c.relnamespace = n.oid AND c.relkind IN ('v','m'))::int AS views,
              obj_description(n.oid, 'pg_namespace') AS comment
         FROM pg_namespace n
        WHERE n.nspname NOT LIKE 'pg\\_%' AND n.nspname <> 'information_schema'
        ORDER BY 1`
    );
    return r.rows;
  },

  async listRelations(s, schema, kinds) {
    const relkinds = kinds.map((k) => RELKIND_BY_KIND[k]);
    const r = await s.query(
      `SELECT n.nspname AS schema, c.relname AS name, c.relkind AS relkind,
              CASE WHEN c.relkind IN ('r','p','m') AND c.reltuples >= 0 THEN c.reltuples::bigint END AS row_estimate,
              CASE WHEN c.relkind IN ('r','p','m') THEN pg_total_relation_size(c.oid) END AS total_bytes,
              (SELECT count(*) FROM pg_attribute a WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped)::int AS column_count,
              obj_description(c.oid, 'pg_class') AS comment
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND c.relkind = ANY($2::"char"[])
        ORDER BY c.relname`,
      [schema, relkinds]
    );
    return r.rows.map(
      (row): RelationSummary => ({
        schema: str(row.schema),
        name: String(row.name),
        kind: KIND_BY_RELKIND[String(row.relkind)] ?? "table",
        rowEstimate: num(row.row_estimate),
        totalBytes: num(row.total_bytes),
        columnCount: num(row.column_count),
        comment: str(row.comment),
      })
    );
  },

  async tables(s, schema, names) {
    const v = await versionNum(s);
    const filter = names && names.length ? "AND c.relname = ANY($2::text[])" : "";
    const params: unknown[] = names && names.length ? [schema, names] : [schema];

    const rels = await s.query(
      `SELECT c.oid::bigint AS oid, c.relname AS name, c.relkind AS relkind, obj_description(c.oid, 'pg_class') AS comment,
              CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid, true) END AS view_def
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND c.relkind IN ('r','p','v','m','f') ${filter}
        ORDER BY c.relname`,
      params
    );
    const tables = new Map<string, TableDef>();
    for (const r of rels.rows) {
      tables.set(String(r.name), {
        schema,
        name: String(r.name),
        kind: KIND_BY_RELKIND[String(r.relkind)] ?? "table",
        comment: str(r.comment),
        columns: [],
        primaryKey: null,
        foreignKeys: [],
        uniqueConstraints: [],
        checkConstraints: [],
        indexes: [],
        triggers: [],
        viewDefinition: str(r.view_def),
      });
    }
    if (tables.size === 0) return { tables: [], unavailable: [] };

    const identity = v >= 100000 ? "a.attidentity::text" : "''";
    const generated = v >= 120000 ? "a.attgenerated::text" : "''";
    const cols = await s.query(
      `SELECT c.relname AS table_name, a.attname AS name, a.attnum AS position,
              format_type(a.atttypid, a.atttypmod) AS type,
              NOT a.attnotnull AS nullable,
              pg_get_expr(d.adbin, d.adrelid) AS default_expr,
              ${identity} AS identity, ${generated} AS generated,
              col_description(c.oid, a.attnum) AS comment
         FROM pg_attribute a
         JOIN pg_class c ON c.oid = a.attrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
        WHERE n.nspname = $1 AND c.relkind IN ('r','p','v','m','f') AND a.attnum > 0 AND NOT a.attisdropped ${filter}
        ORDER BY c.relname, a.attnum`,
      params
    );
    for (const r of cols.rows) {
      const t = tables.get(String(r.table_name));
      if (!t) continue;
      const gen = String(r.generated ?? "");
      const idn = String(r.identity ?? "");
      const col: ColumnDef = {
        name: String(r.name),
        position: Number(r.position),
        type: String(r.type),
        nullable: bool(r.nullable),
        default: gen ? null : str(r.default_expr),
        identity: idn === "a" ? "ALWAYS" : idn === "d" ? "BY DEFAULT" : null,
        generated: gen ? str(r.default_expr) : null,
        comment: str(r.comment),
      };
      t.columns.push(col);
    }

    const cons = await s.query(
      `SELECT c.relname AS table_name, con.conname AS name, con.contype::text AS type,
              pg_get_constraintdef(con.oid, true) AS definition,
              ARRAY(SELECT a.attname::text FROM unnest(con.conkey) WITH ORDINALITY k(attnum, ord)
                      JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum ORDER BY k.ord) AS columns,
              fn.nspname AS ref_schema, fc.relname AS ref_table,
              ARRAY(SELECT a.attname::text FROM unnest(con.confkey) WITH ORDINALITY k(attnum, ord)
                      JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.attnum ORDER BY k.ord) AS ref_columns,
              con.confupdtype::text AS on_update, con.confdeltype::text AS on_delete
         FROM pg_constraint con
         JOIN pg_class c ON c.oid = con.conrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         LEFT JOIN pg_class fc ON fc.oid = con.confrelid
         LEFT JOIN pg_namespace fn ON fn.oid = fc.relnamespace
        WHERE n.nspname = $1 AND con.contype IN ('p','u','f','c','x') ${filter}
        ORDER BY c.relname, con.conname`,
      params
    );
    for (const r of cons.rows) {
      const t = tables.get(String(r.table_name));
      if (!t) continue;
      const name = String(r.name);
      const columns = arr(r.columns);
      switch (r.type) {
        case "p":
          t.primaryKey = { name, columns };
          break;
        case "u":
          t.uniqueConstraints.push({ name, columns });
          break;
        case "c":
          t.checkConstraints.push({ name, expression: String(r.definition) });
          break;
        case "x":
          t.checkConstraints.push({ name, expression: String(r.definition) });
          break;
        case "f":
          t.foreignKeys.push({
            name,
            columns,
            refSchema: str(r.ref_schema),
            refTable: String(r.ref_table),
            refColumns: arr(r.ref_columns),
            onUpdate: FK_ACTION[String(r.on_update)] ?? "NO ACTION",
            onDelete: FK_ACTION[String(r.on_delete)] ?? "NO ACTION",
            definition: str(r.definition),
          });
          break;
      }
    }

    const nkey = v >= 110000 ? "ix.indnkeyatts" : "ix.indnatts";
    const idx = await s.query(
      `SELECT c.relname AS table_name, i.relname AS name, ix.indisunique AS is_unique, ix.indisprimary AS is_primary,
              am.amname AS method, pg_get_indexdef(ix.indexrelid) AS definition,
              pg_get_expr(ix.indpred, ix.indrelid) AS predicate,
              ARRAY(SELECT pg_get_indexdef(ix.indexrelid, k, true) FROM generate_series(1, ${nkey}) k) AS columns,
              EXISTS (SELECT 1 FROM pg_constraint pc WHERE pc.conindid = ix.indexrelid AND pc.conrelid = ix.indrelid
                                                       AND pc.contype IN ('p','u','x')) AS constraint_backed
         FROM pg_index ix
         JOIN pg_class i ON i.oid = ix.indexrelid
         JOIN pg_class c ON c.oid = ix.indrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
         JOIN pg_am am ON am.oid = i.relam
        WHERE n.nspname = $1 ${filter}
        ORDER BY c.relname, i.relname`,
      params
    );
    for (const r of idx.rows) {
      const t = tables.get(String(r.table_name));
      if (!t) continue;
      const def: IndexDef = {
        name: String(r.name),
        columns: arr(r.columns),
        unique: bool(r.is_unique),
        primary: bool(r.is_primary),
        method: str(r.method),
        predicate: str(r.predicate),
        definition: str(r.definition),
        constraintBacked: bool(r.constraint_backed),
      };
      t.indexes.push(def);
    }

    const trg = await s.query(
      `SELECT c.relname AS table_name, t.tgname AS name, pg_get_triggerdef(t.oid, true) AS definition
         FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE NOT t.tgisinternal AND n.nspname = $1 ${filter}
        ORDER BY c.relname, t.tgname`,
      params
    );
    for (const r of trg.rows) {
      const t = tables.get(String(r.table_name));
      if (!t) continue;
      t.triggers.push({ name: String(r.name), table: t.name, definition: str(r.definition) });
    }

    return { tables: [...tables.values()], unavailable: [] };
  },

  async snapshot(s, schema, names) {
    const v = await versionNum(s);
    const { tables, unavailable } = await this.tables(s, schema, names);
    const enumRows = await s.query(
      `SELECT t.typname AS name, array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS vals
         FROM pg_type t
         JOIN pg_enum e ON e.enumtypid = t.oid
         JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = $1
        GROUP BY t.typname ORDER BY t.typname`,
      [schema]
    );
    const enums: EnumDef[] = enumRows.rows.map((r) => ({ schema, name: String(r.name), values: arr(r.vals) }));

    // Sequences not owned by identity columns (those are implied by the column).
    const seqSql =
      v >= 100000
        ? `SELECT s.sequencename AS name, s.data_type::text AS data_type, s.start_value::text AS start, s.increment_by::text AS increment
             FROM pg_sequences s
             JOIN pg_namespace n ON n.nspname = s.schemaname
             JOIN pg_class c ON c.relname = s.sequencename AND c.relnamespace = n.oid
            WHERE s.schemaname = $1
              AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'i')
            ORDER BY 1`
        : `SELECT c.relname AS name, NULL AS data_type, NULL AS start, NULL AS increment
             FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relkind = 'S' AND n.nspname = $1 ORDER BY 1`;
    const seqRows = await s.query(seqSql, [schema]);
    const sequences: SequenceDef[] = seqRows.rows.map((r) => ({
      schema,
      name: String(r.name),
      dataType: str(r.data_type),
      start: str(r.start),
      increment: str(r.increment),
    }));
    const snap: SchemaSnapshot = { engine: "postgres", schema, tables, enums, sequences, unavailable };
    return snap;
  },

  async listObjects(s, schema, kind: ObjectKind) {
    const v = await versionNum(s);
    switch (kind) {
      case "enum": {
        const r = await s.query(
          `SELECT t.typname AS name, array_agg(e.enumlabel::text ORDER BY e.enumsortorder) AS values,
                  obj_description(t.oid, 'pg_type') AS comment
             FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid JOIN pg_namespace n ON n.oid = t.typnamespace
            WHERE n.nspname = $1 GROUP BY t.oid, t.typname ORDER BY t.typname`,
          [schema]
        );
        return r.rows.map((x) => ({ ...x, values: arr(x.values) }));
      }
      case "type": {
        const r = await s.query(
          `SELECT t.typname AS name,
                  CASE t.typtype WHEN 'c' THEN 'composite' WHEN 'd' THEN 'domain' WHEN 'e' THEN 'enum'
                                 WHEN 'r' THEN 'range' WHEN 'm' THEN 'multirange' ELSE t.typtype::text END AS kind,
                  CASE WHEN t.typtype = 'd' THEN format_type(t.typbasetype, t.typtypmod) END AS base_type,
                  CASE WHEN t.typtype = 'd' THEN (SELECT string_agg(pg_get_constraintdef(c.oid), ' AND ') FROM pg_constraint c WHERE c.contypid = t.oid) END AS domain_check,
                  obj_description(t.oid, 'pg_type') AS comment
             FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
            WHERE n.nspname = $1 AND t.typtype IN ('c','d','e','r','m')
              AND (t.typtype <> 'c' OR (SELECT relkind FROM pg_class WHERE oid = t.typrelid) = 'c')
              AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = t.oid AND d.deptype = 'e')
            ORDER BY t.typname`,
          [schema]
        );
        return r.rows;
      }
      case "function":
      case "procedure": {
        const kindExpr =
          v >= 110000
            ? "CASE p.prokind WHEN 'f' THEN 'function' WHEN 'p' THEN 'procedure' WHEN 'a' THEN 'aggregate' WHEN 'w' THEN 'window' END"
            : "CASE WHEN p.proisagg THEN 'aggregate' WHEN p.proiswindow THEN 'window' ELSE 'function' END";
        const r = await s.query(
          `SELECT * FROM (
             SELECT p.proname AS name, ${kindExpr} AS kind,
                    pg_get_function_identity_arguments(p.oid) AS arguments,
                    pg_get_function_result(p.oid) AS returns,
                    l.lanname AS language,
                    obj_description(p.oid, 'pg_proc') AS comment
               FROM pg_proc p
               JOIN pg_namespace n ON n.oid = p.pronamespace
               JOIN pg_language l ON l.oid = p.prolang
              WHERE n.nspname = $1
                AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
           ) x WHERE ($2 = 'function' AND x.kind <> 'procedure') OR ($2 = 'procedure' AND x.kind = 'procedure')
           ORDER BY name`,
          [schema, kind]
        );
        return r.rows;
      }
      case "trigger": {
        const r = await s.query(
          `SELECT c.relname AS table, t.tgname AS name, t.tgenabled::text AS enabled,
                  pg_get_triggerdef(t.oid, true) AS definition
             FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE NOT t.tgisinternal AND n.nspname = $1 ORDER BY c.relname, t.tgname`,
          [schema]
        );
        return r.rows;
      }
      case "sequence": {
        const r = await s.query(
          v >= 100000
            ? `SELECT sequencename AS name, data_type::text AS data_type, start_value::text AS start, increment_by::text AS increment,
                      last_value::text AS last_value, max_value::text AS max_value, cycle
                 FROM pg_sequences WHERE schemaname = $1 ORDER BY 1`
            : `SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE c.relkind = 'S' AND n.nspname = $1 ORDER BY 1`,
          [schema]
        );
        return r.rows;
      }
      case "view":
      case "materialized_view": {
        const r = await s.query(
          `SELECT c.relname AS name, pg_get_viewdef(c.oid, true) AS definition, obj_description(c.oid, 'pg_class') AS comment
             FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = $1 AND c.relkind = $2::"char" ORDER BY 1`,
          [schema, kind === "view" ? "v" : "m"]
        );
        return r.rows;
      }
      case "index": {
        const r = await s.query(
          `SELECT c.relname AS table, i.relname AS name, pg_get_indexdef(ix.indexrelid) AS definition,
                  ix.indisunique AS unique, ix.indisprimary AS primary, pg_relation_size(i.oid) AS bytes
             FROM pg_index ix JOIN pg_class i ON i.oid = ix.indexrelid JOIN pg_class c ON c.oid = ix.indrelid
             JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = $1 ORDER BY c.relname, i.relname`,
          [schema]
        );
        return r.rows;
      }
      case "extension": {
        const r = await s.query(
          `SELECT e.extname AS name, e.extversion AS version, n.nspname AS schema
             FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace ORDER BY 1`
        );
        return r.rows;
      }
    }
    return [];
  },

  async search(s, pattern, schema, limit) {
    const like = `%${pattern.replace(/[\\%_]/g, (m) => "\\" + m)}%`;
    const schemaFilter = schema ? "n.nspname = $2" : "n.nspname NOT LIKE 'pg\\_%' AND n.nspname <> 'information_schema'";
    const params: unknown[] = schema ? [like, schema, limit] : [like, limit];
    const lim = schema ? "$3" : "$2";
    const r = await s.query(
      `(SELECT CASE c.relkind WHEN 'r' THEN 'table' WHEN 'p' THEN 'table' WHEN 'v' THEN 'view'
                              WHEN 'm' THEN 'materialized_view' WHEN 'f' THEN 'foreign_table' WHEN 'S' THEN 'sequence'
                              WHEN 'i' THEN 'index' END AS kind,
               n.nspname AS schema, c.relname AS name, NULL::text AS table_name, obj_description(c.oid, 'pg_class') AS detail
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE c.relkind IN ('r','p','v','m','f','S','i') AND c.relname ILIKE $1 AND ${schemaFilter}
         LIMIT ${lim})
       UNION ALL
       (SELECT 'column', n.nspname, a.attname, c.relname, format_type(a.atttypid, a.atttypmod)
          FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE a.attnum > 0 AND NOT a.attisdropped AND c.relkind IN ('r','p','v','m','f')
           AND a.attname ILIKE $1 AND ${schemaFilter}
         LIMIT ${lim})
       UNION ALL
       (SELECT 'function', n.nspname, p.proname, NULL, pg_get_function_identity_arguments(p.oid)
          FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE p.proname ILIKE $1 AND ${schemaFilter}
         LIMIT ${lim})
       UNION ALL
       (SELECT 'type', n.nspname, t.typname, NULL, t.typtype::text
          FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
         WHERE t.typtype IN ('e','d','c','r') AND t.typname ILIKE $1 AND ${schemaFilter}
           AND (t.typtype <> 'c' OR (SELECT relkind FROM pg_class WHERE oid = t.typrelid) = 'c')
         LIMIT ${lim})`,
      params
    );
    return r.rows.map(
      (x): SearchHit => ({
        kind: String(x.kind),
        schema: str(x.schema),
        name: String(x.name),
        ...(x.table_name ? { table: String(x.table_name) } : {}),
        detail: str(x.detail),
      })
    );
  },
};
