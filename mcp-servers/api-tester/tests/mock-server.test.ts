// SPDX-License-Identifier: MIT
/**
 * mock_server: binding, port conflicts (old: unbounded retry), request
 * validation, response selection, logs — and an end-to-end loop:
 * generate_tests(scenario) → run_scenario against the mock.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { createServer } from 'net';
import { handleMockServer, handleGenerateTests, handleRunScenario, handleValidateContract } from '../src/handlers/api-tester-handlers.js';
import { stopAllMockServers } from '../src/mock/server.js';
import { fixture, parseResult } from './helpers.js';

const mock = async (args: Record<string, unknown>) => parseResult(await handleMockServer(args));

afterEach(async () => {
  await stopAllMockServers();
});

async function busyPort(): Promise<{ port: number; close: () => Promise<void> }> {
  const s = createServer();
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', () => r()));
  const port = (s.address() as { port: number }).port;
  return { port, close: () => new Promise((r) => s.close(() => r())) };
}

describe('lifecycle', () => {
  it('binds 127.0.0.1 by default and lists the server', async () => {
    const r = await mock({ action: 'start', specPath: fixture('sample-openapi.yaml'), port: 0 });
    expect(r.host).toBe('127.0.0.1');
    expect(r.url).toBe(`http://127.0.0.1:${r.port}`);
    const list = await mock({ action: 'list' });
    expect(list.servers.map((s: { port: number }) => s.port)).toContain(r.port);
    const stopped = await mock({ action: 'stop', port: r.port });
    expect(stopped.success).toBe(true);
  });

  it('fails clearly when an explicit port is taken', async () => {
    const busy = await busyPort();
    try {
      await expect(handleMockServer({ action: 'start', specPath: fixture('sample-openapi.yaml'), port: busy.port })).rejects.toThrow(
        /already in use.*portFallback/
      );
    } finally {
      await busy.close();
    }
  });

  it('moves to the next free port with portFallback', async () => {
    const busy = await busyPort();
    try {
      const r = await mock({ action: 'start', specPath: fixture('sample-openapi.yaml'), port: busy.port, portFallback: true });
      expect(r.port).not.toBe(busy.port);
      expect(r.note).toMatch(/was busy/);
    } finally {
      await busy.close();
    }
  });
});

describe('request validation and responses', () => {
  it('serves examples, validates input, honours Prefer and logs', async () => {
    const { url, port } = await mock({ action: 'start', specPath: fixture('sample-openapi.yaml'), port: 0 });
    const base = `${url}/v1`; // server base path from the spec is accepted

    const list = await fetch(`${base}/todos?limit=5`);
    expect(list.status).toBe(200);
    expect(await list.json()).toEqual([
      { id: 1, title: 'Buy groceries', completed: false },
      { id: 2, title: 'Walk the dog', completed: true },
    ]);

    const missing = await fetch(`${url}/todos`);
    expect(missing.status).toBe(400);
    expect((await missing.json()).details).toContain('Missing required query parameter "limit"');

    const badType = await fetch(`${url}/todos/abc`);
    expect(badType.status).toBe(400);

    const badBody = await fetch(`${url}/todos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description: 'x' }) });
    expect(badBody.status).toBe(400);
    expect(JSON.stringify(await badBody.json())).toMatch(/title/);

    const wrongCt = await fetch(`${url}/todos`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'x' });
    expect(wrongCt.status).toBe(415);

    const created = await fetch(`${url}/todos`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'ok' }) });
    expect(created.status).toBe(201);

    const preferred = await fetch(`${url}/todos/1`, { headers: { Prefer: 'code=404' } });
    expect(preferred.status).toBe(404);
    const undocumented = await fetch(`${url}/todos/1?__code=418`);
    expect(undocumented.status).toBe(400);

    expect((await fetch(`${url}/nothing`)).status).toBe(404);
    expect((await fetch(`${url}/todos/1`, { method: 'PATCH' })).status).toBe(405);

    const logs = await mock({ action: 'logs', port, limit: 3 });
    expect(logs.entries).toHaveLength(3);
    expect(logs.total).toBeGreaterThan(3);
    expect(logs.truncated).toBe(true);
  });

  it('mocks Swagger 2 with allOf, recursion and security (401 without credentials)', async () => {
    const { url } = await mock({ action: 'start', specPath: fixture('swagger2-petstore.json'), port: 0 });
    const tree = await fetch(`${url}/api/categories`);
    expect(tree.status).toBe(200);
    expect((await tree.json()).name).toBe('string');

    const pet = await fetch(`${url}/api/pets/7`);
    expect(await pet.json()).toEqual({ id: 7, name: 'Rex', tag: 'dog' });

    const noKey = await fetch(`${url}/api/pets`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"name":"a"}' });
    expect(noKey.status).toBe(401);
    const withKey = await fetch(`${url}/api/pets`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-API-Key': 'k' }, body: '{"name":"a"}' });
    expect(withKey.status).toBe(201);
    const body = await withKey.json();
    expect(body).toHaveProperty('id');
    expect(body).toHaveProperty('name');
  });

  it('applies latency', async () => {
    const { url } = await mock({ action: 'start', specPath: fixture('sample-openapi.yaml'), port: 0, delay: 150 });
    const t0 = Date.now();
    await fetch(`${url}/todos?limit=1`);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(140);
  });
});

describe('end to end: generated scenario and contract validation against the mock', () => {
  it('every generated positive and negative test passes against a validating mock', async () => {
    const { url } = await mock({ action: 'start', specPath: fixture('swagger2-petstore.json'), port: 0 });
    const gen = parseResult(await handleGenerateTests({ specPath: fixture('swagger2-petstore.json'), outputFormat: 'scenario', baseUrl: `${url}/api` }));
    const report = parseResult(
      await handleRunScenario({ scenario: gen.scenario, variables: { apiKey: 'k', username: 'u', password: 'p' }, environment: 'none' })
    );
    const failed = report.steps.filter((s: { status: string }) => s.status !== 'passed');
    expect(failed).toEqual([]);
    expect(report.passed).toBe(true);
  });

  it('validate_contract reports full conformance for the mock and skips writes by default', async () => {
    const { url } = await mock({ action: 'start', specPath: fixture('oas31-shop.yaml'), port: 0 });
    const r = parseResult(await handleValidateContract({ specPath: fixture('oas31-shop.yaml'), baseUrl: `${url}/v2`, environment: 'none' }));
    expect(r.summary).toMatchObject({ operations: 3, conforming: 2, skipped: 1, violating: 0 });
    expect(r.results.find((x: { operation: string }) => x.operation === 'createOrder').reason).toMatch(/includeWriteMethods/);
  });

  it('validate_contract dryRun previews write requests without sending them', async () => {
    const r = parseResult(
      await handleValidateContract({ specPath: fixture('oas31-shop.yaml'), baseUrl: 'http://127.0.0.1:9', includeWriteMethods: true, dryRun: true, environment: 'none' })
    );
    const create = r.operations.find((o: { operation: string }) => o.operation === 'createOrder');
    expect(create.wouldSend.method).toBe('POST');
    expect(create.wouldSend.body).toMatchObject({ items: [{ qty: 1 }] });
  });
});
