// SPDX-License-Identifier: MIT
/**
 * Engine-neutral driver contract.
 *
 * A driver only knows how to open a session with the right guarantees; every
 * piece of SQL above this layer is engine-specific and lives with the tool that
 * needs it.
 */

import type { ConnectionConfig, Engine } from "../config.js";

export interface QueryResult {
  /** Column names in result order, de-duplicated (`id`, `id_2`, …). */
  columns: string[];
  rows: Record<string, unknown>[];
  /** Rows affected for DML; null when the driver cannot tell. */
  affectedRows: number | null;
  /** True when more rows existed than `maxRows` and the rest were not fetched/returned. */
  truncated: boolean;
}

export interface QueryOptions {
  /** Stop materialising rows after this many (driver-side safety net). */
  maxRows?: number;
}

export interface Session {
  readonly engine: Engine;
  query(sql: string, params?: unknown[], opts?: QueryOptions): Promise<QueryResult>;
}

export type SessionMode = "read" | "write";

export interface SessionOptions {
  /** Statement timeout for every query in the session (ms). */
  timeoutMs?: number;
  /**
   * write sessions only: commit at the end (default). `false` rolls back —
   * used by dry runs.
   */
  commit?: boolean;
}

export interface Driver {
  readonly engine: Engine;
  readonly config: ConnectionConfig;
  /**
   * Run `fn` inside a session.
   *  - "read": the engine enforces read-only (READ ONLY transaction /
   *    PRAGMA query_only) and the transaction is always rolled back.
   *  - "write": refused unless the connection is writable; runs in one
   *    transaction, committed when `fn` resolves (unless commit:false).
   */
  withSession<T>(mode: SessionMode, fn: (s: Session) => Promise<T>, opts?: SessionOptions): Promise<T>;
  /** Engine flavour/version string, e.g. "PostgreSQL 16.2", "MariaDB 11.4.2". */
  serverVersion(): Promise<string>;
  close(): Promise<void>;
}

/** Turn duplicate column names into unique keys so no value is silently lost. */
export function uniqueColumnNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((n) => {
    const count = (seen.get(n) ?? 0) + 1;
    seen.set(n, count);
    if (count === 1) return n;
    let candidate = `${n}_${count}`;
    while (seen.has(candidate)) candidate = `${candidate}_`;
    seen.set(candidate, 1);
    return candidate;
  });
}

export function rowsFromArrays(columns: string[], arrays: unknown[][]): Record<string, unknown>[] {
  return arrays.map((arr) => {
    const row: Record<string, unknown> = {};
    columns.forEach((c, i) => {
      row[c] = arr[i];
    });
    return row;
  });
}

let savepointSeq = 0;

/**
 * Run `fn` so that its failure does not poison the surrounding transaction.
 * PostgreSQL aborts the whole transaction on any error ("current transaction
 * is aborted…"), which would turn every later sub-check into a bogus failure;
 * a savepoint confines the damage. MySQL and SQLite do not need it.
 */
export async function isolated<T>(s: Session, fn: () => Promise<T>): Promise<T> {
  if (s.engine !== "postgres") return fn();
  const name = `dsq_sp_${++savepointSeq}`;
  await s.query(`SAVEPOINT ${name}`);
  try {
    const r = await fn();
    await s.query(`RELEASE SAVEPOINT ${name}`);
    return r;
  } catch (e) {
    await s.query(`ROLLBACK TO SAVEPOINT ${name}`);
    throw e;
  }
}

export class UnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedError";
  }
}
