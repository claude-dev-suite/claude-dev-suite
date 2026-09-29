// SPDX-License-Identifier: MIT
/**
 * explain_query — plan without executing (default), or EXPLAIN ANALYZE on
 * request. ANALYZE really runs the statement, so it happens inside a
 * read-only transaction that is rolled back, and a write is refused by the
 * engine.
 */

import { getDriver } from "../drivers/index.js";
import { UnsupportedError } from "../drivers/types.js";
import { analyzeStatement } from "../sql-lexer.js";
import { serializeRows } from "../serialize.js";
import { ExplainQuerySchema, jsonResponse, errorResponse, type Handler } from "./types.js";

export interface PlanSummary {
  totalCost?: number | null;
  estimatedRows?: number | null;
  planningTimeMs?: number | null;
  executionTimeMs?: number | null;
  nodeTypes: Record<string, number>;
  fullScans: Array<{ table: string; estimatedRows?: number | null; actualRows?: number | null; filter?: string | null }>;
  misestimates: Array<{ node: string; estimatedRows: number; actualRows: number }>;
  warnings: string[];
}

type PgNode = Record<string, unknown> & { Plans?: PgNode[] };

/** Summarise a Postgres FORMAT JSON plan. Pure. */
export function summarizePostgresPlan(json: unknown): PlanSummary {
  const root = (Array.isArray(json) ? json[0] : json) as Record<string, unknown> | undefined;
  const plan = root?.Plan as PgNode | undefined;
  const summary: PlanSummary = {
    totalCost: (plan?.["Total Cost"] as number) ?? null,
    estimatedRows: (plan?.["Plan Rows"] as number) ?? null,
    planningTimeMs: (root?.["Planning Time"] as number) ?? null,
    executionTimeMs: (root?.["Execution Time"] as number) ?? null,
    nodeTypes: {},
    fullScans: [],
    misestimates: [],
    warnings: [],
  };
  const walk = (n: PgNode | undefined) => {
    if (!n) return;
    const type = String(n["Node Type"] ?? "?");
    summary.nodeTypes[type] = (summary.nodeTypes[type] ?? 0) + 1;
    const loops = Number(n["Actual Loops"] ?? 1) || 1;
    const actual = n["Actual Rows"] !== undefined ? Number(n["Actual Rows"]) * loops : null;
    const est = n["Plan Rows"] !== undefined ? Number(n["Plan Rows"]) * loops : null;
    if (type === "Seq Scan") {
      summary.fullScans.push({
        table: String(n["Relation Name"] ?? "?"),
        estimatedRows: est,
        actualRows: actual,
        filter: (n["Filter"] as string) ?? null,
      });
    }
    if (actual !== null && est !== null && Math.max(actual, est) >= 1000) {
      const ratio = Math.max(actual, 1) / Math.max(est, 1);
      if (ratio >= 10 || ratio <= 0.1) summary.misestimates.push({ node: type, estimatedRows: est, actualRows: actual });
    }
    if (n["Sort Space Type"] === "Disk") summary.warnings.push(`Sort spilled to disk (${n["Sort Space Used"]} kB) — consider work_mem or an index`);
    if (Number(n["Rows Removed by Filter"] ?? 0) > 10000)
      summary.warnings.push(`${type} on ${n["Relation Name"] ?? "?"} discarded ${n["Rows Removed by Filter"]} rows by filter — an index on the filter columns may help`);
    for (const c of n.Plans ?? []) walk(c);
  };
  walk(plan);
  for (const s of summary.fullScans) {
    const rows = s.actualRows ?? s.estimatedRows ?? 0;
    if (rows >= 10000) summary.warnings.push(`Sequential scan on ${s.table} (~${rows} rows)${s.filter ? ` with filter ${s.filter}` : ""}`);
  }
  if (summary.misestimates.length) summary.warnings.push("Row estimates are off by 10x or more — run ANALYZE on the tables involved");
  return summary;
}

/** Summarise MySQL/MariaDB FORMAT=JSON plans. Pure. */
export function summarizeMysqlPlan(json: unknown): PlanSummary {
  const summary: PlanSummary = { nodeTypes: {}, fullScans: [], misestimates: [], warnings: [] };
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== "object") return;
    const o = v as Record<string, unknown>;
    if (typeof o.table_name === "string" && typeof o.access_type === "string") {
      summary.nodeTypes[o.access_type] = (summary.nodeTypes[o.access_type] ?? 0) + 1;
      if (o.access_type === "ALL") {
        const rows = Number(o.rows_examined_per_scan ?? o.rows ?? 0);
        summary.fullScans.push({ table: o.table_name, estimatedRows: rows, filter: (o.attached_condition as string) ?? null });
        if (rows >= 10000) summary.warnings.push(`Full table scan on ${o.table_name} (~${rows} rows)`);
      }
    }
    const cost = (o.cost_info as Record<string, unknown> | undefined)?.query_cost;
    if (cost !== undefined && summary.totalCost === undefined) summary.totalCost = Number(cost);
    if (o.using_filesort === true) summary.warnings.push("Using filesort");
    if (o.using_temporary_table === true) summary.warnings.push("Using temporary table");
    for (const val of Object.values(o)) if (val && typeof val === "object") walk(val);
  };
  walk(json);
  return summary;
}

/** Summarise SQLite EXPLAIN QUERY PLAN rows. Pure. */
export function summarizeSqlitePlan(rows: Array<Record<string, unknown>>): PlanSummary {
  const summary: PlanSummary = { nodeTypes: {}, fullScans: [], misestimates: [], warnings: [] };
  for (const r of rows) {
    const detail = String(r.detail ?? "");
    const verb = detail.split(" ")[0];
    summary.nodeTypes[verb] = (summary.nodeTypes[verb] ?? 0) + 1;
    const m = /^SCAN (?:TABLE )?(\S+)(.*)$/.exec(detail);
    if (m && !/COVERING INDEX|USING INDEX/.test(m[2])) {
      summary.fullScans.push({ table: m[1] });
      summary.warnings.push(`Full scan of ${m[1]}`);
    }
    if (/USE TEMP B-TREE/.test(detail)) summary.warnings.push(detail);
  }
  return summary;
}

export const handleExplainQuery: Handler = async (args) => {
  const { sql, params, analyze, verbose, format, connection } = ExplainQuerySchema.parse(args);
  const driver = getDriver(connection);
  const e = driver.engine;
  const info = analyzeStatement(sql, e);
  if (!info.text) return errorResponse("No SQL statement found");
  if (info.multiple) return errorResponse("explain_query takes exactly one statement");
  const text = info.text;
  const p = params ?? [];

  if (e === "sqlite") {
    if (analyze) throw new UnsupportedError("SQLite has no EXPLAIN ANALYZE; use analyze: false (EXPLAIN QUERY PLAN)");
    const rows = await driver.withSession("read", async (s) => (await s.query(`EXPLAIN QUERY PLAN ${text}`, p)).rows);
    const summary = summarizeSqlitePlan(rows);
    return jsonResponse({ connection: driver.config.name, engine: e, analyzed: false, plan: serializeRows(rows).rows, summary });
  }

  if (e === "postgres") {
    const opts = ["FORMAT " + (format === "json" ? "JSON" : "TEXT")];
    if (analyze) opts.push("ANALYZE", "BUFFERS");
    if (verbose) opts.push("VERBOSE");
    const rows = await driver.withSession("read", async (s) => (await s.query(`EXPLAIN (${opts.join(", ")}) ${text}`, p)).rows);
    if (format === "json") {
      let plan = rows[0]?.["QUERY PLAN"];
      if (typeof plan === "string") plan = JSON.parse(plan);
      return jsonResponse({ connection: driver.config.name, engine: e, analyzed: analyze, summary: summarizePostgresPlan(plan), plan });
    }
    const lines = rows.map((r) => String(r["QUERY PLAN"]));
    return jsonResponse({ connection: driver.config.name, engine: e, analyzed: analyze, plan: lines.join("\n") });
  }

  // MySQL / MariaDB
  const maria = /mariadb/i.test(await driver.serverVersion());
  let stmt: string;
  if (analyze) stmt = maria ? `ANALYZE FORMAT=JSON ${text}` : `EXPLAIN ANALYZE ${text}`;
  else stmt = format === "json" ? `EXPLAIN FORMAT=JSON ${text}` : `EXPLAIN ${text}`;
  const rows = await driver.withSession("read", async (s) => (await s.query(stmt, p)).rows);
  const first = rows[0] ? Object.values(rows[0])[0] : undefined;
  if ((analyze && maria) || (!analyze && format === "json")) {
    const plan = typeof first === "string" ? JSON.parse(first) : first;
    return jsonResponse({ connection: driver.config.name, engine: e, analyzed: analyze, summary: summarizeMysqlPlan(plan), plan });
  }
  if (analyze) {
    // MySQL EXPLAIN ANALYZE returns a text tree.
    return jsonResponse({ connection: driver.config.name, engine: e, analyzed: true, plan: String(first ?? "") });
  }
  return jsonResponse({ connection: driver.config.name, engine: e, analyzed: false, plan: serializeRows(rows).rows });
};
