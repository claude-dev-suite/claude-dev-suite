// SPDX-License-Identifier: MIT
/**
 * Handler for compare_schemas tool
 */

import pg from "pg";
import { lookup, resolve } from "dns/promises";
import { isIPv4, isIPv6 } from "net";
import { CompareSchemaSchema, jsonResponse, type Handler, type HandlerResult } from "./types.js";
import { getPool } from "./db.js";

const { Pool } = pg;

// ---------------------------------------------------------------------------
// SSRF / credential-leak guard
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

/**
 * Check whether an IPv6 address string falls within a blocked range.
 * Blocked: ::1 (loopback), ::ffff:0:0/96 (IPv4-mapped), fc00::/7 (ULA), fe80::/10 (link-local).
 * Returns the range name if blocked, null if allowed.
 */
function getBlockedIpv6Range(addr: string): string | null {
  // Strip brackets if present
  const stripped = addr.replace(/^\[|\]$/g, "").toLowerCase();

  // ::1 loopback
  if (stripped === "::1" || stripped === "0:0:0:0:0:0:0:1") {
    return "IPv6 loopback (::1)";
  }

  // Expand to check high bits
  const halves = stripped.split("::");
  if (halves.length > 2) return null;

  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0) return null;

  const groups = [
    ...left,
    ...Array(missing).fill("0"),
    ...right,
  ].map((g) => parseInt(g, 16));

  if (groups.length !== 8 || groups.some((g) => isNaN(g))) return null;

  // IPv4-mapped ::ffff:a.b.c.d — check embedded IPv4
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

  // fc00::/7 — ULA
  if ((groups[0] & 0xfe00) === 0xfc00) return "IPv6 Unique Local Address (fc00::/7)";

  // fe80::/10 — link-local
  if ((groups[0] & 0xffc0) === 0xfe80) return "IPv6 link-local (fe80::/10)";

  return null;
}

/**
 * Validate a PostgreSQL connection URL:
 *  - Must be a well-formed postgresql:// (or postgres://) URL
 *  - Host must not be a private/loopback/metadata IPv4, IPv6, or resolving to one
 *  - DNS failure is fail-closed: throw rather than allowing the request
 * Throws with a sanitised message (no password in error text).
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

  // Strip brackets from IPv6 literal in hostname
  const rawHostname = parsed.hostname;
  const hostname = rawHostname.toLowerCase().replace(/^\[|\]$/g, "");

  // Allow localhost for dev workflows
  if (hostname === "localhost") return;

  // --- IPv6 literal ---
  if (isIPv6(hostname) || hostname.includes(":")) {
    const blocked = getBlockedIpv6Range(hostname);
    if (blocked) {
      throw new Error(`SSRF protection: targetDatabaseUrl host is in a blocked range: ${blocked}`);
    }
    return;
  }

  // --- IPv4 literal ---
  if (isIPv4(hostname)) {
    const blocked = getBlockedIpv4Range(hostname);
    if (blocked) {
      throw new Error(`SSRF protection: targetDatabaseUrl host is in a blocked range: ${blocked}`);
    }
    return;
  }

  // --- Hostname: DNS resolution (fail-closed) ---
  let addresses: string[];
  try {
    const results = await resolve(hostname).catch(async () => {
      const r = await lookup(hostname, { all: true });
      return r.map((a) => a.address);
    });
    addresses = results as string[];
  } catch {
    // DNS resolution failure — fail closed: do not allow unknown hosts
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

type ColumnInfo = { data_type: string; is_nullable: string; column_default: string | null };

export const handleCompareSchemas: Handler = async (args): Promise<HandlerResult> => {
  const { targetDatabaseUrl, tables: specificTables } = CompareSchemaSchema.parse(args);

  // SSRF + scheme validation
  await validateDatabaseUrl(targetDatabaseUrl);

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
