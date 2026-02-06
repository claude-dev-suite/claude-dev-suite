// SPDX-License-Identifier: MIT
/**
 * Handlers for schema introspection tools
 */

import { SchemaIntrospectionSchema, TableInfoSchema, jsonResponse, type Handler, type HandlerResult } from "./types.js";
import { getPool } from "./db.js";

export const handleListTables: Handler = async (_args): Promise<HandlerResult> => {
  const db = getPool();
  const result = await db.query(`
    SELECT
      t.table_name,
      t.table_type,
      (SELECT COUNT(*) FROM information_schema.columns c WHERE c.table_name = t.table_name) as column_count,
      pg_stat_user_tables.n_live_tup as approximate_row_count
    FROM information_schema.tables t
    LEFT JOIN pg_stat_user_tables ON pg_stat_user_tables.relname = t.table_name
    WHERE t.table_schema = 'public'
    ORDER BY t.table_name
  `);

  return jsonResponse({
    tables: result.rows,
    count: result.rowCount,
  });
};

export const handleDescribeTable: Handler = async (args): Promise<HandlerResult> => {
  const { table } = TableInfoSchema.parse(args);
  const db = getPool();

  // Get columns
  const columns = await db.query(
    `
    SELECT
      column_name,
      data_type,
      is_nullable,
      column_default,
      character_maximum_length
    FROM information_schema.columns
    WHERE table_name = $1 AND table_schema = 'public'
    ORDER BY ordinal_position
  `,
    [table]
  );

  // Get primary key
  const primaryKey = await db.query(
    `
    SELECT kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = $1
      AND tc.constraint_type = 'PRIMARY KEY'
  `,
    [table]
  );

  // Get foreign keys
  const foreignKeys = await db.query(
    `
    SELECT
      kcu.column_name,
      ccu.table_name AS foreign_table,
      ccu.column_name AS foreign_column
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
    WHERE tc.table_name = $1
      AND tc.constraint_type = 'FOREIGN KEY'
  `,
    [table]
  );

  // Get indexes
  const indexes = await db.query(
    `
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE tablename = $1
  `,
    [table]
  );

  return jsonResponse({
    table,
    columns: columns.rows,
    primaryKey: primaryKey.rows.map((r) => r.column_name),
    foreignKeys: foreignKeys.rows,
    indexes: indexes.rows,
  });
};

export const handleGetSchema: Handler = async (args): Promise<HandlerResult> => {
  const { table, compact } = SchemaIntrospectionSchema.parse(args);
  const db = getPool();

  let query = `
    SELECT
      t.table_name,
      c.column_name,
      c.data_type,
      c.is_nullable,
      c.column_default
    FROM information_schema.tables t
    JOIN information_schema.columns c
      ON t.table_name = c.table_name
    WHERE t.table_schema = 'public'
  `;

  const params: string[] = [];
  if (table) {
    query += " AND t.table_name = $1";
    params.push(table);
  }

  query += " ORDER BY t.table_name, c.ordinal_position";

  const result = await db.query(query, params);

  // Compact mode: only table names and column names
  if (compact) {
    const compactSchema: Record<string, string[]> = {};
    for (const row of result.rows) {
      if (!compactSchema[row.table_name]) {
        compactSchema[row.table_name] = [];
      }
      compactSchema[row.table_name].push(row.column_name);
    }
    return jsonResponse({
      schema: compactSchema,
      tableCount: Object.keys(compactSchema).length,
    });
  }

  // Full mode: include types, nullable, default
  const schema: Record<string, Array<{ column: string; type: string; nullable: string; default: string | null }>> = {};
  for (const row of result.rows) {
    if (!schema[row.table_name]) {
      schema[row.table_name] = [];
    }
    schema[row.table_name].push({
      column: row.column_name,
      type: row.data_type,
      nullable: row.is_nullable,
      default: row.column_default,
    });
  }

  return jsonResponse({
    schema,
    tableCount: Object.keys(schema).length,
  });
};
