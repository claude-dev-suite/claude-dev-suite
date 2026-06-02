// SPDX-License-Identifier: MIT
/**
 * Handler for execute_query tool
 */

import { QuerySchema, jsonResponse, errorResponse, type Handler, type HandlerResult } from "./types.js";
import { getPool } from "./db.js";
import pg from "pg";

export const handleExecuteQuery: Handler = async (args): Promise<HandlerResult> => {
  const { sql, params, limit, offset } = QuerySchema.parse(args);

  // Fast-fail prefix check — this is NOT the security boundary (see below) but
  // provides an early, user-friendly rejection for obvious non-SELECT statements.
  const normalizedSql = sql.trim().toLowerCase();
  if (!normalizedSql.startsWith("select")) {
    return errorResponse("Only SELECT queries are allowed for safety. Use parameterized queries: SELECT * FROM users WHERE id = $1");
  }

  const db = getPool();

  // Apply server-side pagination for efficiency
  const hasLimit = /\bLIMIT\b/i.test(sql);
  const hasOffset = /\bOFFSET\b/i.test(sql);

  let finalSql = sql;
  if (!hasLimit) {
    finalSql = `${finalSql} LIMIT ${limit}`;
  }
  if (!hasOffset && offset > 0) {
    finalSql = `${finalSql} OFFSET ${offset}`;
  }

  // ── Security boundary: read-only transaction ────────────────────────────────
  // The prefix check above can be bypassed (e.g. via CTEs that write, or
  // functions like pg_read_file).  Wrapping the query in a READ ONLY
  // transaction forces the database engine to reject any write operation,
  // providing defence-in-depth regardless of the SQL text.
  const client = await db.connect();
  let result: pg.QueryResult;
  let totalCount: number | null = null;

  try {
    await client.query("BEGIN");
    await client.query("SET TRANSACTION READ ONLY");

    result = await client.query(finalSql, params || []);

    // Get total count if pagination is being used (still inside the same
    // read-only transaction so no additional privilege is granted).
    if (!hasLimit) {
      try {
        const countSql = `SELECT COUNT(*) as total FROM (${sql}) as count_query`;
        const countResult = await client.query(countSql, params || []);
        totalCount = parseInt(countResult.rows[0]?.total || '0', 10);
      } catch {
        // Count query failed — skip total count, do not abort the transaction
      }
    }

    await client.query("COMMIT");
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch { /* ignore rollback errors */ }
    throw err;
  } finally {
    client.release();
  }

  return jsonResponse({
    rows: result.rows,
    rowCount: result.rowCount,
    ...(totalCount !== null && { totalCount }),
    ...(totalCount !== null && totalCount > (limit || 1000) && {
      pagination: {
        limit: limit || 1000,
        offset: offset || 0,
        hasMore: (offset || 0) + (result.rowCount || 0) < totalCount,
      },
    }),
    fields: result.fields.map((f) => ({
      name: f.name,
      dataTypeID: f.dataTypeID,
    })),
  });
};
