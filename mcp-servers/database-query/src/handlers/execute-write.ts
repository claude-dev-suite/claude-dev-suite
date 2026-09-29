// SPDX-License-Identifier: MIT
/**
 * execute_write — DML/DDL on a connection explicitly marked writable.
 *
 * Two gates: the connection must be writable (operator opt-in) AND the call
 * must pass confirm:true. Without confirm the call is a dry run:
 *   - PostgreSQL / SQLite (transactional DDL): the statements really run in a
 *     transaction that is ROLLED BACK, so the preview reports the exact
 *     per-statement outcome (affected rows, errors) of the real run;
 *   - MySQL/MariaDB: nothing is executed (DDL auto-commits and MyISAM ignores
 *     ROLLBACK, so a "dry" execution could be permanent); DML is EXPLAINed.
 */

import { getDriver } from "../drivers/index.js";
import type { Session } from "../drivers/types.js";
import { isTransactionControl, splitStatements, tokenize } from "../sql-lexer.js";
import { serializeRows } from "../serialize.js";
import { WriteSchema, jsonResponse, errorResponse, type Handler } from "./types.js";

export interface StatementClass {
  keyword: string;
  kind: "dml" | "ddl" | "other";
  destructive: boolean;
  reasons: string[];
}

const DDL = new Set(["CREATE", "ALTER", "DROP", "TRUNCATE", "RENAME", "COMMENT", "GRANT", "REVOKE", "REINDEX", "CLUSTER", "VACUUM"]);
const DML = new Set(["INSERT", "UPDATE", "DELETE", "MERGE", "REPLACE", "UPSERT", "COPY", "WITH"]);

/** Classify a statement and flag the ones that destroy data. Pure. */
export function classifyStatement(sql: string, engine: "postgres" | "mysql" | "sqlite"): StatementClass {
  const toks = tokenize(sql, engine).filter((t) => t.type !== "ws" && t.type !== "comment");
  const words = toks.filter((t) => t.type === "word");
  const keyword = words[0]?.text.toUpperCase() ?? "";
  const top = words.filter((t) => t.depth === 0).map((t) => t.text.toUpperCase());
  const reasons: string[] = [];
  if (keyword === "DROP") reasons.push("DROP removes an object and its data");
  if (keyword === "TRUNCATE") reasons.push("TRUNCATE deletes every row");
  if (keyword === "ALTER" && top.includes("DROP")) reasons.push("ALTER … DROP removes a column/constraint");
  // main verb of a WITH … statement
  const verb = keyword === "WITH" ? top.find((w) => ["INSERT", "UPDATE", "DELETE", "MERGE", "SELECT"].includes(w)) ?? "" : keyword;
  if ((verb === "DELETE" || verb === "UPDATE") && !top.includes("WHERE")) {
    reasons.push(`${verb} without a WHERE clause affects every row`);
  }
  const kind = DDL.has(keyword) ? "ddl" : DML.has(keyword) ? "dml" : "other";
  return { keyword, kind, destructive: reasons.length > 0, reasons };
}

async function runAll(s: Session, stmts: string[], params: unknown[]) {
  const results: Array<Record<string, unknown>> = [];
  for (const [i, stmt] of stmts.entries()) {
    const r = await s.query(stmt, stmts.length === 1 ? params : [], { maxRows: 100 });
    const entry: Record<string, unknown> = { index: i, affectedRows: r.affectedRows };
    if (r.columns.length) {
      entry.returning = serializeRows(r.rows).rows;
      if (r.truncated) entry.returningTruncated = true;
    }
    results.push(entry);
  }
  return results;
}

export const handleExecuteWrite: Handler = async (args) => {
  const { sql, params, confirm, connection } = WriteSchema.parse(args);
  const driver = getDriver(connection);
  const engine = driver.engine;
  const stmts = splitStatements(sql, engine);
  if (!stmts.length) return errorResponse("No SQL statement found");
  const txn = stmts.find((s) => isTransactionControl(s, engine));
  if (txn) {
    return errorResponse(
      `Transaction control ("${txn.slice(0, 40)}") is not allowed: execute_write runs all statements in one transaction it commits (or rolls back for a dry run) itself`
    );
  }
  if (params && params.length && stmts.length > 1) {
    return errorResponse("Bind parameters are only supported with a single statement");
  }
  const classes = stmts.map((s) => classifyStatement(s, engine));
  const summary = stmts.map((s, i) => ({ index: i, sql: s.length > 500 ? `${s.slice(0, 500)}…` : s, ...classes[i] }));
  const destructive = classes.some((c) => c.destructive);
  const warnings: string[] = [];
  if (engine === "mysql" && classes.some((c) => c.kind === "ddl")) {
    warnings.push("MySQL/MariaDB DDL commits implicitly: statements before and including a DDL cannot be rolled back if a later one fails.");
  }

  if (driver.config.readOnly) {
    return errorResponse(
      `Connection "${driver.config.name}" is read-only. Mark it writable (DATABASE_ALLOW_WRITES=true for DATABASE_URL, or "readOnly": false in DATABASE_URLS).`,
      { statements: summary }
    );
  }

  if (!confirm) {
    if (engine === "mysql") {
      const plans: Array<Record<string, unknown>> = [];
      await driver.withSession("read", async (s) => {
        for (const [i, stmt] of stmts.entries()) {
          if (classes[i].kind !== "dml") {
            plans.push({ index: i, note: "not executed in dry run (DDL / non-DML statements auto-commit on MySQL)" });
            continue;
          }
          try {
            const r = await s.query(`EXPLAIN ${stmt}`, stmts.length === 1 ? params ?? [] : []);
            plans.push({ index: i, explain: serializeRows(r.rows).rows });
          } catch (e) {
            plans.push({ index: i, error: (e as Error).message });
          }
        }
      });
      return jsonResponse({
        dryRun: true,
        executed: false,
        connection: driver.config.name,
        engine,
        destructive,
        statements: summary,
        plans,
        warnings,
        next: "Re-run with confirm: true to execute.",
      });
    }
    // Postgres / SQLite: run for real inside a transaction, then roll back.
    let outcome: Array<Record<string, unknown>> = [];
    let error: string | null = null;
    try {
      outcome = await driver.withSession("write", (s) => runAll(s, stmts, params ?? []), { commit: false });
    } catch (e) {
      error = (e as Error).message;
    }
    return jsonResponse({
      dryRun: true,
      executed: "in a transaction that was rolled back — nothing was changed",
      connection: driver.config.name,
      engine,
      destructive,
      statements: summary,
      ...(error ? { wouldFail: error } : { results: outcome }),
      warnings,
      next: error ? "Fix the error before running with confirm: true." : "Re-run with confirm: true to commit.",
    });
  }

  const results = await driver.withSession("write", (s) => runAll(s, stmts, params ?? []));
  return jsonResponse({
    executed: true,
    committed: true,
    connection: driver.config.name,
    engine,
    destructive,
    statements: summary,
    results,
    warnings,
  });
};
