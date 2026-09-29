// SPDX-License-Identifier: MIT
/**
 * MySQL / MariaDB driver (mysql2, pure JS).
 *
 * Guarantees:
 *  - read sessions run in `START TRANSACTION READ ONLY` and are rolled back;
 *  - `multipleStatements` is off, so one call is one statement;
 *  - server-side timeout: `max_execution_time` (MySQL, SELECT only) or
 *    `max_statement_time` (MariaDB, all statements), plus mysql2's client-side
 *    `timeout`, which destroys the connection when it fires.
 *
 * A READ ONLY transaction blocks writes to tables, not `SELECT … INTO OUTFILE`
 * or `LOAD_FILE()` — those depend on the FILE privilege. Use a least-privilege
 * account; read sessions additionally refuse INTO OUTFILE/DUMPFILE.
 */

import mysql from "mysql2/promise";
import type { ConnectionConfig } from "../config.js";
import { statementTimeoutMs } from "../config.js";
import { tokenize } from "../sql-lexer.js";
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

export function mysqlPoolConfig(config: ConnectionConfig): mysql.PoolOptions {
  const net = config.net!;
  const ssl = net.ssl;
  let sslOpt: mysql.PoolOptions["ssl"];
  if (ssl.mode === "require") sslOpt = { rejectUnauthorized: false, cert: ssl.cert, key: ssl.key };
  else if (ssl.mode === "verify-ca")
    sslOpt = {
      rejectUnauthorized: true,
      ca: ssl.ca,
      cert: ssl.cert,
      key: ssl.key,
      // verify the chain, not the hostname (libpq/MySQL VERIFY_CA semantics)
      ...({ checkServerIdentity: () => undefined } as object),
    };
  else if (ssl.mode === "verify-full") sslOpt = { rejectUnauthorized: true, ca: ssl.ca, cert: ssl.cert, key: ssl.key };
  return {
    host: net.host,
    port: net.port,
    user: net.user || undefined,
    password: net.password,
    database: net.database || undefined,
    ssl: sslOpt,
    connectTimeout: net.options.connectTimeoutSec ? Number(net.options.connectTimeoutSec) * 1000 : 10_000,
    connectionLimit: 4,
    multipleStatements: false,
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    charset: net.options.charset ?? "utf8mb4",
    timezone: "Z",
  };
}

/** Detect `INTO OUTFILE` / `INTO DUMPFILE` outside strings and comments. */
export function writesServerFile(sql: string): boolean {
  const words = tokenize(sql, "mysql").filter((t) => t.type === "word").map((t) => t.text.toUpperCase());
  for (let i = 0; i < words.length - 1; i++) {
    if (words[i] === "INTO" && (words[i + 1] === "OUTFILE" || words[i + 1] === "DUMPFILE")) return true;
  }
  return false;
}

class MysqlSession implements Session {
  readonly engine = "mysql" as const;
  constructor(private conn: mysql.PoolConnection, private mode: SessionMode, private clientTimeoutMs: number) {}

  async query(sql: string, params: unknown[] = [], opts: QueryOptions = {}): Promise<QueryResult> {
    if (this.mode === "read" && writesServerFile(sql)) {
      throw new Error("SELECT … INTO OUTFILE/DUMPFILE writes a server file and is refused on a read-only session");
    }
    const [result, fields] = await this.conn.query({
      sql,
      values: params,
      rowsAsArray: true,
      timeout: this.clientTimeoutMs,
    });
    if (!Array.isArray(result)) {
      const header = result as mysql.ResultSetHeader;
      return { columns: [], rows: [], affectedRows: header.affectedRows ?? null, truncated: false };
    }
    const columns = uniqueColumnNames((fields ?? []).map((f) => f.name));
    let arrays = result as unknown as unknown[][];
    let truncated = false;
    if (opts.maxRows !== undefined && arrays.length > opts.maxRows) {
      arrays = arrays.slice(0, opts.maxRows);
      truncated = true;
    }
    return { columns, rows: rowsFromArrays(columns, arrays), affectedRows: null, truncated };
  }
}

export class MysqlDriver implements Driver {
  readonly engine = "mysql" as const;
  private pool: mysql.Pool;
  private version: string | null = null;

  constructor(readonly config: ConnectionConfig, poolFactory?: (c: mysql.PoolOptions) => mysql.Pool) {
    const cfg = mysqlPoolConfig(config);
    this.pool = poolFactory ? poolFactory(cfg) : mysql.createPool(cfg);
  }

  async isMariaDb(): Promise<boolean> {
    return /mariadb/i.test(await this.serverVersion());
  }

  async withSession<T>(mode: SessionMode, fn: (s: Session) => Promise<T>, opts: SessionOptions = {}): Promise<T> {
    if (mode === "write" && this.config.readOnly) {
      throw new Error(
        `Connection "${this.config.name}" is read-only. Mark it writable (DATABASE_ALLOW_WRITES=true, or "readOnly": false in DATABASE_URLS) to run writes.`
      );
    }
    const timeout = Math.floor(opts.timeoutMs ?? statementTimeoutMs());
    const conn = await this.pool.getConnection();
    let broken = false;
    try {
      const [vrows] = await conn.query("SELECT VERSION() AS v");
      const version = String((vrows as Array<{ v: string }>)[0]?.v ?? "");
      this.version ??= version;
      if (/mariadb/i.test(version)) {
        await conn.query(`SET SESSION max_statement_time = ${(timeout / 1000).toFixed(3)}`);
      } else {
        await conn.query(`SET SESSION max_execution_time = ${timeout}`);
      }
      await conn.query(mode === "read" ? "START TRANSACTION READ ONLY" : "START TRANSACTION");
      const result = await fn(new MysqlSession(conn, mode, timeout + 5_000));
      if (mode === "write" && opts.commit !== false) await conn.query("COMMIT");
      else await conn.query("ROLLBACK");
      return result;
    } catch (err) {
      try {
        await conn.query("ROLLBACK");
      } catch {
        broken = true;
      }
      throw err;
    } finally {
      if (broken) conn.destroy();
      else conn.release();
    }
  }

  async serverVersion(): Promise<string> {
    if (!this.version) {
      const [rows] = await this.pool.query("SELECT VERSION() AS v");
      this.version = String((rows as Array<{ v: string }>)[0]?.v ?? "MySQL");
    }
    return this.version;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
