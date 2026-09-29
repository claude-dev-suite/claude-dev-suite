// SPDX-License-Identifier: MIT
/**
 * MySQL / MariaDB introspection from information_schema.
 * A "schema" here is a MySQL database.
 */

import type { Session } from "../drivers/types.js";
import {
  type ColumnDef,
  type Introspector,
  type ObjectKind,
  type RelationKind,
  type RelationSummary,
  type SearchHit,
  type TableDef,
  num,
  str,
} from "./types.js";

const SYSTEM_SCHEMAS = ["mysql", "information_schema", "performance_schema", "sys"];

async function isMaria(s: Session): Promise<boolean> {
  const r = await s.query("SELECT VERSION() AS v");
  return /mariadb/i.test(String(r.rows[0]?.v ?? ""));
}

const NUMERIC_TYPES = /^(tinyint|smallint|mediumint|int|integer|bigint|decimal|numeric|float|double|real|bit|bool|boolean)/i;
const BARE_DEFAULT = /^(current_timestamp|now|localtime|localtimestamp|current_date|current_time|null|true|false)(\(\d*\))?$/i;

/**
 * information_schema.COLUMNS.COLUMN_DEFAULT is inconsistent across flavours:
 * MariaDB >= 10.2.7 returns a SQL expression (strings quoted, NULL as the
 * text 'NULL'); MySQL returns the raw literal and flags expressions with
 * EXTRA=DEFAULT_GENERATED. Normalise both to a SQL expression.
 */
export function normalizeMysqlDefault(
  raw: unknown,
  columnType: string,
  extra: string,
  maria: boolean
): string | null {
  if (raw === null || raw === undefined) return null;
  const d = String(raw);
  if (maria) return d === "NULL" ? null : d;
  if (/DEFAULT_GENERATED/i.test(extra)) return BARE_DEFAULT.test(d) ? d : `(${d})`;
  if (BARE_DEFAULT.test(d)) return d;
  if (NUMERIC_TYPES.test(columnType) && /^-?\d+(\.\d+)?(e[+-]?\d+)?$/i.test(d)) return d;
  if (/^b'[01]*'$/.test(d)) return d;
  return "'" + d.replace(/\\/g, "\\\\").replace(/'/g, "''") + "'";
}

export const mysqlIntrospector: Introspector = {
  supportedObjectKinds: ["function", "procedure", "trigger", "view", "index"],

  async defaultSchema(s) {
    const r = await s.query("SELECT DATABASE() AS db");
    return str(r.rows[0]?.db);
  },

  async listSchemas(s) {
    const r = await s.query(
      `SELECT s.SCHEMA_NAME AS \`schema\`, s.DEFAULT_CHARACTER_SET_NAME AS charset, s.DEFAULT_COLLATION_NAME AS collation,
              (SELECT COUNT(*) FROM information_schema.TABLES t WHERE t.TABLE_SCHEMA = s.SCHEMA_NAME AND t.TABLE_TYPE = 'BASE TABLE') AS tables,
              (SELECT COUNT(*) FROM information_schema.TABLES t WHERE t.TABLE_SCHEMA = s.SCHEMA_NAME AND t.TABLE_TYPE = 'VIEW') AS views
         FROM information_schema.SCHEMATA s
        WHERE s.SCHEMA_NAME NOT IN (?, ?, ?, ?)
        ORDER BY 1`,
      SYSTEM_SCHEMAS
    );
    return r.rows;
  },

  async listRelations(s, schema, kinds) {
    const types: string[] = [];
    if (kinds.includes("table")) types.push("BASE TABLE", "SYSTEM VERSIONED");
    if (kinds.includes("view")) types.push("VIEW");
    if (!types.length) return [];
    const r = await s.query(
      `SELECT t.TABLE_SCHEMA AS \`schema\`, t.TABLE_NAME AS name, t.TABLE_TYPE AS type, t.TABLE_ROWS AS row_estimate,
              (t.DATA_LENGTH + t.INDEX_LENGTH) AS total_bytes, t.TABLE_COMMENT AS comment,
              (SELECT COUNT(*) FROM information_schema.COLUMNS c WHERE c.TABLE_SCHEMA = t.TABLE_SCHEMA AND c.TABLE_NAME = t.TABLE_NAME) AS column_count
         FROM information_schema.TABLES t
        WHERE t.TABLE_SCHEMA = ? AND t.TABLE_TYPE IN (${types.map(() => "?").join(",")})
        ORDER BY t.TABLE_NAME`,
      [schema, ...types]
    );
    return r.rows.map(
      (x): RelationSummary => ({
        schema: str(x.schema),
        name: String(x.name),
        kind: String(x.type) === "VIEW" ? "view" : "table",
        rowEstimate: num(x.row_estimate),
        totalBytes: num(x.total_bytes),
        columnCount: num(x.column_count),
        comment: str(x.comment) || null,
      })
    );
  },

  async tables(s, schema, names) {
    const maria = await isMaria(s);
    const unavailable: string[] = [];
    const nameFilter = names && names.length ? ` AND TABLE_NAME IN (${names.map(() => "?").join(",")})` : "";
    const p = (extra: unknown[] = []) => [schema, ...(names ?? []), ...extra];

    const rels = await s.query(
      `SELECT TABLE_NAME AS name, TABLE_TYPE AS type, TABLE_COMMENT AS comment
         FROM information_schema.TABLES WHERE TABLE_SCHEMA = ?${nameFilter} ORDER BY TABLE_NAME`,
      p()
    );
    const tables = new Map<string, TableDef>();
    for (const r of rels.rows) {
      const kind: RelationKind = String(r.type) === "VIEW" ? "view" : "table";
      tables.set(String(r.name), {
        schema,
        name: String(r.name),
        kind,
        comment: str(r.comment) || null,
        columns: [],
        primaryKey: null,
        foreignKeys: [],
        uniqueConstraints: [],
        checkConstraints: [],
        indexes: [],
        triggers: [],
      });
    }
    if (!tables.size) return { tables: [], unavailable };

    const cols = await s.query(
      `SELECT TABLE_NAME AS table_name, COLUMN_NAME AS name, ORDINAL_POSITION AS position, COLUMN_TYPE AS type,
              IS_NULLABLE AS nullable, COLUMN_DEFAULT AS dflt, EXTRA AS extra, COLUMN_COMMENT AS comment,
              GENERATION_EXPRESSION AS gen
         FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ?${nameFilter}
        ORDER BY TABLE_NAME, ORDINAL_POSITION`,
      p()
    );
    for (const r of cols.rows) {
      const t = tables.get(String(r.table_name));
      if (!t) continue;
      const extra = String(r.extra ?? "");
      const type = String(r.type);
      const gen = str(r.gen);
      const col: ColumnDef = {
        name: String(r.name),
        position: Number(r.position),
        type,
        nullable: String(r.nullable) === "YES",
        default: gen ? null : normalizeMysqlDefault(r.dflt, type, extra, maria),
        identity: null,
        generated: gen || null,
        autoIncrement: /auto_increment/i.test(extra),
        // keep "VIRTUAL GENERATED"/"STORED GENERATED" and "on update …"; drop what other fields carry
        extra: extra.replace(/DEFAULT_GENERATED/i, "").replace(/auto_increment/i, "").trim() || null,
        comment: str(r.comment) || null,
      };
      t.columns.push(col);
    }

    const stats = await s.query(
      `SELECT TABLE_NAME AS table_name, INDEX_NAME AS name, NON_UNIQUE AS non_unique, SEQ_IN_INDEX AS seq,
              COLUMN_NAME AS col, SUB_PART AS sub_part, INDEX_TYPE AS method
         FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ?${nameFilter}
        ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`,
      p()
    );
    const idxMap = new Map<string, { table: string; name: string; unique: boolean; method: string; cols: string[] }>();
    for (const r of stats.rows) {
      const key = `${r.table_name}\u0000${r.name}`;
      let e = idxMap.get(key);
      if (!e) {
        e = { table: String(r.table_name), name: String(r.name), unique: Number(r.non_unique) === 0, method: String(r.method), cols: [] };
        idxMap.set(key, e);
      }
      const col = r.col === null ? "(expression)" : String(r.col);
      e.cols.push(r.sub_part !== null && r.sub_part !== undefined ? `${col}(${r.sub_part})` : col);
    }
    for (const e of idxMap.values()) {
      const t = tables.get(e.table);
      if (!t) continue;
      const primary = e.name === "PRIMARY";
      t.indexes.push({
        name: e.name,
        columns: e.cols,
        unique: e.unique,
        primary,
        method: e.method,
        predicate: null,
        definition: null,
        constraintBacked: primary || e.unique,
      });
      if (primary) t.primaryKey = { name: "PRIMARY", columns: e.cols.map((c) => c.replace(/\(\d+\)$/, "")) };
      else if (e.unique) t.uniqueConstraints.push({ name: e.name, columns: e.cols.map((c) => c.replace(/\(\d+\)$/, "")) });
    }

    const fks = await s.query(
      `SELECT k.TABLE_NAME AS table_name, k.CONSTRAINT_NAME AS name, k.COLUMN_NAME AS col, k.ORDINAL_POSITION AS pos,
              k.REFERENCED_TABLE_SCHEMA AS ref_schema, k.REFERENCED_TABLE_NAME AS ref_table, k.REFERENCED_COLUMN_NAME AS ref_col,
              rc.UPDATE_RULE AS on_update, rc.DELETE_RULE AS on_delete
         FROM information_schema.KEY_COLUMN_USAGE k
         JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
           ON rc.CONSTRAINT_SCHEMA = k.CONSTRAINT_SCHEMA AND rc.CONSTRAINT_NAME = k.CONSTRAINT_NAME AND rc.TABLE_NAME = k.TABLE_NAME
        WHERE k.TABLE_SCHEMA = ? AND k.REFERENCED_TABLE_NAME IS NOT NULL${nameFilter.replace(/TABLE_NAME/g, "k.TABLE_NAME")}
        ORDER BY k.TABLE_NAME, k.CONSTRAINT_NAME, k.ORDINAL_POSITION`,
      p()
    );
    for (const r of fks.rows) {
      const t = tables.get(String(r.table_name));
      if (!t) continue;
      let fk = t.foreignKeys.find((f) => f.name === String(r.name));
      if (!fk) {
        fk = {
          name: String(r.name),
          columns: [],
          refSchema: str(r.ref_schema),
          refTable: String(r.ref_table),
          refColumns: [],
          onUpdate: String(r.on_update ?? "NO ACTION"),
          onDelete: String(r.on_delete ?? "NO ACTION"),
        };
        t.foreignKeys.push(fk);
      }
      fk.columns.push(String(r.col));
      fk.refColumns.push(String(r.ref_col));
    }

    try {
      const checks = await s.query(
        maria
          ? `SELECT TABLE_NAME AS table_name, CONSTRAINT_NAME AS name, CHECK_CLAUSE AS clause
               FROM information_schema.CHECK_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = ?${nameFilter}`
          : `SELECT tc.TABLE_NAME AS table_name, cc.CONSTRAINT_NAME AS name, cc.CHECK_CLAUSE AS clause
               FROM information_schema.CHECK_CONSTRAINTS cc
               JOIN information_schema.TABLE_CONSTRAINTS tc
                 ON tc.CONSTRAINT_SCHEMA = cc.CONSTRAINT_SCHEMA AND tc.CONSTRAINT_NAME = cc.CONSTRAINT_NAME AND tc.CONSTRAINT_TYPE = 'CHECK'
              WHERE cc.CONSTRAINT_SCHEMA = ?${nameFilter.replace(/TABLE_NAME/g, "tc.TABLE_NAME")}`,
        p()
      );
      for (const r of checks.rows) {
        const t = tables.get(String(r.table_name));
        if (t) t.checkConstraints.push({ name: String(r.name), expression: `CHECK (${r.clause})` });
      }
    } catch (e) {
      unavailable.push(`check constraints (needs MySQL >= 8.0.16 / MariaDB >= 10.2.22): ${(e as Error).message}`);
    }

    const trg = await s.query(
      `SELECT EVENT_OBJECT_TABLE AS table_name, TRIGGER_NAME AS name, ACTION_TIMING AS timing,
              EVENT_MANIPULATION AS event, ACTION_STATEMENT AS stmt
         FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = ?${nameFilter.replace(/TABLE_NAME/g, "EVENT_OBJECT_TABLE")}`,
      p()
    );
    for (const r of trg.rows) {
      const t = tables.get(String(r.table_name));
      if (t)
        t.triggers.push({
          name: String(r.name),
          table: t.name,
          timing: str(r.timing),
          event: str(r.event),
          definition: `${r.timing} ${r.event} FOR EACH ROW ${r.stmt}`,
        });
    }

    const views = [...tables.values()].filter((t) => t.kind === "view");
    if (views.length) {
      const vr = await s.query(
        `SELECT TABLE_NAME AS name, VIEW_DEFINITION AS def FROM information_schema.VIEWS WHERE TABLE_SCHEMA = ?${nameFilter}`,
        p()
      );
      for (const r of vr.rows) {
        const t = tables.get(String(r.name));
        if (t) t.viewDefinition = str(r.def);
      }
    }
    return { tables: [...tables.values()], unavailable };
  },

  async snapshot(s, schema, names) {
    const { tables, unavailable } = await this.tables(s, schema, names);
    // MySQL ENUMs are column types (part of `type`), not schema objects.
    return { engine: "mysql", schema, tables, enums: [], sequences: [], unavailable };
  },

  async listObjects(s, schema, kind: ObjectKind) {
    switch (kind) {
      case "function":
      case "procedure": {
        const r = await s.query(
          `SELECT ROUTINE_NAME AS name, ROUTINE_TYPE AS kind, DTD_IDENTIFIER AS returns, ROUTINE_COMMENT AS comment,
                  IS_DETERMINISTIC AS deterministic, SQL_DATA_ACCESS AS data_access
             FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ? AND ROUTINE_TYPE = ? ORDER BY 1`,
          [schema, kind.toUpperCase()]
        );
        return r.rows;
      }
      case "trigger": {
        const r = await s.query(
          `SELECT EVENT_OBJECT_TABLE AS \`table\`, TRIGGER_NAME AS name, ACTION_TIMING AS timing, EVENT_MANIPULATION AS event,
                  ACTION_STATEMENT AS definition
             FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = ? ORDER BY 1, 2`,
          [schema]
        );
        return r.rows;
      }
      case "view": {
        const r = await s.query(
          `SELECT TABLE_NAME AS name, VIEW_DEFINITION AS definition, IS_UPDATABLE AS updatable, SECURITY_TYPE AS security
             FROM information_schema.VIEWS WHERE TABLE_SCHEMA = ? ORDER BY 1`,
          [schema]
        );
        return r.rows;
      }
      case "index": {
        const r = await s.query(
          `SELECT TABLE_NAME AS \`table\`, INDEX_NAME AS name, NON_UNIQUE = 0 AS \`unique\`, INDEX_TYPE AS method,
                  GROUP_CONCAT(COALESCE(COLUMN_NAME, '(expression)') ORDER BY SEQ_IN_INDEX) AS columns
             FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ?
            GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE, INDEX_TYPE ORDER BY 1, 2`,
          [schema]
        );
        return r.rows;
      }
    }
    return [];
  },

  async search(s, pattern, schema, limit) {
    const like = `%${pattern.replace(/[\\%_]/g, (m) => "\\" + m)}%`;
    const sch = schema ? "= ?" : `NOT IN ('mysql','information_schema','performance_schema','sys')`;
    const sp = schema ? [schema] : [];
    const r = await s.query(
      `(SELECT IF(TABLE_TYPE = 'VIEW', 'view', 'table') AS kind, TABLE_SCHEMA AS \`schema\`, TABLE_NAME AS name,
               NULL AS table_name, TABLE_COMMENT AS detail
          FROM information_schema.TABLES WHERE TABLE_NAME LIKE ? AND TABLE_SCHEMA ${sch} LIMIT ${limit})
       UNION ALL
       (SELECT 'column', TABLE_SCHEMA, COLUMN_NAME, TABLE_NAME, COLUMN_TYPE
          FROM information_schema.COLUMNS WHERE COLUMN_NAME LIKE ? AND TABLE_SCHEMA ${sch} LIMIT ${limit})
       UNION ALL
       (SELECT LOWER(ROUTINE_TYPE), ROUTINE_SCHEMA, ROUTINE_NAME, NULL, DTD_IDENTIFIER
          FROM information_schema.ROUTINES WHERE ROUTINE_NAME LIKE ? AND ROUTINE_SCHEMA ${sch} LIMIT ${limit})`,
      [like, ...sp, like, ...sp, like, ...sp]
    );
    return r.rows.map(
      (x): SearchHit => ({
        kind: String(x.kind),
        schema: str(x.schema),
        name: String(x.name),
        ...(x.table_name ? { table: String(x.table_name) } : {}),
        detail: str(x.detail) || null,
      })
    );
  },
};
