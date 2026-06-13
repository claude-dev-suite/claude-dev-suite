// SPDX-License-Identifier: MIT
/**
 * Security regression tests for execute_query and explain_query handlers.
 *
 * Tests cover:
 * 1. The SELECT prefix fast-fail check (execute_query).
 * 2. Read-only transaction behaviour for execute_query.
 * 3. Read-only transaction wrapping in explain_query (BEGIN … SET TRANSACTION
 *    READ ONLY … ROLLBACK) ensuring EXPLAIN ANALYZE cannot commit write side-effects.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock pg pool ──────────────────────────────────────────────────────────────

// We mock the db module so no real Postgres connection is needed.
vi.mock('../src/handlers/db.js', () => {
  return {
    getPool: vi.fn(),
  };
});

import { getPool } from '../src/handlers/db.js';
import { handleExecuteQuery } from '../src/handlers/execute-query.js';
import { handleExplainQuery } from '../src/handlers/explain-query.js';

// Helper to build a mock pg.PoolClient
function makeMockClient(queryImpl?: (sql: string, params?: unknown[]) => Promise<unknown>) {
  const queryCalls: Array<{ sql: string; params?: unknown[] }> = [];
  const client = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      queryCalls.push({ sql, params });
      if (queryImpl) return queryImpl(sql, params);
      // Default: return an empty result set
      return { rows: [], rowCount: 0, fields: [] };
    }),
    release: vi.fn(),
    _queryCalls: queryCalls,
  };
  return client;
}

// Helper to build a mock pool that returns a given client
function makeMockPool(client: ReturnType<typeof makeMockClient>) {
  return { connect: vi.fn(async () => client) };
}

// ── SELECT prefix fast-fail ────────────────────────────────────────────────

describe('SELECT prefix guard', () => {
  it('rejects DROP TABLE immediately without hitting the DB', async () => {
    const client = makeMockClient();
    (getPool as ReturnType<typeof vi.fn>).mockReturnValue(makeMockPool(client));

    const result = await handleExecuteQuery({ sql: 'DROP TABLE users' });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Only SELECT queries are allowed');
    // No DB interaction should have occurred
    expect(client.query).not.toHaveBeenCalled();
  });

  it('rejects DELETE query', async () => {
    const result = await handleExecuteQuery({ sql: 'DELETE FROM users' });
    expect(result.isError).toBe(true);
  });

  it('rejects INSERT query', async () => {
    const result = await handleExecuteQuery({ sql: 'INSERT INTO users VALUES (1)' });
    expect(result.isError).toBe(true);
  });

  it('rejects UPDATE query', async () => {
    const result = await handleExecuteQuery({ sql: 'UPDATE users SET x = 1' });
    expect(result.isError).toBe(true);
  });

  it('rejects TRUNCATE query', async () => {
    const result = await handleExecuteQuery({ sql: 'TRUNCATE users' });
    expect(result.isError).toBe(true);
  });
});

// ── Read-only transaction wrapping ────────────────────────────────────────────

describe('Read-only transaction wrapping', () => {
  let client: ReturnType<typeof makeMockClient>;

  beforeEach(() => {
    client = makeMockClient();
    (getPool as ReturnType<typeof vi.fn>).mockReturnValue(makeMockPool(client));
  });

  it('issues BEGIN before the user query', async () => {
    await handleExecuteQuery({ sql: 'SELECT 1' });

    const calls = client._queryCalls.map((c) => c.sql.toUpperCase());
    const beginIdx = calls.indexOf('BEGIN');
    expect(beginIdx).toBeGreaterThanOrEqual(0);

    // The user query must come after BEGIN
    const userQueryIdx = calls.findIndex((c) => c.includes('SELECT 1'));
    expect(userQueryIdx).toBeGreaterThan(beginIdx);
  });

  it('issues SET TRANSACTION READ ONLY before the user query', async () => {
    await handleExecuteQuery({ sql: 'SELECT 1' });

    const calls = client._queryCalls.map((c) => c.sql.toUpperCase());
    const readOnlyIdx = calls.findIndex((c) => c.includes('READ ONLY'));
    expect(readOnlyIdx).toBeGreaterThanOrEqual(0);

    const userQueryIdx = calls.findIndex((c) => c.includes('SELECT 1'));
    expect(userQueryIdx).toBeGreaterThan(readOnlyIdx);
  });

  it('issues COMMIT on success', async () => {
    await handleExecuteQuery({ sql: 'SELECT 1' });

    const calls = client._queryCalls.map((c) => c.sql.toUpperCase());
    expect(calls).toContain('COMMIT');
  });

  it('issues ROLLBACK and releases client when the query throws', async () => {
    const failingClient = makeMockClient(async (sql) => {
      if (sql.toUpperCase() === 'BEGIN') return { rows: [], rowCount: 0, fields: [] };
      if (sql.toUpperCase().includes('READ ONLY')) return { rows: [], rowCount: 0, fields: [] };
      // Simulate DB rejection of a write disguised as a SELECT
      throw new Error('ERROR: cannot execute pg_write_server_file() in a read-only transaction');
    });
    (getPool as ReturnType<typeof vi.fn>).mockReturnValue(makeMockPool(failingClient));

    await expect(
      handleExecuteQuery({ sql: "SELECT pg_write_server_file('/tmp/x', 'evil')" })
    ).rejects.toThrow(/read-only transaction/);

    const calls = failingClient._queryCalls.map((c) => c.sql.toUpperCase());
    expect(calls).toContain('ROLLBACK');
    expect(failingClient.release).toHaveBeenCalled();
  });

  it('always releases the client even on error', async () => {
    const failingClient = makeMockClient(async (sql) => {
      if (sql.toUpperCase() === 'BEGIN') throw new Error('connection lost');
    });
    (getPool as ReturnType<typeof vi.fn>).mockReturnValue(makeMockPool(failingClient));

    await expect(handleExecuteQuery({ sql: 'SELECT 1' })).rejects.toThrow();
    expect(failingClient.release).toHaveBeenCalled();
  });

  it('returns the query result rows on success', async () => {
    const rowClient = makeMockClient(async (sql) => {
      if (sql.includes('SELECT 42')) {
        return { rows: [{ val: 42 }], rowCount: 1, fields: [{ name: 'val', dataTypeID: 23 }] };
      }
      return { rows: [], rowCount: 0, fields: [] };
    });
    (getPool as ReturnType<typeof vi.fn>).mockReturnValue(makeMockPool(rowClient));

    const result = await handleExecuteQuery({ sql: 'SELECT 42 as val' });
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.rows).toEqual([{ val: 42 }]);
  });
});

// ── explain_query read-only transaction wrapping ──────────────────────────────
// EXPLAIN ANALYZE actually executes the query, so it must also run inside a
// read-only transaction that is rolled back, preventing write side-effects.

describe('explain_query — read-only transaction wrapping', () => {
  let client: ReturnType<typeof makeMockClient>;

  beforeEach(() => {
    client = makeMockClient(async (sql) => {
      // Return a minimal EXPLAIN result
      if (sql.toUpperCase().startsWith('EXPLAIN')) {
        return { rows: [{ 'QUERY PLAN': 'Seq Scan on users' }], rowCount: 1, fields: [] };
      }
      return { rows: [], rowCount: 0, fields: [] };
    });
    (getPool as ReturnType<typeof vi.fn>).mockReturnValue(makeMockPool(client));
  });

  it('rejects non-SELECT queries early without reaching the DB', async () => {
    const result = await handleExplainQuery({ sql: 'DELETE FROM users', verbose: false, format: 'text' });
    expect(result.isError).toBe(true);
    expect(client.query).not.toHaveBeenCalled();
  });

  it('issues BEGIN before the EXPLAIN query', async () => {
    await handleExplainQuery({ sql: 'SELECT 1', verbose: false, format: 'text' });
    const calls = client._queryCalls.map((c) => c.sql.toUpperCase());
    const beginIdx = calls.indexOf('BEGIN');
    expect(beginIdx).toBeGreaterThanOrEqual(0);
    const explainIdx = calls.findIndex((c) => c.startsWith('EXPLAIN'));
    expect(explainIdx).toBeGreaterThan(beginIdx);
  });

  it('issues SET TRANSACTION READ ONLY before the EXPLAIN query', async () => {
    await handleExplainQuery({ sql: 'SELECT 1', verbose: false, format: 'text' });
    const calls = client._queryCalls.map((c) => c.sql.toUpperCase());
    const readOnlyIdx = calls.findIndex((c) => c.includes('READ ONLY'));
    expect(readOnlyIdx).toBeGreaterThanOrEqual(0);
    const explainIdx = calls.findIndex((c) => c.startsWith('EXPLAIN'));
    expect(explainIdx).toBeGreaterThan(readOnlyIdx);
  });

  it('issues ROLLBACK (not COMMIT) after the EXPLAIN query', async () => {
    await handleExplainQuery({ sql: 'SELECT 1', verbose: false, format: 'text' });
    const calls = client._queryCalls.map((c) => c.sql.toUpperCase());
    expect(calls).toContain('ROLLBACK');
    expect(calls).not.toContain('COMMIT');
  });

  it('issues ROLLBACK and releases client when EXPLAIN throws', async () => {
    const failingClient = makeMockClient(async (sql) => {
      if (sql.toUpperCase() === 'BEGIN') return { rows: [], rowCount: 0, fields: [] };
      if (sql.toUpperCase().includes('READ ONLY')) return { rows: [], rowCount: 0, fields: [] };
      throw new Error('ERROR: cannot execute in read-only transaction');
    });
    (getPool as ReturnType<typeof vi.fn>).mockReturnValue(makeMockPool(failingClient));

    await expect(
      handleExplainQuery({ sql: 'SELECT 1', verbose: false, format: 'text' })
    ).rejects.toThrow();

    const calls = failingClient._queryCalls.map((c) => c.sql.toUpperCase());
    expect(calls).toContain('ROLLBACK');
    expect(failingClient.release).toHaveBeenCalled();
  });

  it('always releases the client even on error', async () => {
    const failingClient = makeMockClient(async (sql) => {
      if (sql.toUpperCase() === 'BEGIN') throw new Error('connection lost');
    });
    (getPool as ReturnType<typeof vi.fn>).mockReturnValue(makeMockPool(failingClient));

    await expect(
      handleExplainQuery({ sql: 'SELECT 1', verbose: false, format: 'text' })
    ).rejects.toThrow();
    expect(failingClient.release).toHaveBeenCalled();
  });
});
