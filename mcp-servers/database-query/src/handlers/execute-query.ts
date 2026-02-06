// SPDX-License-Identifier: MIT
/**
 * Handler for execute_query tool
 */

import { QuerySchema, jsonResponse, errorResponse, type Handler, type HandlerResult } from "./types.js";
import { getPool } from "./db.js";

export const handleExecuteQuery: Handler = async (args): Promise<HandlerResult> => {
  const { sql, params, limit, offset } = QuerySchema.parse(args);

  // Safety check: only allow SELECT queries
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

  const result = await db.query(finalSql, params || []);

  // Get total count if pagination is being used
  let totalCount: number | null = null;
  if (!hasLimit) {
    try {
      const countSql = `SELECT COUNT(*) as total FROM (${sql}) as count_query`;
      const countResult = await db.query(countSql, params || []);
      totalCount = parseInt(countResult.rows[0]?.total || '0', 10);
    } catch {
      // Count query failed, skip total count
    }
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
