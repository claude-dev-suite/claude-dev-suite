// SPDX-License-Identifier: MIT
/** websocket, sse_listen, graphql_request and load_test against local servers. */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { WebSocketServer } from 'ws';
import type { AddressInfo } from 'net';
import { handleWebSocket, handleSse, handleGraphql, handleLoadTest } from '../src/handlers/api-tester-handlers.js';
import { startServer, json, parseResult, type TestServer } from './helpers.js';
import { closeAllWebSockets } from '../src/realtime/websocket.js';

let wss: WebSocketServer;
let wsUrl: string;
let http: TestServer;

const T = (kind: string, name: string | null, ofType: unknown = null) => ({ kind, name, ofType });
const introspection = {
  __schema: {
    queryType: { name: 'Query' },
    mutationType: { name: 'Mutation' },
    subscriptionType: null,
    directives: [],
    types: [
      {
        kind: 'OBJECT',
        name: 'Query',
        fields: [
          { name: 'user', args: [{ name: 'id', type: T('NON_NULL', null, T('SCALAR', 'ID')), defaultValue: null }], type: T('OBJECT', 'User'), isDeprecated: false },
          { name: 'users', args: [], type: T('NON_NULL', null, T('LIST', null, T('NON_NULL', null, T('OBJECT', 'User')))), isDeprecated: false },
        ],
        interfaces: [],
      },
      {
        kind: 'OBJECT',
        name: 'Mutation',
        fields: [{ name: 'createUser', args: [{ name: 'input', type: T('NON_NULL', null, T('INPUT_OBJECT', 'NewUser')) }], type: T('OBJECT', 'User') }],
        interfaces: [],
      },
      { kind: 'OBJECT', name: 'User', description: 'A user', fields: [{ name: 'id', args: [], type: T('NON_NULL', null, T('SCALAR', 'ID')) }, { name: 'role', args: [], type: T('ENUM', 'Role') }], interfaces: [] },
      { kind: 'INPUT_OBJECT', name: 'NewUser', inputFields: [{ name: 'name', type: T('NON_NULL', null, T('SCALAR', 'String')), defaultValue: null }] },
      { kind: 'ENUM', name: 'Role', enumValues: [{ name: 'ADMIN' }, { name: 'USER' }] },
      { kind: 'SCALAR', name: 'ID' },
      { kind: 'SCALAR', name: 'String' },
      { kind: 'OBJECT', name: '__Schema', fields: [] },
    ],
  },
};

beforeAll(async () => {
  wss = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await new Promise<void>((r) => wss.once('listening', () => r()));
  wsUrl = `ws://127.0.0.1:${(wss.address() as AddressInfo).port}`;
  wss.on('connection', (socket, req) => {
    socket.send(JSON.stringify({ hello: true, auth: req.headers.authorization ?? null }));
    socket.on('message', (data) => {
      const text = data.toString();
      if (text === 'close-me') return socket.close(4001, 'asked');
      socket.send(`echo:${text}`);
      socket.send(`echo2:${text}`);
    });
  });

  http = await startServer((req, res, body) => {
    const url = new URL(req.url!, 'http://x');
    if (url.pathname === '/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      let n = 0;
      const t = setInterval(() => {
        n++;
        res.write(`event: tick\nid: ${n}\ndata: {"n":${n}}\n\n`);
        if (n === 3) res.write(`: comment\ndata: last\n\n`);
      }, 20);
      res.on('close', () => clearInterval(t));
      return;
    }
    if (url.pathname === '/not-sse') return json(res, 200, { nope: true });
    if (url.pathname === '/graphql') {
      const { query, variables } = JSON.parse(body.toString());
      if (String(query).includes('__schema')) return json(res, 200, { data: introspection });
      if (String(query).includes('boom')) return json(res, 200, { data: null, errors: [{ message: 'boom failed' }] });
      return json(res, 200, { data: { user: { id: variables?.id ?? null, role: 'ADMIN' } } });
    }
    if (url.pathname === '/fast') return json(res, 200, { ok: true });
    if (url.pathname === '/flaky') return json(res, Math.random() < 0.5 ? 200 : 500, {});
    return json(res, 404, {});
  });
});

afterAll(async () => {
  await closeAllWebSockets();
  for (const client of wss.clients) client.terminate();
  await new Promise<void>((r) => wss.close(() => r()));
  await http.close();
});

describe('websocket', () => {
  it('connect → send → receive → close with auth and buffering', async () => {
    const c = parseResult(
      await handleWebSocket({ action: 'connect', url: wsUrl, auth: { type: 'bearer', token: 'ws-token-secret' }, waitMs: 300, untilCount: 1, environment: 'none' })
    );
    expect(c.id).toBeTruthy();
    expect(c.messages[0].json).toEqual({ hello: true, auth: 'Bearer ***' });

    const s = parseResult(await handleWebSocket({ action: 'send', id: c.id, message: 'ping', waitMs: 1000, untilCount: 2 }));
    expect(s.messages.filter((m: { direction: string }) => m.direction === 'in').map((m: { data: string }) => m.data)).toEqual(['echo:ping', 'echo2:ping']);

    const list = parseResult(await handleWebSocket({ action: 'list' }));
    expect(list.connections.map((x: { id: string }) => x.id)).toContain(c.id);

    const closed = parseResult(await handleWebSocket({ action: 'close', id: c.id }));
    expect(closed.closed.code).toBe(1000);
    await expect(handleWebSocket({ action: 'receive', id: c.id })).rejects.toThrow(/No WebSocket connection/);
  });

  it('one-shot exchange sends JSON and collects replies', async () => {
    const r = parseResult(await handleWebSocket({ action: 'exchange', url: wsUrl, messages: [{ op: 'sub' }], untilCount: 3, waitMs: 2000, environment: 'none' }));
    const inbound = r.messages.filter((m: { direction: string }) => m.direction === 'in').map((m: { data: string }) => m.data);
    expect(inbound.slice(1)).toEqual(['echo:{"op":"sub"}', 'echo2:{"op":"sub"}']);
  });

  it('reports server-initiated close', async () => {
    const c = parseResult(await handleWebSocket({ action: 'connect', url: wsUrl, environment: 'none' }));
    const r = parseResult(await handleWebSocket({ action: 'send', id: c.id, message: 'close-me', waitMs: 1000 }));
    expect(r.closed).toMatchObject({ code: 4001, reason: 'asked' });
    await handleWebSocket({ action: 'close', id: c.id });
  });

  it('blocks the metadata address', async () => {
    await expect(handleWebSocket({ action: 'connect', url: 'ws://169.254.169.254/', environment: 'none' })).rejects.toThrow(/metadata/);
  });
});

describe('sse_listen', () => {
  it('collects parsed events up to maxEvents', async () => {
    const r = parseResult(await handleSse({ url: `${http.url}/events`, maxEvents: 4, durationMs: 5000, environment: 'none' }));
    expect(r.endedBy).toBe('maxEvents');
    expect(r.events.map((e: { event: string; data: string }) => [e.event, e.data])).toEqual([
      ['tick', '{"n":1}'],
      ['tick', '{"n":2}'],
      ['tick', '{"n":3}'],
      ['message', 'last'],
    ]);
    expect(r.events[0].json).toEqual({ n: 1 });
    expect(r.lastEventId).toBe('3');
  });

  it('stops after the duration', async () => {
    const r = parseResult(await handleSse({ url: `${http.url}/events`, durationMs: 150, maxEvents: 1000, events: ['tick'], environment: 'none' }));
    expect(r.endedBy).toBe('duration');
    expect(r.events.every((e: { event: string }) => e.event === 'tick')).toBe(true);
  });

  it('explains a non-stream response', async () => {
    const res = await handleSse({ url: `${http.url}/not-sse`, environment: 'none' });
    expect(res.isError).toBe(true);
    expect(parseResult(res).error).toMatch(/not text\/event-stream/);
  });
});

describe('graphql_request', () => {
  it('runs a query with variables', async () => {
    const r = parseResult(await handleGraphql({ url: `${http.url}/graphql`, query: 'query($id: ID!){ user(id: $id) { id role } }', variables: { id: '42' }, environment: 'none' }));
    expect(r).toMatchObject({ status: 200, hasErrors: false, data: { user: { id: '42', role: 'ADMIN' } } });
  });

  it('surfaces GraphQL errors', async () => {
    const r = parseResult(await handleGraphql({ url: `${http.url}/graphql`, query: '{ boom }', environment: 'none' }));
    expect(r.hasErrors).toBe(true);
    expect(r.errors[0].message).toBe('boom failed');
  });

  it('refuses to present a non-GraphQL response as an empty result', async () => {
    const res = await handleGraphql({ url: `${http.url}/fast`, query: '{ x }', environment: 'none' });
    expect(res.isError).toBe(true);
    expect(parseResult(res).error).toMatch(/Not a GraphQL response/);
  });

  it('summarises the schema via introspection', async () => {
    const r = parseResult(await handleGraphql({ url: `${http.url}/graphql`, action: 'introspect', environment: 'none' }));
    expect(r.queries.fields).toEqual(['user(id: ID!): User', 'users: [User!]!']);
    expect(r.mutations.fields).toEqual(['createUser(input: NewUser!): User']);
    expect(r.types).toEqual(['User (object)', 'NewUser (input_object)', 'Role (enum)']);
  });

  it('describes one type and renders SDL', async () => {
    const t = parseResult(await handleGraphql({ url: `${http.url}/graphql`, action: 'introspect', typeName: 'Role', environment: 'none' }));
    expect(t.enumValues).toEqual(['ADMIN', 'USER']);
    const sdl = parseResult(await handleGraphql({ url: `${http.url}/graphql`, action: 'sdl', environment: 'none' }));
    expect(sdl.sdl).toContain('type Query {\n  user(id: ID!): User\n  users: [User!]!\n}');
    expect(sdl.sdl).toContain('"A user"\ntype User');
    expect(sdl.sdl).toContain('input NewUser {\n  name: String!\n}');
  });
});

describe('load_test', () => {
  it('runs a bounded concurrency test with percentiles', async () => {
    const r = parseResult(await handleLoadTest({ method: 'GET', url: `${http.url}/fast`, concurrency: 4, durationSec: 1, maxRequests: 200, environment: 'none' }));
    expect(r.summary.requests).toBe(200);
    expect(r.summary.stoppedBy).toBe('maxRequests');
    expect(r.summary.errorRate).toBe('0.00%');
    expect(r.latencyMs.p50).toBeLessThanOrEqual(r.latencyMs.p99);
    expect(r.statusCodes).toEqual({ '200': 200 });
  });

  it('paces an RPS test and counts unexpected statuses as errors', async () => {
    const r = parseResult(await handleLoadTest({ method: 'GET', url: `${http.url}/flaky`, mode: 'rps', rps: 50, durationSec: 1, environment: 'none' }));
    expect(r.summary.requests).toBeGreaterThanOrEqual(40);
    expect(r.summary.requests).toBeLessThanOrEqual(55);
    expect(r.summary.unexpectedStatus).toBeGreaterThan(0);
  });

  it('refuses limits beyond the caps', async () => {
    await expect(handleLoadTest({ method: 'GET', url: `${http.url}/fast`, durationSec: 600 })).rejects.toThrow();
  });
});
