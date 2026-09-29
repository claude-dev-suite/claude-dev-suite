// SPDX-License-Identifier: MIT
/**
 * execute_query — one read-only statement, row-capped.
 *
 * Read-only is enforced by the engine (see drivers/*), not by looking at the
 * SQL: `WITH … SELECT`, `VALUES`, `TABLE`, `SHOW`, `PRAGMA`, leading comments
 * all work, and a write fails with the engine's own read-only error.
 *
 * Row cap: when the statement has no top-level LIMIT/OFFSET/FETCH a
 * `LIMIT n+1 OFFSET o` is appended on a new line (after stripping the trailing
 * `;` — the old code appended after it); otherwise the statement is wrapped in
 * a subquery. Appending is preferred over always wrapping because MySQL
 * rejects duplicate column names in a derived table and MariaDB discards an
 * ORDER BY inside one. One extra row tells whether more exist, so no COUNT(*)
 * re-execution is needed unless `includeTotalCount` asks for it.
 */

import { maxRowsCap } from "../config.js";
import { getDriver } from "../drivers/index.js";
import { analyzeStatement, isTransactionControl } from "../sql-lexer.js";
import { serializeRows } from "../serialize.js";
import { QuerySchema, jsonResponse, errorResponse, type Handler } from "./types.js";

export const DEFAULT_QUERY_LIMIT = 1000;

export interface PlannedQuery {
  sql: string;
  strategy: "appended-limit" | "wrapped" | "as-is";
  fetch: number;
  jsOffset: number;
}

/** Decide how to cap a statement. Pure — exported for tests. */
export function planQuery(sql: string, engine: "postgres" | "mysql" | "sqlite", limit: number, offset: number): PlannedQuery & { info: ReturnType<typeof analyzeStatement> } {
  const info = analyzeStatement(sql, engine);
  const fetch = limit + 1;
  if (info.rowReturning && !info.hasTopLevelLimit) {
    return {
      info,
      sql: `${info.text}\nLIMIT ${fetch}${offset > 0 ? ` OFFSET ${offset}` : ""}`,
      strategy: "appended-limit",
      fetch,
      jsOffset: 0,
    };
  }
  if (info.rowReturning) {
    return {
      info,
      sql: `SELECT * FROM (\n${info.text}\n) AS _dsq_capped LIMIT ${fetch}${offset > 0 ? ` OFFSET ${offset}` : ""}`,
      strategy: "wrapped",
      fetch,
      jsOffset: 0,
    };
  }
  // SHOW / PRAGMA / EXPLAIN / DESCRIBE …: cannot be wrapped; cap client-side.
  return { info, sql: info.text, strategy: "as-is", fetch: offset + fetch, jsOffset: offset };
}

export function readOnlyHint(message: string): string {
  if (/read-only transaction|READ ONLY transaction|readonly database|query_only|read only/i.test(message)) {
    return `${message} — execute_query is read-only; use execute_write on a connection marked writable.`;
  }
  return message;
}

export const handleExecuteQuery: Handler = async (args) => {
  const { sql, params, limit, offset, includeTotalCount, maxCellChars, connection } = QuerySchema.parse(args);
  const driver = getDriver(connection);
  const cap = maxRowsCap();
  const lim = Math.min(limit ?? DEFAULT_QUERY_LIMIT, cap);
  const plan = planQuery(sql, driver.engine, lim, offset);

  if (!plan.info.text) return errorResponse("No SQL statement found (only comments/whitespace?)");
  if (isTransactionControl(plan.info.text, driver.engine)) {
    return errorResponse("Transaction control statements are not allowed: execute_query manages its own read-only transaction");
  }
  if (plan.info.multiple) {
    return errorResponse(
      "execute_query runs exactly one statement; split the script into separate calls (or use execute_write for writes)"
    );
  }

  try {
    const { result, totalCount, countError } = await driver.withSession("read", async (s) => {
      const result = await s.query(plan.sql, params ?? [], { maxRows: plan.fetch });
      let totalCount: number | undefined;
      let countError: string | undefined;
      if (includeTotalCount) {
        if (!plan.info.rowReturning) countError = "totalCount is only available for SELECT-like statements";
        else {
          try {
            const c = await s.query(`SELECT COUNT(*) AS total FROM (\n${plan.info.text}\n) AS _dsq_count`, params ?? []);
            totalCount = Number(c.rows[0]?.total ?? 0);
          } catch (e) {
            countError = (e as Error).message;
          }
        }
      }
      return { result, totalCount, countError };
    });

    let rows = result.rows;
    if (plan.jsOffset) rows = rows.slice(plan.jsOffset);
    const hasMore = rows.length > lim || result.truncated;
    if (rows.length > lim) rows = rows.slice(0, lim);
    const serialized = serializeRows(rows, maxCellChars);

    return jsonResponse({
      connection: driver.config.name,
      engine: driver.engine,
      columns: result.columns,
      rows: serialized.rows,
      rowCount: serialized.rows.length,
      limit: lim,
      offset,
      hasMore,
      truncated: hasMore,
      ...(hasMore ? { nextOffset: offset + serialized.rows.length } : {}),
      ...(totalCount !== undefined ? { totalCount } : {}),
      ...(countError ? { totalCountError: countError } : {}),
      ...(serialized.truncatedCells ? { truncatedCells: serialized.truncatedCells, maxCellChars } : {}),
      ...(limit !== undefined && limit > cap ? { note: `limit capped at DB_MAX_ROWS=${cap}` } : {}),
      capStrategy: plan.strategy,
    });
  } catch (e) {
    throw new Error(readOnlyHint((e as Error).message));
  }
};
