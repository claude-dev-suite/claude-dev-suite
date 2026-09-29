// SPDX-License-Identifier: MIT
/**
 * Real PostgreSQL wire protocol, via PGlite (Postgres compiled to WASM)
 * served over TCP by pglite-socket — no Docker, no local install. The driver
 * talks to it exactly as it would to a server. Auto-skips if PGlite cannot
 * start on this runtime.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { resetRegistry } from '../src/config.js';
import { closeAll, setDriverFactory } from '../src/drivers/index.js';
import { callTool } from '../src/handlers/dispatch.js';
import { parse } from './helpers.js';

type Server = { start(): Promise<void>; stop(): Promise<void>; getServerConn(): string };
let pglite: { close(): Promise<void>; exec(sql: string): Promise<unknown> } | null = null;
let server: Server | null = null;
let url = '';

async function boot(): Promise<boolean> {
  try {
    const { PGlite } = await import('@electric-sql/pglite');
    const { PGLiteSocketServer } = await import('@electric-sql/pglite-socket');
    pglite = (await PGlite.create()) as never;
    server = new PGLiteSocketServer({ db: pglite as never, port: 0, host: '127.0.0.1', maxConnections: 8 }) as unknown as Server;
    await server.start();
    const port = Number(String(server.getServerConn()).split(':').pop());
    url = `postgres://postgres:secret%40pw@127.0.0.1:${port}/postgres`;
    return true;
  } catch (e) {
    console.warn('PGlite unavailable, skipping postgres integration tests:', (e as Error).message);
    return false;
  }
}

const available = await boot();
const run = available ? describe : describe.skip;

const FIXTURE = (schema: string, v2: boolean) => `
  CREATE SCHEMA ${schema};
  SET search_path = ${schema};
  CREATE TYPE order_status AS ENUM ('new', 'paid'${v2 ? ", 'shipped'" : ''});
  CREATE TABLE orgs (id integer NOT NULL, region text NOT NULL, name text, PRIMARY KEY (id, region));
  CREATE TABLE users (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email varchar(255) NOT NULL UNIQUE,
    tags text[],
    score numeric(10,0) DEFAULT 0,
    status order_status NOT NULL DEFAULT 'new',
    ${v2 ? 'phone text,' : ''}
    CONSTRAINT email_chk CHECK (email LIKE '%@%')
  );
  COMMENT ON TABLE users IS 'people';
  CREATE TABLE members (
    user_id bigint REFERENCES users(id),
    org_id integer, org_region text,
    role text${v2 ? ' NOT NULL DEFAULT \'member\'' : ''},
    CONSTRAINT members_org_fk FOREIGN KEY (org_id, org_region) REFERENCES orgs(id, region) ON DELETE CASCADE
  );
  CREATE INDEX members_role_idx ON members (role) WHERE role IS NOT NULL;
  CREATE INDEX members_role_dup ON members (role) WHERE role IS NOT NULL;
  ${v2 ? 'CREATE TABLE audit (id serial PRIMARY KEY, at timestamptz NOT NULL DEFAULT now()); CREATE INDEX audit_at_idx ON audit (at);' : ''}
  CREATE VIEW active_users AS SELECT id, email FROM users WHERE status = 'paid';
  CREATE MATERIALIZED VIEW user_counts AS SELECT status, count(*) AS n FROM users GROUP BY status;
  CREATE FUNCTION touch() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$;
  CREATE TRIGGER users_touch BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION touch();
  INSERT INTO users (email, tags) SELECT 'u' || g || '@x.io', ARRAY['a'] FROM generate_series(1, 30) g;
  RESET search_path;
`;

run('postgres integration (PGlite)', () => {
  beforeAll(async () => {
    await pglite!.exec(FIXTURE('app', false));
    await pglite!.exec(FIXTURE('desired', true));
    await pglite!.exec(FIXTURE('orig', false));
  }, 60_000);
  afterAll(async () => {
    await closeAll();
    await server?.stop();
    await pglite?.close();
  });
  afterEach(async () => {
    await closeAll();
    for (const k of ['DATABASE_URL', 'DATABASE_URLS', 'DATABASE_ALLOW_WRITES', 'DB_STATEMENT_TIMEOUT_MS']) delete process.env[k];
    resetRegistry();
    setDriverFactory(null);
  });
  const useEnv = (env: Record<string, string>) => {
    Object.assign(process.env, env);
    resetRegistry();
    setDriverFactory(null);
  };

  it('old defect (found in review): "SELECT 1; COMMIT; <DDL>" can no longer escape the read-only transaction', async () => {
    useEnv({ DATABASE_URL: url });
    const r = await callTool('execute_query', { sql: 'SELECT 1; COMMIT; CREATE TABLE app.pwned (x int); SELECT 1' });
    expect(r.isError).toBe(true);
    // even if the lexer were bypassed, the extended protocol refuses multi-command strings
    const check = parse(await callTool('execute_query', { sql: "SELECT to_regclass('app.pwned') IS NOT NULL AS created" }));
    expect(check.rows[0].created).toBe(false);
  });

  it('writes are refused by the engine; WITH / VALUES / TABLE / trailing ; work', async () => {
    useEnv({ DATABASE_URL: url });
    const w = await callTool('execute_query', { sql: 'WITH d AS (DELETE FROM app.users RETURNING 1) SELECT count(*) FROM d' });
    expect(parse(w).error).toMatch(/read-only transaction/);
    for (const sql of ['WITH x AS (SELECT 1 AS a) SELECT * FROM x;', 'VALUES (1), (2)', 'TABLE app.orgs', '/* c */ SELECT 1']) {
      const r = await callTool('execute_query', { sql });
      expect(r.isError, sql).toBeFalsy();
    }
    const p = parse(await callTool('execute_query', { sql: 'SELECT id FROM app.users ORDER BY id LIMIT 25', limit: 10, offset: 20, includeTotalCount: true }));
    expect(p.capStrategy).toBe('wrapped');
    expect(p.rows.map((x: { id: string }) => Number(x.id))).toEqual([21, 22, 23, 24, 25]);
    expect(p.hasMore).toBe(false);
    expect(p.totalCount).toBe(25);
  });

  it('describe_table: real types, identity, composite FK, check, unique, partial index', async () => {
    useEnv({ DATABASE_URL: url });
    const u = parse(await callTool('describe_table', { table: 'users', schema: 'app' }));
    const col = (n: string) => u.columns.find((c: { name: string }) => c.name === n);
    expect(col('id')).toMatchObject({ type: 'bigint', identity: 'ALWAYS', nullable: false });
    expect(col('tags').type).toBe('text[]');
    expect(col('score').type).toBe('numeric(10,0)');
    expect(col('status').type).toMatch(/order_status$/);
    expect(u.comment).toBe('people');
    expect(u.checkConstraints[0].expression).toMatch(/CHECK/);
    expect(u.uniqueConstraints[0].columns).toEqual(['email']);
    expect(u.triggers[0].name).toBe('users_touch');
    const m = parse(await callTool('describe_table', { table: 'members', schema: 'app' }));
    const fk = m.foreignKeys.find((f: { name: string }) => f.name === 'members_org_fk');
    expect(fk).toMatchObject({ columns: ['org_id', 'org_region'], refColumns: ['id', 'region'], onDelete: 'CASCADE' });
    expect(m.foreignKeys).toHaveLength(2); // no cross product
    expect(m.indexes.find((i: { name: string }) => i.name === 'members_role_idx').predicate).toMatch(/role IS NOT NULL/);
  });

  it('lists schemas, objects and search hits', async () => {
    useEnv({ DATABASE_URL: url });
    const s = parse(await callTool('list_schemas', {}));
    expect(s.schemas.map((x: { schema: string }) => x.schema)).toEqual(expect.arrayContaining(['app', 'desired', 'public']));
    const t = parse(await callTool('list_tables', { schema: 'app' }));
    expect(t.tables.map((x: { name: string; kind: string }) => `${x.name}:${x.kind}`)).toEqual(
      expect.arrayContaining(['users:table', 'active_users:view', 'user_counts:materialized_view'])
    );
    // old defect: list_tables duplicated rows when the same table name existed in several schemas
    expect(t.tables.filter((x: { name: string }) => x.name === 'users')).toHaveLength(1);
    const e = parse(await callTool('list_objects', { kind: 'enum', schema: 'desired' }));
    expect(e.objects[0].values).toEqual(['new', 'paid', 'shipped']);
    const f = parse(await callTool('list_objects', { kind: 'function', schema: 'app' }));
    expect(f.objects.map((x: { name: string }) => x.name)).toContain('touch');
    const hits = parse(await callTool('search_objects', { pattern: 'region', schema: 'app' }));
    expect(hits.results.some((h: { kind: string; table?: string }) => h.kind === 'column' && h.table === 'orgs')).toBe(true);
    const prev = parse(await callTool('preview_table', { table: 'users', schema: 'app', columns: ['email'], orderBy: 'id', limit: 2 }));
    expect(prev.rows).toEqual([{ email: 'u1@x.io' }, { email: 'u2@x.io' }]);
  });

  it('explain: plan without executing by default, ANALYZE on request', async () => {
    useEnv({ DATABASE_URL: url });
    const e = parse(await callTool('explain_query', { sql: 'SELECT * FROM app.users WHERE email = $1', params: ['u1@x.io'] }));
    expect(e.analyzed).toBe(false);
    expect(e.summary.executionTimeMs).toBeNull();
    const a = parse(await callTool('explain_query', { sql: 'SELECT count(*) FROM app.users', analyze: true }));
    expect(a.summary.executionTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('diagnostics degrade explicitly instead of returning empty success', async () => {
    useEnv({ DATABASE_URL: url });
    const slow = parse(await callTool('find_slow_queries', {}));
    expect(slow.statements.status).toBe('unavailable');
    const h = parse(await callTool('health_check', {}));
    expect(h.checks.length).toBeGreaterThanOrEqual(8);
    for (const c of h.checks) expect(['ok', 'warn', 'critical', 'unavailable']).toContain(c.status);
    const ir = parse(await callTool('index_recommendations', { schema: 'app' }));
    expect(ir.duplicateIndexes.map((d: { drop: string; keep: string }) => [d.keep, d.drop].sort())).toEqual([['members_role_dup', 'members_role_idx']]);
    expect(ir.unindexedForeignKeys.map((f: { foreignKey: string }) => f.foreignKey).sort()).toEqual(['members_org_fk', 'members_user_id_fkey']);
  });

  it('compare + generate_migration + execute_write round-trip converges (up), and down restores', async () => {
    useEnv({ DATABASE_URL: url, DATABASE_ALLOW_WRITES: 'true' });
    const before = parse(await callTool('compare_schemas', { schema: 'app', targetSchema: 'desired' }));
    expect(before.identical).toBe(false);
    expect(before.differences.enums.changed[0].valuesOnlyInTarget).toEqual(['shipped']);

    const mig = parse(await callTool('generate_migration', { schema: 'app', targetSchema: 'desired', includeDrops: true }));
    expect(mig.up).not.toMatch(/USER-DEFINED|ARRAY/);

    const dry = parse(await callTool('execute_write', { sql: mig.up }));
    expect(dry.dryRun).toBe(true);
    expect(dry.wouldFail).toBeUndefined();
    expect(parse(await callTool('compare_schemas', { schema: 'app', targetSchema: 'desired' })).identical).toBe(false);

    const applied = parse(await callTool('execute_write', { sql: mig.up, confirm: true }));
    expect(applied.committed).toBe(true);
    const after = parse(await callTool('compare_schemas', { schema: 'app', targetSchema: 'desired' }));
    expect(after.differences.tablesChanged).toEqual([]);
    expect(after.differences.tablesOnlyInTarget).toEqual([]);

    const down = mig.down.split('\n').filter((l: string) => !/ALTER TYPE/.test(l)).join('\n');
    const reverted = parse(await callTool('execute_write', { sql: down, confirm: true }));
    expect(reverted.committed).toBe(true);
    const back = parse(await callTool('compare_schemas', { schema: 'app', targetSchema: 'orig' }));
    // enum values cannot be removed in place — that is the only expected residue
    expect(back.differences.tablesChanged).toEqual([]);
    expect(back.differences.tablesOnlyInSource).toEqual([]);
    expect(back.differences.enums.changed.map((c: { name: string }) => c.name)).toEqual(['order_status']);
  }, 60_000);

  it('never leaks the password in errors', async () => {
    useEnv({ DATABASE_URL: url });
    const r = await callTool('execute_query', { sql: 'SELECT * FROM does_not_exist' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).not.toMatch(/secret@pw|secret%40pw/);
    const lc = parse(await callTool('list_connections', {}));
    expect(JSON.stringify(lc)).not.toMatch(/secret/);
  });
});
