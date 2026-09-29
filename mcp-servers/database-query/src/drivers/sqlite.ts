// SPDX-License-Identifier: MIT
/**
 * SQLite driver — Node's built-in `node:sqlite`, run in a worker thread.
 *
 * Why node:sqlite and not sql.js (WASM/asm.js):
 *   sql.js loads the WHOLE database file into memory and can only persist a
 *   write by re-exporting the whole file over the original — a lost-update
 *   race against the application that owns the database, and a correctness
 *   hazard with WAL-mode databases (the -wal file is ignored). node:sqlite
 *   opens the real file with SQLite's own locking, honours WAL, can open it
 *   with SQLITE_OPEN_READONLY, and costs nothing in bundle size.
 *   The trade-off is the runtime floor: node:sqlite is available unflagged
 *   from Node 22.13 / 23.4. On older runtimes every SQLite call returns an
 *   explicit, actionable error; PostgreSQL and MySQL keep working on Node 18.
 *
 * Why a child process: node:sqlite is synchronous and has no interrupt API.
 * A runaway query on the main thread would freeze the MCP server, and a
 * worker thread cannot be stopped either — Worker.terminate() only interrupts
 * JavaScript, not a native sqlite3_step() loop (measured: a recursive CTE
 * kept the worker alive after terminate()). A child process can always be
 * killed, so the statement timeout is real.
 *
 * Read sessions: file opened read-only AND `PRAGMA query_only = ON`, inside a
 * transaction that is rolled back.
 */

import { spawn, type ChildProcess } from "child_process";
import { existsSync } from "fs";
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

export const SQLITE_MIN_NODE = "22.13.0";

/** Child source (CommonJS, run with `node -e`). Kept dependency-free on purpose. */
const WORKER_SOURCE = String.raw`
const parentPort = { postMessage: (m) => process.send(m), on: (ev, fn) => process.on(ev, fn) };
process.on('disconnect', () => process.exit(0));
let sqlite;
try { sqlite = require('node:sqlite'); } catch (e) { sqlite = null; }
let db = null;
function norm(v) {
  if (typeof v === 'bigint') return (v <= BigInt(Number.MAX_SAFE_INTEGER) && v >= BigInt(Number.MIN_SAFE_INTEGER)) ? Number(v) : v.toString();
  return v;
}
parentPort.on('message', (msg) => {
  const reply = (ok, payload) => parentPort.postMessage(Object.assign({ id: msg.id, ok }, payload));
  try {
    if (msg.type === 'open') {
      if (!sqlite || typeof sqlite.DatabaseSync !== 'function') {
        return reply(false, { code: 'NO_SQLITE', error: 'node:sqlite is not available in this Node.js runtime' });
      }
      db = new sqlite.DatabaseSync(msg.file, { readOnly: !!msg.readOnly });
      db.exec('PRAGMA busy_timeout = 5000');
      if (msg.queryOnly) db.exec('PRAGMA query_only = ON');
      const v = db.prepare('SELECT sqlite_version() AS v').get();
      return reply(true, { version: v && v.v });
    }
    if (msg.type === 'exec') {
      db.exec(msg.sql);
      return reply(true, {});
    }
    if (msg.type === 'query') {
      const stmt = db.prepare(msg.sql);
      if (typeof stmt.setReadBigInts === 'function') stmt.setReadBigInts(true);
      let cols = [];
      if (typeof stmt.columns === 'function') cols = stmt.columns().map((c) => c.name);
      const reader = typeof stmt.columns === 'function' ? cols.length > 0 : !!msg.readerHint;
      const params = msg.params || [];
      if (!reader) {
        const r = stmt.run(...params);
        return reply(true, { columns: [], rows: [], affectedRows: norm(r.changes), truncated: false });
      }
      const arrays = typeof stmt.setReturnArrays === 'function';
      if (arrays) stmt.setReturnArrays(true);
      const rows = [];
      let truncated = false;
      const max = typeof msg.maxRows === 'number' ? msg.maxRows : Infinity;
      for (const row of stmt.iterate(...params)) {
        if (rows.length >= max) { truncated = true; break; }
        if (arrays) rows.push(row.map(norm));
        else { if (!cols.length) cols = Object.keys(row); rows.push(cols.map((c) => norm(row[c]))); }
      }
      return reply(true, { columns: cols, rows, affectedRows: null, truncated });
    }
    if (msg.type === 'close') {
      if (db) db.close();
      db = null;
      return reply(true, {});
    }
    reply(false, { error: 'unknown message ' + msg.type });
  } catch (e) {
    reply(false, { error: (e && e.message) || String(e), code: e && e.code });
  }
});
`;

interface WorkerReply {
  id: number;
  ok: boolean;
  error?: string;
  code?: string;
  version?: string;
  columns?: string[];
  rows?: unknown[][];
  affectedRows?: number | null;
  truncated?: boolean;
}

export function sqliteUnavailableMessage(): string {
  return (
    `SQLite support needs Node.js >= ${SQLITE_MIN_NODE} (built-in node:sqlite); this server runs on ${process.version}. ` +
    "Upgrade Node.js for this MCP server, or use a PostgreSQL/MySQL connection."
  );
}

/** One child process = one SQLite connection for the lifetime of a session. */
export class SqliteWorkerConnection {
  private child: ChildProcess;
  private nextId = 1;
  private pending = new Map<number, { resolve: (r: WorkerReply) => void; reject: (e: Error) => void; timer?: NodeJS.Timeout }>();
  private dead: Error | null = null;
  private stderr = "";

  constructor() {
    // node:sqlite needs --experimental-sqlite on 22.5–22.12; harmless elsewhere is not guaranteed, so only add it there.
    const [maj, min] = process.versions.node.split(".").map(Number);
    const flags = maj === 22 && min >= 5 && min < 13 ? ["--experimental-sqlite"] : [];
    this.child = spawn(process.execPath, [...flags, "--no-warnings", "-e", WORKER_SOURCE], {
      stdio: ["ignore", "ignore", "pipe", "ipc"],
      serialization: "advanced",
      windowsHide: true,
      // When the server itself runs inside Electron, execPath is the Electron
      // binary: this makes it behave as plain Node instead of opening an app.
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    });
    this.child.stderr?.on("data", (d: Buffer) => {
      this.stderr = (this.stderr + d.toString()).slice(-2000);
    });
    this.child.on("message", (m: WorkerReply) => {
      const p = this.pending.get(m.id);
      if (!p) return;
      this.pending.delete(m.id);
      if (p.timer) clearTimeout(p.timer);
      p.resolve(m);
    });
    const fail = (e: Error) => {
      if (!this.dead) this.dead = e;
      for (const p of this.pending.values()) {
        if (p.timer) clearTimeout(p.timer);
        p.reject(this.dead);
      }
      this.pending.clear();
    };
    this.child.on("error", fail);
    this.child.on("exit", (code, signal) => {
      fail(new Error(`SQLite helper process exited (${signal ?? `code ${code}`})${this.stderr ? `: ${this.stderr.trim()}` : ""}`));
    });
  }

  send(msg: Record<string, unknown>, timeoutMs?: number): Promise<WorkerReply> {
    if (this.dead) return Promise.reject(this.dead);
    const id = this.nextId++;
    return new Promise<WorkerReply>((resolve, reject) => {
      const entry: { resolve: (r: WorkerReply) => void; reject: (e: Error) => void; timer?: NodeJS.Timeout } = {
        resolve,
        reject,
      };
      if (timeoutMs) {
        entry.timer = setTimeout(() => {
          this.pending.delete(id);
          const err = new Error(`canceling statement due to statement timeout (${timeoutMs} ms)`);
          this.dead = err;
          this.child.kill("SIGKILL");
          reject(err);
        }, timeoutMs);
      }
      this.pending.set(id, entry);
      this.child.send({ ...msg, id });
    });
  }

  async call(msg: Record<string, unknown>, timeoutMs?: number): Promise<WorkerReply> {
    const r = await this.send(msg, timeoutMs);
    if (!r.ok) {
      if (r.code === "NO_SQLITE") throw new Error(sqliteUnavailableMessage());
      throw new Error(r.error ?? "SQLite error");
    }
    return r;
  }

  async terminate(): Promise<void> {
    if (!this.dead) {
      try {
        await this.send({ type: "close" }, 5_000);
      } catch {
        /* ignore */
      }
    }
    if (this.child.exitCode === null && this.child.signalCode === null) {
      const exited = new Promise<void>((r) => this.child.once("exit", () => r()));
      this.child.kill("SIGKILL");
      await exited;
    }
  }
}

class SqliteSession implements Session {
  readonly engine = "sqlite" as const;
  constructor(private conn: SqliteWorkerConnection, private timeoutMs: number) {}

  async query(sql: string, params: unknown[] = [], opts: QueryOptions = {}): Promise<QueryResult> {
    const r = await this.conn.call(
      {
        type: "query",
        sql,
        params: params.map((p) => (typeof p === "boolean" ? (p ? 1 : 0) : p)),
        maxRows: opts.maxRows,
        readerHint: /^\s*(select|with|values|pragma|explain)\b/i.test(sql) || /\breturning\b/i.test(sql),
      },
      this.timeoutMs
    );
    const columns = uniqueColumnNames(r.columns ?? []);
    return {
      columns,
      rows: rowsFromArrays(columns, r.rows ?? []),
      affectedRows: r.affectedRows ?? null,
      truncated: !!r.truncated,
    };
  }

  /** Raw exec (no result) — used for multi-statement scripts in write sessions. */
  async exec(sql: string): Promise<void> {
    await this.conn.call({ type: "exec", sql }, this.timeoutMs);
  }
}

export class SqliteDriver implements Driver {
  readonly engine = "sqlite" as const;
  private version: string | null = null;

  constructor(readonly config: ConnectionConfig) {}

  private assertFile(): void {
    if (!this.config.memory && !existsSync(this.config.file!)) {
      throw new Error(
        `SQLite database file not found: ${this.config.file} (relative sqlite: URLs resolve against the server's working directory ${process.cwd()})`
      );
    }
  }

  /** Open a raw worker connection (used by backup). Caller terminates it. */
  async open(opts: { readOnly: boolean; queryOnly: boolean }): Promise<SqliteWorkerConnection> {
    this.assertFile();
    const conn = new SqliteWorkerConnection();
    try {
      const r = await conn.call({ type: "open", file: this.config.file, ...opts }, 15_000);
      this.version ??= `SQLite ${r.version}`;
      return conn;
    } catch (e) {
      await conn.terminate().catch(() => {});
      throw e;
    }
  }

  async withSession<T>(mode: SessionMode, fn: (s: Session) => Promise<T>, opts: SessionOptions = {}): Promise<T> {
    if (mode === "write" && this.config.readOnly) {
      throw new Error(
        `Connection "${this.config.name}" is read-only. Mark it writable (DATABASE_ALLOW_WRITES=true, or "readOnly": false in DATABASE_URLS) to run writes.`
      );
    }
    const timeout = opts.timeoutMs ?? statementTimeoutMs();
    const conn = await this.open({ readOnly: mode === "read", queryOnly: mode === "read" });
    try {
      await conn.call({ type: "exec", sql: mode === "read" ? "BEGIN" : "BEGIN IMMEDIATE" }, timeout);
      const session = new SqliteSession(conn, timeout);
      let result: T;
      try {
        result = await fn(session);
      } catch (e) {
        await conn.call({ type: "exec", sql: "ROLLBACK" }, 5_000).catch(() => {});
        throw e;
      }
      await conn.call({ type: "exec", sql: mode === "write" && opts.commit !== false ? "COMMIT" : "ROLLBACK" }, timeout);
      return result;
    } finally {
      await conn.terminate();
    }
  }

  async serverVersion(): Promise<string> {
    if (!this.version) {
      await this.withSession("read", async () => undefined);
    }
    return this.version ?? "SQLite";
  }

  async close(): Promise<void> {
    /* sessions own their workers */
  }
}

export function isSqliteSession(s: Session): s is Session & { exec(sql: string): Promise<void> } {
  return s instanceof SqliteSession;
}
