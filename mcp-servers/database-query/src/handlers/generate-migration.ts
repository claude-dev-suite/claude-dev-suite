// SPDX-License-Identifier: MIT
/**
 * Handler for generate_migration tool
 */

import pg from "pg";
import { GenerateMigrationSchema, jsonResponse, type Handler, type HandlerResult } from "./types.js";
import { getPool } from "./db.js";

const { Pool } = pg;

type ColumnInfo = {
  data_type: string;
  is_nullable: string;
  column_default: string | null;
  character_maximum_length: number | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
  ordinal_position: number;
};

function getSqlType(col: ColumnInfo): string {
  let type = col.data_type;
  if (col.character_maximum_length) {
    type = `${type}(${col.character_maximum_length})`;
  } else if (col.numeric_precision && col.numeric_scale) {
    type = `${type}(${col.numeric_precision}, ${col.numeric_scale})`;
  }
  return type;
}

export const handleGenerateMigration: Handler = async (args): Promise<HandlerResult> => {
  const { targetDatabaseUrl, migrationName, tables: specificTables, includeDrops = false } = GenerateMigrationSchema.parse(args);

  const sourceDb = getPool();
  const targetPool = new Pool({ connectionString: targetDatabaseUrl });

  try {
    const schemaQuery = `
      SELECT
        t.table_name,
        c.column_name,
        c.data_type,
        c.is_nullable,
        c.column_default,
        c.character_maximum_length,
        c.numeric_precision,
        c.numeric_scale,
        c.ordinal_position
      FROM information_schema.tables t
      JOIN information_schema.columns c ON t.table_name = c.table_name AND t.table_schema = c.table_schema
      WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
      ORDER BY t.table_name, c.ordinal_position
    `;

    const indexQuery = `
      SELECT
        tablename as table_name,
        indexname as index_name,
        indexdef as index_definition
      FROM pg_indexes
      WHERE schemaname = 'public'
    `;

    const [sourceSchema, targetSchema] = await Promise.all([
      sourceDb.query(schemaQuery),
      targetPool.query(schemaQuery),
    ]);

    const [sourceIndexes, targetIndexes] = await Promise.all([
      sourceDb.query(indexQuery),
      targetPool.query(indexQuery),
    ]);

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
        character_maximum_length: row.character_maximum_length,
        numeric_precision: row.numeric_precision,
        numeric_scale: row.numeric_scale,
        ordinal_position: row.ordinal_position,
      };
    }

    for (const row of targetSchema.rows) {
      if (specificTables && !specificTables.includes(row.table_name)) continue;
      if (!targetMap[row.table_name]) targetMap[row.table_name] = {};
      targetMap[row.table_name][row.column_name] = {
        data_type: row.data_type,
        is_nullable: row.is_nullable,
        column_default: row.column_default,
        character_maximum_length: row.character_maximum_length,
        numeric_precision: row.numeric_precision,
        numeric_scale: row.numeric_scale,
        ordinal_position: row.ordinal_position,
      };
    }

    // Generate migration SQL
    const upStatements: string[] = [];
    const downStatements: string[] = [];

    // Tables to create (in target but not source)
    for (const [table, columns] of Object.entries(targetMap)) {
      if (!sourceMap[table]) {
        const columnDefs = Object.entries(columns)
          .sort((a, b) => a[1].ordinal_position - b[1].ordinal_position)
          .map(([colName, col]) => {
            let def = `  "${colName}" ${getSqlType(col)}`;
            if (col.is_nullable === 'NO') def += ' NOT NULL';
            if (col.column_default) def += ` DEFAULT ${col.column_default}`;
            return def;
          });

        upStatements.push(`-- Create table ${table}`);
        upStatements.push(`CREATE TABLE "${table}" (\n${columnDefs.join(',\n')}\n);`);
        upStatements.push('');

        if (includeDrops) {
          downStatements.push(`DROP TABLE IF EXISTS "${table}";`);
        }
      }
    }

    // Tables to drop (in source but not target)
    if (includeDrops) {
      for (const table of Object.keys(sourceMap)) {
        if (!targetMap[table]) {
          upStatements.push(`-- Drop table ${table}`);
          upStatements.push(`DROP TABLE IF EXISTS "${table}";`);
          upStatements.push('');
        }
      }
    }

    // Columns to add/modify
    for (const [table, targetCols] of Object.entries(targetMap)) {
      if (!sourceMap[table]) continue;

      const sourceCols = sourceMap[table];

      // Add new columns
      for (const [colName, col] of Object.entries(targetCols)) {
        if (!sourceCols[colName]) {
          let alterSql = `ALTER TABLE "${table}" ADD COLUMN "${colName}" ${getSqlType(col)}`;
          if (col.is_nullable === 'NO' && col.column_default) {
            alterSql += ` NOT NULL DEFAULT ${col.column_default}`;
          } else if (col.is_nullable === 'NO') {
            alterSql += ' NOT NULL';
          }
          if (col.column_default && col.is_nullable === 'YES') {
            alterSql += ` DEFAULT ${col.column_default}`;
          }

          upStatements.push(`-- Add column ${table}.${colName}`);
          upStatements.push(`${alterSql};`);
          upStatements.push('');

          if (includeDrops) {
            downStatements.push(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "${colName}";`);
          }
        } else {
          const sourceCol = sourceCols[colName];
          if (getSqlType(sourceCol) !== getSqlType(col)) {
            upStatements.push(`-- Modify column ${table}.${colName} type`);
            upStatements.push(`ALTER TABLE "${table}" ALTER COLUMN "${colName}" TYPE ${getSqlType(col)};`);
            upStatements.push('');

            downStatements.push(`ALTER TABLE "${table}" ALTER COLUMN "${colName}" TYPE ${getSqlType(sourceCol)};`);
          }

          if (sourceCol.is_nullable !== col.is_nullable) {
            if (col.is_nullable === 'NO') {
              upStatements.push(`-- Make column ${table}.${colName} NOT NULL`);
              upStatements.push(`ALTER TABLE "${table}" ALTER COLUMN "${colName}" SET NOT NULL;`);
            } else {
              upStatements.push(`-- Make column ${table}.${colName} nullable`);
              upStatements.push(`ALTER TABLE "${table}" ALTER COLUMN "${colName}" DROP NOT NULL;`);
            }
            upStatements.push('');
          }
        }
      }

      // Drop removed columns
      if (includeDrops) {
        for (const colName of Object.keys(sourceCols)) {
          if (!targetCols[colName]) {
            upStatements.push(`-- Drop column ${table}.${colName}`);
            upStatements.push(`ALTER TABLE "${table}" DROP COLUMN IF EXISTS "${colName}";`);
            upStatements.push('');
          }
        }
      }
    }

    // Index changes
    const sourceIndexMap = new Map(sourceIndexes.rows.map(r => [r.index_name, r]));
    const targetIndexMap = new Map(targetIndexes.rows.map(r => [r.index_name, r]));

    for (const [indexName, idx] of targetIndexMap) {
      if (!sourceIndexMap.has(indexName) && !indexName.endsWith('_pkey')) {
        upStatements.push(`-- Add index ${indexName}`);
        upStatements.push(`${idx.index_definition};`);
        upStatements.push('');

        if (includeDrops) {
          downStatements.push(`DROP INDEX IF EXISTS "${indexName}";`);
        }
      }
    }

    if (includeDrops) {
      for (const [indexName] of sourceIndexMap) {
        if (!targetIndexMap.has(indexName) && !indexName.endsWith('_pkey')) {
          upStatements.push(`-- Drop index ${indexName}`);
          upStatements.push(`DROP INDEX IF EXISTS "${indexName}";`);
          upStatements.push('');
        }
      }
    }

    // Build final migration
    const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const name = migrationName || 'schema_migration';
    const filename = `${timestamp}_${name}.sql`;

    const migration = [
      `-- Migration: ${name}`,
      `-- Generated: ${new Date().toISOString()}`,
      `-- Source: Current database`,
      `-- Target: ${targetDatabaseUrl.replace(/:[^:@]+@/, ':***@')}`,
      '',
      '-- ====================================',
      '-- UP MIGRATION',
      '-- ====================================',
      '',
      ...upStatements,
    ];

    if (downStatements.length > 0) {
      migration.push(
        '',
        '-- ====================================',
        '-- DOWN MIGRATION (rollback)',
        '-- ====================================',
        '',
        ...downStatements
      );
    }

    const migrationSql = migration.join('\n');

    return jsonResponse({
      filename,
      migration: migrationSql,
      summary: {
        upStatements: upStatements.filter(s => s.startsWith('CREATE') || s.startsWith('ALTER') || s.startsWith('DROP')).length,
        downStatements: downStatements.length,
        tablesCreated: Object.keys(targetMap).filter(t => !sourceMap[t]).length,
        tablesDropped: includeDrops ? Object.keys(sourceMap).filter(t => !targetMap[t]).length : 0,
      },
    });
  } finally {
    await targetPool.end();
  }
};
