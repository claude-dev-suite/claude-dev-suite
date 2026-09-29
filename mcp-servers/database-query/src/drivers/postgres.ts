// SPDX-License-Identifier: MIT
/**
 * PostgreSQL driver (node-postgres).
 *
 * Guarantees:
 *  - read sessions run in `BEGIN READ ONLY` and are always rolled back, so
 *    even session-level side effects of set_config() are undone;
 *  - every statement is sent with the EXTENDED protocol (`queryMode:
 *    'extended'`), which the server refuses to run with more than one
 *    command — the simple protocol would let `SELECT 1; COMMIT; DROP …`
 *    commit out of the read-only transaction;
 *  - `SET LOCAL statement_timeout` bounds every statement server-side, and a
 *    client-side `query_timeout` bounds a hung network.
 */

import pg from "pg";
import type { ConnectionConfig } from "../config.js";
import { statementTimeoutMs } from "../config.js";
import {
  type Driver,
  type QueryOptions,
  type QueryResult,
  type Session,
  type SessionMode,
  type SessionOptions,
  rowsFromArrays,
  uniqueColumnNames,
} from "./types.js";

const { Pool } = pg;

export function pgPoolConfig(config: ConnectionConfig): pg.PoolConfig {
  const net = config.net!;
  const ssl = net.ssl;
  let sslOpt: pg.PoolConfig["ssl"] = false;
  if (ssl.mode === "require") sslOpt = { rejectUnauthorized: false };
  else if (ssl.mode === "verify-ca")
    sslOpt = { rejectUnauthorized: true, ca: ssl.ca, cert: ssl.cert, key: ssl.key, checkServerIdentity: () => undefined };
  else if (ssl.mode === "verify-full") sslOpt = { rejectUnauthorized: true, ca: ssl.ca, cert: ssl.cert, key: ssl.key };
  if (sslOpt && ssl.mode === "require" && (ssl.cert || ssl.key)) sslOpt = { ...sslOpt, cert: ssl.cert, key: ssl.key };

  const opts: string[] = [];
  if (net.options.options) opts.push(net.options.options);
  if (net.options.searchPath) opts.push(`-c search_path=${net.options.searchPath}`);
  return {
    host: net.host,
    port: net.port,
    database: net.database || undefined,
    user: net.user || undefined,
    password: net.password,
    ssl: sslOpt,
    application_name: net.options.application_name ?? "dev-suite-database-query",
    options: opts.length ? opts.join(" ") : undefined,
    connectionTimeoutMillis: net.options.connectTimeoutSec ? Number(net.options.connectTimeoutSec) * 1000 : 10_000,
    max: 4,
    idleTimeoutMillis: 30_000,
  };
}

class PgSession implements Session {
  readonly engine = "postgres" as const;
  constructor(private client: pg.PoolClient, private clientTimeoutMs: number) {}

  async query(sql: string, params: unknown[] = [], opts: QueryOptions = {}): Promise<QueryResult> {
    const res = (await this.client.query({
      text: sql,
      values: params,
      rowMode: "array",
      queryMode: "extended",
      query_timeout: this.clientTimeoutMs,
    } as pg.QueryArrayConfig & { queryMode: string; query_timeout: number })) as pg.QueryArrayResult;
    const columns = uniqueColumnNames((res.fields ?? []).map((f) => f.name));
    let arrays = res.rows ?? [];
    let truncated = false;
    if (opts.maxRows !== undefined && arrays.length > opts.maxRows) {
      arrays = arrays.slice(0, opts.maxRows);
      truncated = true;
    }
    const isSelect = res.command === "SELECT" || res.command === "SHOW" || res.command === "EXPLAIN";
    return {
      columns,
      rows: rowsFromArrays(columns, arrays),
      affectedRows: isSelect ? null : res.rowCount ?? null,
      truncated,
    };
  }
}

export class PostgresDriver implements Driver {
  readonly engine = "postgres" as const;
  private pool: pg.Pool;
  private version: string | null = null;

  constructor(readonly config: ConnectionConfig, poolFactory?: (c: pg.PoolConfig) => pg.Pool) {
    const cfg = pgPoolConfig(config);
    this.pool = poolFactory ? poolFactory(cfg) : new Pool(cfg);
    // An idle client erroring (server restart) must not crash the process.
    this.pool.on?.("error", () => {});
  }

  async withSession<T>(mode: SessionMode, fn: (s: Session) => Promise<T>, opts: SessionOptions = {}): Promise<T> {
    if (mode === "write" && this.config.readOnly) {
      throw new Error(
        `Connection "${this.config.name}" is read-only. Mark it writable (DATABASE_ALLOW_WRITES=true, or "readOnly": false in DATABASE_URLS) to run writes.`
      );
    }
    const timeout = opts.timeoutMs ?? statementTimeoutMs();
    const client = await this.pool.connect();
    let broken = false;
    try {
      await client.query(mode === "read" ? "BEGIN READ ONLY" : "BEGIN");
      // SET LOCAL does not accept bind parameters; the value is an integer we computed.
      await client.query(`SET LOCAL statement_timeout = ${Math.floor(timeout)}`);
      const session = new PgSession(client, timeout + 5_000);
      const result = await fn(session);
      if (mode === "write" && opts.commit !== false) await client.query("COMMIT");
      else await client.query("ROLLBACK");
      return result;
    } catch (err) {
      // After a client-side read timeout the connection is still busy with
      // the old statement; a ROLLBACK would queue behind it. Discard instead.
      if (/read timeout/i.test((err as Error)?.message ?? "")) broken = true;
      else {
        try {
          await client.query("ROLLBACK");
        } catch {
          broken = true;
        }
      }
      throw err;
    } finally {
      client.release(broken ? true : undefined);
    }
  }

  async serverVersion(): Promise<string> {
    if (!this.version) {
      this.version = await this.withSession("read", async (s) => {
        const r = await s.query("SELECT version() AS v");
        return String(r.rows[0]?.v ?? "PostgreSQL");
      });
    }
    return this.version;
  }

  /** Numeric server version, e.g. 160002. */
  async serverVersionNum(): Promise<number> {
    return this.withSession("read", async (s) => {
      const r = await s.query("SELECT current_setting('server_version_num')::int AS v");
      return Number(r.rows[0]?.v ?? 0);
    });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
