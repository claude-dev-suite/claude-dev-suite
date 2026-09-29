// SPDX-License-Identifier: MIT
/**
 * find_slow_queries, index_recommendations, health_check.
 *
 * Every sub-check is independent: a missing extension, a privilege error or
 * an old server version turns THAT check into an explicit `unavailable`
 * entry with the reason — never into an empty "all good" result.
 */

import { type Driver, type Session, isolated } from "../drivers/types.js";
import { getDriver, requireEngine } from "../drivers/index.js";
import { introspectorFor, resolveSchema } from "../introspect/index.js";
import type { IndexDef, TableDef } from "../introspect/types.js";
import { qualified, quoteIdent } from "../sql-lexer.js";
import { serializeRows } from "../serialize.js";
import { TOOL_ENGINES } from "../tool-engines.js";
import {
  FindSlowQueriesSchema,
  HealthCheckSchema,
  IndexRecommendationsSchema,
  jsonResponse,
  type Handler,
} from "./types.js";

type Status = "ok" | "warn" | "critical" | "unavailable";
interface Check {
  name: string;
  status: Status;
  message?: string;
  details?: unknown;
}

async function check(s: Session, name: string, fn: () => Promise<Omit<Check, "name">>): Promise<Check> {
  try {
    return { name, ...(await isolated(s, fn)) };
  } catch (e) {
    return { name, status: "unavailable", message: (e as Error).message };
  }
}

const rowsOf = (r: { rows: Record<string, unknown>[] }) => serializeRows(r.rows, 500).rows;

// ---------------------------------------------------------------------------
// find_slow_queries
// ---------------------------------------------------------------------------

export const PG_STAT_STATEMENTS_HOWTO = [
  "Add pg_stat_statements to shared_preload_libraries in postgresql.conf (managed services: parameter group / flags) and restart",
  "Run CREATE EXTENSION pg_stat_statements; in this database",
  "Grant pg_read_all_stats to this role to see other users' query text",
];

async function pgSlow(s: Session, table: string | undefined, orderBy: string, limit: number) {
  const ext = await s.query(
    `SELECT e.extversion AS version, n.nspname AS schema
       FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'pg_stat_statements'`
  );
  let statements: Record<string, unknown>;
  if (!ext.rows.length) {
    const preload = await s.query("SELECT current_setting('shared_preload_libraries') AS v");
    statements = {
      status: "unavailable",
      reason: "pg_stat_statements extension is not installed in this database",
      sharedPreloadLibraries: preload.rows[0]?.v ?? "",
      howToEnable: PG_STAT_STATEMENTS_HOWTO,
    };
  } else {
    const extSchema = String(ext.rows[0].schema);
    const view = `${quoteIdent(extSchema, "postgres")}.pg_stat_statements`;
    const cols = await s.query(
      `SELECT attname FROM pg_attribute WHERE attrelid = to_regclass($1) AND attnum > 0`,
      [`${quoteIdent(extSchema, "postgres")}.pg_stat_statements`]
    );
    const names = new Set(cols.rows.map((r) => String(r.attname)));
    const total = names.has("total_exec_time") ? "total_exec_time" : "total_time";
    const mean = names.has("mean_exec_time") ? "mean_exec_time" : "mean_time";
    const order = { total_time: total, mean_time: mean, calls: "calls", rows: "rows" }[orderBy] ?? total;
    const params: unknown[] = [limit];
    let filter = "";
    if (table) {
      params.push(`%${table}%`);
      filter = " AND s.query ILIKE $2";
    }
    try {
      const r = await isolated(s, () => s.query(
        `SELECT s.queryid::text AS queryid, left(s.query, 2000) AS query, s.calls,
                round(s.${total}::numeric, 2) AS total_ms, round(s.${mean}::numeric, 2) AS mean_ms, s.rows,
                round(100.0 * s.shared_blks_hit / nullif(s.shared_blks_hit + s.shared_blks_read, 0), 2) AS cache_hit_pct
           FROM ${view} s
          WHERE s.dbid = (SELECT oid FROM pg_database WHERE datname = current_database())${filter}
          ORDER BY s.${order} DESC NULLS LAST
          LIMIT $1`,
        params
      ));
      const rows = rowsOf(r);
      statements = {
        status: "ok",
        source: `pg_stat_statements ${ext.rows[0].version}`,
        orderBy,
        queries: rows,
        count: rows.length,
        ...(rows.some((x) => String(x.query).includes("insufficient privilege"))
          ? { note: "Some query texts are hidden: grant pg_read_all_stats to this role" }
          : {}),
      };
    } catch (e) {
      statements = { status: "unavailable", reason: (e as Error).message, howToEnable: PG_STAT_STATEMENTS_HOWTO };
    }
  }

  const tp: unknown[] = [];
  let tf = "";
  if (table) {
    tp.push(table);
    tf = "WHERE relname = $1";
  }
  const scans = await s.query(
    `SELECT schemaname AS schema, relname AS table, seq_scan, seq_tup_read, idx_scan, n_live_tup,
            CASE WHEN seq_scan > 0 THEN round(seq_tup_read::numeric / seq_scan) END AS avg_rows_per_seq_scan
       FROM pg_stat_user_tables ${tf}
      ORDER BY seq_tup_read DESC NULLS LAST LIMIT ${limit}`,
    tp
  );
  return {
    statements,
    tableScanStats: {
      note: "Cumulative table access counters (heuristic — not per-query). High seq_tup_read with low idx_scan suggests missing indexes.",
      tables: rowsOf(scans),
    },
  };
}

async function mysqlSlow(s: Session, table: string | undefined, orderBy: string, limit: number) {
  const ps = await s.query("SELECT @@performance_schema AS on_");
  let statements: Record<string, unknown>;
  if (Number(ps.rows[0]?.on_) !== 1) {
    statements = {
      status: "unavailable",
      reason: "performance_schema is disabled",
      howToEnable: ["Set performance_schema=ON in my.cnf (MariaDB: off by default) and restart the server"],
    };
  } else {
    const order =
      { total_time: "SUM_TIMER_WAIT", mean_time: "AVG_TIMER_WAIT", calls: "COUNT_STAR", rows: "SUM_ROWS_SENT" }[orderBy] ??
      "SUM_TIMER_WAIT";
    const params: unknown[] = [];
    let filter = "";
    if (table) {
      filter = " AND DIGEST_TEXT LIKE ?";
      params.push(`%${table}%`);
    }
    try {
      const r = await s.query(
        `SELECT DIGEST AS digest, LEFT(DIGEST_TEXT, 2000) AS query, COUNT_STAR AS calls,
                ROUND(SUM_TIMER_WAIT / 1e9, 2) AS total_ms, ROUND(AVG_TIMER_WAIT / 1e9, 2) AS mean_ms,
                SUM_ROWS_SENT AS rows_sent, SUM_ROWS_EXAMINED AS rows_examined, SUM_NO_INDEX_USED AS no_index_used
           FROM performance_schema.events_statements_summary_by_digest
          WHERE SCHEMA_NAME = DATABASE()${filter}
          ORDER BY ${order} DESC LIMIT ${limit}`,
        params
      );
      statements = { status: "ok", source: "performance_schema.events_statements_summary_by_digest", orderBy, queries: rowsOf(r) };
    } catch (e) {
      statements = { status: "unavailable", reason: (e as Error).message };
    }
  }
  return { statements };
}

export const handleFindSlowQueries: Handler = async (args) => {
  const { table, orderBy, limit, connection } = FindSlowQueriesSchema.parse(args ?? {});
  const driver = getDriver(connection);
  requireEngine(driver, "find_slow_queries", TOOL_ENGINES.find_slow_queries);
  const result = await driver.withSession("read", (s) =>
    driver.engine === "postgres" ? pgSlow(s, table, orderBy, limit) : mysqlSlow(s, table, orderBy, limit)
  );
  return jsonResponse({ connection: driver.config.name, engine: driver.engine, ...(table ? { table } : {}), ...result });
};

// ---------------------------------------------------------------------------
// index_recommendations
// ---------------------------------------------------------------------------

const plainCols = (i: IndexDef) => i.columns.map((c) => c.replace(/^"|"$/g, ""));

/** Duplicate / redundant indexes and unindexed foreign keys. Pure. */
export function analyzeIndexes(tables: TableDef[]) {
  const duplicates: Array<Record<string, unknown>> = [];
  const redundant: Array<Record<string, unknown>> = [];
  const unindexedForeignKeys: Array<Record<string, unknown>> = [];
  for (const t of tables) {
    // "(expression)" is a placeholder where the engine does not expose the
    // expression text (MySQL/SQLite) — such indexes cannot be compared.
    const idx = t.indexes.filter((i) => !i.columns.includes("(expression)"));
    const sameShape = (a: IndexDef, b: IndexDef) =>
      (a.method ?? "") === (b.method ?? "") && (a.predicate ?? "").replace(/\s+/g, " ") === (b.predicate ?? "").replace(/\s+/g, " ");
    for (let i = 0; i < idx.length; i++) {
      for (let j = i + 1; j < idx.length; j++) {
        const a = idx[i];
        const b = idx[j];
        if (!sameShape(a, b)) continue;
        const ac = plainCols(a).join(",");
        const bc = plainCols(b).join(",");
        if (ac === bc) {
          // keep the one backing a constraint / the unique one
          const drop = a.constraintBacked || a.unique ? b : b.constraintBacked || b.unique ? a : b;
          const keep = drop === a ? b : a;
          if (drop.constraintBacked) continue; // both back constraints; leave alone
          duplicates.push({ table: t.name, drop: drop.name, keep: keep.name, columns: plainCols(a) });
        }
      }
    }
    for (const a of idx) {
      if (a.unique || a.primary || a.constraintBacked) continue;
      const ac = plainCols(a);
      const cover = idx.find((b) => b !== a && sameShape(a, b) && plainCols(b).length > ac.length && ac.every((c, k) => plainCols(b)[k] === c));
      if (cover) redundant.push({ table: t.name, index: a.name, columns: ac, coveredBy: cover.name, coveredByColumns: plainCols(cover) });
    }
    for (const fk of t.foreignKeys) {
      const n = fk.columns.length;
      const covered = t.indexes.some((i) => {
        const lead = plainCols(i).slice(0, n);
        return lead.length === n && fk.columns.every((c) => lead.includes(c));
      });
      if (!covered) unindexedForeignKeys.push({ table: t.name, foreignKey: fk.name, columns: fk.columns, references: fk.refTable });
    }
  }
  // a pair flagged as duplicate is not also "redundant"
  const dupNames = new Set(duplicates.map((d) => `${d.table}.${d.drop}`));
  return {
    duplicates,
    redundant: redundant.filter((r) => !dupNames.has(`${r.table}.${r.index}`)),
    unindexedForeignKeys,
  };
}

async function pgUnusedIndexes(s: Session, schema: string) {
  const r = await s.query(
    `SELECT s.relname AS table, s.indexrelname AS index, s.idx_scan, pg_relation_size(s.indexrelid) AS bytes,
            pg_size_pretty(pg_relation_size(s.indexrelid)) AS size
       FROM pg_stat_user_indexes s
       JOIN pg_index ix ON ix.indexrelid = s.indexrelid
      WHERE s.schemaname = $1 AND s.idx_scan = 0 AND NOT ix.indisunique AND NOT ix.indisprimary
        AND NOT EXISTS (SELECT 1 FROM pg_constraint c WHERE c.conindid = ix.indexrelid)
      ORDER BY pg_relation_size(s.indexrelid) DESC LIMIT 50`,
    [schema]
  );
  const reset = await s.query("SELECT stats_reset FROM pg_stat_database WHERE datname = current_database()");
  return {
    status: "ok",
    statsSince: serializeRows(reset.rows).rows[0]?.stats_reset ?? "server start",
    note: "idx_scan counts since the last stats reset on THIS server; check replicas before dropping",
    indexes: rowsOf(r),
  };
}

async function pgSeqScanHeavy(s: Session, schema: string) {
  const r = await s.query(
    `SELECT relname AS table, seq_scan, seq_tup_read, idx_scan, n_live_tup
       FROM pg_stat_user_tables
      WHERE schemaname = $1 AND n_live_tup > 10000 AND seq_scan > coalesce(idx_scan, 0)
      ORDER BY seq_tup_read DESC LIMIT 20`,
    [schema]
  );
  return rowsOf(r);
}

export const handleIndexRecommendations: Handler = async (args) => {
  const { schema, connection } = IndexRecommendationsSchema.parse(args ?? {});
  const driver = getDriver(connection);
  const e = driver.engine;
  const intro = introspectorFor(e);
  const out = await driver.withSession("read", async (s) => {
    const sch = await resolveSchema(s, schema);
    const { tables } = await intro.tables(s, sch);
    const base = analyzeIndexes(tables.filter((t) => t.kind === "table" || t.kind === "partitioned_table"));
    let unused: Record<string, unknown>;
    let seqScanHeavy: unknown = undefined;
    if (e === "postgres") {
      unused = await isolated(s, () => pgUnusedIndexes(s, sch)).catch((err: Error) => ({ status: "unavailable", reason: err.message }));
      seqScanHeavy = await isolated(s, () => pgSeqScanHeavy(s, sch)).catch((err: Error) => ({
        status: "unavailable",
        reason: err.message,
      }));
    } else if (e === "mysql") {
      unused = await s
        .query("SELECT object_name AS `table`, index_name AS `index` FROM sys.schema_unused_indexes WHERE object_schema = ?", [sch])
        .then((r) => ({ status: "ok", note: "usage since server start (performance_schema)", indexes: rowsOf(r) }))
        .catch((err: Error) => ({ status: "unavailable", reason: `sys.schema_unused_indexes: ${err.message}` }));
    } else {
      unused = { status: "unavailable", reason: "SQLite keeps no index usage statistics" };
    }
    return { sch, base, unused, seqScanHeavy };
  });

  const suggestions: string[] = [];
  const q = (n: string) => qualified(out.sch, n, e);
  const conc = e === "postgres" ? " CONCURRENTLY" : "";
  for (const d of out.base.duplicates)
    suggestions.push(e === "mysql" ? `ALTER TABLE ${q(String(d.table))} DROP INDEX ${quoteIdent(String(d.drop), e)};` : `DROP INDEX${conc} ${q(String(d.drop))};`);
  for (const r of out.base.redundant)
    suggestions.push(e === "mysql" ? `ALTER TABLE ${q(String(r.table))} DROP INDEX ${quoteIdent(String(r.index), e)};` : `DROP INDEX${conc} ${q(String(r.index))};`);
  for (const f of out.base.unindexedForeignKeys)
    suggestions.push(
      `CREATE INDEX${conc} ${quoteIdent(`idx_${f.table}_${(f.columns as string[]).join("_")}`.slice(0, 63), e)} ON ${q(String(f.table))} (${(f.columns as string[])
        .map((c) => quoteIdent(c, e))
        .join(", ")});`
    );

  return jsonResponse({
    connection: driver.config.name,
    engine: e,
    schema: out.sch,
    duplicateIndexes: out.base.duplicates,
    redundantIndexes: out.base.redundant,
    unindexedForeignKeys:
      e === "mysql" ? { status: "n/a", reason: "InnoDB creates an index for every foreign key automatically" } : out.base.unindexedForeignKeys,
    unusedIndexes: out.unused,
    ...(out.seqScanHeavy !== undefined ? { seqScanHeavyTables: out.seqScanHeavy } : {}),
    suggestedSql: suggestions,
    note: "Suggestions are candidates: verify with explain_query / find_slow_queries before applying (execute_write).",
  });
};

// ---------------------------------------------------------------------------
// health_check
// ---------------------------------------------------------------------------

async function pgHealth(s: Session, longSec: number): Promise<Check[]> {
  const checks: Check[] = [];
  checks.push(
    await check(s, "server", async () => {
      const r = await s.query(
        `SELECT version() AS version, (now() - pg_postmaster_start_time())::text AS uptime,
                pg_size_pretty(pg_database_size(current_database())) AS database_size, pg_is_in_recovery() AS standby`
      );
      return { status: "ok", details: rowsOf(r)[0] };
    })
  );
  checks.push(
    await check(s, "connections", async () => {
      const r = await s.query(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE state = 'active')::int AS active,
                count(*) FILTER (WHERE state = 'idle in transaction')::int AS idle_in_transaction,
                current_setting('max_connections')::int AS max_connections
           FROM pg_stat_activity`
      );
      const d = r.rows[0];
      const pct = (Number(d.total) / Number(d.max_connections)) * 100;
      return {
        status: pct >= 90 ? "critical" : pct >= 75 ? "warn" : "ok",
        message: `${d.total}/${d.max_connections} connections (${pct.toFixed(0)}%)`,
        details: d,
      };
    })
  );
  checks.push(
    await check(s, "long_running_queries", async () => {
      const r = await s.query(
        `SELECT pid, usename AS user, state, (now() - query_start)::text AS running_for, wait_event_type, left(query, 500) AS query
           FROM pg_stat_activity
          WHERE state <> 'idle' AND pid <> pg_backend_pid() AND backend_type = 'client backend'
            AND query_start < now() - make_interval(secs => $1)
          ORDER BY query_start LIMIT 20`,
        [longSec]
      );
      return { status: r.rows.length ? "warn" : "ok", message: `${r.rows.length} running > ${longSec}s`, details: rowsOf(r) };
    })
  );
  checks.push(
    await check(s, "idle_in_transaction", async () => {
      const r = await s.query(
        `SELECT pid, usename AS user, (now() - xact_start)::text AS open_for, left(query, 300) AS last_query
           FROM pg_stat_activity WHERE state LIKE 'idle in transaction%' AND xact_start < now() - make_interval(secs => $1)
          ORDER BY xact_start LIMIT 20`,
        [longSec]
      );
      return { status: r.rows.length ? "warn" : "ok", message: `${r.rows.length} sessions idle in transaction > ${longSec}s`, details: rowsOf(r) };
    })
  );
  checks.push(
    await check(s, "blocking_locks", async () => {
      const r = await s.query(
        `SELECT blocked.pid AS blocked_pid, left(blocked.query, 300) AS blocked_query, (now() - blocked.query_start)::text AS waiting_for,
                blocking.pid AS blocking_pid, blocking.state AS blocking_state, left(blocking.query, 300) AS blocking_query
           FROM pg_stat_activity blocked
           JOIN LATERAL unnest(pg_blocking_pids(blocked.pid)) AS b(pid) ON true
           JOIN pg_stat_activity blocking ON blocking.pid = b.pid
          LIMIT 20`
      );
      return { status: r.rows.length ? "warn" : "ok", message: `${r.rows.length} blocked sessions`, details: rowsOf(r) };
    })
  );
  checks.push(
    await check(s, "cache_hit_ratio", async () => {
      const r = await s.query(
        `SELECT round(100.0 * blks_hit / nullif(blks_hit + blks_read, 0), 2)::float AS pct, blks_hit + blks_read AS total
           FROM pg_stat_database WHERE datname = current_database()`
      );
      const pct = r.rows[0]?.pct === null ? null : Number(r.rows[0]?.pct);
      const total = Number(r.rows[0]?.total ?? 0);
      if (pct === null || total < 10000) return { status: "ok", message: "not enough activity to judge", details: { pct, blocks: total } };
      return { status: pct < 90 ? "warn" : "ok", message: `${pct}% of block reads served from shared buffers`, details: { pct } };
    })
  );
  checks.push(
    await check(s, "dead_tuples_bloat_estimate", async () => {
      const r = await s.query(
        `SELECT schemaname AS schema, relname AS table, n_live_tup, n_dead_tup,
                round(100.0 * n_dead_tup / nullif(n_live_tup + n_dead_tup, 0), 1)::float AS dead_pct,
                greatest(last_vacuum, last_autovacuum) AS last_vacuum
           FROM pg_stat_user_tables
          WHERE n_dead_tup > 1000 AND n_dead_tup > 0.2 * n_live_tup
          ORDER BY n_dead_tup DESC LIMIT 20`
      );
      return {
        status: r.rows.length ? "warn" : "ok",
        message: `${r.rows.length} tables with > 20% dead tuples (estimate from statistics; VACUUM reclaims them)`,
        details: rowsOf(r),
      };
    })
  );
  checks.push(
    await check(s, "vacuum_analyze_staleness", async () => {
      const r = await s.query(
        `SELECT schemaname AS schema, relname AS table, n_live_tup, n_mod_since_analyze,
                greatest(last_analyze, last_autoanalyze) AS last_analyze, greatest(last_vacuum, last_autovacuum) AS last_vacuum
           FROM pg_stat_user_tables
          WHERE n_live_tup > 1000 AND (
                (last_analyze IS NULL AND last_autoanalyze IS NULL)
             OR greatest(last_analyze, last_autoanalyze) < now() - interval '7 days' AND n_mod_since_analyze > 0.1 * n_live_tup)
          ORDER BY n_mod_since_analyze DESC NULLS LAST LIMIT 20`
      );
      return { status: r.rows.length ? "warn" : "ok", message: `${r.rows.length} tables with stale or missing statistics`, details: rowsOf(r) };
    })
  );
  checks.push(
    await check(s, "transaction_id_wraparound", async () => {
      const r = await s.query("SELECT datname, age(datfrozenxid)::bigint AS xid_age FROM pg_database ORDER BY 2 DESC LIMIT 5");
      const max = Math.max(...r.rows.map((x) => Number(x.xid_age)));
      return {
        status: max > 1_500_000_000 ? "critical" : max > 1_000_000_000 ? "warn" : "ok",
        message: `oldest unfrozen XID age ${max} (hard limit ~2.1B)`,
        details: rowsOf(r),
      };
    })
  );
  checks.push(
    await check(s, "replication", async () => {
      const rec = await s.query("SELECT pg_is_in_recovery() AS standby");
      if (rec.rows[0]?.standby === true) {
        const r = await s.query("SELECT (now() - pg_last_xact_replay_timestamp())::text AS replay_lag, extract(epoch FROM now() - pg_last_xact_replay_timestamp())::float AS lag_s");
        const lag = Number(r.rows[0]?.lag_s ?? 0);
        return { status: lag > 300 ? "warn" : "ok", message: `standby; replay lag ${r.rows[0]?.replay_lag ?? "unknown"}`, details: rowsOf(r)[0] };
      }
      const r = await s.query(
        `SELECT application_name, client_addr::text AS client_addr, state, sync_state,
                write_lag::text, flush_lag::text, replay_lag::text
           FROM pg_stat_replication`
      );
      const slots = await isolated(s, () =>
        s.query(
          `SELECT slot_name, slot_type, active, pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS retained_wal
             FROM pg_replication_slots`
        )
      )
        .then(rowsOf)
        .catch((e: Error) => ({ unavailable: e.message }));
      const inactive = Array.isArray(slots) ? slots.filter((x) => x.active === false) : [];
      return {
        status: inactive.length ? "warn" : "ok",
        message: `primary; ${r.rows.length} replicas${inactive.length ? `, ${inactive.length} inactive slots retaining WAL` : ""}`,
        details: { replicas: rowsOf(r), slots },
      };
    })
  );
  return checks;
}

async function mysqlStatus(s: Session, like: string): Promise<Record<string, string>> {
  const r = await s.query(`SHOW GLOBAL STATUS LIKE ?`, [like]);
  const out: Record<string, string> = {};
  for (const row of r.rows) out[String(row.Variable_name)] = String(row.Value);
  return out;
}

async function mysqlHealth(s: Session, longSec: number): Promise<Check[]> {
  const checks: Check[] = [];
  checks.push(
    await check(s, "server", async () => {
      const v = await s.query("SELECT VERSION() AS version, DATABASE() AS db");
      const up = await mysqlStatus(s, "Uptime");
      return { status: "ok", details: { ...rowsOf(v)[0], uptimeSeconds: Number(up.Uptime) } };
    })
  );
  checks.push(
    await check(s, "connections", async () => {
      const st = { ...(await mysqlStatus(s, "Threads_connected")), ...(await mysqlStatus(s, "Max_used_connections")) };
      const max = Number((await s.query("SELECT @@max_connections AS m")).rows[0]?.m);
      const cur = Number(st.Threads_connected);
      const pct = (cur / max) * 100;
      return {
        status: pct >= 90 ? "critical" : pct >= 75 ? "warn" : "ok",
        message: `${cur}/${max} connections (${pct.toFixed(0)}%)`,
        details: { threadsConnected: cur, maxUsed: Number(st.Max_used_connections), maxConnections: max },
      };
    })
  );
  checks.push(
    await check(s, "long_running_queries", async () => {
      const r = await s.query(
        `SELECT ID AS id, USER AS user, DB AS db, COMMAND AS command, TIME AS seconds, STATE AS state, LEFT(INFO, 500) AS query
           FROM information_schema.PROCESSLIST
          WHERE COMMAND NOT IN ('Sleep', 'Daemon', 'Binlog Dump', 'Binlog Dump GTID') AND TIME >= ? AND ID <> CONNECTION_ID()
          ORDER BY TIME DESC LIMIT 20`,
        [longSec]
      );
      return { status: r.rows.length ? "warn" : "ok", message: `${r.rows.length} running > ${longSec}s`, details: rowsOf(r) };
    })
  );
  checks.push(
    await check(s, "lock_waits", async () => {
      let r;
      try {
        r = await s.query(
          `SELECT waiting_pid, LEFT(waiting_query, 300) AS waiting_query, wait_age, blocking_pid, LEFT(blocking_query, 300) AS blocking_query
             FROM sys.innodb_lock_waits LIMIT 20`
        );
      } catch {
        r = await s.query(
          `SELECT w.requesting_trx_id AS waiting_trx, w.blocking_trx_id AS blocking_trx FROM information_schema.INNODB_LOCK_WAITS w LIMIT 20`
        );
      }
      return { status: r.rows.length ? "warn" : "ok", message: `${r.rows.length} lock waits`, details: rowsOf(r) };
    })
  );
  checks.push(
    await check(s, "buffer_pool_hit_ratio", async () => {
      const st = await mysqlStatus(s, "Innodb_buffer_pool_read%");
      const req = Number(st.Innodb_buffer_pool_read_requests);
      const reads = Number(st.Innodb_buffer_pool_reads);
      if (!req || req < 10000) return { status: "ok", message: "not enough activity to judge" };
      const pct = 100 * (1 - reads / req);
      return { status: pct < 95 ? "warn" : "ok", message: `${pct.toFixed(2)}% of InnoDB page reads served from the buffer pool` };
    })
  );
  checks.push(
    await check(s, "fragmentation_estimate", async () => {
      const r = await s.query(
        `SELECT TABLE_NAME AS \`table\`, DATA_LENGTH AS data_bytes, DATA_FREE AS free_bytes,
                ROUND(100 * DATA_FREE / NULLIF(DATA_LENGTH + DATA_FREE, 0), 1) AS free_pct
           FROM information_schema.TABLES
          WHERE TABLE_SCHEMA = DATABASE() AND DATA_FREE > 10485760 AND DATA_FREE > 0.2 * DATA_LENGTH
          ORDER BY DATA_FREE DESC LIMIT 20`
      );
      return {
        status: r.rows.length ? "warn" : "ok",
        message: `${r.rows.length} tables with > 20% free space (OPTIMIZE TABLE reclaims it)`,
        details: rowsOf(r),
      };
    })
  );
  checks.push(
    await check(s, "replication", async () => {
      let r;
      try {
        r = await s.query("SHOW REPLICA STATUS"); // MySQL >= 8.0.22 / MariaDB >= 10.5.1
      } catch {
        r = await s.query("SHOW SLAVE STATUS");
      }
      if (!r.rows.length) return { status: "ok", message: "not a replica" };
      const row = r.rows[0];
      const lag = row.Seconds_Behind_Source ?? row.Seconds_Behind_Master;
      const running = (row.Replica_IO_Running ?? row.Slave_IO_Running) === "Yes" && (row.Replica_SQL_Running ?? row.Slave_SQL_Running) === "Yes";
      return {
        status: !running ? "critical" : Number(lag) > 300 ? "warn" : "ok",
        message: running ? `replica lag ${lag ?? "unknown"}s` : "replication threads are not running",
        details: { secondsBehind: lag, lastError: row.Last_Error ?? null },
      };
    })
  );
  return checks;
}

async function sqliteHealth(s: Session): Promise<Check[]> {
  const checks: Check[] = [];
  checks.push(
    await check(s, "server", async () => {
      const r = await s.query("SELECT sqlite_version() AS version");
      const jm = await s.query("PRAGMA journal_mode");
      return { status: "ok", details: { version: r.rows[0]?.version, journalMode: Object.values(jm.rows[0] ?? {})[0] } };
    })
  );
  checks.push(
    await check(s, "integrity", async () => {
      const r = await s.query("PRAGMA quick_check(20)", [], { maxRows: 20 });
      const msgs = r.rows.map((x) => String(Object.values(x)[0]));
      const ok = msgs.length === 1 && msgs[0] === "ok";
      return { status: ok ? "ok" : "critical", message: ok ? "quick_check ok" : "quick_check reported problems", details: ok ? undefined : msgs };
    })
  );
  checks.push(
    await check(s, "foreign_keys", async () => {
      const r = await s.query("PRAGMA foreign_key_check", [], { maxRows: 20 });
      return { status: r.rows.length ? "warn" : "ok", message: `${r.rows.length}${r.truncated ? "+" : ""} rows violate foreign keys`, details: rowsOf(r) };
    })
  );
  checks.push(
    await check(s, "free_pages_bloat", async () => {
      const pc = Number(Object.values((await s.query("PRAGMA page_count")).rows[0] ?? {})[0]);
      const ps = Number(Object.values((await s.query("PRAGMA page_size")).rows[0] ?? {})[0]);
      const fl = Number(Object.values((await s.query("PRAGMA freelist_count")).rows[0] ?? {})[0]);
      const pct = pc ? (100 * fl) / pc : 0;
      return {
        status: pct > 25 && fl * ps > 10 * 1024 * 1024 ? "warn" : "ok",
        message: `${pct.toFixed(1)}% free pages (VACUUM reclaims them)`,
        details: { sizeBytes: pc * ps, freeBytes: fl * ps },
      };
    })
  );
  checks.push(
    await check(s, "statistics", async () => {
      const r = await s.query("SELECT count(*) AS n FROM sqlite_master WHERE name = 'sqlite_stat1'");
      const has = Number(r.rows[0]?.n) > 0;
      return { status: has ? "ok" : "warn", message: has ? "ANALYZE statistics present" : "No ANALYZE statistics — the planner is guessing; run ANALYZE" };
    })
  );
  return checks;
}

export const handleHealthCheck: Handler = async (args) => {
  const { longRunningSeconds, connection } = HealthCheckSchema.parse(args ?? {});
  const driver: Driver = getDriver(connection);
  const checks = await driver.withSession("read", (s) =>
    driver.engine === "postgres" ? pgHealth(s, longRunningSeconds) : driver.engine === "mysql" ? mysqlHealth(s, longRunningSeconds) : sqliteHealth(s)
  );
  const rank: Record<Status, number> = { ok: 0, unavailable: 1, warn: 2, critical: 3 };
  const worst = checks.reduce<Status>((w, c) => (rank[c.status] > rank[w] ? c.status : w), "ok");
  return jsonResponse({
    connection: driver.config.name,
    engine: driver.engine,
    status: worst === "unavailable" ? "ok" : worst,
    summary: checks.map((c) => `${c.name}: ${c.status}${c.message ? ` — ${c.message}` : ""}`),
    checks,
  });
};
