// SPDX-License-Identifier: MIT
/**
 * Connection listing and schema introspection tools.
 */

import { ENGINE_LABEL, getRegistry, maxRowsCap, statementTimeoutMs } from "../config.js";
import { getDriver } from "../drivers/index.js";
import { introspectorFor, resolveSchema } from "../introspect/index.js";
import type { RelationKind, TableDef } from "../introspect/types.js";
import { quoteIdent, qualified } from "../sql-lexer.js";
import { serializeRows } from "../serialize.js";
import { TOOL_ENGINES } from "../tool-engines.js";
import {
  ListConnectionsSchema,
  ListObjectsSchema,
  ListSchemasSchema,
  ListTablesSchema,
  PreviewTableSchema,
  SchemaIntrospectionSchema,
  SearchObjectsSchema,
  TableInfoSchema,
  errorResponse,
  jsonResponse,
  type Handler,
} from "./types.js";

export const handleListConnections: Handler = async (args) => {
  ListConnectionsSchema.parse(args ?? {});
  const reg = getRegistry();
  const connections = [...reg.connections.values()].map((c) => ({
    name: c.name,
    engine: c.engine,
    engineLabel: ENGINE_LABEL[c.engine],
    readOnly: c.readOnly,
    isDefault: c.name === reg.defaultName,
    source: c.source,
    url: c.displayUrl,
    ...(c.net
      ? {
          host: c.net.host,
          port: c.net.port,
          database: c.net.database || null,
          user: c.net.user || null,
          sslmode: c.net.ssl.mode,
          ...(c.net.ssl.caPath ? { sslrootcert: c.net.ssl.caPath } : {}),
          ...(c.net.notes.length ? { notes: c.net.notes } : {}),
        }
      : { file: c.file }),
  }));
  return jsonResponse({
    connections,
    defaultConnection: reg.defaultName,
    ...(reg.errors.length ? { configErrors: reg.errors } : {}),
    settings: { statementTimeoutMs: statementTimeoutMs(), maxRows: maxRowsCap() },
    toolEngines: TOOL_ENGINES,
    ...(connections.length === 0
      ? { hint: 'Set DATABASE_URL, or DATABASE_URLS={"name":"postgres://…"} (add "readOnly": false to allow writes).' }
      : {}),
  });
};

export const handleListSchemas: Handler = async (args) => {
  const { connection } = ListSchemasSchema.parse(args ?? {});
  const driver = getDriver(connection);
  const intro = introspectorFor(driver.engine);
  const { schemas, current } = await driver.withSession("read", async (s) => ({
    schemas: await intro.listSchemas(s),
    current: await intro.defaultSchema(s),
  }));
  return jsonResponse({ connection: driver.config.name, engine: driver.engine, current, schemas: serializeRows(schemas).rows });
};

export const handleListTables: Handler = async (args) => {
  const { schema, includeViews, limit, connection } = ListTablesSchema.parse(args ?? {});
  const driver = getDriver(connection);
  const intro = introspectorFor(driver.engine);
  const kinds: RelationKind[] = ["table", "partitioned_table", "foreign_table"];
  if (includeViews) kinds.push("view", "materialized_view");
  const { sch, rels } = await driver.withSession("read", async (s) => {
    const sch = await resolveSchema(s, schema);
    return { sch, rels: await intro.listRelations(s, sch, kinds) };
  });
  const truncated = rels.length > limit;
  return jsonResponse({
    connection: driver.config.name,
    engine: driver.engine,
    schema: sch,
    tables: rels.slice(0, limit),
    count: Math.min(rels.length, limit),
    total: rels.length,
    truncated,
    ...(driver.engine !== "sqlite" ? { note: "rowEstimate comes from planner statistics, not COUNT(*)" } : {}),
  });
};

function tableNotFound(table: string, schema: string, connection: string) {
  return errorResponse(`Table or view "${table}" not found in schema "${schema}" (connection "${connection}")`, {
    hint: "Use list_tables or search_objects to find the right name/schema",
  });
}

export const handleDescribeTable: Handler = async (args) => {
  const { table, schema, connection } = TableInfoSchema.parse(args);
  const driver = getDriver(connection);
  const intro = introspectorFor(driver.engine);
  const { sch, result } = await driver.withSession("read", async (s) => {
    const sch = await resolveSchema(s, schema);
    return { sch, result: await intro.tables(s, sch, [table]) };
  });
  const t = result.tables[0];
  if (!t) return tableNotFound(table, sch, driver.config.name);
  return jsonResponse({
    connection: driver.config.name,
    engine: driver.engine,
    ...t,
    ...(result.unavailable.length ? { unavailable: result.unavailable } : {}),
  });
};

function compactTable(t: TableDef) {
  return { kind: t.kind, columns: t.columns.map((c) => c.name) };
}

function summaryTable(t: TableDef) {
  return {
    kind: t.kind,
    ...(t.comment ? { comment: t.comment } : {}),
    columns: t.columns.map((c) => ({
      name: c.name,
      type: c.type,
      nullable: c.nullable,
      default: c.default,
      ...(c.identity ? { identity: c.identity } : {}),
      ...(c.generated ? { generated: c.generated } : {}),
      ...(c.autoIncrement ? { autoIncrement: true } : {}),
    })),
    primaryKey: t.primaryKey?.columns ?? null,
    foreignKeys: t.foreignKeys.map((f) => ({
      name: f.name,
      columns: f.columns,
      references: `${f.refSchema && f.refSchema !== t.schema ? f.refSchema + "." : ""}${f.refTable}(${f.refColumns.join(", ")})`,
    })),
    ...(t.uniqueConstraints.length ? { unique: t.uniqueConstraints.map((u) => u.columns) } : {}),
    ...(t.indexes.length ? { indexes: t.indexes.filter((i) => !i.primary).map((i) => `${i.name}(${i.columns.join(", ")})${i.unique ? " UNIQUE" : ""}`) } : {}),
  };
}

export const handleGetSchema: Handler = async (args) => {
  const { table, schema, compact, limit, connection } = SchemaIntrospectionSchema.parse(args ?? {});
  const driver = getDriver(connection);
  const intro = introspectorFor(driver.engine);
  const { sch, snap } = await driver.withSession("read", async (s) => {
    const sch = await resolveSchema(s, schema);
    let names: string[] | undefined = table ? [table] : undefined;
    if (!names) {
      // bound the work before fetching full definitions
      const rels = await intro.listRelations(s, sch, ["table", "partitioned_table", "foreign_table", "view", "materialized_view"]);
      names = rels.map((r) => r.name);
    }
    const truncated = names.length > limit;
    const chosen = names.slice(0, limit);
    const snap = chosen.length ? await intro.snapshot(s, sch, chosen) : null;
    return { sch, snap: snap ? { ...snap, truncated, totalTables: names.length } : null };
  });
  if (table && (!snap || snap.tables.length === 0)) return tableNotFound(table, sch, driver.config.name);
  const tables: Record<string, unknown> = {};
  for (const t of snap?.tables ?? []) tables[t.name] = compact ? compactTable(t) : summaryTable(t);
  return jsonResponse({
    connection: driver.config.name,
    engine: driver.engine,
    schema: sch,
    tables,
    tableCount: Object.keys(tables).length,
    ...(snap?.enums.length ? { enums: snap.enums.map((e) => ({ name: e.name, values: e.values })) } : {}),
    ...(snap && snap.truncated ? { truncated: true, totalTables: snap.totalTables, hint: "raise limit or pass table" } : {}),
    ...(snap?.unavailable.length ? { unavailable: snap.unavailable } : {}),
  });
};

export const handleListObjects: Handler = async (args) => {
  const { kind, schema, limit, connection } = ListObjectsSchema.parse(args);
  const driver = getDriver(connection);
  const intro = introspectorFor(driver.engine);
  if (!intro.supportedObjectKinds.includes(kind)) {
    return errorResponse(
      `Object kind "${kind}" is not supported on ${ENGINE_LABEL[driver.engine]}. Supported: ${intro.supportedObjectKinds.join(", ")}`
    );
  }
  const { sch, rows } = await driver.withSession("read", async (s) => {
    const sch = await resolveSchema(s, schema);
    return { sch, rows: await intro.listObjects(s, sch, kind) };
  });
  const truncated = rows.length > limit;
  return jsonResponse({
    connection: driver.config.name,
    engine: driver.engine,
    schema: sch,
    kind,
    objects: serializeRows(rows.slice(0, limit), 4000).rows,
    count: Math.min(rows.length, limit),
    total: rows.length,
    truncated,
  });
};

export const handleSearchObjects: Handler = async (args) => {
  const { pattern, schema, limit, connection } = SearchObjectsSchema.parse(args);
  const driver = getDriver(connection);
  const intro = introspectorFor(driver.engine);
  const hits = await driver.withSession("read", (s) => intro.search(s, pattern, schema ?? null, limit + 1));
  const truncated = hits.length > limit;
  return jsonResponse({
    connection: driver.config.name,
    engine: driver.engine,
    pattern,
    results: hits.slice(0, limit),
    count: Math.min(hits.length, limit),
    truncated,
  });
};

export const handlePreviewTable: Handler = async (args) => {
  const { table, schema, columns, orderBy, descending, limit, maxCellChars, connection } = PreviewTableSchema.parse(args);
  const driver = getDriver(connection);
  const e = driver.engine;
  const intro = introspectorFor(e);
  const out = await driver.withSession("read", async (s) => {
    const sch = await resolveSchema(s, schema);
    const { tables } = await intro.tables(s, sch, [table]);
    const t = tables[0];
    if (!t) return { sch, missing: true as const };
    const known = new Set(t.columns.map((c) => c.name));
    const bad = [...(columns ?? []), ...(orderBy ? [orderBy] : [])].filter((c) => !known.has(c));
    if (bad.length) return { sch, badColumns: bad, known: [...known] };
    const cols = columns?.length ? columns.map((c) => quoteIdent(c, e)).join(", ") : "*";
    const order = orderBy ? ` ORDER BY ${quoteIdent(orderBy, e)}${descending ? " DESC" : ""}` : "";
    const r = await s.query(`SELECT ${cols} FROM ${qualified(sch, table, e)}${order} LIMIT ${limit + 1}`, [], { maxRows: limit + 1 });
    return { sch, r };
  });
  if ("missing" in out) return tableNotFound(table, out.sch, driver.config.name);
  if ("badColumns" in out) return errorResponse(`Unknown column(s): ${out.badColumns!.join(", ")}`, { columns: out.known });
  const r = out.r!;
  const hasMore = r.rows.length > limit;
  const ser = serializeRows(r.rows.slice(0, limit), maxCellChars);
  return jsonResponse({
    connection: driver.config.name,
    engine: e,
    table: `${out.sch}.${table}`,
    columns: r.columns,
    rows: ser.rows,
    rowCount: ser.rows.length,
    hasMore,
    truncated: hasMore,
    ...(ser.truncatedCells ? { truncatedCells: ser.truncatedCells } : {}),
    ...(orderBy ? {} : { note: "no orderBy: rows come in storage order" }),
  });
};
