// SPDX-License-Identifier: MIT
/**
 * Handler for compare_schemas tool
 */

import pg from "pg";
import { CompareSchemaSchema, jsonResponse, type Handler, type HandlerResult } from "./types.js";
import { getPool } from "./db.js";

const { Pool } = pg;

type ColumnInfo = { data_type: string; is_nullable: string; column_default: string | null };

export const handleCompareSchemas: Handler = async (args): Promise<HandlerResult> => {
  const { targetDatabaseUrl, tables: specificTables } = CompareSchemaSchema.parse(args);

  const sourceDb = getPool();
  const targetPool = new Pool({ connectionString: targetDatabaseUrl });

  try {
    // Get source schema
    const sourceSchema = await sourceDb.query(`
      SELECT
        t.table_name,
        c.column_name,
        c.data_type,
        c.is_nullable,
        c.column_default,
        c.character_maximum_length
      FROM information_schema.tables t
      JOIN information_schema.columns c ON t.table_name = c.table_name
      WHERE t.table_schema = 'public'
      ORDER BY t.table_name, c.ordinal_position
    `);

    // Get target schema
    const targetSchema = await targetPool.query(`
      SELECT
        t.table_name,
        c.column_name,
        c.data_type,
        c.is_nullable,
        c.column_default,
        c.character_maximum_length
      FROM information_schema.tables t
      JOIN information_schema.columns c ON t.table_name = c.table_name
      WHERE t.table_schema = 'public'
      ORDER BY t.table_name, c.ordinal_position
    `);

    // Build schema maps
    const sourceMap: Record<string, Record<string, ColumnInfo>> = {};
    const targetMap: Record<string, Record<string, ColumnInfo>> = {};

    for (const row of sourceSchema.rows) {
      if (specificTables && !specificTables.includes(row.table_name)) continue;
      if (!sourceMap[row.table_name]) sourceMap[row.table_name] = {};
      sourceMap[row.table_name][row.column_name] = {
        data_type: row.data_type,
        is_nullable: row.is_nullable,
        column_default: row.column_default,
      };
    }

    for (const row of targetSchema.rows) {
      if (specificTables && !specificTables.includes(row.table_name)) continue;
      if (!targetMap[row.table_name]) targetMap[row.table_name] = {};
      targetMap[row.table_name][row.column_name] = {
        data_type: row.data_type,
        is_nullable: row.is_nullable,
        column_default: row.column_default,
      };
    }

    // Compare schemas
    const differences: {
      missingInTarget: { table: string; column?: string }[];
      missingInSource: { table: string; column?: string }[];
      typeMismatches: { table: string; column: string; source: string; target: string }[];
    } = {
      missingInTarget: [],
      missingInSource: [],
      typeMismatches: [],
    };

    // Tables/columns in source but not target
    for (const [table, columns] of Object.entries(sourceMap)) {
      if (!targetMap[table]) {
        differences.missingInTarget.push({ table });
      } else {
        for (const [column, info] of Object.entries(columns)) {
          if (!targetMap[table][column]) {
            differences.missingInTarget.push({ table, column });
          } else if (targetMap[table][column].data_type !== info.data_type) {
            differences.typeMismatches.push({
              table,
              column,
              source: info.data_type,
              target: targetMap[table][column].data_type,
            });
          }
        }
      }
    }

    // Tables/columns in target but not source
    for (const [table, columns] of Object.entries(targetMap)) {
      if (!sourceMap[table]) {
        differences.missingInSource.push({ table });
      } else {
        for (const column of Object.keys(columns)) {
          if (!sourceMap[table][column]) {
            differences.missingInSource.push({ table, column });
          }
        }
      }
    }

    const hasDifferences =
      differences.missingInTarget.length > 0 ||
      differences.missingInSource.length > 0 ||
      differences.typeMismatches.length > 0;

    return jsonResponse({
      identical: !hasDifferences,
      sourceTables: Object.keys(sourceMap).length,
      targetTables: Object.keys(targetMap).length,
      differences,
    });
  } finally {
    await targetPool.end();
  }
};
