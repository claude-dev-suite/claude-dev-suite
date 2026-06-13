// SPDX-License-Identifier: MIT
/**
 * Handler for explain_query tool
 */

import { ExplainQuerySchema, jsonResponse, errorResponse, type Handler, type HandlerResult } from "./types.js";
import { getPool } from "./db.js";

export const handleExplainQuery: Handler = async (args): Promise<HandlerResult> => {
  const { sql, params: queryParams, verbose, format } = ExplainQuerySchema.parse(args);

  // Safety check: only allow SELECT queries
  const normalizedSql = sql.trim().toLowerCase();
  if (!normalizedSql.startsWith("select")) {
    return errorResponse("Only SELECT queries can be explained for safety");
  }

  const db = getPool();

  // Build EXPLAIN command
  const explainOptions = ["ANALYZE", "BUFFERS"];
  if (verbose) explainOptions.push("VERBOSE");
  if (format === "json") explainOptions.push("FORMAT JSON");

  const explainSql = `EXPLAIN (${explainOptions.join(", ")}) ${sql}`;

  // ── Security boundary: read-only transaction ──────────────────────────────
  // EXPLAIN ANALYZE actually executes the query, so wrapping in a read-only
  // transaction prevents any side-effects from write operations embedded in
  // CTEs or sub-selects.  The transaction is always rolled back so that
  // ANALYZE's side-effects (e.g. temporary rows) are never committed.
  const client = await db.connect();
  let result: import("pg").QueryResult;
  try {
    await client.query("BEGIN");
    await client.query("SET TRANSACTION READ ONLY");
    result = await client.query(explainSql, queryParams || []);
    await client.query("ROLLBACK");
  } catch (err) {
    try { await client.query("ROLLBACK"); } catch { /* ignore rollback errors */ }
    throw err;
  } finally {
    client.release();
  }

  // Parse results and extract insights
  let plan: unknown;
  let insights: string[] = [];

  if (format === "json" && result.rows[0]) {
    plan = result.rows[0]["QUERY PLAN"];

    // Analyze the plan for common issues
    const planStr = JSON.stringify(plan);

    if (planStr.includes('"Node Type":"Seq Scan"')) {
      insights.push("Sequential scan detected - consider adding an index");
    }
    if (planStr.includes('"Node Type":"Hash Join"')) {
      insights.push("Hash join detected - may benefit from index on join columns");
    }
    if (planStr.includes('"Rows Removed by Filter"')) {
      insights.push("Rows filtered after fetch - index might help reduce scanned rows");
    }

    // Extract timing info
    const totalTimeMatch = planStr.match(/"Execution Time":\s*([\d.]+)/);
    if (totalTimeMatch) {
      const execTime = parseFloat(totalTimeMatch[1]);
      if (execTime > 100) {
        insights.push(`Slow query: ${execTime.toFixed(2)}ms execution time`);
      }
    }
  } else {
    plan = result.rows.map(r => r["QUERY PLAN"]).join("\n");
  }

  // Get index suggestions based on the query
  const tables: string[] = [];
  for (const match of sql.matchAll(/FROM\s+(\w+)/gi)) {
    if (match[1]) tables.push(match[1]);
  }

  const whereColumns: string[] = [];
  for (const match of sql.matchAll(/WHERE\s+(\w+)\s*[=<>]/gi)) {
    if (match[1]) whereColumns.push(match[1]);
  }

  if (whereColumns.length > 0) {
    insights.push(`Consider indexes on: ${whereColumns.join(', ')}`);
  }

  return jsonResponse({
    query: sql,
    plan,
    insights,
    suggestions: insights.length > 0 ? insights : ["Query plan looks efficient"],
  });
};
