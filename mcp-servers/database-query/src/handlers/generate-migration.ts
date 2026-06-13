// SPDX-License-Identifier: MIT
/**
 * Handler for generate_migration tool
 */

import pg from "pg";
import { lookup, resolve } from "dns/promises";
import { isIPv4, isIPv6 } from "net";
import { GenerateMigrationSchema, jsonResponse, type Handler, type HandlerResult } from "./types.js";
import { getPool } from "./db.js";

const { Pool } = pg;

// ---------------------------------------------------------------------------
// SSRF / credential-leak guard
// NOTE: This mirrors compare-schemas.ts; consider extracting to a shared
//       utils file if the validation logic grows further.
// ---------------------------------------------------------------------------

function getBlockedIpv4Range(ip: string): string | null {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p))) return null;
  const [a, b] = parts;
  if (a === 127) return "loopback (127.x.x.x)";
  if (a === 0) return "unspecified";
  if (a === 10) return "private (10.x.x.x)";
  if (a === 172 && b >= 16 && b <= 31) return "private (172.16-31.x.x)";
  if (a === 192 && b === 168) return "private (192.168.x.x)";
  if (a === 169 && b === 254) return "link-local/cloud-metadata (169.254.x.x)";
  return null;
}

function getBlockedIpv6Range(addr: string): string | null {
  const stripped = addr.replace(/^\[|\]$/g, "").toLowerCase();
  if (stripped === "::1" || stripped === "0:0:0:0:0:0:0:1") {
    return "IPv6 loopback (::1)";
  }
  const halves = stripped.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0) return null;
  const groups = [...left, ...Array(missing).fill("0"), ...right].map((g) => parseInt(g, 16));
  if (groups.length !== 8 || groups.some((g) => isNaN(g))) return null;
  if (groups[0] === 0 && groups[1] === 0 && groups[2] === 0 &&
      groups[3] === 0 && groups[4] === 0 && groups[5] === 0xffff) {
    const embedded = [
      (groups[6] >>> 8) & 0xff, groups[6] & 0xff,
      (groups[7] >>> 8) & 0xff, groups[7] & 0xff,
    ].join(".");
    const ipv4Blocked = getBlockedIpv4Range(embedded);
    if (ipv4Blocked) return `IPv4-mapped IPv6 embedding ${ipv4Blocked}`;
    return null;
  }
  if ((groups[0] & 0xfe00) === 0xfc00) return "IPv6 Unique Local Address (fc00::/7)";
  if ((groups[0] & 0xffc0) === 0xfe80) return "IPv6 link-local (fe80::/10)";
  return null;
}

/**
 * Validate a PostgreSQL connection URL against SSRF:
 *  - Must be postgresql:// or postgres://
 *  - Host must not be private/loopback/metadata IPv4 or IPv6
 *  - DNS failure is fail-closed (throws)
 */
async function validateDatabaseUrl(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("targetDatabaseUrl is not a valid URL");
  }

  if (parsed.protocol !== "postgresql:" && parsed.protocol !== "postgres:") {
    throw new Error(
      `targetDatabaseUrl must use the postgresql:// scheme (got "${parsed.protocol}")`
    );
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (hostname === "localhost") return;

  // IPv6 literal
  if (isIPv6(hostname) || hostname.includes(":")) {
    const blocked = getBlockedIpv6Range(hostname);
    if (blocked) {
      throw new Error(`SSRF protection: targetDatabaseUrl host is in a blocked range: ${blocked}`);
    }
    return;
  }

  // IPv4 literal
  if (isIPv4(hostname)) {
    const blocked = getBlockedIpv4Range(hostname);
    if (blocked) {
      throw new Error(`SSRF protection: targetDatabaseUrl host is in a blocked range: ${blocked}`);
    }
    return;
  }

  // Hostname: DNS resolution (fail-closed)
  let addresses: string[];
  try {
    const results = await resolve(hostname).catch(async () => {
      const r = await lookup(hostname, { all: true });
      return r.map((a) => a.address);
    });
    addresses = results as string[];
  } catch {
    throw new Error(
      `SSRF protection: targetDatabaseUrl hostname "${hostname}" could not be resolved`
    );
  }

  for (const addr of addresses) {
    if (isIPv6(addr) || addr.includes(":")) {
      const blocked = getBlockedIpv6Range(addr);
      if (blocked) {
        throw new Error(
          `SSRF protection: targetDatabaseUrl host resolves to a blocked range: ${blocked}`
        );
      }
    } else if (isIPv4(addr)) {
      const blocked = getBlockedIpv4Range(addr);
      if (blocked) {
        throw new Error(
          `SSRF protection: targetDatabaseUrl host resolves to a blocked range: ${blocked}`
        );
      }
    }
  }
}

/**
 * Redact credentials from a PostgreSQL connection URL for safe logging.
 * Handles:
 *  - Standard authority: postgresql://user:password@host/db
 *  - URL-encoded passwords (e.g. p%40ss)
 *  - Query-string passwords: ?password=secret
 */
function redactDbUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.password) {
      parsed.password = "***";
    }
    // Also strip ?password= query param
    parsed.searchParams.delete("password");
    return parsed.toString();
  } catch {
    // If the URL is malformed, replace anything between :// and @ as a
    // best-effort redaction.
    return rawUrl.replace(/(\/\/[^:@]*:)[^@]+(@)/, "$1***$2");
  }
}

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

  // SSRF + scheme validation — throw before opening any connection
  await validateDatabaseUrl(targetDatabaseUrl);

  const sourceDb = getPool();
  // Wrap Pool construction so that connection errors don't leak the raw URL
  const targetPool = new Pool({
    connectionString: targetDatabaseUrl,
    connectionTimeoutMillis: 10000,
  });

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
      `-- Target: ${redactDbUrl(targetDatabaseUrl)}`,
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
