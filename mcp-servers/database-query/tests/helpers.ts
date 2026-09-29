// SPDX-License-Identifier: MIT
/**
 * Test doubles: a fake Driver that records every session and statement.
 */

import type { ConnectionConfig, Engine } from '../src/config.js';
import { resetRegistry } from '../src/config.js';
import { setDriverFactory } from '../src/drivers/index.js';
import type { Driver, QueryResult, Session, SessionMode, SessionOptions } from '../src/drivers/types.js';

export type Responder = (sql: string, params: unknown[]) => Partial<QueryResult> | Error | undefined;

export interface Recorded {
  mode: SessionMode;
  opts: SessionOptions;
  queries: Array<{ sql: string; params: unknown[] }>;
}

export class FakeDriver implements Driver {
  sessions: Recorded[] = [];
  constructor(readonly config: ConnectionConfig, private respond: Responder = () => undefined, private version = 'fake') {}
  get engine(): Engine {
    return this.config.engine;
  }
  get allQueries() {
    return this.sessions.flatMap((s) => s.queries);
  }
  async withSession<T>(mode: SessionMode, fn: (s: Session) => Promise<T>, opts: SessionOptions = {}): Promise<T> {
    if (mode === 'write' && this.config.readOnly) throw new Error(`Connection "${this.config.name}" is read-only.`);
    const rec: Recorded = { mode, opts, queries: [] };
    this.sessions.push(rec);
    const engine = this.engine;
    const respond = this.respond;
    const session: Session = {
      engine,
      async query(sql, params = [], qopts = {}) {
        rec.queries.push({ sql, params });
        const r = respond(sql, params);
        if (r instanceof Error) throw r;
        const rows = r?.rows ?? [];
        const max = qopts.maxRows;
        return {
          columns: r?.columns ?? (rows[0] ? Object.keys(rows[0]) : []),
          rows: max !== undefined ? rows.slice(0, max) : rows,
          affectedRows: r?.affectedRows ?? null,
          truncated: max !== undefined && rows.length > max,
        };
      },
    };
    return fn(session);
  }
  async serverVersion() {
    return this.version;
  }
  async close() {}
}

/** Configure env + registry, and route every connection to a FakeDriver. */
export function installFakes(
  env: Record<string, string | undefined>,
  respond: Responder = () => undefined,
  version = 'fake'
): Map<string, FakeDriver> {
  for (const k of ['DATABASE_URL', 'DATABASE_URLS', 'DATABASE_ALLOW_WRITES']) delete process.env[k];
  Object.assign(process.env, env);
  resetRegistry();
  const made = new Map<string, FakeDriver>();
  setDriverFactory((cfg) => {
    const d = new FakeDriver(cfg, respond, version);
    made.set(cfg.name, d);
    return d;
  });
  return made;
}

export function resetFakes(): void {
  for (const k of ['DATABASE_URL', 'DATABASE_URLS', 'DATABASE_ALLOW_WRITES', 'DB_BACKUP_DIR', 'DB_MAX_ROWS', 'DB_ALLOW_PRIVATE_ADHOC_URLS']) delete process.env[k];
  resetRegistry();
  setDriverFactory(null);
}

export function parse(result: { content: Array<{ text: string }> }) {
  return JSON.parse(result.content[0].text);
}
