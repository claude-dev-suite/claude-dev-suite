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
  const result = await db.query(explainSql, queryParams || []);

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
  const tableMatches = sql.match(/FROM\s+(\w+)/gi) || [];
  const tables = tableMatches.map(m => m.replace(/^FROM\s+/i, ''));

  const whereMatches = sql.match(/WHERE\s+(\w+)\s*[=<>]/gi) || [];
  const whereColumns = whereMatches.map(m => {
    let s = m;
    let prev;
    do { prev = s; s = s.replace(/WHERE\s+/gi, ''); } while (s !== prev);
    return s.replace(/\s*[=<>].*/, '');
  });

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
